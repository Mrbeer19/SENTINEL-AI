"""Offline regression checks; no network connections are permitted."""
import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
import urllib.error

import vps_live_test as live


class LiveTests(unittest.TestCase):
    def setUp(self):
        self.output = contextlib.redirect_stdout(io.StringIO())
        self.output.__enter__()
        self.network = patch.object(live, 'opener', side_effect=AssertionError('real network forbidden'))
        self.network.start()
        self.socket = patch.object(live.socket, 'create_connection', side_effect=AssertionError('real TCP forbidden'))
        self.socket.start()
        self.journal = MagicMock()
        self.test = live.LiveTest('192.0.2.1', 'example.test', self.journal)

    def tearDown(self):
        self.socket.stop()
        self.network.stop()
        self.output.__exit__(None, None, None)

    def test_ip_and_site_validation(self):
        self.assertEqual(live.validate_ip(' 2001:db8::1 '), '2001:db8::1')
        self.assertEqual(live.validate_ip('192.0.2.1'), '192.0.2.1')
        for value in ['example.com', '999.1.1.1', '::1%lo0']:
            with self.assertRaises(ValueError):
                live.validate_ip(value)
        for value in ['https://example.com', 'user@example.com', 'example.com/a', 'example.com:443']:
            with self.assertRaises(ValueError):
                live.validate_site(value)

    def test_paths_and_usernames(self):
        paths = live.scan_paths()
        self.assertEqual(len(set(paths)), 12)
        self.assertIn('/.git/config', paths)
        self.assertNotIn('/backup.sql', paths)
        names = {live.random_username() for _ in range(20)}
        self.assertEqual(len(names), 20)
        self.assertTrue(all(n.startswith('sentinel-test-') for n in names))

    def test_status_messages(self):
        for value in [200, 403, 'timeout', 502, 'network_error']:
            self.assertIn(str(value), live.status_text(value))

    def test_http_outcomes_and_timeout(self):
        with patch.object(live, 'opener') as factory:
            client = factory.return_value
            client.open.return_value.__enter__.return_value.status = 200
            self.assertEqual(live.http_status(self.test.url), 200)
            client.open.assert_called_once_with(self.test.url, timeout=5)
            for error, expected in [(urllib.error.HTTPError(self.test.url, 403, '', {}, io.BytesIO()), 403),
                                    (TimeoutError(), 'timeout'),
                                    (urllib.error.URLError(TimeoutError()), 'timeout'),
                                    (urllib.error.URLError('failed'), 'network_error')]:
                client.open.side_effect = error
                self.assertEqual(live.http_status(self.test.url), expected)
        self.assertIsNone(live.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://other.test'))

    def test_bounded_web_and_tcp_cases(self):
        with patch.object(live, 'http_status', return_value=200) as request, patch.object(live.time, 'sleep'):
            for case, count in [('1', 1), ('2', 12), ('3', 320)]:
                request.reset_mock()
                self.test.run_case(case)
                self.assertEqual(request.call_count, count)
                self.assertTrue(all(c.args[0].startswith(self.test.url) for c in request.call_args_list))
            self.assertTrue(all(c.args[0] == self.test.url for c in request.call_args_list))
        with patch.object(self.test, 'tcp') as tcp, patch.object(live.time, 'sleep'):
            self.test.run_case('5')
            self.assertEqual([c.args[1] for c in tcp.call_args_list], list(live.PORTS))
            self.assertTrue(all(c.kwargs['timeout'] == 1 for c in tcp.call_args_list))
            tcp.reset_mock()
            self.test.run_case('6')
            self.assertEqual(tcp.call_count, 110)
            self.assertTrue(all(c.args[1] == 22 for c in tcp.call_args_list))

    def test_tcp_closes_and_reports_timeout(self):
        with patch.object(live.socket, 'create_connection') as connect:
            self.test.tcp('5', 21, 1, timeout=1)
            connect.assert_called_once_with(('192.0.2.1', 21), timeout=1)
            connect.return_value.__exit__.assert_called_once()
            connect.side_effect = TimeoutError
            self.test.tcp('5', 21, 2, timeout=1)
            self.assertEqual(self.journal.record.call_args.args[2], 'timeout')

    def test_block_unblock_evidence_and_initial_block(self):
        with patch.object(live, 'http_status', side_effect=[200, 403, 403, 200, 200, 200, 200]), patch.object(live.time, 'sleep'):
            self.assertTrue(self.test.wait_status(403, '1', live.time.monotonic()))
            self.assertTrue(self.test.wait_status(200, '1'))
            self.assertTrue(self.test.evidence())
        with patch.object(live, 'http_status', side_effect=[403, 403, 200]), patch.object(live.time, 'sleep'):
            self.assertTrue(self.test.ready())
        with patch.object(live, 'http_status', side_effect=[200, 403, 200]):
            self.assertFalse(self.test.evidence())

    def test_wait_deadline_and_interrupt(self):
        with patch.object(live.time, 'monotonic', side_effect=[0, 601]):
            self.assertFalse(self.test.wait_status(403, '1', 0))
        with patch.object(self.test, 'check', side_effect=KeyboardInterrupt):
            with self.assertRaises(KeyboardInterrupt):
                self.test.wait_status(403, '1', 0)
        with patch('builtins.input', side_effect=['1', KeyboardInterrupt(), '0']), patch.object(self.test, 'ready', return_value=True):
            live.menu(self.test)

    def test_ssh_random_credentials_no_secrets_in_log(self):
        module = MagicMock()
        module.AuthenticationException = type('AuthError', (Exception,), {})
        module.SSHException = type('SSHError', (Exception,), {})
        client = module.SSHClient.return_value
        client.connect.side_effect = module.AuthenticationException('secret-password')
        with patch.object(live.time, 'sleep'):
            self.assertTrue(self.test.ssh(module))
        calls = client.connect.call_args_list
        self.assertEqual(len(calls), 6)
        self.assertEqual(len({c.kwargs['username'] for c in calls}), 6)
        for call in calls:
            self.assertFalse(call.kwargs['allow_agent'])
            self.assertFalse(call.kwargs['look_for_keys'])
            self.assertEqual(call.kwargs['timeout'], 5)
            self.assertNotIn(call.kwargs['password'], str(self.journal.mock_calls))
        self.assertEqual(client.close.call_count, 6)
        self.assertNotIn('secret-password', str(self.journal.mock_calls))

    def test_self_target_stops_before_http(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(live, 'ask_target', return_value=('192.0.2.1', 'example.test')), patch.object(live, 'public_ip', return_value='192.0.2.1'), patch.object(live, 'Journal', return_value=self.journal), patch.object(live, 'http_status') as request:
            live.main()
            request.assert_not_called()
            self.journal.close.assert_called_once()

    def test_cancel_and_missing_paramiko_never_fire(self):
        with patch('builtins.input', side_effect=['1', 'n', '0']), patch.object(self.test, 'ready', return_value=True), patch.object(self.test, 'run_case') as run:
            live.menu(self.test)
            run.assert_not_called()
        with patch.dict('sys.modules', {'paramiko': None}), patch('builtins.input', side_effect=['4', '0']), patch.object(self.test, 'run_case') as run:
            live.menu(self.test)
            run.assert_not_called()

    def test_full_menu_lifecycle(self):
        with patch('builtins.input', side_effect=['1', 'y', '0']), patch.object(live, 'http_status', side_effect=[200, 200, 200, 403, 403, 200, 200, 200, 200]) as request, patch.object(live.time, 'sleep') as sleep:
            live.menu(self.test)
            self.assertEqual(request.call_count, 9)
            self.assertEqual(sleep.call_args_list, [unittest.mock.call(5), unittest.mock.call(5)])
            self.assertTrue(any(c.args[2] == 'unblocked_verified' for c in self.journal.record.call_args_list))

    def test_flood_limits_worker_count_and_pacing(self):
        executor = live.concurrent.futures.ThreadPoolExecutor
        with patch.object(live.concurrent.futures, 'ThreadPoolExecutor', wraps=executor) as pool, patch.object(live, 'http_status', return_value=200), patch.object(live.time, 'monotonic', return_value=0), patch.object(live.time, 'sleep') as sleep:
            self.test.run_case('3')
            pool.assert_called_once_with(max_workers=5)
            self.assertEqual(sleep.call_count, 320)
            self.assertAlmostEqual(sleep.call_args.args[0], 39.875)

    def test_jsonl(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'test.jsonl'
            journal = live.Journal(path)
            journal.record('1', self.test.url, 403)
            journal.close()
            row = json.loads(path.read_text())
            self.assertEqual(row['result'], 403)
            self.assertIn('time', row)
            self.assertEqual(row['test'], '1')


if __name__ == '__main__':
    unittest.main()
