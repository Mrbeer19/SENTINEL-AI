from fastapi.testclient import TestClient
from backend.app import create_app
from backend.admin_auth import password_hash


def setup(monkeypatch, tmp_path):
    monkeypatch.setenv('SENTINEL_ADMIN_PASSWORD_HASH', password_hash('test-only-password-482'))
    monkeypatch.setenv('SENTINEL_ADMIN_USERNAME', 'admin')
    monkeypatch.setenv('SENTINEL_COOKIE_SECURE', '0')
    return TestClient(create_app(tmp_path/'admin.db'))


def test_session_required_even_for_localhost(monkeypatch, tmp_path):
    c = setup(monkeypatch, tmp_path)
    assert c.get('/api/events').status_code == 401
    assert c.get('/api/health').status_code == 401
    assert not c.get('/api/auth/session').json()['authenticated']
    assert c.post('/api/auth/login', json={'username':'admin','password':'wrong'}).status_code == 401
    r = c.post('/api/auth/login', json={'username':'admin','password':'test-only-password-482'})
    assert r.status_code == 200
    assert 'HttpOnly' in r.headers['set-cookie'] and 'SameSite=strict' in r.headers['set-cookie']
    assert c.get('/api/events').status_code == 200
    token = c.cookies.get('sentinel_session')
    assert c.post('/api/auth/logout').status_code == 200
    c.cookies.set('sentinel_session', token)
    assert c.get('/api/events').status_code == 401


def test_csrf_and_rate_limit(monkeypatch,tmp_path):
    c = setup(monkeypatch,tmp_path)
    body = {'username':'admin','password':'wrong'}
    assert c.post('/api/auth/login',json=body,headers={'Origin':'https://attacker.example'}).status_code == 403
    for _ in range(10): assert c.post('/api/auth/login',json=body).status_code == 401
    assert c.post('/api/auth/login',json=body).status_code == 429


def test_unconfigured_fails_closed(monkeypatch,tmp_path):
    monkeypatch.delenv('SENTINEL_ADMIN_PASSWORD_HASH',raising=False)
    c = TestClient(create_app(tmp_path/'unconfigured.db'))
    assert c.post('/api/auth/login',json={'username':'admin','password':'anything'}).status_code == 503
    assert c.get('/api/events').status_code == 401


def test_secure_cookie_and_rotation(monkeypatch,tmp_path):
    c = setup(monkeypatch,tmp_path)
    body = {'username':'admin','password':'test-only-password-482'}
    c.post('/api/auth/login',json=body)
    old = c.cookies.get('sentinel_session')
    c.post('/api/auth/login',json=body)
    c.cookies.clear()
    c.cookies.set('sentinel_session',old)
    assert c.get('/api/events').status_code == 401

def test_websocket_requires_session(monkeypatch,tmp_path):
    import pytest
    from starlette.websockets import WebSocketDisconnect
    c = setup(monkeypatch,tmp_path)
    with pytest.raises(WebSocketDisconnect):
        with c.websocket_connect('/ws'): pass
    c.post('/api/auth/login',json={'username':'admin','password':'test-only-password-482'})
    with c.websocket_connect('/ws') as ws:
        assert ws.receive_json()['stage'] == 'connected'


def test_expiry_and_secure_default(monkeypatch,tmp_path):
    import sqlite3
    c = setup(monkeypatch,tmp_path)
    c.post('/api/auth/login',json={'username':'admin','password':'test-only-password-482'})
    with sqlite3.connect(tmp_path/'admin.db') as con:
        con.execute('UPDATE admin_sessions SET expires=0')
    assert c.get('/api/events').status_code == 401
    monkeypatch.setenv('SENTINEL_COOKIE_SECURE','1')
    c = TestClient(create_app(tmp_path/'secure.db'))
    r = c.post('/api/auth/login',json={'username':'admin','password':'test-only-password-482'})
    assert 'Secure' in r.headers['set-cookie']
