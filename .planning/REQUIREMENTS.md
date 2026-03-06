# Requirements: Activity Dashboard — Generator Rebuild

**Defined:** 2026-03-06
**Core Value:** Generate the most theoretically optimal activity schedule that maximizes activity value while respecting physical, operational, and experience constraints.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Generation Core

- [ ] **GEN-01**: Generator filters activity pool by user-selected season using metadata "Season" column (supports "Season", "Season/Season", "All" formats)
- [ ] **GEN-02**: Generator produces complete Latin square schedules for N=1 through N=max rotation counts in a single run
- [ ] **GEN-03**: For N>1 rotations, generator partitions activities across rotations optimizing for equal total value per rotation
- [ ] **GEN-04**: Each rotation is a valid Latin square — every activity appears exactly once per row and once per column
- [ ] **GEN-05**: Generator maximizes total activity value across the schedule using greedy slot-by-slot scoring

### Constraints

- [ ] **CON-01**: Max 1 Gwitmock-zone activity per group (per row) to minimize hill climbs
- [ ] **CON-02**: No back-to-back activities from the same similarity group within a day
- [ ] **CON-03**: Walk distance penalties — penalize long transitions, favor one strategic long walk that positions for shorter subsequent walks
- [x] **CON-04**: Zone/location data driven from metadata CSV, not hard-coded
- [ ] **CON-05**: Cross-rotation value balancing — roughly equal overall quality between concurrent rotations

### UI

- [ ] **UI-01**: Season selector dropdown to choose which season to generate for
- [ ] **UI-02**: Tabbed output indexed by rotation count ("1 Rotation", "2 Rotations", etc.)
- [ ] **UI-03**: Generate button with progress feedback during computation
- [ ] **UI-04**: Constraint violation reporting — surface which constraints were relaxed and where

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Generation

- **ADV-01**: Web Worker offloading for generation to prevent UI blocking
- **ADV-02**: Configurable constraint weights (let user tune walk penalties, similarity decay, etc.)
- **ADV-03**: Export generated schedule directly to Builder or Dashboard

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Server-side generation | Client-side only app, no backend |
| Cross-rotation activity sharing | Rotations never share activities by design |
| Automatic season detection | User explicitly selects season |
| Group size input | Generator produces schedules indexed by rotation count, not group count |
| Mobile-optimized generator UI | Desktop-first for schedule management |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| GEN-01 | Phase 2 | Pending |
| GEN-02 | Phase 2 | Pending |
| GEN-03 | Phase 2 | Pending |
| GEN-04 | Phase 2 | Pending |
| GEN-05 | Phase 2 | Pending |
| CON-01 | Phase 3 | Pending |
| CON-02 | Phase 3 | Pending |
| CON-03 | Phase 3 | Pending |
| CON-04 | Phase 1 | Complete |
| CON-05 | Phase 3 | Pending |
| UI-01 | Phase 4 | Pending |
| UI-02 | Phase 4 | Pending |
| UI-03 | Phase 4 | Pending |
| UI-04 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0

---
*Requirements defined: 2026-03-06*
*Last updated: 2026-03-06 after roadmap creation — all 14 requirements mapped*
