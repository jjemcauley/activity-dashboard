# Architecture

**Analysis Date:** 2026-03-06

## Pattern Overview

**Overall:** Multi-tab React SPA with state-lifted orchestration and context-based data distribution

**Key Characteristics:**
- **Tab-based UI** — Single App component manages mode (upload/app) and active tab, delegating render to tab-specific components
- **State lifting to App root** — Persistent state (edits, builder state, locations) lives in `App.jsx` to survive tab switches
- **Context API for shared data** — `DashboardContext` distributes read-only activity/schedule metadata to consumers
- **Functional hooks for local state** — Each tab uses custom hooks (`useEditorState`, `useBuilderState`) for isolated complexity
- **CSV → structured data pipeline** — Three-phase processing: parse → registry build → final output
- **Persistent localStorage** — All uploads and edits backed by localStorage, keyed with `actdash_` prefix

## Layers

**Presentation (UI Components):**
- Purpose: Render UI and capture user interaction
- Location: `src/components/**/*.jsx`
- Contains: Tab views (Dashboard, LiveEditor, Builder, Generator, DataView), sub-components, and shared UI elements
- Depends on: Context, hooks, utilities
- Used by: App.jsx routes traffic to these based on tab selection

**State Management:**
- Purpose: Track complex application state (edits, selections, undo history, builder matrices)
- Location: `src/hooks/*.js` (custom hooks)
- Contains: `useEditorState` for live editing operations, `useBuilderState` for rotation builder state
- Depends on: Context, validation utilities
- Used by: Tab components to manage isolated, complex state

**Context/Shared Data:**
- Purpose: Provide read-only activity metadata, distances, schedule info to all descendants
- Location: `src/context/DashboardContext.jsx`
- Contains: Single context that wraps the main app, supplies registry, distMatrix, timeSlots, daySlices, similarities, locations
- Depends on: None
- Used by: All child components via `useDashboard()` hook

**Data Processing:**
- Purpose: Transform raw CSV inputs into structured, usable data
- Location: `src/utils/` (parsers.js, processFiles.js, registry.js, distanceCalculator.js, etc.)
- Contains: CSV parsing, name normalization, distance matrix computation, metadata registry building
- Depends on: papaparse (CSV parsing)
- Used by: App.jsx during file upload; not called after initial load

**Persistence:**
- Purpose: Store/retrieve CSV data and application state to localStorage
- Location: `src/utils/storage.js`
- Contains: Key-value wrapper around localStorage with CSV and JSON methods
- Depends on: None
- Used by: App.jsx for init/save/clear, DataView for locations

**Constants/Config:**
- Purpose: Centralize color schemes, tab definitions, validation rules
- Location: `src/constants/` (colors.js, tabs.js, rules.js, defaults.js)
- Contains: Color maps by intensity/location/day, tab metadata, validation constraints
- Depends on: None
- Used by: Components for rendering; tabs.js defines app routing

## Data Flow

**Upload → Process → Store → Display:**

1. User uploads metadata and schedule CSVs via `FileUploader` component
2. `FileUploader` → App.jsx `handleFilesReady` callback receives file objects
3. `processFiles(metadata, schedule)` in `src/utils/processFiles.js` orchestrates:
   - `parseMetadata` — extract activity properties (name, GPS, value, intensity, etc.)
   - `parseSchedule` — extract rotation groups and time slots
   - `buildRegistry` — map all raw activity names to canonical entries with aliases
   - `buildDistanceMatrix` — compute pairwise distances from GPS coordinates
   - `extractSimilarities` — optional grouping data (embedded or separate CSV)
4. Result object stored: `{ registry, distMatrix, rotations, timeSlots, daySlices, similarities }`
5. Stored to localStorage via `storage.saveCSV()` and `storage.saveJSON()`
6. Context created and provided to children
7. App switches to 'app' mode, rendering active tab

**Dashboard View Flow:**

1. Dashboard receives `effectiveRotations` (current or edited) and context from App
2. User selects rotation, group focus, and color mode via DashboardNav
3. DashboardGrid renders schedule matrix, coloring cells based on metadata
4. Clicking cell shows ActivityDetailPanel with metadata and distance info
5. Toggling "Use Edited" switches between original and user-edited versions
6. Export generates CSV matching original format

**Editor Flow:**

1. LiveEditor mounts `useEditorState` custom hook with current rotation
2. Hook initializes: draft = copy of schedule, tracks all edits with undo/redo
3. User selects operation (swap/move/clear), picks cells, applies changes
4. Changes previewed in grid with highlights
5. Save button commits draft back to App's `savedEdits` state
6. Edits applied to `effectiveRotations` (computed in App via useMemo)

**Builder Flow:**

