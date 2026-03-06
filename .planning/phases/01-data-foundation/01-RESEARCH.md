# Phase 1: Data Foundation - Research

**Researched:** 2026-03-06
**Domain:** React Context data flow, CSV metadata parsing, removing hard-coded maps in an existing JS SPA
**Confidence:** HIGH

---

## Summary

Phase 1 has a single, well-scoped responsibility: replace the hard-coded `ZONE_MAP` constant in `Generator.jsx` (lines 44-67) with a metadata-driven zone lookup. The zone concept already exists in the data pipeline — the metadata CSV parser already extracts a `location` field from a "general location" or "activity location" column (regex `/general\s*location|activity.*location/i`), stores it on every activity's metadata object, and surfaces it as "Location Zone" in the ActivityDetailPanel. The hard-coded map duplicates this column for a subset of activities and uses different zone naming conventions.

The fix is a targeted three-file operation: (1) ensure the parsers correctly extract a zone-appropriate column from the CSV (the existing `location` field may serve directly, or a dedicated `zone` column regex may need to be added), (2) pass zone values through `processFiles` into the registry entries and then into `DashboardContext`, and (3) replace the `getZone(activityName)` call in `Generator.jsx` with a registry lookup against the context-provided data. No new libraries, no new architecture — just closing the gap between data that already flows through the system and a function that ignores it.

The key decision to verify before implementation: whether `meta.location` (values like "Main Camp", "High Ropes", "Gwitmock") already semantically matches what ZONE_MAP encodes (values like "MainCamp", "HighRopes", "Gwitmock"), or whether the CSV has a separate "zone" column that should be parsed instead. The LOCATION_COLORS constant in `colors.js` uses "Main Camp", "High Ropes", "Gwitmock", "Gwitmock Path", "Fieldhouse" — implying the metadata `location` field already uses these labels. ZONE_MAP uses camelCase variants ("MainCamp", "HighRopes") which differ from the `location` field values used elsewhere in the app. The implementation must normalize or choose a consistent format.

**Primary recommendation:** Use `entry.metadata.location` (already flowing from CSV through registry into context) as the zone value in Generator.jsx. Remove ZONE_MAP entirely. Update `getZone()` to read from the activity object's `location` field rather than a static lookup.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CON-04 | Zone/location data driven from metadata CSV, not hard-coded | `meta.location` already parsed from CSV via `iLocation` in `parseMetadata()`. Registry stores this on `entry.metadata.location`. Generator currently ignores it and uses static `ZONE_MAP` instead. Path: wire `location` from registry into activity objects built in Generator's `useMemo`, remove `ZONE_MAP`, remove `getZone()`. |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.2.0 | Context-based data distribution via `useDashboard()` | Already in use; DashboardContext is the existing single source of truth |
| papaparse | 5.4.1 | CSV parsing; `parseMetadata()` extracts the location column | Already parses metadata including `location`; no changes needed to parsing library |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None new | — | — | This phase requires no new dependencies |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Using existing `meta.location` | Adding a new `zone` CSV column | Only if metadata CSV truly lacks zone data and a new dedicated column is agreed on. Check real CSV before deciding. |
| Inline lookup in Generator `useMemo` | New utility function in `src/utils/` | Inline is simpler for a single consumer; if Phase 3 needs zones too, extract to utility then. |

**Installation:**
No new packages required.

---

## Architecture Patterns

### Relevant Project Structure
```
src/
├── utils/
│   ├── parsers.js         # parseMetadata() — already extracts meta.location
│   └── processFiles.js    # orchestrates parse → registry → context data
├── context/
│   └── DashboardContext.jsx  # supplies registry to all consumers via useDashboard()
└── components/
    └── Generator.jsx      # contains ZONE_MAP (lines 44-67) and getZone() (line 69-71)
                           # consumes registry via useDashboard()
```

