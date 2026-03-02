import React, { useState, useMemo, useCallback } from "react";
import { getDistance, shortName } from "../utils/parsers.js";

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CONFIGURATION
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ZONE MAPPING — groups activities by physical area
// Walk distances between zones are more reliable than individual
// activity distances since the hill distorts straight-line meters.
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SCORING FUNCTIONS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// HARD CONSTRAINTS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// LATIN SQUARE GENERATION
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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
        // For rotations > 0, add score noise (Â±15) to explore different solutions
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// POST-PROCESSING: Break remaining adjacencies via within-row swaps
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// STATISTICS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// LATIN SQUARE VALIDATION
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// COLOR UTILITIES
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const VALUE_COLORS = [
  { min: 90, bg: "#064e3b", text: "#6ee7b7" },
  { min: 70, bg: "#1e3a2f", text: "#86efac" },
  { min: 50, bg: "#1a2332", text: "#93c5fd" },
  { min: 30, bg: "#27242e", text: "#c4b5fd" },
  { min: 0,  bg: "#1f1f24", text: "#a1a1aa" },
];

function getCellColors(value) {
  for (const vc of VALUE_COLORS) {
    if (value >= vc.min) return vc;
  }
  return VALUE_COLORS[VALUE_COLORS.length - 1];
}

const SIM_GROUP_COLORS = {
  "Courage / Arial": "#ef4444",
  "Precision": "#f97316",
  "Racquet": "#eab308",
  "Skateboards": "#22c55e",
  "Lesuire Sport": "#06b6d4",
  "Auxilary": "#8b5cf6",
};

function getSimColor(group) {
  return SIM_GROUP_COLORS[group] || "#6b7280";
}

