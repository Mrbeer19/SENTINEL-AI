# SENTINEL — Poster dashboard

Front-end ใหม่ใช้ดีไซน์ Sentinel Poster: พื้นดำ graphite, ตัวอักษรเงิน, หัวเรื่องทึบ/เส้นขอบ, ปุ่ม lime และแผงกระจก ใช้ React และข้อมูลจาก Backend เดิม ทุกหน้าสร้างจาก DOM ไม่มี screenshot ของหน้าเว็บวางเป็น UI

## Run locally

```powershell
# Start the existing backend separately on its configured port.
cd frontend
npm ci
$env:SENTINEL_API_TARGET = 'http://127.0.0.1:8001'
npm run dev
```

`SENTINEL_API_TARGET` controls the Vite proxy for both `/api` and `/ws`; its default is `http://127.0.0.1:8001`. Use the port of the backend actually running. Production builds use same-origin `/api` and `/ws` and the existing cookie session. No admin credentials belong in Vite variables.

```powershell
npm run build
npm test
```

The production output is `frontend/dist/`. Backend deployment and enforcement are unchanged.

## Pages and data

- Login: `/api/auth/session`, `/api/auth/login`, `/api/auth/logout`; no demo password bypass.
- Overview: existing summary/source/attention data, a persistent interactive globe, the original selected-source and decision panels, and a compact activity strip. Extra records remain in the Sources/Network tabs or their own pages.
- Sources: real timeline/table, IP/channel/time filters, shared selection and incident links. Sources without coordinates remain readable.
- Network: a new observed-relationship diagram; solid Web links and dashed SSH/Ports links; selecting a node opens the source inspector. Animation pause and paged node sets are available.
- Incidents: search, severity/type/channel/status filters and sorting; each row keeps its own incident ID. Filters are stored in the hash query.
- Incident detail: report-derived evidence, stored-event counts, timeline/audit, proposal and verification. The graph describes counts per stored event, not an invented requests-per-second rate.
- Investigation: specialized-rule evidence or recorded agent trace, a read-only history replay, and the existing analyze endpoint where appropriate.
- Approvals: pending/history, reviewer from session, confirm before POST, and server-confirmed status. Automatic rule decisions remain distinguishable from human decisions.
- Protection: active/history, server-based expiry/manual-unblock display, confirmation before DELETE, and actual denied-request evidence.
- Reports: case-specific HTML paper, A4 print rules and complete JSON export for the chosen incident.

## Globe and performance

`PosterGlobe.jsx` owns a single scene while navigating. `posterGlobeScene.js` loads asynchronously, caps rendering at 30 fps, sizes the buffer to the visible viewport (maximum width 1400), renders on demand after movement settles, and stops while hidden or on Approvals. Unmount disposes geometry/materials/textures and the WebGL context. There are no baked globe images behind it.

Coordinates come only from the existing `resolveGeo` cache/queue: two simultaneous lookups, positive cache 24 hours, private/documentation addresses skipped. At most 24 source markers are plotted; co-located sources share a selectable cluster. The source lists retain the complete loaded set. The globe and list share IP identity. Zooming in hides surrounding Overview content while keeping navigation and globe controls; zoom out or reset restores it.

## Development preview

`http://127.0.0.1:5173/tests/preview.html?scenario=geo-locations#/overview` uses the existing development-only fixture interceptor. `pending`, `HTTP_FLOOD`, `WEB_SCAN`, `HONEYPOT`, `many-sources` and the other existing scenarios are available. Fixtures are not a production data fallback.

`src/poster-theme.css` is the active product theme. The earlier product/mission/orbit theme files and earlier page components are not imported by the application entry point. Shared API, validation and rendering primitives retain their original contracts.
