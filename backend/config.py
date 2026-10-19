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
    rules_dir: Path
    demo_rate_limit: int
    demo_rate_window_s: int


def load_settings() -> Settings:
    return Settings(
        model=os.getenv("SENTINEL_MODEL", "qwen3.5:4b"),
        ollama_url=os.getenv("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/"),
        ollama_format=os.getenv("SENTINEL_OLLAMA_FORMAT") == "1",
        ollama_timeout=float(os.getenv("SENTINEL_OLLAMA_TIMEOUT", "90")),
        ollama_disabled=os.getenv("SENTINEL_DISABLE_OLLAMA") == "1",
        admin_key=os.getenv("SENTINEL_ADMIN_KEY", ""),
        protected_ips=ALWAYS_PROTECTED | parse_ips(os.getenv("SENTINEL_PROTECTED_IPS", "")),
        prompt_path=Path(os.getenv("SENTINEL_PROMPT_PATH", REPO / "model" / "prompts" / "analyst_system_v1.md")),
        rules_dir=Path(os.getenv("SENTINEL_RULES_DIR", ROOT / "rules")),
        demo_rate_limit=int(os.getenv("SENTINEL_DEMO_RATE_LIMIT", "30")),
        demo_rate_window_s=int(os.getenv("SENTINEL_DEMO_RATE_WINDOW", "10")),
    )
