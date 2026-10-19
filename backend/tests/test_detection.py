"""Detection rules: thresholds, windows, grouping, severity escalation and rule-file validation."""

from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from conftest import ATTACKER, at, connect, event

from backend.detection import RuleSet, _timespan

RULES = Path(__file__).resolve().parents[1] / "rules"


def send(client, count, **kwargs):
    return [client.post("/api/events", json=event(**kwargs)).json() for _ in range(count)]


@pytest.mark.parametrize("event_type,kind", [("HTTP_AUTH", "HTTP_AUTH_BRUTE_FORCE"), ("SSH_AUTH", "SSH_BRUTE_FORCE")])
def test_auth_rules_fire_exactly_at_threshold(client, event_type, kind):
    results = send(client, 5, event_type=event_type)
    assert [r["incident"] is None for r in results] == [True, True, True, True, False]
    assert results[-1]["incident"]["kind"] == kind and results[-1]["incident"]["event_count"] == 5


@pytest.mark.parametrize("event_type", ["HTTP_AUTH", "SSH_AUTH"])
def test_successful_logins_never_count(client, event_type):
    assert all(r["incident"] is None for r in send(client, 12, event_type=event_type, outcome="success"))


def test_port_scan_fires_at_eight_distinct_ports(client):
    results = [client.post("/api/events", json=event(event_type="CONNECTION", outcome="attempt", destination_port=p)).json() for p in range(1, 9)]
    assert all(r["incident"] is None for r in results[:7])
    assert results[7]["incident"]["kind"] == "PORT_SCAN" and results[7]["incident"]["event_count"] == 8


def test_port_scan_counts_distinct_ports_not_connections(client):
    for _ in range(20):
        assert client.post("/api/events", json=event(event_type="CONNECTION", outcome="attempt", destination_port=443)).json()["incident"] is None


def test_connections_without_port_do_not_make_a_scan(client):
    assert all(r["incident"] is None for r in send(client, 10, event_type="CONNECTION", outcome="attempt"))


def test_counts_are_grouped_per_source_ip(client):
    send(client, 3, ip="192.0.2.1")
    assert all(r["incident"] is None for r in send(client, 3, ip="192.0.2.2"))


def test_http_and_ssh_failures_are_counted_separately(client):
    send(client, 3, event_type="HTTP_AUTH")
    assert all(r["incident"] is None for r in send(client, 3, event_type="SSH_AUTH"))


@pytest.mark.parametrize("gap,fires", [(60, True), (61, False)])
def test_window_is_sixty_seconds_inclusive(client, gap, fires):
    base = datetime.now(timezone.utc).replace(microsecond=0) - timedelta(seconds=10)  # one clock read: no drift
    client.post("/api/events", json=event(timestamp=(base - timedelta(seconds=gap)).isoformat()))
    results = [client.post("/api/events", json=event(timestamp=base.isoformat())).json() for _ in range(4)]
    assert (results[-1]["incident"] is not None) is fires


def test_out_of_order_old_event_does_not_count_future_events(client):
    send(client, 4)  # now
    late = client.post("/api/events", json=event(timestamp=at(300))).json()
    assert late["incident"] is None  # its own window ends 5 minutes ago


@pytest.mark.parametrize("count,severity", [(14, "HIGH"), (15, "CRITICAL")])
def test_brute_force_escalates_to_critical_at_three_times_threshold(client, count, severity):
    send(client, count)
    assert client.get("/api/incidents").json()[0]["severity"] == severity


@pytest.mark.parametrize("ports,severity", [(23, "MEDIUM"), (24, "CRITICAL")])
def test_port_scan_escalates_to_critical(client, ports, severity):
    for port in range(1, ports + 1):
        client.post("/api/events", json=event(event_type="CONNECTION", outcome="attempt", destination_port=port))
    assert client.get("/api/incidents").json()[0]["severity"] == severity


def test_critical_never_downgrades_on_open_incident(make_app):
    client = connect(make_app())
    send(client, 15)
    incident = client.get("/api/incidents").json()[0]
    assert incident["severity"] == "CRITICAL"
    # Push the burst out of the window: new events now count low, but the open incident stays CRITICAL.
    for _ in range(5):
        client.post("/api/events", json=event(timestamp=at(200)))
    assert client.get(f"/api/incidents/{incident['id']}").json()["severity"] == "CRITICAL"


def test_further_events_update_the_open_incident(client):
    send(client, 8)
    incidents = client.get("/api/incidents").json()
    assert len(incidents) == 1 and incidents[0]["event_count"] == 8


def test_different_kinds_from_one_ip_are_separate_incidents(client):
    send(client, 5)
    for port in range(1, 9):
        client.post("/api/events", json=event(event_type="CONNECTION", outcome="attempt", destination_port=port))
    assert sorted(i["kind"] for i in client.get("/api/incidents").json()) == ["HTTP_AUTH_BRUTE_FORCE", "PORT_SCAN"]


@pytest.mark.parametrize("scenario,rule_id,technique", [
    ("http_brute_force", "sentinel-http-auth-bruteforce", "T1110.001"),
    ("ssh_brute_force_logs", "sentinel-ssh-auth-bruteforce", "T1110.001"),
    ("port_scan", "sentinel-port-scan", "T1046"),
])
def test_incident_carries_rule_id_and_attack_technique(client, scenario, rule_id, technique):
    incident = client.post("/api/simulations", json={"scenario": scenario, "source_ip": ATTACKER}).json()["incident"]
    assert incident["rule_id"] == rule_id and incident["attack_technique"] == technique