### Pattern 1: Registry-Based Metadata Lookup (existing pattern)
**What:** Activity metadata flows from CSV through `parseMetadata()` into registry entries (`entry.metadata`). All consumers call `lookupMeta(name, registry)` or access `registry.canonical[name].metadata` directly.
**When to use:** Any time Generator needs per-activity data that originates in the CSV.
**Example:**
```javascript
// Source: src/components/Generator.jsx lines 563-579 (existing useMemo pattern)
const activities = useMemo(() => {
  const acts = [];
  for (const [name, entry] of Object.entries(registry.canonical)) {
    if (entry.metadata) {
      acts.push({
        name,
        value: entry.metadata.value || 0,
        intensity: entry.metadata.intensity || "Unknown",
        location: entry.metadata.location || "",   // <-- already here!
        io: entry.metadata.io || "",
        maxGroups: entry.metadata.maxGroups || 99,
        similarityGroup: similarities?.activityToGroup[name] || null,
        zone: getZone(name),  // <-- THIS LINE is what we replace
      });
    }
  }
  return acts;
}, [registry, similarities]);
```

**After Phase 1, the change is surgical:**
```javascript
// Replace:
zone: getZone(name),
// With:
zone: entry.metadata.location || "Unknown",
```
And delete `ZONE_MAP` (lines 44-67) and `getZone()` (lines 69-71).

### Pattern 2: DashboardContext as Single Source of Truth (existing pattern)
**What:** `App.jsx` builds `dashCtx` from `dashData` and provides it through `DashboardProvider`. `Generator.jsx` consumes via `useDashboard()`. This already supplies `registry` which contains all metadata including `location`.
**When to use:** Any data that should survive tab switches and be consistent across all tabs.

The `registry` object is already in context. No context shape changes are needed — the zone data is already accessible via `registry.canonical[name].metadata.location`.

### Anti-Patterns to Avoid
- **Adding a separate `zones` field to DashboardContext:** Redundant — zone is already embedded in `registry.canonical[name].metadata.location`. Don't duplicate it.
- **Building a new utility function just for zone lookup:** Premature — only Generator uses zones in Phase 1. Keep it inline. If Phase 3 needs zone-based constraint checking, extract then.
- **Normalizing ZONE_MAP names to match metadata:** Don't map camelCase "MainCamp" to "Main Camp". Remove ZONE_MAP entirely and use the metadata string as-is. The metadata values ("Main Camp", "High Ropes", "Gwitmock") are already used consistently in `LOCATION_COLORS` and ActivityDetailPanel.
- **Changing parseMetadata to add a new `zone` field separate from `location`:** Unnecessary if `meta.location` already contains the zone concept. Verify with the actual CSV first. If the metadata CSV has both a "General Location" column and a separate "Zone" column, prefer Zone; otherwise use location.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Zone lookup | Another static map | `entry.metadata.location` | Zone data is already in the CSV, already parsed, already in registry |
| Zone normalization | Custom string normalization | Accept metadata values as-is | The existing metadata values ("Main Camp", "Gwitmock") already match LOCATION_COLORS keys and ActivityDetailPanel labels |
| Zone validation | New validation logic | Simple `|| "Unknown"` fallback | Consistent with how other optional metadata fields are handled throughout Generator |

**Key insight:** The entire ZONE_MAP is a redundant hard-coded reimplementation of data that's already in the CSV and already flowing through the system. The fix is deletion, not addition.

---

## Common Pitfalls

### Pitfall 1: Zone Name Format Mismatch
**What goes wrong:** ZONE_MAP uses camelCase ("MainCamp", "HighRopes") but `meta.location` uses spaced title case ("Main Camp", "High Ropes"). Downstream code that compares zone values (e.g., `activity.zone === "Gwitmock"` for CON-01 in Phase 3) must use the same format as what's stored.
**Why it happens:** ZONE_MAP was written independently from the CSV parsing layer with no cross-reference.
**How to avoid:** Before switching, grep for all zone value string comparisons in the codebase. Currently none exist for constraint enforcement (CON-01 is Phase 3 work), so Phase 1 can safely use metadata values as-is.
**Warning signs:** "Unknown" zones appearing for activities that clearly have locations in the CSV — means the column regex doesn't match the CSV header.

### Pitfall 2: Column Header Regex Miss
**What goes wrong:** If the metadata CSV uses a column header like "Zone" or "Activity Zone" instead of "General Location" or "Activity Location", the existing `iLocation` regex (`/general\s*location|activity.*location/i`) won't match, and `meta.location` will be empty string for all activities.
**Why it happens:** CSV column naming is not standardized; different CSV exports use different header names.
**How to avoid:** Check the actual metadata CSV header. If needed, expand the regex to also match `/zone/i` or `/^zone$/i`. This is a zero-risk change to parsers.js.
**Warning signs:** All activities showing `zone: ""` or `zone: "Unknown"` after the change.

