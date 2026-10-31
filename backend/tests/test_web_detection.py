"""HTTP_REQUEST events from the web log bridge: honeypot and web scan rules, validation, and rule-only analysis."""

import json
from pathlib import Path

import pytest
import yaml
from conftest import ATTACKER, analysis, connect, event

from backend.detection import RuleSet, scanner_path_count

RULES = Path(__file__).resolve().parents[1] / "rules"


def web(ip=ATTACKER, **extra):
    return {"source_ip": ip, "event_type": "HTTP_REQUEST", "window_s": 10, **extra}


def send(client, **extra):
    response = client.post("/api/events", json=web(**extra))
    assert response.status_code == 201, response.text
    return response.json()


def test_one_honeypot_hit_opens_an_incident(client):
    incident = send(client, count=1, paths=["/admin-backup.zip"], honeypot=True)["incident"]
    assert incident["kind"] == "HONEYPOT" and incident["severity"] == "HIGH"
    assert incident["attack_technique"] == "T1595.003"


def test_honeypot_escalates_to_critical_at_three_hits(client):
    results = [send(client, count=1, paths=[f"/decoy-{n}"], honeypot=True)["incident"] for n in range(3)]
    assert [r["severity"] for r in results] == ["HIGH", "HIGH", "CRITICAL"]
    assert len({r["id"] for r in results}) == 1


@pytest.mark.parametrize("not_found,fires", [(9, False), (10, True)])
def test_not_found_total_threshold(client, not_found, fires):
    incident = send(client, count=not_found, not_found=not_found)["incident"]
    assert (incident is not None and incident["kind"] == "WEB_SCAN") is fires


def test_not_found_is_summed_across_windows(client):
    assert send(client, count=6, not_found=6)["incident"] is None
    assert send(client, count=4, not_found=4)["incident"]["kind"] == "WEB_SCAN"


def test_not_found_counts_per_source_ip(client):
    send(client, count=6, not_found=6)
    assert send(client, ip="192.0.2.99", count=6, not_found=6)["incident"] is None


def test_scanner_paths_open_a_web_scan(client):
    incident = send(client, count=3, paths=["/.env", "/wp-admin/setup.php", "/%2e%2e/etc/passwd"])["incident"]
    assert incident["kind"] == "WEB_SCAN" and incident["event_count"] == 3


def test_normal_browsing_opens_nothing(client):
    for _ in range(5):
        assert send(client, count=40, not_found=1, paths=["/trips", "/api/v1/route"])["incident"] is None


@pytest.mark.parametrize("path,hit", [("/.env", 1), ("/WP-LOGIN.php", 1), ("/a/..%2Fb", 1), ("/search/union%20select", 1),
                                      ("/environment", 0), ("/trips/123", 0)])
def test_scanner_path_matching(path, hit):
    assert scanner_path_count([path]) == hit


def test_paths_are_cut_and_cleaned_before_storage(client):
    stored = send(client, count=1, paths=["/x" + "a" * 300 + "\x00\x1b"], honeypot=True)["event"]
    [path] = json.loads(stored["paths"])
    assert len(path) == 100 and path.isprintable()
    assert stored["outcome"] == "honeypot" and stored["ocsf_class_uid"] == 4002


@pytest.mark.parametrize("body", [
    web(outcome="failed"),  # HTTP_REQUEST has no outcome
    event(count=5),  # totals belong to HTTP_REQUEST only
    event(honeypot=True),
    {"source_ip": ATTACKER, "event_type": "HTTP_AUTH"},  # other types still need an outcome
    web(paths=["/a"] * 6),
    web(count=-1),
    web(window_s=0),
])
def test_invalid_events_are_refused(client, body):
    assert client.post("/api/events", json=body).status_code == 422


def test_events_can_be_filtered_by_http_request(client):
    send(client, count=2)
    client.post("/api/events", json=event())
    assert [e["event_type"] for e in client.get("/api/events", params={"event_type": "HTTP_REQUEST"}).json()] == ["HTTP_REQUEST"]


def test_web_incident_is_analysed_by_the_rule_without_the_model(make_app, script_model):
    bodies = script_model(finals=[analysis()])
    client = connect(make_app())
    incident = send(client, count=1, paths=["/.git/config"], honeypot=True)["incident"]
    result = client.post(f"/api/incidents/{incident['id']}/analyze").json()
    assert bodies == []  # the model was never asked
    assert result["analysis_mode"] == "rule_fallback"
    assert result["analysis"]["threat_type"] == "HONEYPOT" and result["analysis"]["confidence"] is None
    assert any("/.git/config" in fact for fact in result["analysis"]["evidence"])
    assert result["proposal"]["action"] == "TEMP_BLOCK_IP" and result["proposal"]["status"] == "pending"


def test_protected_ip_gets_no_proposal_for_web_incidents(make_app):
    client = connect(make_app(SENTINEL_PROTECTED_IPS="192.0.2.10"))
    incident = send(client, ip="192.0.2.10", count=1, paths=["/decoy"], honeypot=True)["incident"]
    result = client.post(f"/api/incidents/{incident['id']}/analyze").json()
    assert result["proposal"] is None


def test_model_tools_never_see_http_request_events(make_app, script_model):
    bodies = script_model(rounds=[[("get_incident_logs", {"incident_id": "INC-0001"}), ("get_ip_activity", {"ip_address": ATTACKER})]],
                          finals=[analysis()])
    client = connect(make_app())
    send(client, count=50, not_found=2, paths=["/trips"])
    for _ in range(5):
        incident = client.post("/api/events", json=event()).json()["incident"]
    client.post(f"/api/incidents/{incident['id']}/analyze")
    tool_outputs = [json.loads(m["content"]) for body in bodies for m in body["messages"] if m["role"] == "tool"]
    logs = next(o for o in tool_outputs if "untrusted_log_records" in o)["untrusted_log_records"]
    activity = next(o for o in tool_outputs if "total_events" in o)
    assert {r["type"] for r in logs} == {"HTTP_AUTH"} and activity["total_events"] == 5


def test_event_sum_only_accepts_known_columns(tmp_path):
    doc = yaml.safe_load((RULES / "web_scan_not_found.yml").read_text(encoding="utf-8"))
    doc["correlation"]["field"] = "source_ip); DROP TABLE events; --"
    (tmp_path / "bad.yml").write_text(yaml.safe_dump(doc), encoding="utf-8")
    with pytest.raises(ValueError, match="event_sum only supports"):
        RuleSet(tmp_path)
