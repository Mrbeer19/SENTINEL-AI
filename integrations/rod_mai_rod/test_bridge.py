"""Focused tests for the VPS rule and log boundary."""

import json
import unittest
from datetime import datetime, timezone

import vps_logs
from vps_logs import event
from vps_rules import active_ips, snippet_for


class BridgeTests(unittest.TestCase):
    def test_only_target_login_results_are_ingested(self):
        vps_logs.DOMAINS = frozenset({"site.example.test"})
        vps_logs.LOGIN_PATHS = {"site.example.test": frozenset({"/api/v1/auth/login"})}
        row = {"request": {"host": "site.example.test", "remote_ip": "192.0.2.7", "method": "POST", "uri": "/api/v1/auth/login"}, "status": 401}
        self.assertEqual(event(json.dumps(row).encode(), 42), {"offset": 42, "ip": "192.0.2.7", "kind": "auth", "outcome": "failed"})
        row["request"]["host"] = "other.example.test"
        self.assertIsNone(event(json.dumps(row).encode(), 42))

    def test_every_watched_site_is_read_but_login_only_where_configured(self):
        vps_logs.DOMAINS = frozenset({"site.example.test", "dash.example.test"})
        vps_logs.LOGIN_PATHS = {"site.example.test": frozenset({"/api/v1/auth/login"}), "dash.example.test": frozenset()}
        login = {"request": {"host": "site.example.test", "remote_ip": "192.0.2.7", "method": "POST", "uri": "/api/v1/auth/login"}, "status": 401}
        self.assertEqual(event(json.dumps(login).encode(), 1)["kind"], "auth")
        login["request"]["host"] = "dash.example.test"  # no login on this site: a 401 there is not a failed login
        self.assertIsNone(event(json.dumps(login).encode(), 1))
        denied = {"request": {"host": "dash.example.test", "remote_ip": "192.0.2.7", "method": "GET", "uri": "/"}, "status": 403}
        self.assertEqual(event(json.dumps(denied).encode(), 2)["kind"], "denied")

    def test_only_unexpired_valid_ips_become_caddy_matcher(self):
        now = datetime(2026, 10, 22, tzinfo=timezone.utc)
        rows = [{"source_ip": "192.0.2.8", "expires_at": "2026-10-23T00:00:00+00:00"},
                {"source_ip": "192.0.2.7", "expires_at": "2026-10-21T00:00:00+00:00"}]
        self.assertEqual(active_ips(rows, now), ["192.0.2.8"])
        self.assertIn("remote_ip 192.0.2.8", snippet_for(active_ips(rows, now)))
        with self.assertRaises(ValueError):
            active_ips([{"source_ip": "1.2.3.4\nrespond * 200", "expires_at": rows[0]["expires_at"]}], now)


def access_line(path, status=200, ip="192.0.2.7", ts=1793443873.5, host="site.example.test", method="GET", fetch_site=None):
    request = {"host": host, "remote_ip": ip, "method": method, "uri": path}
    if fetch_site:
        request["headers"] = {"Sec-Fetch-Site": [fetch_site]}
    return json.dumps({"ts": ts, "status": status, "request": request}).encode() + b"\n"


class RequestTotalsTest(unittest.TestCase):
    def setUp(self):
        import tempfile
        from pathlib import Path
        from unittest import mock
        vps_logs.DOMAINS = frozenset({"site.example.test"})
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

    def test_cross_site_hits_are_counted_but_never_sent_as_decoy_or_scanner_paths(self):
        # <img src="our-site/backup.sql"> on another site: the visitor's browser asks for it with Sec-Fetch-Site: cross-site.
        lines = [access_line("/admin-backup.zip", 404, fetch_site="cross-site"), access_line("/.env", 404, fetch_site="cross-site"),
                 access_line("/.git/config", 404, fetch_site="cross-site"), access_line("/wp-admin/", 404, fetch_site="cross-site")]
        [row] = self.totals(*lines)
        self.assertEqual((row["count"], row["not_found"], row["honeypot"], row["paths"]), (4, 4, False, []))

    def test_same_origin_and_scanner_requests_still_count_as_decoy_hits(self):
        rows = self.totals(access_line("/admin-backup.zip", 404, fetch_site="same-origin"), access_line("/backup.sql", 404, ip="192.0.2.8"))
        self.assertEqual([(r["honeypot"], r["paths"]) for r in rows], [(True, ["/admin-backup.zip"]), (True, ["/backup.sql"])])

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


