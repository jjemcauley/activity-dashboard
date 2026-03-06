# Coding Conventions

**Analysis Date:** 2026-03-06

## Naming Patterns

**Files:**
- React components: PascalCase with `.jsx` extension (e.g., `FileUploader.jsx`, `DistanceBadge.jsx`)
- Utility/helper modules: camelCase with `.js` extension (e.g., `distanceCalculator.js`, `parsers.js`)
- Constants: camelCase with `.js` extension (e.g., `colors.js`, `rules.js`)
- Context files: PascalCase with `.jsx` (e.g., `DashboardContext.jsx`)
- Hook files: camelCase starting with `use`, with `.js` extension (e.g., `useBuilderState.js`, `useEditorState.js`)

**Functions:**
- Named exports use camelCase (e.g., `haversine()`, `parseMetadata()`, `buildRegistry()`)
- React components use PascalCase when exported (e.g., `export default function FileUploader()`)
- Internal helper functions use camelCase (e.g., `matchName()`, `parseCSVRow()`)

**Variables:**
- Constants: UPPER_SNAKE_CASE when truly constant (e.g., `EARTH_RADIUS_M`, `CONSECUTIVE_INTENSE_WARNING`, `FILE_TYPES`)
- State variables: camelCase (e.g., `dragOver`, `numGroupsA`, `paletteFilter`)
- Configuration objects: UPPER_CASE keys (e.g., `LAST_OF_DAY_MULT`, `WALK_SHORT`)
- Object properties: camelCase (e.g., `metadataActivities`, `distMatrix`, `selectedActivity`)

**Types & Objects:**
- No explicit TypeScript interfaces (project uses JSDoc for type documentation)
- Object property names: camelCase (e.g., `aliases`, `nameMap`, `metadata`)

## Code Style

**Formatting:**
- Indentation: 2 spaces (inferred from ESLint config and codebase)
- Line length: No strict limit observed, but pragmatic wrapping used
- Semicolons: Included (ESLint rule enforces via js.configs.recommended)
- Arrow functions: Preferred for callbacks and functional expressions
- String quotes: Single quotes in JS, double quotes in JSX attributes

**Linting:**
- Tool: ESLint (flat config at `/Users/jjemc/Desktop/activity-dashboard/eslint.config.js`)
- Key rules:
  - `no-unused-vars`: Error, except variables matching pattern `^[A-Z_]` (constants)
  - React Hooks: `eslint-plugin-react-hooks` recommended config applied
  - React Refresh: `eslint-plugin-react-refresh` recommended config for Vite integration
  - ECMAVersion: 2020 in language options, 'latest' in parserOptions

**Trailing Whitespace & Formatting:**
- No dedicated Prettier config detected; formatting is ESLint-driven
- Component JSX uses inline conditional expressions and ternary operators for styling

## Import Organization

**Order:**
1. React/third-party library imports (e.g., `import React from 'react'`)
2. Other node_modules (e.g., `import Papa from 'papaparse'`)
3. Local utility/context imports (e.g., `import { useDashboard } from '../context/DashboardContext'`)
4. Local constants (e.g., `import { INTENSITY_COLORS } from '../../constants/colors.js'`)
5. Local component imports (e.g., `import DistanceBadge from '../../components/shared/DistanceBadge.jsx'`)

**Path Aliases:**
- None configured; all imports use relative paths (e.g., `../utils/parsers.js`, `../../constants/colors.js`)

## Error Handling

**Patterns:**
- **Try-catch for storage operations:** `storage.js` wraps `localStorage` operations in try-catch, logging warnings on failure
  ```javascript
  // Example from storage.js
  try {
    localStorage.setItem(`${PREFIX}csv_${key}`, text);
  } catch (e) {
    console.warn("localStorage save failed:", e);
  }
  ```
- **Parser error handling:** Throws descriptive errors for invalid CSV structure
  ```javascript
  // Example from parsers.js
  if (iName === -1)
    throw new Error('Metadata CSV: could not find "Activity Name" column');
  ```
- **Validation errors:** `buildRegistry()` accumulates warnings in a dedicated `warnings` array rather than throwing
  ```javascript
  // Example from registry.js
  warnings.push({
    name: rawName,
    source,
    issue: `Fuzzy-matched (distance: ${bestDist})`,
    suggestion: bestMatch,
  });
  ```
- **Component-level error handling:** Try-catch in `FileUploader` → `handleLoad()`, sets error state for user display
- **Null coalescing & optional chaining:** Used defensively (e.g., `registry.nameMap[activity] || activity`)

## Logging

**Framework:** `console` (no logging library)

**Patterns:**
- `console.warn()`: Used for recoverable errors (e.g., localStorage failures, data load warnings)
  ```javascript
  console.warn("localStorage save failed:", e);
  console.warn('Failed to load saved data, clearing:', e);
  ```
