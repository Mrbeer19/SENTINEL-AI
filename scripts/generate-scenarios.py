"""Bounded synthetic evidence for local Sentinel. No network attacks or auto-approvals."""
import argparse
import getpass
import http.cookiejar
import json
import secrets
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


def cases():
    return [
        ('HTTP brute force', 'HTTP_AUTH', ['failed']*6, None, 'attack'),
        ('SSH brute force', 'SSH_AUTH', ['failed']*6, 22, 'attack'),
        ('HTTP failures then success', 'HTTP_AUTH', ['failed']*5+['success'], None, 'attack'),
        ('SSH failures then success', 'SSH_AUTH', ['failed']*5+['success'], 22, 'attack'),
        ('Port scan', 'CONNECTION', ['attempt']*9, list(range(8000,8009)), 'attack'),
        ('Traffic anomaly', 'CONNECTION', ['attempt']*105, 443, 'attack'),
        ('Normal login', 'HTTP_AUTH', ['success']*3, None, 'normal'),
        ('Mistyped password then success', 'HTTP_AUTH', ['failed','success'], None, 'normal'),
        ('Normal HTTPS connections', 'CONNECTION', ['attempt']*8, 443, 'normal'),
        ('Below brute force threshold', 'HTTP_AUTH', ['failed']*4, None, 'normal'),
    ]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8001)
    parser.add_argument('--case', type=int, choices=range(1,11), help='One scenario, 1 through 10; otherwise all')
    parser.add_argument('--wait', type=int, default=0, help='Seconds to poll automatic analysis; default returns immediately')
    args = parser.parse_args()
    base = f'http://127.0.0.1:{args.port}'
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def call(path, body=None):
        req = urllib.request.Request(base+path, data=json.dumps(body).encode() if body is not None else None,
                                     headers={'Content-Type':'application/json'} if body is not None else {},
                                     method='POST' if body is not None else 'GET')
        try:
            with opener.open(req,timeout=20) as response: return json.load(response)
        except urllib.error.HTTPError as e:
            raise RuntimeError(f'HTTP {e.code}: {e.read().decode()[:200]}') from None
    username = input('Admin username [admin]: ').strip() or 'admin'
    password = getpass.getpass('Admin password: ')
    logged_in = False
    try:
        call('/api/auth/login', {'username':username,'password':password})
        logged_in = True; password = None
        health = call('/api/health')
        print('Model:', health.get('model'), '| Ready:', health.get('model_ready'))
        if not health.get('model_ready'):
            print('Model is unavailable: results may use RULE FALLBACK, not AI.')
        existing = {e['source_ip'] for e in call('/api/events?limit=500')}
        block = secrets.randbelow(150)+40
        results = []
        for number, (name, kind, outcomes, ports, label) in enumerate(cases(),1):
            if args.case and number != args.case: continue
            # TEST-NET-2: synthetic addresses, never geolocated as real users.
            ip = f'198.51.100.{(block+number)%254+1}'
            while ip in existing:
                ip = f'198.51.100.{secrets.randbelow(254)+1}'
            existing.add(ip)
            record = {'case':number,'name':name,'ip':ip,'events':len(outcomes),'incidents':[]}
            for index, outcome in enumerate(outcomes):
                event = {'source_ip':ip,'event_type':kind,'outcome':outcome,'label':label,'username':f'SYNTHETIC-CASE-{number}'}
                if ports is not None: event['destination_port'] = ports[index] if isinstance(ports,list) else ports
                call('/api/events', event)
                time.sleep(.08)
            print(f'{number:02d}. {name}: {len(outcomes)} events submitted [{ip}]',flush=True)
            results.append(record)
        deadline = time.monotonic()+max(0,min(args.wait,1800))
        while True:
            incidents = call('/api/incidents')
            pending = False
            for record in results:
                record['incidents'] = [{'id':i['id'],'kind':i['kind'],'status':i['status'],'analysis_mode':i.get('analysis_mode')} for i in incidents if i['source_ip']==record['ip']]
                pending |= any(i['status'] in ('detected','analyzing') for i in record['incidents'])
            if not pending or time.monotonic()>=deadline: break
            time.sleep(3)
        folder = Path(__file__).resolve().parents[1]/'output'/'eval'
        folder.mkdir(parents=True,exist_ok=True)
        path = folder/datetime.now(timezone.utc).strftime('scenario-batch-%Y%m%dT%H%M%SZ.json')
        path.write_text(json.dumps({'synthetic':True,'model':health.get('model'),'results':results},ensure_ascii=False,indent=2),encoding='utf-8')
        print('Report:',path)
        print('Open Dashboard > Incidents / Approvals. No block was approved by this script.')
        print('Normal cases should not create incidents. rule_fallback is NOT a model result.')
    finally:
        if logged_in:
            try: call('/api/auth/logout',{})
            except Exception: pass

if __name__ == '__main__':
    try: main()
    except (RuntimeError,urllib.error.URLError) as error: raise SystemExit(str(error))
