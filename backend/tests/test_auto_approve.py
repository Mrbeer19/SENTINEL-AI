"""SENTINEL_AUTO_APPROVE=1: honeypot, scanner paths and CRITICAL floods are blocked without a human; everything else still waits."""

import pytest
from conftest import ATTACKER, connect, event

from backend import policy


def web(client, ip=ATTACKER, **extra):
    response = client.post("/api/events", json={"source_ip": ip, "event_type": "HTTP_REQUEST", "window_s": 10, **extra})
    assert response.status_code == 201, response.text
    return response.json()["incident"]


def honeypot(client, ip=ATTACKER):
    return web(client, ip=ip, count=1, paths=["/admin-backup.zip"], honeypot=True)


def analyze(client, incident):
    return client.post(f"/api/incidents/{incident['id']}/analyze").json()


@pytest.fixture
def auto(make_app):
    return connect(make_app(SENTINEL_AUTO_APPROVE="1"))


def test_off_by_default_honeypot_waits_for_a_human(client):
    result = analyze(client, honeypot(client))
    assert result["status"] == "awaiting_approval" and result["proposal"]["status"] == "pending"


@pytest.mark.parametrize("extra", [
    {"count": 1, "paths": ["/admin-backup.zip"], "honeypot": True},
    {"count": 3, "paths": ["/.env", "/.git/config", "/wp-admin/setup.php"]},
    {"count": 900},  # 3 × the 300 threshold → CRITICAL
])
def test_auto_rules_block_without_a_human(auto, extra):
    result = analyze(auto, web(auto, **extra))
    proposal = result["proposal"]
    assert result["status"] == "blocked" and proposal["status"] == "approved"
    assert proposal["reviewer"] == policy.AUTO_APPROVER and proposal["action"] == "TEMP_BLOCK_IP" and proposal["duration_seconds"] == 600
    assert auto.post("/api/demo/traffic", json={"source_ip": ATTACKER}).status_code == 403
    entries = auto.get("/api/audit").json()
    assert any(e["actor"] == policy.AUTO_APPROVER and e["action"] == "rule_applied" for e in entries)


@pytest.mark.parametrize("extra", [
    {"count": 300},  # MEDIUM flood
    {"count": 10, "not_found": 10},  # 404 scan: broken links look the same
])
def test_other_web_detections_still_wait(auto, extra):
    result = analyze(auto, web(auto, **extra))
    assert result["status"] == "awaiting_approval" and result["proposal"]["status"] == "pending"


def test_login_brute_force_still_waits(auto):
    for _ in range(5):
        incident = auto.post("/api/events", json=event()).json()["incident"]
    result = analyze(auto, incident)
    assert result["status"] == "awaiting_approval" and result["proposal"]["status"] == "pending"


def test_pending_flood_is_blocked_once_it_turns_critical(auto):
    result = analyze(auto, web(auto, count=300))
    assert result["proposal"]["status"] == "pending"
    incident = web(auto, count=600)
    assert incident["severity"] == "CRITICAL" and incident["status"] == "blocked"
    assert auto.get(f"/api/incidents/{incident['id']}").json()["proposal"]["reviewer"] == policy.AUTO_APPROVER


def test_protected_ip_is_never_auto_blocked(make_app):
    client = connect(make_app(SENTINEL_AUTO_APPROVE="1", SENTINEL_PROTECTED_IPS="192.0.2.10"))
    result = analyze(client, honeypot(client, ip="192.0.2.10"))
    assert result["proposal"] is None and client.get("/api/rules").json() == []


def test_auto_block_is_temporary_even_with_manual_unblock(make_app):
    client = connect(make_app(SENTINEL_AUTO_APPROVE="1", SENTINEL_MANUAL_UNBLOCK="1"))
    result = analyze(client, honeypot(client))
    assert result["proposal"]["duration_seconds"] == 600
    assert not client.get("/api/rules").json()[0]["expires_at"].startswith("9999-")


def test_hourly_limit_falls_back_to_a_human(auto):
    ips = [f"192.0.2.{100 + n}" for n in range(policy.AUTO_LIMIT_PER_HOUR + 1)]
    results = [analyze(auto, honeypot(auto, ip=ip)) for ip in ips]
    assert all(r["status"] == "blocked" for r in results[:-1])
    last = results[-1]
    assert last["status"] == "awaiting_approval" and last["proposal"]["status"] == "pending"
    assert any("limit" in step["detail"] for step in last["timeline"])
    approved = auto.post(f"/api/proposals/{last['proposal']['id']}/approve", json={"reviewer": "teacher"}).json()
    assert approved["status"] == "blocked"
