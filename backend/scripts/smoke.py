"""End-to-end check against a running backend (v0.2 contract). Run from the repo root on the server machine:

    backend/.venv/bin/python backend/scripts/smoke.py [--require-model]

Uses /api/simulations + the localhost source override, so it needs no second machine.
The real attack from the other Mac is scripts/lab_client.py. Exit code 0 = whole loop works.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import time

import httpx

ANALYSIS_KEYS = {"threat_type", "severity", "confidence", "evidence", "recommended_action", "explanation_th"}


class Failed(Exception):
    pass


def expect(ok: bool, message: str) -> None:
    if not ok:
        raise Failed(message)


def run(base: str, source_ip: str, require_model: bool, keep_block: bool) -> dict:
    client = httpx.Client(base_url=base, timeout=200)  # analysis takes ~30 s on the M5
    out = {"base": base, "source_ip": source_ip}

    health = client.get("/api/health").json()
    out["ai_mode"] = health["ai_mode"]
    expect(not require_model or health["model_ready"], f"model {health['model']} not ready (start Ollama / ollama pull)")

    before = client.post("/api/demo/traffic", json={"source_ip": source_ip})
    expect(before.status_code == 200, f"{source_ip} is already blocked; use another --source-ip or make reset")

    incident = client.post("/api/simulations", json={"scenario": "http_brute_force", "source_ip": source_ip}).json()["incident"]
    expect(incident is not None and incident["status"] == "detected", f"expected a new detected incident, got {incident}")

    started = time.perf_counter()
    analyzed = client.post(f"/api/incidents/{incident['id']}/analyze").json()
    out["analysis_seconds"] = round(time.perf_counter() - started, 1)
    out["analysis_mode"] = analyzed["analysis_mode"]
    expect(set(analyzed["analysis"] or {}) == ANALYSIS_KEYS, f"analysis does not match the contract: {analyzed['analysis']}")
    expect(not require_model or analyzed["analysis_mode"] != "rule_fallback", "model answer failed validation → rule_fallback")
    out["tools"] = [t["tool"] for t in analyzed["trace"] if t["operation"] == "execute_tool"]
    expect(analyzed["status"] == "awaiting_approval" and analyzed["proposal"], f"no proposal (status {analyzed['status']}, action {analyzed['analysis']['recommended_action']})")
    expect(analyzed["proposal"]["target_ip"] == source_ip, "proposal targets a different IP than the incident source")

    approved = client.post(f"/api/proposals/{analyzed['proposal']['id']}/approve", json={"reviewer": "smoke test"})
    expect(approved.status_code == 200 and approved.json()["status"] == "blocked", f"approve failed: {approved.text}")

    after = client.post("/api/demo/traffic", json={"source_ip": source_ip})
    expect(after.status_code == 403, f"expected 403 after approval, got {after.status_code}")
    report = client.get(f"/api/reports/{incident['id']}").json()
    expect(report["status"] == "verified", f"incident not verified: {report['status']}")
    out["soc_timings"] = report["soc_timings"]

    audit = client.get("/api/audit/verify").json()
    expect(audit["valid"], f"audit chain broken at entry {audit['broken_at']}")
    out["audit_entries"] = audit["entries"]

    if not keep_block:  # leave the demo DB clean: unblock, the incident stays verified
        rule = next(r for r in client.get("/api/rules").json() if r["source_ip"] == source_ip and r["active"])
        client.delete(f"/api/rules/{rule['id']}")
    out["incident_id"] = incident["id"]
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://127.0.0.1:8000")
    parser.add_argument("--source-ip", default=f"198.51.100.{random.randint(2, 254)}", help="TEST-NET-2 address; random by default")
    parser.add_argument("--require-model", action="store_true", help="fail if Ollama is not used (demo day)")
    parser.add_argument("--keep-block", action="store_true", help="leave the firewall rule active")
    args = parser.parse_args()
    try:
        result = run(args.base, args.source_ip, args.require_model, args.keep_block)
    except Failed as exc:
        print(f"SMOKE FAIL: {exc}", file=sys.stderr)
        return 1
    except httpx.HTTPError as exc:
        print(f"SMOKE FAIL: cannot reach {args.base}: {exc}  (start it: make -C backend run)", file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2, ensure_ascii=False))
    print("SMOKE PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
