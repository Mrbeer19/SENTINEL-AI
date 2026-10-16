"""SENTINEL AI local SOC MVP. Run: uvicorn backend.app:app --reload."""

from __future__ import annotations

import ipaddress
import json
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal

import httpx
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, IPvAnyAddress

ROOT = Path(__file__).resolve().parent
DEFAULT_DB = ROOT / "data" / "sentinel.db"
MODEL = os.getenv("SENTINEL_MODEL", "qwen3.5:4b")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
PROTECTED_IPS = {"127.0.0.1", "::1", "0.0.0.0"}


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class EventIn(BaseModel):
    source_ip: IPvAnyAddress
    event_type: Literal["HTTP_AUTH", "SSH_AUTH", "CONNECTION"]
    outcome: Literal["failed", "success", "attempt"]
    destination_port: int | None = Field(default=None, ge=1, le=65535)
    timestamp: datetime | None = None
    label: Literal["normal", "attack", "unknown"] = "unknown"


class DecisionIn(BaseModel):
    reviewer: str = Field(min_length=2, max_length=80)


class AnalysisOut(BaseModel):
    classification: Literal["HTTP_AUTH_BRUTE_FORCE", "SSH_BRUTE_FORCE", "PORT_SCAN", "UNKNOWN"]
    severity: Literal["low", "medium", "high"]
    summary: str = Field(min_length=1, max_length=2500)
    evidence: list[str] = Field(min_length=1, max_length=10)
    recommendation: str = Field(min_length=1, max_length=1000)


class LoginIn(BaseModel):
    username: str = Field(max_length=80)
    password: str = Field(max_length=120)


class TrafficIn(BaseModel):
    source_ip: IPvAnyAddress | None = None


class SimulationIn(BaseModel):
    scenario: Literal["http_brute_force", "ssh_brute_force_logs", "port_scan", "normal"]
    source_ip: IPvAnyAddress = "192.0.2.25"


