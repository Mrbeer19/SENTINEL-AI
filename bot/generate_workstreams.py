"""Generate human-readable per-person phase folders from config/tasks.json."""

from pathlib import Path

from core import PLAN_PATH, read_json


ROOT = Path(__file__).resolve().parent.parent
TARGETS = {"backend": "obeto", "frontend": "btrx_beer"}


def commands(task_id: str) -> str:
    return (
        "```powershell\n"
        f"python bot/export_task.py {task_id} | codex exec -\n"
        "```\n\nหรือ\n\n"
        "```powershell\n"
        f"python bot/export_task.py {task_id} | claude -p \"Implement the task described in the piped input\"\n"
        "```"
    )


def main() -> None:
    plan = read_json(PLAN_PATH)
    for track, name in TARGETS.items():
        directory = ROOT / "workstreams" / name
        directory.mkdir(parents=True, exist_ok=True)
        title = "Backend / Security / Agent Integration" if track == "backend" else "Frontend / UI / Model Training"
        overview = [
            f"# {name} — {title} pipeline",
            "",
            "ไฟล์ในโฟลเดอร์นี้สร้างจาก `bot/config/tasks.json` เพื่อให้อ่านงานแยกตามคนและ phase ได้ง่าย",
            "ถ้าแก้แผนงานหลัก ให้รัน `python bot/generate_workstreams.py` เพื่อสร้างไฟล์ใหม่",
            "",
            "## ลำดับ phase",
            "",
        ]
        for phase in plan["phases"]:
            tasks = [task for task in plan["tasks"] if task["track"] == track and task["phase"] == phase["id"]]
            slug = f"phase-{phase['id']}.md"
            overview.append(f"- [Phase {phase['id']} · {phase['name']}]({slug}): {', '.join(task['id'] for task in tasks)}")
            lines = [
                f"# Phase {phase['id']} · {phase['name']}",
                "",
                f"**เป้าหมาย:** {phase['goal']}",
                f"**Pipeline:** {title}",
                "",
            ]
            for task in tasks:
                lines.extend([
                    f"## {task['id']} · {task['title']}",
                    "",
                    f"- รอ: {', '.join(task['depends_on']) or 'ไม่ต้องรอ'}",
                    f"- ส่งมอบ: {task['deliverable']}",
                    f"- เกณฑ์ผ่าน: {task['acceptance']}",
                    "",
                    "**คำสั่ง AI CLI** — เลือก Codex หรือ Claude และรันในโฟลเดอร์โปรเจกต์:",
                    "",
                    commands(task["id"]),
                    "",
                    "**หน้าที่ของคนสั่ง AI:** อ่าน diff, ทดสอบเกณฑ์ผ่าน, ใช้ `/submit` พร้อมหลักฐาน แล้ว `/selfcheck` ด้วยตนเอง",
                    "",
                ])
            (directory / slug).write_text("\n".join(lines), encoding="utf-8")
        overview.extend([
            "",
            "## รับงานแทนเพื่อน",
            "",
            "เมื่ออีกคนไม่ว่าง ใช้ `/assign` หรือ `/claim` รับงานข้าม pipeline ได้ คนที่สั่ง AI ต้องตรวจงานเอง",
            "และเจ้าของ pipeline ตรวจรับอีกครั้งผ่าน `/approve` ก่อน task เป็น done",
            "",
        ])
        (directory / "README.md").write_text("\n".join(overview), encoding="utf-8")


if __name__ == "__main__":
    main()
