# Activity Dashboard — Fall Activity Matrix SR 2026

Interactive schedule dashboard for camp activity planning. Parses CSV files dynamically, matches activity names across files with fuzzy matching, and persists data in localStorage across browser reloads.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start dev server
npm run dev

# 3. Open in browser (usually http://localhost:5173)
```

## File Uploads

The dashboard expects three CSV files:

| File | Description |
|------|-------------|
| **Activity Metadata** | Activity names, customer value ratings, intensity, location zones, staff — the CDS/data sheet |
| **Distance Matrix** | Pairwise walking distances in meters between activity locations |
| **Schedule Matrix** | Activity rotations (A, B, etc.) with groups × time slots across days |

Files are saved in your browser's localStorage and will persist across reloads. Click **Re-upload** to replace them.

## Name Matching

Activity names often vary between the three files (typos, location info in parentheses, apostrophe variants, etc.). The dashboard:

1. Uses the **metadata file** as the canonical name source
2. Normalises all names (strips locations, apostrophes, whitespace)
3. Applies **fuzzy matching** (Levenshtein distance) for near-misses
4. Flags unresolved mismatches in the **Warnings** panel

## Features

- **Rotation toggle** — switch between schedule rotations (A, B, etc.)
- **Group focus** — click any group number to zoom in on a single group's schedule
- **Color modes** — Customer Value gradient, Intensity levels, Indoor/Outdoor, Location Zone
- **Distance badges** — walking distance between consecutive activities (color-coded)
- **Per-day breakdowns** — stats broken out by Monday, Tuesday, Wednesday (not cross-day)
- **Detail panel** — click any cell for full activity metadata + nearest activities
- **Visual day spacing** — clear gaps between days in the grid

## Project Structure

```
src/
├── App.jsx                    # Orchestrator (upload ↔ dashboard)
├── main.jsx                   # React entry point
├── components/
│   ├── Dashboard.jsx          # Main grid, controls, stats, detail panel
│   └── FileUploader.jsx       # Drag-drop CSV upload interface
├── constants/
│   └── colors.js              # Color palettes and helpers
└── utils/
    ├── parsers.js             # CSV parsing + name registry + distance lookup
    └── storage.js             # localStorage persistence wrapper
```
