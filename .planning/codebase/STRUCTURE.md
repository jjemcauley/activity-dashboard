# Codebase Structure

**Analysis Date:** 2026-03-06

## Directory Layout

```
activity-dashboard/
├── src/
│   ├── main.jsx                      # React entry point
│   ├── App.jsx                       # Root orchestrator component
│   ├── index.css                     # Global styles
│   ├── components/
│   │   ├── Dashboard.jsx             # Dashboard tab view
│   │   ├── LiveEditor.jsx            # Live Editor tab view
│   │   ├── Builder.jsx               # Builder tab view
│   │   ├── Generator.jsx             # Generator tab view
│   │   ├── DataView.jsx              # Data tab view
│   │   ├── FileUploader.jsx          # Upload mode component
│   │   ├── builder/                  # Builder sub-components
│   │   │   ├── BuilderPalette.jsx
│   │   │   ├── BuilderToolbar.jsx
│   │   │   ├── RotationMatrix.jsx
│   │   │   ├── ComparisonView.jsx
│   │   │   ├── FullTableComparison.jsx
│   │   │   ├── MatrixCell.jsx
│   │   │   ├── ActivityChip.jsx
│   │   │   └── validation.js
│   │   ├── dashboard/                # Dashboard sub-components
│   │   │   ├── DashboardNav.jsx
│   │   │   ├── DashboardGrid.jsx
│   │   │   ├── DashboardStats.jsx
│   │   │   ├── ActivityDetailPanel.jsx
│   │   │   └── WarningsPanel.jsx
│   │   ├── editor/                   # LiveEditor sub-components
│   │   │   ├── EditorToolbar.jsx
│   │   │   ├── EditorGrid.jsx
│   │   │   ├── EditorSidebar.jsx
│   │   │   ├── CycleSwitchPanel.jsx
│   │   │   └── ChangeLog.jsx
│   │   └── shared/                   # Shared UI components
│   │       └── DistanceBadge.jsx
│   ├── context/
│   │   └── DashboardContext.jsx      # Shared metadata context
│   ├── hooks/
│   │   ├── useEditorState.js         # Live editor state management
│   │   └── useBuilderState.js        # Builder state management
│   ├── utils/
│   │   ├── processFiles.js           # CSV → structured data orchestrator
│   │   ├── parsers.js                # CSV parsing for metadata, schedule
│   │   ├── registry.js               # Activity name registry & mapping
│   │   ├── distanceCalculator.js     # GPS → distance matrix
│   │   ├── distanceLookup.js         # Query distance matrix
│   │   ├── activityLookup.js         # Query activity metadata
│   │   ├── stringMatch.js            # String normalization & fuzzy matching
│   │   ├── scheduleStats.js          # Compute statistics from schedules
│   │   ├── storage.js                # localStorage wrapper
│   │   └── (other utilities)
│   └── constants/
│       ├── colors.js                 # Color palettes by category
│       ├── tabs.js                   # Tab definitions & routing
│       ├── rules.js                  # Validation rules
│       └── defaults.js               # Default values
├── public/                           # Static assets
├── dist/                             # Built output (generated)
├── package.json
├── vite.config.js
├── index.html
├── eslint.config.js
└── .planning/
    └── codebase/                     # This directory
```

## Directory Purposes

**src/:**
- Purpose: All application source code
- Contains: Components, utilities, context, hooks, constants, styles
- Key files: `main.jsx` (entry), `App.jsx` (orchestrator), `index.css` (global styles)

**src/components/:**
- Purpose: All React components organized by feature
- Contains: Tab views (Dashboard, LiveEditor, Builder, Generator, DataView), upload component, sub-component trees
- Key files: `Dashboard.jsx`, `LiveEditor.jsx`, `Builder.jsx` — main tab views

**src/components/builder/:**
- Purpose: Sub-components for the Builder tab
- Contains: Matrix rendering, palette, toolbar, comparison views, validation logic
- Key files: `validation.js` — matrix conflict detection and validation

**src/components/dashboard/:**
- Purpose: Sub-components for the Dashboard tab
- Contains: Navigation, grid rendering, statistics panels, detail views, warnings
- Key files: `DashboardGrid.jsx` — renders schedule matrix, `DashboardStats.jsx` — computes and displays stats

**src/components/editor/:**
- Purpose: Sub-components for the LiveEditor tab
- Contains: Toolbar, grid, sidebar, undo/redo controls, operation selection
- Key files: `EditorGrid.jsx` — interactive schedule with operation highlighting

**src/components/shared/:**
- Purpose: Reusable UI components across tabs
- Contains: Badge components, generic UI elements
- Key files: `DistanceBadge.jsx` — displays distance values

**src/context/:**
- Purpose: React Context API providers
- Contains: DashboardContext for sharing readonly activity/schedule metadata
- Key files: `DashboardContext.jsx` — context definition and provider

**src/hooks/:**
- Purpose: Custom React hooks for complex state management
- Contains: Isolated state machines for Editor and Builder tabs
- Key files: `useEditorState.js` — undo/redo, operation selection, preview; `useBuilderState.js` — matrix state, validation, persistence

**src/utils/:**
- Purpose: Non-component business logic and utilities
- Contains: CSV parsing, data processing, calculations, storage, string matching
- Key files:
  - `processFiles.js` — orchestrates entire CSV → data pipeline
  - `parsers.js` — re-exports parser functions, entry point for CSV handling
  - `registry.js` — builds canonical activity name mapping
  - `distanceCalculator.js` — computes distance matrix from GPS coordinates
  - `storage.js` — localStorage wrapper with prefix

