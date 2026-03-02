import React, { useState, useMemo, useCallback } from "react";
import { getDistance, shortName } from "../utils/parsers.js";
import {
  getCellColors,
  SIM_GROUP_COLORS,
  getSimColor,
  DAY_COLORS,
} from "../constants/colors.js";

// ═════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═════════════════════════════════════════════════════════════════════

const CONFIG = {
  // Position multipliers (applied to activity value)
  // Only LAST slot of day/schedule gets boosted — first slot is most likely missed
  LAST_OF_DAY_MULT: 1.10,
  LAST_OF_SCHEDULE_MULT: 1.10, // stacks with day: last slot of last day = 1.21x

  // Similarity diminishing returns: [1st unique, 2nd from group, 3rd+]
  SIMILARITY_VALUE_DECAY: [1.0, 0.5, 0.25],

  // Walk distance thresholds (meters)
  WALK_SHORT: 300,   // no penalty
  WALK_MEDIUM: 500,  // small penalty
  // anything above WALK_MEDIUM is "long"

  // Walk penalty weights (subtracted from score)
  WALK_MEDIUM_PENALTY: 15,
  WALK_LONG_PENALTY: 40,
  WALK_LONG_CONSECUTIVE_PENALTY: 80, // 2+ long walks in a row on the same day

  // Number of retry attempts if greedy fails for a row
  GREEDY_RETRIES: 50,
};

// ═════════════════════════════════════════════════════════════════════
// ZONE MAPPING — groups activities by physical area
// Walk distances between zones are more reliable than individual
// activity distances since the hill distorts straight-line meters.
// ═════════════════════════════════════════════════════════════════════

const ZONE_MAP = {
  "Team Building Games (Music Hall)": "MainCamp",
  "Photo Scavenger Hunt": "MainCamp",
  "Arts n' Crafts": "MainCamp",
  "Giant Swing": "MainCamp",
  "Scooters & Longboards": "MainCamp",
  "Archery Tag (Tennis Courts)": "MainCamp",
  "Tennis": "MainCamp",
  "Pickleball": "MainCamp",
  "Broomball": "MainCamp",
  "Indoor Climbing Wall (Field House)": "Fieldhouse",
  "Hike the Trail (Front Gate Gazebo)": "FrontGate",
  "Zipline": "HighRopes",
  "High Ropes (Aerial Trust Dive)": "HighRopes",
  "High Ropes (Drop Zone)": "HighRopes",
  "High Ropes (Crate Stacking)": "HighRopes",
  "High Ropes (Vertical Play Ground)": "HighRopes",
  "High Ropes (Blocks)": "HighRopes",
  "Low Ropes": "Gwitmock",
  "Driving Range (Hill Top)": "HillTop",
  "Disc Golf": "Gwitmock",
  "Pump Track (The Park)": "Gwitmock",
  "Archery (The Park)": "Gwitmock",
};

function getZone(activityName) {
  return ZONE_MAP[activityName] || "Unknown";
}

// ═════════════════════════════════════════════════════════════════════
// SCORING FUNCTIONS
// ═════════════════════════════════════════════════════════════════════

/**
 * Position multiplier — only boosts LAST slot of day and schedule.
 * First slot gets no boost (most likely to be missed per operational notes).
 */
function getPositionMultiplier(slotIdx, totalSlots, daySlices) {
  let mult = 1.0;

  // Last of entire schedule
  if (slotIdx === totalSlots - 1) {
    mult *= CONFIG.LAST_OF_SCHEDULE_MULT;
  }

  // Last of any day
  for (const day of daySlices) {
    if (slotIdx === day.end - 1) {
      mult *= CONFIG.LAST_OF_DAY_MULT;
    }
  }

  return mult;
}

/**
 * Similarity decay — returns a multiplier [0..1] based on how many
 * activities from the same similarity group are already in this row.
 *
 * 1st from group = 1.0 (full value)
 * 2nd from group = 0.5
 * 3rd+ from group = 0.25
 */
function getSimilarityDecay(activity, rowAssignments, similarities) {
  if (!similarities || !activity.similarityGroup) return 1.0;

  let count = 0;
  for (const assigned of rowAssignments) {
    if (assigned && assigned.similarityGroup === activity.similarityGroup) {
      count++;
    }
  }

  const decays = CONFIG.SIMILARITY_VALUE_DECAY;
  if (count >= decays.length) return decays[decays.length - 1];
  return decays[count];
}

