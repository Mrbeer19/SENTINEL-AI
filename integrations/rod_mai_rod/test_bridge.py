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
