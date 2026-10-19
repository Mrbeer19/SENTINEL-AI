"""SENTINEL AI local SOC backend. Run: uvicorn backend.app:app --reload."""

from __future__ import annotations

import json
import secrets
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal

import httpx
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, IPvAnyAddress

from backend import policy, soc
from backend.agent import Agent
from backend.config import LOCAL_PEERS, ROOT, load_settings
from backend.detection import Match, RuleSet
from backend.store import Store, audit, utcnow, verify_audit

DEFAULT_DB = ROOT / "data" / "sentinel.db"
API_VERSION = "0.2.0"
WS_VERSION = 2

TERMINAL = {"verified", "rejected", "closed"}
TRANSITIONS = {
    "detected": {"analyzing", "closed"},
    "analyzing": {"awaiting_approval", "needs_review", "monitoring", "closed"},
    "awaiting_approval": {"blocked", "rejected", "closed"},
    "blocked": {"verified", "closed"},
    "needs_review": {"closed"},
    "monitoring": {"closed"},
}
ACTION_STATUS = {"INVESTIGATE": "needs_review", "MONITOR": "monitoring", "NO_ACTION": "closed"}
PUBLIC_PATHS = {"/api/health", "/api/demo/login", "/api/demo/traffic"}
RATE_LIMITED = {"/api/demo/login", "/api/demo/traffic"}
OCSF_CLASS = {"HTTP_AUTH": 3002, "SSH_AUTH": 3002, "CONNECTION": 4001}  # Authentication / Network Activity


class EventIn(BaseModel):
    source_ip: IPvAnyAddress
    event_type: Literal["HTTP_AUTH", "SSH_AUTH", "CONNECTION"]
    outcome: Literal["failed", "success", "attempt"]
    destination_port: int | None = Field(default=None, ge=1, le=65535)
    timestamp: datetime | None = None
    label: Literal["normal", "attack", "unknown"] = "unknown"
    username: str | None = Field(default=None, max_length=80)


class DecisionIn(BaseModel):
    reviewer: str = Field(min_length=2, max_length=80)


class LoginIn(BaseModel):
    username: str = Field(max_length=80)
    password: str = Field(max_length=120)


class TrafficIn(BaseModel):
    source_ip: IPvAnyAddress | None = None


class SimulationIn(BaseModel):
    scenario: Literal["http_brute_force", "ssh_brute_force_logs", "port_scan", "normal"]
    source_ip: IPvAnyAddress = "192.0.2.25"


def clean_username(value: str | None) -> str | None:
    """Attacker-controlled text: keep printable characters only, never the password."""
    if not value:
        return None
    return "".join(ch for ch in value if ch.isprintable())[:80] or None


