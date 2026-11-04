#!/usr/bin/env python3
"""Bounded, interactive VPS checks. Python 3.9+, optional paramiko."""
import concurrent.futures
from datetime import datetime, timezone
import ipaddress
import json
from pathlib import Path
import secrets
import socket
import time
import urllib.error
import urllib.request

DEFAULT_SITE = 'rangsitnanmai.tntstudio.tech'
PORTS = (21, 23, 25, 110, 143, 445, 3306, 3389, 5432, 6379, 8080, 8443)
LOGIN_PATH = '/api/v1/auth/login'  # rod-mai-rod login API; the bridge counts its 401/200 as login results
LABELS = ('Honeypot — HONEYPOT (กฎ ไม่ผ่าน AI)', 'Web scan — WEB_SCAN (กฎ ไม่ผ่าน AI)',
          'HTTP flood — HTTP_FLOOD (กฎ ไม่ผ่าน AI)', 'SSH เดารหัส — SSH_BRUTE_FORCE (AI / 3D)',
          'Port scan — PORT_SCAN (AI / 3D)', 'Connection flood — TRAFFIC_ANOMALY (AI / 3D) · ยิงเป็นข้อสุดท้าย',
          'ล็อกอินเว็บผิดซ้ำ (รอดไม่รอด) — HTTP_AUTH_BRUTE_FORCE (AI / 3D)',
          'Honeypot ผ่านเว็บอื่น (<img>) — ต้องไม่บล็อก · ยิงก่อนข้อ 1')
# SENTINEL_AUTO_APPROVE=1 blocks these without a human (honeypot, scanner paths); the others wait for an admin.
AUTO_CASES = ('1', '2')
# What a browser sends when another site's <img> loads our URL. A page cannot change these headers.
CROSS_SITE_HEADERS = {'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'no-cors', 'Sec-Fetch-Dest': 'image'}
NO_BLOCK_WAIT_S = 45  # bridge windows are 10 s; a honeypot block normally shows within a few seconds


def validate_ip(value):
    if '%' in value:
        raise ValueError('ไม่รับ IP ที่มี scope')
    return str(ipaddress.ip_address(value.strip()))


def validate_site(value):
    host = value.strip().rstrip('.').encode('idna').decode('ascii').lower()
    if len(host) > 253 or any(not p or len(p) > 63 or p.startswith('-') or p.endswith('-')
        or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in p)
        for p in host.split('.')):
        raise ValueError('กรอกชื่อเว็บเท่านั้น')
    return host


def scan_paths():
    return ['/.env', '/wp-admin/', '/phpmyadmin/', '/admin.php', '/.git/config'] + [
        '/sentinel-missing-' + secrets.token_hex(8) for _ in range(7)]


def random_username():
    return 'sentinel-test-' + secrets.token_hex(12)


def status_text(status):
    return {200: '200 = ยังไม่บล็อก / เข้าเว็บได้', 403: '403 = โดนบล็อก',
            'timeout': 'timeout = หมดเวลารอ (ยังสรุปการบล็อกไม่ได้)'}.get(
                status, '{} = ยังสรุปการบล็อกไม่ได้'.format(status))


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def opener():
    # Ignore environment proxies and never follow redirects to another target.
    return urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())


def http_status(url, data=None, headers=None):
    try:
        if data is None and not headers:
            target = url
        elif data is None:
            target = urllib.request.Request(url, headers=headers)
        else:
            target = urllib.request.Request(url, data=data, method='POST',
                                            headers={'Content-Type': 'application/json'})
        with opener().open(target, timeout=5) as response:
            return response.status
    except urllib.error.HTTPError as error:
        code = error.code
        error.close()
        return code
    except (TimeoutError, socket.timeout):
        return 'timeout'
    except urllib.error.URLError as error:
        return 'timeout' if isinstance(error.reason, TimeoutError) else 'network_error'
    except OSError:
        return 'network_error'


def public_ip():
    # Identity lookup only, never a test target.
    with opener().open('https://api.ipify.org', timeout=5) as response:
        return validate_ip(response.read(128).decode('ascii'))


class Journal:
    def __init__(self, path):
        self.file = Path(path).open('x', encoding='utf-8')

    def record(self, case, target, result, **details):
        self.file.write(json.dumps(dict(time=datetime.now(timezone.utc).isoformat(),
            test=case, target=target, result=result, **details), ensure_ascii=False) + '\n')
        self.file.flush()

    def close(self):
        self.file.close()


