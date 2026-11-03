# Dashboard art direction — 22 October 2026

## Visual update

The latest white cyber brutalism reference replaces the earlier black poster direction. The dashboard retains its light palette, purple accents and lime status highlights.

- New condensed display heading, editorial spacing and a three-stage observe / understand / respond caption.
- Original isometric voxel sculpture in `frontend/public/assets/sentinel-structure-v2.svg`, with linework, hatching, purple and lime geometry. Built as vector geometry; no external image service or font dependency.
- Actual connection status overlays the illustration. The sculpture itself is decorative and does not represent network measurements.
- Hero stacks vertically on mobile. IP explorer, globe and human approval workflow remain available below it.

## Verification

- `npm run build`: passed.
- `git diff --check`: passed (line-ending notices only).
- Browser checks at 1440 × 1000 and 390 × 844: no document horizontal overflow; illustration loaded.
- IP shortcut scrolls to the source panel.
- No backend logic changes or new block decisions were made during this visual update. Block / unblock backend integration was not retested in this pass.

Screenshots: `mockup/brutalist-art-2026-10-22/desktop.jpg` and `mobile.jpg`.