**src/constants/:**
- Purpose: Centralized configuration and constants
- Contains: Color maps, tab definitions, validation rules, defaults
- Key files: `colors.js` — color palettes, `tabs.js` — tab metadata and routing, `rules.js` — validation constraints

**public/:**
- Purpose: Static assets served as-is
- Contains: favicon, images, or other static files
- Committed: Yes, version controlled

**dist/:**
- Purpose: Built application output
- Generated: Yes, created by `npm run build` (vite)
- Committed: No, .gitignore excludes

## Key File Locations

**Entry Points:**

- `src/main.jsx`: ReactDOM render entry point, mounts App to #root
- `src/App.jsx`: Root orchestrator, manages mode (upload/app), tab routing, global state
- `index.html`: HTML template with #root div, entry point for vite

**Configuration:**

- `package.json`: Dependencies (react, tailwindcss, papaparse, vite)
- `vite.config.js`: Vite build config with React and Tailwind plugins
- `eslint.config.js`: ESLint rules (flat config format)
- `.planning/codebase/`: Documentation directory created by GSD mapper

**Core Logic:**

- `src/utils/processFiles.js`: CSV → structured data orchestrator
- `src/utils/parsers.js`: CSV parsing main entry point
- `src/utils/registry.js`: Activity name canonical mapping
- `src/utils/distanceCalculator.js`: Distance matrix from GPS
- `src/utils/storage.js`: localStorage persistence wrapper

**Tab Views (Main Features):**

- `src/components/Dashboard.jsx`: View schedule with stats and export
- `src/components/LiveEditor.jsx`: Edit schedule with undo/redo
- `src/components/Builder.jsx`: Build new rotations side-by-side
- `src/components/Generator.jsx`: Auto-generate schedules (uses similarity data)
- `src/components/DataView.jsx`: Manage reference locations (start, lunch stops)

**Testing:**

- No test files found — testing infrastructure not configured

## Naming Conventions

**Files:**

- **Components:** PascalCase (e.g., `Dashboard.jsx`, `DashboardNav.jsx`)
- **Utilities:** camelCase (e.g., `processFiles.js`, `distanceLookup.js`)
- **Hooks:** camelCase starting with `use` (e.g., `useEditorState.js`)
- **Constants:** camelCase (e.g., `tabs.js`, `colors.js`)
- **Styles:** Tailwind classes only, no separate CSS files per component

**Directories:**

- **Feature folders:** lowercase plural or descriptive (e.g., `builder/`, `dashboard/`, `editor/`, `utils/`, `hooks/`)
- **Flat structure preferred:** Avoid deep nesting; co-locate related files

**Functions & Variables:**

- **camelCase:** Standard for all functions and variables
- **Constants (module-level):** UPPER_SNAKE_CASE if primitive config (e.g., `CONFIG`, `ZONE_MAP`)
- **React components:** PascalCase (both exported and internal)
- **Event handlers:** `on*` prefix (e.g., `onClick`, `onDrop`, `onSave`)
- **State setters:** Paired with state name (e.g., `[draft, setDraft]`)

**Types & Interfaces:**

- No TypeScript — plain JavaScript/JSX
- Objects use descriptive property names: `{ canonical, nameMap, warnings }` style structures

## Where to Add New Code

**New Feature (new tab):**

1. Create feature directory: `src/components/[feature]/`
2. Create main component: `src/components/[Feature].jsx` exports default function
3. Create sub-components: `src/components/[feature]/SubComponent.jsx` as needed
4. Add constants if needed: `src/constants/[feature].js`
5. Add utilities if needed: `src/utils/[feature].js`
6. Register tab in `src/constants/tabs.js`: Add entry to `TABS` array with id, label, component, accent color
7. If requires context data, use `useDashboard()` hook in component tree

Example structure for a new "Analysis" tab:
```
src/components/Analysis.jsx           # Main tab component
src/components/analysis/              # Sub-components
  ├── AnalysisGrid.jsx
  ├── AnalysisToolbar.jsx
  └── AnalysisChart.jsx
src/utils/analysis.js                 # Analysis calculations
src/constants/analysis.js             # Analysis-specific config
```

**New Component/Module:**

1. **UI Component:** Place in appropriate feature folder under `src/components/`
2. **Utility function:** Place in `src/utils/` by category (string utilities, math utilities, etc.)
3. **Custom hook:** Place in `src/hooks/` with `use` prefix
4. **Constants:** Place in `src/constants/` or co-locate in component folder

**Utilities:**

1. **String/parsing utilities:** `src/utils/stringMatch.js` or similar
2. **Data calculations:** `src/utils/scheduleStats.js` (add new calculations there)
3. **Lookups:** `src/utils/[thing]Lookup.js` (e.g., `distanceLookup.js`)
4. **Processors:** Create new file for complex transformations, import in `processFiles.js`

**Styling:**

- Use Tailwind classes directly in JSX (no CSS files for components)
- Global styles in `src/index.css` for resets, theme variables
- Color constants in `src/constants/colors.js` applied via className and style props
- CSS custom properties (variables) for dynamic theming (e.g., `--cell-bg`, `--btn-accent`)

## Special Directories

**src/.planning/codebase/:**
- Purpose: GSD codebase analysis documents
- Generated: Yes, created by GSD mapper
- Committed: Yes, version controlled

**node_modules/:**
- Purpose: npm dependencies
- Generated: Yes, created by `npm install`
- Committed: No, .gitignore excludes

**dist/:**
- Purpose: Built production output
- Generated: Yes, created by `npm run build`
- Committed: No, .gitignore excludes

**.git/:**
- Purpose: Git repository metadata
- Committed: Yes
- Note: Do not modify directly

---

*Structure analysis: 2026-03-06*
