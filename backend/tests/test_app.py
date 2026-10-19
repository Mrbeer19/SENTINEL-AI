import asyncio
import json
from pathlib import Path

import httpx

from backend.app import create_app


def test_end_to_end_approval_and_verification(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("SENTINEL_DISABLE_OLLAMA", "1")
    async def run():
        app = create_app(tmp_path / "soc.db")
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            before = await client.post("/api/demo/traffic", json={"source_ip": "192.0.2.25"})
            assert before.json()["decision"] == "allowed"
            simulated = await client.post("/api/simulations", json={"scenario": "http_brute_force", "source_ip": "192.0.2.25"})
            assert simulated.status_code == 200
            incident = simulated.json()["incident"]
            assert incident["kind"] == "HTTP_AUTH_BRUTE_FORCE"
            assert len((await client.get("/api/incidents")).json()) == 1
            analyzed = await client.post(f"/api/incidents/{incident['id']}/analyze")
            assert analyzed.status_code == 200
            assert analyzed.json()["analysis_mode"] in {"ollama", "ollama_no_tools", "rule_fallback"}
            proposal = analyzed.json()["proposal"]
            assert proposal["status"] == "pending"
            approved = await client.post(f"/api/proposals/{proposal['id']}/approve", json={"reviewer": "teacher"})
            assert approved.status_code == 200
            after = await client.post("/api/demo/traffic", json={"source_ip": "192.0.2.25"})
            assert after.status_code == 403
            assert after.json()["decision"] == "denied"
            report = (await client.get(f"/api/reports/{incident['id']}")).json()
            assert report["status"] == "verified"
            assert any(item["stage"] == "verification" for item in report["timeline"])
    asyncio.run(run())


def test_policy_repeated_decision_unblock_and_persistence(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("SENTINEL_DISABLE_OLLAMA", "1")
    path = tmp_path / "soc.db"
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app(path)), base_url="http://test") as client:
            for ip in ["192.0.2.10", "127.0.0.1"]:
                result = (await client.post("/api/simulations", json={"scenario": "port_scan", "source_ip": ip})).json()
                incident = (await client.post(f"/api/incidents/{result['incident']['id']}/analyze")).json()
                if ip == "127.0.0.1":
                    assert incident["proposal"] is None and incident["status"] == "needs_review"
                    continue
                proposal_id = incident["proposal"]["id"]
                response = await client.post(f"/api/proposals/{proposal_id}/approve", json={"reviewer": "operator"})
                assert response.status_code == 200
                assert (await client.post(f"/api/proposals/{proposal_id}/approve", json={"reviewer": "operator"})).status_code == 409
                rule = (await client.get("/api/rules")).json()[0]
                assert (await client.delete(f"/api/rules/{rule['id']}")).status_code == 200
                assert (await client.post("/api/demo/traffic", json={"source_ip": ip})).status_code == 200
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app(path)), base_url="http://test") as client:
            assert len((await client.get("/api/incidents")).json()) == 2
            assert not (await client.get("/api/rules")).json()[0]["active"]
    asyncio.run(run())


def test_remote_peer_cannot_spoof_ip_or_manage_without_key(tmp_path: Path):
    async def run():
        app = create_app(tmp_path / "soc.db")
        transport = httpx.ASGITransport(app=app, client=("192.168.1.90", 1234))
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            assert (await client.post("/api/simulations", json={"scenario": "normal"})).status_code == 403
            assert (await client.post("/api/demo/traffic", json={"source_ip": "192.0.2.25"})).status_code == 403
            for _ in range(5):
                assert (await client.post("/api/demo/login", json={"username": "student", "password": "wrong"})).status_code == 401
            assert (await client.get("/api/incidents")).status_code == 403
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as local:
            incident = (await local.get("/api/incidents")).json()[0]
            assert incident["source_ip"] == "192.168.1.90"
            assert incident["kind"] == "HTTP_AUTH_BRUTE_FORCE"
    asyncio.run(run())


