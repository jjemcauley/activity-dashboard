/**
 * scheduleStats.js — Shared schedule statistics computation.
 *
 * Extracted from Dashboard.jsx and Builder.jsx where identical logic
 * was copy-pasted. Single source of truth for all stats calculations.
 */
import { getDistance, getStartDistance, lookupMeta } from './parsers.js';

/**
 * Parse staff string like "(1/2)", "(4/4)", "(1/2) + float" -> { min, ideal }
 */
export function parseStaff(staffStr) {
  if (!staffStr || !staffStr.trim()) return { min: 0, ideal: 0 };
  const m = staffStr.match(/\((\d+)\s*\/\s*(\d+)\)/);
  if (!m) return { min: 0, ideal: 0 };
  return { min: parseInt(m[1], 10), ideal: parseInt(m[2], 10) };
}

/**
 * Compute per-day stats for a single group (row) within a day slice.
 *
 * Returns: { avgVal, totalDist, maxDist, indoorCount, outdoorCount, name, slots }
 */
export function computeDayStats(group, start, end, registry, distMatrix, startLocation) {
  let valSum = 0, valCount = 0, totalDist = 0, maxDist = 0;
  let indoorCount = 0, outdoorCount = 0;

  for (let c = start; c < end; c++) {
    const act = group[c];
    if (!act) continue;
    const meta = lookupMeta(act, registry);
    if (meta) {
      valSum += meta.value || 0;
      valCount++;
      if (/indoor/i.test(meta.io)) indoorCount++;
      else outdoorCount++;
    }
    if (c > start) {
      const prev = group[c - 1];
      if (prev) {
        const d = getDistance(prev, act, distMatrix, registry.nameMap);
        if (d !== null) {
          totalDist += d;
          maxDist = Math.max(maxDist, d);
        }
      }
    }
  }

  // Add start-location walk if available
  if (startLocation && group[start]) {
    const sd = getStartDistance(startLocation, group[start], distMatrix, registry.nameMap);
    if (sd !== null) {
      totalDist += sd;
      maxDist = Math.max(maxDist, sd);
    }
  }

  return {
    avgVal: valCount ? Math.round(valSum / valCount) : 0,
    totalDist: Math.round(totalDist),
    maxDist: Math.round(maxDist),
    indoorCount,
    outdoorCount,
  };
}

/**
 * Compute overall stats across all day slices for a single group.
 *
 * Returns: { avgVal, totalDist, avgMaxDist, maxDist, indoorCount, uniqueActivities }
 */
export function computeOverallStats(group, daySlices, registry, distMatrix, startLocation) {
  let totalVal = 0, totalCount = 0, totalDist = 0;
  let maxDistOverall = 0, sumMaxDist = 0;
  let indoorCount = 0;
  const unique = new Set();

  for (const ds of daySlices) {
    const s = computeDayStats(group, ds.start, ds.end, registry, distMatrix, startLocation);
    totalVal += s.avgVal * (ds.end - ds.start);
    totalCount += ds.end - ds.start;
    totalDist += s.totalDist;
    sumMaxDist += s.maxDist;
    maxDistOverall = Math.max(maxDistOverall, s.maxDist);
    indoorCount += s.indoorCount;
    for (let c = ds.start; c < ds.end; c++) {
      if (group[c]) unique.add(group[c]);
    }
  }

  return {
    avgVal: totalCount ? Math.round(totalVal / totalCount) : 0,
    totalDist: Math.round(totalDist),
    avgMaxDist: daySlices.length ? Math.round(sumMaxDist / daySlices.length) : 0,
    maxDist: Math.round(maxDistOverall),
    indoorCount,
    uniqueActivities: unique.size,
  };
}

/**
 * Compute table-level averages across all groups in a matrix.
 * Used by Builder's FullTableComparison.
 */
export function computeTableAverages(groups, daySlices, registry, distMatrix, startLocation) {
  if (!groups?.length) return null;

  const perDay = [];
  for (const ds of daySlices) {
    let sumVal = 0, sumDist = 0, sumMaxDist = 0, sumIndoor = 0;
    for (const group of groups) {
      const s = computeDayStats(group, ds.start, ds.end, registry, distMatrix, startLocation);
      sumVal += s.avgVal;
      sumDist += s.totalDist;
      sumMaxDist += s.maxDist;
      sumIndoor += s.indoorCount;
    }
    const n = groups.length;
    perDay.push({
      name: ds.name,
      slots: ds.end - ds.start,
      avgVal: +(sumVal / n).toFixed(1),
      totalDist: Math.round(sumDist / n),
      maxDist: Math.round(sumMaxDist / n),
      indoorCount: +(sumIndoor / n).toFixed(1),
    });
  }

  let oSumVal = 0, oSumDist = 0, oSumMaxDist = 0, oMaxDist = 0;
  let oIndoor = 0, oUnique = 0;
  for (const group of groups) {
    const s = computeOverallStats(group, daySlices, registry, distMatrix, startLocation);
    oSumVal += s.avgVal;
    oSumDist += s.totalDist;
    oSumMaxDist += s.avgMaxDist;
    oMaxDist = Math.max(oMaxDist, s.maxDist);
    oIndoor += s.indoorCount;
    oUnique += s.uniqueActivities;
  }
  const n = groups.length;

  return {
    groupCount: n,
    perDay,
    overall: {
      avgVal: +(oSumVal / n).toFixed(1),
      totalDist: Math.round(oSumDist / n),
      avgMaxDist: Math.round(oSumMaxDist / n),
      maxDist: oMaxDist,
      indoorCount: +(oIndoor / n).toFixed(1),
      uniqueActivities: +(oUnique / n).toFixed(1),
    },
  };
}

/**
 * Escape a value for CSV export.
 */
export function escapeCSV(val) {
  if (val == null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}
