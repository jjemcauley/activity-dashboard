# Phase 2: Generation Engine - Research

**Researched:** 2026-03-06
**Domain:** Latin square generation algorithm, season filtering, activity pool partitioning, value optimization
**Confidence:** HIGH — all findings are based on direct source-code inspection and domain logic derivation. No external libraries are introduced in this phase.

---

## Summary

Phase 2 rebuilds the core generation algorithm inside the existing `Generator.jsx`. The current file already contains a working greedy Latin square generator with scoring, walk penalties, similarity decay, and post-processing anti-adjacency swaps. The problem is what it is **missing**: it has no season filter (generates from ALL activities regardless of season), no true activity partitioning across rotations (each rotation draws from the same full pool with only a different random seed), and no concept of "generate N=1 through N=max in a single run."

The implementation strategy is surgical: (1) add a season selector that filters the activity pool before generation, (2) replace the "same pool with different seeds" approach with a genuine value-balanced partition algorithm, and (3) wrap the single `generateRotation` call in a loop from N=1 through N=max, storing results keyed by rotation count.

The existing `generateRotation`, `scoreCandidate`, `postProcessAntiAdjacency`, `validateLatinSquare`, and `computeStats` functions are already correct and should not be replaced. Only the orchestration layer (how the pool is built, partitioned, and handed to the generation function) needs to change.

**Primary recommendation:** Add `partitionActivities(pool, N)` and `filterBySeason(activities, season)` pure functions, then call them from a new multi-rotation orchestrator loop inside `handleGenerate`. The existing per-rotation generation logic needs no algorithm changes.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GEN-01 | Generator filters activity pool by user-selected season using metadata "Season" column (supports "Season", "Season/Season", "All" formats) | Season field already parsed by `parseMetadata` and stored as `entry.metadata.season`; filtering is a simple string-match function |
| GEN-02 | Generator produces complete Latin square schedules for N=1 through N=max rotation counts in a single run | Requires a new outer loop from `r=1` to `r=maxRotations`, calling `generateRotation` per rotation with its partitioned pool; max = `Math.ceil(seasonPool.length / numSlots)` or similar |
| GEN-03 | For N>1 rotations, generator partitions activities across rotations optimizing for equal total value per rotation | Balanced partition: sort by value descending, assign activities in snake/round-robin order across N buckets |
| GEN-04 | Each rotation is a valid Latin square — every activity appears exactly once per row and once per column | Already guaranteed by existing `generateRotation` (usedInRow + usedInCol Sets); `validateLatinSquare` already verifies this |
| GEN-05 | Generator maximizes total activity value across the schedule using greedy slot-by-slot scoring | Already implemented in `scoreCandidate` + `generateRotation`; need to confirm partitioning doesn't break this by giving worst pool to rotation 1 |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.2.0 | Component state, useMemo, useCallback | Already in use; no new dependencies |
| Tailwind CSS | ^4.2.1 | Styling season selector and any new UI elements | Already in use |

### No New Dependencies
Phase 2 introduces no new npm packages. Everything is pure JavaScript running inside the existing React component. Season filtering and partition algorithms are simple array operations.

**Installation:** None required.

---

## Architecture Patterns

### Recommended File Structure
No new files are required. All changes live inside `src/components/Generator.jsx`. If the file grows beyond ~1100 lines, consider extracting the generation algorithm to `src/utils/generationEngine.js`, but this is optional and can be done in a follow-up.

```
src/components/Generator.jsx    (all changes land here)
  ├── CONFIG                     (existing — unchanged)
  ├── filterBySeason()           (NEW — pure function)
  ├── partitionActivities()      (NEW — pure function)
  ├── scoreCandidate()           (existing — unchanged)
  ├── generateRotation()         (existing — unchanged)
  ├── postProcessAntiAdjacency() (existing — unchanged)
  ├── validateLatinSquare()      (existing — unchanged)
  ├── computeStats()             (existing — unchanged)
  └── Generator component        (modified orchestration + season UI)
```

### Pattern 1: Season Filtering (GEN-01)

**What:** Filter the activity list to only those whose `season` metadata field matches the user-selected season.

**Season field format:** `"Fall"`, `"Spring"`, `"Spring/Fall"`, `"All"` (slash-delimited for multi-season).

