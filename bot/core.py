"""Task board rules. This module has no Discord dependency."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PLAN_PATH = ROOT / "config" / "tasks.json"
TEAM_PATH = ROOT / "config" / "team.json"
STATE_PATH = ROOT / "data" / "state.json"


def read_json(path: Path) -> dict:
    if path == TEAM_PATH and not path.exists():
        path = ROOT / "config" / "team.example.json"
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class BoardError(ValueError):
    pass


class Board:
    def __init__(self, plan_path: Path = PLAN_PATH, team_path: Path = TEAM_PATH, state_path: Path = STATE_PATH):
        self.plan_path, self.team_path, self.state_path = plan_path, team_path, state_path
        self.plan = read_json(plan_path)
        self.team = read_json(team_path)
        self.tasks = {task["id"]: task for task in self.plan["tasks"]}
        if len(self.tasks) != len(self.plan["tasks"]):
            raise BoardError("Duplicate task ID in plan")
        for task in self.tasks.values():
            for dependency in task["depends_on"]:
                if dependency not in self.tasks or dependency == task["id"]:
                    raise BoardError(f"Invalid dependency in {task['id']}: {dependency}")
        self.state = read_json(state_path) if state_path.exists() else {"tasks": {}, "availability": {}, "history": []}
        self.state.setdefault("tasks", {})
        self.state.setdefault("availability", {})
        self.state.setdefault("history", [])
        for task_id in self.tasks:
            self.state["tasks"].setdefault(task_id, {"status": "ready", "runner": None, "submission": None, "selfcheck": None})
        self.save()

    def save(self) -> None:
        write_json(self.state_path, self.state)

    def member(self, key: str) -> dict:
        result = next((member for member in self.team["members"] if member["key"] == key), None)
        if not result:
            raise BoardError(f"Unknown member: {key}")
        return result

    def member_by_discord_id(self, discord_id: int) -> dict | None:
        return next((member for member in self.team["members"] if member["discord_id"] == str(discord_id)), None)

    def configure_members(self, backend_id: int, frontend_id: int) -> None:
        if backend_id == frontend_id or backend_id <= 0 or frontend_id <= 0:
            raise BoardError("Choose two different Discord members")
        self.member("backend")["discord_id"] = str(backend_id)
        self.member("frontend")["discord_id"] = str(frontend_id)
        write_json(self.team_path, self.team)

    def configure_channels(self, backend_id: int, frontend_id: int) -> None:
        if backend_id == frontend_id or backend_id <= 0 or frontend_id <= 0:
            raise BoardError("Choose two different Discord text channels")
        self.member("backend")["channel_id"] = str(backend_id)
        self.member("frontend")["channel_id"] = str(frontend_id)
        write_json(self.team_path, self.team)

    def channel_id(self, track: str) -> int | None:
        value = self.member(track).get("channel_id", "")
        return int(value) if value else None

    def task(self, task_id: str) -> dict:
        task_id = task_id.upper().strip()
        if task_id not in self.tasks:
            raise BoardError(f"Unknown task: {task_id}")
        return self.tasks[task_id]

    def record(self, task_id: str) -> dict:
        return self.state["tasks"][self.task(task_id)["id"]]

    def ready(self, task_id: str) -> bool:
        task = self.task(task_id)
        record = self.record(task_id)
        return record["status"] == "ready" and all(self.record(dep)["status"] == "done" for dep in task["depends_on"])

    def available(self, member_key: str) -> bool:
        self.member(member_key)
        return self.state["availability"].get(member_key, True)

    def set_availability(self, member_key: str, available: bool) -> None:
        self.member(member_key)
        self.state["availability"][member_key] = available
        self._event("availability", "", member_key, "available" if available else "busy")

    def suggestions(self, member_key: str) -> list[dict]:
        member = self.member(member_key)
        if not self.available(member_key):
            return []
        ready = [task for task in self.tasks.values() if self.ready(task["id"])]
        def rank(task: dict) -> tuple[int, int, str]:
            own = task["track"] == member["track"]
            owner_available = self.available(task["track"])
            return (0 if own else 1 if not owner_available else 2, task["phase"], task["id"])
        return sorted(ready, key=rank)

    def claim(self, task_id: str, member_key: str) -> dict:
        task = self.task(task_id)
        self.member(member_key)
        if not self.available(member_key):
            raise BoardError("Mark yourself available before claiming a task")
        if not self.ready(task_id):
            unmet = [dep for dep in task["depends_on"] if self.record(dep)["status"] != "done"]
            raise BoardError("Task is unavailable" + (f"; complete {', '.join(unmet)} first" if unmet else ""))
        record = self.record(task_id)
        record.update({"status": "in_progress", "runner": member_key, "submission": None, "selfcheck": None})
        self._event("claim", task["id"], member_key, "takeover" if member_key != task["track"] else "owner")
        return task

    def submit(self, task_id: str, member_key: str, artifact: str, tests: str) -> None:
        record = self._runner_task(task_id, member_key, "in_progress")
        if not artifact.strip() or not tests.strip():
            raise BoardError("Provide the changed files or PR link and the test result")
        record["submission"] = {"artifact": artifact.strip(), "tests": tests.strip(), "at": now()}
        record["status"] = "self_review"
        self._event("submit", task_id.upper(), member_key, artifact.strip())

    def selfcheck(self, task_id: str, member_key: str, review_note: str) -> str:
        record = self._runner_task(task_id, member_key, "self_review")
        if len(review_note.strip()) < 10:
            raise BoardError("Describe what you checked in at least 10 characters")
        record["selfcheck"] = {"note": review_note.strip(), "at": now()}
        owner = self.task(task_id)["track"]
        record["status"] = "done" if owner == member_key else "owner_review"
        self._event("selfcheck", task_id.upper(), member_key, review_note.strip())
        return record["status"]

    def owner_approve(self, task_id: str, member_key: str) -> None:
        task = self.task(task_id)
        if member_key != task["track"]:
            raise BoardError("Only the original pipeline owner can approve a takeover")
        record = self.record(task_id)
        if record["status"] != "owner_review" or not record["selfcheck"]:
            raise BoardError("Runner self-review is required first")
        record["status"] = "done"
        self._event("owner_approve", task["id"], member_key, "")

    def request_changes(self, task_id: str, member_key: str, note: str) -> None:
        task = self.task(task_id)
        if member_key != task["track"]:
            raise BoardError("Only the pipeline owner can request changes")
        record = self.record(task_id)
        if record["status"] != "owner_review" or not note.strip():
            raise BoardError("Task must be in owner review and include a reason")
        record["status"] = "in_progress"
        record["selfcheck"] = None
        self._event("request_changes", task["id"], member_key, note.strip())

    def _runner_task(self, task_id: str, member_key: str, expected_status: str) -> dict:
        record = self.record(task_id)
        if record["runner"] != member_key or record["status"] != expected_status:
            raise BoardError(f"Only the runner can act while status is {expected_status}")
        return record

    def _event(self, action: str, task_id: str, member_key: str, note: str) -> None:
        self.state["history"].append({"at": now(), "action": action, "task": task_id, "member": member_key, "note": note})
        self.save()

    def summary(self) -> str:
        result = []
        for phase in self.plan["phases"]:
            parts = []
            for track in ("backend", "frontend"):
                tasks = [task for task in self.plan["tasks"] if task["phase"] == phase["id"] and task["track"] == track]
                done = sum(self.record(task["id"])["status"] == "done" for task in tasks)
                parts.append(f"{track} {done}/{len(tasks)}")
            result.append(f"Phase {phase['id']} · {phase['name']}: {' | '.join(parts)}")
        active = [f"{task['id']} {task['title']} ({self.record(task['id'])['runner']})" for task in self.plan["tasks"] if self.record(task["id"])["status"] in {"in_progress", "self_review", "owner_review"}]
        return "\n".join(result) + ("\n\nกำลังทำ/รอตรวจ:\n" + "\n".join(active) if active else "")


def task_prompt(task: dict) -> str:
    return "\n".join([
        f"# SENTINEL AI task {task['id']}: {task['title']}",
        f"Pipeline: {task['track']} | Phase: {task['phase']}",
        f"Dependencies: {', '.join(task['depends_on']) or 'none'}",
        f"Deliverable: {task['deliverable']}",
        f"Acceptance: {task['acceptance']}",
        "",
        task["prompt"],
        "",
        "ทำงานในโฟลเดอร์โปรเจกต์ที่รัน CLI เท่านั้น ตรวจไฟล์ที่มีอยู่ก่อนแก้ไข รักษา API contract ของทีม",
        "เมื่อเสร็จ สรุปไฟล์ที่แก้ วิธีทดสอบ ผลทดสอบ และข้อจำกัดที่เหลือ",
        "AI ต้องไม่รายงานว่างานเสร็จแทนมนุษย์ ผู้สั่ง AI ต้องอ่าน diff และทดสอบเองก่อนใช้ /selfcheck",
    ])