const DAY_COLORS = {
  Monday: "#f59e0b",
  Tuesday: "#3b82f6",
  Wednesday: "#10b981",
  Thursday: "#8b5cf6",
  Friday: "#ef4444",
};

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// REACT COMPONENT
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

  // --- STYLES ---
  const S = {
    page: {
      minHeight: "100vh",
      background: "#0a0d13",
      color: "#d4d4d8",
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
    },
    toolbar: {
      padding: "14px 28px",
      background: "#10141c",
      borderBottom: "1px solid #1c2233",
      display: "flex",
      gap: 16,
      alignItems: "center",
      flexWrap: "wrap",
    },
    label: {
      fontSize: 10,
      color: "#71717a",
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      fontWeight: 600,
    },
    input: {
      background: "#1c2233",
      border: "1px solid #2a3348",
      borderRadius: 6,
      color: "#e4e4e7",
      padding: "6px 10px",
      fontSize: 13,
      fontFamily: "'DM Mono', monospace",
      width: 56,
      textAlign: "center",
    },
    btnPrimary: {
      padding: "8px 22px",
      borderRadius: 6,
      fontSize: 12,
      fontWeight: 700,
      border: "none",
      background: "#a78bfa",
      color: "#0a0d13",
      cursor: "pointer",
      letterSpacing: "0.03em",
      transition: "all 0.15s",
    },
    btnPrimaryDisabled: {
      opacity: 0.4,
      cursor: "not-allowed",
    },
    divider: {
      width: 1,
      height: 24,
      background: "#1c2233",
    },
    section: {
      padding: "20px 28px",
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: 700,
      color: "#a78bfa",
      marginBottom: 14,
      letterSpacing: "-0.01em",
    },
    statCard: {
      background: "#12161f",
      borderRadius: 8,
      border: "1px solid #1c2233",
      padding: "12px 16px",
      minWidth: 110,
    },
    statLabel: { fontSize: 10, color: "#71717a", marginBottom: 2 },
    statValue: { fontSize: 18, fontWeight: 700, fontFamily: "'DM Mono', monospace" },
  };

  return (
    <div style={S.page}>
      {/* --- Toolbar --- */}
      <div style={S.toolbar}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={S.label}>Groups</span>
          <input
            type="number"
            min={1}
            max={Math.min(activities.length, effectiveSlots)}
            value={numGroups}
            onChange={e => setNumGroups(
              Math.max(1, Math.min(parseInt(e.target.value) || 1, activities.length, effectiveSlots))
            )}
            style={S.input}
          />
        </div>

        <div style={S.divider} />

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={S.label}>Rotations</span>
          <input
            type="number"
            min={1}
            max={4}
            value={numRotations}
            onChange={e => setNumRotations(
              Math.max(1, Math.min(parseInt(e.target.value) || 1, 4))
            )}
            style={S.input}
          />
        </div>

        <div style={S.divider} />

        <button
          onClick={handleGenerate}
          disabled={generating || activities.length === 0}
          style={{
            ...S.btnPrimary,
            ...(generating ? S.btnPrimaryDisabled : {}),
          }}
        >
          {generating ? "Generating..." : "Generate"}
        </button>

        {/* Info */}
        <span style={{ fontSize: 11, color: "#52525b", marginLeft: 8 }}>
          {activities.length} activities Â· {effectiveSlots} slots Â· {daySlices.length} days
        </span>
      </div>

      {/* --- Rotation Tabs --- */}
      {rotations.length > 1 && (
        <div style={{
          padding: "10px 28px 0",
          display: "flex",
          gap: 6,
        }}>
          {rotations.map((_, i) => (
            <button
              key={i}
              onClick={() => setActiveRotation(i)}
              style={{
                padding: "6px 18px",
                borderRadius: "6px 6px 0 0",
                fontSize: 12,
                fontWeight: 600,
                border: "1px solid",
                borderBottom: "none",
                borderColor: activeRotation === i ? "#a78bfa" : "#1c2233",
                background: activeRotation === i ? "#1a1630" : "transparent",
                color: activeRotation === i ? "#a78bfa" : "#52525b",
                cursor: "pointer",
              }}
            >
              Rotation {String.fromCharCode(65 + i)}
            </button>
          ))}
        </div>
      )}

      {/* --- Summary Stats --- */}
      {stats && (
        <div style={S.section}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <div style={S.statCard}>
              <div style={S.statLabel}>Avg Value</div>
              <div style={{ ...S.statValue, color: "#34d399" }}>{stats.avgValue}</div>
            </div>
            <div style={S.statCard}>
              <div style={S.statLabel}>Avg Walk</div>
              <div style={{ ...S.statValue, color: "#fbbf24" }}>{stats.avgDist}m</div>
            </div>
            <div style={S.statCard}>
              <div style={S.statLabel}>Adjacencies</div>
              <div style={{
                ...S.statValue,
                color: stats.totalAdjacencies === 0 ? "#34d399" : "#f87171",
              }}>
                {stats.totalAdjacencies}
              </div>
            </div>
            <div style={S.statCard}>
              <div style={S.statLabel}>Latin Square</div>
              <div style={{
                ...S.statValue,
                fontSize: 14,
                color: validation?.valid ? "#34d399" : "#f87171",
              }}>
                {validation?.valid ? "Valid âœ“" : `${validation?.issues?.length || 0} issues`}
              </div>
            </div>
          </div>

          {/* Validation issues */}
          {validation && !validation.valid && (
            <div style={{
              background: "#1c1117",
              border: "1px solid #4c1d29",
              borderRadius: 8,
              padding: "10px 14px",
              marginBottom: 16,
            }}>
              <div style={{ fontSize: 11, color: "#f87171", fontWeight: 600, marginBottom: 6 }}>
                Latin Square Issues
              </div>
              {validation.issues.slice(0, 8).map((issue, i) => (
                <div key={i} style={{ fontSize: 10, color: "#fca5a5", marginBottom: 2 }}>
                  Â· {issue}
                </div>
              ))}
              {validation.issues.length > 8 && (
                <div style={{ fontSize: 10, color: "#71717a", marginTop: 4 }}>
                  ...and {validation.issues.length - 8} more
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* --- Matrix Grid --- */}
      {matrix && (
        <div style={{ ...S.section, paddingTop: 0, overflowX: "auto" }}>
          <table style={{
            borderCollapse: "collapse",
            width: "100%",
            tableLayout: "fixed",
          }}>
            {/* Day headers */}
            <thead>
              <tr>
                <th style={{
                  width: 52,
                  padding: "4px 8px",
                  fontSize: 9,
                  color: "#52525b",
                  textAlign: "left",
                  position: "sticky",
                  left: 0,
                  background: "#0a0d13",
                  zIndex: 2,
                }}>
                  Group
                </th>
                {daySlices.map((day, di) => (
                  <th
                    key={di}
                    colSpan={day.end - day.start}
                    style={{
                      padding: "6px 8px",
                      fontSize: 11,
                      fontWeight: 700,
                      color: DAY_COLORS[day.name] || "#a78bfa",
                      textAlign: "center",
                      borderBottom: `2px solid ${DAY_COLORS[day.name] || "#a78bfa"}33`,
                      letterSpacing: "0.04em",
                    }}
                  >
                    {day.name}
                  </th>
                ))}
              </tr>
              {/* Time slot sub-header */}
              <tr>
                <th style={{
                  position: "sticky",
                  left: 0,
                  background: "#0a0d13",
                  zIndex: 2,
                }} />
                {timeSlots.map((slot, si) => (
                  <th
                    key={si}
                    style={{
                      padding: "3px 2px",
                      fontSize: 8,
                      color: "#52525b",
                      fontWeight: 500,
                      textAlign: "center",
                      borderLeft: dayBounds.has(si) ? "2px solid #1c2233" : "none",
                    }}
                  >
                    {slot.time}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {matrix.map((row, gi) => (
                <tr key={gi}>
                  <td style={{
                    padding: "4px 8px",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#a78bfa",
                    fontFamily: "'DM Mono', monospace",
                    position: "sticky",
                    left: 0,
                    background: "#0a0d13",
                    zIndex: 1,
                    borderRight: "1px solid #1c2233",
                  }}>
                    A{gi + 1}
                  </td>
                  {row.map((activity, si) => {
                    if (!activity) {
                      return (
                        <td key={si} style={{
                          padding: 2,
                          borderLeft: dayBounds.has(si) ? "2px solid #1c2233" : "none",
                        }}>
                          <div style={{
                            background: "#14181f",
                            borderRadius: 4,
                            height: 52,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 10,
                            color: "#3f3f46",
                          }}>
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
                      <td key={si} style={{
                        padding: 2,
                        borderLeft: dayBounds.has(si) ? "2px solid #1c2233" : "none",
                      }}>
                        <div
                          style={{
                            background: colors.bg,
                            borderRadius: 5,
                            padding: "4px 5px",
                            height: 52,
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "space-between",
                            position: "relative",
                            border: isAdjacentViolation
                              ? "2px solid #ef4444"
                              : isBoosted
                                ? "1px solid #a78bfa55"
                                : "1px solid transparent",
                            overflow: "hidden",
                          }}
                          title={`${activity.name}\nValue: ${activity.value}\nGroup: ${simGroup || "none"}\nZone: ${activity.zone}`}
                        >
                          {/* Similarity group indicator */}
                          {simGroup && (
                            <div style={{
                              position: "absolute",
                              top: 0,
                              right: 0,
                              width: 6,
                              height: 6,
                              borderRadius: "0 4px 0 4px",
                              background: simColor,
                              opacity: 0.8,
                            }} />
                          )}

                          {/* Boost indicator */}
                          {isBoosted && (
                            <div style={{
                              position: "absolute",
                              top: 1,
                              left: 3,
                              fontSize: 7,
                              color: "#a78bfa",
                              opacity: 0.7,
                            }}>
                              â˜…
                            </div>
                          )}

                          {/* Activity name */}
                          <div style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: colors.text,
                            lineHeight: 1.2,
                            marginTop: 2,
                          }}>
                            {shortName(activity.name)}
                          </div>

                          {/* Footer: zone + value */}
                          <div style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-end",
                          }}>
                            <span style={{
                              fontSize: 7,
                              color: "#52525b",
                              maxWidth: 40,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}>
                              {activity.zone}
                            </span>
                            <span style={{
                              fontSize: 9,
                              fontWeight: 700,
                              fontFamily: "'DM Mono', monospace",
                              color: colors.text,
                              background: "rgba(0,0,0,0.25)",
                              borderRadius: 3,
                              padding: "1px 4px",
                            }}>
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
        <div style={S.section}>
          <div style={S.sectionTitle}>Per-Group Statistics</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {stats.groupStats.map((gs, gi) => (
              <div key={gi} style={S.statCard}>
                <div style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#a78bfa",
                  marginBottom: 6,
                  fontFamily: "'DM Mono', monospace",
                }}>
                  A{gi + 1}
                </div>
                <div style={S.statLabel}>
                  Value: <span style={{ color: "#34d399", fontWeight: 600 }}>
                    {gs.value}
                  </span>
                </div>
                <div style={S.statLabel}>
                  Walk: <span style={{ color: "#fbbf24", fontWeight: 600 }}>
                    {gs.dist}m
                  </span>
                </div>
                <div style={S.statLabel}>
                  Long walks: <span style={{
                    color: gs.longWalks > 2 ? "#f87171" : "#71717a",
                    fontWeight: 600,
                  }}>
                    {gs.longWalks}
                  </span>
                </div>
                {gs.adjacencies > 0 && (
                  <div style={S.statLabel}>
                    Adj. violations: <span style={{ color: "#f87171", fontWeight: 600 }}>
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
        <div style={S.section}>
          <div style={S.sectionTitle}>Similarity Groups</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {Object.entries(SIM_GROUP_COLORS).map(([group, color]) => (
              <div key={group} style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}>
                <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: color,
                }} />
                <span style={{ fontSize: 11, color: "#71717a" }}>{group}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- Empty State --- */}
      {!matrix && !generating && (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "80px 28px",
          textAlign: "center",
        }}>
          <div style={{
            fontSize: 48,
            marginBottom: 16,
            opacity: 0.15,
          }}>
            â¬¡
          </div>
          <div style={{
            fontSize: 16,
            color: "#52525b",
            marginBottom: 8,
          }}>
            No schedule generated yet
          </div>
          <div style={{
            fontSize: 12,
            color: "#3f3f46",
            maxWidth: 420,
            lineHeight: 1.5,
          }}>
            Configure the number of groups and rotations above, then click Generate.
            The algorithm uses greedy row-by-row assignment with hard adjacency constraints
            to prevent same-type activities (like High Ropes) from appearing back-to-back.
          </div>
        </div>
      )}

      {/* --- Generating Spinner --- */}
      {generating && (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "80px 28px",
        }}>
          <div style={{
            width: 32,
            height: 32,
            border: "3px solid #1c2233",
            borderTopColor: "#a78bfa",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }} />
          <div style={{ fontSize: 13, color: "#71717a", marginTop: 14 }}>
            Generating {numRotations} rotation{numRotations > 1 ? "s" : ""}...
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
