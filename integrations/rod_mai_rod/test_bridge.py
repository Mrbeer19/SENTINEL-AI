"""Focused tests for the VPS rule and log boundary."""

import json
import unittest
from datetime import datetime, timezone

import vps_logs
from vps_logs import event
from vps_rules import active_ips, snippet_for


class BridgeTests(unittest.TestCase):
    def test_only_target_login_results_are_ingested(self):
        vps_logs.DOMAIN = "site.example.test"
        row = {"request": {"host": "site.example.test", "remote_ip": "192.0.2.7", "method": "POST", "uri": "/api/v1/auth/login"}, "status": 401}
        self.assertEqual(event(json.dumps(row).encode(), 42), {"offset": 42, "ip": "192.0.2.7", "kind": "auth", "outcome": "failed"})
        row["request"]["host"] = "other.example.test"
        self.assertIsNone(event(json.dumps(row).encode(), 42))

    def test_only_unexpired_valid_ips_become_caddy_matcher(self):
        now = datetime(2026, 10, 22, tzinfo=timezone.utc)
        rows = [{"source_ip": "192.0.2.8", "expires_at": "2026-10-23T00:00:00+00:00"},
                {"source_ip": "192.0.2.7", "expires_at": "2026-10-21T00:00:00+00:00"}]
        self.assertEqual(active_ips(rows, now), ["192.0.2.8"])
        self.assertIn("remote_ip 192.0.2.8", snippet_for(active_ips(rows, now)))
        with self.assertRaises(ValueError):
            active_ips([{"source_ip": "1.2.3.4\nrespond * 200", "expires_at": rows[0]["expires_at"]}], now)


def access_line(path, status=200, ip="192.0.2.7", ts=1793443873.5, host="site.example.test", method="GET"):
    return json.dumps({"ts": ts, "status": status, "request": {"host": host, "remote_ip": ip, "method": method, "uri": path}}).encode() + b"\n"


class RequestTotalsTest(unittest.TestCase):
    def setUp(self):
        import tempfile
        from pathlib import Path
        from unittest import mock
        vps_logs.DOMAIN = "site.example.test"
        self.log = Path(tempfile.mkdtemp()) / "access.log"
        patcher = mock.patch.object(vps_logs, "LOG", self.log)
        patcher.start()
        self.addCleanup(patcher.stop)

    def totals(self, *lines):
        self.log.write_bytes(b"".join(lines))
        return vps_logs.read_log(None, 0, False)["requests"]

    def test_pages_are_summed_per_ip_and_window_and_static_files_are_not(self):
        lines = [access_line("/trips")] * 3 + [access_line("/_next/static/chunks/a.js"), access_line("/assets/mascots/x.png"),
                 access_line("/api/v1/maps/flood/3days/13/6403/3777"), access_line("/fonts/a.woff2"), access_line("/favicon.ico", 404)]
        lines += [access_line("/trips", ip="192.0.2.8"), access_line("/trips", ts=1793443881.0)]
        rows = self.totals(*lines)
        self.assertEqual([(r["ip"], r["window_end"], r["count"]) for r in rows],
                         [("192.0.2.7", 1793443880, 3), ("192.0.2.8", 1793443880, 1), ("192.0.2.7", 1793443890, 1)])
        self.assertEqual(rows[0]["paths"], [])  # normal pages are never sent

    def test_not_found_and_decoy_paths_are_kept_without_query(self):
        rows = self.totals(access_line("/.env?x=1", 404), access_line("/wp-login.php", 404), access_line("/.env", 404),
                           access_line("/admin-backup.zip", 404), access_line("/api/v1/me", 401))
        [row] = rows
        self.assertEqual((row["count"], row["not_found"], row["honeypot"]), (5, 4, True))
        self.assertEqual(row["paths"], ["/admin-backup.zip", "/.env", "/wp-login.php"])

    def test_paths_are_capped_and_cleaned(self):
        rows = self.totals(*[access_line(f"/p{n}" + "a" * 200 + "\x1b", 404) for n in range(8)])
        self.assertEqual(len(rows[0]["paths"]), 5)
        self.assertTrue(all(len(p) == 100 and p.isprintable() for p in rows[0]["paths"]))

    def test_blocked_requests_and_other_sites_are_not_counted(self):
        self.assertEqual(self.totals(access_line("/trips", 403), access_line("/trips", host="other.example.test")), [])

    def test_bridge_sends_one_http_request_event_per_total(self):
        import agent
        event_body = agent.request_event({"ip": "192.0.2.7", "window_end": 1793443880, "count": 3, "not_found": 1, "paths": ["/.env"], "honeypot": False})
        self.assertEqual(event_body, {"source_ip": "192.0.2.7", "event_type": "HTTP_REQUEST", "timestamp": "2026-10-31T10:51:20+00:00",
                                      "window_s": 10, "count": 3, "not_found": 1, "paths": ["/.env"], "honeypot": False})


class LocalModeTest(unittest.TestCase):
    def test_local_mode_runs_the_command_without_ssh(self):
        import types
        from unittest import mock
        import agent
        args = types.SimpleNamespace(local=True)
        with mock.patch.object(agent.subprocess, "run", return_value=types.SimpleNamespace(returncode=0, stdout="ok\n", stderr="")) as run:
            self.assertEqual(agent.ssh(args, "python3 /x/vps_logs.py --start-at-end"), "ok")
        self.assertEqual(run.call_args.args[0], ["sh", "-c", "python3 /x/vps_logs.py --start-at-end"])


if __name__ == "__main__":
    unittest.main()
