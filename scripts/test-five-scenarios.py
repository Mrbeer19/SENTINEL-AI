"""Five bounded synthetic scenarios for the local Sentinel lab; never sends attacks."""
import argparse
import getpass
import http.cookiejar
import json
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

SCENARIOS = ['http_brute_force','ssh_brute_force_logs','port_scan','suspicious_login','traffic_anomaly']

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8001)
    parser.add_argument('--scenario', choices=['all', *SCENARIOS], default='all')
    args = parser.parse_args()
    base = f'http://127.0.0.1:{args.port}'
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def call(path, body=None):
        req = urllib.request.Request(base+path, data=json.dumps(body).encode() if body is not None else None,
                                     headers={'Content-Type':'application/json'} if body is not None else {},
                                     method='POST' if body is not None else 'GET')
        try:
            with opener.open(req,timeout=300) as r: return json.load(r)
        except urllib.error.HTTPError as e:
            raise RuntimeError(f'{path}: HTTP {e.code}; {e.read().decode()[:200]}') from None
    username = input('Admin username [admin]: ').strip() or 'admin'
    password = getpass.getpass('Admin password: ')
    try:
        call('/api/auth/login', {'username':username,'password':password})
        password = None
        health = call('/api/health')
        if not health.get('model_ready'):
            raise RuntimeError('Model is unavailable. Start Ollama/model first; fallback results cannot measure the model.')
        results = []
        run_id = int(datetime.now(timezone.utc).timestamp()) % 200 + 10
        for index, scenario in enumerate(SCENARIOS):
            if args.scenario != 'all' and args.scenario != scenario: continue
            # Reserved documentation addresses are synthetic evidence, not network targets.
            ip = f'198.51.100.{(run_id + index) % 254 + 1}'
            print(f'Running {scenario}...', flush=True)
            simulation = call('/api/simulations', {'scenario':scenario,'source_ip':ip})
            incident = simulation.get('incident')
            if not incident:
                result = {'scenario':scenario,'events':simulation.get('events_created'),'result':'not_detected'}
            else:
                incident = call(f"/api/incidents/{incident['id']}/analyze", {})
                result = {'scenario':scenario,'incident_id':incident['id'],'mode':incident.get('analysis_mode'),
                          'analysis':incident.get('analysis'),'status':incident.get('status')}
            results.append(result)
            print(json.dumps(result,ensure_ascii=True,indent=2))
        output = Path('output/eval'); output.mkdir(parents=True,exist_ok=True)
        path = output / (datetime.now(timezone.utc).strftime('five-scenarios-%Y%m%dT%H%M%SZ.json'))
        path.write_text(json.dumps({'model':health.get('model'),'results':results},ensure_ascii=False,indent=2),encoding='utf-8')
        print(f'Report: {path.resolve()}')
    finally:
        try: call('/api/auth/logout', {})
        except Exception: pass

if __name__ == '__main__':
    try: main()
    except (RuntimeError, urllib.error.URLError) as error: raise SystemExit(str(error))
