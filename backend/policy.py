"""Deterministic checks every block proposal must pass. The model never bypasses this module."""

from __future__ import annotations

import ipaddress
from dataclasses import dataclass, field

BLOCK_ACTIONS = ("TEMP_BLOCK_IP", "BLOCK_IP")
DURATION_SECONDS = {"TEMP_BLOCK_IP": 600, "BLOCK_IP": 3600}
D3FEND_TECHNIQUE = "D3-ITF"  # MITRE D3FEND Inbound Traffic Filtering


@dataclass
class Decision:
    allowed: bool
    action: str
    target_ip: str
    duration_seconds: int = 0
    notes: list[str] = field(default_factory=list)


def is_protected(ip: str, protected: frozenset[str]) -> bool:
    addr = ipaddress.ip_address(ip)
    return str(addr) in protected or addr.is_loopback or addr.is_unspecified or addr.is_multicast


def evaluate(action: str, target_ip: str, incident: dict, protected: frozenset[str]) -> Decision:
    """Decide whether `action` against `target_ip` may be proposed for `incident`."""
    if action not in BLOCK_ACTIONS:
        return Decision(False, action, target_ip, notes=[f"{action} is not a block action"])
    try:
        target = str(ipaddress.ip_address(target_ip))
    except ValueError:
        return Decision(False, action, str(target_ip), notes=["target_ip is not a valid IP address"])
    # Key defence against goal hijack: the model may only target the source the detection rule saw.
    if target != incident["source_ip"]:
        return Decision(False, action, target, notes=[f"target_ip {target} is not the incident source {incident['source_ip']}"])
    if is_protected(target, protected):
        return Decision(False, action, target, notes=[f"{target} is a protected IP"])
    notes = []
    if action == "BLOCK_IP" and incident["severity"] != "CRITICAL":
        action = "TEMP_BLOCK_IP"
        notes.append("BLOCK_IP needs a CRITICAL incident; downgraded to TEMP_BLOCK_IP")
    return Decision(True, action, target, DURATION_SECONDS[action], notes)
