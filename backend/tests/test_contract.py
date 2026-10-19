"""Response shapes promised to the dashboard in docs/api-contract.md (v0.2)."""

from datetime import datetime, timedelta, timezone

import pytest
from conftest import ATTACKER, blocked_incident, event, simulate

from backend.app import API_VERSION, WS_VERSION

INCIDENT_KEYS = {"id", "kind", "source_ip", "status", "severity", "event_count", "created_at", "updated_at", "rule_id",
                 "attack_technique", "analysis", "analysis_mode", "analysis_meta"}
PROPOSAL_KEYS = {"id", "incident_id", "source_ip", "target_ip", "action", "duration_seconds", "status", "reviewer", "created_at",
                 "source", "d3fend", "reason", "policy_notes"}
TRACE_KEYS = {"id", "incident_id", "operation", "tool", "status", "source", "duration_ms", "input", "output", "created_at"}
AUDIT_KEYS = {"id", "ts", "actor", "action", "incident_id", "detail", "prev_hash", "hash"}


def test_health_shape_without_model(client):
    assert client.get("/api/health").json() == {"status": "ok", "version": API_VERSION, "model": "qwen3.5:4b",
                                                 "model_ready": False, "ai_mode": "rule_fallback"}


def test_event_is_created_with_201_and_full_record(client):
    response = client.post("/api/events", json=event(destination_port=22, username="root", label="attack"))
    assert response.status_code == 201
    record = response.json()["event"]
    assert record["destination_port"] == 22 and record["username"] == "root" and record["ocsf_class_uid"] == 3002
    assert record["timestamp"].endswith("+00:00") and response.json()["incident"] is None


@pytest.mark.parametrize("bad", [
    {"event_type": "FTP"}, {"outcome": "blocked"}, {"destination_port": 0}, {"destination_port": 65536}, {"label": "evil"},
    {"username": "u" * 81}, {"timestamp": "2026-10-20T10:00:00"}, {"source_ip": "192.0.2.256"},
])
def test_invalid_events_are_422(client, bad):
    assert client.post("/api/events", json={**event(), **bad}).status_code == 422


def test_timestamps_far_in_the_future_are_refused(client):
    future = (datetime.now(timezone.utc) + timedelta(minutes=6)).isoformat()
    assert client.post("/api/events", json=event(timestamp=future)).status_code == 422


def test_small_clock_skew_is_accepted(client):
    skew = (datetime.now(timezone.utc) + timedelta(minutes=4)).isoformat()
    assert client.post("/api/events", json=event(timestamp=skew)).status_code == 201


@pytest.mark.parametrize("port", [1, 65535])
def test_port_bounds_are_inclusive(client, port):
    assert client.post("/api/events", json=event(event_type="CONNECTION", outcome="attempt", destination_port=port)).status_code == 201


def test_ipv6_sources_are_stored_normalised(client):
    assert client.post("/api/events", json=event(ip="2001:DB8:0::5")).json()["event"]["source_ip"] == "2001:db8::5"


def test_usernames_keep_printable_characters_only(client):
    assert client.post("/api/events", json=event(username="ad\x00min\n\x1b[31m")).json()["event"]["username"] == "admin[31m"


def test_connection_events_map_to_ocsf_network_activity(client):
    assert client.post("/api/events", json=event(event_type="CONNECTION", outcome="attempt")).json()["event"]["ocsf_class_uid"] == 4001


@pytest.mark.parametrize("limit,expected", [(0, 1), (2, 2), (10_000, 7)])
def test_event_list_limit_is_clamped_newest_first(client, limit, expected):
    for _ in range(7):
        client.post("/api/events", json=event(outcome="success"))
    rows = client.get(f"/api/events?limit={limit}").json()
    assert len(rows) == expected and rows[0]["id"] == 7 and [r["id"] for r in rows] == sorted((r["id"] for r in rows), reverse=True)


def test_incident_list_and_detail_shapes(client):
    incident = blocked_incident(client)
    assert INCIDENT_KEYS <= set(client.get("/api/incidents").json()[0])
    assert INCIDENT_KEYS | {"trace", "timeline", "proposal"} <= set(incident)
    assert PROPOSAL_KEYS <= set(incident["proposal"]) and isinstance(incident["proposal"]["policy_notes"], list)
    assert all(TRACE_KEYS <= set(t) for t in incident["trace"])
    assert set(incident["analysis"]) == {"threat_type", "severity", "confidence", "evidence", "recommended_action", "explanation_th"}
    assert set(incident["analysis_meta"]) == {"model", "model_digest", "prompt_version", "rules_version"}


def test_proposal_keeps_source_ip_alias(client):
    proposal = blocked_incident(client)["proposal"]
    assert proposal["source_ip"] == proposal["target_ip"] == ATTACKER


@pytest.mark.parametrize("scenario,count,kind", [("http_brute_force", 6, "HTTP_AUTH_BRUTE_FORCE"), ("ssh_brute_force_logs", 6, "SSH_BRUTE_FORCE"),
                                                 ("port_scan", 9, "PORT_SCAN"), ("normal", 2, None)])
def test_simulation_scenarios(client, scenario, count, kind):
    result = client.post("/api/simulations", json={"scenario": scenario, "source_ip": ATTACKER}).json()
    assert result["events_created"] == count and (result["incident"] or {}).get("kind") == kind
    assert ("not a live SSH attack" in result["source_note"]) is (scenario == "ssh_brute_force_logs")


def test_unknown_scenario_is_422(client):
    assert client.post("/api/simulations", json={"scenario": "ddos"}).status_code == 422


def test_traffic_response_shapes(client):
    assert client.post("/api/demo/traffic", json={"source_ip": ATTACKER}).json() == {"source_ip": ATTACKER, "decision": "allowed", "rule_id": None}
    blocked_incident(client)
    denied = client.post("/api/demo/traffic", json={"source_ip": ATTACKER})
    assert denied.status_code == 403 and denied.json()["decision"] == "denied" and denied.json()["rule_id"] == 1


def test_report_shape(client):
    incident = blocked_incident(client)
    report = client.get(f"/api/reports/{incident['id']}").json()
    assert {"events", "traffic", "audit", "soc_timings"} <= set(report)
    assert all(AUDIT_KEYS <= set(a) for a in report["audit"])
    assert set(report["soc_timings"]) == {"mttd_s", "time_to_proposal_s", "mttr_s", "time_to_verify_s"}


def test_metrics_shape(client):
    simulate(client)
    metrics = client.get("/api/metrics").json()
    assert {"events", "incidents", "precision", "recall", "f1", "note", "soc"} <= set(metrics)
    assert metrics["precision"] == metrics["recall"] == 1


def test_websocket_stages_follow_the_flow(client):
    with client.websocket_connect("/ws") as socket:
        assert socket.receive_json()["v"] == WS_VERSION
        incident = simulate(client)
        proposal = client.post(f"/api/incidents/{incident['id']}/analyze").json()["proposal"]
        client.post(f"/api/proposals/{proposal['id']}/approve", json={"reviewer": "teacher"})
        client.post("/api/demo/traffic", json={"source_ip": ATTACKER})
        client.delete("/api/rules/1")
        client.post("/api/demo/reset")
        seen = []
        while not seen or seen[-1] != "reset":
            message = socket.receive_json()
            assert set(message) == {"v", "stage", "ts", "payload"}
            seen.append(message["stage"])
    assert ["event", "incident", "analysis_step", "analysis", "approval", "traffic", "verification", "firewall", "reset"] == list(dict.fromkeys(seen))
