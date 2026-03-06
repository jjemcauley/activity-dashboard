# Activity Dashboard — Generator Rebuild

## What This Is

An activity scheduling dashboard for a camp/resort operation that manages activity rotations across groups. The existing app handles CSV upload, data visualization, manual editing, and manual schedule building. This project focuses on completely rebuilding the **Generator tab** — the automated schedule generation engine that produces optimal Latin square rotation matrices based on activity constraints.

## Core Value

Generate the most theoretically optimal activity schedule that maximizes activity value while respecting physical, operational, and experience constraints — so staff don't have to build schedules by hand.

## Requirements

### Validated

- ✓ CSV upload and parsing of metadata + schedule files — existing
- ✓ Activity registry with name normalization and alias matching — existing
- ✓ Distance matrix computation from GPS coordinates — existing
- ✓ Dashboard visualization with color modes and detail panels — existing
- ✓ Live editor with undo/redo for manual schedule tweaks — existing
- ✓ Manual builder with drag-and-drop Latin square construction — existing
- ✓ Similarity group extraction and tracking — existing
- ✓ localStorage persistence across sessions — existing
- ✓ DashboardContext for shared data distribution — existing

### Active

- [ ] Season-aware generation — filter activity pool by selected season using metadata "Season" column (values: "Season", "Season/Season", or "All")
- [ ] Multi-rotation schedule generation — produce complete schedules for N=1 through N=max rotation counts
- [ ] Activity pool partitioning — when N>1, split activities across rotations optimizing for equal total value per rotation
- [ ] Value-optimized Latin square generation — greedy algorithm that maximizes activity value per slot
- [ ] Walk distance minimization — penalize long transitions, favor strategic positioning (one long walk to set up short subsequent walks)
- [ ] Gwitmock constraint — max 1 Gwitmock-zone activity per group to minimize hill climbs
- [ ] Similarity group spacing — reduce back-to-back activities from the same similarity group
- [ ] Cross-rotation value balancing — ensure roughly equal overall quality between concurrent rotations
- [ ] Zone/location data from metadata — replace hard-coded ZONE_MAP with data-driven zone lookup from CSV
- [ ] Tabbed UI by rotation count — tabs for "1 Rotation", "2 Rotations", etc., each showing the generated matrices
- [ ] Season selector — dropdown to pick which season to generate for
- [ ] Constraint violation reporting — surface when/which constraints were relaxed, don't fail silently
- [ ] Generate button with progress feedback — clear indication that generation is running and when it completes

### Out of Scope

- Real-time collaboration — single-user app, no multi-user sync needed
- Server-side generation — stays client-side, no backend
- Cross-rotation activity sharing — rotations never share activities by design
- Automatic season detection — user explicitly selects season
- Group size input — generator produces schedules indexed by rotation count, not group count
- Mobile-optimized generator UI — desktop-first for schedule management

## Context

This is a brownfield rebuild of the Generator tab in an existing React SPA. The current generator (`src/components/Generator.jsx`, ~1000 lines) uses a row-by-row greedy algorithm with hard-coded zone mapping and no season awareness. It generates a single rotation at a time and fails silently when constraints can't be met.

Key domain concepts:
- **Activity Rotation**: A Latin square matrix where rows = groups, columns = time slots, cells = activities. Each activity appears exactly once per row and once per column.
- **Rotation count (N)**: How many simultaneous rotations run. Activities are partitioned — rotation A and rotation B never share an activity. Max group capacity = 12 × N.
- **Seasons**: Activities have season availability ("Fall", "Spring/Fall", "All", etc.). Schedules are generated per-season.
- **Gwitmock**: A zone of activities that are geographically close on paper but require a steep hill climb. Operationally, groups should visit Gwitmock at most once.
- **Similarity Groups**: Activities serving similar purposes (e.g., multiple High Ropes variants). Back-to-back same-group activities feel repetitive.
- **Latin square property**: Every group gets every activity exactly once, so within-rotation value balance is automatic. The challenge is balancing value *across* rotations.

Existing infrastructure to leverage:
- `DashboardContext` provides registry, distMatrix, timeSlots, daySlices, similarities
- `src/utils/distanceCalculator.js` for GPS-based distance computation
- `src/utils/parsers.js` for metadata parsing (already extracts season column)
- `src/constants/colors.js` for consistent UI theming

## Constraints

- **Tech stack**: React 18 + Vite + Tailwind CSS 4 — must stay consistent with existing app
- **Client-side only**: No backend, all computation in browser (consider Web Workers for heavy generation)
- **Latin square cap**: Max 12 groups per rotation matrix
- **Data source**: Activity metadata comes from CSV upload, including season, GPS, value, location/zone
- **Existing data model**: Must work with current registry, distMatrix, and similarities structures from DashboardContext

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Generate all N variants (1-rot through max-rot) | Users pick the schedule matching their group count; avoids re-running generator | — Pending |
| Season filtering at generation time | Activity availability varies by season; one generation run = one season | — Pending |
| Replace hard-coded ZONE_MAP with metadata-driven zones | Current approach breaks when activities change; data should drive behavior | — Pending |
| Optimize activity partitioning for equal value across rotations | Concurrent rotations should deliver equivalent customer experiences | — Pending |
| Tabbed UI indexed by rotation count | Clean separation of N=1, N=2, etc. results with easy comparison | — Pending |

---
*Last updated: 2026-03-06 after initialization*
