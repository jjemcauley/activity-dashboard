# Codebase Concerns

**Analysis Date:** 2026-03-06

## Tech Debt

**Monolithic Hook State Management:**
- Issue: `useBuilderState.js` manages 17+ separate state pieces (428 lines), passing 40+ values/callbacks via return object
- Files: `src/hooks/useBuilderState.js`, `src/components/builder/Builder.jsx`
- Impact: Difficult to test individual features, hard to track dependencies, performance issues when any state updates
- Fix approach: Refactor into smaller reducer-based hooks or context, split business logic into custom hooks per feature area

**Generator Algorithm Lacks Failure Handling:**
- Issue: `Generator.jsx` (1000 lines) contains complex constraint-satisfaction algorithm with fallback to "relaxed" mode when greedy fails
- Files: `src/components/Generator.jsx` (lines 315-323)
- Impact: "Relaxed" solution may violate constraints silently; only logs warning, no user notification
- Fix approach: Expose relaxation mode to user with clear indication of constraint violations, add metrics showing which constraints were relaxed

**Validation Logic Scattered & Redundant:**
- Issue: Validation performed in three places: `validation.js`, builder hooks, and matrix cells; no single source of truth
- Files: `src/components/builder/validation.js`, `src/hooks/useBuilderState.js` (line 345-347), `src/components/builder/MatrixCell.jsx`
- Impact: Risk of inconsistent validation behavior across UI; bugs in one validator don't affect others
- Fix approach: Create single validation service, ensure all checks use same rules

**Large Parsing Module with Backwards Compatibility Layer:**
- Issue: `parsers.js` re-exports from 5 split modules for backwards compatibility (lines 15-19), adds 335 lines instead of clean imports
- Files: `src/utils/parsers.js`
- Impact: Unclear module boundaries, harder to maintain, adds indirection to critical parsing logic
- Fix approach: Remove re-exports once all imports are updated; use direct imports from split modules

## Known Bugs

**CSV Parsing Silently Drops Quoted Fields:**
- Symptoms: Activities with commas in names fail to parse correctly (e.g., "Team Building Games (Music Hall, Central)")
- Files: `src/utils/parsers.js` (lines 315-335, parseCSVRow function)
- Trigger: CSV with quoted fields containing commas in activity names
- Workaround: Ensure CSV files don't use quoted fields with commas; use custom delimiter or preprocessing

**Undo Stack Limited to 30 Items:**
- Symptoms: Users can only undo last 30 builder edits; older edits are lost
- Files: `src/hooks/useBuilderState.js` (line 265)
- Trigger: More than 30 edits in builder view
- Workaround: Manual restart or reload page to clear undo stack

**Generator Falls Back Silently on Row Failure:**
- Symptoms: All-greedy-attempts-failed warning logged (line 322) but no UI feedback; user sees result without knowing constraints relaxed
- Files: `src/components/Generator.jsx` (line 322)
- Trigger: Impossible constraints for 50+ greedy retries
- Workaround: None; user must manually verify generated schedule

**localStorage Errors Not User-Visible:**
- Symptoms: Storage quota exceeded silently logged to console (storage.js lines 13, 25, 33); app may lose data
- Files: `src/utils/storage.js`
- Trigger: Large CSV files + many saved rotations on quota-limited browsers
- Workaround: Clear other sites' data or reload dashboard

## Security Considerations

**localStorage Data Unencrypted:**
- Risk: CSV files, registry data, and builder state stored as plaintext in localStorage
- Files: `src/utils/storage.js`, `src/App.jsx`
- Current mitigation: Browser sandbox isolation; user must trust local machine
- Recommendations: Add warning in UI about sensitive data; consider IndexedDB with optional encryption flag; document data residency

**No Input Validation on GPS Coordinates:**
- Risk: Malformed GPS data (e.g., "45.251925" without longitude) silently accepted, causes NaN in distance calculations
- Files: `src/utils/distanceCalculator.js` (lines 29-36)
- Current mitigation: parseGPS returns null on invalid input, distance lookups fallback gracefully
- Recommendations: Add validation in parseMetadata; warn users about activities with incomplete GPS; show validation report on file upload

