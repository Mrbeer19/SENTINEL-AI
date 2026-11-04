"""Read the Caddy access records of the watched sites (site.json "domains") for the collector.

Besides login results and 403 denials, every other request is summed per source IP per WINDOW_S seconds
(HTTP_REQUEST in docs/api-contract.md), so a flood becomes a few totals instead of one event per request."""

import argparse
import ipaddress
import json
import re
import subprocess
from pathlib import Path
from urllib.parse import urlsplit

from site_config import ACCESS_LOG, CADDY_DIR, DOMAINS, HERE, LOGIN_PATHS, SITE

LOG = CADDY_DIR / ACCESS_LOG
SENSOR_LOG = HERE / "network-events.jsonl"
MAX_BYTES = 1_000_000
WINDOW_S = 10
PATHS_MAX = 5
PATH_MAX = 100
# Files a browser loads with every page, and flood-map tiles (one map drag asks for hundreds): not counted.
STATIC = re.compile(r"^/(_next/static|assets|fonts)/|^/api/v1/maps/[^/]+/[^/]+/\d+/\d+/\d+$"
                    r"|\.(png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|css|js|map|mp4|webm|txt|xml|webmanifest)$"
                    r"|^/(favicon|apple-touch-icon|robots|manifest)")
# Decoy paths: the site has no such page and links to none, so only someone guessing paths asks for them.
HONEYPOT_PATHS = frozenset(path.lower() for path in SITE.get("honeypot_paths", ["/admin-backup.zip", "/backup.sql", "/.aws/credentials", "/config.php.bak"]))


def own_networks():
    """This VPS's own addresses, and the subnets of its non-public interfaces (loopback, Docker bridges).

    Requests from them are the server or its containers calling a site through Caddy, not visitors; counting
    them once made SENTINEL flag and block the VPS itself. The public interface's subnet is not excluded:
    other hosts in it are ordinary internet clients."""
    try:
        out = subprocess.run(["ip", "-o", "addr", "show"], capture_output=True, text=True, timeout=5).stdout
    except (OSError, subprocess.SubprocessError):
        return frozenset(), ()
    addresses, internal = set(), []
    for line in out.splitlines():
        try:
            iface = ipaddress.ip_interface(line.split()[3])
        except (IndexError, ValueError):
            continue
        addresses.add(iface.ip)
        if not iface.ip.is_global:
            internal.append(iface.network)
    return frozenset(addresses), tuple(internal)


OWN_ADDRESSES, INTERNAL_NETS = own_networks()


def is_own(ip) -> bool:
    ip = ipaddress.ip_address(ip)
    return ip.is_loopback or ip in OWN_ADDRESSES or any(ip in net for net in INTERNAL_NETS)


def watched(host: str) -> bool:
    # "*" watches every site block that writes to the shared access log, including sites added later.
    return host in DOMAINS or "*" in DOMAINS


def login_paths(host: str):
    return LOGIN_PATHS.get(host, LOGIN_PATHS.get("*", ()))


def event(line: bytes, offset: int):
    try:
        row = json.loads(line)
        request = row["request"]
        host = request.get("host", "").split(":")[0].lower()
        if not watched(host):
            return None
        ip = str(ipaddress.ip_address(request["remote_ip"]))
        if is_own(ip):
            return None
        method = request["method"].upper()
        path = urlsplit(request["uri"]).path
        status = int(row["status"])
        if path in login_paths(host) and method == "POST" and status in (200, 401):
            return {"offset": offset, "ip": ip, "kind": "auth", "outcome": "success" if status == 200 else "failed"}
        if status == 403:
            return {"offset": offset, "ip": ip, "kind": "denied"}
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return None
    return None


def request(line: bytes):
    """(ip, window end, path, status, cross_site) for a request worth counting, else None."""
    try:
        row = json.loads(line)
        req = row["request"]
        if not watched(req.get("host", "").split(":")[0].lower()) or is_own(req["remote_ip"]):
            return None
        status = int(row["status"])
        path = urlsplit(req["uri"]).path
        if status == 403 or STATIC.search(path.lower()):
            return None  # 403 = already blocked by SENTINEL (reported as a denial)
        end = (int(float(row["ts"])) // WINDOW_S + 1) * WINDOW_S
        # A browser sends Sec-Fetch-Site and a page cannot change it: "cross-site" means another site made this
        # visitor's browser load the URL (e.g. <img src="our-site/.env">), so the visitor did not choose the path.
        cross_site = "cross-site" in (req.get("headers") or {}).get("Sec-Fetch-Site", [])
        return str(ipaddress.ip_address(req["remote_ip"])), end, path, status, cross_site
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return None


def add_request(totals: dict, record) -> None:
    ip, end, path, status, cross_site = record
    item = totals.setdefault((ip, end), {"ip": ip, "window_end": end, "count": 0, "not_found": 0, "paths": [], "honeypot": False})
    item["count"] += 1
    if status == 404:
        item["not_found"] += 1
    if cross_site:
        # Still counted (flood, many 404s go to a human), but the path is not sent: decoy and scanner-path hits are
        # blocked without a human, and that must not be triggerable through someone else's browser. A scanner that
        # fakes this header only loses the automatic block; its 404s still raise a WEB_SCAN incident.
        return
    decoy = path.lower() in HONEYPOT_PATHS
    item["honeypot"] |= decoy
    # Only decoy and not-found paths are kept (never query strings), decoys first: normal browsing stays private.
    clean = "".join(ch for ch in path if ch.isprintable())[:PATH_MAX]
    if (decoy or status == 404) and clean not in item["paths"]:
        if decoy:
            item["paths"] = [clean, *item["paths"]][:PATHS_MAX]
        elif len(item["paths"]) < PATHS_MAX:
            item["paths"].append(clean)


def read_log(inode: int | None, offset: int, start_at_end: bool, sensor=False):
    log_path = SENSOR_LOG if sensor else LOG
    if not log_path.exists():
        return {"inode": None, "offset": 0, "events": [], "requests": [], "more": False}
    with log_path.open("rb") as handle:
        stat = log_path.stat()
        if start_at_end:
            return {"inode": stat.st_ino, "offset": stat.st_size, "events": [], "requests": [], "more": False}
        if inode != stat.st_ino or offset > stat.st_size:
            offset = 0
        handle.seek(offset)
        events = []
        totals = {}
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
                record = request(line)
                if record:
                    add_request(totals, record)
            if item:
                events.append(item)
            offset = handle.tell()
        return {"inode": stat.st_ino, "offset": offset, "events": events,
                "requests": sorted(totals.values(), key=lambda r: (r["window_end"], r["ip"])), "more": consumed >= MAX_BYTES}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--inode", type=int)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--start-at-end", action="store_true")
    parser.add_argument("--sensor", action="store_true")
    args = parser.parse_args()
    if not args.sensor and not DOMAINS:
        raise SystemExit("site.json is missing domain or domains (see site.example.json)")
    print(json.dumps(read_log(args.inode, args.offset, args.start_at_end, args.sensor)))
