# SENTINEL program status for the paper

Updated 30 October 2026. This note separates what is implemented, what tests showed and what is still open, so the paper describes the program accurately.

## Deployment

| Plan | Machines | Use |
| --- | --- | --- |
| Main | VPS runs backend, dashboard and the rod-mai-rod bridge; the Windows workstation (RTX 4060) runs r3 over a reverse SSH tunnel; any browser opens the HTTPS dashboard; a second laptop (Neo) attacks the real rod-mai-rod website | presentation |
| Fallback | M5 runs backend, r3 and dashboard with `make -C backend run-lan`; Neo sends requests over the LAN (`scripts/neo/README.md`) | if the internet or VPS is unavailable |

Details: `docs/vps-hosting.md`, `docs/soc-rod-mai-rod-tests.md`.

## Frontend

- Light theme by default with a Light/Dark switch, SENTINEL logo and mascot, Thai and Latin fonts bundled locally.
- Overview: summary counts, globe, pending proposals, recent requests and login history. Incidents and rules are paged 10 rows at a time.
- Globe positions come from an approximate GeoIP lookup of public source IPs; private and TEST-NET addresses have no location.
- Operators analyze an incident, review a proposal, approve or reject, and unblock an active rule. Blocks without expiry are shown as "until an admin unblocks".

## Backend and response workflow

1. Normalized events feed five count-based detection rules.
2. Incidents are analyzed automatically (or on demand).
3. Investigator uses four scoped read-only tools; Threat Analyst produces structured findings; Defense Planner receives only selected fields and fixed incident facts.
4. Code checks the recommended action, incident source, protected addresses and duration before storing a pending proposal.
5. Human approval is required; policy is checked again. Rejection creates no rule.
6. Default durations: `TEMP_BLOCK_IP` 600 s, `BLOCK_IP` 3600 s (CRITICAL only). On the VPS `SENTINEL_MANUAL_UNBLOCK=1`: approved blocks stay until an admin unblocks them.
7. A new request denied by an active rule is the verification evidence. Approval alone is not verification.

On the real website every approved rule, including SSH and port-scan incidents, is enforced at Caddy inside the rod-mai-rod site block only. Other sites on the same VPS keep serving that source. The host firewall is not changed.

Model/schema failures use a labeled rule fallback. The model never installs rules directly.

## Model (r3)

Selected with `SENTINEL_MODEL='sentinel-qwen3.5-4b-r3:latest'`; the code default stays `qwen3.5:4b`. Keep r2 and the base model for a manual rollback.

| Dataset | r3 on M5 | median |
|---|---:|---:|
| v1 test | 28/28 | 14.4 s |
| v2 | 40/40 | 13.1 s |
| v3 | 32/34 | 12.6 s |
| v4 | 30/33 | 11.9 s |

r3's training data was revised after looking at its v2/v3 errors, so v2/v3 are regression checks for r3, not independent held-out sets. v4 was made after training; base and r2 were not run on v4.

## Live checks on the VPS (30 October)

- SSH brute force from the SOC workstation: incident, r3 proposal, approval, 403 from rod-mai-rod and 200 from another site on the same Caddy, `verified`, unblock, 200.
- Six failed website logins after the move to the VPS: same result.
- Manual unblock: the rule kept returning 403 for over 20 minutes until the admin unblocked it.
- Dashboard data compared with the VPS logs: connection events matched the sensor spool, SSH successes matched the sshd journal, website logins matched the Caddy access log.

Still open: the full rehearsal with M5 and Neo on the main plan, and the LAN fallback rehearsal.

## Checks

Backend tests, model evaluation unit tests and the frontend production build pass. No token, admin key, database, model weights, `node_modules` or `dist` bundle is committed.
