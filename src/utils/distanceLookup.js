/**
 * distanceLookup.js — Functions for looking up distances between activities,
 * handling name aliases from the registry.
 */

import { haversine } from './distanceCalculator.js';

/**
 * Look up the distance between two activities, handling name aliases.
 */
export function getDistance(a, b, distMatrix, nameMap) {
  if (!a || !b) return null;

  // Try all alias combinations
  const aCan = nameMap[a] || a;
  const bCan = nameMap[b] || b;

  // Direct lookup
  function tryLookup(x, y) {
    const row = distMatrix[x];
    if (row && row[y] !== undefined) return row[y];
    return null;
  }

  // We need to try all aliases of a against all aliases of b
  const aAliases = [
    a,
    aCan,
    ...Object.keys(nameMap).filter((k) => nameMap[k] === aCan),
  ];
  const bAliases = [
    b,
    bCan,
    ...Object.keys(nameMap).filter((k) => nameMap[k] === bCan),
  ];

  for (const ax of [...new Set(aAliases)]) {
    for (const bx of [...new Set(bAliases)]) {
      const d = tryLookup(ax, bx);
      if (d !== null) return d;
    }
  }
  // Try reverse
  for (const bx of [...new Set(bAliases)]) {
    for (const ax of [...new Set(aAliases)]) {
      const d = tryLookup(bx, ax);
      if (d !== null) return d;
    }
  }

  return null;
}

/**
 * Look up distance from a start location to an activity.
 * Start locations are raw keys in the distance matrix (e.g. "(start) Main Lodge").
 * They are NOT in the name registry, so we look them up directly by their raw key
 * and resolve the activity via aliases.
 */
export function getStartDistance(startKey, activity, distMatrix, nameMap) {
  if (!startKey || !activity) return null;

  // The start key is used as-is in the distance matrix
  const startRow = distMatrix[startKey];

  if (!startRow) return null;

  // Try direct lookup with the activity's raw name
  if (startRow[activity] !== undefined) return startRow[activity];

  // Try all aliases of the activity
  const aCan = nameMap[activity] || activity;
  const aAliases = [
    activity,
    aCan,
    ...Object.keys(nameMap).filter((k) => nameMap[k] === aCan),
  ];

  for (const alias of [...new Set(aAliases)]) {
    if (startRow[alias] !== undefined) return startRow[alias];
  }

  // Try reverse: activity row -> start column
  for (const alias of [...new Set(aAliases)]) {
    const row = distMatrix[alias];
    if (row && row[startKey] !== undefined) return row[startKey];
  }

  return null;
}

/**
 * Resolve an activity name to its GPS coords from the registry metadata.
 */
function resolveActivityGPS(activityName, registry) {
  if (!activityName || !registry) return null;
  const nameMap = registry.nameMap || {};
  const canonical = registry.canonical || {};
  const can = nameMap[activityName] || activityName;
  const entry = canonical[can] || canonical[activityName];
  if (!entry?.metadata?.gps) return null;
  const parts = entry.metadata.gps.split(',').map(s => parseFloat(s.trim()));
  if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { lat: parts[0], lng: parts[1] };
  }
  return null;
}

/**
 * Compute GPS distance from a Data-page location ({name, lat, lng}) to an activity.
 */
export function getGPSDistanceToActivity(loc, activityName, registry) {
  if (!loc || !activityName) return null;
  const actGPS = resolveActivityGPS(activityName, registry);
  if (!actGPS) return null;
  return haversine(loc.lat, loc.lng, actGPS.lat, actGPS.lng);
}

/**
 * Compute lunch-break distance: activityA -> food location -> activityB.
 * Uses the nearest food location to minimize total walk.
 * Returns { total, toFood, fromFood, foodName } or null.
 */
export function getLunchDistance(actA, actB, foodLocations, registry) {
  if (!actA || !actB || !foodLocations?.length) return null;
  const gpsA = resolveActivityGPS(actA, registry);
  const gpsB = resolveActivityGPS(actB, registry);
  if (!gpsA || !gpsB) return null;

  let best = null;
  for (const food of foodLocations) {
    const toFood = haversine(gpsA.lat, gpsA.lng, food.lat, food.lng);
    const fromFood = haversine(food.lat, food.lng, gpsB.lat, gpsB.lng);
    const total = toFood + fromFood;
    if (!best || total < best.total) {
      best = { total, toFood, fromFood, foodName: food.name };
    }
  }
  return best;
}
