"""Rule-based detection. Rules live in backend/rules/*.yml (Sigma-inspired: selection + correlation)."""

from __future__ import annotations

import hashlib
import re
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import unquote

import yaml

LEVELS = {"low": "LOW", "medium": "MEDIUM", "high": "HIGH", "critical": "CRITICAL"}
# Only these event columns may appear in a rule selection; rule files never reach SQL as raw text.
SELECTABLE = {"event_type", "outcome"}
# event_sum adds up one of these columns; HTTP_REQUEST events already hold the totals of a short window.
SUMMABLE = {"request_count", "not_found", "scan_paths"}
CRITICAL_MULTIPLIER = 3
# Paths that only vulnerability scanners ask for on this site. Matched on the decoded, lower-cased path.
SCANNER_PATTERNS = ("/.env", "/.git", "/wp-admin", "/wp-login", "/xmlrpc.php", "/phpmyadmin", "/cgi-bin", "../", "union select")


def scanner_path_count(paths: list[str]) -> int:
    return sum(any(pattern in unquote(path).lower() for pattern in SCANNER_PATTERNS) for path in paths)


@dataclass(frozen=True)
class Rule:
    id: str
    title: str
    kind: str
    level: str
    attack_technique: str | None
    selection: dict[str, str]
    correlation: str  # event_count | value_count | event_sum | failures_before
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
    if corr["type"] not in {"event_count", "value_count", "event_sum", "failures_before"} or corr.get("group-by") != ["source_ip"]:
        raise ValueError(f"{path.name}: unsupported correlation")
    if corr["type"] == "value_count" and corr.get("field") != "destination_port":
        raise ValueError(f"{path.name}: value_count only supports destination_port")
    if corr["type"] == "event_sum" and corr.get("field") not in SUMMABLE:
        raise ValueError(f"{path.name}: event_sum only supports {sorted(SUMMABLE)}")
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
            if rule.correlation == "failures_before":
                # The matching event is the success; count the failures on the same channel that led up to it.
                count = con.execute(
                    "SELECT COUNT(*) FROM events WHERE source_ip=? AND event_type=? AND outcome='failed' AND timestamp>=? AND timestamp<=?",
                    (event["source_ip"], event["event_type"], start, event["timestamp"]),
                ).fetchone()[0]
            else:
                where = " AND ".join(f"{key}=?" for key in rule.selection)
                # rule.field comes from SUMMABLE (checked in _parse), never from raw rule text.
                measure = {"value_count": "COUNT(DISTINCT destination_port)",
                           "event_sum": f"COALESCE(SUM({rule.field}), 0)"}.get(rule.correlation, "COUNT(*)")
                count = con.execute(
                    f"SELECT {measure} FROM events WHERE source_ip=? AND {where} AND timestamp>=? AND timestamp<=?",
                    (event["source_ip"], *rule.selection.values(), start, event["timestamp"]),
                ).fetchone()[0]
            if count >= rule.threshold:
                matches.append(Match(rule, count))
        return matches