class LiveTest:
    def __init__(self, ip, site, journal):
        self.ip, self.site, self.journal = ip, site, journal
        self.login_site = None
        self.url = 'https://' + site + '/'

    def report(self, case, target, result, count=None):
        self.journal.record(case, target, result, count=count)
        print('{} {} {} → {}'.format(datetime.now().strftime('%H:%M:%S'),
              count or '', target, result), flush=True)

    def check(self, case):
        result = http_status(self.url)
        self.report(case, self.url, result)
        print(status_text(result), flush=True)
        return result

    def wait_status(self, expected, case, started=None, limit=600):
        deadline = time.monotonic() + limit
        while time.monotonic() < deadline:
            if self.check(case) == expected:
                if expected == 403:
                    elapsed = time.monotonic() - started if started is not None else 0
                    print('\n*** โดนบล็อกแล้ว — {:.1f} วินาทีตั้งแต่เริ่มยิง ***\n'.format(elapsed))
                    self.journal.record(case, self.url, 'blocked', elapsed_seconds=elapsed)
                return True
            time.sleep(min(5, max(0, deadline - time.monotonic())))
        print('ครบ {} นาที กลับเมนูโดยยังไม่ยืนยันผล'.format(limit // 60))
        self.journal.record(case, self.url, 'wait_timeout', expected=expected)
        return False

    def ready(self):
        result = self.check('preflight')
        if result == 403:
            print('เครื่องนี้ถูกบล็อกค้าง ไปที่ dashboard → Protection เพื่อปลดบล็อกก่อน')
            return self.wait_status(200, 'preflight')
        if result != 200:
            print('ต้องได้ HTTP 200 ก่อนเริ่ม กรุณาตรวจเว็บและการเชื่อมต่อ')
        return result == 200

    def send_http(self, case, path, count, headers=None):
        url = self.url.rstrip('/') + path
        result = http_status(url, headers=headers)
        self.report(case, url, result, count)
        return result

    def tcp(self, case, port, count, timeout=5):
        try:
            with socket.create_connection((self.ip, port), timeout=timeout):
                result = 'connected_then_closed'
        except (TimeoutError, socket.timeout):
            result = 'timeout'
        except OSError:
            result = 'closed_or_filtered'
        self.report(case, '{}:{}'.format(self.ip, port), result, count)

    def ssh(self, module):
        # One connection, six password guesses (sshd MaxAuthTries 6). OpenSSH 9.8+ PerSourcePenalties adds a
        # penalty per failed *connection* (authfail:5s, enforced from 15s), so six separate connections would be
        # refused part-way and log fewer than the 5 failures SSH_BRUTE_FORCE needs.
        username = random_username()
        transport = None
        try:
            transport = module.Transport(socket.create_connection((self.ip, 22), timeout=5))
            transport.banner_timeout = 5
            transport.auth_timeout = 5
            transport.start_client(timeout=5)
        except (OSError, module.SSHException):
            self.report('4', self.ip + ':22', 'ssh_connection_error', 0)
            if transport is not None:
                transport.close()
            return False
        try:
            for index in range(6):
                try:
                    transport.auth_password(username, secrets.token_urlsafe(32))
                    self.report('4', self.ip + ':22', 'unexpected_login_success', index + 1)
                    print('หยุด: บัญชีสุ่มล็อกอินสำเร็จโดยไม่คาดคิด')
                    return False
                except module.AuthenticationException:
                    self.report('4', self.ip + ':22', 'authentication_failed', index + 1)
                except (OSError, module.SSHException, EOFError):
                    # sshd closes after its last allowed try. Never log exception strings or credentials.
                    self.report('4', self.ip + ':22', 'ssh_connection_closed', index + 1)
                    break
                if not transport.is_active():
                    break
        finally:
            transport.close()
        return True

    def login(self, site, count):
        # A wrong password for a made-up account: the site must answer 401 for it to count as a failed login.
        url = 'https://' + site + LOGIN_PATH
        body = json.dumps({'email': 'sentinel-test-{}@example.com'.format(secrets.token_hex(4)),
                           'password': secrets.token_urlsafe(24)}).encode()
        result = http_status(url, data=body)
        self.report('7', url, result, count)
        return result

    def expect_no_block(self, case):
        """Case 8 passes when the site still answers 200 for NO_BLOCK_WAIT_S seconds."""
        deadline = time.monotonic() + NO_BLOCK_WAIT_S
        while time.monotonic() < deadline:
            if self.check(case) == 403:
                print('\n*** ผิดคาด: โดนบล็อกจาก request แบบ cross-site — ตรวจว่า bridge บน VPS เป็นเวอร์ชัน #41 ***\n')
                self.journal.record(case, self.url, 'blocked_unexpected')
                return False
            time.sleep(min(5, max(0, deadline - time.monotonic())))
        print('\n*** ผ่าน: {} วินาทีแล้วยังได้ 200 — <img> จากเว็บอื่นทำให้คนจริงโดนบล็อกไม่ได้ ***\n'.format(NO_BLOCK_WAIT_S))
        self.journal.record(case, self.url, 'not_blocked_ok', waited_seconds=NO_BLOCK_WAIT_S)
        return True

    def run_case(self, case, module=None):
        if case == '1':
            self.send_http(case, '/backup.sql', 1)
        elif case == '8':
            self.send_http(case, '/backup.sql', 1, headers=CROSS_SITE_HEADERS)
        elif case == '2':
            for index, path in enumerate(scan_paths(), 1):
                self.send_http(case, path, index)
        elif case == '3':
            started = time.monotonic()
            # Worker threads do network I/O only; journal writes stay on the main thread.
            with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
                pending = {}
                def collect(done):
                    for future in done:
                        self.report(case, self.url, future.result(), pending.pop(future))
                for index in range(320):
                    time.sleep(max(0, started + index * .125 - time.monotonic()))
                    collect([f for f in pending if f.done()])
                    if len(pending) >= 5:
                        done, _ = concurrent.futures.wait(pending,
                            return_when=concurrent.futures.FIRST_COMPLETED)
                        collect(done)
                    pending[pool.submit(http_status, self.url)] = index + 1
                for future in concurrent.futures.as_completed(pending.copy()):
                    collect([future])
        elif case == '4':
            return self.ssh(module)
        elif case == '5':
            for index, port in enumerate(PORTS, 1):
                self.tcp(case, port, index, timeout=1)
        elif case == '6':
            started = time.monotonic()
            for index in range(110):
                time.sleep(max(0, started + index * (50 / 110) - time.monotonic()))
                self.tcp(case, 22, index + 1)
        elif case == '7':
            results = []
            for index in range(6):
                results.append(self.login(self.login_site, index + 1))
                if index < 5:
                    time.sleep(1.5)
            if results.count(401) < 5:
                # Only 401 (and 200) on the login path count; 400/404/422 mean the site or body is wrong.
                print('เว็บตอบ 401 ไม่ถึง 5 ครั้ง ({}) ระบบจะไม่นับเป็นล็อกอินผิด ตรวจชื่อเว็บและ API login ก่อน'.format(results))
                self.journal.record(case, self.login_site, 'not_enough_401', statuses=results)
                return False
        return True

    def evidence(self):
        results = [self.send_http('retest', '/', i) for i in range(1, 4)]
        if all(status == 200 for status in results):
            print('\n*** ปลดบล็อกแล้ว — GET / ทั้ง 3 ครั้งได้ 200 ***\n')
            self.journal.record('retest', self.url, 'unblocked_verified')
            return True
        print('ยังไม่ใช่ 200 ครบ 3 ครั้ง จึงยังไม่ยืนยันว่าปลดบล็อกแล้ว')
        return False


def ask_target():
    while True:
        try:
            ip = validate_ip(input('IP ของ VPS: '))
            break
        except ValueError:
            print('กรุณากรอก IPv4 หรือ IPv6 ให้ถูกต้อง')
    while True:
        try:
            site = validate_site(input('ชื่อเว็บ [{}]: '.format(DEFAULT_SITE)) or DEFAULT_SITE)
            return ip, site
        except (ValueError, UnicodeError):
            print('กรอกชื่อเว็บเท่านั้น ไม่ใส่ https:// หรือ path')


def menu(test):
    while True:
        try:
            print('\n' + '\n'.join('{}: {}'.format(i, v) for i, v in enumerate(LABELS, 1)))
            case = input('เลือก 1–8 หรือ 0 เพื่อออก: ').strip()
            if case == '0':
                return
            if case not in ('1', '2', '3', '4', '5', '6', '7', '8'):
                continue
            if case == '7':
                try:
                    test.login_site = validate_site(input('ชื่อเว็บรอดไม่รอดบน VPS นี้ (ไม่ใส่ https://): '))
                except (ValueError, UnicodeError):
                    print('กรอกชื่อเว็บเท่านั้น ไม่ใส่ https:// หรือ path')
                    continue
            module = None
            if case == '4':
                try:
                    import paramiko as module
                except ImportError:
                    print('ข้ามข้อ 4: ติดตั้งใน venv ก่อน:\npython3 -m venv .venv\n'
                          'source .venv/bin/activate\npython -m pip install paramiko')
                    test.journal.record(case, test.ip, 'skipped_missing_paramiko')
                    continue
            if not test.ready():
                continue
            descriptions = {
                '1': 'GET /backup.sql 1 ครั้ง → ' + test.url,
                '2': 'GET path สแกน/ไม่มีจริง 12 path → ' + test.url,
                '3': 'GET / 320 ครั้ง ~40 วินาที พร้อมกันไม่เกิน 5 → ' + test.url,
                '4': 'SSH บัญชีไม่มีจริง (สุ่ม) เดารหัส 6 ครั้งในการเชื่อมต่อเดียว → ' + test.ip + ':22',
                '5': 'TCP connect 12 พอร์ต {} → {}'.format(PORTS, test.ip),
                '6': ('คำเตือน: sshd จะไม่รับ SSH จาก IP นี้นานสุด ~10 นาที (PerSourcePenalties) ยิงเป็นข้อสุดท้าย; '
                      'TCP connect แล้วปิด 110 ครั้ง ~50 วินาที → ' + test.ip + ':22'),
                '7': ('POST {} ด้วยบัญชีสุ่มที่ไม่มีจริง รหัสผิด 6 ครั้ง ห่าง ~1.5 วินาที → https://{}'
                      .format(LOGIN_PATH, getattr(test, 'login_site', ''))),
                '8': ('GET /backup.sql 1 ครั้ง พร้อม header แบบที่เบราว์เซอร์ส่งเมื่อเว็บอื่นแปะ <img> '
                      '(Sec-Fetch-Site: cross-site) แล้วเช็กว่า {} วินาทียังได้ 200 → {}'.format(NO_BLOCK_WAIT_S, test.url)),
            }
            print(descriptions[case])
            confirmed = input('ยืนยันว่ามีสิทธิ์ทดสอบเป้าหมายนี้ และเริ่มยิง? [y/n]: ').strip().lower() == 'y'
            test.journal.record(case, test.ip, 'confirmed' if confirmed else 'cancelled', site=test.site)
            if not confirmed:
                continue
            started = time.monotonic()
            if not test.run_case(case, module):
                continue
            if case == '8':
                test.expect_no_block(case)
                continue
            auto = case in AUTO_CASES
            if auto:
                print('ข้อนี้ระบบบล็อกเอง (auto-approve) ไม่ต้องกดอนุมัติ ถ้านานเกิน 1 นาทียังไม่ 403 ให้ดู dashboard → Approvals '
                      'ถ้ามีรายการรออนุมัติแปลว่า SENTINEL_AUTO_APPROVE ปิดอยู่ กดอนุมัติเองได้ (Ctrl+C ยกเลิกรอ)')
            else:
                print('ไปที่ dashboard → Approvals แล้วกดอนุมัติ (Ctrl+C ยกเลิกรอและกลับเมนู)')
            if not test.wait_status(403, case, started):
                continue
            if auto:
                print('ผู้อนุมัติใน dashboard ต้องเป็น system (auto) · ปลดบล็อกที่ dashboard → Protection หรือรอหมดอายุเอง 10 นาที')
            else:
                print('ไปที่ dashboard → Protection แล้วกดปลดบล็อก')
            if test.wait_status(200, case, limit=720 if auto else 600):
                test.evidence()
        except KeyboardInterrupt:
            print('\nยกเลิกและกลับเมนู')
            test.journal.record('menu', test.ip, 'interrupted')


def main():
    ip, site = ask_target()
    dashboard = 'https://sentinel.{}.sslip.io'.format(ip.replace('.', '-').replace(':', '-'))
    print('Dashboard:', dashboard)
    print('ก่อนเดโม ให้ admin ล้างประวัติที่เกิดจากการซ้อมก่อนเริ่ม')
    filename = 'live-test-{}.jsonl'.format(datetime.now().strftime('%Y%m%d-%H%M%S-%f'))
    journal = Journal(filename)
    print('บันทึก JSONL:', Path(filename).resolve())
    try:
        journal.record('setup', ip, 'configured', site=site, dashboard=dashboard)
        try:
            source = public_ip()
        except (OSError, ValueError, UnicodeError):
            print('หา IP สาธารณะไม่ได้ หยุดเพื่อให้ตรวจต้นทางก่อน')
            journal.record('preflight', ip, 'public_ip_lookup_failed')
            return
        print('IP สาธารณะของเครื่องนี้:', source)
        journal.record('preflight', ip, 'source_ip', source_ip=source)
        if ipaddress.ip_address(source) == ipaddress.ip_address(ip):
            print('หยุด: IP เครื่องนี้ตรงกับ VPS ห้ามยิงจากตัว VPS เอง')
            journal.record('preflight', ip, 'self_target_rejected')
            return
        test = LiveTest(ip, site, journal)
        if test.ready():
            menu(test)
    except (KeyboardInterrupt, EOFError):
        print('\nจบการทดสอบ')
        journal.record('exit', ip, 'interrupted')
    finally:
        journal.record('exit', ip, 'closed')
        journal.close()


if __name__ == '__main__':
    try:
        main()
    except (KeyboardInterrupt, EOFError):
        print('\nจบการทดสอบ')