**Algorithm:**
```javascript
/**
 * Filter activities to those available in the selected season.
 * Season field formats: "Fall", "Spring/Fall", "All", etc.
 * "All" matches every season.
 */
function filterBySeason(activities, season) {
  if (!season) return activities; // no filter selected → return all
  const normalSeason = season.trim().toLowerCase();
  return activities.filter(act => {
    const raw = (act.season || "").trim();
    if (!raw || raw.toLowerCase() === "all") return true;
    // Split on "/" to handle "Spring/Fall" multi-season values
    const parts = raw.split("/").map(p => p.trim().toLowerCase());
    return parts.includes(normalSeason);
  });
}
```

**Available seasons:** Must be derived dynamically from the activity pool, not hard-coded. Use a `useMemo` that scans all activities and collects unique season tokens.

```javascript
const availableSeasons = useMemo(() => {
  const set = new Set();
  for (const act of activities) {
    const raw = act.season || "";
    raw.split("/").forEach(s => {
      const t = s.trim();
      if (t && t.toLowerCase() !== "all") set.add(t);
    });
  }
  return [...set].sort();
}, [activities]);
```

**State:** Add `const [selectedSeason, setSelectedSeason] = useState("")` to the component. Empty string = no filter.

### Pattern 2: Activity Pool Partitioning for N Rotations (GEN-03)

**What:** When generating N>1 rotations, split the season-filtered activity pool into N non-overlapping subsets with balanced total value.

**Why snake order:** Sorting by value and distributing in a round-robin "snake" pattern (1-2-3-3-2-1-1-2-3...) gives near-equal value sums across buckets with a single pass. This is the standard technique for balanced draft partitioning.

```javascript
/**
 * Partition activities across N rotations to balance total value.
 *
 * Algorithm: sort descending by value, then distribute in snake order.
 * Snake order: for each "round", assign in forward then reverse direction.
 *
 * Example with 6 activities, N=2:
 *   Sorted values: [10, 9, 8, 7, 6, 5]
 *   Round 1 (forward):  R0 gets 10, R1 gets 9
 *   Round 2 (reverse):  R1 gets 8, R0 gets 7
 *   Round 3 (forward):  R0 gets 6, R1 gets 5
 *   Result: R0=[10,7,6]=23, R1=[9,8,5]=22  ← balanced
 *
 * Returns: array of N activity arrays, index 0 = highest-value partition.
 */
function partitionActivities(pool, numRotations) {
  if (numRotations <= 1) return [pool];

  const sorted = [...pool].sort((a, b) => (b.value || 0) - (a.value || 0));
  const buckets = Array.from({ length: numRotations }, () => []);

  let forward = true;
  let bucketIdx = 0;

  for (const act of sorted) {
    buckets[bucketIdx].push(act);
    if (forward) {
      bucketIdx++;
      if (bucketIdx >= numRotations) {
        bucketIdx = numRotations - 1;
        forward = false;
      }
    } else {
      bucketIdx--;
      if (bucketIdx < 0) {
        bucketIdx = 0;
        forward = true;
      }
    }
  }

  return buckets;
}
```

**Key property:** Each bucket is guaranteed to be non-overlapping (every activity appears in exactly one bucket). No activity crosses rotation boundaries.

### Pattern 3: Multi-Rotation Orchestration (GEN-02)

**What:** Generate one Latin square per rotation count from N=1 through N=maxRotations, storing them as an array indexed by rotation count.

**Result structure change:** The current state is `rotations: [{ matrix, stats, validation }]` — an array of rotation results for a fixed `numRotations`. Phase 2 changes this to store results keyed by rotation count N:

```javascript
// Phase 2 result structure
// results[0] = { N: 1, rotations: [{ matrix, stats, validation }] }
// results[1] = { N: 2, rotations: [{ matrix, stats, validation }, { matrix, stats, validation }] }
// results[2] = { N: 3, rotations: [...x3] }
// etc.
```

The active tab in the UI then maps to a selected N value, and within that tab, multiple rotation matrices are shown.

**Computing maxN:**
```javascript
// Max rotations = how many times numSlots activities fit in the pool
// (can't have a rotation with fewer activities than slots)
const maxN = Math.max(1, Math.floor(seasonPool.length / effectiveSlots));
```

