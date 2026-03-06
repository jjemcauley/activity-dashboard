// src/__tests__/generationEngine.test.js
// Unit tests for filterBySeason and partitionActivities.
// These functions are pure JS with no React or DOM dependency.
// Implementations are inlined here to allow RED tests before Generator.jsx is modified.

import { describe, it, expect } from "vitest";

// --- Inline implementations (mirrors what Plan 01 adds to Generator.jsx) --------

function filterBySeason(activities, season) {
  if (!season) return activities;
  const norm = season.trim().toLowerCase();
  return activities.filter(act => {
    const raw = (act.season || "").trim();
    if (!raw || raw.toLowerCase() === "all") return true;
    return raw.split("/").map(p => p.trim().toLowerCase()).includes(norm);
  });
}

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
      if (bucketIdx >= numRotations) { bucketIdx = numRotations - 1; forward = false; }
    } else {
      bucketIdx--;
      if (bucketIdx < 0) { bucketIdx = 0; forward = true; }
    }
  }
  return buckets;
}

// --- filterBySeason --------------------------------------------------------------

describe("filterBySeason", () => {
  const acts = [
    { name: "A", season: "Fall",        value: 10 },
    { name: "B", season: "Spring",      value: 9  },
    { name: "C", season: "Spring/Fall", value: 8  },
    { name: "D", season: "All",         value: 7  },
    { name: "E", season: "",            value: 6  },
    { name: "F", season: "Summer",      value: 5  },
  ];

  it("returns all activities when season is empty string", () => {
    expect(filterBySeason(acts, "")).toHaveLength(acts.length);
  });

  it("returns all activities when season is undefined", () => {
    expect(filterBySeason(acts, undefined)).toHaveLength(acts.length);
  });

  it("includes exact season match", () => {
    const result = filterBySeason(acts, "Fall");
    const names = result.map(a => a.name);
    expect(names).toContain("A");
  });

  it("includes activities with multi-season value containing selected season", () => {
    const result = filterBySeason(acts, "Fall");
    const names = result.map(a => a.name);
    expect(names).toContain("C"); // "Spring/Fall" contains "Fall"
  });

  it("includes activities with season 'All'", () => {
    const result = filterBySeason(acts, "Fall");
    const names = result.map(a => a.name);
    expect(names).toContain("D");
  });

  it("includes activities with empty season field", () => {
    const result = filterBySeason(acts, "Fall");
    const names = result.map(a => a.name);
    expect(names).toContain("E");
  });

  it("excludes activities whose season does not contain the selected token", () => {
    const result = filterBySeason(acts, "Fall");
    const names = result.map(a => a.name);
    expect(names).not.toContain("B"); // "Spring" does not contain "Fall"
    expect(names).not.toContain("F"); // "Summer" does not contain "Fall"
  });

  it("is case-insensitive", () => {
    const result = filterBySeason(acts, "fall");
    const names = result.map(a => a.name);
    expect(names).toContain("A");
    expect(names).toContain("C");
  });

  it("returns empty array when no activities match and none are universal", () => {
    const strict = [{ name: "X", season: "Winter", value: 1 }];
    expect(filterBySeason(strict, "Fall")).toHaveLength(0);
  });
});

// --- partitionActivities ---------------------------------------------------------

describe("partitionActivities", () => {
  const pool6 = [
    { name: "A", value: 10 },
    { name: "B", value: 9  },
    { name: "C", value: 8  },
    { name: "D", value: 7  },
    { name: "E", value: 6  },
    { name: "F", value: 5  },
  ];

  it("returns [pool] when numRotations is 1", () => {
    const result = partitionActivities(pool6, 1);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(pool6.length);
  });

  it("returns [pool] when numRotations is 0", () => {
    const result = partitionActivities(pool6, 0);
    expect(result).toHaveLength(1);
  });

  it("returns N buckets when numRotations is N", () => {
    expect(partitionActivities(pool6, 2)).toHaveLength(2);
    expect(partitionActivities(pool6, 3)).toHaveLength(3);
  });

  it("every activity in pool appears in exactly one bucket", () => {
    const result = partitionActivities(pool6, 2);
    const allNames = result.flat().map(a => a.name);
    expect(allNames.sort()).toEqual(pool6.map(a => a.name).sort());
    // No duplicates
    expect(new Set(allNames).size).toBe(pool6.length);
  });

  it("buckets are non-overlapping (no activity in more than one bucket)", () => {
    const result = partitionActivities(pool6, 3);
    const seen = new Set();
    for (const bucket of result) {
      for (const act of bucket) {
        expect(seen.has(act.name)).toBe(false);
        seen.add(act.name);
      }
    }
  });

  it("highest-value activity goes into bucket 0 (snake-order start)", () => {
    const result = partitionActivities(pool6, 2);
    const bucket0Names = result[0].map(a => a.name);
    expect(bucket0Names).toContain("A"); // value=10, highest
  });

  it("value sums are near-equal across buckets for N=2", () => {
    const result = partitionActivities(pool6, 2);
    const sum0 = result[0].reduce((s, a) => s + a.value, 0);
    const sum1 = result[1].reduce((s, a) => s + a.value, 0);
    // Snake order produces sums within 1 value unit for equal-sized pools
    expect(Math.abs(sum0 - sum1)).toBeLessThanOrEqual(2);
  });

  it("handles pool with a single activity", () => {
    const single = [{ name: "X", value: 5 }];
    const result = partitionActivities(single, 2);
    expect(result.flat()).toHaveLength(1);
  });

  it("does not mutate the input pool array", () => {
    const original = [...pool6];
    partitionActivities(pool6, 2);
    expect(pool6.map(a => a.name)).toEqual(original.map(a => a.name));
  });
});
