"""POST /api/enforce: the hook a real server's reverse proxy calls to block the same IPs the SOC approved."""

import pytest
from conftest import ATTACKER, blocked_incident, connect

KEY = "k" * 24
REMOTE = "192.168.1.90"


def test_enforce_denies_a_blocked_ip(client):
    blocked_incident(client, ip=ATTACKER)
    res = client.post("/api/enforce", json={"client_ip": ATTACKER})
    assert res.status_code == 403
    assert res.json()["decision"] == "denied" and res.json()["rule_id"] is not None


def test_enforce_allows_an_unblocked_ip(client):
    blocked_incident(client, ip=ATTACKER)
    res = client.post("/api/enforce", json={"client_ip": "192.0.2.77"})
    assert res.status_code == 200 and res.json()["decision"] == "allowed"


def test_enforce_stores_only_denied_requests(client):
    blocked_incident(client, ip=ATTACKER)
    count = lambda: len(client.get("/api/traffic").json())
    before = count()
    client.post("/api/enforce", json={"client_ip": "192.0.2.77"})
    assert count() == before
    client.post("/api/enforce", json={"client_ip": ATTACKER})
    assert count() == before + 1


def test_enforce_verifies_the_incident(client):
    incident = blocked_incident(client, ip=ATTACKER)
    assert client.get(f"/api/incidents/{incident['id']}").json()["status"] == "blocked"
    client.post("/api/enforce", json={"client_ip": ATTACKER})
    assert client.get(f"/api/incidents/{incident['id']}").json()["status"] == "verified"


def test_enforce_is_refused_from_remote_without_admin_key(make_app):
    res = connect(make_app(SENTINEL_ADMIN_KEY=KEY), REMOTE).post("/api/enforce", json={"client_ip": ATTACKER})
    assert res.status_code == 403 and "X-Admin-Key" in res.json()["detail"]


def test_enforce_works_from_a_trusted_proxy_with_admin_key(make_app):
    app = make_app(SENTINEL_ADMIN_KEY=KEY)
    blocked_incident(connect(app), ip=ATTACKER)
    proxy = connect(app, REMOTE, {"X-Admin-Key": KEY})
    assert proxy.post("/api/enforce", json={"client_ip": ATTACKER}).status_code == 403
    assert proxy.post("/api/enforce", json={"client_ip": "192.0.2.77"}).status_code == 200
