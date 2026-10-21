"""Focused tests for the VPS rule and log boundary."""

import json
import unittest
from datetime import datetime, timezone

from vps_logs import event
from vps_rules import active_ips, snippet_for


class BridgeTests(unittest.TestCase):
    def test_only_target_login_results_are_ingested(self):
        row = {"request": {"host": "rod-mai-rod.tntproduction.tech", "remote_ip": "192.0.2.7", "method": "POST", "uri": "/api/v1/auth/login"}, "status": 401}
        self.assertEqual(event(json.dumps(row).encode(), 42), {"offset": 42, "ip": "192.0.2.7", "kind": "auth", "outcome": "failed"})
        row["request"]["host"] = "rangsitnanmai.tntproduction.tech"
        self.assertIsNone(event(json.dumps(row).encode(), 42))

    def test_only_unexpired_valid_ips_become_caddy_matcher(self):
        now = datetime(2026, 10, 22, tzinfo=timezone.utc)
        rows = [{"source_ip": "192.0.2.8", "expires_at": "2026-10-23T00:00:00+00:00"},
                {"source_ip": "192.0.2.7", "expires_at": "2026-10-21T00:00:00+00:00"}]
        self.assertEqual(active_ips(rows, now), ["192.0.2.8"])
        self.assertIn("remote_ip 192.0.2.8", snippet_for(active_ips(rows, now)))
        with self.assertRaises(ValueError):
            active_ips([{"source_ip": "1.2.3.4\nrespond * 200", "expires_at": rows[0]["expires_at"]}], now)


if __name__ == "__main__":
    unittest.main()