**Orchestrator:**
```javascript
const handleGenerate = useCallback(() => {
  setGenerating(true);
  setResults([]);
  setActiveN(1);
  setActiveRotation(0);

  setTimeout(() => {
    const seasonPool = filterBySeason(activities, selectedSeason);
    const effectiveSlots = timeSlots.length;
    const maxN = Math.max(1, Math.floor(seasonPool.length / effectiveSlots));

    const allResults = [];

    for (let n = 1; n <= maxN; n++) {
      const partitions = partitionActivities(seasonPool, n);
      const rotationResults = [];

      for (let r = 0; r < n; r++) {
        const matrix = generateRotation(
          partitions[r],
          Math.min(numGroups, partitions[r].length, effectiveSlots),
          effectiveSlots,
          daySlices,
          distMatrix,
          registry.nameMap,
          similarities,
          r * 7919 // seed varies by rotation index
        );

        if (matrix) {
          const stats = computeStats(matrix, daySlices, distMatrix, registry.nameMap, similarities);
          const validation = validateLatinSquare(matrix);
          rotationResults.push({ matrix, stats, validation });
        }
      }

      allResults.push({ n, rotations: rotationResults });
    }

    setResults(allResults);
    setGenerating(false);
  }, 50);
}, [activities, selectedSeason, numGroups, timeSlots, daySlices, distMatrix, registry.nameMap, similarities]);
```

**State variables to add/change:**
```javascript
const [results, setResults] = useState([]);        // replaces "rotations" state
const [activeN, setActiveN] = useState(1);         // which N is being viewed (tab)
const [activeRotation, setActiveRotation] = useState(0); // which rotation within N
const [selectedSeason, setSelectedSeason] = useState(""); // season filter
```

### Anti-Patterns to Avoid

- **Sharing activities across rotations:** Each partition must be mutually exclusive. Never pass the same pool to two rotation calls. The current code does this (same `activities` array with different seed) — this is the main bug Phase 2 fixes.
- **Hard-coding season values:** Don't define `["Fall", "Spring", "Summer"]` in code. Derive available seasons from the actual metadata.
- **Greedy N computation that uses ceil instead of floor:** Using `Math.ceil` would create a rotation with fewer activities than slots, making valid Latin square generation impossible. Use `Math.floor`.
- **Replacing generateRotation:** The existing per-rotation generation algorithm is correct. Only the orchestration layer changes.
- **Sorting partitions so rotation 1 gets the worst activities:** Partition index 0 should contain the highest-value activities. Snake order naturally achieves this — the first activity (highest value) always goes to bucket 0.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Season string matching | Custom season database | Direct string operations on `act.season` | Season values already parsed and stored as raw strings in metadata |
| Activity value balancing | Optimization/LP solver | Snake-order round-robin distribution | Snake order gives provably near-equal sums in O(n) with no solver needed |
| Latin square validation | Re-implement from scratch | Existing `validateLatinSquare()` | Already correct, already used — just call it |
| Greedy generation per rotation | New algorithm | Existing `generateRotation()` | Already handles adjacency, scoring, retries, and relaxed fallback |
| Statistics | New computation | Existing `computeStats()` | Already computes avg value, distance, adjacencies per group |

---

## Common Pitfalls

### Pitfall 1: Season Filter Produces Empty Pool
**What goes wrong:** User selects "Fall", but all activities have season "Spring" — `filterBySeason` returns empty array. `handleGenerate` runs with 0 activities and crashes or produces empty results silently.
**Why it happens:** No guard before entering the generation loop.
**How to avoid:** Check `seasonPool.length === 0` before generation; show a user-visible message explaining no activities match the selected season.
**Warning signs:** `maxN` computes to 0 or NaN; `generateRotation` receives an empty array.

### Pitfall 2: numSlots > Partition Size
**What goes wrong:** For large N, each partition may have fewer activities than `effectiveSlots`. Passing this to `generateRotation` causes the matrix to be smaller than the time slot grid, rendering incorrectly or producing null cells.
**Why it happens:** `generateRotation` takes `n = Math.min(activities.length, numSlots, numGroups)` internally — so it silently truncates the matrix. The display code assumes `matrix[row].length === timeSlots.length`.
**How to avoid:** Only generate N if each partition has at least `effectiveSlots` activities. The `Math.floor` formula for `maxN` handles this correctly. Document the invariant.
**Warning signs:** Matrix rows shorter than `timeSlots.length`, missing cells in the rendered grid.

### Pitfall 3: N=max Rotation Count Inconsistency
**What goes wrong:** User sees tab "4 Rotations" but clicking Generate with fewer activities produces only 3. The tab count changes between runs.
**Why it happens:** `maxN` is computed at generation time from the filtered pool. If a different season is selected, the pool size changes and `maxN` differs.
**How to avoid:** Always recompute `maxN` inside `handleGenerate` based on the current filtered pool. Don't pre-compute it during render or cache it across runs.
**Warning signs:** Tab labels not matching actual results array length.

