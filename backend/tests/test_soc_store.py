"""SOC response-time metrics and the v1 → v2 database migration."""

import sqlite3

from conftest import ATTACKER, at, blocked_incident, connect, event

from backend import soc
from backend.store import SCHEMA_VERSION, Store


def test_timings_are_empty_before_anything_happens(client):
    client.post("/api/simulations", json={"scenario": "http_brute_force", "source_ip": ATTACKER})
    timings = client.get("/api/reports/1").json()["soc_timings"]
    assert timings["mttd_s"] is not None and timings["time_to_proposal_s"] is None
    assert timings["mttr_s"] is None and timings["time_to_verify_s"] is None


def test_timings_after_full_flow_are_ordered(client):
    blocked_incident(client)
    client.post("/api/demo/traffic", json={"source_ip": ATTACKER})
    t = client.get("/api/reports/1").json()["soc_timings"]
    assert 0 <= t["time_to_proposal_s"] <= t["mttr_s"] <= t["time_to_verify_s"]


def test_mttd_measures_from_first_event_in_window(client):
    for _ in range(4):
        client.post("/api/events", json=event(timestamp=at(30)))
    client.post("/api/events", json=event())
    assert 29 <= client.get("/api/reports/1").json()["soc_timings"]["mttd_s"] <= 32


def test_reject_has_no_mttr(client):
    client.post("/api/simulations", json={"scenario": "http_brute_force", "source_ip": ATTACKER})
    proposal = client.post("/api/incidents/1/analyze").json()["proposal"]
    client.post(f"/api/proposals/{proposal['id']}/reject", json={"reviewer": "teacher"})
    t = client.get("/api/reports/1").json()["soc_timings"]
    assert t["time_to_proposal_s"] is not None and t["mttr_s"] is None


def test_summary_of_nothing():
    out = soc.summary([])
    assert out["incidents"] == 0 and all(out[f] == {"n": 0, "median": None, "p90": None} for f in soc.FIELDS)


def test_summary_median_and_p90_skip_missing_values():
    rows = [{f: None for f in soc.FIELDS} | {"mttd_s": float(v)} for v in range(1, 11)] + [{f: None for f in soc.FIELDS}]
    out = soc.summary(rows)
    assert out["incidents"] == 11 and out["mttd_s"] == {"n": 10, "median": 5.5, "p90": 9.0}
    assert out["mttr_s"]["n"] == 0


def test_metrics_endpoint_includes_soc_summary(client):
    blocked_incident(client)
    assert client.get("/api/metrics").json()["soc"]["time_to_proposal_s"]["n"] == 1


# ---- migration ----

V1 = """
CREATE TABLE events (id INTEGER PRIMARY KEY, timestamp TEXT NOT NULL, source_ip TEXT NOT NULL, event_type TEXT NOT NULL, outcome TEXT NOT NULL, destination_port INTEGER, label TEXT NOT NULL);
CREATE TABLE incidents (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, source_ip TEXT NOT NULL, status TEXT NOT NULL, severity TEXT NOT NULL, event_count INTEGER NOT NULL, created_at TEXT NOT NULL, analysis TEXT, analysis_mode TEXT);
CREATE TABLE proposals (id INTEGER PRIMARY KEY, incident_id INTEGER UNIQUE NOT NULL, source_ip TEXT NOT NULL, action TEXT NOT NULL, duration_seconds INTEGER NOT NULL, status TEXT NOT NULL, reviewer TEXT, created_at TEXT NOT NULL);
INSERT INTO incidents VALUES (1,'HTTP_AUTH_BRUTE_FORCE','192.0.2.25','verified','high',6,'2026-10-19T00:00:00+00:00',NULL,NULL);
INSERT INTO proposals VALUES (1,1,'192.0.2.25','TEMP_BLOCK_IP',600,'approved','teacher','2026-10-19T00:00:00+00:00');
"""


def make_v1(path):
    con = sqlite3.connect(path)
    con.executescript(V1)
    con.close()


def test_v1_database_is_migrated_in_place(tmp_path):
    make_v1(tmp_path / "v1.db")
    store = Store(tmp_path / "v1.db")
    assert store.one("SELECT version FROM schema_version")["version"] == SCHEMA_VERSION
    assert store.one("SELECT severity FROM incidents")["severity"] == "HIGH"
    assert store.one("SELECT target_ip FROM proposals")["target_ip"] == "192.0.2.25"
    columns = {r["name"] for r in store.rows("PRAGMA table_info(incidents)")}
    assert {"rule_id", "attack_technique", "analysis_meta", "updated_at"} <= columns


def test_migration_is_idempotent(tmp_path):
    make_v1(tmp_path / "v1.db")
    Store(tmp_path / "v1.db")
    store = Store(tmp_path / "v1.db")
    assert store.rows("SELECT version FROM schema_version") == [{"version": SCHEMA_VERSION}]


def test_app_starts_on_a_v1_database_and_keeps_history(tmp_path, monkeypatch):
    from backend.app import create_app
    make_v1(tmp_path / "v1.db")
    client = connect(create_app(tmp_path / "v1.db"))
    incident = client.get("/api/incidents/1").json()
    assert incident["status"] == "verified" and incident["proposal"]["target_ip"] == "192.0.2.25"
    assert client.get("/api/audit/verify").json()["valid"] is True
