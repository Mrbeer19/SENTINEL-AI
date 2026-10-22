# Admin login setup

Dashboard API and WebSocket access require an admin session. Localhost no longer bypasses login. Existing X-Admin-Key integrations continue to authenticate as machine clients; keep this key secret and out of frontend variables.

Generate a salted password hash interactively from the repository root:

    python -m backend.admin_auth

Choose a unique password of at least 8 characters. Store the printed hash in the server environment as SENTINEL_ADMIN_PASSWORD_HASH, and set SENTINEL_ADMIN_USERNAME. Never commit the password or hash. Environment variables must be present when the backend starts; this application does not automatically load .env files.

SENTINEL_COOKIE_SECURE defaults to 1. Keep this value for HTTPS hosting. Use 0 only for local HTTP development. Add the exact deployment hostname to SENTINEL_ALLOWED_HOSTS. Serve frontend and API on the same origin. Build frontend then start backend.app:app with the hosting platform port.

Sessions use random opaque tokens in HttpOnly, SameSite=Strict cookies, expire after eight hours, and are stored as SHA-256 digests in SQLite. Logout revokes the token; changing the configured credentials invalidates existing sessions. Login accepts at most ten attempts per five minutes globally, persisted in SQLite. This conservative global limit can temporarily lock out valid admins during an attack.

The SQLite database must be on persistent storage. Before deploying to ephemeral or multiple-instance hosting, migrate application data, sessions, and attempt counters to a shared persistent database such as PostgreSQL. This change does not make the existing SQLite deployment suitable for Heroku's ephemeral filesystem. No deployment has been performed.

No self registration or default admin password is provided. Until credentials are configured, login returns 503 and protected APIs return 401. Set up credentials and restart the backend before using the dashboard.

Validation: python -m pytest backend/tests/test_admin_auth.py -q
