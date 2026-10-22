# Dashboard redesign — 21 October 2026

## Design

White / black cyber brutalist interface with purple and lime accents, thin grid lines, square controls, numbered sections and locally rendered graphics. The light theme applies across the existing eight SOC pages. All CSS remains in one stylesheet with grouped media queries.

Overview now provides:

1. Summary counts for observed source IPs, open incidents, pending proposals and active rules.
2. A globe with local decorative grid graphics, selected source and location availability.
3. A protection desk showing pending proposals and a local SVG application node graphic.
4. Searchable source rows with evidence, status and actions. Mobile source rows become cards with visible controls.
5. Request activity and recent requests from backend records.
6. Shortcuts that scroll directly to sources or the protection desk.

## Operator flow

- Analyze from an incident's source row.
- Open an existing block proposal from the protection desk or source row.
- The dialog loads the incident report, shows the mode (including rule fallback), target IP, duration, evidence and reviewer.
- One confirmation records approval or rejection through the existing backend API; cancel makes no write.
- After approval, the source row shows an active block and remaining time. A new denied request is still required to verify the result.
- Open Unblock from the source row and confirm removal of that specific app rule. Other rules for the IP, if any, may remain effective.

Existing detailed incident / analysis / approvals / rules / reports pages remain accessible. Page navigation returns to the top, while row selection does not change pages. Dialog uses native modal focus and restores focus on close.

## Verification

Used a separate local backend (8001), Vite preview (5175) and an ignored fresh test database. Model disabled explicitly for these checks to test honest fallback labels.

- Build passes (`npm run build`).
- `git diff --check` passes.
- Eight pages at desktop 1440 and mobile 390: no overflowing panels or Vite error overlay.
- Search with no matches → clear filters → all sources restored.
- Selecting an IP updates the selected source on the globe card.
- Approval dialog → cancel: no rule created.
- Approval from Overview source row → rule created; new request returns HTTP 403 and incident is verified.
- Unblock from Overview source row → confirmation → new request returns HTTP 200.
- Rejection from protection desk → proposal rejected, no rule added for that source.
- Reviewer shorter than two characters disables confirmation.
- Mobile modal fits within 390px viewport; mobile source cards fit without horizontal scrolling.
- Local SVG assets render and browser console has no errors during the final mobile interaction check.

Screenshots and layout measurements: `mockup/brutalist-review-2026-10-21/`.

## Limits

GeoIP is not connected. LAN and documentation IP ranges have no real country pin; public IPs without geolocation are labelled as unknown. The decorative globe and node do not invent measurements. The existing demo pin mode remains explicitly labelled as simulated.

The application observes its own demo endpoints and ingested events, not all network traffic or the host firewall. These local UI checks do not certify live model performance or replace a two-machine M5 / Neo LAN rehearsal. The main database was not used to generate test incidents for the redesign.
