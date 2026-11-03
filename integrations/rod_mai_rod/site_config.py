"""Deployment values for the VPS scripts, read from site.json next to them (kept out of Git).

Copy site.example.json to site.json on the VPS and fill in the real values.
"""

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
CONFIG_FILE = HERE / "site.json"


def load():
    return json.loads(CONFIG_FILE.read_text(encoding="utf-8")) if CONFIG_FILE.exists() else {}


SITE = load()
DOMAIN = SITE.get("domain", "")
# Every site block on the shared Caddy that SENTINEL watches; "domain" alone keeps the single-site setup.
DOMAINS = frozenset(d.lower() for d in SITE.get("domains") or ([DOMAIN] if DOMAIN else []))
LEGACY_LOGIN_PATHS = ["/api/v1/auth/login", "/api/v1/auth/google"]
# Per-domain POST paths whose 200/401 is a login result; a site without a login (e.g. a read-only dashboard) gets [].
LOGIN_PATHS = {d.lower(): frozenset(p) for d, p in SITE["login_paths"].items()} if "login_paths" in SITE \
    else {d: frozenset(LEGACY_LOGIN_PATHS) for d in DOMAINS}
CADDY_DIR = Path(SITE.get("caddy_config_dir", "/nonexistent"))
CADDYFILE = Path(SITE.get("caddyfile", "/nonexistent"))
CADDY_CONTAINER = SITE.get("caddy_container", "")
# File names inside the Caddy config volume, and the config Caddy is reloaded from (a path inside the container).
ACCESS_LOG = SITE.get("access_log", "rod-mai-rod.access.log")
BLOCK_SNIPPET = SITE.get("block_snippet", "rod-mai-rod-sentinel.caddy")
# Optional per-site snippet (block list + access log) that site blocks may import instead of the block snippet.
SITE_SNIPPET = SITE.get("site_snippet", "sentinel-site.caddy")
# "" when Caddy reads the shared Caddyfile directly (no separate active copy to keep identical).
ACTIVE_CONFIG = SITE.get("active_config", "rod-mai-rod-active.Caddyfile")
RELOAD_CONFIG = SITE.get("reload_config", "/config/" + ACTIVE_CONFIG if ACTIVE_CONFIG else "/etc/caddy/Caddyfile")
