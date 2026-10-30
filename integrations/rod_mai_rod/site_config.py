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
CADDY_DIR = Path(SITE.get("caddy_config_dir", "/nonexistent"))
CADDYFILE = Path(SITE.get("caddyfile", "/nonexistent"))
CADDY_CONTAINER = SITE.get("caddy_container", "")