- No `console.log()` calls observed in production code (clean output)
- Error messages passed directly to user via component state (e.g., `setError(e.message)`)

## Comments

**When to Comment:**
- **File headers:** All utility modules start with multi-line JSDoc describing purpose and design decisions
  ```javascript
  /**
   * distanceCalculator.js — Compute a distance matrix from GPS coordinates
   * found in the CDS metadata. Uses the Haversine formula to calculate
   * straight-line distances in meters between activity locations.
   */
  ```
- **Complex algorithms:** Haversine formula, Levenshtein distance, name matching logic all documented
- **Data structure explanations:** Return types and object shapes explained in comments
  ```javascript
  /**
   * Build a registry that maps every raw activity name from any file
   * to a canonical entry. Metadata names are the canonical source.
   *
   * Returns: {
   *   canonical: { [canonicalName]: { metadata, aliases: string[] } },
   *   nameMap:   { [anyRawName]: canonicalName },
   *   warnings:  { name, source, issue, suggestion }[]
   * }
   */
  ```
- **Configuration sections:** Explicitly marked with decorative headers (see Generator.jsx CONFIG section)

**JSDoc/TSDoc:**
- Function parameters documented in JSDoc above exports
- Return types described in comments
- No @param/@returns tags observed; uses prose descriptions instead
- Example: `* @param {Object} metadataActivities — output of parseMetadata(), keyed by activity name`

## Function Design

**Size:**
- Utility functions: 20-60 lines typical (algorithms like Levenshtein at ~25 lines)
- Parser functions: 50-100+ lines (complex CSV parsing with regex and state tracking)
- React components: 100-250+ lines common (complex interactive components)
- Custom hooks: 400+ lines for stateful orchestrators (useBuilderState.js is 428 lines)

**Parameters:**
- Utility functions: 2-4 parameters typical, no destructuring in signatures
  ```javascript
  export function haversine(lat1, lon1, lat2, lon2) { ... }
  export function parseGPS(gpsStr) { ... }
  ```
- React components: Single `props` object parameter, destructured in function body
  ```javascript
  export default function ActivityDetailPanel({ activity, registry, distMatrix, onClose }) { ... }
  ```
- Callbacks: Arrow functions with direct parameter access (e.g., `useCallback((e) => { ... }, [...])`)

**Return Values:**
- Functions return objects for multiple outputs (e.g., `{ matrix, names, startLocations }`)
- Null/undefined returned explicitly for missing data (e.g., `parseGPS()` returns `null`)
- JSX components return JSX or conditional JSX renders

## Module Design

**Exports:**
- Named exports used for utilities and hooks
  ```javascript
  export function haversine(lat1, lon1, lat2, lon2) { ... }
  export const storage = { ... };
  export default function useBuilderState({ ... }) { ... }
  ```
- Default exports preferred for React components
  ```javascript
  export default function FileUploader({ onFilesReady, hasExisting }) { ... }
  ```
- Mixed default + named exports in `parsers.js` for backwards compatibility and re-exports

**Barrel Files:**
- Not used; imports reference specific file paths
- Exception: `parsers.js` re-exports from split utility modules for compatibility
  ```javascript
  export { clean, stripLocation, normalise, wordOverlap, levenshtein } from './stringMatch.js';
  export { buildRegistry } from './registry.js';
  ```

## Styling & Styling Patterns

**Tailwind CSS:**
- Used exclusively for styling (no CSS modules or styled-components)
- Inline className strings with conditional logic
  ```javascript
  className={`flex gap-2 ${condition ? 'bg-red-500' : 'bg-blue-500'}`}
  ```
- CSS variables for dynamic colors set inline
  ```javascript
  style={{ '--badge-color': color, '--badge-bg': bg }}
  ```
- Long Tailwind expressions broken across multiple lines with template strings
  ```javascript
  className={`rounded-[3px] font-semibold font-mono text-center
    text-[var(--badge-color)] bg-[var(--badge-bg)]
    ${compact ? 'text-[11px] px-1...' : 'text-[11px] px-1.5...'}`}
  ```

## State Management Patterns

**React Hooks:**
- `useState()` for local component state and complex multi-state scenarios
- `useCallback()` to memoize event handlers and avoid child re-renders
- `useMemo()` to cache expensive computations (name filtering, color mapping)
- `useEffect()` for side effects (localStorage sync, initialization)
- Custom hooks (`useBuilderState`, `useEditorState`) for complex stateful logic

**Context API:**
- `DashboardContext` wraps parsed data accessible via `useDashboard()` hook
- Centralized dashboard data (registry, distMatrix, rotations, etc.)
- Simple provider with no reducer pattern

**Props Drilling:**
- Accepted pattern when depth is shallow (< 3 levels)
- Complex builder state passed through context + custom hook + parent component state

---

*Convention analysis: 2026-03-06*
