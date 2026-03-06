# Roadmap: Activity Dashboard — Generator Rebuild

## Overview

The generator rebuild replaces a hard-coded, single-rotation greedy algorithm with a data-driven, multi-rotation engine that respects physical and operational constraints. Work flows in four phases: first establish the data foundation (zone lookup from CSV), then build the core generation engine (valid Latin squares for all N), then layer in constraint scoring (Gwitmock, similarity, walk distance, cross-rotation balance), and finally wire up the UI controls and violation reporting so staff can drive the generator and interpret results.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Data Foundation** - Replace hard-coded zone map with data-driven zone lookup from uploaded metadata CSV
- [ ] **Phase 2: Generation Engine** - Produce valid multi-rotation Latin square schedules with season filtering and value optimization
- [ ] **Phase 3: Constraint Scoring** - Layer Gwitmock, similarity spacing, walk distance, and cross-rotation balance onto generation
- [ ] **Phase 4: UI and Reporting** - Wire season selector, tabbed output, generate button with progress, and constraint violation display

## Phase Details

### Phase 1: Data Foundation
**Goal**: Zone and location data flows from uploaded metadata CSV into the generator — no hard-coded maps remain
**Depends on**: Nothing (first phase)
**Requirements**: CON-04
**Success Criteria** (what must be TRUE):
  1. Uploading a metadata CSV that includes a location/zone column causes the generator to reflect those zones — no code change required
  2. Activities with changed or new zone assignments in the CSV are correctly reflected without a redeploy
  3. The existing DashboardContext registry is the single source of truth for zone data at generation time
**Plans**: TBD

### Phase 2: Generation Engine
**Goal**: Generator produces valid Latin square schedules for N=1 through N=max, filtered by season, with activity partitioning and value optimization
**Depends on**: Phase 1
**Requirements**: GEN-01, GEN-02, GEN-03, GEN-04, GEN-05
**Success Criteria** (what must be TRUE):
  1. Selecting a season and clicking Generate produces one valid Latin square per rotation count from N=1 through N=max — activities appear exactly once per row and once per column
  2. For N>1, each rotation receives a distinct, non-overlapping activity pool partitioned to equalize total value across rotations
  3. Only activities whose season metadata matches the selected season appear in generated schedules
  4. The greedy slot-by-slot algorithm fills each slot with the highest-value remaining valid activity
**Plans**: TBD

### Phase 3: Constraint Scoring
**Goal**: Generated schedules respect Gwitmock, similarity, walk distance, and cross-rotation quality constraints
**Depends on**: Phase 2
**Requirements**: CON-01, CON-02, CON-03, CON-05
**Success Criteria** (what must be TRUE):
  1. No group row in any generated schedule contains more than one Gwitmock-zone activity
  2. No group sees back-to-back activities from the same similarity group within a day
  3. Walk distance penalties are applied slot-by-slot — the greedy scorer favors transitions that position groups for shorter subsequent walks
  4. Concurrent rotations deliver roughly equal total quality — the activity partitioning and scoring account for cross-rotation value balance
**Plans**: TBD

### Phase 4: UI and Reporting
**Goal**: Staff can drive the generator through a clear UI and understand when and why constraints were relaxed
**Depends on**: Phase 3
**Requirements**: UI-01, UI-02, UI-03, UI-04
**Success Criteria** (what must be TRUE):
  1. A season selector dropdown is visible on the Generator tab and drives which activities are included in generation
  2. Generated results appear in tabs labeled "1 Rotation", "2 Rotations", etc. — each tab shows that rotation count's Latin square matrix
  3. The Generate button shows visible progress feedback while computation runs and a clear completion state when done
  4. When any constraint is relaxed (e.g., Gwitmock limit exceeded due to pool size), the UI surfaces which constraint was relaxed and which groups or slots are affected
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Foundation | 0/TBD | Not started | - |
| 2. Generation Engine | 0/TBD | Not started | - |
| 3. Constraint Scoring | 0/TBD | Not started | - |
| 4. UI and Reporting | 0/TBD | Not started | - |
