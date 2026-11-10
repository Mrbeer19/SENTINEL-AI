# Poster dashboard handoff

Date: 10 November 2026. Base: c8ba8fd (main).

## Result

The application entry point now renders the new Poster interface on every route. Earlier page layouts, sidebar, legacy themes and the old 3D Agent Flow scene are not included in the runtime bundle. The new interface is HTML/React, not clickable screenshot backgrounds.

Overview keeps the designed composition: top navigation, three counters, Globe/Sources/Network tabs, selected-source card, pending decisions, compact source picker, globe controls and the activity strip. Detailed evidence is placed on the related pages. No settings rail or additional KPI dashboard was added.

| Area | Replacement |
| --- | --- |
| Login | Secure Access composition, silver globe and glass sign-in form; existing cookie authentication |
| Overview | Live counts/selection with one persistent 3D globe; zoom focus and shared GeoIP cache |
| Sources / Network | New timeline/table and relationship drawing; no old topology component imported |
| Incidents | New calm table and filter strip with real IDs and URL filters |
| Incident detail | Poster case header, evidence/audit, response status and case-specific export |
| Investigation | Recorded rule stages or agent trace/replay; no recreated model results |
| Approvals | New queue/review split with the existing confirmation and POST contract |
| Protection | New active/history table, rule card, real expiry, proof and unblock flow |
| Reports | New white report paper, print stylesheet and complete per-case JSON |

Backend/API contracts, authentication, policy and enforcement code were not changed. Existing error handling, 401 session expiry and 409 refresh behavior remain.

## Validation

- Frontend build: passed. The production graph contains the new pages and lazily loaded Three.js globe; it no longer includes the old force-graph scene chunk.
- Frontend tests: 58 passed (50 existing plus 8 new cases covering real incident links, combined filters, rule/fallback labels, escaped event paths, count units, verification and no-expiry rules).
- Backend regression run: 498 passed; one shell-sourcing test initially failed because `sh` was absent from this Windows process PATH. The same test passed after adding the installed Git `bin` directory to the test process PATH. No backend change was needed.
- Browser route checks: Overview, Sources, Network, Incidents, Incident Detail, Investigation, Approvals, Protection and Reports all rendered. One globe canvas was retained, and no horizontal document overflow was observed at the desktop viewport.
- Real isolated backend flow (port 8015, disposable SQLite, model calls disabled): wrong password rejected; valid session accepted; live counts loaded; proposal approval created a rule but did not fabricate verification; a new request returned 403 and changed verification; unblocking restored HTTP 200; rejecting a different proposal created no rule.
- Actual browser JSON download for incident 2 contained `id: 2`, HTTP_FLOOD, its event, two traffic records and eight timeline records.
- Browser testing used both development fixtures and the isolated backend. It did not touch a deployed database, deployed rules, or the production model.

## Limits / follow-up at deployment

- Use the existing deployment configuration and real admin account. No credentials, QA database, local virtual environment or test server script are part of the change.
- Globe positions are approximate and are not created for private/documentation IPs. Globe marker count is bounded; Sources retains all loaded records.
- The embedded browser viewport override did not actually change its viewport in this environment. Responsive styles and overflow handling are included, but an actual mobile-device acceptance check remains recommended.
- The model itself, external collectors, VPS configuration and enforcement on the real protected site were not changed or retested by this frontend migration.

## VPS deployment — 10 November 2026

- Live URL: https://sentinel.179-197-254-226.sslip.io/
- Frontend revision: `2f7d9ff8b4e0934fefe2d1ce650806321913d0a8`.
- Deployed on the existing Hostinger VPS using Docker Compose project `sentinel`, service `api`. The new static build was layered onto the exact running backend image, preserving backend code/dependencies, environment, volume and container restrictions. Caddy and other stacks were unchanged.
- Image: `sentinel-api:poster-2f7d9ff` (also tagged `sentinel-api:local`). Release files: `/opt/sentinel-ai/releases/poster-2f7d9ff/`.
- Rollback image: `sentinel-api:rollback-poster-20261110`. To restore from `/opt/sentinel-ai/deploy/vps`: `docker image tag sentinel-api:rollback-poster-20261110 sentinel-api:local` then `docker compose up -d --no-build --no-deps --force-recreate api`.
- Verification: HTTPS serves the new HTML, application script, lazy globe chunk and Earth texture; deployed sign-in renders without browser console errors. Authenticated read-only backend probes returned 200 for health, incidents, proposals and rules. Unauthenticated incidents remained 401. Bridge and sensor were active; all three other active website URLs returned 200 after deployment.
- Container snapshot after startup: 70.8 MiB / 384 MiB RAM, 0.20% CPU (point-in-time measurement).
- Model status at verification: `rule_fallback`, `model_ready=false`. The frontend deployment did not start or change the workstation model tunnel.
- A brief 502 occurred while the API container restarted; checks passed once startup completed. Production browser sign-in with the admin password and mobile-device acceptance were not performed.
