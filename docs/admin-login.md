# Admin login setup

Dashboard API and WebSocket access require an admin session. Localhost does not bypass login. Machine clients such as the rod-mai-rod bridge authenticate with `X-Admin-Key`; keep that key secret and out of frontend variables.

Generate a salted password hash interactively from the repository root:

    python -m backend.admin_auth

Choose a unique password of at least 8 characters. Store the printed hash in the server environment as `SENTINEL_ADMIN_PASSWORD_HASH` and set `SENTINEL_ADMIN_USERNAME`. Never commit the password or hash.

| Where | How the environment is set |
| --- | --- |
| VPS (main deployment) | `deploy/vps/.env` read by Docker Compose, see `docs/vps-hosting.md` |
| M5 LAN fallback | `backend/.env` read by `make -C backend run-lan` (preflight refuses to start without the hash) |
| Local development | environment variables in the shell before starting uvicorn |

`SENTINEL_COOKIE_SECURE` defaults to 1. Keep 1 for the HTTPS dashboard on the VPS. `make run-lan` sets 0 because the LAN fallback is plain HTTP. Add the exact dashboard hostname to `SENTINEL_ALLOWED_HOSTS`. Frontend and API are served from the same origin.

Sessions use random opaque tokens in HttpOnly, SameSite=Strict cookies, expire after eight hours, and are stored as SHA-256 digests in SQLite. Logout revokes the token; changing the configured credentials invalidates existing sessions. Login accepts at most ten attempts per client IP per five minutes, with a global ceiling of 200, persisted in SQLite. Behind Caddy the client IP comes from the forwarded header, trusted only from the Caddy container.

No self registration or default admin password is provided. Until credentials are configured, login returns 503 and protected APIs return 401.

## Resetting the password

The old password cannot be recovered; only its hash is stored. Generate a new hash with `python -m backend.admin_auth`, replace `SENTINEL_ADMIN_PASSWORD_HASH` in the environment of the running deployment, and restart the backend. Existing sessions end.

## Machine key

The bridge sends `X-Admin-Key`. On the VPS the same value is in `deploy/vps/.env` (`SENTINEL_ADMIN_KEY`) and `/etc/sentinel-bridge.env`. For local development on Windows, `scripts/new-admin-key.ps1` creates `%LOCALAPPDATA%\SentinelAI\admin-key.txt` and `scripts/_sentinel-env.ps1` loads it. After replacing the key, restart the backend and the bridge.

Validation: `python -m pytest backend/tests/test_admin_auth.py -q`
