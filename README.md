# Activity Dashboard

A React-based scheduling tool for managing activity rotations across groups and time slots. Built for camp/event operations where groups rotate through activities across multiple days with constraints around walking distances, activity similarity, intensity balance, and staffing.

## Quick Start

```bash
npm install
npm run dev       # Start dev server at localhost:5173
npm run build     # Production build to dist/
npm run preview   # Preview production build
```

## Architecture

### Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| UI Framework | React 18.2 | Component rendering with hooks |
| Styling | Tailwind CSS v4 | Utility-first CSS with custom theme |
| Build | Vite 5.1 | Dev server + production bundler |
| CSV Parsing | PapaParse 5.4 | Parsing uploaded CSV files |
| State | React hooks | useState, useMemo, useCallback, useEffect |
| Persistence | localStorage | Client-side data persistence across reloads |

### Directory Structure

```
src/
  index.css              # Tailwind theme + custom utilities + animations
  main.jsx               # React entry point
  App.jsx                # Root orchestrator + tab routing + DataView

  components/
    FileUploader.jsx     # CSV drag-drop upload (3 required + 1 optional)
    Dashboard.jsx        # Read-only schedule overview with stats
    LiveEditor.jsx       # Cyclic operation editor (swap, rotate, decompose)
    Builder.jsx          # Interactive drag-drop schedule builder
    Generator.jsx        # Algorithmic schedule generation (greedy + Latin square)

  constants/
    colors.js            # All color constants, palettes, and color helpers

  utils/
    parsers.js           # CSV parsing, fuzzy name matching, distance lookup
    scheduleStats.js     # Shared statistics computation (extracted from components)
    storage.js           # localStorage wrapper with "actdash_" prefix
```

### Design System

All design tokens are defined in `src/index.css` using Tailwind v4's `@theme` directive:

**Base palette** -- Dark theme backgrounds from `base-900` (#0a0d13) through `base-100` (#71717a)

**Text palette** -- `text-primary` (#e8e6e1), `text-secondary` (#888), `text-muted` (#666), `text-faint` (#555)

**Accents** -- `accent-gold`, `accent-cyan`, `accent-orange`, `accent-purple`, `accent-green`, `accent-amber`, `accent-pink`, `accent-red`

**Semantic** -- `success`, `error`, `warning`, `info`

**Fonts** -- `font-sans` (DM Sans), `font-display` (Playfair Display), `font-mono` (DM Mono)

Custom utility classes: `card`, `card-dark`, `stat-card`, `badge`, `section-label`, `table-header`, `btn-sm`, `btn-pill`

### Data Flow

```
CSV Files (user upload)
    |
    v
parsers.js
    |-- parseMetadata()     -> activity names, values, intensity, location
    |-- parseDistances()    -> pairwise distance matrix + start locations
    |-- parseSchedule()     -> rotation groups x time slots x days
    |-- parseSimilarities() -> activity similarity groupings (optional)
    |-- buildRegistry()     -> cross-file name reconciliation via fuzzy matching
    |
    v
App.jsx (state orchestrator)
    |-- stores raw CSV in localStorage via storage.js
    |-- manages tab routing + effective rotations (original vs edited)
    |
    v
Components consume { registry, distMatrix, rotations, timeSlots, daySlices, ... }
```

### Component Responsibilities

**FileUploader** -- Drag-drop interface for 3 required CSVs (metadata, distances, schedule) and 1 optional (similarities). Reads files as text and passes to App for processing.

**Dashboard** -- Read-only grid visualization of the schedule. Shows per-group stats (value averages, walk distances, indoor/outdoor balance), per-day breakdowns, color modes (value, intensity, location), distance badges, CSV export, and edit toggle.

**LiveEditor** -- Applies algebraic operations to existing schedules: row swaps, column swaps, symbol swaps, and cycle decomposition/switching. Includes undo/redo, real-time impact preview, and change log.

**Builder** -- Full interactive schedule editor with drag-drop from an activity palette, copy/paste with rectangular selection, cell grouping, per-rotation assignment constraints, cross-rotation validation, and comparison views against existing schedules.

**Generator** -- Algorithmic schedule creation using greedy Latin square generation with:
- Position multipliers (last slot of day/schedule boosted)
- Similarity decay (diminishing returns for same-group activities)
- Walk distance penalties (short/medium/long thresholds)
- Hard adjacency constraints (no same-group activities back-to-back)
- Post-processing anti-adjacency swaps

### Shared Utilities

**`parsers.js`** -- Core data layer. Handles CSV parsing with PapaParse, name normalization (stripping location suffixes, collapsing whitespace), Levenshtein distance for fuzzy matching, cross-file name registry building, and distance lookups across name aliases.

**`scheduleStats.js`** -- Extracted from Dashboard and Builder to eliminate duplication. Provides `parseStaff()`, `computeDayStats()`, `computeOverallStats()`, `computeTableAverages()`, and `escapeCSV()`.

**`colors.js`** -- Consolidated color constants previously scattered across components: intensity colors, location colors, day colors, rotation colors, cycle colors, similarity colors, group colors, value tier colors, and helper functions (`valueColor`, `valueTextColor`, `getCellColors`, `getSimColor`).

**`storage.js`** -- localStorage wrapper with namespaced keys (`actdash_*`). Supports CSV text storage, JSON serialization, existence checks, and bulk clear.

### Styling Approach

The project uses Tailwind CSS v4 with zero static inline styles. Dynamic runtime values (computed colors from data, conditional borders, etc.) use minimal inline `style` attributes scoped to only the dynamic property. All static layout, typography, spacing, and theming use Tailwind utility classes referencing the centralized theme in `index.css`.

## Data Requirements

The dashboard expects CSV files exported from Google Sheets or similar:

1. **Activity Metadata** -- Activity names with customer value ratings, intensity levels, location zones, indoor/outdoor classification, staffing requirements
2. **Distance Matrix** -- Pairwise walking distances (meters) between activity locations, with optional `(start)` location rows
3. **Schedule Matrix** -- Day/time headers with rotation sections containing group rows of activity assignments
4. **Activity Similarities** *(optional)* -- Activity-to-group mappings for the generator's adjacency constraints

Activity names are automatically reconciled across files using fuzzy matching (Levenshtein distance with configurable thresholds). The metadata file is the canonical name source. Mismatches are flagged in the Warnings panel.

## Name Matching

Activity names often vary between files (typos, location info in parentheses, apostrophe variants). The system:

1. Uses the **metadata file** as the canonical name source
2. Normalizes all names (strips locations, apostrophes, whitespace)
3. Applies **fuzzy matching** (Levenshtein distance) for near-misses
4. Flags unresolved mismatches in the **Warnings** panel

Data is saved in your browser's localStorage and persists across reloads. No server required.