def create_app(db_path: str | Path = DEFAULT_DB) -> FastAPI:
    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    api = FastAPI(title="SENTINEL AI", version="0.1.0")
    api.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_methods=["*"], allow_headers=["*"])
    sockets: set[WebSocket] = set()

    @api.middleware("http")
    async def restrict_remote_management(request: Request, call_next):
        peer = request.client.host if request.client else ""
        demo = request.url.path in {"/api/demo/login", "/api/demo/traffic"}
        if request.url.path.startswith("/api/") and request.method in {"POST", "PUT", "DELETE", "PATCH"} and not demo and peer not in {"127.0.0.1", "::1", "testclient"}:
            expected = os.getenv("SENTINEL_ADMIN_KEY", "")
            provided = request.headers.get("X-Admin-Key", "")
            if not expected or not secrets.compare_digest(expected, provided):
                return JSONResponse({"detail": "Remote management requires X-Admin-Key"}, status_code=403)
        return await call_next(request)

    def db():
        con = sqlite3.connect(db_path, timeout=10)
        con.row_factory = sqlite3.Row
        con.execute("PRAGMA foreign_keys=ON")
        return con

    with db() as con:
        con.executescript("""
        CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, timestamp TEXT NOT NULL, source_ip TEXT NOT NULL, event_type TEXT NOT NULL, outcome TEXT NOT NULL, destination_port INTEGER, label TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS incidents (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, source_ip TEXT NOT NULL, status TEXT NOT NULL, severity TEXT NOT NULL, event_count INTEGER NOT NULL, created_at TEXT NOT NULL, analysis TEXT, analysis_mode TEXT);
        CREATE TABLE IF NOT EXISTS traces (id INTEGER PRIMARY KEY, incident_id INTEGER NOT NULL, tool TEXT NOT NULL, input TEXT NOT NULL, output TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS proposals (id INTEGER PRIMARY KEY, incident_id INTEGER UNIQUE NOT NULL, source_ip TEXT NOT NULL, action TEXT NOT NULL, duration_seconds INTEGER NOT NULL, status TEXT NOT NULL, reviewer TEXT, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS rules (id INTEGER PRIMARY KEY, proposal_id INTEGER NOT NULL, source_ip TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS traffic (id INTEGER PRIMARY KEY, source_ip TEXT NOT NULL, decision TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS timeline (id INTEGER PRIMARY KEY, incident_id INTEGER, stage TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
        """)

    def rows(sql: str, params=()) -> list[dict]:
        with db() as con:
            return [dict(row) for row in con.execute(sql, params).fetchall()]

    def one(sql: str, params=()) -> dict | None:
        found = rows(sql, params)
        return found[0] if found else None

    def log(con, incident_id: int | None, stage: str, detail: str):
        con.execute("INSERT INTO timeline(incident_id,stage,detail,created_at) VALUES(?,?,?,?)", (incident_id, stage, detail, utcnow()))

    async def broadcast(stage: str, payload: dict):
        stale = []
        for socket in tuple(sockets):
            try:
                await socket.send_json({"stage": stage, "payload": payload})
            except Exception:
                stale.append(socket)
        for socket in stale:
            sockets.discard(socket)

    def detect(con, event: EventIn) -> dict | None:
        ip = str(event.source_ip)
        cutoff = (datetime.now(timezone.utc) - timedelta(seconds=60)).isoformat(timespec="seconds")
        kind = None
        count = 0
        if event.event_type in {"HTTP_AUTH", "SSH_AUTH"} and event.outcome == "failed":
            count = con.execute("SELECT COUNT(*) FROM events WHERE source_ip=? AND event_type=? AND outcome='failed' AND timestamp>=?", (ip, event.event_type, cutoff)).fetchone()[0]
            if count >= 5:
                kind = "HTTP_AUTH_BRUTE_FORCE" if event.event_type == "HTTP_AUTH" else "SSH_BRUTE_FORCE"
        elif event.event_type == "CONNECTION":
            count = con.execute("SELECT COUNT(DISTINCT destination_port) FROM events WHERE source_ip=? AND event_type='CONNECTION' AND timestamp>=?", (ip, cutoff)).fetchone()[0]
            if count >= 8:
                kind = "PORT_SCAN"
        if not kind:
            return None
        current = con.execute("SELECT * FROM incidents WHERE source_ip=? AND kind=? AND status != 'closed' ORDER BY id DESC LIMIT 1", (ip, kind)).fetchone()
        if current:
            con.execute("UPDATE incidents SET event_count=? WHERE id=?", (count, current["id"]))
            return dict(con.execute("SELECT * FROM incidents WHERE id=?", (current["id"],)).fetchone())
        cur = con.execute("INSERT INTO incidents(kind,source_ip,status,severity,event_count,created_at) VALUES(?,?,?,?,?,?)", (kind, ip, "detected", "high", count, utcnow()))
        log(con, cur.lastrowid, "detected", f"{kind}: {count} events from {ip}")
        return dict(con.execute("SELECT * FROM incidents WHERE id=?", (cur.lastrowid,)).fetchone())

    async def ingest(event: EventIn) -> dict:
        stamp = event.timestamp or datetime.now(timezone.utc)
        if stamp.tzinfo is None:
            raise HTTPException(422, "timestamp must include timezone")
        if stamp > datetime.now(timezone.utc) + timedelta(minutes=5):
            raise HTTPException(422, "timestamp is in the future")
        with db() as con:
            cur = con.execute("INSERT INTO events(timestamp,source_ip,event_type,outcome,destination_port,label) VALUES(?,?,?,?,?,?)", (stamp.isoformat(timespec="seconds"), str(event.source_ip), event.event_type, event.outcome, event.destination_port, event.label))
            incident = detect(con, event)
            result = dict(con.execute("SELECT * FROM events WHERE id=?", (cur.lastrowid,)).fetchone())
        await broadcast("event", result)
        if incident:
            await broadcast("incident", incident)
        return {"event": result, "incident": incident}

    @api.get("/api/health")
    async def health():
        model_ready = False
        try:
            async with httpx.AsyncClient(timeout=2) as client:
                response = await client.get(f"{OLLAMA_URL}/api/tags")
                model_ready = response.is_success and any(item.get("name", "").split(":")[0] == MODEL.split(":")[0] and (item.get("name") == MODEL or MODEL.endswith(":latest")) for item in response.json().get("models", []))
        except (httpx.HTTPError, ValueError):
            pass
        return {"status": "ok", "model": MODEL, "model_ready": model_ready, "ai_mode": "ollama" if model_ready else "rule_fallback"}

    @api.post("/api/events", status_code=201)
    async def add_event(event: EventIn):
        return await ingest(event)

    @api.get("/api/events")
    def list_events(limit: int = 100):
        return rows("SELECT * FROM events ORDER BY id DESC LIMIT ?", (min(max(limit, 1), 500),))

    @api.get("/api/incidents")
    def list_incidents():
        return rows("SELECT * FROM incidents ORDER BY id DESC")

    @api.get("/api/incidents/{incident_id}")
    def get_incident(incident_id: int):
        incident = one("SELECT * FROM incidents WHERE id=?", (incident_id,))
        if not incident:
            raise HTTPException(404, "incident not found")
        incident["trace"] = rows("SELECT * FROM traces WHERE incident_id=? ORDER BY id", (incident_id,))
        incident["timeline"] = rows("SELECT * FROM timeline WHERE incident_id=? ORDER BY id", (incident_id,))
        incident["proposal"] = one("SELECT * FROM proposals WHERE incident_id=?", (incident_id,))
        return incident

    async def call_model(messages: list[dict], tools: list[dict] | None = None, schema: dict | None = None) -> dict:
        if os.getenv("SENTINEL_DISABLE_OLLAMA") == "1":
            raise httpx.ConnectError("Ollama disabled for isolated tests")
        body = {"model": MODEL, "messages": messages, "stream": False, "think": False, "options": {"temperature": 0, "num_ctx": 4096}}
        if tools:
            body["tools"] = tools
        if schema:
            body["format"] = schema
        async with httpx.AsyncClient(timeout=90) as client:
            response = await client.post(f"{OLLAMA_URL}/api/chat", json=body)
            response.raise_for_status()
            return response.json()["message"]

    @api.post("/api/incidents/{incident_id}/analyze")
    async def analyze(incident_id: int):
        incident = one("SELECT * FROM incidents WHERE id=?", (incident_id,))
        if not incident:
            raise HTTPException(404, "incident not found")
        if incident["analysis"]:
            return get_incident(incident_id)
        tools = [
            {"type": "function", "function": {"name": "get_recent_events", "description": "Read recent security events for this incident source IP", "parameters": {"type": "object", "properties": {}, "required": []}}},
            {"type": "function", "function": {"name": "get_active_rules", "description": "Read active firewall simulator rules for this source IP", "parameters": {"type": "object", "properties": {}, "required": []}}},
        ]
        messages = [
            {"role": "system", "content": "You are a local SOC analyst. Use the provided read-only tools to inspect evidence. Never execute shell commands or claim a firewall block happened. Keep recommendations grounded in returned records."},
            {"role": "user", "content": f"Investigate incident {incident_id}, type {incident['kind']}, source {incident['source_ip']}. Call tools first, then summarize evidence, classification, severity and a temporary block recommendation."},
        ]
        mode = "ollama"
        analysis = ""
        try:
            reply = await call_model(messages, tools=tools)
            messages.append(reply)
            for call in reply.get("tool_calls", [])[:3]:
                name = call.get("function", {}).get("name")
                if name == "get_recent_events":
                    output = rows("SELECT id,timestamp,source_ip,event_type,outcome,destination_port FROM events WHERE source_ip=? ORDER BY id DESC LIMIT 30", (incident["source_ip"],))
                elif name == "get_active_rules":
                    output = rows("SELECT * FROM rules WHERE source_ip=? AND expires_at>? ORDER BY id DESC", (incident["source_ip"], utcnow()))
                else:
                    continue
                with db() as con:
                    con.execute("INSERT INTO traces(incident_id,tool,input,output,created_at) VALUES(?,?,?,?,?)", (incident_id, name, json.dumps({"source_ip": incident["source_ip"]}), json.dumps(output, ensure_ascii=False), utcnow()))
                messages.append({"role": "tool", "tool_name": name, "content": json.dumps(output, ensure_ascii=False)})
            if not reply.get("tool_calls"):
                mode = "ollama_no_tools"
            messages.append({"role": "user", "content": "Return a JSON object with classification, severity, summary, evidence (array of strings), and recommendation. Do not claim approval or blocking occurred."})
            final = await call_model(messages, schema=AnalysisOut.model_json_schema())
            validated = AnalysisOut.model_validate_json(final.get("content", ""))
            analysis = validated.model_dump_json()
        except (httpx.HTTPError, KeyError, ValueError):
            mode = "rule_fallback"
            evidence = rows("SELECT id,timestamp,source_ip,event_type,outcome,destination_port FROM events WHERE source_ip=? ORDER BY id DESC LIMIT 30", (incident["source_ip"],))
            analysis = f"Rule fallback: {incident['kind']} from {incident['source_ip']}; {len(evidence)} recent events inspected. Local model was unavailable. Recommend human review before temporary app-level block."
            with db() as con:
                con.execute("INSERT INTO traces(incident_id,tool,input,output,created_at) VALUES(?,?,?,?,?)", (incident_id, "get_recent_events", json.dumps({"source_ip": incident["source_ip"]}), json.dumps(evidence, ensure_ascii=False), utcnow()))
        with db() as con:
            con.execute("UPDATE incidents SET analysis=?,analysis_mode=?,status='awaiting_approval' WHERE id=?", (analysis, mode, incident_id))
            con.execute("INSERT OR IGNORE INTO proposals(incident_id,source_ip,action,duration_seconds,status,created_at) VALUES(?,?,?,?,?,?)", (incident_id, incident["source_ip"], "TEMP_BLOCK_IP", 600, "pending", utcnow()))
            log(con, incident_id, "analysis", f"{mode}: {analysis[:200]}")
            log(con, incident_id, "proposal", "TEMP_BLOCK_IP for 600 seconds; pending human approval")
        result = get_incident(incident_id)
        await broadcast("analysis", result)
        return result

    @api.get("/api/proposals")
    def list_proposals():
        return rows("SELECT * FROM proposals ORDER BY id DESC")

    @api.post("/api/proposals/{proposal_id}/approve")
    async def approve(proposal_id: int, decision: DecisionIn):
        proposal = one("SELECT * FROM proposals WHERE id=?", (proposal_id,))
        if not proposal:
            raise HTTPException(404, "proposal not found")
        if proposal["status"] != "pending":
            raise HTTPException(409, "proposal already decided")
        if proposal["source_ip"] in PROTECTED_IPS or ipaddress.ip_address(proposal["source_ip"]).is_loopback:
            raise HTTPException(400, "protected IP cannot be blocked")
        with db() as con:
            changed = con.execute("UPDATE proposals SET status='approved',reviewer=? WHERE id=? AND status='pending'", (decision.reviewer, proposal_id))
            if changed.rowcount != 1:
                raise HTTPException(409, "proposal already decided")
            expires = (datetime.now(timezone.utc) + timedelta(seconds=proposal["duration_seconds"])).isoformat(timespec="seconds")
            con.execute("INSERT INTO rules(proposal_id,source_ip,expires_at,created_at) VALUES(?,?,?,?)", (proposal_id, proposal["source_ip"], expires, utcnow()))
            con.execute("UPDATE incidents SET status='blocked' WHERE id=?", (proposal["incident_id"],))
            log(con, proposal["incident_id"], "approved", f"{decision.reviewer} approved temporary block")
            log(con, proposal["incident_id"], "firewall", f"App-level rule active until {expires}")
        result = get_incident(proposal["incident_id"])
        await broadcast("approval", result)
        return result

    @api.post("/api/proposals/{proposal_id}/reject")
    async def reject(proposal_id: int, decision: DecisionIn):
        proposal = one("SELECT * FROM proposals WHERE id=?", (proposal_id,))
        if not proposal:
            raise HTTPException(404, "proposal not found")
        if proposal["status"] != "pending":
            raise HTTPException(409, "proposal already decided")
        with db() as con:
            changed = con.execute("UPDATE proposals SET status='rejected',reviewer=? WHERE id=? AND status='pending'", (decision.reviewer, proposal_id))
            if changed.rowcount != 1:
                raise HTTPException(409, "proposal already decided")
            con.execute("UPDATE incidents SET status='rejected' WHERE id=?", (proposal["incident_id"],))
            log(con, proposal["incident_id"], "rejected", f"{decision.reviewer} rejected proposal")
        result = get_incident(proposal["incident_id"])
        await broadcast("approval", result)
        return result

    @api.get("/api/rules")
    def list_rules():
        return [{**row, "active": row["expires_at"] > utcnow()} for row in rows("SELECT * FROM rules ORDER BY id DESC")]

    @api.delete("/api/rules/{rule_id}")
    async def unblock(rule_id: int):
        rule = one("SELECT * FROM rules WHERE id=?", (rule_id,))
        if not rule:
            raise HTTPException(404, "rule not found")
        with db() as con:
            con.execute("UPDATE rules SET expires_at=? WHERE id=?", (utcnow(), rule_id))
            proposal = con.execute("SELECT incident_id FROM proposals WHERE id=?", (rule["proposal_id"],)).fetchone()
            log(con, proposal["incident_id"], "unblocked", f"Rule {rule_id} disabled by operator")
        await broadcast("firewall", {"rule_id": rule_id, "active": False})
        return {"rule_id": rule_id, "active": False}

    @api.post("/api/demo/login")
    async def demo_login(login: LoginIn, request: Request):
        peer = request.client.host if request.client else "127.0.0.1"
        traffic = await demo_traffic(TrafficIn(), request)
        if traffic.status_code == 403:
            return traffic
        success = login.username == "student" and login.password == "sentinel-demo"
        result = await ingest(EventIn(source_ip=peer, event_type="HTTP_AUTH", outcome="success" if success else "failed"))
        return JSONResponse({"authenticated": success, "source_ip": peer, "event_id": result["event"]["id"]}, status_code=200 if success else 401)

    @api.post("/api/demo/traffic")
    async def demo_traffic(traffic: TrafficIn, request: Request):
        peer = request.client.host if request.client else "127.0.0.1"
        # Source override is only for local, controlled lab simulation.
        if traffic.source_ip and peer not in {"127.0.0.1", "::1", "testclient"}:
            raise HTTPException(403, "source override requires localhost")
        source = str(traffic.source_ip) if traffic.source_ip else peer
        rule = one("SELECT * FROM rules WHERE source_ip=? AND expires_at>? ORDER BY id DESC LIMIT 1", (source, utcnow()))
        decision = "denied" if rule else "allowed"
        with db() as con:
            con.execute("INSERT INTO traffic(source_ip,decision,created_at) VALUES(?,?,?)", (source, decision, utcnow()))
            if rule:
                proposal = con.execute("SELECT incident_id FROM proposals WHERE id=?", (rule["proposal_id"],)).fetchone()
                con.execute("UPDATE incidents SET status='verified' WHERE id=?", (proposal["incident_id"],))
                log(con, proposal["incident_id"], "verification", f"New request from {source} denied by rule {rule['id']}")
        result = {"source_ip": source, "decision": decision, "rule_id": rule["id"] if rule else None}
        await broadcast("traffic", result)
        if rule:
            await broadcast("verification", result)
        return JSONResponse(result, status_code=403 if rule else 200)

    @api.get("/api/traffic")
    def list_traffic():
        return rows("SELECT * FROM traffic ORDER BY id DESC LIMIT 100")

    @api.post("/api/simulations")
    async def simulate(sim: SimulationIn):
        ip = str(sim.source_ip)
        if sim.scenario == "http_brute_force":
            samples = [("HTTP_AUTH", "failed", None)] * 6
        elif sim.scenario == "ssh_brute_force_logs":
            samples = [("SSH_AUTH", "failed", None)] * 6
        elif sim.scenario == "port_scan":
            samples = [("CONNECTION", "attempt", port) for port in range(8000, 8009)]
        else:
            samples = [("HTTP_AUTH", "success", None), ("CONNECTION", "attempt", 443)]
        result = None
        for kind, outcome, port in samples:
            result = await ingest(EventIn(source_ip=ip, event_type=kind, outcome=outcome, destination_port=port, label="normal" if sim.scenario == "normal" else "attack"))
        return {"scenario": sim.scenario, "events_created": len(samples), "incident": result["incident"] if result else None, "source_note": "Synthetic log replay; not a live SSH attack" if sim.scenario == "ssh_brute_force_logs" else "Controlled app-level simulation"}

    @api.get("/api/metrics")
    def metrics():
        events = rows("SELECT * FROM events")
        incidents = rows("SELECT * FROM incidents")
        predicted = {row["source_ip"] for row in incidents}
        actual = {row["source_ip"] for row in events if row["label"] == "attack"}
        tp, fp, fn = len(predicted & actual), len(predicted - actual), len(actual - predicted)
        precision = tp / (tp + fp) if tp + fp else 0
        recall = tp / (tp + fn) if tp + fn else 0
        return {"events": len(events), "incidents": len(incidents), "precision": precision, "recall": recall, "f1": 2 * precision * recall / (precision + recall) if precision + recall else 0, "note": "Exploratory source-IP metric only; use held-out labeled dataset for final evaluation"}

    @api.get("/api/reports/{incident_id}")
    def report(incident_id: int):
        incident = get_incident(incident_id)
        incident["events"] = rows("SELECT * FROM events WHERE source_ip=? ORDER BY id", (incident["source_ip"],))
        incident["traffic"] = rows("SELECT * FROM traffic WHERE source_ip=? ORDER BY id", (incident["source_ip"],))
        return incident

    @api.websocket("/ws")
    async def websocket(socket: WebSocket):
        await socket.accept()
        sockets.add(socket)
        try:
            await socket.send_json({"stage": "connected", "payload": {"message": "Refetch current state after reconnect"}})
            while True:
                await socket.receive_text()
        except WebSocketDisconnect:
            sockets.discard(socket)

    dashboard = ROOT.parent / "frontend" / "dist"
    if dashboard.exists():
        api.mount("/", StaticFiles(directory=dashboard, html=True), name="dashboard")
    return api


app = create_app()
