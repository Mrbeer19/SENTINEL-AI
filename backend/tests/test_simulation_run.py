"""Paced simulations: start / stop / state (spec I. Start / Stop API, Simulation State)."""

import time

from conftest import ATTACKER
from fastapi.testclient import TestClient

FAST = {"scenario": "http_brute_force", "source_ip": ATTACKER, "interval_ms": 50}


def wait_until_done(client, timeout=10):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        state = client.get("/api/simulations/state").json()
        if not state["running"]:
            return state
        time.sleep(0.05)
    raise AssertionError("simulation did not finish")


def test_idle_state(make_app):
    with TestClient(make_app()) as client:
        state = client.get("/api/simulations/state").json()
        assert state["running"] is False and state["sent"] == 0 and state["scenario"] is None


def test_paced_run_sends_every_event_and_opens_the_incident(make_app):
    with TestClient(make_app()) as client:
        started = client.post("/api/simulations/start", json=FAST)
        assert started.status_code == 202 and started.json()["running"] is True and started.json()["total"] == 6
        state = wait_until_done(client)
        assert state["sent"] == 6 and state["stopped"] is False and state["finished_at"]
        incident = client.get("/api/incidents").json()[0]
        assert state["incident_ids"] == [incident["id"]] and incident["kind"] == "HTTP_AUTH_BRUTE_FORCE"


def test_events_arrive_spread_over_time(make_app):
    with TestClient(make_app()) as client:
        client.post("/api/simulations/start", json={**FAST, "interval_ms": 200})
        time.sleep(0.3)
        assert 0 < client.get("/api/simulations/state").json()["sent"] < 6
        wait_until_done(client)


def test_only_one_run_at_a_time(make_app):
    with TestClient(make_app()) as client:
        client.post("/api/simulations/start", json={**FAST, "interval_ms": 1000})
        assert client.post("/api/simulations/start", json=FAST).status_code == 409
        client.post("/api/simulations/stop")


def test_stop_ends_the_run_early(make_app):
    with TestClient(make_app()) as client:
        client.post("/api/simulations/start", json={**FAST, "interval_ms": 1000})
        state = client.post("/api/simulations/stop").json()
        assert state["running"] is False and state["stopped"] is True and state["sent"] < 6
        assert len(client.get("/api/events").json()) == state["sent"]


def test_stop_when_idle_is_harmless(make_app):
    with TestClient(make_app()) as client:
        assert client.post("/api/simulations/stop").json()["running"] is False


def test_interval_bounds(make_app):
    with TestClient(make_app()) as client:
        assert client.post("/api/simulations/start", json={**FAST, "interval_ms": 10}).status_code == 422
        assert client.post("/api/simulations/start", json={**FAST, "interval_ms": 20_000}).status_code == 422


def test_progress_is_broadcast(make_app):
    with TestClient(make_app()) as client:
        with client.websocket_connect("/ws") as socket:
            socket.receive_json()
            client.post("/api/simulations/start", json=FAST)
            seen = []
            while True:
                message = socket.receive_json()
                if message["stage"] == "simulation":
                    seen.append(message["payload"])
                    if not message["payload"]["running"]:
                        break
        assert seen[-1]["sent"] == 6 and [p["sent"] for p in seen[:6]] == [1, 2, 3, 4, 5, 6]
