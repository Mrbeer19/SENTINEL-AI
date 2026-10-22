import time
from fastapi.testclient import TestClient
from backend.app import create_app
from backend.agent import Agent, Analysis

def test_worker_analyzes_and_waits_for_human(monkeypatch,tmp_path):
    monkeypatch.setenv('SENTINEL_ADMIN_KEY','test-worker-key')
    calls = []
    async def investigate(self, incident, notify):
        calls.append(incident['id'])
        return Analysis(threat_type='HTTP_AUTH_BRUTE_FORCE',severity='HIGH',confidence=.9,evidence=['5 failures'],recommended_action='TEMP_BLOCK_IP',explanation_th='test'), 'ollama', {}, None
    monkeypatch.setattr(Agent,'investigate',investigate)
    app = create_app(tmp_path/'worker.db')
    with TestClient(app,headers={'X-Admin-Key':'test-worker-key'}) as c:
        for _ in range(6):
            assert c.post('/api/events',json={'source_ip':'198.51.100.77','event_type':'HTTP_AUTH','outcome':'failed'}).status_code == 201
        end = time.monotonic()+6
        while time.monotonic()<end:
            proposals = c.get('/api/proposals').json()
            if proposals: break
            time.sleep(.1)
        assert len(proposals)==1
        assert proposals[0]['status']=='pending'
        assert proposals[0]['source']=='model'
        assert c.get('/api/rules').json()==[]
        assert len(calls)==1

        # Expired approved blocks must not swallow the next attack from the same IP.
        import sqlite3
        assert c.post(f"/api/proposals/{proposals[0]['id']}/approve",json={'reviewer':'test-admin'}).status_code == 200
        with sqlite3.connect(tmp_path/'worker.db') as db:
            db.execute("UPDATE rules SET expires_at='2000-01-01T00:00:00+00:00'")
        for _ in range(6):
            assert c.post('/api/events',json={'source_ip':'198.51.100.77','event_type':'HTTP_AUTH','outcome':'failed'}).status_code == 201
        end = time.monotonic()+6
        while time.monotonic()<end:
            proposals = c.get('/api/proposals').json()
            if len(proposals)==2: break
            time.sleep(.1)
        assert len(proposals)==2
        assert sum(p['status']=='pending' for p in proposals)==1
        assert len(calls)==2
