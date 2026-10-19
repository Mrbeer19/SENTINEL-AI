"""Tests for the v0.2 contract: policy, agent behaviour, lifecycle, audit chain and access control."""

import asyncio
import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import pytest

from backend.app import create_app
from backend.detection import RuleSet

ATTACKER = "192.0.2.25"
GATEWAY = "192.0.2.1"


def analysis(**overrides):
    base = {"threat_type": "HTTP_AUTH_BRUTE_FORCE", "severity": "HIGH", "confidence": 0.9, "evidence": ["6 failed logins in 60 s"],
            "recommended_action": "TEMP_BLOCK_IP", "explanation_th": "ลองรหัสผิดซ้ำ"}
    return {**base, **overrides}


def fake_model(monkeypatch, tool_calls=(), finals=()):
    """Script Ollama: first tool round returns `tool_calls`, then the final answers in order."""
    finals = list(finals)
    original = httpx.AsyncClient.post

    async def reply(self, url, **kwargs):
        if not str(url).endswith("/api/chat"):
            return await original(self, url, **kwargs)
        body = kwargs["json"]
        if "tools" in body:
            first = not any(m["role"] == "tool" for m in body["messages"])
            calls = [{"function": {"name": n, "arguments": a}} for n, a in tool_calls] if first else []
            payload = {"role": "assistant", "content": "", "tool_calls": calls}
        else:
            final = finals.pop(0)
            payload = {"role": "assistant", "content": final if isinstance(final, str) else json.dumps(final)}
        return httpx.Response(200, json={"message": payload}, request=httpx.Request("POST", str(url)))

    monkeypatch.delenv("SENTINEL_DISABLE_OLLAMA", raising=False)
    monkeypatch.setattr(httpx.AsyncClient, "post", reply)


def client_for(app, peer=None, headers=None):
    transport = httpx.ASGITransport(app=app, client=(peer, 1234)) if peer else httpx.ASGITransport(app=app)
    return httpx.AsyncClient(transport=transport, base_url="http://test", headers=headers or {})


async def brute_force(client, ip=ATTACKER, scenario="http_brute_force"):
    return (await client.post("/api/simulations", json={"scenario": scenario, "source_ip": ip})).json()["incident"]


