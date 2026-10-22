#!/usr/bin/env python3
"""SENTINEL sidecar — a tiny reverse proxy you put in FRONT of a real website so SENTINEL can
protect it without touching the site's code. Python stdlib only (no pip install).

Per request it: (1) asks SENTINEL whether the client IP is blocked -> 403 if so; (2) forwards to
the real site; (3) when the request is a login, reports the outcome to SENTINEL so detection runs.

Run (set these env vars):
  SENTINEL_URL        e.g. http://192.168.1.50:8000   (where SENTINEL backend listens)
  SENTINEL_ADMIN_KEY  the admin key SENTINEL was started with
  UPSTREAM            e.g. http://127.0.0.1:3000       (the real website this sidecar fronts)
  LISTEN_PORT         default 8080                      (clients hit the sidecar here)
  LOGIN_PATH          default /login                    (POST here = a login attempt)
  FAIL_STATUS         default 401,403                   (upstream statuses that mean "failed login")
  CLIENT_IP_HEADER    optional, e.g. X-Forwarded-For    (set only if the sidecar itself sits behind a CDN/LB)

  python sentinel_sidecar.py

Fail-open: if SENTINEL is unreachable, the sidecar forwards traffic anyway (never breaks the site)
and logs a warning. Blocking only happens on an explicit 403 from SENTINEL.
"""
import json
import os
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SENTINEL = os.environ["SENTINEL_URL"].rstrip("/")
ADMIN_KEY = os.environ["SENTINEL_ADMIN_KEY"]
UPSTREAM = os.environ["UPSTREAM"].rstrip("/")
PORT = int(os.environ.get("LISTEN_PORT", "8080"))
LOGIN_PATH = os.environ.get("LOGIN_PATH", "/login")
FAIL_STATUS = {int(s) for s in os.environ.get("FAIL_STATUS", "401,403").split(",") if s.strip()}
CLIENT_IP_HEADER = os.environ.get("CLIENT_IP_HEADER", "").strip()
HOP = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailers", "transfer-encoding", "upgrade", "content-length", "host"}


def sentinel_post(path, body):
    req = urllib.request.Request(SENTINEL + path, data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "X-Admin-Key": ADMIN_KEY})
    with urllib.request.urlopen(req, timeout=5) as r:
        return r.status, json.load(r)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def client_ip(self):
        if CLIENT_IP_HEADER:
            v = self.headers.get(CLIENT_IP_HEADER)
            if v:
                return v.split(",")[0].strip()
        return self.client_address[0]

    def handle_one(self):
        ip = self.client_ip()
        # 1. enforce — blocked IPs never reach the real site
        try:
            status, _ = sentinel_post("/api/enforce", {"client_ip": ip})
            if status == 403:
                self.reply(403, b'{"detail":"blocked by SENTINEL"}', {"Content-Type": "application/json"})
                return
        except urllib.error.HTTPError as e:
            if e.code == 403:
                self.reply(403, b'{"detail":"blocked by SENTINEL"}', {"Content-Type": "application/json"})
                return
            self.log_message("enforce error %s (fail-open)", e)
        except Exception as e:
            self.log_message("SENTINEL unreachable for enforce: %s (fail-open)", e)

        # 2. forward to the real website
        length = int(self.headers.get("Content-Length", 0) or 0)
        body = self.rfile.read(length) if length else None
        fwd = urllib.request.Request(UPSTREAM + self.path, data=body, method=self.command)
        for k, v in self.headers.items():
            if k.lower() not in HOP:
                fwd.add_header(k, v)
        fwd.add_header("X-Forwarded-For", ip)
        try:
            with urllib.request.urlopen(fwd, timeout=30) as up:
                up_status, up_body, up_headers = up.status, up.read(), up.headers
        except urllib.error.HTTPError as e:
            up_status, up_body, up_headers = e.code, e.read(), e.headers
        except Exception as e:
            self.reply(502, ("bad gateway: " + str(e)).encode(), {"Content-Type": "text/plain"})
            return

        # 3. report a login attempt so detection runs
        if self.command == "POST" and self.path.split("?")[0] == LOGIN_PATH:
            # A login succeeds only on 2xx; 401, 429 (rate limit), 400, etc. all count as a
            # failed attempt so rapid brute force that the site throttles is still detected.
            outcome = "success" if 200 <= up_status < 300 else "failed"
            try:
                sentinel_post("/api/events", {"source_ip": ip, "event_type": "HTTP_AUTH", "outcome": outcome})
            except Exception as e:
                self.log_message("event report failed: %s", e)

        out = {k: v for k, v in up_headers.items() if k.lower() not in HOP}
        self.reply(up_status, up_body, out)

    def reply(self, status, body, headers):
        self.send_response(status)
        for k, v in headers.items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    do_GET = do_POST = do_PUT = do_DELETE = do_PATCH = do_HEAD = do_OPTIONS = handle_one


if __name__ == "__main__":
    print(f"SENTINEL sidecar: :{PORT} -> {UPSTREAM}  | SENTINEL {SENTINEL} | login {LOGIN_PATH} fail={sorted(FAIL_STATUS)}", flush=True)
    try:
        ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        sys.exit(0)