**Filename Disclosure in File Upload:**
- Risk: File upload shows full filename which may contain path information
- Files: `src/components/FileUploader.jsx` (line 84)
- Current mitigation: Minimal; client-side only
- Recommendations: Accept but don't display full filename, show only basename

## Performance Bottlenecks

**Validation Runs on Every Cell Change:**
- Problem: `validateMatrix()` recalculates all errors on every drag-and-drop, potentially O(n²) for each change
- Files: `src/hooks/useBuilderState.js` (lines 345-347)
- Cause: Memoized but still called on every activity placement; full matrix traversal in worst case
- Improvement path: (1) Only validate affected cells, (2) Batch updates during paste operations, (3) Debounce during rapid edits

**Distance Matrix Recomputed on Every Navigation:**
- Problem: `buildDistanceMatrix()` recalculates all haversine distances on file load, O(n²) for n activities
- Files: `src/utils/distanceCalculator.js` (lines 46-66)
- Cause: Called once on load but naive algorithm; could use spatial indexing
- Improvement path: Cache after first calculation; for large schedules (100+ activities), consider R-tree or grid-based lookup

**Stats Computation Runs per Group per Day:**
- Problem: `computeDayStats()` called repeatedly for same data in stats panels and comparisons
- Files: `src/utils/scheduleStats.js`, called from multiple views
- Cause: No memoization across components; each view recalculates independently
- Improvement path: Memoize stats by group key; cache at context level; pre-compute all day stats once

**Generator Algorithm Has O(n³) Complexity:**
- Problem: Greedy generation with 50 retries, per-slot scoring, post-processing swaps (line 398: `maxIter = n * n * 2`)
- Files: `src/components/Generator.jsx` (lines 200-323)
- Cause: No algorithmic optimization; brute-force constraint satisfaction
- Improvement path: (1) Use constraint propagation/backtracking, (2) Parallel candidate evaluation, (3) Early termination with partial solutions

## Fragile Areas

**Builder State Coupling:**
- Files: `src/hooks/useBuilderState.js` (428 lines), `src/hooks/useEditorState.js` (292 lines)
- Why fragile: These custom hooks hold business logic that's hard to test; adding new features requires touching multiple state setters
- Safe modification: (1) Add feature flags before changing state structure, (2) Test hook logic in isolation with custom harness, (3) Document state shape
- Test coverage: No unit tests for hook logic; only integration tests via UI

**Dynamic Activity Filtering Logic:**
- Files: `src/hooks/useBuilderState.js` (lines 62-83, filteredActivities)
- Why fragile: Complex nested conditions in useMemo; small typo breaks palette filtering
- Safe modification: Extract filter conditions into named functions; add unit tests for each filter type
- Test coverage: Filters only tested manually through UI

**Validation Rule Changes:**
- Files: `src/components/builder/validation.js` (lines 8-18)
- Why fragile: Rules are tightly coupled to UI display logic (MatrixCell.jsx); changing a rule requires UI changes in multiple places
- Safe modification: Create validation rule definitions as data; use rule engine instead of hardcoded checks
- Test coverage: No validation tests; bugs only caught when user places invalid activity

**Zone Mapping Hard-Coded:**
- Files: `src/components/Generator.jsx` (lines 44-67, ZONE_MAP)
- Why fragile: New activities added to metadata won't be in ZONE_MAP; will fall to "Unknown" zone
- Safe modification: Load ZONE_MAP from metadata file or config; add validation that all activities have zones
- Test coverage: No coverage; breakage detected only when generating schedules

## Scaling Limits

**Matrix Operations Scale Poorly:**
- Current capacity: ~12 groups × 35 time slots (typical), ~200-300 activities
- Limit: Matrix operations become slow when groups > 20 or slots > 50 (validation, generation both O(n²) or O(n³))
- Scaling path: (1) Implement worker threads for validation/generation, (2) Use sparse matrix representation, (3) Implement incremental validation

**localStorage Quota:**
- Current capacity: 5-10MB limit in most browsers; Dashboard uses ~100KB per CSV (with metadata embedded)
- Limit: Can store ~30 CSV files before quota exceeded; affects multi-season schedules
- Scaling path: (1) Switch to IndexedDB (250MB+), (2) Compress CSVs, (3) Archive old seasons server-side