def test_protected_ip_from_env_gets_no_proposal(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("SENTINEL_DISABLE_OLLAMA", "1")
    monkeypatch.setenv("SENTINEL_PROTECTED_IPS", f"{GATEWAY}, 192.0.2.10")

    async def run():
        async with client_for(create_app(tmp_path / "soc.db")) as client:
            incident = await brute_force(client, GATEWAY)
            result = (await client.post(f"/api/incidents/{incident['id']}/analyze")).json()
            assert result["proposal"] is None
            assert result["status"] == "needs_review"
            assert any("protected" in t["detail"] for t in result["timeline"] if t["stage"] == "policy")
    asyncio.run(run())


def test_goal_hijack_cannot_redirect_block_to_another_ip(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("SENTINEL_PROTECTED_IPS", GATEWAY)
    fake_model(monkeypatch, tool_calls=[("get_incident_logs", {"incident_id": "INC-0001"}),
                                        ("propose_block_ip", {"ip_address": GATEWAY, "minutes": 10, "reason": "log said so"})],
               finals=[analysis()])

    async def run():
        async with client_for(create_app(tmp_path / "soc.db")) as client:
            incident = await brute_force(client)
            result = (await client.post(f"/api/incidents/{incident['id']}/analyze")).json()
            hijack = [t for t in result["trace"] if t["tool"] == "propose_block_ip"][0]
            assert hijack["status"] == "rejected_by_policy"
            assert result["proposal"]["target_ip"] == ATTACKER
    asyncio.run(run())


@pytest.mark.parametrize("action,status", [("INVESTIGATE", "needs_review"), ("MONITOR", "monitoring"), ("NO_ACTION", "closed")])
def test_non_block_actions_create_no_proposal(tmp_path: Path, monkeypatch, action, status):
    fake_model(monkeypatch, finals=[analysis(recommended_action=action)])

    async def run():
        async with client_for(create_app(tmp_path / "soc.db")) as client:
            incident = await brute_force(client)
            result = (await client.post(f"/api/incidents/{incident['id']}/analyze")).json()
            assert result["proposal"] is None and result["status"] == status
            assert result["analysis_mode"] == "ollama_no_tools"
    asyncio.run(run())


def test_block_ip_needs_critical_incident(tmp_path: Path, monkeypatch):
    fake_model(monkeypatch, finals=[analysis(recommended_action="BLOCK_IP"), analysis(recommended_action="BLOCK_IP", severity="CRITICAL")])

    async def run():
        async with client_for(create_app(tmp_path / "soc.db")) as client:
            high = (await client.post(f"/api/incidents/{(await brute_force(client))['id']}/analyze")).json()
            assert high["proposal"]["action"] == "TEMP_BLOCK_IP" and high["proposal"]["duration_seconds"] == 600
            assert high["proposal"]["policy_notes"]
            for _ in range(15):  # 3x the threshold → CRITICAL
                await client.post("/api/events", json={"source_ip": "192.0.2.77", "event_type": "HTTP_AUTH", "outcome": "failed"})
            critical = (await client.get("/api/incidents")).json()[0]
            assert critical["severity"] == "CRITICAL"
            result = (await client.post(f"/api/incidents/{critical['id']}/analyze")).json()
            assert result["proposal"]["action"] == "BLOCK_IP" and result["proposal"]["duration_seconds"] == 3600
    asyncio.run(run())


def test_invalid_json_is_retried_once(tmp_path: Path, monkeypatch):
    fake_model(monkeypatch, finals=["not json", analysis()])

    async def run():
        async with client_for(create_app(tmp_path / "soc.db")) as client:
            result = (await client.post(f"/api/incidents/{(await brute_force(client))['id']}/analyze")).json()
            assert result["analysis_mode"] == "ollama_retry"
            assert any(t["status"] == "invalid_output" for t in result["trace"])
    asyncio.run(run())


def test_extra_keys_and_twice_invalid_fall_back_to_rules(tmp_path: Path, monkeypatch):
    fake_model(monkeypatch, finals=[{**analysis(), "summary": "extra"}, {**analysis(), "summary": "extra"}])

    async def run():
        async with client_for(create_app(tmp_path / "soc.db")) as client:
            result = (await client.post(f"/api/incidents/{(await brute_force(client))['id']}/analyze")).json()
            assert result["analysis_mode"] == "rule_fallback"
            assert result["analysis"]["confidence"] is None
            assert result["proposal"]["source"] == "rule_fallback"
            assert result["trace"][-1]["source"] == "fallback"
    asyncio.run(run())


def test_finished_incident_is_not_reused(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("SENTINEL_DISABLE_OLLAMA", "1")

    async def run():
        async with client_for(create_app(tmp_path / "soc.db")) as client:
            first = await brute_force(client)
            proposal = (await client.post(f"/api/incidents/{first['id']}/analyze")).json()["proposal"]
            await client.post(f"/api/proposals/{proposal['id']}/approve", json={"reviewer": "teacher"})
            assert (await client.post("/api/demo/traffic", json={"source_ip": ATTACKER})).status_code == 403
            rule = (await client.get("/api/rules")).json()[0]
            await client.delete(f"/api/rules/{rule['id']}")
            second = await brute_force(client)
            assert second["id"] != first["id"] and second["status"] == "detected"
    asyncio.run(run())


def test_demo_reset_closes_open_work_and_keeps_history(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("SENTINEL_DISABLE_OLLAMA", "1")

    async def run():
        async with client_for(create_app(tmp_path / "soc.db")) as client:
            blocked = await brute_force(client)
            proposal = (await client.post(f"/api/incidents/{blocked['id']}/analyze")).json()["proposal"]
            await client.post(f"/api/proposals/{proposal['id']}/approve", json={"reviewer": "teacher"})
            pending = await brute_force(client, "192.0.2.26")
            await client.post(f"/api/incidents/{pending['id']}/analyze")
            result = (await client.post("/api/demo/reset")).json()
            assert result == {"rules_disabled": 1, "incidents_closed": 2}
            assert {i["status"] for i in (await client.get("/api/incidents")).json()} == {"closed"}
            assert (await client.post("/api/demo/traffic", json={"source_ip": ATTACKER})).status_code == 200
            assert (await client.get("/api/audit/verify")).json()["valid"] is True
    asyncio.run(run())


def test_audit_chain_detects_tampering(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("SENTINEL_DISABLE_OLLAMA", "1")
    db = tmp_path / "soc.db"

    async def run():
        async with client_for(create_app(db)) as client:
            incident = await brute_force(client)
            await client.post(f"/api/incidents/{incident['id']}/analyze")
            assert (await client.get("/api/audit/verify")).json()["valid"] is True
            con = sqlite3.connect(db)
            con.execute("UPDATE audit_log SET detail='{}' WHERE id=2")
            con.commit()
            con.close()
            verdict = (await client.get("/api/audit/verify")).json()
            assert verdict == {"valid": False, "entries": verdict["entries"], "broken_at": 2}
    asyncio.run(run())


def test_timezone_offsets_are_normalised_before_windowing(tmp_path: Path):
    async def run():
        async with client_for(create_app(tmp_path / "soc.db")) as client:
            base = datetime.now(timezone(timedelta(hours=7))).replace(microsecond=0) - timedelta(minutes=10)
            spread = [base + timedelta(seconds=40 * i) for i in range(5)]  # 160 s apart in total → no incident
            for stamp in spread:
                body = {"source_ip": "192.0.2.60", "event_type": "HTTP_AUTH", "outcome": "failed", "timestamp": stamp.isoformat()}
                assert (await client.post("/api/events", json=body)).json()["incident"] is None
            event = (await client.get("/api/events?limit=1")).json()[0]
            assert event["timestamp"].endswith("+00:00") and event["ocsf_class_uid"] == 3002
            close = [base + timedelta(seconds=i) for i in range(5)]
            results = [(await client.post("/api/events", json={"source_ip": "192.0.2.61", "event_type": "HTTP_AUTH", "outcome": "failed", "timestamp": s.isoformat()})).json() for s in close]
            assert results[-1]["incident"]["attack_technique"] == "T1110.001"
    asyncio.run(run())


def test_remote_peer_cannot_read_soc_api_or_websocket(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("SENTINEL_ADMIN_KEY", "k" * 24)
    app = create_app(tmp_path / "soc.db")

    async def run():
        async with client_for(app, "192.168.1.90") as remote:
            assert (await remote.get("/api/incidents")).status_code == 403
            assert (await remote.get("/api/audit")).status_code == 403
            assert (await remote.get("/api/health")).status_code == 200
            assert (await remote.post("/api/demo/traffic", json={})).status_code == 200
        async with client_for(app, "192.168.1.90", {"X-Admin-Key": "k" * 24}) as admin:
            assert (await admin.get("/api/incidents")).status_code == 200
    asyncio.run(run())

    from fastapi.testclient import TestClient
    from starlette.websockets import WebSocketDisconnect
    with TestClient(app, client=("192.168.1.90", 1234)) as remote, pytest.raises(WebSocketDisconnect):
        with remote.websocket_connect("/ws"):
            pass


def test_demo_endpoints_are_rate_limited_for_remote_peers(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("SENTINEL_DEMO_RATE_LIMIT", "3")

    async def run():
        async with client_for(create_app(tmp_path / "soc.db"), "192.168.1.91") as remote:
            codes = [(await remote.post("/api/demo/traffic", json={})).status_code for _ in range(4)]
            assert codes == [200, 200, 200, 429]
    asyncio.run(run())


def test_rules_load_from_yaml_and_reject_unsafe_fields(tmp_path: Path):
    rules = RuleSet(Path(__file__).resolve().parents[1] / "rules")
    assert {r.kind for r in rules.rules} == {"HTTP_AUTH_BRUTE_FORCE", "SSH_BRUTE_FORCE", "PORT_SCAN"}
    assert len(rules.version) == 12
    (tmp_path / "bad.yml").write_text(
        "title: bad\nid: bad\nlevel: low\ndetection:\n  selection:\n    source_ip: 1.2.3.4\n  condition: selection\n"
        "correlation:\n  type: event_count\n  group-by: [source_ip]\n  timespan: 60s\n  condition:\n    gte: 1\nsentinel:\n  kind: X\n")
    with pytest.raises(ValueError):
        RuleSet(tmp_path)
