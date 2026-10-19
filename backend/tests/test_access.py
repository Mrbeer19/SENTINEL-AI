"""Who may call what: localhost and admin-key holders run the SOC; LAN peers only reach the demo endpoints."""

import pytest
from conftest import connect
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

import backend.app as app_module

KEY = "k" * 24
REMOTE = "192.168.1.90"
REVIEW = {"reviewer": "teacher"}

SOC_ROUTES = [
    ("get", "/api/events", None), ("post", "/api/events", {"source_ip": "192.0.2.1", "event_type": "HTTP_AUTH", "outcome": "failed"}),
    ("get", "/api/incidents", None), ("get", "/api/incidents/1", None), ("post", "/api/incidents/1/analyze", None),
    ("get", "/api/proposals", None), ("post", "/api/proposals/1/approve", REVIEW), ("post", "/api/proposals/1/reject", REVIEW),
    ("get", "/api/rules", None), ("delete", "/api/rules/1", None), ("get", "/api/traffic", None),
    ("post", "/api/simulations", {"scenario": "normal"}), ("post", "/api/demo/reset", None), ("get", "/api/metrics", None),
    ("get", "/api/reports/1", None), ("get", "/api/audit", None), ("get", "/api/audit/verify", None),
]


def call(client, method, path, body):
    return getattr(client, method)(path, json=body) if body is not None else getattr(client, method)(path)


@pytest.mark.parametrize("method,path,body", SOC_ROUTES)
def test_remote_peer_without_key_is_refused(make_app, method, path, body):
    response = call(connect(make_app(SENTINEL_ADMIN_KEY=KEY), REMOTE), method, path, body)
    assert response.status_code == 403 and "X-Admin-Key" in response.json()["detail"]


@pytest.mark.parametrize("method,path,body", SOC_ROUTES)
def test_remote_peer_with_key_passes_access_control(make_app, method, path, body):
    response = call(connect(make_app(SENTINEL_ADMIN_KEY=KEY), REMOTE, {"X-Admin-Key": KEY}), method, path, body)
    assert response.status_code != 403


@pytest.mark.parametrize("headers", [{"X-Admin-Key": "wrong"}, {"X-Admin-Key": KEY[:-1]}, {"X-Admin-Key": ""}, {"X-Admin": KEY}])
def test_wrong_or_missing_key_is_refused(make_app, headers):
    assert connect(make_app(SENTINEL_ADMIN_KEY=KEY), REMOTE, headers).get("/api/incidents").status_code == 403


def test_empty_key_setting_never_matches_empty_header(make_app):
    assert connect(make_app(), REMOTE, {"X-Admin-Key": ""}).get("/api/incidents").status_code == 403


@pytest.mark.parametrize("peer", ["127.0.0.1", "::1", "testclient"])
def test_local_peers_need_no_key(make_app, peer):
    assert connect(make_app(), peer).get("/api/incidents").status_code == 200


@pytest.mark.parametrize("method,path,body", [("get", "/api/health", None), ("post", "/api/demo/traffic", {}),
                                               ("post", "/api/demo/login", {"username": "u", "password": "p"})])
def test_public_endpoints_are_open_to_the_lab(make_app, method, path, body):
    assert call(connect(make_app(), REMOTE), method, path, body).status_code in {200, 401}


def test_remote_peer_cannot_fake_its_source_ip(make_app):
    response = connect(make_app(), REMOTE).post("/api/demo/traffic", json={"source_ip": "192.0.2.25"})
    assert response.status_code == 403 and "localhost" in response.json()["detail"]


def test_rate_limit_also_covers_login(make_app):
    client = connect(make_app(SENTINEL_DEMO_RATE_LIMIT="2"), REMOTE)
    codes = [client.post("/api/demo/login", json={"username": "u", "password": "p"}).status_code for _ in range(3)]
    assert codes == [401, 401, 429]


def test_rate_limit_is_per_peer(make_app):
    app = make_app(SENTINEL_DEMO_RATE_LIMIT="2")
    first, second = connect(app, "192.168.1.91"), connect(app, "192.168.1.92")
    assert [first.post("/api/demo/traffic", json={}).status_code for _ in range(3)][-1] == 429
    assert second.post("/api/demo/traffic", json={}).status_code == 200


def test_rate_limit_window_slides(make_app, monkeypatch):
    clock = [1000.0]
    monkeypatch.setattr(app_module.time, "monotonic", lambda: clock[0])
    client = connect(make_app(SENTINEL_DEMO_RATE_LIMIT="2", SENTINEL_DEMO_RATE_WINDOW="10"), REMOTE)
    assert [client.post("/api/demo/traffic", json={}).status_code for _ in range(3)] == [200, 200, 429]
    clock[0] += 11
    assert client.post("/api/demo/traffic", json={}).status_code == 200


def test_local_peers_are_not_rate_limited(make_app):
    client = connect(make_app(SENTINEL_DEMO_RATE_LIMIT="2"))
    assert {client.post("/api/demo/traffic", json={}).status_code for _ in range(10)} == {200}


def test_rate_limited_requests_are_not_recorded(make_app):
    app = make_app(SENTINEL_DEMO_RATE_LIMIT="1")
    remote = connect(app, REMOTE)
    for _ in range(5):
        remote.post("/api/demo/traffic", json={})
    assert len(connect(app).get("/api/traffic").json()) == 1


def test_websocket_accepts_admin_key_from_lan(make_app):
    with TestClient(make_app(SENTINEL_ADMIN_KEY=KEY), client=(REMOTE, 1234), headers={"X-Admin-Key": KEY}) as client:
        with client.websocket_connect("/ws") as socket:
            assert socket.receive_json()["stage"] == "connected"


def test_websocket_refuses_wrong_key(make_app):
    with TestClient(make_app(SENTINEL_ADMIN_KEY=KEY), client=(REMOTE, 1234), headers={"X-Admin-Key": "nope"}) as client:
        with pytest.raises(WebSocketDisconnect), client.websocket_connect("/ws"):
            pass


def test_cors_allows_only_the_dev_dashboard(client):
    allowed = client.options("/api/incidents", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"})
    other = client.options("/api/incidents", headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "GET"})
    assert allowed.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert "access-control-allow-origin" not in other.headers