/**
 * Walk penalty — penalizes transitions between distant activities.
 * Tracks how many long walks already happened today to escalate penalties.
 */
function getWalkPenalty(
  activity, slotIdx, rowAssignments, distMatrix, nameMap, daySlices
) {
  const currentDay = daySlices.find(d => slotIdx >= d.start && slotIdx < d.end);
  if (!currentDay || slotIdx === currentDay.start) return 0;

  const prev = rowAssignments[slotIdx - 1];
  if (!prev) return 0;

  const distance = getDistance(prev.name, activity.name, distMatrix, nameMap);
  if (distance === null) return 0;

  if (distance <= CONFIG.WALK_SHORT) return 0;

  // Count long walks earlier in this day
  let longWalksToday = 0;
  for (let i = currentDay.start + 1; i < slotIdx; i++) {
    if (rowAssignments[i] && rowAssignments[i - 1]) {
      const d = getDistance(
        rowAssignments[i - 1].name, rowAssignments[i].name,
        distMatrix, nameMap
      );
      if (d !== null && d > CONFIG.WALK_MEDIUM) longWalksToday++;
    }
  }

  if (distance <= CONFIG.WALK_MEDIUM) {
    return CONFIG.WALK_MEDIUM_PENALTY;
  }

  // Long walk
  if (longWalksToday === 0) {
    return CONFIG.WALK_LONG_PENALTY;
  }
  return CONFIG.WALK_LONG_CONSECUTIVE_PENALTY;
}

/**
 * Score a candidate activity for a specific slot in a group's row.
 * Higher = better.
 */
function scoreCandidate(
  activity, slotIdx, totalSlots, rowAssignments,
  daySlices, distMatrix, nameMap, similarities
) {
  const baseValue = activity.value || 0;
  const posMult = getPositionMultiplier(slotIdx, totalSlots, daySlices);
  const simDecay = getSimilarityDecay(activity, rowAssignments, similarities);
  const walkPen = getWalkPenalty(
    activity, slotIdx, rowAssignments, distMatrix, nameMap, daySlices
  );

  return (baseValue * posMult * simDecay) - walkPen;
}

// ═════════════════════════════════════════════════════════════════════
// HARD CONSTRAINTS
// ═════════════════════════════════════════════════════════════════════

/**
 * Check if placing an activity violates the HARD adjacency constraint.
 * Returns true if the activity's similarity group matches the immediately
 * previous slot's activity group. This is the fix for HR-back-to-back.
 */
function violatesAdjacency(activity, slotIdx, rowAssignments, similarities, daySlices) {
  if (!similarities || !activity.similarityGroup) return false;

  // Don't check adjacency across day boundaries
  const currentDay = daySlices.find(d => slotIdx >= d.start && slotIdx < d.end);
  if (currentDay && slotIdx === currentDay.start) return false;

  const prev = rowAssignments[slotIdx - 1];
  if (!prev || !prev.similarityGroup) return false;

  return prev.similarityGroup === activity.similarityGroup;
}

// ═════════════════════════════════════════════════════════════════════
// LATIN SQUARE GENERATION
// ═════════════════════════════════════════════════════════════════════

/**
 * Generate a single Latin square rotation.
 *
 * Algorithm: Row-by-row greedy with hard adjacency constraint.
 * For each cell, pick the highest-scoring valid candidate that doesn't
 * violate adjacency. If no non-adjacent candidate exists, relax the
 * constraint (rare, only when a similarity group dominates the pool).
 *
 * If a row can't be filled, retry with shuffled candidate ordering
 * (controlled randomness breaks greedy local optima).
 */
