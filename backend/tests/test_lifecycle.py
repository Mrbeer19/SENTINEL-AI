"""Incident state machine, human decisions, firewall rules, verification and demo reset."""

import json
import sqlite3

import pytest
from conftest import ATTACKER, analysis, blocked_incident, connect, simulate

from backend.app import TERMINAL, TRANSITIONS

REVIEW = {"reviewer": "teacher"}


def analyze(client, incident_id):
    return client.post(f"/api/incidents/{incident_id}/analyze")


def statuses(client, incident_id):
    """Status path read back from the audit log."""
    entries = sorted(client.get("/api/audit?limit=1000").json(), key=lambda a: a["id"])
    changes = [json.loads(a["detail"]) for a in entries if a["incident_id"] == incident_id and a["action"] == "status_changed"]
    return ["detected"] + [c["to"] for c in changes]


# ---- the table itself ----

def test_terminal_states_have_no_way_out():
    assert not TERMINAL & set(TRANSITIONS)


def test_every_target_state_is_known():
    known = set(TRANSITIONS) | TERMINAL
    assert all(target in known for targets in TRANSITIONS.values() for target in targets)


def test_every_open_state_can_be_closed():
    assert all("closed" in targets for targets in TRANSITIONS.values())


# ---- happy path ----

def test_full_path_is_recorded_in_order(client):
    incident = blocked_incident(client)
    client.post("/api/demo/traffic", json={"source_ip": ATTACKER})
    assert statuses(client, incident["id"]) == ["detected", "analyzing", "awaiting_approval", "blocked", "verified"]


def test_rule_alone_does_not_verify(client):
    incident = blocked_incident(client)
    assert incident["status"] == "blocked"
    assert client.get(f"/api/incidents/{incident['id']}").json()["status"] == "blocked"


def test_verification_is_recorded_once(client):
    incident = blocked_incident(client)
    for _ in range(3):
        assert client.post("/api/demo/traffic", json={"source_ip": ATTACKER}).status_code == 403
    actions = [a["action"] for a in client.get("/api/audit").json() if a["incident_id"] == incident["id"]]
    assert actions.count("verification_passed") == 1


def test_other_ips_are_not_blocked(client):
    blocked_incident(client)
    assert client.post("/api/demo/traffic", json={"source_ip": "192.0.2.26"}).status_code == 200


def test_approved_rule_expiry_matches_action(client):
    incident = blocked_incident(client)
    rule = client.get("/api/rules").json()[0]
    assert rule["active"] and rule["source_ip"] == ATTACKER and incident["proposal"]["duration_seconds"] == 600
    assert incident["proposal"]["d3fend"] == "D3-ITF" and incident["proposal"]["reviewer"] == "teacher"


# ---- analyze ----

def test_analyze_twice_returns_the_same_result(client):
    incident = simulate(client)
    first = analyze(client, incident["id"]).json()
    second = analyze(client, incident["id"]).json()
    assert first["trace"] == second["trace"] and len(client.get("/api/proposals").json()) == 1


def test_analyzing_a_closed_incident_is_a_conflict(client):
    incident = simulate(client)
    client.post("/api/demo/reset")
    response = analyze(client, incident["id"])
    assert response.status_code == 409 and "closed" in response.json()["detail"]


@pytest.mark.parametrize("method,path", [
    ("post", "/api/incidents/99/analyze"), ("get", "/api/incidents/99"), ("get", "/api/reports/99"),
    ("post", "/api/proposals/99/approve"), ("post", "/api/proposals/99/reject"), ("delete", "/api/rules/99"),
])
def test_unknown_ids_are_404(client, method, path):
    kwargs = {"json": REVIEW} if method == "post" and "proposals" in path else {}
    assert getattr(client, method)(path, **kwargs).status_code == 404


# ---- human decisions ----

@pytest.mark.parametrize("first,second", [("approve", "approve"), ("approve", "reject"), ("reject", "approve"), ("reject", "reject")])
def test_a_proposal_is_decided_once(client, first, second):
    proposal = analyze(client, simulate(client)["id"]).json()["proposal"]
    assert client.post(f"/api/proposals/{proposal['id']}/{first}", json=REVIEW).status_code == 200
    assert client.post(f"/api/proposals/{proposal['id']}/{second}", json=REVIEW).status_code == 409


@pytest.mark.parametrize("body", [{}, {"reviewer": "a"}, {"reviewer": "x" * 81}, {"reviewer": None}])
def test_reviewer_name_is_required(client, body):
    proposal = analyze(client, simulate(client)["id"]).json()["proposal"]
    assert client.post(f"/api/proposals/{proposal['id']}/approve", json=body).status_code == 422
    assert client.get("/api/rules").json() == []


def test_reject_records_reviewer_and_creates_no_rule(client):
    incident = simulate(client)
    proposal = analyze(client, incident["id"]).json()["proposal"]
    result = client.post(f"/api/proposals/{proposal['id']}/reject", json={"reviewer": "night shift"}).json()
    assert result["status"] == "rejected" and result["proposal"]["reviewer"] == "night shift"
    assert any(a["actor"] == "night shift" for a in client.get("/api/audit").json())


