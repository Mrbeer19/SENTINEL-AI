"""Hash-chained audit log: what it detects, what it records, and its one known blind spot."""

import sqlite3
import threading

import pytest
from conftest import ATTACKER, blocked_incident, connect

from backend.store import GENESIS_HASH, Store, audit, verify_audit


@pytest.fixture
def flow(tmp_path, make_app):
    """A finished, verified incident → a chain with every kind of entry. Returns (client, db path)."""
    client = connect(make_app())
    blocked_incident(client)
    client.post("/api/demo/traffic", json={"source_ip": ATTACKER})
    return client, tmp_path / "soc.db"


def tamper(db, *statements):
    con = sqlite3.connect(db)
    for sql in statements:
        con.execute(sql)
    con.commit()
    con.close()


def verdict(client):
    return client.get("/api/audit/verify").json()


def test_empty_chain_is_valid(client):
    assert verdict(client) == {"valid": True, "entries": 0, "broken_at": None}


def test_full_flow_records_every_step(flow):
    client, _ = flow
    actions = {a["action"] for a in client.get("/api/audit").json()}
    assert {"incident_created", "status_changed", "analysis_recorded", "proposal_created", "rule_applied", "verification_passed"} <= actions
    assert verdict(client)["valid"] is True


def test_first_entry_links_to_genesis(flow):
    client, _ = flow
    first = min(client.get("/api/audit").json(), key=lambda a: a["id"])
    assert first["prev_hash"] == GENESIS_HASH


@pytest.mark.parametrize("column,value", [("detail", "'{}'"), ("actor", "'someone else'"), ("action", "'nothing'"),
                                           ("ts", "'2000-01-01T00:00:00+00:00'"), ("incident_id", "NULL")])
def test_editing_any_hashed_column_breaks_the_chain(flow, column, value):
    client, db = flow
    tamper(db, f"UPDATE audit_log SET {column}={value} WHERE id=3")
    assert verdict(client)["broken_at"] == 3


def test_recomputing_one_hash_still_breaks_the_next_link(flow):
    client, db = flow
    tamper(db, "UPDATE audit_log SET hash='" + "f" * 64 + "' WHERE id=3")
    assert verdict(client)["broken_at"] == 3


def test_deleting_a_middle_entry_breaks_the_chain(flow):
    client, db = flow
    tamper(db, "DELETE FROM audit_log WHERE id=3")
    assert verdict(client)["broken_at"] == 4


def test_swapping_two_entries_breaks_the_chain(flow):
    client, db = flow
    cols = "ts, actor, action, incident_id, detail, prev_hash, hash"
    tamper(db, f"CREATE TEMP TABLE a AS SELECT {cols} FROM audit_log WHERE id=3",
           f"CREATE TEMP TABLE b AS SELECT {cols} FROM audit_log WHERE id=4",
           f"UPDATE audit_log SET ({cols}) = (SELECT {cols} FROM b) WHERE id=3",
           f"UPDATE audit_log SET ({cols}) = (SELECT {cols} FROM a) WHERE id=4")
    assert verdict(client)["broken_at"] == 3


def test_appending_a_forged_entry_breaks_the_chain(flow):
    client, db = flow
    tamper(db, "INSERT INTO audit_log(ts,actor,action,incident_id,detail,prev_hash,hash) "
               f"VALUES('2026-01-01T00:00:00+00:00','teacher','rule_applied',1,'{{}}','{'0' * 64}','{'1' * 64}')")
    result = verdict(client)
    assert result["valid"] is False and result["broken_at"] == result["entries"]


def test_known_limit_truncating_the_tail_is_not_detected(flow):
    """A hash chain alone cannot see the newest entries removed. Mitigation (documented): note the entry count
    and last hash in the incident report / slides, or anchor them outside the DB."""
    client, db = flow
    before = verdict(client)["entries"]
    tamper(db, "DELETE FROM audit_log WHERE id=(SELECT MAX(id) FROM audit_log)")
    assert verdict(client) == {"valid": True, "entries": before - 1, "broken_at": None}


def test_thai_text_hashes_stably(tmp_path):
    store = Store(tmp_path / "a.db")
    with store.tx() as con:
        audit(con, "ผู้ตรวจ", "note", None, {"ข้อความ": "บล็อกแล้ว"})
    assert verify_audit(store.rows("SELECT * FROM audit_log ORDER BY id"))["valid"] is True


def test_concurrent_writers_never_fork_the_chain(tmp_path):
    store = Store(tmp_path / "a.db")

    def write(n):
        for i in range(25):
            with store.tx() as con:
                audit(con, f"worker{n}", "tick", None, {"i": i})

    threads = [threading.Thread(target=write, args=(n,)) for n in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert verify_audit(store.rows("SELECT * FROM audit_log ORDER BY id")) == {"valid": True, "entries": 100, "broken_at": None}


def test_failed_transaction_leaves_no_audit_entry(tmp_path):
    store = Store(tmp_path / "a.db")
    with pytest.raises(RuntimeError):
        with store.tx() as con:
            audit(con, "x", "y", None, {})
            raise RuntimeError("abort")
    assert store.rows("SELECT * FROM audit_log") == []


@pytest.mark.parametrize("limit,expected", [(0, 1), (-5, 1), (2, 2)])
def test_audit_limit_is_clamped(flow, limit, expected):
    client, _ = flow
    assert len(client.get(f"/api/audit?limit={limit}").json()) == expected
