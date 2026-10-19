"""Replay the labeled cases in datasets/sentinel_cases_v1.json through the real detection rules (B08).

    backend/.venv/bin/python backend/scripts/eval_detection.py

Each case's logs are POSTed to /api/events of a fresh app (own SQLite file, Ollama disabled) with their original
timestamps. Ground truth is the case's `rule_hint`: one of the three rule kinds → an incident of that kind must
open; anything else (FAILED_LOGIN_LOW, null) → no incident. Usernames are cut to 80 characters as the
contract asks every event source to do (longer → the API refuses the whole event with 422). The model is not involved; it is evaluated
separately by model/eval/agent_bench.py.
"""

from __future__ import annotations

import json
import os
import re
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO))
os.environ.setdefault("SENTINEL_DISABLE_OLLAMA", "1")

from fastapi.testclient import TestClient  # noqa: E402

from backend.app import create_app  # noqa: E402

RULE_KINDS = {"HTTP_AUTH_BRUTE_FORCE", "SSH_BRUTE_FORCE", "PORT_SCAN"}
NORMAL = {"benign", "insufficient_evidence"}


def to_event(log: dict, category: str) -> dict:
    if log["type"] == "HTTP_AUTH":
        outcome = "success" if log["status"] < 400 else "failed"
        user = log.get("user")
    elif log["type"] == "SSH_AUTH":
        outcome = "failed" if "Failed password" in log["line"] else "success"
        found = re.search(r"for (?:invalid user )?(\S+) from", log["line"])
        user = found[1] if found else None
    else:
        outcome, user = "attempt", None
    return {"source_ip": log["src"], "event_type": log["type"], "outcome": outcome, "timestamp": log["t"],
            "destination_port": log.get("dst_port"), "username": user[:80] if user else None, "label": "normal" if category in NORMAL else "attack"}


def replay(case: dict, workdir: Path) -> list[str]:
    client = TestClient(create_app(workdir / f"{case['id']}.db"))
    for log in sorted(case["logs"], key=lambda item: item["t"]):
        response = client.post("/api/events", json=to_event(log, case["category"]))
        if response.status_code != 201:
            raise SystemExit(f"{case['id']}: event refused {response.status_code} {response.text}")
    return sorted(i["kind"] for i in client.get("/api/incidents").json())


def score(rows: list[dict]) -> dict:
    tp = sum(1 for r in rows if r["expected"] and r["expected"] in r["got"])
    fp = sum(1 for r in rows if not r["expected"] and r["got"])
    fn = sum(1 for r in rows if r["expected"] and r["expected"] not in r["got"])
    tn = sum(1 for r in rows if not r["expected"] and not r["got"])
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    extra = sum(1 for r in rows if r["expected"] and set(r["got"]) - {r["expected"]})
    return {"cases": len(rows), "tp": tp, "fp": fp, "fn": fn, "tn": tn, "precision": round(precision, 3), "recall": round(recall, 3),
            "f1": round(f1, 3), "false_positive_rate": round(fp / (fp + tn), 3) if fp + tn else 0.0, "extra_kinds": extra}


def main() -> int:
    data = json.loads((REPO / "datasets" / "sentinel_cases_v1.json").read_text(encoding="utf-8"))
    rows = []
    with tempfile.TemporaryDirectory() as tmp:
        for case in data["cases"]:
            expected = case["rule_hint"] if case["rule_hint"] in RULE_KINDS else None
            rows.append({"id": case["id"], "split": case["split"], "category": case["category"], "expected": expected,
                         "got": replay(case, Path(tmp))})
    print("| split | cases | TP | FP | FN | TN | precision | recall | F1 | FP rate |")
    print("|---|---|---|---|---|---|---|---|---|---|")
    for split in ("test", "dev", "all"):
        s = score([r for r in rows if split == "all" or r["split"] == split])
        print(f"| {split} | {s['cases']} | {s['tp']} | {s['fp']} | {s['fn']} | {s['tn']} | {s['precision']} | {s['recall']} | {s['f1']} | {s['false_positive_rate']} |")
    wrong = [r for r in rows if (r["expected"] not in r["got"]) if r["expected"]] + [r for r in rows if not r["expected"] and r["got"]]
    print(f"\nmisses/false alarms: {len(wrong)}")
    for r in wrong:
        print(f"- {r['id']} ({r['category']}): expected {r['expected']}, got {r['got']}")
    print(f"\ndataset v{data['version']} seed {data['seed']} · rules: backend/rules/*.yml · ground truth: rule_hint")
    return 0


if __name__ == "__main__":
    sys.exit(main())