### Pitfall 4: Seed Collision Across Partitions
**What goes wrong:** Each rotation already uses a different seed (`r * 7919`). But with true partitioning, two rotations from different N values might accidentally explore similar solutions.
**Why it happens:** Seeds are global; not scoped by N.
**How to avoid:** Seed as `(n * 100003) + (r * 7919)` — encodes both the rotation count and rotation index, guaranteeing distinct seeds across all N and r combinations.
**Warning signs:** Identical or near-identical matrices appearing in different rotations.

### Pitfall 5: Replacing State Shape Breaks Existing Render Code
**What goes wrong:** The current component reads `rotations[activeRotation]` to get `current.matrix`, `current.stats`, `current.validation`. Changing the state shape breaks the render tree.
**Why it happens:** The render code is tightly coupled to the `rotations` array shape.
**How to avoid:** When refactoring state, update ALL render paths in the same edit. A clean migration: rename state to `results`, keep a `activeResult` derived value that mirrors the old `current` shape.
**Warning signs:** `TypeError: Cannot read properties of undefined` on `current.matrix`.

---

## Code Examples

### Season Filtering (complete, verified against parsers.js output)
```javascript
// Source: Derived from parsers.js parseMetadata() — season stored as raw string
function filterBySeason(activities, season) {
  if (!season) return activities;
  const norm = season.trim().toLowerCase();
  return activities.filter(act => {
    const raw = (act.season || "").trim();
    if (!raw || raw.toLowerCase() === "all") return true;
    return raw.split("/").map(p => p.trim().toLowerCase()).includes(norm);
  });
}
```

### Activity Object Shape (from existing useMemo in Generator.jsx lines 528-545)
```javascript
// Activity objects already have a `season` field sourced from entry.metadata.season
{
  name: string,              // canonical activity name
  value: number,             // entry.metadata.value
  intensity: string,         // entry.metadata.intensity
  location: string,          // entry.metadata.location
  io: string,                // entry.metadata.io
  maxGroups: number,         // entry.metadata.maxGroups
  similarityGroup: string|null, // similarities.activityToGroup[name]
  zone: string,              // entry.metadata.location (Phase 1 result)
  season: string,            // entry.metadata.season  ← ADD THIS in useMemo
}
```

The current useMemo DOES NOT include `season` — it must be added:
```javascript
season: entry.metadata.season || "",   // ADD to activities useMemo
```

