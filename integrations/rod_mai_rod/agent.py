"""Windows-side SSH bridge: rod-mai-rod auth logs -> SENTINEL, approved rules -> Caddy."""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REMOTE = "/opt/rod-mai-rod/sentinel"
API = "http://127.0.0.1:8000"


def api(path, body=None):
    raw = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(API + path, data=raw, headers={"Content-Type": "application/json"} if raw else {})
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)


def ssh(args, command, payload=None):
    result = subprocess.run(
        ["ssh", "-i", str(args.key), "-o", "BatchMode=yes", "-o", "ConnectTimeout=5", "-o", "StrictHostKeyChecking=yes", f"{args.user}@{args.host}", command],
        input=payload, text=True, capture_output=True, timeout=20,
    )
    if result.returncode:
        raise RuntimeError(f"SSH command failed: {result.stderr.strip()[:500]}")
    return result.stdout.strip()


def save_state(path, state):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, prefix="rod-mai-rod-", delete=False) as file:
        json.dump(state, file)
        name = file.name
    os.replace(name, path)


def emit(path, message, error=False):
    stream = sys.stderr if error else sys.stdout
    if stream is not None:
        print(message, file=stream, flush=True)
    log = path.with_suffix(".log")
    log.parent.mkdir(parents=True, exist_ok=True)
    if log.exists() and log.stat().st_size > 1_000_000:
        log.replace(log.with_suffix(".previous.log"))
    with log.open("a", encoding="utf-8") as file:
        file.write(f"{datetime.now(timezone.utc).isoformat()} {message}\n")


def run_once(args, state):
    status, rows = api("/api/rules")
    if status != 200:
        raise RuntimeError(f"SENTINEL rules returned HTTP {status}")
    rules = [{"source_ip": row["source_ip"], "expires_at": row["expires_at"]} for row in rows if row["active"]]
    signature = json.dumps(rules, sort_keys=True)
    if signature != state.get("rules"):
        ssh(args, f"python3 {REMOTE}/vps_rules.py --receive", signature)
        state["rules"] = signature
        save_state(args.state, state)

    if state.get("inode") is None:
        batch = json.loads(ssh(args, f"python3 {REMOTE}/vps_logs.py --start-at-end"))
        state.update(inode=batch["inode"], offset=batch["offset"])
        save_state(args.state, state)
        return 0

    batch = json.loads(ssh(args, f"python3 {REMOTE}/vps_logs.py --inode {int(state['inode'])} --offset {int(state['offset'])}"))
    active = {row["source_ip"] for row in rules}
    processed = 0
    for item in batch["events"]:
        if item["kind"] == "auth":
            status, _ = api("/api/events", {"source_ip": item["ip"], "event_type": "HTTP_AUTH", "outcome": item["outcome"]})
            if status != 201:
                raise RuntimeError(f"SENTINEL event ingest returned HTTP {status}")
        elif item["kind"] == "denied" and item["ip"] in active:
            status, _ = api("/api/enforce", {"client_ip": item["ip"]})
            if status not in (200, 403):
                raise RuntimeError(f"SENTINEL enforcement returned HTTP {status}")
        state.update(inode=batch["inode"], offset=item["offset"])
        save_state(args.state, state)
        processed += 1
    state.update(inode=batch["inode"], offset=batch["offset"])
    save_state(args.state, state)
    return processed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="201.18.215.18")
    parser.add_argument("--user", default="root")
    parser.add_argument("--key", type=Path, default=Path.home() / ".ssh" / "sentinel_rod_mai_rod")
    parser.add_argument("--state", type=Path, default=Path(os.getenv("LOCALAPPDATA", str(Path.home()))) / "SentinelAI" / "rod-mai-rod-agent.json")
    parser.add_argument("--interval", type=float, default=5)
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    state = json.loads(args.state.read_text()) if args.state.exists() else {}
    while True:
        try:
            count = run_once(args, state)
            if count:
                emit(args.state, f"rod-mai-rod: {count} auth/denial records processed")
        except (OSError, ValueError, KeyError, RuntimeError, subprocess.TimeoutExpired) as error:
            emit(args.state, f"rod-mai-rod bridge: {error}", error=True)
            if args.once:
                raise
        if args.once:
            break
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
