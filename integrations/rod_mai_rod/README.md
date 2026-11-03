# SENTINEL ↔ rod-mai-rod VPS

This integration connects the Windows SENTINEL backend to **only** the rod-mai-rod site (`<site-domain>`) on the VPS. The other Caddy site blocks and Docker Compose projects remain unchanged.

Deployment values (domain, Caddy paths, container name, Caddyfile hash) are not stored in Git. On the VPS, copy `site.example.json` to `site.json` in the same folder as the `vps_*.py` scripts and fill it in. `site.json` is ignored by Git.

## What is running

- Caddy writes access logs for the `rod-mai-rod` site to `/config/rod-mai-rod.access.log`. Only `POST /api/v1/auth/login` and `POST /api/v1/auth/google` responses of 200/401 become `HTTP_AUTH` events. No email, password, token, or request body is sent to SENTINEL.
- Every other rod-mai-rod request (except 403 denials) is summed per source IP per 10 seconds into one `HTTP_REQUEST` event (`count`, `not_found`, `honeypot`, up to 5 paths): static files, fonts and flood-map tiles are not counted, and only decoy or 404 paths are sent, never query strings. A flood of thousands of requests becomes a few events. Decoy paths come from `honeypot_paths` in `site.json`; the site has no such page and links to none, so Caddy is not changed. Measured on the real access log (31 October): a normal visitor peaks at 44 counted requests per minute against the 300 flood threshold.
- A Windows agent reads new records over SSH every 5 seconds and posts them to the local backend at `127.0.0.1:8001`. It also sends active, human-approved SENTINEL rules to the VPS.
- Caddy imports `/config/rod-mai-rod-sentinel.caddy` **inside the rod-mai-rod site block**. It returns 403 for active source IP rules before forwarding to the web container. The agent reports a blocked request back to `/api/enforce` to verify the rule in SENTINEL.
- A dedicated VPS systemd timer expires rules every 15–20 seconds even if Windows is offline. The site stays available if the Windows agent or SENTINEL backend is offline; existing unexpired rules still apply.

## Locations

| Item | Path |
| --- | --- |
| VPS source and `site.json` | `<vps-dir>` |
| Shared Caddyfile | gateway Caddyfile on the VPS host (path set in `vps_rules.py` / `install_caddy.py`) |
| Active Caddy config for reloads | `<caddy-config-volume>/rod-mai-rod-active.Caddyfile` |
| Caddy rules | `<caddy-config-volume>/rod-mai-rod-sentinel.caddy` |
| Caddy access log | `<caddy-config-volume>/rod-mai-rod.access.log` |
| Caddyfile backup | kept on the VPS, outside Git |
| Windows agent and state | `%LOCALAPPDATA%\SentinelAI\` |
| Windows SSH key | `%USERPROFILE%\.ssh\sentinel_rod_mai_rod` |

The running Caddy container may still hold the original bind-mounted Caddyfile. In that case reload from the active config path, not the original Caddyfile. The VPS rule script refuses to reload if the host Caddyfile differs from the saved active config, so unrelated gateway changes cannot be overwritten silently.

## Operation

Keep the Windows SENTINEL backend running on `127.0.0.1:8001`. The agent starts at user sign-in from the user's Startup folder and retries when either side is temporarily unavailable. Its log is `%LOCALAPPDATA%\SentinelAI\rod-mai-rod-agent.log`.

To install a revised Windows agent from this repository:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\integrations\rod_mai_rod\install_windows.ps1 -VpsHost <vps-address> -VpsUser <ssh-user> -VpsDir <vps-dir>
```

The VPS address, SSH user and folder are not stored in Git (`SENTINEL_VPS_HOST`, `SENTINEL_VPS_USER`, `SENTINEL_VPS_DIR` also work).

The two systemd units contain `__VPS_DIR__`; replace it with the real folder when installing, for example `sed 's#__VPS_DIR__#<vps-dir>#' rod-mai-rod-sentinel-expire.service > /etc/systemd/system/rod-mai-rod-sentinel-expire.service`. `install_sensor.ps1` does this for the sensor unit.

