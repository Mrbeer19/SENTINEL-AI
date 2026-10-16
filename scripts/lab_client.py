"""Bounded demo client for your own private LAN SENTINEL server."""

import argparse
import ipaddress
import json
import time
import urllib.error
import urllib.parse
import urllib.request


def main():
    parser = argparse.ArgumentParser(description="Send demo login events or a verification request to your SENTINEL lab")
    parser.add_argument("--server", required=True, help="Private IPv4 URL, e.g. http://192.168.1.10:8000")
    parser.add_argument("--action", choices=["login", "traffic"], default="traffic")
    args = parser.parse_args()
    url = urllib.parse.urlparse(args.server)
    try:
        address = ipaddress.ip_address(url.hostname or "")
    except ValueError:
        parser.error("Use a private IPv4 address literal")
    networks = [ipaddress.ip_network(value) for value in ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8"]]
    if url.scheme not in {"http", "https"} or not any(address in network for network in networks) or url.username or url.password or url.path not in {"", "/"} or url.query or url.fragment:
        parser.error("Server must be an HTTP(S) URL on your private IPv4 lab without a path or credentials")
    endpoint = "/api/demo/login" if args.action == "login" else "/api/demo/traffic"
    payload = {"username": "student", "password": "demo-wrong-password"} if args.action == "login" else {}
    for attempt in range(6 if args.action == "login" else 1):
        request = urllib.request.Request(args.server.rstrip("/") + endpoint, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                print(attempt + 1, response.status, response.read().decode())
        except urllib.error.HTTPError as response:
            print(attempt + 1, response.code, response.read().decode())
        except urllib.error.URLError as error:
            raise SystemExit(f"Could not reach lab server: {error.reason}")
        time.sleep(0.3)


if __name__ == "__main__":
    main()