### Partition Verification Invariant
```javascript
// After partitioning, these must all be true:
// 1. Every activity in pool appears in exactly one bucket
// 2. Total activities = sum of bucket lengths
// 3. No activity name appears in more than one bucket

function verifyPartitions(buckets, pool) {
  const seen = new Set();
  for (const bucket of buckets) {
    for (const act of bucket) {
      if (seen.has(act.name)) throw new Error(`Duplicate: ${act.name}`);
      seen.add(act.name);
    }
  }
  return seen.size === pool.length;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single rotation with different seed per "rotation" | True N-partition with snake-order value balancing | Phase 2 (this phase) | Rotations now have non-overlapping pools; concurrent rotations deliver comparable quality |
| No season filtering — all activities always included | Season-filtered pool before partitioning | Phase 2 (this phase) | Schedules only include activities available in the selected season |
| User inputs fixed N, gets exactly N rotations | Generates N=1 through N=max in one run | Phase 2 (this phase) | User picks the tab matching their group count; no re-run needed |
| Hard-coded ZONE_MAP | entry.metadata.location (Phase 1 complete) | Phase 1 — done | Zone data driven from uploaded CSV |

---

## Open Questions

1. **Season selector default state**
   - What we know: empty string = no filter = all activities
   - What's unclear: should the UI pre-select a season if only one is available? Or always default to "All"?
   - Recommendation: Default to empty string ("All activities") with a visible "-- All Seasons --" option. Avoids surprising users who haven't selected a season yet.

2. **maxN upper bound**
   - What we know: `Math.floor(pool.length / effectiveSlots)` prevents partitions smaller than the slot count
   - What's unclear: Should there be an absolute cap (e.g., max 5 rotations regardless of pool size)?
   - Recommendation: No hard cap for Phase 2 — let math determine it. Phase 4's UI can display however many tabs result.

3. **numGroups relationship to partition size**
   - What we know: `generateRotation` uses `n = Math.min(activities.length, numSlots, numGroups)` — so it truncates to the smallest of these three
   - What's unclear: For a partition of size 15 with numSlots=12 and numGroups=12, n=12. The 3 leftover activities in the partition are never placed. Is this intentional?
   - Recommendation: This is correct by domain logic — a 12-group rotation uses exactly 12 activities (one per time slot = one per column). Leftover activities in a partition above numSlots are expected and fine. Document this clearly.

4. **UI state for N=1 through N=max results**
   - What we know: Current UI has tabs for rotation A, B, C within a fixed N
   - What's unclear: Phase 2 needs both a "which N" outer tab and a "which rotation within N" inner tab
   - Recommendation: Outer tabs = "1 Rotation", "2 Rotations", etc. (one per N value). Inner tabs = "Rotation A", "Rotation B" within the selected N. This matches ROADMAP.md Phase 4 UI design.
   - Note: Full UI wiring is Phase 4's scope. Phase 2 just needs enough UI to verify the algorithm is correct — minimal outer/inner tab structure is sufficient.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected (no test config files found in project) |
| Config file | None — Wave 0 must create if needed |
| Quick run command | N/A — no test infrastructure |
| Full suite command | N/A — no test infrastructure |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GEN-01 | `filterBySeason(activities, "Fall")` returns only activities with Fall or All | unit | N/A — no test runner | ❌ Wave 0 |
| GEN-02 | `handleGenerate` with 36 activities, 12 slots produces results for N=1, N=2, N=3 | integration | N/A — no test runner | ❌ Wave 0 |
| GEN-03 | `partitionActivities(pool, 2)` returns 2 non-overlapping arrays with near-equal value sums | unit | N/A — no test runner | ❌ Wave 0 |
| GEN-04 | `validateLatinSquare(matrix)` returns `{ valid: true }` for every generated rotation | integration | N/A — no test runner | ❌ Wave 0 |
| GEN-05 | First rotation's partition has higher average value than last rotation's partition | unit | N/A — no test runner | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** Manual inspection via browser dev console
- **Per wave merge:** Manual generation run with browser open, check Latin square valid badge
- **Phase gate:** All 5 requirements verified visually before `/gsd:verify-work`

### Wave 0 Gaps
This project has no test infrastructure. Given the algorithmic nature of Phase 2, the planner should consider whether to:
- Add pure-function unit tests for `filterBySeason` and `partitionActivities` (these are easy to test without a DOM)
- Or verify entirely through manual browser testing

If test infrastructure is desired: `npm install --save-dev vitest` + `vitest.config.js` + `src/__tests__/generationEngine.test.js` covering GEN-01, GEN-03, GEN-04, GEN-05 as pure function tests.

Current recommendation for this phase: manual verification is sufficient given the functions are small and verifiable through the UI's "Latin Square: Valid" badge and per-rotation stats display.

---

## Sources

### Primary (HIGH confidence)
- `src/components/Generator.jsx` — Direct source code inspection; all algorithm details confirmed
- `src/utils/parsers.js` — Confirmed season field parsed and stored; column regex confirmed
- `src/context/DashboardContext.jsx` — Confirmed context shape (`registry`, `distMatrix`, `timeSlots`, `daySlices`, `similarities`)
- `.planning/REQUIREMENTS.md` — Requirements GEN-01 through GEN-05 confirmed
- `.planning/codebase/CONCERNS.md` — Confirmed: "Generator Has O(n³) Complexity", "Generator Falls Back Silently", activity pool sharing concern documented

### Secondary (MEDIUM confidence)
- `.planning/PROJECT.md` — Domain logic for Latin squares, partitioning model, season format examples
- `.planning/ROADMAP.md` — Phase 2 success criteria and relationship to Phase 4 UI

### Tertiary (LOW confidence)
- None — all findings are based on direct codebase inspection.

---

## Metadata

**Confidence breakdown:**
- Season filtering: HIGH — Season field confirmed in parsers.js output; string format documented in PROJECT.md
- Activity partitioning: HIGH — Snake-order algorithm is well-known; invariants verified by reasoning from source code
- Multi-rotation orchestration: HIGH — Existing generateRotation signature confirmed; only the call site changes
- Latin square validity: HIGH — validateLatinSquare already in codebase and already correct
- UI state shape: MEDIUM — Current state structure confirmed; new shape is a logical extension, but render code audit needed during planning

**Research date:** 2026-03-06
**Valid until:** This is an internal codebase analysis — valid indefinitely until Generator.jsx changes.
