"""Shared fixtures. Every test runs without a real Ollama unless it scripts one with `script_model`."""

import json
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.app import create_app

ATTACKER = "192.0.2.25"


@pytest.fixture(autouse=True)
def isolated_env(monkeypatch):
    for name in ("SENTINEL_MODEL", "SENTINEL_OLLAMA_FORMAT", "SENTINEL_OLLAMA_TIMEOUT", "SENTINEL_ADMIN_KEY", "SENTINEL_PROTECTED_IPS",
                 "SENTINEL_PROMPT_PATH", "SENTINEL_RULES_DIR", "SENTINEL_DEMO_RATE_LIMIT", "SENTINEL_DEMO_RATE_WINDOW",
                 "SENTINEL_ALLOWED_HOSTS", "SENTINEL_ENABLE_DEMO"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("SENTINEL_DISABLE_OLLAMA", "1")
    monkeypatch.setenv("OLLAMA_URL", "http://127.0.0.1:9")  # closed port: a stray real call fails fast
    monkeypatch.setenv("SENTINEL_ALLOWED_HOSTS", "testserver,test")  # Host of TestClient / httpx base_url in tests
    monkeypatch.setenv("SENTINEL_ENABLE_DEMO", "1")  # Legacy lab scenarios are isolated to test databases.


@pytest.fixture
def make_app(tmp_path, monkeypatch):
    """make_app(**env) → app on a fresh DB in tmp_path. Same tmp_path DB across calls (restart simulation)."""
    def make(db_name="soc.db", **env):
        for key, value in env.items():
            monkeypatch.setenv(key, value)
        return create_app(tmp_path / db_name)
    return make


def connect(app, peer="testclient", headers=None) -> TestClient:
    return TestClient(app, client=(peer, 1234), headers=headers or {})


@pytest.fixture
def client(make_app):
    return connect(make_app())


def analysis(**overrides):
    base = {"threat_type": "HTTP_AUTH_BRUTE_FORCE", "severity": "HIGH", "confidence": 0.9, "evidence": ["6 failed logins in 60 s"],
            "recommended_action": "TEMP_BLOCK_IP", "explanation_th": "ลองรหัสผิดซ้ำ"}
    return {**base, **overrides}


@pytest.fixture
def script_model(monkeypatch):
    """script_model(rounds=[[(tool, args), ...], ...], finals=[...]) scripts Ollama and returns the list of request bodies sent.

    rounds[i] is the tool calls returned in tool round i (missing rounds → no calls). finals are the 6-key analyses
    the run should end with, one per threat_analysis answer: the analyst gets it minus recommended_action, and the
    defense planner then answers that recommended_action. A string is sent as-is; an Exception is raised.
    plans, when given, are the planner's raw answers in order instead (str or dict).
    """
    def install(rounds=(), finals=(), status=200, plans=None):
        rounds, finals, bodies, last = list(rounds), list(finals), [], {}
        plans = None if plans is None else list(plans)

        async def reply(self, url, **kwargs):
            body = kwargs["json"]
            bodies.append(body)
            if status != 200:
                return httpx.Response(status, json={"error": "boom"}, request=httpx.Request("POST", str(url)))
            if "tools" in body:
                done = sum(1 for m in body["messages"] if m["role"] == "assistant")
                calls = [{"function": {"name": n, "arguments": a}} for n, a in (rounds[done] if done < len(rounds) else [])]
                payload = {"role": "assistant", "content": "", "tool_calls": calls}
            elif "recommended_action, reason" in body["messages"][-1]["content"]:  # defense planner
                plan = plans.pop(0) if plans is not None else {"recommended_action": last.get("recommended_action", "TEMP_BLOCK_IP"), "reason": "scripted plan"}
                if isinstance(plan, Exception):
                    raise plan
                payload = {"role": "assistant", "content": plan if isinstance(plan, str) else json.dumps(plan)}
            else:  # threat analyst
                final = finals.pop(0)
                if isinstance(final, Exception):
                    raise final
                if isinstance(final, dict):
                    last.update(final)
                    final = json.dumps({k: v for k, v in final.items() if k != "recommended_action"})
                payload = {"role": "assistant", "content": final}
            return httpx.Response(200, json={"message": payload}, request=httpx.Request("POST", str(url)))

        monkeypatch.delenv("SENTINEL_DISABLE_OLLAMA", raising=False)
        monkeypatch.setattr(httpx.AsyncClient, "post", reply)
        return bodies
    return install


def event(ip=ATTACKER, event_type="HTTP_AUTH", outcome="failed", **extra):
    return {"source_ip": ip, "event_type": event_type, "outcome": outcome, **extra}


def at(seconds_ago: float) -> str:
    return (datetime.now(timezone.utc) - timedelta(seconds=seconds_ago)).replace(microsecond=0).isoformat()


def simulate(client, scenario="http_brute_force", ip=ATTACKER) -> dict:
    return client.post("/api/simulations", json={"scenario": scenario, "source_ip": ip}).json()["incident"]


def blocked_incident(client, ip=ATTACKER) -> dict:
    """Simulate → analyze (rule fallback) → approve. Returns the incident detail in status `blocked`."""
    incident = simulate(client, ip=ip)
    proposal = client.post(f"/api/incidents/{incident['id']}/analyze").json()["proposal"]
    return client.post(f"/api/proposals/{proposal['id']}/approve", json={"reviewer": "teacher"}).json()
