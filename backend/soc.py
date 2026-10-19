"""SOC response-time metrics computed from stored records (never from the UI).

MTTD  = incident created − first matching event in the rule window   (time to detect)
TTP   = proposal created − incident created                          (time to a human-reviewable plan)
MTTR  = firewall rule created − incident created                     (time to contain; includes human approval)
TTV   = verification audit entry − incident created                   (time until the block was proven by a real 403)
"""

from __future__ import annotations

import statistics
from datetime import datetime, timedelta

from backend.detection import RuleSet
from backend.store import Store

FIELDS = ("mttd_s", "time_to_proposal_s", "mttr_s", "time_to_verify_s")


def _seconds(start: str | None, end: str | None) -> float | None:
    if not start or not end:
        return None
    return (datetime.fromisoformat(end) - datetime.fromisoformat(start)).total_seconds()


def timings(store: Store, ruleset: RuleSet, incident: dict) -> dict:
    created = incident["created_at"]
    rule = next((r for r in ruleset.rules if r.id == incident.get("rule_id")), None)
    window = rule.window if rule else timedelta(seconds=60)
    since = (datetime.fromisoformat(created) - window).isoformat(timespec="seconds")
    first = store.one("SELECT MIN(timestamp) t FROM events WHERE source_ip=? AND timestamp>=? AND timestamp<=?",
                      (incident["source_ip"], since, created))["t"]
    proposal = store.one("SELECT id, created_at FROM proposals WHERE incident_id=?", (incident["id"],))
    rule_row = store.one("SELECT created_at FROM rules WHERE proposal_id=? ORDER BY id LIMIT 1", (proposal["id"],)) if proposal else None
    verified = store.one("SELECT ts FROM audit_log WHERE incident_id=? AND action='verification_passed' ORDER BY id LIMIT 1", (incident["id"],))
    return {
        "mttd_s": _seconds(first, created),
        "time_to_proposal_s": _seconds(created, proposal["created_at"]) if proposal else None,
        "mttr_s": _seconds(created, rule_row["created_at"]) if rule_row else None,
        "time_to_verify_s": _seconds(created, verified["ts"]) if verified else None,
    }


def summary(rows: list[dict]) -> dict:
    out = {"incidents": len(rows)}
    for field in FIELDS:
        values = sorted(row[field] for row in rows if row[field] is not None)
        out[field] = {
            "n": len(values),
            "median": statistics.median(values) if values else None,
            "p90": values[min(len(values) - 1, int(round(0.9 * (len(values) - 1))))] if values else None,
        }
    out["note"] = "Seconds, 1 s resolution. MTTR includes the human approval wait."
    return out