def create_app(db_path: str | Path = DEFAULT_DB) -> FastAPI:
    settings = load_settings()
    store = Store(db_path)
    ruleset = RuleSet(settings.rules_dir)
    agent = Agent(settings, store)
    api = FastAPI(title="SENTINEL AI", version=API_VERSION)
    api.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_methods=["*"], allow_headers=["*"])
    sockets: set[WebSocket] = set()
    hits: dict[str, deque] = defaultdict(deque)

    def trusted(peer: str, headers) -> bool:
        provided = headers.get("X-Admin-Key", "")
        return peer in LOCAL_PEERS or bool(settings.admin_key and secrets.compare_digest(settings.admin_key, provided))

    @api.middleware("http")
    async def access_control(request: Request, call_next):
        peer = request.client.host if request.client else ""
        path = request.url.path
        if not trusted(peer, request.headers):
            if path.startswith("/api/") and path not in PUBLIC_PATHS:
                return JSONResponse({"detail": "Remote access to the SOC API requires X-Admin-Key"}, status_code=403)
            if path in RATE_LIMITED:
                now, window = time.monotonic(), hits[peer]
                while window and now - window[0] > settings.demo_rate_window_s:
                    window.popleft()
                if len(window) >= settings.demo_rate_limit:
                    return JSONResponse({"detail": "Too many demo requests; slow down"}, status_code=429)
                window.append(now)
        return await call_next(request)

    def log(con, incident_id: int | None, stage: str, detail: str):
        con.execute("INSERT INTO timeline(incident_id,stage,detail,created_at) VALUES(?,?,?,?)", (incident_id, stage, detail, utcnow()))

    def transition(con, incident_id: int, to: str, actor: str, reason: str) -> None:
        current = con.execute("SELECT status FROM incidents WHERE id=?", (incident_id,)).fetchone()["status"]
        if to not in TRANSITIONS.get(current, set()):
            raise HTTPException(409, f"incident cannot move from {current} to {to}")
        con.execute("UPDATE incidents SET status=?, updated_at=? WHERE id=?", (to, utcnow(), incident_id))
        audit(con, actor, "status_changed", incident_id, {"from": current, "to": to, "reason": reason})

    async def broadcast(stage: str, payload: dict):
        message = {"v": WS_VERSION, "stage": stage, "ts": utcnow(), "payload": payload}
        for socket in tuple(sockets):
            try:
                await socket.send_json(message)
            except Exception:
                sockets.discard(socket)

    def format_proposal(row: dict | None) -> dict | None:
        if not row:
            return None
        return {**row, "target_ip": row["target_ip"] or row["source_ip"], "policy_notes": json.loads(row["policy_notes"] or "[]")}

    def format_incident(row: dict) -> dict:
        return {**row, "analysis": json.loads(row["analysis"]) if row["analysis"] else None,
                "analysis_meta": json.loads(row["analysis_meta"]) if row["analysis_meta"] else None}

    def upsert_incident(con, match: Match, event: dict) -> dict:
        rule, ip = match.rule, event["source_ip"]
        placeholders = ",".join("?" * len(TERMINAL))
        current = con.execute(f"SELECT * FROM incidents WHERE source_ip=? AND kind=? AND status NOT IN ({placeholders}) ORDER BY id DESC LIMIT 1", (ip, rule.kind, *TERMINAL)).fetchone()
        if current:
            severity = "CRITICAL" if match.severity == "CRITICAL" else current["severity"]
            con.execute("UPDATE incidents SET event_count=?, severity=?, updated_at=? WHERE id=?", (match.count, severity, utcnow(), current["id"]))
            return dict(con.execute("SELECT * FROM incidents WHERE id=?", (current["id"],)).fetchone())
        cur = con.execute(
            "INSERT INTO incidents(kind,source_ip,status,severity,event_count,created_at,rule_id,attack_technique,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
            (rule.kind, ip, "detected", match.severity, match.count, utcnow(), rule.id, rule.attack_technique, utcnow()))
        log(con, cur.lastrowid, "detected", f"{rule.kind}: {match.count} events from {ip} ({rule.id}, {rule.attack_technique})")
        audit(con, "detection", "incident_created", cur.lastrowid, {"rule_id": rule.id, "rules_version": ruleset.version, "source_ip": ip, "count": match.count})
        return dict(con.execute("SELECT * FROM incidents WHERE id=?", (cur.lastrowid,)).fetchone())

    async def ingest(event: EventIn) -> dict:
        stamp = event.timestamp or datetime.now(timezone.utc)
        if stamp.tzinfo is None:
            raise HTTPException(422, "timestamp must include timezone")
        stamp = stamp.astimezone(timezone.utc)
        if stamp > datetime.now(timezone.utc) + timedelta(minutes=5):
            raise HTTPException(422, "timestamp is in the future")
        record = {"timestamp": stamp.isoformat(timespec="seconds"), "source_ip": str(event.source_ip), "event_type": event.event_type,
                  "outcome": event.outcome, "destination_port": event.destination_port, "label": event.label,
                  "username": clean_username(event.username), "ocsf_class_uid": OCSF_CLASS[event.event_type]}
        incident = None
        with store.tx() as con:
            cur = con.execute(f"INSERT INTO events({','.join(record)}) VALUES({','.join('?' * len(record))})", tuple(record.values()))
            for match in ruleset.evaluate(con, record):
                incident = upsert_incident(con, match, record)
            result = dict(con.execute("SELECT * FROM events WHERE id=?", (cur.lastrowid,)).fetchone())
        await broadcast("event", result)
        if incident:
            incident = format_incident(incident)
            await broadcast("incident", incident)
        return {"event": result, "incident": incident}

    @api.get("/api/health")
    async def health():
        model_ready = False
        try:
            async with httpx.AsyncClient(timeout=2) as client:
                response = await client.get(f"{settings.ollama_url}/api/tags")
                model_ready = response.is_success and any(item.get("name") == settings.model for item in response.json().get("models", []))
        except (httpx.HTTPError, ValueError):
            pass
        return {"status": "ok", "version": API_VERSION, "model": settings.model, "model_ready": model_ready, "ai_mode": "ollama" if model_ready else "rule_fallback"}

    @api.post("/api/events", status_code=201)
    async def add_event(event: EventIn):
        return await ingest(event)

    @api.get("/api/events")
    def list_events(limit: int = 100):
        return store.rows("SELECT * FROM events ORDER BY id DESC LIMIT ?", (min(max(limit, 1), 500),))

    @api.get("/api/incidents")
    def list_incidents():
        return [format_incident(row) for row in store.rows("SELECT * FROM incidents ORDER BY id DESC")]

    @api.get("/api/incidents/{incident_id}")
    def get_incident(incident_id: int):
        incident = store.one("SELECT * FROM incidents WHERE id=?", (incident_id,))
        if not incident:
            raise HTTPException(404, "incident not found")
        incident = format_incident(incident)
        incident["trace"] = store.rows("SELECT * FROM traces WHERE incident_id=? ORDER BY id", (incident_id,))
        incident["timeline"] = store.rows("SELECT * FROM timeline WHERE incident_id=? ORDER BY id", (incident_id,))
        incident["proposal"] = format_proposal(store.one("SELECT * FROM proposals WHERE incident_id=?", (incident_id,)))
        return incident

    @api.post("/api/incidents/{incident_id}/analyze")
    async def analyze(incident_id: int):
        incident = store.one("SELECT * FROM incidents WHERE id=?", (incident_id,))
        if not incident:
            raise HTTPException(404, "incident not found")
        if incident["analysis"]:
            return get_incident(incident_id)
        with store.tx() as con:
            transition(con, incident_id, "analyzing", "agent", "investigation started")
        await broadcast("incident", format_incident(store.one("SELECT * FROM incidents WHERE id=?", (incident_id,))))

        async def step(row: dict):
            await broadcast("analysis_step", row)

        analysis, mode, meta = await agent.investigate(incident, step)
        meta["rules_version"] = ruleset.version
        source = "rule_fallback" if mode == "rule_fallback" else "model"
        action = analysis.recommended_action
        with store.tx() as con:
            con.execute("UPDATE incidents SET analysis=?, analysis_mode=?, analysis_meta=? WHERE id=?",
                        (analysis.model_dump_json(), mode, json.dumps(meta), incident_id))
            log(con, incident_id, "analysis", f"{mode}: {analysis.threat_type} {analysis.severity} → {action}")
            audit(con, "agent", "analysis_recorded", incident_id, {"mode": mode, "recommended_action": action, **meta})
            if action in policy.BLOCK_ACTIONS:
                decision = policy.evaluate(action, incident["source_ip"], incident, settings.protected_ips)
                if decision.allowed:
                    con.execute(
                        "INSERT INTO proposals(incident_id,source_ip,target_ip,action,duration_seconds,status,created_at,source,d3fend,reason,policy_notes) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                        (incident_id, decision.target_ip, decision.target_ip, decision.action, decision.duration_seconds, "pending", utcnow(),
                         source, policy.D3FEND_TECHNIQUE, analysis.evidence[0][:500], json.dumps(decision.notes)))
                    log(con, incident_id, "proposal", f"{decision.action} {decision.target_ip} for {decision.duration_seconds} seconds ({source}); pending human approval")
                    audit(con, "policy", "proposal_created", incident_id, {"action": decision.action, "target_ip": decision.target_ip, "source": source, "notes": decision.notes})
                    transition(con, incident_id, "awaiting_approval", "policy", "block proposal passed policy")
                else:
                    log(con, incident_id, "policy", "; ".join(decision.notes))
                    audit(con, "policy", "proposal_rejected", incident_id, {"action": action, "notes": decision.notes})
                    transition(con, incident_id, "needs_review", "policy", "; ".join(decision.notes))
            else:
                transition(con, incident_id, ACTION_STATUS[action], "agent", f"recommended_action={action}")
        result = get_incident(incident_id)
        await broadcast("analysis", result)
        return result

    @api.get("/api/proposals")
    def list_proposals():
        return [format_proposal(row) for row in store.rows("SELECT * FROM proposals ORDER BY id DESC")]

    def pending_proposal(proposal_id: int) -> dict:
        proposal = store.one("SELECT * FROM proposals WHERE id=?", (proposal_id,))
        if not proposal:
            raise HTTPException(404, "proposal not found")
        if proposal["status"] != "pending":
            raise HTTPException(409, "proposal already decided")
        return format_proposal(proposal)

    @api.post("/api/proposals/{proposal_id}/approve")
    async def approve(proposal_id: int, decision: DecisionIn):
        proposal = pending_proposal(proposal_id)
        incident = store.one("SELECT * FROM incidents WHERE id=?", (proposal["incident_id"],))
        # Re-check at decision time: protected IPs may have changed since the proposal was made.
        check = policy.evaluate(proposal["action"], proposal["target_ip"], incident, settings.protected_ips)
        if not check.allowed:
            raise HTTPException(400, "; ".join(check.notes))
        with store.tx() as con:
            changed = con.execute("UPDATE proposals SET status='approved',reviewer=? WHERE id=? AND status='pending'", (decision.reviewer, proposal_id))
            if changed.rowcount != 1:
                raise HTTPException(409, "proposal already decided")
            expires = (datetime.now(timezone.utc) + timedelta(seconds=proposal["duration_seconds"])).isoformat(timespec="seconds")
            con.execute("INSERT INTO rules(proposal_id,source_ip,expires_at,created_at) VALUES(?,?,?,?)", (proposal_id, proposal["target_ip"], expires, utcnow()))
            transition(con, proposal["incident_id"], "blocked", decision.reviewer, "proposal approved")
            log(con, proposal["incident_id"], "approved", f"{decision.reviewer} approved {proposal['action']}")
            log(con, proposal["incident_id"], "firewall", f"App-level rule active until {expires}")
            audit(con, decision.reviewer, "rule_applied", proposal["incident_id"], {"proposal_id": proposal_id, "target_ip": proposal["target_ip"], "expires_at": expires, "d3fend": policy.D3FEND_TECHNIQUE})
        result = get_incident(proposal["incident_id"])
        await broadcast("approval", result)
        return result

    @api.post("/api/proposals/{proposal_id}/reject")
    async def reject(proposal_id: int, decision: DecisionIn):
        proposal = pending_proposal(proposal_id)
        with store.tx() as con:
            changed = con.execute("UPDATE proposals SET status='rejected',reviewer=? WHERE id=? AND status='pending'", (decision.reviewer, proposal_id))
            if changed.rowcount != 1:
                raise HTTPException(409, "proposal already decided")
            transition(con, proposal["incident_id"], "rejected", decision.reviewer, "proposal rejected")
            log(con, proposal["incident_id"], "rejected", f"{decision.reviewer} rejected proposal")
        result = get_incident(proposal["incident_id"])
        await broadcast("approval", result)
        return result

    @api.get("/api/rules")
    def list_rules():
        return [{**row, "active": row["expires_at"] > utcnow()} for row in store.rows("SELECT * FROM rules ORDER BY id DESC")]

    @api.delete("/api/rules/{rule_id}")
    async def unblock(rule_id: int):
        rule = store.one("SELECT * FROM rules WHERE id=?", (rule_id,))
        if not rule:
            raise HTTPException(404, "rule not found")
        with store.tx() as con:
            con.execute("UPDATE rules SET expires_at=? WHERE id=?", (utcnow(), rule_id))
            incident_id = con.execute("SELECT incident_id FROM proposals WHERE id=?", (rule["proposal_id"],)).fetchone()["incident_id"]
            if con.execute("SELECT status FROM incidents WHERE id=?", (incident_id,)).fetchone()["status"] == "blocked":
                transition(con, incident_id, "closed", "operator", f"rule {rule_id} disabled before verification")
            log(con, incident_id, "unblocked", f"Rule {rule_id} disabled by operator")
            audit(con, "operator", "rule_disabled", incident_id, {"rule_id": rule_id, "target_ip": rule["source_ip"]})
        await broadcast("firewall", {"rule_id": rule_id, "active": False})
        return {"rule_id": rule_id, "active": False}

    @api.post("/api/demo/login")
    async def demo_login(login: LoginIn, request: Request):
        peer = request.client.host if request.client else "127.0.0.1"
        traffic = await demo_traffic(TrafficIn(), request)
        if traffic.status_code == 403:
            return traffic
        success = login.username == "student" and login.password == "sentinel-demo"
        result = await ingest(EventIn(source_ip=peer, event_type="HTTP_AUTH", outcome="success" if success else "failed", username=login.username[:80]))
        return JSONResponse({"authenticated": success, "source_ip": peer, "event_id": result["event"]["id"]}, status_code=200 if success else 401)

    @api.post("/api/demo/traffic")
    async def demo_traffic(traffic: TrafficIn, request: Request):
        peer = request.client.host if request.client else "127.0.0.1"
        # Source override is only for local, controlled lab simulation.
        if traffic.source_ip and peer not in LOCAL_PEERS:
            raise HTTPException(403, "source override requires localhost")
        source = str(traffic.source_ip) if traffic.source_ip else peer
        rule = store.one("SELECT * FROM rules WHERE source_ip=? AND expires_at>? ORDER BY id DESC LIMIT 1", (source, utcnow()))
        decision = "denied" if rule else "allowed"
        with store.tx() as con:
            con.execute("INSERT INTO traffic(source_ip,decision,created_at) VALUES(?,?,?)", (source, decision, utcnow()))
            if rule:
                incident_id = con.execute("SELECT incident_id FROM proposals WHERE id=?", (rule["proposal_id"],)).fetchone()["incident_id"]
                if con.execute("SELECT status FROM incidents WHERE id=?", (incident_id,)).fetchone()["status"] == "blocked":
                    transition(con, incident_id, "verified", "verification", f"new request from {source} denied by rule {rule['id']}")
                    audit(con, "verification", "verification_passed", incident_id, {"source_ip": source, "rule_id": rule["id"], "http_status": 403})
                log(con, incident_id, "verification", f"New request from {source} denied by rule {rule['id']}")
        result = {"source_ip": source, "decision": decision, "rule_id": rule["id"] if rule else None}
        await broadcast("traffic", result)
        if rule:
            await broadcast("verification", result)
        return JSONResponse(result, status_code=403 if rule else 200)

    @api.post("/api/demo/reset")
    async def demo_reset():
        """Start a fresh rehearsal: disable active rules and close open incidents. History is kept."""
        now = utcnow()
        with store.tx() as con:
            disabled = con.execute("UPDATE rules SET expires_at=? WHERE expires_at>?", (now, now)).rowcount
            placeholders = ",".join("?" * len(TERMINAL))
            open_ids = [row["id"] for row in con.execute(f"SELECT id FROM incidents WHERE status NOT IN ({placeholders})", tuple(TERMINAL))]
            for incident_id in open_ids:
                transition(con, incident_id, "closed", "operator", "demo reset")
            con.execute("UPDATE proposals SET status='rejected', reviewer='demo reset' WHERE status='pending'")
            audit(con, "operator", "demo_reset", None, {"rules_disabled": disabled, "incidents_closed": open_ids})
        result = {"rules_disabled": disabled, "incidents_closed": len(open_ids)}
        await broadcast("reset", result)
        return result

    @api.get("/api/traffic")
    def list_traffic():
        return store.rows("SELECT * FROM traffic ORDER BY id DESC LIMIT 100")

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
        events = store.rows("SELECT * FROM events")
        incidents = store.rows("SELECT * FROM incidents")
        predicted = {row["source_ip"] for row in incidents}
        actual = {row["source_ip"] for row in events if row["label"] == "attack"}
        tp, fp, fn = len(predicted & actual), len(predicted - actual), len(actual - predicted)
        precision = tp / (tp + fp) if tp + fp else 0
        recall = tp / (tp + fn) if tp + fn else 0
        return {"events": len(events), "incidents": len(incidents), "precision": precision, "recall": recall, "f1": 2 * precision * recall / (precision + recall) if precision + recall else 0, "note": "Exploratory source-IP metric only; use held-out labeled dataset for final evaluation",
                "soc": soc.summary([soc.timings(store, ruleset, row) for row in incidents])}

    @api.get("/api/reports/{incident_id}")
    def report(incident_id: int):
        incident = get_incident(incident_id)
        incident["events"] = store.rows("SELECT * FROM events WHERE source_ip=? ORDER BY id", (incident["source_ip"],))
        incident["traffic"] = store.rows("SELECT * FROM traffic WHERE source_ip=? ORDER BY id", (incident["source_ip"],))
        incident["audit"] = store.rows("SELECT * FROM audit_log WHERE incident_id=? ORDER BY id", (incident_id,))
        incident["soc_timings"] = soc.timings(store, ruleset, incident)
        return incident

    @api.get("/api/audit")
    def list_audit(limit: int = 200):
        return store.rows("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", (min(max(limit, 1), 1000),))

    @api.get("/api/audit/verify")
    def audit_verify():
        return verify_audit(store.rows("SELECT * FROM audit_log ORDER BY id"))

    @api.websocket("/ws")
    async def websocket(socket: WebSocket):
        peer = socket.client.host if socket.client else ""
        if not trusted(peer, socket.headers):
            await socket.close(code=1008)
            return
        await socket.accept()
        sockets.add(socket)
        try:
            await socket.send_json({"v": WS_VERSION, "stage": "connected", "ts": utcnow(), "payload": {"message": "Refetch current state after reconnect"}})
            while True:
                await socket.receive_text()
        except WebSocketDisconnect:
            sockets.discard(socket)

    dashboard = ROOT.parent / "frontend" / "dist"
    if dashboard.exists():
        api.mount("/", StaticFiles(directory=dashboard, html=True), name="dashboard")
    return api


app = create_app()
