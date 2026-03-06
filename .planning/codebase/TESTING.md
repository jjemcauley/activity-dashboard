# Testing Patterns

**Analysis Date:** 2026-03-06

## Test Framework

**Status:** No testing framework configured

**Current State:**
- No test files detected in codebase (no `*.test.js`, `*.spec.js`, or dedicated test directory)
- No Jest, Vitest, or other test runner in `package.json`
- No test configuration files (`jest.config.js`, `vitest.config.ts`, etc.)
- Package.json has no test script (scripts: `dev`, `build`, `preview` only)

**Dev Stack:**
- Build tool: Vite (v5.1.0)
- Runtime: React 18.2.0 with React DOM
- Build config: `/Users/jjemc/Desktop/activity-dashboard/vite.config.js`
- ESLint for code quality (not testing)

## What This Means

**Testing is entirely manual.** All validation happens through:
1. Browser-based testing (dev server with hot reload)
2. Component interaction testing in development
3. End-to-end manual validation with real CSV data

## Recommended Testing Approach (When Needed)

### Unit Testing for Utilities
The following modules would benefit from unit test coverage:

**`/Users/jjemc/Desktop/activity-dashboard/src/utils/distanceCalculator.js`:**
- `haversine()`: Calculate GPS distance between coordinates
- Test: Known lat/long pairs → expected distances
- Example: NYC to LA should be ~3944 km

**`/Users/jjemc/Desktop/activity-dashboard/src/utils/stringMatch.js`:**
- `normalise()`: Activity name normalization for matching
- `levenshtein()`: Character-level edit distance
- `wordOverlap()`: Word-based similarity
- Test: Various typos, apostrophes, location suffixes

**`/Users/jjemc/Desktop/activity-dashboard/src/utils/parsers.js`:**
- `parseMetadata()`: Extract structured data from CSV
- `parseSchedule()`: Parse day/time slots and rotations
- `parseSimilarities()`: Parse activity grouping
- Test: Valid CSVs, malformed CSVs, missing columns, edge cases

**`/Users/jjemc/Desktop/activity-dashboard/src/utils/registry.js`:**
- `buildRegistry()`: Match raw names to canonical entries with fuzzy matching
- Test: Exact matches, typos, location info variants, no-match orphans

**`/Users/jjemc/Desktop/activity-dashboard/src/utils/processFiles.js`:**
- `processFiles()`: End-to-end orchestration of parsing + matching
- Test: Integration of metadata, distance matrix, schedule, similarities

### Component Testing
**Heavy user-facing components:**
- `/Users/jjemc/Desktop/activity-dashboard/src/components/FileUploader.jsx`: File drop/upload flow
- `/Users/jjemc/Desktop/activity-dashboard/src/components/Generator.jsx`: Complex activity matrix builder (1000 lines)

**Lightweight reusable components:**
- `/Users/jjemc/Desktop/activity-dashboard/src/components/shared/DistanceBadge.jsx`: Color-coded distance badge
- `/Users/jjemc/Desktop/activity-dashboard/src/components/dashboard/ActivityDetailPanel.jsx`: Activity metadata sidebar

### Recommended Testing Stack (When Implemented)

**Test Runner:**
- **Vitest** (preferred for Vite): Fast, ESM-native, Jest-compatible API
  ```bash
  npm install --save-dev vitest @vitest/ui
  ```

**Assertion Library:**
- **Vitest built-in** (uses Node.js assert) or **expect** from Vitest
- Or: **Chai** for BDD-style assertions

**Component Testing:**
- **React Testing Library** for integration tests
- **Puppeteer** or **Playwright** for E2E validation with real CSV imports

**Test File Locations:**
- Co-located: `src/utils/__tests__/distanceCalculator.test.js` (preferred)
- Or separate: `tests/unit/utils/` directory structure

## Example Test Structure (Reference)

```javascript
// src/utils/__tests__/distanceCalculator.test.js
import { describe, it, expect } from 'vitest';
import { haversine } from '../distanceCalculator';

describe('haversine', () => {
  it('calculates distance between two points', () => {
    // Toronto: 43.6532° N, 79.3832° W
    // Montreal: 45.5017° N, 73.5673° W
    const distance = haversine(43.6532, -79.3832, 45.5017, -73.5673);
    expect(distance).toBeCloseTo(504000, -2); // ~504 km
  });

  it('returns 0 for same coordinates', () => {
    const distance = haversine(45, -79, 45, -79);
    expect(distance).toBe(0);
  });
});
```

## Manual Testing Checklist (Current Workflow)

Since no automated tests exist, manual testing covers:

**File Upload & Parsing:**
- [ ] CSV with valid metadata, schedule, GPS data loads correctly
- [ ] Missing required columns shows error
- [ ] Multi-line cells (activity names with location on second line) parsed correctly
- [ ] Activity name matching handles typos (e.g., "Archery" vs "Archery Tag")
- [ ] Location info in parentheses stripped during matching

**Distance Calculations:**
- [ ] GPS coordinates from metadata → distance matrix computed correctly
- [ ] Invalid GPS entries skipped gracefully
- [ ] Distance badge displays color-coded ranges (green <200m, gold 200-500m, red >500m)

**Schedule Matrix & Builder:**
- [ ] Day/time headers identified correctly
- [ ] Activity rotations (A, B, etc.) parsed from schedule
- [ ] Group assignments in builder maintain data integrity
- [ ] Undo/redo stack works across state changes
- [ ] Cross-rotation validation identifies conflicts

**Data Persistence:**
- [ ] localStorage saves metadata and schedule CSVs
- [ ] Data persists across browser reload
- [ ] "Clear all" removes all saved data
- [ ] New upload overwrites existing data correctly

**Name Matching & Registry:**
- [ ] Warnings panel shows fuzzy-matched activities
- [ ] Suggestions provided for unmatched names
- [ ] Exact normalized matches have 0% warnings
- [ ] Levenshtein distance threshold prevents bad matches

## Key Areas NOT Currently Tested

**Why no tests exist:**
- Project is in active development (v1.0 with recent visual updates)
- User validation via browser interaction is primary quality gate
- Data-driven (CSV upload) makes automated test setup complex
- Real-world data shapes (apostrophes, typos, location variants) hard to predict upfront

**High-risk, low-coverage areas:**
- CSV parsing edge cases (especially schedule with merged cells)
- Name matching fuzzy logic across different typo patterns
- Distance matrix calculation with edge case GPS data
- localStorage quota exceeded scenarios
- Large datasets (1000+ activities, complex schedules)

---

*Testing analysis: 2026-03-06*
