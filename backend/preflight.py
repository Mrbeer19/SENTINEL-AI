"""Pre-demo readiness check. Run from the repo root: python -m backend.preflight [--host 192.168.x.x]

Exit code 0 = ready, 1 = something must be fixed first.
"""

from __future__ import annotations

import argparse
import ipaddress
import sqlite3
import sys

import httpx

from backend.app import DEFAULT_DB
from backend.config import ALWAYS_PROTECTED, load_settings, same_model
from backend.detection import RuleSet


def check(ok: bool, label: str, fix: str = "") -> bool:
    print(f"{'PASS' if ok else 'FAIL'}  {label}" + ("" if ok else f"\n      → {fix}"))
    return ok


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", help="IP uvicorn will bind to (the M5 LAN IP on the hotspot)")
    args = parser.parse_args()
    try:
        settings = load_settings()
    except ValueError as exc:
        check(False, "settings load", f"fix SENTINEL_PROTECTED_IPS: {exc}")
        return 1
    results = []
    try:
        tags = httpx.get(f"{settings.ollama_url}/api/tags", timeout=3).json().get("models", [])
        results.append(check(True, f"Ollama reachable at {settings.ollama_url}"))
        results.append(check(any(same_model(m.get("name", ""), settings.model) for m in tags), f"model {settings.model} installed", f"ollama pull {settings.model}"))
    except (httpx.HTTPError, ValueError):
        results.append(check(False, f"Ollama reachable at {settings.ollama_url}", "start it: ollama serve"))
    extra = settings.protected_ips - ALWAYS_PROTECTED
    results.append(check(bool(extra), f"protected IPs beyond loopback: {sorted(extra) or 'none'}",
                         "set SENTINEL_PROTECTED_IPS=<hotspot gateway>,<M5 LAN IP>"))
    try:
        rules = RuleSet(settings.rules_dir)
        results.append(check(True, f"{len(rules.rules)} detection rules loaded (version {rules.version})"))
    except (OSError, ValueError, KeyError) as exc:
        results.append(check(False, "detection rules load", str(exc)))
    for path, env in ((settings.prompt_path, "SENTINEL_PROMPT_PATH"), (settings.analyst_prompt_path, "SENTINEL_ANALYST_PROMPT_PATH"),
                      (settings.planner_prompt_path, "SENTINEL_PLANNER_PROMPT_PATH")):
        results.append(check(path.exists(), f"agent prompt {path.name}", f"merge the prompt files (PR #7) or set {env}"))
    try:
        DEFAULT_DB.parent.mkdir(parents=True, exist_ok=True)
        con = sqlite3.connect(DEFAULT_DB, isolation_level=None)
        con.execute("BEGIN IMMEDIATE")  # proves we can take the write lock, changes nothing
        con.execute("ROLLBACK")
        con.close()
        results.append(check(True, f"database writable at {DEFAULT_DB}"))
    except sqlite3.Error as exc:
        results.append(check(False, "database writable", str(exc)))
    if args.host:
        addr = ipaddress.ip_address(args.host)
        results.append(check(addr.is_private and not addr.is_unspecified, f"bind host {addr} is a private LAN address",
                             "bind to the M5 hotspot IP, not 0.0.0.0 or a public IP"))
        results.append(check(str(addr) in settings.protected_ips, f"bind host {addr} is protected", "add the M5 LAN IP to SENTINEL_PROTECTED_IPS"))
        results.append(check(str(addr) in settings.allowed_hosts, f"bind host {addr} is an allowed Host header",
                             "add the M5 LAN IP to SENTINEL_ALLOWED_HOSTS (make run-lan does this)"))
    print("\nREADY" if all(results) else "\nNOT READY")
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main())
