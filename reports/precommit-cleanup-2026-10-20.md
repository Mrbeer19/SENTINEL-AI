# Pre-commit cleanup — 20 October 2026

## Decisions and changes

1. **Neo uses Terminal only.** Removed `frontend/src/neo/` and `frontend/neo/`. Root README links to `scripts/neo/README.md`, separates M5 SOC from the Neo client, and uses the current button labels. The older dashboard report is marked as a historical version.
2. **Mobile menu no longer stretches.** The single `max-width: 860px` section sets `.shell { align-content: start; }`.
3. **One stylesheet.** `frontend/src/main.jsx` imports only `style.css`. Theme tokens, components, visual styling, readability and UX styles are consolidated there. Removed `tokens.css`, `polish.css`, `readability.css` and `ux.css`. Each breakpoint has one media block, arranged from wide to narrow; reduced motion and print follow. No duplicate selector blocks within a media section.
4. **Local delivery packages stay out of Git.** `.gitignore` excludes `/SENTINEL-handoff-*.zip`, `/mockup/SENTINEL-dashboard-designs-*.zip` and `/handoff/`. These files remain on disk.

## Verification

- `npm run build`: passed; production output has the M5 entry and assets, without a Neo entry. CSS output is 59.33 kB, versus 72.74 kB before cleanup.
- Served production build: `/` returned HTTP 200; `/neo/` returned HTTP 404.
- `git diff --check`: passed.
- Compared computed styles for all 8 pages at widths 390, 860, 1100, 1366 and 1920. Corrected differences introduced by consolidation; final mobile comparisons differ only in the intended shell alignment. Ignored intermediate navigation transition colours when comparing.
- Short-content page at 390×900: sidebar height 260px, with remaining room below content. At 860×900: sidebar height 124px. Neither sidebar expands to fill the viewport.
- Fresh page while the test backend was unavailable: sidebar remained 260px at width 390, and the page showed the connection message. No horizontal overflow.
- Expanded usage guide retains the expected five-column layout on the wide screen.
- Source imports contain no references to deleted Neo files or old CSS files.
- `git check-ignore -v` confirms all three delivery-package exclusions.
- No staging, commit or push was performed during cleanup.

Browser checks used the isolated test database and local test servers. This does not replace the M5 / Neo LAN rehearsal or testing with the live model.

## Files to select for the frontend commit

Review these paths explicitly:

- `.gitignore`
- `README.md`
- `frontend/` — source, assets, documentation and the intended deletions; `dist/` and `node_modules/` are ignored
- `scripts/neo/README.md`
- `reports/dashboard-v1-beer.md`
- `reports/frontend-review-2026-10-19.md`
- `reports/frontend-review-request.md`
- `reports/frontend-ux-review-2026-10-20.md`
- `reports/precommit-cleanup-2026-10-20.md`

Other untracked mockups and screenshots are outside this source selection. Select paths individually; do not use `git add -A`.

Local comparison data and screenshots are in the ignored directory `backend/tests/.tmp/frontend-cleanup-2026-10-20/`.
