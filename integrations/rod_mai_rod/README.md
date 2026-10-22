# SENTINEL ↔ rod-mai-rod VPS

This integration connects the Windows SENTINEL backend to **only** `rod-mai-rod.tntproduction.tech` on the Hostinger VPS. The other Caddy site blocks and Docker Compose projects remain unchanged.

## What is running

- Caddy writes access logs for the `rod-mai-rod` site to `/config/rod-mai-rod.access.log`. Only `POST /api/v1/auth/login` and `POST /api/v1/auth/google` responses of 200/401 become `HTTP_AUTH` events. No email, password, token, or request body is sent to SENTINEL.
- A Windows agent reads new records over SSH every 5 seconds and posts them to the local backend at `127.0.0.1:8000`. It also sends active, human-approved SENTINEL rules to the VPS.
- Caddy imports `/config/rod-mai-rod-sentinel.caddy` **inside the rod-mai-rod site block**. It returns 403 for active source IP rules before forwarding to the web container. The agent reports a blocked request back to `/api/enforce` to verify the rule in SENTINEL.
- A dedicated VPS systemd timer expires rules every 15–20 seconds even if Windows is offline. The site stays available if the Windows agent or SENTINEL backend is offline; existing unexpired rules still apply.

## Locations

| Item | Path |
| --- | --- |
| VPS source | `<vps-dir>/sentinel/` |
| Shared Caddyfile | gateway Caddyfile on the VPS host (path set in `vps_rules.py` / `install_caddy.py`) |
| Active Caddy config for reloads | `<caddy-config-volume>/rod-mai-rod-active.Caddyfile` |
| Caddy rules | `<caddy-config-volume>/rod-mai-rod-sentinel.caddy` |
| Caddy access log | `<caddy-config-volume>/rod-mai-rod.access.log` |
| Caddyfile backup | kept on the VPS, outside Git |
| Windows agent and state | `%LOCALAPPDATA%\SentinelAI\` |
| Windows SSH key | `%USERPROFILE%\.ssh\sentinel_rod_mai_rod` |

The running Caddy container may still hold the original bind-mounted Caddyfile. In that case reload from the active config path, not the original Caddyfile. The VPS rule script refuses to reload if the host Caddyfile differs from the saved active config, so unrelated gateway changes cannot be overwritten silently.

## Operation

Keep the Windows SENTINEL backend running on `127.0.0.1:8000`. The agent starts at user sign-in from the user's Startup folder and retries when either side is temporarily unavailable. Its log is `%LOCALAPPDATA%\SentinelAI\rod-mai-rod-agent.log`.

To install a revised Windows agent from this repository:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\integrations\rod_mai_rod\install_windows.ps1 -VpsHost <vps-address> -VpsUser <ssh-user>
```

The VPS address and SSH user are not stored in Git.

To check the VPS timer and rules:

```sh
systemctl status rod-mai-rod-sentinel-expire.timer
cat <caddy-config-volume>/rod-mai-rod-sentinel.caddy
```

## Rollback

Stop the Windows agent, remove its Startup shortcut, and disable the VPS timer. Restore the backed-up Caddyfile, copy it to the active config path, validate it inside the Caddy container, then gracefully reload Caddy from the active config. Do not stop or recreate the shared Caddy container for this rollback.

## Verified 22 October 2026

- Production login rejection (401) appeared as one `HTTP_AUTH failed` event in local SENTINEL.
- A temporary rule for the rod frontend's private test IP returned 403 for `rod-mai-rod` and 200 for `rangsitnanmai` from the same container. The rule was removed immediately.
- A second temporary rule expired automatically via the VPS timer; `rod-mai-rod` returned 200 afterward.
- Public responses stayed at 307 for `tntproduction.tech`, 200 for `rod-mai-rod.tntproduction.tech`, and 200 for `rangsitnanmai.tntproduction.tech`.

Limit: Login outcomes are inferred from the existing application's 200/401 responses. Other application events and WebSocket traffic are not ingested. This integration enforces approved IP rules for the rod-mai-rod hostname at Caddy; it does not modify the VPS firewall.
