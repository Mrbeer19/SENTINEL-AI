"""Admin password hashing and persistent, revocable sessions."""
import hashlib
import os
import secrets
import sqlite3
import time

COOKIE = "sentinel_session"

def password_hash(password):
    salt = secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
    return f"scrypt${salt}${digest}"

def verify_password(password, encoded):
    try:
        kind, salt, expected = encoded.split('$')
        if kind != 'scrypt': return False
        actual = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
        return secrets.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False

class AdminAuth:
    def __init__(self, db_path):
        self.path = str(db_path)
        self.username = os.getenv('SENTINEL_ADMIN_USERNAME', 'admin')
        self.password = os.getenv('SENTINEL_ADMIN_PASSWORD_HASH', '')
        self.secure = os.getenv('SENTINEL_COOKIE_SECURE', '1') != '0'
        self.credential = hashlib.sha256((self.username + self.password).encode()).hexdigest()
        with self.db() as con:
            con.execute('CREATE TABLE IF NOT EXISTS admin_sessions (token TEXT PRIMARY KEY, expires REAL, credential TEXT)')
            con.execute('CREATE TABLE IF NOT EXISTS admin_attempts (at REAL)')
            if 'ip' not in [row[1] for row in con.execute('PRAGMA table_info(admin_attempts)')]:
                con.execute("ALTER TABLE admin_attempts ADD COLUMN ip TEXT NOT NULL DEFAULT ''")
    def db(self): return sqlite3.connect(self.path, timeout=10)
    def valid(self, token):
        if not token or not self.password: return False
        with self.db() as con:
            row = con.execute('SELECT expires, credential FROM admin_sessions WHERE token=?', (hashlib.sha256(token.encode()).hexdigest(),)).fetchone()
        return bool(row and row[0] > time.time() and row[1] == self.credential)
    # Per source IP: 10 attempts / 5 min, so one client cannot lock the admin out for everyone.
    # A global ceiling still bounds scrypt work if many IPs try at once.
    PER_IP_LIMIT, GLOBAL_LIMIT, WINDOW_S = 10, 200, 300
    def login(self, username, password, ip=''):
        with self.db() as con:
            con.execute('BEGIN IMMEDIATE')
            con.execute('DELETE FROM admin_attempts WHERE at < ?', (time.time()-self.WINDOW_S,))
            if con.execute('SELECT count(*) FROM admin_attempts WHERE ip=?', (ip,)).fetchone()[0] >= self.PER_IP_LIMIT: return 'limited', None
            if con.execute('SELECT count(*) FROM admin_attempts').fetchone()[0] >= self.GLOBAL_LIMIT: return 'limited', None
            con.execute('INSERT INTO admin_attempts(at, ip) VALUES (?, ?)', (time.time(), ip))
        valid = verify_password(password, self.password)
        if not (valid and secrets.compare_digest(username, self.username)): return 'invalid', None
        token = secrets.token_urlsafe(32)
        with self.db() as con:
            con.execute('DELETE FROM admin_sessions WHERE expires < ?', (time.time(),))
            con.execute('INSERT INTO admin_sessions VALUES (?,?,?)', (hashlib.sha256(token.encode()).hexdigest(), time.time()+28800, self.credential))
        return 'ok', token
    def revoke(self, token):
        with self.db() as con:
            con.execute('DELETE FROM admin_sessions WHERE token=?', (hashlib.sha256((token or '').encode()).hexdigest(),))

if __name__ == '__main__':
    import getpass
    password = getpass.getpass('New admin password (minimum 8 characters): ')
    if len(password) < 8: raise SystemExit('Use at least 8 characters')
    if password != getpass.getpass('Confirm password: '): raise SystemExit('Passwords do not match')
    print('SENTINEL_ADMIN_PASSWORD_HASH=' + password_hash(password))
