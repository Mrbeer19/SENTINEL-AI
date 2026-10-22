"""VPS metadata sensor: SSH auth results and incoming TCP SYNs, never packet payloads."""
import ipaddress
import json
import os
import re
import subprocess
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

OUTPUT = Path('/opt/rod-mai-rod/sentinel/network-events.jsonl')
LOCK = threading.Lock()
AUTH = re.compile(r'^(Failed (?:password|publickey)|Accepted (?:password|publickey|keyboard-interactive/pam)) for (?:invalid user )?(\S+) from (\S+) port \d+')
SYN = re.compile(r'IP6? (\S+) > (\S+): Flags \[S\]')

def auth_event(row):
    match = AUTH.search(row.get('MESSAGE',''))
    if not match: return None
    try: ip = str(ipaddress.ip_address(match[3]))
    except ValueError: return None
    return {'source_ip':ip,'event_type':'SSH_AUTH','outcome':'failed' if match[1].startswith('Failed') else 'success','destination_port':22,'username':match[2][:80]}

def syn_event(line):
    match = SYN.search(line)
    if not match: return None
    try:
        source, sport = match[1].rsplit('.',1)
        dest, dport = match[2].rsplit('.',1)
        ip = ipaddress.ip_address(source)
        ipaddress.ip_address(dest)
        port = int(dport)
        if not ip.is_global or not 1 <= port <= 65535: return None
        return {'source_ip':str(ip),'event_type':'CONNECTION','outcome':'attempt','destination_port':port}, (source,sport,dest,dport)
    except ValueError: return None

def emit(event):
    event.update(timestamp=datetime.now(timezone.utc).isoformat(timespec='seconds'),label='unknown')
    with LOCK:
        OUTPUT.parent.mkdir(parents=True,exist_ok=True)
        if OUTPUT.exists() and OUTPUT.stat().st_size > 10_000_000:
            os.replace(OUTPUT, OUTPUT.with_suffix('.previous.jsonl'))
        fd = os.open(OUTPUT,os.O_APPEND|os.O_CREAT|os.O_WRONLY,0o600)
        with os.fdopen(fd,'a') as handle: handle.write(json.dumps(event)+'\n')

def ssh_logs():
    process = subprocess.Popen(['journalctl','-f','-n','0','-o','json','SYSLOG_IDENTIFIER=sshd','SYSLOG_IDENTIFIER=sshd-session'],stdout=subprocess.PIPE,text=True)
    for line in process.stdout:
        try:
            event = auth_event(json.loads(line))
            if event: emit(event)
        except (ValueError,TypeError): continue
    raise RuntimeError('journalctl stopped')

def packets():
    # -Q in: inbound only. SYN filter + text output records metadata, not payload.
    process = subprocess.Popen(['tcpdump','-i','any','-Q','in','-nn','-l','-s','96','tcp[tcpflags] & (tcp-syn|tcp-ack) == tcp-syn'],stdout=subprocess.PIPE,text=True)
    seen = {}
    for line in process.stdout:
        parsed = syn_event(line)
        if not parsed: continue
        event,key = parsed
        now = time.monotonic()
        if now-seen.get(key,-10)<3: continue
        seen[key]=now
        if len(seen)>10000: seen={k:v for k,v in seen.items() if now-v<3}
        emit(event)
    raise RuntimeError('tcpdump stopped')

def supervise(fn):
    while True:
        try: fn()
        except Exception as error: print(type(error).__name__,str(error),flush=True)
        time.sleep(5)

if __name__ == '__main__':
    threading.Thread(target=supervise,args=(ssh_logs,),daemon=True).start()
    supervise(packets)
