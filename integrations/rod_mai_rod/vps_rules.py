"""Install and expire Caddy IP rules inside the rod-mai-rod site block only."""

import argparse
import ipaddress
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from site_config import CADDY_CONTAINER, CADDY_DIR, CADDYFILE, HERE

RULES = HERE / "rules.json"
SNIPPET = CADDY_DIR / "rod-mai-rod-sentinel.caddy"
ACTIVE_CONFIG = CADDY_DIR / "rod-mai-rod-active.Caddyfile"
IMPORT = "import /config/rod-mai-rod-sentinel.caddy"


def active_ips(data, now=None):
    now = now or datetime.now(timezone.utc)
    if not isinstance(data, list):
        raise ValueError("rules must be a JSON list")
    active = set()
    for row in data:
        ip = str(ipaddress.ip_address(row["source_ip"]))
        expiry = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
        if expiry.tzinfo is None:
            raise ValueError("expiry must include timezone")
        if expiry > now:
            active.add(ip)
    return sorted(active, key=lambda ip: (ipaddress.ip_address(ip).version, int(ipaddress.ip_address(ip))))


def snippet_for(ips):
    if not ips:
        return "# No active SENTINEL rules for rod-mai-rod.\n"
    return "@rod_sentinel_blocked remote_ip " + " ".join(ips) + "\nrespond @rod_sentinel_blocked \"Access denied\" 403\n"


def atomic_write(path, content, mode=0o600):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, prefix=path.name + ".", delete=False) as temp:
        temp.write(content)
        name = temp.name
    os.chmod(name, mode)
    os.replace(name, path)


def apply():
    if not CADDY_CONTAINER:
        raise RuntimeError("site.json is missing caddy_container (see site.example.json)")
    config = CADDYFILE.read_text()
    if IMPORT not in config:
        raise RuntimeError("rod-mai-rod import is missing from Caddyfile")
    if ACTIVE_CONFIG.read_text() != config:
        raise RuntimeError("shared Caddyfile changed; refusing to reload stale configuration")
    data = json.loads(RULES.read_text()) if RULES.exists() else []
    new = snippet_for(active_ips(data))
    old = SNIPPET.read_text() if SNIPPET.exists() else ""
    if new == old:
        return False
    # Validate the complete candidate before touching Caddy's live import.
    candidate_snippet = CADDY_DIR / "rod-mai-rod-sentinel.candidate"
    candidate_config = CADDY_DIR / "rod-mai-rod-candidate.Caddyfile"
    atomic_write(candidate_snippet, new, 0o644)
    candidate = config.replace(IMPORT, "import /config/rod-mai-rod-sentinel.candidate")
    atomic_write(candidate_config, candidate, 0o644)
    try:
        subprocess.run(["docker", "exec", CADDY_CONTAINER, "caddy", "validate", "--config", "/config/rod-mai-rod-candidate.Caddyfile", "--adapter", "caddyfile"], check=True, capture_output=True, text=True)
        atomic_write(SNIPPET, new, 0o644)
        try:
            subprocess.run(["docker", "exec", CADDY_CONTAINER, "caddy", "reload", "--config", "/config/rod-mai-rod-active.Caddyfile", "--adapter", "caddyfile"], check=True, capture_output=True, text=True)
        except subprocess.CalledProcessError:
            atomic_write(SNIPPET, old, 0o644)
            subprocess.run(["docker", "exec", CADDY_CONTAINER, "caddy", "reload", "--config", "/config/rod-mai-rod-active.Caddyfile", "--adapter", "caddyfile"], check=True, capture_output=True, text=True)
            raise
    finally:
        candidate_snippet.unlink(missing_ok=True)
        candidate_config.unlink(missing_ok=True)
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--receive", action="store_true", help="read rules JSON from stdin, then apply")
    args = parser.parse_args()
    if args.receive:
        payload = json.loads(sys.stdin.read())
        active_ips(payload)  # validate every entry before replacing rules.json
        atomic_write(RULES, json.dumps(payload, separators=(",", ":")))
    print("changed" if apply() else "unchanged")
