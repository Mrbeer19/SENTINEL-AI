"""SENTINEL_AUTO_APPROVE=1: honeypot, scanner paths and CRITICAL floods are blocked without a human; everything else still waits."""

from datetime import datetime, timedelta, timezone

import pytest
from conftest import ATTACKER, at, connect, event

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
    assert honeypot(client)["status"] == "detected"
    result = analyze(client, honeypot(client))
    assert result["status"] == "awaiting_approval" and result["proposal"]["status"] == "pending"


@pytest.mark.parametrize("extra", [
    {"count": 1, "paths": ["/admin-backup.zip"], "honeypot": True},
    {"count": 3, "paths": ["/.env", "/.git/config", "/wp-admin/setup.php"]},
    {"count": 900},  # 3 × the 300 threshold → CRITICAL
])
def test_auto_rules_block_without_a_human(auto, extra):
    incident = web(auto, **extra)
    assert incident["status"] == "blocked"  # blocked during ingest, without waiting for the analysis worker
    result = auto.get(f"/api/incidents/{incident['id']}").json()
    assert result["analysis_mode"] == "rule_fallback" and "ต้องให้คนตรวจ" not in result["analysis"]["explanation_th"]
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


def test_scan_whose_paths_also_404_is_still_auto_blocked(auto):
    # A real scanner gets 404 on /.env: the 404 rule matches first and opens the WEB_SCAN incident.
    incident = web(auto, count=10, not_found=10, paths=["/.env", "/.git/config", "/wp-admin/setup.php"])
    assert incident["rule_id"] == "sentinel-web-scan-paths" and incident["status"] == "blocked"


def test_pending_404_scan_is_auto_blocked_when_scanner_paths_follow(auto):
    result = analyze(auto, web(auto, count=10, not_found=10))
    assert result["rule_id"] == "sentinel-web-scan-not-found" and result["proposal"]["status"] == "pending"
    incident = web(auto, count=3, paths=["/.env", "/.git/config", "/wp-admin/setup.php"])
    assert incident["id"] == result["id"] and incident["status"] == "blocked"


def test_404_scan_keeps_its_rule_when_auto_approve_is_off(client):
    incident = web(client, count=10, not_found=10, paths=["/.env", "/.git/config", "/wp-admin/setup.php"])
    assert incident["status"] == "detected" and incident["rule_id"] == "sentinel-web-scan-not-found"


def test_admin_acknowledges_an_automatic_block_once(auto):
    result = analyze(auto, honeypot(auto))
    proposal = result["proposal"]
    assert proposal["acknowledged_at"] is None
    acked = auto.post(f"/api/proposals/{proposal['id']}/acknowledge", json={"reviewer": "admin"}).json()
    assert acked["proposal"]["acknowledged_by"] == "admin" and acked["proposal"]["acknowledged_at"]
    assert any(step["stage"] == "acknowledged" for step in acked["timeline"])
    assert any(e["actor"] == "admin" and e["action"] == "auto_block_acknowledged" for e in auto.get("/api/audit").json())
    assert auto.post(f"/api/proposals/{proposal['id']}/acknowledge", json={"reviewer": "admin"}).status_code == 409
    assert auto.get("/api/audit/verify").json()["valid"] is True


def test_only_automatic_blocks_can_be_acknowledged(auto):
    pending = analyze(auto, web(auto, count=300))["proposal"]
    assert auto.post(f"/api/proposals/{pending['id']}/acknowledge", json={"reviewer": "admin"}).status_code == 409
    human = auto.post(f"/api/proposals/{pending['id']}/approve", json={"reviewer": "admin"}).json()["proposal"]
    assert auto.post(f"/api/proposals/{human['id']}/acknowledge", json={"reviewer": "admin"}).status_code == 409
    assert auto.post("/api/proposals/9999/acknowledge", json={"reviewer": "admin"}).status_code == 404


def test_unblocked_scan_is_not_counted_again(auto):
    # Rehearsal: scan → auto block → admin unblocks → the next ordinary request re-counted the old paths and re-blocked.
    incident = web(auto, count=12, not_found=12, paths=["/.env", "/.git/config", "/wp-admin/setup.php"], timestamp=at(30))
    assert incident["status"] == "blocked"
    rule = auto.get("/api/rules").json()[0]
    assert auto.delete(f"/api/rules/{rule['id']}").status_code == 200
    assert web(auto, count=1) is None
    assert auto.post("/api/demo/traffic", json={"source_ip": ATTACKER}).status_code == 200
    assert len(auto.get("/api/incidents").json()) == 1


def test_new_scan_after_unblock_is_still_detected(auto):
    web(auto, count=12, not_found=12, paths=["/.env", "/.git/config", "/wp-admin/setup.php"], timestamp=at(30))
    auto.delete(f"/api/rules/{auto.get('/api/rules').json()[0]['id']}")
    again = web(auto, count=3, paths=["/.env", "/.git/HEAD", "/wp-login.php"])
    assert again is not None and again["status"] == "blocked" and len(auto.get("/api/incidents").json()) == 2


def window_end(seconds_ahead):
    return (datetime.now(timezone.utc) + timedelta(seconds=seconds_ahead)).replace(microsecond=0).isoformat()


def test_unblock_with_bridge_window_end_timestamps(auto):
    # From the review of #48: the bridge stamps HTTP_REQUEST totals with the END of its 10 s window (up to 10 s ahead),
    # so a time floor taken from the server clock still re-counted the old scan.
    incident = web(auto, count=12, not_found=12, paths=["/.env", "/.git/config", "/wp-admin/setup.php"], timestamp=window_end(8))
    assert incident["status"] == "blocked"
    auto.post("/api/demo/traffic", json={"source_ip": ATTACKER})  # 403 -> verified
    auto.delete(f"/api/rules/{auto.get('/api/rules').json()[0]['id']}")
    assert web(auto, count=1, timestamp=window_end(8)) is None
