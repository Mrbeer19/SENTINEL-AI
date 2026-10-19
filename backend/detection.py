"""Rule-based detection. Rules live in backend/rules/*.yml (Sigma-inspired: selection + correlation)."""

from __future__ import annotations

import hashlib
import re
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

import yaml

LEVELS = {"low": "LOW", "medium": "MEDIUM", "high": "HIGH", "critical": "CRITICAL"}
# Only these event columns may appear in a rule selection; rule files never reach SQL as raw text.
SELECTABLE = {"event_type", "outcome"}
CRITICAL_MULTIPLIER = 3


@dataclass(frozen=True)
class Rule:
    id: str
    title: str
    kind: str
    level: str
    attack_technique: str | None
    selection: dict[str, str]
    correlation: str  # event_count | value_count
    field: str | None
    window: timedelta
    threshold: int


@dataclass(frozen=True)
class Match:
    rule: Rule
    count: int

    @property
    def severity(self) -> str:
        return "CRITICAL" if self.count >= self.rule.threshold * CRITICAL_MULTIPLIER else self.rule.level


def _timespan(text: str) -> timedelta:
    found = re.fullmatch(r"(\d+)([smh])", str(text))
    if not found:
        raise ValueError(f"bad timespan {text!r}")
    return timedelta(**{{"s": "seconds", "m": "minutes", "h": "hours"}[found[2]]: int(found[1])})


def _parse(path: Path) -> Rule:
    doc = yaml.safe_load(path.read_text(encoding="utf-8"))
    selection = doc["detection"]["selection"]
    if set(selection) - SELECTABLE:
        raise ValueError(f"{path.name}: selection may only use {sorted(SELECTABLE)}")
    corr = doc["correlation"]
    if corr["type"] not in {"event_count", "value_count"} or corr.get("group-by") != ["source_ip"]:
        raise ValueError(f"{path.name}: unsupported correlation")
    if corr["type"] == "value_count" and corr.get("field") != "destination_port":
        raise ValueError(f"{path.name}: value_count only supports destination_port")
    techniques = [tag.split(".", 1)[1].upper() for tag in doc.get("tags", []) if re.fullmatch(r"attack\.t\d{4}(\.\d{3})?", tag)]
    return Rule(
        id=doc["id"], title=doc["title"], kind=doc["sentinel"]["kind"], level=LEVELS[doc["level"]],
        attack_technique=techniques[0] if techniques else None, selection={k: str(v) for k, v in selection.items()},
        correlation=corr["type"], field=corr.get("field"), window=_timespan(corr["timespan"]), threshold=int(corr["condition"]["gte"]),
    )


class RuleSet:
    def __init__(self, rules_dir: Path):
        files = sorted(Path(rules_dir).glob("*.yml"))
        if not files:
            raise ValueError(f"no detection rules in {rules_dir}")
        self.rules = [_parse(path) for path in files]
        self.version = hashlib.sha256(b"".join(path.read_bytes() for path in files)).hexdigest()[:12]

    def evaluate(self, con: sqlite3.Connection, event: dict) -> list[Match]:
        """Count matching events for the event's source IP in the window ending at the event's own time."""
        matches = []
        end = datetime.fromisoformat(event["timestamp"])
        for rule in self.rules:
            if any(str(event.get(key)) != value for key, value in rule.selection.items()):
                continue
            start = (end - rule.window).isoformat(timespec="seconds")
            where = " AND ".join(f"{key}=?" for key in rule.selection)
            measure = "COUNT(DISTINCT destination_port)" if rule.correlation == "value_count" else "COUNT(*)"
            count = con.execute(
                f"SELECT {measure} FROM events WHERE source_ip=? AND {where} AND timestamp>=? AND timestamp<=?",
                (event["source_ip"], *rule.selection.values(), start, event["timestamp"]),
            ).fetchone()[0]
            if count >= rule.threshold:
                matches.append(Match(rule, count))
        return matches
