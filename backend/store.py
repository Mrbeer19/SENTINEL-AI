"""SQLite access, schema migration and the hash-chained audit log."""

from __future__ import annotations

import hashlib
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

SCHEMA_VERSION = 2
GENESIS_HASH = "0" * 64

BASE_SCHEMA = """
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, timestamp TEXT NOT NULL, source_ip TEXT NOT NULL, event_type TEXT NOT NULL, outcome TEXT NOT NULL, destination_port INTEGER, label TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS incidents (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, source_ip TEXT NOT NULL, status TEXT NOT NULL, severity TEXT NOT NULL, event_count INTEGER NOT NULL, created_at TEXT NOT NULL, analysis TEXT, analysis_mode TEXT);
CREATE TABLE IF NOT EXISTS traces (id INTEGER PRIMARY KEY, incident_id INTEGER NOT NULL, tool TEXT NOT NULL, input TEXT NOT NULL, output TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS proposals (id INTEGER PRIMARY KEY, incident_id INTEGER UNIQUE NOT NULL, source_ip TEXT NOT NULL, action TEXT NOT NULL, duration_seconds INTEGER NOT NULL, status TEXT NOT NULL, reviewer TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rules (id INTEGER PRIMARY KEY, proposal_id INTEGER NOT NULL, source_ip TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS traffic (id INTEGER PRIMARY KEY, source_ip TEXT NOT NULL, decision TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS timeline (id INTEGER PRIMARY KEY, incident_id INTEGER, stage TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY, ts TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, incident_id INTEGER, detail TEXT NOT NULL, prev_hash TEXT NOT NULL, hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_events_source_ts ON events(source_ip, timestamp);
"""

# v1 (MVP 0.1) → v2 columns. Added in place so an existing demo DB keeps its history.
V2_COLUMNS = {
    "events": {"username": "TEXT", "ocsf_class_uid": "INTEGER"},
    "incidents": {"rule_id": "TEXT", "attack_technique": "TEXT", "analysis_meta": "TEXT", "updated_at": "TEXT"},
    "proposals": {"target_ip": "TEXT", "source": "TEXT", "d3fend": "TEXT", "reason": "TEXT", "policy_notes": "TEXT"},
    "traces": {"operation": "TEXT", "status": "TEXT", "duration_ms": "INTEGER", "source": "TEXT"},
}


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Store:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        con = self._connect()
        try:
            con.executescript(BASE_SCHEMA)
        finally:
            con.close()
        with self.tx() as con:
            self._migrate(con)

    def _connect(self) -> sqlite3.Connection:
        con = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        con.row_factory = sqlite3.Row
        con.execute("PRAGMA foreign_keys=ON")
        con.execute("PRAGMA journal_mode=WAL")
        return con

    @contextmanager
    def tx(self):
        """Write transaction holding the write lock from the start, so audit hashes cannot fork."""
        con = self._connect()
        try:
            con.execute("BEGIN IMMEDIATE")
            yield con
            con.execute("COMMIT")
        except BaseException:
            con.execute("ROLLBACK")
            raise
        finally:
            con.close()

    def rows(self, sql: str, params=()) -> list[dict]:
        con = self._connect()
        try:
            return [dict(row) for row in con.execute(sql, params).fetchall()]
        finally:
            con.close()

    def one(self, sql: str, params=()) -> dict | None:
        found = self.rows(sql, params)
        return found[0] if found else None

    def _migrate(self, con: sqlite3.Connection) -> None:
        for table, columns in V2_COLUMNS.items():
            existing = {row["name"] for row in con.execute(f"PRAGMA table_info({table})")}
            for name, decl in columns.items():
                if name not in existing:
                    con.execute(f"ALTER TABLE {table} ADD COLUMN {name} {decl}")
        con.execute("UPDATE incidents SET severity=UPPER(severity) WHERE severity != UPPER(severity)")
        con.execute("UPDATE proposals SET target_ip=source_ip WHERE target_ip IS NULL")
        con.execute("DELETE FROM schema_version")
        con.execute("INSERT INTO schema_version(version) VALUES(?)", (SCHEMA_VERSION,))


def _entry_hash(ts: str, actor: str, action: str, incident_id: int | None, detail: str, prev_hash: str) -> str:
    body = json.dumps([ts, actor, action, incident_id, detail, prev_hash], ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(body.encode()).hexdigest()


def audit(con: sqlite3.Connection, actor: str, action: str, incident_id: int | None, detail: dict) -> None:
    """Append one tamper-evident entry. Call inside Store.tx() so the previous hash cannot change underneath."""
    last = con.execute("SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1").fetchone()
    prev_hash = last["hash"] if last else GENESIS_HASH
    ts = utcnow()
    text = json.dumps(detail, ensure_ascii=False, sort_keys=True)
    con.execute(
        "INSERT INTO audit_log(ts,actor,action,incident_id,detail,prev_hash,hash) VALUES(?,?,?,?,?,?,?)",
        (ts, actor, action, incident_id, text, prev_hash, _entry_hash(ts, actor, action, incident_id, text, prev_hash)),
    )


def verify_audit(entries: list[dict]) -> dict:
    """Recompute the chain in id order. Any edited, deleted or reordered row breaks it."""
    prev_hash = GENESIS_HASH
    for entry in entries:
        expected = _entry_hash(entry["ts"], entry["actor"], entry["action"], entry["incident_id"], entry["detail"], prev_hash)
        if entry["prev_hash"] != prev_hash or entry["hash"] != expected:
            return {"valid": False, "entries": len(entries), "broken_at": entry["id"]}
        prev_hash = entry["hash"]
    return {"valid": True, "entries": len(entries), "broken_at": None}