**Undo Stack Memory:**
- Current capacity: Last 30 edits (line 265, `.slice(-30)`)
- Limit: Each undo snapshot clones full matrix (~1MB for large schedules); 30 snapshots = 30MB
- Scaling path: (1) Increase limit with compression, (2) Delta-based snapshots, (3) Server-side undo

**Generator Timeout Risk:**
- Current capacity: Works for typical 12×35 (12 groups, 35 slots); larger schedules hang
- Limit: O(n³) algorithm; 20 groups × 50 slots causes main thread blocking (seconds to minutes)
- Scaling path: (1) Move to Web Worker, (2) Implement timeout with partial results, (3) Use faster heuristics

## Dependencies at Risk

**papaparse ^5.4.1:**
- Risk: Used for critical CSV parsing; no recent activity, last update 2021
- Impact: Bugs or format changes in user CSVs won't be caught
- Migration plan: (1) Audit for unmaintained parser, (2) Consider csv-parse or PapaParse fork, (3) Add CSV validation schema before parsing

**tailwindcss ^4.2.1:**
- Risk: Major version (4.x); breaking changes possible in minor updates
- Impact: Styling breaks on update
- Migration plan: Constraint to ^4 only; test all styling before updating

**React 18.2.0:**
- Risk: Concurrent features not used; potential inefficiencies from unused re-render bailouts
- Impact: Slower performance as data grows
- Migration plan: Evaluate useMemo/useCallback necessity; consider moving to Suspense for data loading

## Missing Critical Features

**No Conflict Resolution:**
- Problem: When editing overlaps between rotations not detected; could schedule same activity twice across rotations
- Blocks: Accurate cross-rotation capacity tracking
- Impact: Violates operational constraints

**No Activity Clustering:**
- Problem: Can't group related activities (e.g., "High Ropes" variants must be in same slot)
- Blocks: Advanced scheduling constraints
- Impact: Requires manual post-processing

**No Export to Operational System:**
- Problem: Finalized schedules must be manually copied to Google Sheets or other tool
- Blocks: One-click deployment
- Impact: Manual error introduction in final data entry

**No Real-Time Collaboration:**
- Problem: Single browser per user; changes not synced to team
- Blocks: Multi-person schedule building
- Impact: Requires taking turns or manual merge

## Test Coverage Gaps

**Hook Logic Untested:**
- What's not tested: `useBuilderState.js` and `useEditorState.js` business logic (720 lines total)
- Files: `src/hooks/useBuilderState.js`, `src/hooks/useEditorState.js`
- Risk: State mutations, undo/redo, clipboard operations may have silent bugs
- Priority: High — hooks are core to application functionality

**Validation Rules Untested:**
- What's not tested: Each validation rule (max-groups, day-duplicate, similarity, cross-rotation)
- Files: `src/components/builder/validation.js`
- Risk: Rules may be inconsistently applied; new rules easily broken
- Priority: High — validation is user-facing guardrail

**CSV Parsing Edge Cases Untested:**
- What's not tested: Quoted fields with commas, merged cells, inconsistent headers, malformed GPS
- Files: `src/utils/parsers.js`, `src/utils/distanceCalculator.js`
- Risk: User files cause silent data loss or incorrect parsing
- Priority: High — affects data integrity

**Generator Algorithm Untested:**
- What's not tested: All 50 greedy retries, fallback to relaxed mode, post-processing swaps
- Files: `src/components/Generator.jsx`
- Risk: Generated schedules may violate constraints without user awareness
- Priority: Medium — users can manually verify but algorithmic bugs are hard to detect

**Storage Quota Edge Cases Untested:**
- What's not tested: localStorage quota exceeded, JSON parse failures, corrupted stored data
- Files: `src/utils/storage.js`
- Risk: Data loss without user visibility
- Priority: Medium — affects data persistence

**Cross-Browser Compatibility Untested:**
- What's not tested: localStorage availability, File API support, CSS rendering across browsers
- Files: All
- Risk: Silent failures on unsupported browsers (e.g., private mode)
- Priority: Low — target is modern browsers

---

*Concerns audit: 2026-03-06*
