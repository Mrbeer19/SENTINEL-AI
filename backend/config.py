"""Runtime settings, read from the environment when the app is created (see .env.example)."""

from __future__ import annotations

import ipaddress
import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent

# Never blockable, whatever the environment says.
ALWAYS_PROTECTED = frozenset({"127.0.0.1", "::1", "0.0.0.0", "::"})
LOCAL_PEERS = frozenset({"127.0.0.1", "::1", "testclient"})
# Host header / Origin host names the backend answers to. The M5 LAN IP is added by `make run-lan`.
DEFAULT_HOSTS = frozenset({"localhost", "127.0.0.1"})


def parse_ips(raw: str) -> frozenset[str]:
    """Comma-separated IPs → normalised set. Raises ValueError on a bad entry so misconfiguration is loud."""
    return frozenset(str(ipaddress.ip_address(part.strip())) for part in raw.split(",") if part.strip())


@dataclass(frozen=True)
class Settings:
    model: str
    ollama_url: str
    ollama_format: bool
    ollama_timeout: float
    ollama_disabled: bool
    admin_key: str
    protected_ips: frozenset[str]
    prompt_path: Path
    analyst_prompt_path: Path
    planner_prompt_path: Path
    rules_dir: Path
    demo_rate_limit: int
    demo_rate_window_s: int
    allowed_hosts: frozenset[str]


def load_settings() -> Settings:
    return Settings(
        model=os.getenv("SENTINEL_MODEL", "qwen3.5:4b"),
        ollama_url=os.getenv("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/"),
        ollama_format=os.getenv("SENTINEL_OLLAMA_FORMAT") == "1",
        ollama_timeout=float(os.getenv("SENTINEL_OLLAMA_TIMEOUT", "90")),
        ollama_disabled=os.getenv("SENTINEL_DISABLE_OLLAMA") == "1",
        admin_key=os.getenv("SENTINEL_ADMIN_KEY", ""),
        protected_ips=ALWAYS_PROTECTED | parse_ips(os.getenv("SENTINEL_PROTECTED_IPS", "")),
        prompt_path=Path(os.getenv("SENTINEL_PROMPT_PATH", REPO / "model" / "prompts" / "investigator_v1.md")),
        analyst_prompt_path=Path(os.getenv("SENTINEL_ANALYST_PROMPT_PATH", REPO / "model" / "prompts" / "threat_analyst_v1.md")),
        planner_prompt_path=Path(os.getenv("SENTINEL_PLANNER_PROMPT_PATH", REPO / "model" / "prompts" / "defense_planner_v1.md")),
        rules_dir=Path(os.getenv("SENTINEL_RULES_DIR", ROOT / "rules")),
        demo_rate_limit=int(os.getenv("SENTINEL_DEMO_RATE_LIMIT", "30")),
        demo_rate_window_s=int(os.getenv("SENTINEL_DEMO_RATE_WINDOW", "10")),
        allowed_hosts=DEFAULT_HOSTS | {h.strip().lower() for h in os.getenv("SENTINEL_ALLOWED_HOSTS", "").split(",") if h.strip()},
    )
