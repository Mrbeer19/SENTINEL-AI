# SENTINEL latest program handoff

Updated 22 October 2026. This document distinguishes implemented behavior, previous test evidence and pending team review so the paper can follow the program accurately.

## Latest frontend

- White, black, purple and lime dashboard with a local vector sculpture and globe; no external image service or generated-tool credit in the interface.
- Overview combines summary counts, a proposal desk, searchable source IPs, request activity and recent requests.
- Operators can analyze an incident, review an existing proposal, approve/reject, or confirm removal of an active rule from the overview.
- Native review dialogs show the incident evidence, analysis mode, target, duration and reviewer. Cancellation does not submit a decision.
- Thai navigation, mobile source cards, keyboard focus handling and a single consolidated stylesheet.
- The latest rod-mai-rod visualization lists addresses observed in stored events/requests. Globe positions generated from an IP hash are diagram positions only and are labeled `NOT GEOIP`; they are not country coordinates. TEST-NET ranges remain labeled as test addresses. No incident is not equivalent to a guarantee of safety.

Frontend entry points: `frontend/src/pages/Overview.jsx`, `frontend/src/components/SourceList.jsx`, `QuickResponse.jsx`, `NetworkTopology.jsx`, `GlobeCanvas.jsx` and `frontend/src/style.css`.

## Backend and response workflow

Read the code on the enforcement extension, not an older main checkout, when documenting the website demonstration:

1. Normalized events feed five count-based detection rules.
2. An operator starts analysis of a recorded incident.
3. Investigator uses four scoped read-only tools; Threat Analyst produces structured findings; Defense Planner receives only selected fields and fixed incident facts.
4. Code evaluates the recommended action, incident source, protected addresses and duration before storing a pending proposal.
5. Human approval is required; policy is checked again. Rejection creates no rule.
6. `TEMP_BLOCK_IP` lasts 600 seconds. `BLOCK_IP` requires CRITICAL severity and lasts 3600 seconds.
7. A new request denied by an active rule supplies verification evidence. Approval alone is not verification. Removing or expiring a rule retains historical incident evidence.

Model/schema failures use a labeled rule fallback. The model does not directly install firewall rules.

## r3 selection and runtime snapshot

The local backend health check during this handoff returned:

```text
http://127.0.0.1:8000/api/health
status: ok
model: sentinel-qwen3.5-4b-r3:latest
model_ready: true
```

The sidecar was found listening on **8099**, not 8000. Port 8000 is the SOC backend. Both processes were retained; this handoff did not restart them. Runtime availability is a point-in-time check, not a deployment guarantee.

On M5, select r3 explicitly after importing the agreed GGUF using its Modelfile:

```bash
export SENTINEL_MODEL='sentinel-qwen3.5-4b-r3:latest'
```

Apply this environment setting when starting the backend. The code default remains `qwen3.5:4b`; having r3 installed does not automatically select it. Keep r2/base artifacts available for an operator-controlled rollback. A base model is not an automatic inference failover: model errors currently follow the labeled rule-fallback path.

## Evidence for the paper

| Dataset | r3 M5 pass count | r3 M5 median |
|---|---:|---:|
| v1 test | 28/28 | 14.4 s |
| v2 | 40/40 | 13.1 s |
| obeto-v3 | 32/34 | 12.6 s |
| obeto-v4 | 30/33 | 11.9 s |

These are existing team benchmark results, not a new benchmark run during the frontend commit. M5 evidence and datasets are in PR #13. r3's v2/v3 errors informed its training-data revision, so those sets are regression evidence for r3, not independent held-out evidence. v4 was created after training; base and r2 were not evaluated there.

The recorded LAN and live-website demonstrations used **r2**. The website sidecar forwarded requests from the Beer machine to an existing upstream; this did not deploy an inline filter for every VPS user. Website Reject/browser exercises and a complete M5/Neo hotspot rehearsal were pending in the latest checklist. Do not mark those complete solely because r3 is now model-ready locally.

## Review queue

- PR #13: v2/v3/v4 datasets and M5 evidence. Checks passed when inspected; Obeto review still required.
- PR #15: real-server `/api/enforce`. Checks passed when inspected; Obeto review still required.
- The frontend/integration handoff is based on #15 so the current backend service remains intact. Its PR targets the #15 branch to show only the new frontend/integration diff. Merge #15 into dev and retarget this PR to dev before merging it separately.
- Source sidecar and usage: `integrations/sidecar/`.
- A separate Caddy/SSH bridge source appeared during the handoff and is included in `integrations/rod_mai_rod/` for review. It is not the sidecar demonstration described above. This upload performs no VPS installation or scheduled-task change and supplies no fresh evidence that the bridge was deployed.

Approval of another person's review cannot be supplied by a bot under that person's identity. These changes are uploaded for review; this handoff does not merge the pending backend/model PRs.

## Checks for this upload

The frontend production build and whitespace check are run before upload. Earlier isolated UI evidence is described in `reports/dashboard-redesign-2026-10-21.md` and `reports/dashboard-art-2026-10-22.md`. Existing evidence remains distinct from a fresh model or two-machine test.

No bot token, private admin key, database, model weights, node_modules, dist bundle, local handoff archive or decorative mockup ZIP is required in the source commit. Build `frontend/dist` from source when deploying.