function generateRotation(
  activities, numGroups, numSlots, daySlices,
  distMatrix, nameMap, similarities, seed = 0
) {
  const n = Math.min(activities.length, numSlots, numGroups);
  if (n === 0) return null;

  // Sort by value descending, take top N
  const pool = [...activities]
    .sort((a, b) => (b.value || 0) - (a.value || 0))
    .slice(0, n);

  // Seeded shuffle utility for retry variation
  function shuffleWithSeed(arr, s) {
    const a = [...arr];
    let rng = s + 1;
    for (let i = a.length - 1; i > 0; i--) {
      rng = (rng * 1664525 + 1013904223) & 0x7fffffff;
      const j = rng % (i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Seeded noise generator for score perturbation
  function seededNoise(s) {
    let rng = (s * 1664525 + 1013904223) & 0x7fffffff;
    return (rng / 0x7fffffff) * 2 - 1; // range [-1, 1]
  }

  for (let attempt = 0; attempt <= CONFIG.GREEDY_RETRIES; attempt++) {
    const matrix = Array.from({ length: n }, () => Array(n).fill(null));
    const usedInRow = Array.from({ length: n }, () => new Set());
    const usedInCol = Array.from({ length: n }, () => new Set());
    let success = true;

    for (let row = 0; row < n; row++) {
      let rowSuccess = true;

      for (let col = 0; col < n; col++) {
        // Get valid candidates (Latin square constraint)
        let candidates = pool.filter(
          act => !usedInRow[row].has(act.name) && !usedInCol[col].has(act.name)
        );

        if (candidates.length === 0) {
          rowSuccess = false;
          break;
        }

        // Shuffle candidates to break deterministic patterns:
        // - Rotation 0, attempt 0: pure greedy (no shuffle)
        // - Rotation 1+, attempt 0: seed-based shuffle for variety
        // - Any rotation, attempt 1+: different shuffle per retry
        if (seed > 0 || attempt > 0) {
          candidates = shuffleWithSeed(candidates, seed + attempt * 1000 + row * 100 + col);
        }

        // Score candidates and separate into adjacent-OK and adjacent-violating
        // For rotations > 0, add score noise (±15) to explore different solutions
        const noiseAmt = seed > 0 ? 15 : 0;
        const scored = candidates.map((act, idx) => ({
          activity: act,
          score: scoreCandidate(
            act, col, n, matrix[row],
            daySlices, distMatrix, nameMap, similarities
          ) + (noiseAmt > 0 ? seededNoise(seed + row * 137 + col * 31 + idx * 7) * noiseAmt : 0),
          adjacentViolation: violatesAdjacency(
            act, col, matrix[row], similarities, daySlices
          ),
        }));

        // Prefer non-violating candidates
        const nonViolating = scored
          .filter(s => !s.adjacentViolation)
          .sort((a, b) => b.score - a.score);

        const violating = scored
          .filter(s => s.adjacentViolation)
          .sort((a, b) => b.score - a.score);

        // Pick best non-violating, or best violating if none available
        const pick = nonViolating.length > 0
          ? nonViolating[0].activity
          : violating[0].activity;

        matrix[row][col] = pick;
        usedInRow[row].add(pick.name);
        usedInCol[col].add(pick.name);
      }

      if (!rowSuccess) {
        success = false;
        break;
      }
    }

    if (success) {
      // Post-process: swap within rows to break any remaining adjacencies
      return postProcessAntiAdjacency(matrix, similarities, daySlices);
    }
  }

  // All retries failed — return best partial result with relaxed constraints
  console.warn("All greedy attempts failed, returning relaxed solution");
  return generateRelaxed(pool, n, daySlices, distMatrix, nameMap, similarities);
}

/**
 * Relaxed fallback: fills the matrix allowing column reuse if needed.
 * Produces a valid schedule even if not a perfect Latin square.
 */
function generateRelaxed(pool, n, daySlices, distMatrix, nameMap, similarities) {
  const matrix = Array.from({ length: n }, () => Array(n).fill(null));
  const usedInRow = Array.from({ length: n }, () => new Set());

  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const candidates = pool
        .filter(act => !usedInRow[row].has(act.name))
        .map(act => ({
          activity: act,
          score: scoreCandidate(
            act, col, n, matrix[row],
            daySlices, distMatrix, nameMap, similarities
          ),
          adj: violatesAdjacency(act, col, matrix[row], similarities, daySlices),
        }))
        .sort((a, b) => {
          if (a.adj !== b.adj) return a.adj ? 1 : -1;
          return b.score - a.score;
        });

      if (candidates.length > 0) {
        const pick = candidates[0].activity;
        matrix[row][col] = pick;
        usedInRow[row].add(pick.name);
      }
    }
  }

  return postProcessAntiAdjacency(matrix, similarities, daySlices);
}

// ═════════════════════════════════════════════════════════════════════
// POST-PROCESSING: Break remaining adjacencies via within-row swaps
// ═════════════════════════════════════════════════════════════════════

function countRowAdjacencies(row, similarities, daySlices) {
  if (!similarities) return 0;
  let count = 0;
  for (let i = 0; i < row.length - 1; i++) {
    const a = row[i];
    const b = row[i + 1];
    if (!a?.similarityGroup || !b?.similarityGroup) continue;
    if (a.similarityGroup !== b.similarityGroup) continue;

    // Don't count across day boundaries
    const isDayBoundary = daySlices?.some(d => d.start === i + 1);
    if (!isDayBoundary) count++;
  }
  return count;
}

function countMatrixAdjacencies(matrix, similarities, daySlices) {
  if (!matrix) return 0;
  return matrix.reduce(
    (sum, row) => sum + countRowAdjacencies(row, similarities, daySlices), 0
  );
}

function postProcessAntiAdjacency(matrix, similarities, daySlices) {
  if (!similarities || !matrix?.length) return matrix;

  const result = matrix.map(row => [...row]);
  const n = result[0]?.length || 0;
  if (n < 3) return result;

  for (let rowIdx = 0; rowIdx < result.length; rowIdx++) {
    let improved = true;
    let maxIter = n * n * 2;

    while (improved && maxIter-- > 0) {
      improved = false;
      const adjBefore = countRowAdjacencies(result[rowIdx], similarities, daySlices);
      if (adjBefore === 0) break;

      for (let i = 0; i < n - 1; i++) {
        const a = result[rowIdx][i];
        const b = result[rowIdx][i + 1];
        if (!a?.similarityGroup || a.similarityGroup !== b?.similarityGroup) continue;

        // Skip day boundaries
        if (daySlices?.some(d => d.start === i + 1)) continue;

        // Try swapping position i with every non-adjacent position
        let bestSwap = -1;
        let bestAdj = adjBefore;

        for (let j = 0; j < n; j++) {
          if (Math.abs(j - i) <= 1) continue;
          if (!result[rowIdx][j]) continue;

          // Simulate swap
          [result[rowIdx][i], result[rowIdx][j]] = [result[rowIdx][j], result[rowIdx][i]];
          const adjAfter = countRowAdjacencies(result[rowIdx], similarities, daySlices);
          [result[rowIdx][i], result[rowIdx][j]] = [result[rowIdx][j], result[rowIdx][i]];

          if (adjAfter < bestAdj) {
            bestAdj = adjAfter;
            bestSwap = j;
          }
        }

        if (bestSwap >= 0) {
          [result[rowIdx][i], result[rowIdx][bestSwap]] =
            [result[rowIdx][bestSwap], result[rowIdx][i]];
          improved = true;
          break; // restart scan for this row
        }
      }
    }
  }

  return result;
}

// ═════════════════════════════════════════════════════════════════════
// STATISTICS
// ═════════════════════════════════════════════════════════════════════

function computeStats(matrix, daySlices, distMatrix, nameMap, similarities) {
  if (!matrix) return null;

  const groupStats = [];
  let totalValue = 0;
  let totalDistance = 0;

  for (let g = 0; g < matrix.length; g++) {
    let gValue = 0;
    let gDist = 0;
    let gMaxWalk = 0;
    let gLongWalks = 0;
    let gAdjacencies = countRowAdjacencies(matrix[g], similarities, daySlices);
    const simGroupsSeen = {};

    for (let s = 0; s < matrix[g].length; s++) {
      const act = matrix[g][s];
      if (!act) continue;

      // Value with position multiplier and similarity decay
      const posMult = getPositionMultiplier(s, matrix[g].length, daySlices);
      const group = act.similarityGroup || "__none__";
      simGroupsSeen[group] = (simGroupsSeen[group] || 0) + 1;
      const decayIdx = simGroupsSeen[group] - 1;
      const decays = CONFIG.SIMILARITY_VALUE_DECAY;
      const decay = decayIdx < decays.length ? decays[decayIdx] : decays[decays.length - 1];
      gValue += (act.value || 0) * posMult * decay;

      // Walk distance
      if (s > 0 && matrix[g][s - 1]) {
        // Don't count walk across day boundaries
        const isDayStart = daySlices.some(d => d.start === s);
        if (!isDayStart) {
          const dist = getDistance(
            matrix[g][s - 1].name, act.name, distMatrix, nameMap
          );
          if (dist !== null) {
            gDist += dist;
            gMaxWalk = Math.max(gMaxWalk, dist);
            if (dist > CONFIG.WALK_MEDIUM) gLongWalks++;
          }
        }
      }
    }

    totalValue += gValue;
    totalDistance += gDist;
    groupStats.push({
      value: Math.round(gValue),
      dist: gDist,
      maxWalk: gMaxWalk,
      longWalks: gLongWalks,
      adjacencies: gAdjacencies,
    });
  }

  return {
    avgValue: Math.round(totalValue / matrix.length),
    avgDist: Math.round(totalDistance / matrix.length),
    totalAdjacencies: countMatrixAdjacencies(matrix, similarities, daySlices),
    groupStats,
  };
}

// ═════════════════════════════════════════════════════════════════════
// LATIN SQUARE VALIDATION
// ═════════════════════════════════════════════════════════════════════

function validateLatinSquare(matrix) {
  if (!matrix?.length) return { valid: false, issues: ["No matrix"] };
  const n = matrix.length;
  const issues = [];

  // Check rows: each activity at most once
  for (let r = 0; r < n; r++) {
    const seen = new Set();
    for (let c = 0; c < matrix[r].length; c++) {
      const name = matrix[r][c]?.name;
      if (name && seen.has(name)) {
        issues.push(`Row ${r + 1}: duplicate "${shortName(name)}"`);
      }
      if (name) seen.add(name);
    }
  }

  // Check columns: each activity at most once
  const cols = matrix[0]?.length || 0;
  for (let c = 0; c < cols; c++) {
    const seen = new Set();
    for (let r = 0; r < n; r++) {
      const name = matrix[r][c]?.name;
      if (name && seen.has(name)) {
        issues.push(`Col ${c + 1}: duplicate "${shortName(name)}"`);
      }
      if (name) seen.add(name);
    }
  }

  return { valid: issues.length === 0, issues };
}

// ═════════════════════════════════════════════════════════════════════
// REACT COMPONENT
// ═════════════════════════════════════════════════════════════════════

export default function Generator({
  registry,
  distMatrix,
  timeSlots,
  daySlices,
  similarities,
  startLocations,
}) {
  const [rotations, setRotations] = useState([]); // array of { matrix, stats, validation }
  const [generating, setGenerating] = useState(false);
  const [numGroups, setNumGroups] = useState(12);
  const [numRotations, setNumRotations] = useState(2);
  const [activeRotation, setActiveRotation] = useState(0);

  // Build activity list from registry
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
          zone: getZone(name),
        });
      }
    }
    return acts;
  }, [registry, similarities]);

  const effectiveSlots = timeSlots.length;
  const effectiveGroups = Math.min(numGroups, activities.length, effectiveSlots);

  // Generate handler
  const handleGenerate = useCallback(() => {
    setGenerating(true);
    setRotations([]);
    setActiveRotation(0);

    setTimeout(() => {
      const results = [];

      for (let r = 0; r < numRotations; r++) {
        const matrix = generateRotation(
          activities,
          effectiveGroups,
          effectiveSlots,
          daySlices,
          distMatrix,
          registry.nameMap,
          similarities,
          r * 7919 // different seed per rotation
        );

        if (matrix) {
          const stats = computeStats(
            matrix, daySlices, distMatrix, registry.nameMap, similarities
          );
          const validation = validateLatinSquare(matrix);
          results.push({ matrix, stats, validation });
        }
      }

      setRotations(results);
      setGenerating(false);
    }, 50);
  }, [
    activities, effectiveGroups, effectiveSlots, daySlices,
    distMatrix, registry.nameMap, similarities, numRotations,
  ]);

  // Current rotation data
  const current = rotations[activeRotation] || null;
  const matrix = current?.matrix;
  const stats = current?.stats;
  const validation = current?.validation;

  // Day boundary set for rendering
  const dayBounds = useMemo(
    () => new Set(daySlices.map(d => d.start).filter(s => s > 0)),
    [daySlices]
  );

  return (
    <div className="min-h-screen bg-base-900 text-text-primary font-sans">
      {/* --- Toolbar --- */}
      <div className="flex items-center flex-wrap gap-4 px-7 py-3.5 bg-base-800 border-b border-base-500">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-base-100 uppercase tracking-wider font-semibold">
            Groups
          </span>
          <input
            type="number"
            min={1}
            max={Math.min(activities.length, effectiveSlots)}
            value={numGroups}
            onChange={e => setNumGroups(
              Math.max(1, Math.min(parseInt(e.target.value) || 1, activities.length, effectiveSlots))
            )}
            className="bg-base-500 border border-base-400 rounded-md text-text-primary px-2.5 py-1.5 text-[13px] font-mono w-14 text-center"
          />
        </div>

        <div className="w-px h-6 bg-base-500" />

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-base-100 uppercase tracking-wider font-semibold">
            Rotations
          </span>
          <input
            type="number"
            min={1}
            max={4}
            value={numRotations}
            onChange={e => setNumRotations(
              Math.max(1, Math.min(parseInt(e.target.value) || 1, 4))
            )}
            className="bg-base-500 border border-base-400 rounded-md text-text-primary px-2.5 py-1.5 text-[13px] font-mono w-14 text-center"
          />
        </div>

        <div className="w-px h-6 bg-base-500" />

        <button
          onClick={handleGenerate}
          disabled={generating || activities.length === 0}
          className={`px-5 py-2 rounded-md text-xs font-bold border-none bg-accent-purple text-base-900 cursor-pointer tracking-wide transition-all ${
            generating ? "opacity-40 cursor-not-allowed" : ""
          }`}
        >
          {generating ? "Generating..." : "Generate"}
        </button>

        {/* Info */}
        <span className="text-[11px] text-base-200 ml-2">
          {activities.length} activities · {effectiveSlots} slots · {daySlices.length} days
        </span>
      </div>

      {/* --- Rotation Tabs --- */}
      {rotations.length > 1 && (
        <div className="flex gap-1.5 px-7 pt-2.5">
          {rotations.map((_, i) => (
            <button
              key={i}
              onClick={() => setActiveRotation(i)}
              className={`px-4 py-1.5 rounded-t-md text-xs font-semibold border border-b-0 cursor-pointer ${
                activeRotation === i
                  ? "border-accent-purple bg-[#1a1630] text-accent-purple"
                  : "border-base-500 bg-transparent text-base-200"
              }`}
            >
              Rotation {String.fromCharCode(65 + i)}
            </button>
          ))}
        </div>
      )}

      {/* --- Summary Stats --- */}
      {stats && (
        <div className="px-7 py-5">
          <div className="flex gap-3 flex-wrap mb-4">
            <div className="bg-base-700 rounded-lg border border-base-500 px-4 py-3 min-w-[110px]">
              <div className="text-[10px] text-base-100 mb-0.5">Avg Value</div>
              <div className="text-lg font-bold font-mono text-accent-green">
                {stats.avgValue}
              </div>
            </div>
            <div className="bg-base-700 rounded-lg border border-base-500 px-4 py-3 min-w-[110px]">
              <div className="text-[10px] text-base-100 mb-0.5">Avg Walk</div>
              <div className="text-lg font-bold font-mono text-warning">
                {stats.avgDist}m
              </div>
            </div>
            <div className="bg-base-700 rounded-lg border border-base-500 px-4 py-3 min-w-[110px]">
              <div className="text-[10px] text-base-100 mb-0.5">Adjacencies</div>
              <div className={`text-lg font-bold font-mono ${
                stats.totalAdjacencies === 0 ? "text-accent-green" : "text-error-light"
              }`}>
                {stats.totalAdjacencies}
              </div>
            </div>
            <div className="bg-base-700 rounded-lg border border-base-500 px-4 py-3 min-w-[110px]">
              <div className="text-[10px] text-base-100 mb-0.5">Latin Square</div>
              <div className={`text-sm font-bold font-mono ${
                validation?.valid ? "text-accent-green" : "text-error-light"
              }`}>
                {validation?.valid ? "Valid \u2713" : `${validation?.issues?.length || 0} issues`}
              </div>
            </div>
          </div>

          {/* Validation issues */}
          {validation && !validation.valid && (
            <div className="bg-[#1c1117] border border-[#4c1d29] rounded-lg px-3.5 py-2.5 mb-4">
              <div className="text-[11px] text-error-light font-semibold mb-1.5">
                Latin Square Issues
              </div>
              {validation.issues.slice(0, 8).map((issue, i) => (
                <div key={i} className="text-[10px] text-[#fca5a5] mb-0.5">
                  · {issue}
                </div>
              ))}
              {validation.issues.length > 8 && (
                <div className="text-[10px] text-base-100 mt-1">
                  ...and {validation.issues.length - 8} more
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* --- Matrix Grid --- */}
      {matrix && (
        <div className="px-7 pt-0 pb-5 overflow-x-auto">
          <table className="border-collapse w-full table-fixed">
            {/* Day headers */}
            <thead>
              <tr>
                <th className="w-[52px] px-2 py-1 text-[9px] text-base-200 text-left sticky left-0 bg-base-900 z-[2]">
                  Group
                </th>
                {daySlices.map((day, di) => (
                  <th
                    key={di}
                    colSpan={day.end - day.start}
                    className="px-2 py-1.5 text-[11px] font-bold text-center tracking-wide"
                    style={{
                      color: DAY_COLORS[day.name] || "#a78bfa",
                      borderBottom: `2px solid ${DAY_COLORS[day.name] || "#a78bfa"}33`,
                    }}
                  >
                    {day.name}
                  </th>
                ))}
              </tr>
              {/* Time slot sub-header */}
              <tr>
                <th className="sticky left-0 bg-base-900 z-[2]" />
                {timeSlots.map((slot, si) => (
                  <th
                    key={si}
                    className={`px-0.5 py-0.5 text-[8px] text-base-200 font-medium text-center ${
                      dayBounds.has(si) ? "border-l-2 border-base-500" : ""
                    }`}
                  >
                    {slot.time}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {matrix.map((row, gi) => (
                <tr key={gi}>
                  <td className="px-2 py-1 text-[11px] font-bold text-accent-purple font-mono sticky left-0 bg-base-900 z-[1] border-r border-base-500">
                    A{gi + 1}
                  </td>
                  {row.map((activity, si) => {
                    if (!activity) {
                      return (
                        <td
                          key={si}
                          className={`p-0.5 ${
                            dayBounds.has(si) ? "border-l-2 border-base-500" : ""
                          }`}
                        >
                          <div className="bg-base-700 rounded h-[52px] flex items-center justify-center text-[10px] text-base-300">
                            —
                          </div>
                        </td>
                      );
                    }

                    const colors = getCellColors(activity.value || 0);
                    const simGroup = activity.similarityGroup;
                    const simColor = simGroup ? getSimColor(simGroup) : null;

                    // Check if this is an adjacency violation
                    const prevAct = si > 0 ? row[si - 1] : null;
                    const isAdjacentViolation =
                      prevAct?.similarityGroup &&
                      prevAct.similarityGroup === simGroup &&
                      !daySlices.some(d => d.start === si);

                    // Check if this is a last-of-day/schedule position (boosted)
                    const isLastOfDay = daySlices.some(d => d.end - 1 === si);
                    const isLastOfSchedule = si === row.length - 1;
                    const isBoosted = isLastOfDay || isLastOfSchedule;

                    return (
                      <td
                        key={si}
                        className={`p-0.5 ${
                          dayBounds.has(si) ? "border-l-2 border-base-500" : ""
                        }`}
                      >
                        <div
                          className={`rounded-[5px] px-[5px] py-1 h-[52px] flex flex-col justify-between relative overflow-hidden ${
                            isAdjacentViolation
                              ? "border-2 border-[#ef4444]"
                              : isBoosted
                                ? "border border-[#a78bfa55]"
                                : "border border-transparent"
                          }`}
                          style={{ backgroundColor: colors.bg }}
                          title={`${activity.name}\nValue: ${activity.value}\nGroup: ${simGroup || "none"}\nZone: ${activity.zone}`}
                        >
                          {/* Similarity group indicator */}
                          {simGroup && (
                            <div
                              className="absolute top-0 right-0 w-1.5 h-1.5 rounded-tr rounded-bl opacity-80"
                              style={{ backgroundColor: simColor }}
                            />
                          )}

                          {/* Boost indicator */}
                          {isBoosted && (
                            <div className="absolute top-px left-[3px] text-[7px] text-accent-purple opacity-70">
                              ★
                            </div>
                          )}

                          {/* Activity name */}
                          <div
                            className="text-[10px] font-semibold leading-tight mt-0.5"
                            style={{ color: colors.text }}
                          >
                            {shortName(activity.name)}
                          </div>

                          {/* Footer: zone + value */}
                          <div className="flex justify-between items-end">
                            <span className="text-[7px] text-base-200 max-w-[40px] overflow-hidden text-ellipsis whitespace-nowrap">
                              {activity.zone}
                            </span>
                            <span
                              className="text-[9px] font-bold font-mono bg-black/25 rounded-[3px] px-1 py-px"
                              style={{ color: colors.text }}
                            >
                              {activity.value}
                            </span>
                          </div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* --- Per-Group Stats --- */}
      {stats && matrix && (
        <div className="px-7 py-5">
          <div className="text-[15px] font-bold text-accent-purple mb-3.5 -tracking-tight">
            Per-Group Statistics
          </div>
          <div className="flex gap-2 flex-wrap">
            {stats.groupStats.map((gs, gi) => (
              <div
                key={gi}
                className="bg-base-700 rounded-lg border border-base-500 px-4 py-3 min-w-[110px]"
              >
                <div className="text-xs font-bold text-accent-purple mb-1.5 font-mono">
                  A{gi + 1}
                </div>
                <div className="text-[10px] text-base-100 mb-0.5">
                  Value: <span className="text-accent-green font-semibold">
                    {gs.value}
                  </span>
                </div>
                <div className="text-[10px] text-base-100 mb-0.5">
                  Walk: <span className="text-warning font-semibold">
                    {gs.dist}m
                  </span>
                </div>
                <div className="text-[10px] text-base-100 mb-0.5">
                  Long walks: <span className={`font-semibold ${
                    gs.longWalks > 2 ? "text-error-light" : "text-base-100"
                  }`}>
                    {gs.longWalks}
                  </span>
                </div>
                {gs.adjacencies > 0 && (
                  <div className="text-[10px] text-base-100 mb-0.5">
                    Adj. violations: <span className="text-error-light font-semibold">
                      {gs.adjacencies}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- Similarity Legend --- */}
      {matrix && (
        <div className="px-7 py-5">
          <div className="text-[15px] font-bold text-accent-purple mb-3.5 -tracking-tight">
            Similarity Groups
          </div>
          <div className="flex gap-3 flex-wrap">
            {Object.entries(SIM_GROUP_COLORS).map(([group, color]) => (
              <div key={group} className="flex items-center gap-1.5">
                <div
                  className="w-2 h-2 rounded-sm"
                  style={{ backgroundColor: color }}
                />
                <span className="text-[11px] text-base-100">{group}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- Empty State --- */}
      {!matrix && !generating && (
        <div className="flex flex-col items-center justify-center px-7 py-20 text-center">
          <div className="text-5xl mb-4 opacity-15">
            ⬡
          </div>
          <div className="text-base text-base-200 mb-2">
            No schedule generated yet
          </div>
          <div className="text-xs text-base-300 max-w-[420px] leading-relaxed">
            Configure the number of groups and rotations above, then click Generate.
            The algorithm uses greedy row-by-row assignment with hard adjacency constraints
            to prevent same-type activities (like High Ropes) from appearing back-to-back.
          </div>
        </div>
      )}

      {/* --- Generating Spinner --- */}
      {generating && (
        <div className="flex flex-col items-center justify-center px-7 py-20">
          <div className="w-8 h-8 border-3 border-base-500 border-t-accent-purple rounded-full animate-spin" />
          <div className="text-[13px] text-base-100 mt-3.5">
            Generating {numRotations} rotation{numRotations > 1 ? "s" : ""}...
          </div>
        </div>
      )}
    </div>
  );
}