class ApplyRulesTest(unittest.TestCase):
    def test_direct_caddyfile_import_in_every_site_is_validated_then_reloaded(self):
        import tempfile
        from pathlib import Path
        from unittest import mock
        import vps_rules
        tmp = Path(tempfile.mkdtemp())
        caddyfile = tmp / "Caddyfile"
        caddyfile.write_text("a.test {\n    import /config/sentinel-block.caddy\n}\nb.test {\n    import /config/sentinel-block.caddy\n}\n")
        (tmp / "rules.json").write_text(json.dumps([{"source_ip": "192.0.2.9", "expires_at": "9999-12-31T00:00:00+00:00"}]))
        seen = []

        def run(cmd, **_):
            if "validate" in cmd:  # the candidate config must point every site at the candidate snippet
                seen.append((tmp / cmd[cmd.index("--config") + 1].removeprefix("/config/")).read_text())
            return mock.Mock()
        with mock.patch.multiple(vps_rules, CADDYFILE=caddyfile, ACTIVE_CONFIG=None, RULES=tmp / "rules.json",
                                 SNIPPET=tmp / "sentinel-block.caddy", CADDY_DIR=tmp, CADDY_CONTAINER="caddy",
                                 IMPORT="import /config/sentinel-block.caddy", BLOCK_SNIPPET="sentinel-block.caddy",
                                 RELOAD_CONFIG="/etc/caddy/Caddyfile"), mock.patch.object(vps_rules.subprocess, "run", side_effect=run) as call:
            self.assertTrue(vps_rules.apply())
        self.assertEqual(seen[0].count("import /config/sentinel-block.caddy.candidate"), 2)
        self.assertEqual(call.call_args.args[0][-4:], ["--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"])
        self.assertIn("remote_ip 192.0.2.9", (tmp / "sentinel-block.caddy").read_text())
        self.assertEqual(caddyfile.read_text().count("import /config/sentinel-block.caddy\n"), 2)  # shared file untouched


class OwnTrafficTest(unittest.TestCase):
    def setUp(self):
        import ipaddress
        from unittest import mock
        patches = [mock.patch.object(vps_logs, "OWN_ADDRESSES", frozenset({ipaddress.ip_address("203.0.113.5"), ipaddress.ip_address("172.18.0.1")})),
                   mock.patch.object(vps_logs, "INTERNAL_NETS", (ipaddress.ip_network("172.18.0.0/16"),)),
                   mock.patch.object(vps_logs, "DOMAINS", frozenset({"*"})),
                   mock.patch.object(vps_logs, "LOGIN_PATHS", {"*": frozenset()})]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def test_the_vps_and_its_containers_are_not_visitors(self):
        for ip in ("203.0.113.5", "172.18.0.1", "172.18.0.7", "127.0.0.1"):
            self.assertIsNone(vps_logs.request(access_line("/", ip=ip)), ip)
            self.assertIsNone(event(access_line("/", status=403, ip=ip), 1), ip)
        # a neighbour in the VPS's public /24 is an ordinary client
        self.assertEqual(vps_logs.request(access_line("/", ip="203.0.113.77"))[0], "203.0.113.77")

    def test_wildcard_watches_sites_added_later(self):
        self.assertEqual(vps_logs.request(access_line("/", ip="198.51.100.4", host="new-site.example.test"))[0], "198.51.100.4")
        self.assertEqual(event(access_line("/", status=403, ip="198.51.100.4", host="another.example.test"), 1)["kind"], "denied")

    def test_site_snippet_import_is_validated_with_the_candidate_block_list(self):
        import tempfile
        from pathlib import Path
        from unittest import mock
        import vps_rules
        tmp = Path(tempfile.mkdtemp())
        caddyfile = tmp / "Caddyfile"
        caddyfile.write_text("new.test {\n    import /config/sentinel-site.caddy\n}\n")  # no direct block import
        (tmp / "sentinel-site.caddy").write_text("import /config/sentinel-block.caddy\nlog\n")
        (tmp / "rules.json").write_text(json.dumps([{"source_ip": "192.0.2.10", "expires_at": "9999-12-31T00:00:00+00:00"}]))
        seen = {}

        def run(cmd, **_):
            if "validate" in cmd:
                seen["config"] = (tmp / cmd[cmd.index("--config") + 1].removeprefix("/config/")).read_text()
                seen["site"] = (tmp / "sentinel-site.caddy.candidate").read_text()
            return mock.Mock()
        with mock.patch.multiple(vps_rules, CADDYFILE=caddyfile, ACTIVE_CONFIG=None, RULES=tmp / "rules.json",
                                 SNIPPET=tmp / "sentinel-block.caddy", CADDY_DIR=tmp, CADDY_CONTAINER="caddy",
                                 IMPORT="import /config/sentinel-block.caddy", BLOCK_SNIPPET="sentinel-block.caddy",
                                 SITE_SNIPPET=tmp / "sentinel-site.caddy", SITE_IMPORT="import /config/sentinel-site.caddy",
                                 SITE_NAME="sentinel-site.caddy", RELOAD_CONFIG="/etc/caddy/Caddyfile"), \
                mock.patch.object(vps_rules.subprocess, "run", side_effect=run):
            self.assertTrue(vps_rules.apply())
        self.assertIn("import /config/sentinel-site.caddy.candidate", seen["config"])
        self.assertIn("import /config/sentinel-block.caddy.candidate", seen["site"])
        self.assertIn("remote_ip 192.0.2.10", (tmp / "sentinel-block.caddy").read_text())
        self.assertFalse((tmp / "sentinel-site.caddy.candidate").exists())
        self.assertEqual((tmp / "sentinel-site.caddy").read_text(), "import /config/sentinel-block.caddy\nlog\n")