# ---- reuse after terminal states ----

@pytest.mark.parametrize("finish", ["reject", "reset"])
def test_new_attack_after_a_finished_incident_opens_a_new_one(client, finish):
    first = simulate(client)
    proposal = analyze(client, first["id"]).json()["proposal"]
    if finish == "reject":
        client.post(f"/api/proposals/{proposal['id']}/reject", json=REVIEW)
    else:
        client.post("/api/demo/reset")
    second = simulate(client)
    assert second["id"] != first["id"] and second["status"] == "detected"


def test_monitoring_incident_keeps_collecting_events(make_app, script_model):
    script_model(finals=[analysis(recommended_action="MONITOR")])
    client = connect(make_app())
    incident = simulate(client)
    assert analyze(client, incident["id"]).json()["status"] == "monitoring"
    again = simulate(client)
    assert again["id"] == incident["id"] and again["event_count"] == 12


# ---- unblock and expiry ----

def test_unblock_before_verification_closes_the_incident(client):
    incident = blocked_incident(client)
    client.delete(f"/api/rules/{client.get('/api/rules').json()[0]['id']}")
    assert client.get(f"/api/incidents/{incident['id']}").json()["status"] == "closed"


def test_unblock_after_verification_keeps_it_verified(client):
    incident = blocked_incident(client)
    client.post("/api/demo/traffic", json={"source_ip": ATTACKER})
    client.delete(f"/api/rules/{client.get('/api/rules').json()[0]['id']}")
    assert client.get(f"/api/incidents/{incident['id']}").json()["status"] == "verified"
    assert client.post("/api/demo/traffic", json={"source_ip": ATTACKER}).status_code == 200


def test_expired_rule_stops_blocking(tmp_path, make_app):
    client = connect(make_app())
    blocked_incident(client)
    con = sqlite3.connect(tmp_path / "soc.db")
    con.execute("UPDATE rules SET expires_at='2000-01-01T00:00:00+00:00'")
    con.commit()
    con.close()
    assert client.post("/api/demo/traffic", json={"source_ip": ATTACKER}).status_code == 200
    assert client.get("/api/rules").json()[0]["active"] is False


# ---- demo login ----

def test_demo_login_accepts_the_demo_account(make_app):
    client = connect(make_app(), peer="192.168.1.50")
    response = client.post("/api/demo/login", json={"username": "student", "password": "sentinel-demo"})
    assert response.status_code == 200 and response.json()["authenticated"] is True


def test_demo_login_from_blocked_ip_is_refused_before_checking_password(make_app):
    app = make_app()
    remote, local = connect(app, peer="192.168.1.50"), connect(app)
    for _ in range(5):
        remote.post("/api/demo/login", json={"username": "student", "password": "wrong"})
    incident = local.get("/api/incidents").json()[0]
    proposal = analyze(local, incident["id"]).json()["proposal"]
    local.post(f"/api/proposals/{proposal['id']}/approve", json=REVIEW)
    events_before = len(local.get("/api/events").json())
    response = remote.post("/api/demo/login", json={"username": "student", "password": "sentinel-demo"})
    assert response.status_code == 403 and response.json()["decision"] == "denied"
    assert len(local.get("/api/events").json()) == events_before
    assert local.get(f"/api/incidents/{incident['id']}").json()["status"] == "verified"


def test_demo_login_with_a_very_long_name_is_still_recorded(make_app):
    app = make_app()
    remote = connect(app, peer="192.168.1.50")
    for _ in range(5):
        assert remote.post("/api/demo/login", json={"username": "x" * 500, "password": "wrong"}).status_code == 401
    incident = connect(app).get("/api/incidents").json()[0]
    assert incident["source_ip"] == "192.168.1.50" and incident["event_count"] == 5


def test_demo_login_never_stores_the_password(tmp_path, make_app):
    client = connect(make_app(), peer="192.168.1.50")
    client.post("/api/demo/login", json={"username": "student", "password": "hunter2-secret"})
    stored = b"".join(path.read_bytes() for path in tmp_path.glob("soc.db*"))  # WAL keeps new writes in soc.db-wal
    assert b"student" in stored and b"hunter2-secret" not in stored


# ---- reset ----

def test_reset_on_empty_db_is_a_no_op(client):
    assert client.post("/api/demo/reset").json() == {"rules_disabled": 0, "incidents_closed": 0}


def test_reset_rejects_pending_proposals_and_is_audited(client):
    analyze(client, simulate(client)["id"])
    client.post("/api/demo/reset")
    proposal = client.get("/api/proposals").json()[0]
    assert proposal["status"] == "rejected" and proposal["reviewer"] == "demo reset"
    assert client.get("/api/audit").json()[0]["action"] == "demo_reset"


def test_reset_keeps_history(client):
    blocked_incident(client)
    events = len(client.get("/api/events").json())
    client.post("/api/demo/reset")
    assert len(client.get("/api/events").json()) == events and len(client.get("/api/incidents").json()) == 1