### Pitfall 3: Activity Objects in useMemo Have Stale Zone
**What goes wrong:** The `activities` useMemo in Generator uses `zone: getZone(name)` today. After removal, if the developer accidentally leaves a `zone` property set to a hardcoded string or forgets to include it, the Generator UI cell tooltip (line 859: `Zone: ${activity.zone}`) and footer display (line 887: `{activity.zone}`) will show blank or undefined.
**Why it happens:** Multiple references to `activity.zone` in JSX — easy to miss one.
**How to avoid:** After replacing `zone: getZone(name)` with `zone: entry.metadata.location || "Unknown"`, verify the tooltip and footer still render zone values by uploading a CSV and confirming zone labels appear.
**Warning signs:** Zone footer in generator cells shows blank or "Unknown" for activities that clearly have location data.

### Pitfall 4: No CSV Zone Data = Breakage in Phase 3
**What goes wrong:** If a user uploads a metadata CSV that lacks any location/zone column, all activities will have `zone: ""` or `"Unknown"`. Phase 3's Gwitmock constraint (CON-01) will silently never trigger because no activity will have `zone === "Gwitmock"`.
**Why it happens:** CON-01 depends on zone data being present.
**How to avoid:** This is Phase 3's problem to handle, not Phase 1's. Phase 1 only needs to wire the data flow correctly. Document the dependency: CON-01 requires a zone/location column in the metadata CSV.
**Warning signs:** N/A for Phase 1 — acceptable behavior is "Gwitmock constraint not enforced when no zone data". Phase 3 should surface a warning.

---

## Code Examples

Verified patterns from the actual codebase:

### Current Hard-Coded State (what to DELETE)
```javascript
// Source: src/components/Generator.jsx lines 44-71

const ZONE_MAP = {
  "Team Building Games (Music Hall)": "MainCamp",
  "Photo Scavenger Hunt": "MainCamp",
  // ... 19 more entries ...
  "Archery (The Park)": "Gwitmock",
};

function getZone(activityName) {
  return ZONE_MAP[activityName] || "Unknown";
}
```

### After Phase 1 (what it becomes)
```javascript
// Source: Generator.jsx useMemo (lines 563-579 current)
// Change only the zone property assignment:

const activities = useMemo(() => {
  const acts = [];
  for (const [name, entry] of Object.entries(registry.canonical)) {
    if (entry.metadata) {
      acts.push({
        name,
        value: entry.metadata.value || 0,
        intensity: entry.metadata.intensity || "Unknown",
        location: entry.metadata.location || "",
        io: entry.metadata.io || "",
        maxGroups: entry.metadata.maxGroups || 99,
        similarityGroup: similarities?.activityToGroup[name] || null,
        zone: entry.metadata.location || "Unknown",  // was: getZone(name)
      });
    }
  }
  return acts;
}, [registry, similarities]);
```

### How location Already Flows (no changes needed)
```javascript
// Source: src/utils/parsers.js lines 37-65

const iLocation = col(/general\s*location|activity.*location/i);
// ...
activities[rawName] = {
  rawName,
  // ...
  location: iLocation >= 0 ? row[iLocation] : "",  // already parsed
  // ...
};
```

```javascript
// Source: src/App.jsx line 123-133
// registry is already in context — no changes needed

const dashCtx = useMemo(() => dashData ? ({
  registry: dashData.registry,  // registry.canonical[name].metadata.location exists
  distMatrix: dashData.distMatrix,
  // ...
}) : null, [dashData, startLocations, foodLocations]);
```

