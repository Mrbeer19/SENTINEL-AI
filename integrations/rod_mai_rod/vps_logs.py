"""Read only rod-mai-rod Caddy access records for the Windows collector."""

import argparse
import ipaddress
import json
from pathlib import Path
from urllib.parse import urlsplit

DOMAIN = "rod-mai-rod.tntproduction.tech"
LOG = Path("/var/lib/docker/volumes/copie_caddy_config/_data/rod-mai-rod.access.log")
MAX_BYTES = 1_000_000


def event(line: bytes, offset: int):
    try:
        row = json.loads(line)
        request = row["request"]
        if request.get("host", "").split(":")[0].lower() != DOMAIN:
            return None
        ip = str(ipaddress.ip_address(request["remote_ip"]))
        method = request["method"].upper()
        path = urlsplit(request["uri"]).path
        status = int(row["status"])
        if path in ("/api/v1/auth/login", "/api/v1/auth/google") and method == "POST" and status in (200, 401):
            return {"offset": offset, "ip": ip, "kind": "auth", "outcome": "success" if status == 200 else "failed"}
        if status == 403:
            return {"offset": offset, "ip": ip, "kind": "denied"}
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return None
    return None


def read_log(inode: int | None, offset: int, start_at_end: bool, sensor=False):
    log_path = Path("/opt/rod-mai-rod/sentinel/network-events.jsonl") if sensor else LOG
    if not log_path.exists():
        return {"inode": None, "offset": 0, "events": []}
    with log_path.open("rb") as handle:
        stat = log_path.stat()
        if start_at_end:
            return {"inode": stat.st_ino, "offset": stat.st_size, "events": []}
        if inode != stat.st_ino or offset > stat.st_size:
            offset = 0
        handle.seek(offset)
        events = []
        consumed = 0
        while consumed < MAX_BYTES:
            line = handle.readline()
            if not line:
                break
            if not line.endswith(b"\n"):
                break  # wait for a complete JSON record
            consumed += len(line)
            if sensor:
                try:
                    payload = json.loads(line)
                    item = {'offset': handle.tell(), 'kind': 'sensor', 'event': payload}
                except ValueError:
                    item = None
            else:
                item = event(line, handle.tell())
            if item:
                events.append(item)
            offset = handle.tell()
        return {"inode": stat.st_ino, "offset": offset, "events": events}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--inode", type=int)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--start-at-end", action="store_true")
    parser.add_argument("--sensor", action="store_true")
    args = parser.parse_args()
    print(json.dumps(read_log(args.inode, args.offset, args.start_at_end, args.sensor)))
