"""Policy matrix (the only gate between a model suggestion and a proposal) and protected-IP configuration."""

import pytest
from conftest import ATTACKER, connect, simulate

from backend import policy
from backend.config import ALWAYS_PROTECTED, load_settings, parse_ips

NONE = frozenset()


def incident(ip=ATTACKER, severity="HIGH"):
    return {"source_ip": ip, "severity": severity}


@pytest.mark.parametrize("action", ["NO_ACTION", "MONITOR", "INVESTIGATE", "DROP_TABLE", ""])
def test_only_block_actions_are_accepted(action):
    decision = policy.evaluate(action, ATTACKER, incident(), NONE)
    assert not decision.allowed and "not a block action" in decision.notes[0]


@pytest.mark.parametrize("target", ["", "999.1.1.1", "attacker", "192.0.2.0/24", "192.0.2.25 ", None])
def test_target_must_be_a_single_valid_ip(target):
    assert not policy.evaluate("TEMP_BLOCK_IP", target, incident(), NONE).allowed


def test_target_must_be_the_incident_source():
    decision = policy.evaluate("TEMP_BLOCK_IP", "192.0.2.99", incident(), NONE)
    assert not decision.allowed and "not the incident source" in decision.notes[0]


@pytest.mark.parametrize("ip", ["127.0.0.1", "127.0.0.53", "::1", "0.0.0.0", "::", "224.0.0.1", "ff02::1"])
def test_loopback_unspecified_and_multicast_are_always_protected(ip):
    decision = policy.evaluate("TEMP_BLOCK_IP", ip, incident(ip), NONE)
    assert not decision.allowed and "protected" in decision.notes[0]


def test_configured_protected_ip_is_refused():
    assert not policy.evaluate("BLOCK_IP", "192.0.2.1", incident("192.0.2.1", "CRITICAL"), frozenset({"192.0.2.1"})).allowed


@pytest.mark.parametrize("action,severity,final,seconds,noted", [
    ("TEMP_BLOCK_IP", "LOW", "TEMP_BLOCK_IP", 600, False),
    ("TEMP_BLOCK_IP", "MEDIUM", "TEMP_BLOCK_IP", 600, False),
    ("TEMP_BLOCK_IP", "HIGH", "TEMP_BLOCK_IP", 600, False),
    ("TEMP_BLOCK_IP", "CRITICAL", "TEMP_BLOCK_IP", 600, False),
    ("BLOCK_IP", "LOW", "TEMP_BLOCK_IP", 600, True),
    ("BLOCK_IP", "MEDIUM", "TEMP_BLOCK_IP", 600, True),
    ("BLOCK_IP", "HIGH", "TEMP_BLOCK_IP", 600, True),
    ("BLOCK_IP", "CRITICAL", "BLOCK_IP", 3600, False),
])
def test_action_severity_matrix(action, severity, final, seconds, noted):
    decision = policy.evaluate(action, ATTACKER, incident(severity=severity), NONE)
    assert decision.allowed and decision.action == final and decision.duration_seconds == seconds
    assert bool(decision.notes) is noted


def test_ipv6_target_is_normalised_before_comparing():
    assert policy.evaluate("TEMP_BLOCK_IP", "2001:DB8:0::1", incident("2001:db8::1"), NONE).allowed


# ---- configuration ----

def test_parse_ips_normalises_and_skips_blanks():
    assert parse_ips(" 192.0.2.1, ,2001:DB8::1,") == frozenset({"192.0.2.1", "2001:db8::1"})


@pytest.mark.parametrize("raw", ["192.0.2.300", "gateway", "192.0.2.0/24"])
def test_parse_ips_fails_loudly_on_bad_entries(raw):
    with pytest.raises(ValueError):
        parse_ips(raw)


def test_loopback_is_protected_even_with_empty_env():
    assert ALWAYS_PROTECTED <= load_settings().protected_ips


def test_app_refuses_to_start_with_bad_protected_ips(make_app):
    with pytest.raises(ValueError):
        make_app(SENTINEL_PROTECTED_IPS="not-an-ip")


def test_approval_rechecks_policy_after_config_change(make_app):
    """IP became protected between proposal and approval (e.g. restart with new env) → approval refused, no rule."""
    client = connect(make_app())
    proposal = client.post(f"/api/incidents/{simulate(client)['id']}/analyze").json()["proposal"]
    client = connect(make_app(SENTINEL_PROTECTED_IPS=ATTACKER))
    response = client.post(f"/api/proposals/{proposal['id']}/approve", json={"reviewer": "teacher"})
    assert response.status_code == 400 and "protected" in response.json()["detail"]
    assert client.get("/api/rules").json() == []
    assert client.get("/api/proposals").json()[0]["status"] == "pending"
