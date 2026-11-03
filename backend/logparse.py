"""Parse raw sshd auth log lines into SENTINEL events (spec D: log parser, validate, normalize).

Accepted timestamp prefixes:
  2026-10-20T12:00:01.123456+07:00 host sshd[1234]: ...   (ISO, rsyslog default on Ubuntu 24.04)
  Oct 20 12:00:01 host sshd[1234]: ...                     (classic syslog: no year or zone → server local time)
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta

ISO = re.compile(r"^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2}))\s+\S+\s+sshd\[\d+\]:\s+(.*)$")
BSD = re.compile(r"^([A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+\S+\s+sshd\[\d+\]:\s+(.*)$")
FAILED = re.compile(r"^Failed (?:password|publickey) for (?:invalid user )?(\S+) from (\S+) port \d+")
ACCEPTED = re.compile(r"^Accepted (?:password|publickey|keyboard-interactive/pam) for (\S+) from (\S+) port \d+")


class Skip(Exception):
    """Line is valid sshd output but not an authentication result."""


def parse_time(prefix: str, now: datetime) -> datetime:
    if prefix[0].isdigit():
        return datetime.fromisoformat(prefix.replace("Z", "+00:00"))
    local = now.astimezone()
    stamp = datetime.strptime(f"{local.year} {prefix}", "%Y %b %d %H:%M:%S").replace(tzinfo=local.tzinfo)
    # A December line read in early January belongs to last year.
    return stamp.replace(year=local.year - 1) if stamp > local + timedelta(days=1) else stamp


def parse_line(line: str, now: datetime) -> dict:
    """One sshd line → event dict for EventIn. Raises Skip for non-auth sshd lines, ValueError for anything else."""
    found = ISO.match(line) or BSD.match(line)
    if not found:
        raise ValueError("not an sshd line with a supported timestamp")
    stamp, message = parse_time(found[1], now), found[2]
    for pattern, outcome in ((FAILED, "failed"), (ACCEPTED, "success")):
        hit = pattern.match(message)
        if hit:
            return {"timestamp": stamp, "source_ip": hit[2], "event_type": "SSH_AUTH", "outcome": outcome,
                    "destination_port": 22, "username": hit[1]}
    # Other sshd lines ("Invalid user", "Connection closed", pam...) repeat an attempt already logged as
    # "Failed password"; counting them would double the failures.
    raise Skip()