### Column Header Expansion (if needed)
```javascript
// Source: src/utils/parsers.js line 38
// If CSV uses "Zone" as a column header instead of "General Location":

// Current:
const iLocation = col(/general\s*location|activity.*location/i);

// Expanded to also match "Zone" column:
const iLocation = col(/general\s*location|activity.*location|^zone$/i);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ZONE_MAP hard-coded in Generator | `meta.location` from CSV registry | Phase 1 (this phase) | New activities automatically get zones when added to CSV |
| `getZone(activityName)` static lookup | `entry.metadata.location || "Unknown"` inline | Phase 1 (this phase) | Zone reflects uploaded data without redeploy |

**Deprecated/outdated:**
- `ZONE_MAP` constant (lines 44-67): Replaced by CSV metadata flow. Delete entirely.
- `getZone()` function (lines 69-71): Replaced by inline metadata access. Delete entirely.

---

## Open Questions

1. **Does `meta.location` match what ZONE_MAP encodes, or does the CSV have a separate "Zone" column?**
   - What we know: Parser captures `location` from "general location" / "activity location" headers. ZONE_MAP uses values like "MainCamp", "HighRopes". ActivityDetailPanel calls the same field "Location Zone". LOCATION_COLORS uses "Main Camp", "High Ropes" (spaced).
   - What's unclear: Whether the metadata CSV column contains zone-level groupings ("Main Camp", "Gwitmock") or more specific location descriptions. The column regex suggests it's called "General Location" in the real CSV.
   - Recommendation: Before implementation, inspect one row of the actual metadata CSV to confirm `location` values match zone categories. If they do, proceed. If the CSV has a separate "Zone" column, add that regex to parsers.js.

2. **Is `meta.location` the right field, or should a new `zone` field be parsed separately?**
   - What we know: The metadata object has `location` and `locationDesc` as separate fields. "Location Zone" in ActivityDetailPanel uses `meta.location`.
   - What's unclear: Whether "general location" in the CSV is truly zone-level (e.g., "Gwitmock") vs. a more detailed physical descriptor.
   - Recommendation: Use `location` (it's already labeled "Location Zone" in the UI), but verify with the actual CSV data.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected — no test config files, no test directories, no package.json test scripts |
| Config file | None — Wave 0 must create if testing desired |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CON-04 | After CSV upload with location column, Generator activity objects have zone from metadata not ZONE_MAP | unit | N/A — no test framework | ❌ Wave 0 if testing desired |
| CON-04 | Activity with changed zone in CSV shows new zone in generator without code change | manual smoke | N/A | N/A |
| CON-04 | Activity not in ZONE_MAP shows its CSV location value, not "Unknown" | manual smoke | N/A | N/A |

### Sampling Rate
- **Per task commit:** Manual: upload test CSV, open Generator tab, check zone values in cell tooltips
- **Per wave merge:** Manual: verify no "Unknown" zones for activities with location data in CSV
- **Phase gate:** All three success criteria from ROADMAP.md verified manually before marking Phase 1 complete

### Wave 0 Gaps
No test framework exists in the project. Given the narrowly scoped change (3 lines deleted, 1 line changed), formal unit tests are not strictly required for Phase 1. Manual verification of zone values in Generator cell tooltips (`title` attribute on line 859) is sufficient.

If a test framework is desired: `npm install --save-dev vitest @testing-library/react` and create `src/utils/__tests__/parsers.test.js` covering the `parseMetadata` location extraction.

*(Manual-only verification is appropriate for this phase due to its small surface area and absence of existing test infrastructure.)*

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `src/components/Generator.jsx` (full file) — confirmed ZONE_MAP location and all usage points
- Direct codebase inspection: `src/utils/parsers.js` — confirmed `location` field extraction from CSV
- Direct codebase inspection: `src/context/DashboardContext.jsx` — confirmed context shape and registry contents
- Direct codebase inspection: `src/App.jsx` — confirmed `registry` is in dashCtx value, no zone field added
- Direct codebase inspection: `src/utils/registry.js` — confirmed metadata stored on `entry.metadata`
- Direct codebase inspection: `src/utils/activityLookup.js` — confirmed lookup pattern
- Direct codebase inspection: `src/utils/processFiles.js` — confirmed full data flow from parse to registry
- Direct codebase inspection: `src/constants/colors.js` — confirmed LOCATION_COLORS uses "Main Camp"/"Gwitmock" format (matches `meta.location` expected values)
- Direct codebase inspection: `src/components/dashboard/ActivityDetailPanel.jsx` — confirmed `meta.location` is labeled "Location Zone" in the UI

### Secondary (MEDIUM confidence)
- `.planning/codebase/CONCERNS.md` "Zone Mapping Hard-Coded" section — documents the problem and recommended fix approach exactly matching this research's conclusion

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified by direct inspection; no new dependencies required
- Architecture: HIGH — the data path from CSV to context to Generator is fully traced through actual source files
- Pitfalls: HIGH — derived from direct inspection of column regex, zone value format differences, and all usages of `activity.zone` in JSX

**Research date:** 2026-03-06
**Valid until:** Stable until codebase changes (parsers.js, Generator.jsx, or DashboardContext.jsx modified)
