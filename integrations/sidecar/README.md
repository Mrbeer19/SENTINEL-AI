# SENTINEL website sidecar

Source copied from the team's `sentinel-realweb` integration so the website demonstration can be reproduced from this repository. Uses the Python standard library.

```text
client -> sidecar :8099 -> existing website
             |-> SENTINEL :8000 /api/enforce
             |-> SENTINEL :8000 /api/events (login outcomes)
```

## Configure and run

The backend must include the enforcement extension (PR #15). The sidecar and backend must use the same privately configured admin key. Do not put that key in this file or commit it.

PowerShell, after setting `SENTINEL_ADMIN_KEY` privately in the process environment:

```powershell
$env:SENTINEL_URL = 'http://127.0.0.1:8000'
$env:UPSTREAM = 'http://127.0.0.1:3000' # replace with the authorized website upstream
$env:LISTEN_PORT = '8099'
$env:LOGIN_PATH = '/api/v1/auth/login' # replace if the website uses another path
python integrations/sidecar/sentinel_sidecar.py
```

Open the website through the sidecar address for the demonstration. Direct visits to the upstream bypass this enforcement path. The script listens on all interfaces; restrict exposure to the intended test network. No deployment or network-access change is required merely to inspect this source.

## Behavior and limits

- Before forwarding, `/api/enforce` checks the reported client IP. An explicit denial returns HTTP 403 without forwarding to the upstream.
- A POST to the configured login path emits a normalized `HTTP_AUTH` event. The current implementation treats 2xx as success and every other status as failure, including rate limits, redirects and upstream errors. Adapt this interpretation to the website before wider use. `FAIL_STATUS` remains a legacy environment option and does not control this classifier.
- If the backend is unreachable or returns an unexpected error, enforcement fails open and the request is forwarded. This keeps the website available but does not maintain containment during the outage.
- Without `CLIENT_IP_HEADER`, the direct peer address is used. Set a forwarded-IP header only behind an explicitly trusted proxy that sanitizes it; an untrusted client header must not be authoritative.
- The backend records a denied enforcement check for a later request as verification evidence. This is application-level enforcement, not a host firewall or packet-capture confirmation of response delivery.
- Approval, rejection and removal still happen through the SOC backend. The sidecar cannot decide to approve a proposal.

For current model selection and the handoff to the paper author, see `../../docs/latest-program-handoff.md`.