1. Builder component mounts with context data
2. `useBuilderState` initializes two empty rotation matrices (A, B) or loads persisted state
3. Left sidebar shows activity palette, filtered/sorted by user choices
4. Drag/drop activities into grids, or copy/paste groups
5. Real-time validation checks for conflicts
6. Save to Dashboard commits one matrix to live schedule
7. All state persisted in parent component (`builderState` prop)

**State Management:**

- **Root state (App.jsx)**: mode, tab, dashData, savedEdits, builderState, locations
- **Lifted for persistence across tab changes**: Once user edits or builds, state must survive switching tabs
- **Local state (component level)**: Selection, hover, UI toggles
- **Context-provided (read-only)**: registry, distMatrix, timeSlots, daySlices, similarities

## Key Abstractions

**Registry Entry:**
- Purpose: Canonical representation of an activity across all files
- Examples: `src/utils/registry.js` creates entries, `src/utils/activityLookup.js` queries them
- Pattern: Maps raw activity names (with typos/variations) to single canonical entry with metadata
- Structure: `{ metadata: { name, gps, value, intensity, location, ... }, aliases: [raw1, raw2, ...] }`

**Distance Matrix:**
- Purpose: Precomputed pairwise distances between all activities
- Examples: `src/utils/distanceCalculator.js` builds it from GPS, `src/utils/distanceLookup.js` queries it
- Pattern: 2D lookup — `distMatrix[from][to]` returns meters or null
- Used by: Dashboard stats, Editor impact calculations, Builder validation

**Rotation Structure:**
- Purpose: Represents one activity schedule rotation (A or B)
- Pattern: `{ name, groups: [group0, group1, ...] }` where each group is array of activity names by time slot
- Mutations tracked by: Editor's undo/redo, Builder's comparison, Dashboard's edits toggle

**Name Matching:**
- Purpose: Handle real-world CSV inconsistencies (typos, location suffixes, spacing)
- Modules: `src/utils/stringMatch.js` provides normalise, wordOverlap, levenshtein
- Pattern: Three-tier matching (exact → word-overlap → fuzzy) with fallback warnings
- Used by: Registry building during upload

**Similarity Groups:**
- Purpose: Activities that serve same purpose, eligible for substitution
- Examples: Extracted from metadata column or separate CSV file
- Pattern: `{ groups: { "GroupName": [activity1, activity2, ...] }, activityToGroup: { activity1: "GroupName", ... } }`
- Used by: Generator tab (requires similarities), Builder palette filtering

## Entry Points

**Browser Entry:**
- Location: `src/main.jsx`
- Triggers: Initial page load
- Responsibilities: Mount React app into DOM root

**App Root:**
- Location: `src/App.jsx`
- Triggers: Mounted from main.jsx
- Responsibilities:
  - Check localStorage for existing data on mount
  - Route between upload (FileUploader) and app modes
  - Manage global state: tab selection, data, edits, builder state, locations
  - Provide DashboardContext to children
  - Compute effective rotations (original vs edited toggle)
  - Dispatch tab-specific props

**Tab Components:**
- Location: `src/components/Dashboard.jsx`, `LiveEditor.jsx`, `Builder.jsx`, `Generator.jsx`, `DataView.jsx`
- Triggers: App renders active tab based on state
- Responsibilities: Render tab-specific UI, manage local UI state, call parent callbacks to update edits

## Error Handling

**Strategy:** Try-catch at boundaries (file upload, storage access), validation rules during operations

**Patterns:**

- **Upload errors**: `handleFilesReady` catches `processFiles` exceptions, displays via `loadError` state
- **Storage errors**: `storage.js` silently catches localStorage quota/permission errors, logs to console
- **Missing data**: Graceful fallbacks (null checks before rendering, empty arrays for lists)
- **Name mapping failures**: Registry building adds warnings for fuzzy matches, displayed in Dashboard warnings panel
- **Activity lookup**: `lookupMeta(activity, registry)` returns null if not found, caller renders error cell
- **Distance missing**: `getDistance(from, to, distMatrix)` returns null, user-facing code displays as "N/A"

## Cross-Cutting Concerns

**Logging:** console.warn/error only, no dedicated logger. Reserved for critical failures (storage issues, parse errors)

**Validation:**
- **Matrix validation**: `src/components/builder/validation.js` checks for placement conflicts, incomplete assignments
- **CSV format**: Parser expects headers matching patterns (case-insensitive regex), throws on missing critical columns
- **Distance data**: GPS coordinates parsed and validated during metadata load
- **Rules applied**: Max groups per activity, unique activity requirements stored in metadata

**Authentication:** Not applicable — single-user SPA, no backend auth

**Authorization:** Not applicable — all data uploaded by user, no permission model

---

*Architecture analysis: 2026-03-06*
