# SENTINEL program status for the paper

Updated 22 October 2026. This note separates what is implemented, what earlier tests showed and what is still waiting for review, so the paper describes the program accurately.

## Frontend

- White, black, purple and lime dashboard with a local vector sculpture and globe. All graphics are bundled; no external image service is used.
- Overview combines summary counts, a proposal desk, searchable source IPs, request activity and recent requests.
- Operators can analyze an incident, review an existing proposal, approve/reject, or confirm removal of an active rule from the overview.
- Review dialogs show the incident evidence, analysis mode, target, duration and reviewer. Cancel does not submit a decision.
- Thai navigation, mobile source cards, keyboard focus handling and a single stylesheet.
- The rod-mai-rod view lists addresses seen in stored events/requests. Globe positions come from an IP hash, are layout positions only and are labeled `NOT GEOIP`; they are not country coordinates. TEST-NET ranges stay labeled as test addresses. No incident does not mean the source is safe.

Frontend entry points: `frontend/src/pages/Overview.jsx`, `frontend/src/components/SourceList.jsx`, `QuickResponse.jsx`, `NetworkTopology.jsx`, `GlobeCanvas.jsx` and `frontend/src/style.css`.

## Backend and response workflow

Describe the website demonstration from the branch with the enforcement extension (PR #15), not from an older `main`:

1. Normalized events feed five count-based detection rules.
2. An operator starts analysis of a recorded incident.
3. Investigator uses four scoped read-only tools; Threat Analyst produces structured findings; Defense Planner receives only selected fields and fixed incident facts.
4. Code checks the recommended action, incident source, protected addresses and duration before storing a pending proposal.
5. Human approval is required; policy is checked again. Rejection creates no rule.
6. `TEMP_BLOCK_IP` lasts 600 seconds. `BLOCK_IP` requires CRITICAL severity and lasts 3600 seconds.
7. A new request denied by an active rule is the verification evidence. Approval alone is not verification. Removing or expiring a rule keeps the incident history.

Model/schema failures use a labeled rule fallback. The model never installs firewall rules directly.

## Model selection (r3)

Health check on the Windows workstation (RTX 4060) on 22 October:

```text
http://127.0.0.1:8000/api/health
status: ok
model: sentinel-qwen3.5-4b-r3:latest
model_ready: true
```

Port 8000 is the SOC backend; the website sidecar listens on 8099.

On the M5 server, import the GGUF with its Modelfile and select r3 explicitly:

```bash
export SENTINEL_MODEL='sentinel-qwen3.5-4b-r3:latest'
```

The code default stays `qwen3.5:4b`; installing r3 does not select it. Keep r2 and the base model for a manual rollback. The base model is not an automatic failover: model errors go to the labeled rule fallback.

## Results for the paper

| Dataset | r3 on M5 | median |
|---|---:|---:|
| v1 test | 28/28 | 14.4 s |
| v2 | 40/40 | 13.1 s |
| v3 | 32/34 | 12.6 s |
| v4 | 30/33 | 11.9 s |

These are existing team benchmark results; no new benchmark was run for this frontend change. Datasets and M5 results are in PR #13. r3's training data was revised after looking at its v2/v3 errors, so v2/v3 are regression checks for r3, not independent held-out sets. v4 was made after training; base and r2 were not run on v4.

The recorded LAN and live-website demonstrations used **r2**. The website sidecar forwarded requests from the Windows workstation to the existing website; it is not an inline filter for every visitor of the VPS. Website reject/browser tests and the full two-machine rehearsal (M5 server, second laptop as client) are still open in the test plan.

## Review order

- PR #13: v2/v3/v4 datasets and M5 results. Waiting for review.
- PR #15: real-server `/api/enforce`. Waiting for review.
- This frontend/integration PR is stacked on #15. Merge #15 into `dev` first, then retarget this PR to `dev`.
- Sidecar source and usage: `integrations/sidecar/`.
- `integrations/rod_mai_rod/` holds a separate Caddy/SSH bridge. It is not the sidecar demonstration above. This PR installs nothing on the VPS and does not show that the bridge was deployed.

## Checks

Frontend production build and whitespace check pass. Earlier UI checks are in `reports/dashboard-redesign-2026-10-21.md` and `reports/dashboard-art-2026-10-22.md`; they are not a new model or two-machine test.

No token, admin key, database, model weights, `node_modules` or `dist` bundle is committed. Build `frontend/dist` from source when deploying.