To check the VPS timer and rules:

```sh
systemctl status rod-mai-rod-sentinel-expire.timer
cat <caddy-config-volume>/rod-mai-rod-sentinel.caddy
```

## Rollback

Stop the Windows agent, remove its Startup shortcut, and disable the VPS timer. Restore the backed-up Caddyfile, copy it to the active config path, validate it inside the Caddy container, then gracefully reload Caddy from the active config. Do not stop or recreate the shared Caddy container for this rollback.

## Verified 22 October 2026

- Production login rejection (401) appeared as one `HTTP_AUTH failed` event in local SENTINEL.
- A temporary rule for the rod frontend's private test IP returned 403 for `rod-mai-rod` and 200 for another site on the same Caddy container. The rule was removed immediately.
- A second temporary rule expired automatically via the VPS timer; `rod-mai-rod` returned 200 afterward.
- Public responses for the other sites on the shared Caddy stayed unchanged, and `rod-mai-rod` returned 200.

Limit: Login outcomes are inferred from the existing application's 200/401 responses. Other application events and WebSocket traffic are not ingested. This integration enforces approved IP rules for the rod-mai-rod hostname at Caddy; it does not modify the VPS firewall.
## Live SSH and TCP sensor

`vps_sensor.py` collects incoming TCP SYN metadata and sshd/sshd-session authentication results into a restricted local JSONL spool. No packet payloads or passwords are retained. It observes the VPS network, so connections to other services on a shared VPS can also appear; this is not domain-specific packet attribution. SYN retransmissions within three seconds are deduplicated. Capture depends on traffic reaching the interface; upstream-dropped packets cannot be detected here. This is an introductory metadata sensor, not a full IDS.

Install using `install_sensor.ps1 -VpsHost <host> -VpsUser <user> -VpsDir <vps-dir>`. Existing root SSH access, tcpdump, Python and journald are required. Enable verbose sshd logging after validating configuration to observe failed publickey authentication. Run the updated Windows agent with `--network-sensor`. The initial sensor cursor starts at end; wait one collector poll before testing. Rotation retains one previous spool; high-volume downtime can lose records. Ingestion has at-least-once delivery and a crash can duplicate an event.

The bridge defaults to the single admin backend on port 8001 (`SENTINEL_API_URL` overrides it). The admin key comes from `SENTINEL_ADMIN_KEY` or `%LOCALAPPDATA%\SentinelAI\admin-key.txt` and must match the backend. Never put the integration key into frontend VITE variables.

Live test helper: `python scripts/live-five-tests.py http|ssh|login|scan|traffic [--host <your-vps>] [--site https://<site-domain>]`. HTTP: six intentional failures, requiring 401. SSH: six untrusted ephemeral-public-key attempts to the existing root account, strict host verification, no password guessing. Suspicious login needs an existing test website account and its correct password. Scan: nine TCP ports, once each. Traffic: 105 sequential TCP connections to 443, 150 ms apart. No block is auto-approved. Upstream rate limiting or blocking can prevent test completion. Stop after one batch and review evidence.

Every approved rule, whatever the incident type (HTTP brute force, SSH brute force, port scan, traffic anomaly), is enforced at Caddy inside the rod-mai-rod site block only: that source gets 403 from rod-mai-rod while the other sites on the same Caddy keep serving it. The VPS host firewall is deliberately not changed, because a host-level block would also cut that source off from the other sites and services sharing the VPS. Scope is protecting the rod-mai-rod website; SSH itself stays protected by key-only login.

Verified 30 October 2026: a live SSH test (six untrusted keys) became an SSH incident, the r3 model proposed TEMP_BLOCK_IP, and after approval the test source got 403 from rod-mai-rod and 200 from another site on the same Caddy; the denied request flipped the incident to verified, and after unblock rod-mai-rod returned 200 again. Synthetic helpers remain separate. Real connection tests send actual traffic to the operator-supplied VPS host; there is no hardcoded VPS IP in tracked scripts.
