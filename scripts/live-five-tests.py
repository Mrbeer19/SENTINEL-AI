"""Small, bounded live tests for the operator-owned rod-mai-rod deployment."""
import argparse
import getpass
import json
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import os
from pathlib import Path

LOGIN_PATH = '/api/v1/auth/login'
LOGIN = ''

def login(email,password):
    req=urllib.request.Request(LOGIN,data=json.dumps({'email':email,'password':password}).encode(),headers={'Content-Type':'application/json'},method='POST')
    try:
        with urllib.request.urlopen(req,timeout=10) as response: return response.status
    except urllib.error.HTTPError as error: return error.code

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('case',choices=['http','ssh','ssh-login','login','scan','traffic'])
    p.add_argument('--host',help='Your VPS hostname/IP, required for TCP and SSH tests')
    p.add_argument('--site',default=os.getenv('SENTINEL_SITE_URL'),help='Website base URL, e.g. https://site.example.com (or SENTINEL_SITE_URL)')
    args=p.parse_args()
    if args.case in ('http','login'):
        if not args.site: p.error('--site or SENTINEL_SITE_URL required')
        global LOGIN
        LOGIN = args.site.rstrip('/') + LOGIN_PATH
        email = input('Existing test account email: ') if args.case=='login' else 'sentinel-test@example.com'
        password = getpass.getpass('Correct TEST WEBSITE account password: ') if args.case=='login' else None
        for i in range(6):
            status=login(email,'SOC-Intentional-Wrong-Password')
            print(f'Login {i+1}/6: HTTP {status}',flush=True)
            if status!=401: raise SystemExit('Stopped: expected 401. Check endpoint payload or rate limiting before retrying.')
            time.sleep(1)
        if password:
            print('Valid login: HTTP',login(email,password))
    elif args.case in ('ssh','ssh-login'):
        if not args.host: p.error('--host required')
        with tempfile.TemporaryDirectory(prefix='sentinel-test-') as folder:
            keys = [str(Path(folder)/f'untrusted_key_{i}') for i in range(3)]
            for key in keys:
                subprocess.run(['ssh-keygen','-q','-t','ed25519','-N','','-f',key],check=True)
            identities = [arg for key in keys for arg in ('-i',key)]
            for i in range(2):
                r=subprocess.run(['ssh',*identities,'-o','IdentitiesOnly=yes','-o','IdentityAgent=none','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=5','root@'+args.host,'true'],capture_output=True,text=True,timeout=10)
                print(f'SSH connection {i+1}/2 (three untrusted keys): {r.stderr.strip()[-180:]}',flush=True)
                if r.returncode==0: raise SystemExit('Unexpected login success; stopped')
                if 'Permission denied' not in r.stderr and 'Too many authentication failures' not in r.stderr:
                    raise SystemExit('Stopped: SSH server refused the connection before authentication.')
                time.sleep(1)

        if args.case == 'ssh-login':
            trusted_key = Path.home()/'.ssh'/'sentinel_rod_mai_rod'
            if not trusted_key.exists(): raise SystemExit('Configured collector key not found; no successful login attempted.')
            result = subprocess.run(['ssh','-i',str(trusted_key),'-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=5','root@'+args.host,'true'],capture_output=True,text=True,timeout=10)
            print('Valid SSH login after failures:', 'SUCCESS' if result.returncode==0 else 'FAILED (check server logs)')
    else:
        if not args.host: p.error('--host required')
        ports=list(range(8000,8009)) if args.case=='scan' else [443]*105
        for i,port in enumerate(ports,1):
            try:
                with socket.create_connection((args.host,port),timeout=.6): result='connected'
            except OSError: result='closed/filtered'
            print(f'{i}/{len(ports)} TCP {port}: {result}',flush=True)
            time.sleep(.15)
    print('Done. Check Sentinel incidents, analysis mode, and pending proposals. No block was approved.')

if __name__=='__main__':
    try: main()
    except (OSError,subprocess.SubprocessError) as error: raise SystemExit(str(error))