def test_incident_creation_is_audited_with_rules_version(client):
    send(client, 5)
    entry = [a for a in client.get("/api/audit").json() if a["action"] == "incident_created"][0]
    assert entry["actor"] == "detection" and RuleSet(RULES).version in entry["detail"]


# ---- suspicious login (success after failures) ----

def kinds(client):
    return sorted(i["kind"] for i in client.get("/api/incidents").json())


@pytest.mark.parametrize("event_type", ["HTTP_AUTH", "SSH_AUTH"])
@pytest.mark.parametrize("failures,opens", [(4, False), (5, True)])
def test_success_after_failures_opens_suspicious_login(client, event_type, failures, opens):
    send(client, failures, event_type=event_type)
    result = client.post("/api/events", json=event(event_type=event_type, outcome="success")).json()
    assert (result["incident"] is not None and result["incident"]["kind"] == "SUSPICIOUS_LOGIN") is opens


def test_suspicious_login_keeps_the_brute_force_incident(client):
    send(client, 9)
    client.post("/api/events", json=event(outcome="success"))
    assert kinds(client) == ["HTTP_AUTH_BRUTE_FORCE", "SUSPICIOUS_LOGIN"]


def test_failures_on_another_channel_do_not_count(client):
    send(client, 6, event_type="SSH_AUTH")
    assert client.post("/api/events", json=event(event_type="HTTP_AUTH", outcome="success")).json()["incident"] is None


def test_failures_outside_the_window_do_not_count(client):
    base = datetime.now(timezone.utc).replace(microsecond=0) - timedelta(seconds=10)
    for _ in range(5):
        client.post("/api/events", json=event(timestamp=(base - timedelta(seconds=61)).isoformat()))
    assert client.post("/api/events", json=event(outcome="success", timestamp=base.isoformat())).json()["incident"] is None


def test_suspicious_login_technique_and_rule(client):
    send(client, 5)
    incident = client.post("/api/events", json=event(outcome="success")).json()["incident"]
    assert incident["rule_id"] == "sentinel-suspicious-login" and incident["attack_technique"] == "T1078"


def test_demo_login_success_after_brute_force_is_flagged(make_app):
    app = make_app()
    remote = connect(app, peer="192.168.1.50")
    for _ in range(5):
        remote.post("/api/demo/login", json={"username": "student", "password": "wrong"})
    assert remote.post("/api/demo/login", json={"username": "student", "password": "sentinel-demo"}).status_code == 200
    assert kinds(connect(app)) == ["HTTP_AUTH_BRUTE_FORCE", "SUSPICIOUS_LOGIN"]


# ---- rule files ----

@pytest.mark.parametrize("text,seconds", [("30s", 30), ("5m", 300), ("1h", 3600)])
def test_timespan_parses(text, seconds):
    assert _timespan(text).total_seconds() == seconds


@pytest.mark.parametrize("text", ["60", "1d", "s", "-5s", "1.5m", ""])
def test_timespan_rejects_bad_values(text):
    with pytest.raises(ValueError):
        _timespan(text)


def rule_text(selection="event_type: HTTP_AUTH", correlation="type: event_count\n  group-by: [source_ip]", tags="", level="low"):
    return (f"title: t\nid: t\nlevel: {level}\n{tags}detection:\n  selection:\n    {selection}\n  condition: selection\n"
            f"correlation:\n  {correlation}\n  timespan: 60s\n  condition:\n    gte: 2\nsentinel:\n  kind: X\n")


@pytest.mark.parametrize("bad", [
    rule_text(selection="username: admin"),
    rule_text(correlation="type: temporal\n  group-by: [source_ip]"),
    rule_text(correlation="type: event_count\n  group-by: [username]"),
    rule_text(correlation="type: value_count\n  field: username\n  group-by: [source_ip]"),
    rule_text(level="extreme"),
])
def test_unsafe_or_unsupported_rule_files_are_refused(tmp_path, bad):
    (tmp_path / "bad.yml").write_text(bad)
    with pytest.raises((ValueError, KeyError)):
        RuleSet(tmp_path)


def test_empty_rules_dir_is_refused(tmp_path):
    with pytest.raises(ValueError, match="no detection rules"):
        RuleSet(tmp_path)


def test_rule_without_attack_tag_has_no_technique(tmp_path):
    (tmp_path / "r.yml").write_text(rule_text())
    assert RuleSet(tmp_path).rules[0].attack_technique is None


def test_rules_version_changes_with_rule_content(tmp_path):
    (tmp_path / "r.yml").write_text(rule_text())
    before = RuleSet(tmp_path).version
    (tmp_path / "r.yml").write_text(rule_text(level="high"))
    assert RuleSet(tmp_path).version != before


def test_custom_rules_dir_drives_detection(tmp_path, make_app):
    rules = tmp_path / "rules"
    rules.mkdir()
    (rules / "r.yml").write_text(rule_text())
    client = connect(make_app(SENTINEL_RULES_DIR=str(rules)))
    results = send(client, 2)
    assert results[0]["incident"] is None and results[1]["incident"]["kind"] == "X"


@pytest.mark.parametrize("connections,fires", [(99, False), (100, True)])
def test_connection_flood_opens_traffic_anomaly(client, connections, fires):
    for _ in range(connections):
        client.post("/api/events", json=event(event_type="CONNECTION", outcome="attempt", destination_port=443))
    assert ("TRAFFIC_ANOMALY" in kinds(client)) is fires and "PORT_SCAN" not in kinds(client)