def test_threshold_validation_and_duplicate_incidents(tmp_path: Path):
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app(tmp_path / "soc.db")), base_url="http://test") as client:
            bad = {"source_ip": "not-an-ip", "event_type": "HTTP_AUTH", "outcome": "failed"}
            assert (await client.post("/api/events", json=bad)).status_code == 422
            event = {**bad, "source_ip": "192.0.2.44"}
            for _ in range(4):
                assert (await client.post("/api/events", json=event)).json()["incident"] is None
            assert (await client.post("/api/events", json=event)).json()["incident"] is not None
            for _ in range(3):
                await client.post("/api/events", json=event)
            assert len((await client.get("/api/incidents")).json()) == 1
    asyncio.run(run())


def test_model_selected_tool_executes_and_output_is_validated(tmp_path: Path, monkeypatch):
    original = httpx.AsyncClient.post
    async def reply(self, url, **kwargs):
        if str(url).endswith("/api/chat"):
            body = kwargs["json"]
            if "tools" in body:
                called = any(item["role"] == "tool" for item in body["messages"])
                payload = {"role": "assistant", "content": "", "tool_calls": [] if called else [{"function": {"name": "get_incident_logs", "arguments": {"incident_id": "INC-0001"}}}]}
            else:
                payload = {"role": "assistant", "content": json.dumps({"threat_type": "HTTP_AUTH_BRUTE_FORCE", "severity": "HIGH", "confidence": 0.9, "evidence": ["Six failures in the observed records"], "recommended_action": "TEMP_BLOCK_IP", "explanation_th": "ลองรหัสผิดซ้ำ"})}
                tool_outputs = [json.loads(item["content"]) for item in body["messages"] if item["role"] == "tool"]
                assert tool_outputs and all("label" not in record for out in tool_outputs for record in out["untrusted_log_records"])
                assert "format" not in body
            return httpx.Response(200, json={"message": payload}, request=httpx.Request("POST", str(url)))
        return await original(self, url, **kwargs)
    monkeypatch.delenv("SENTINEL_DISABLE_OLLAMA", raising=False)
    monkeypatch.setattr(httpx.AsyncClient, "post", reply)
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app(tmp_path / "soc.db")), base_url="http://test") as client:
            sim = (await client.post("/api/simulations", json={"scenario": "http_brute_force"})).json()
            incident = (await client.post(f"/api/incidents/{sim['incident']['id']}/analyze")).json()
            assert incident["analysis_mode"] == "ollama"
            tools = [t for t in incident["trace"] if t["operation"] == "execute_tool"]
            assert tools[0]["tool"] == "get_incident_logs" and tools[0]["status"] == "ok"
            assert incident["analysis"]["threat_type"] == "HTTP_AUTH_BRUTE_FORCE"
            assert incident["proposal"]["source"] == "model" and incident["proposal"]["target_ip"] == "192.0.2.25"
    asyncio.run(run())


def test_websocket_delivers_real_event(tmp_path: Path):
    from fastapi.testclient import TestClient
    with TestClient(create_app(tmp_path / "soc.db")) as client:
        with client.websocket_connect("/ws") as socket:
            hello = socket.receive_json()
            assert hello["stage"] == "connected" and hello["v"] == 2
            client.post("/api/events", json={"source_ip": "192.0.2.9", "event_type": "HTTP_AUTH", "outcome": "success"})
            message = socket.receive_json()
            assert message["stage"] == "event"
            assert message["payload"]["source_ip"] == "192.0.2.9"


def test_reject_and_normal_traffic(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("SENTINEL_DISABLE_OLLAMA", "1")
    async def run():
        app = create_app(tmp_path / "soc.db")
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            normal = await client.post("/api/simulations", json={"scenario": "normal", "source_ip": "192.0.2.30"})
            assert normal.json()["incident"] is None
            ssh = await client.post("/api/simulations", json={"scenario": "ssh_brute_force_logs", "source_ip": "192.0.2.31"})
            assert ssh.json()["incident"]["kind"] == "SSH_BRUTE_FORCE"
            incident_id = ssh.json()["incident"]["id"]
            analyzed = await client.post(f"/api/incidents/{incident_id}/analyze")
            proposal_id = analyzed.json()["proposal"]["id"]
            rejected = await client.post(f"/api/proposals/{proposal_id}/reject", json={"reviewer": "teacher"})
            assert rejected.status_code == 200
            assert (await client.post("/api/demo/traffic", json={"source_ip": "192.0.2.31"})).json()["decision"] == "allowed"
            assert (await client.get("/api/rules")).json() == []
    asyncio.run(run())
