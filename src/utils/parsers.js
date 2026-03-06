/**
 * parsers.js — Parse the three CSV file types into structured data.
 *
 * Handles the real-world messiness of these files:
 *   - Multi-line cell content (activity names with location on second line)
 *   - Inconsistent naming between files (typos, apostrophes, location suffixes)
 *   - Variable column counts and header positions
 *
 * This module also re-exports all functions from the split-out utility modules
 * so that existing imports throughout the codebase continue to work.
 */
import Papa from "papaparse";
import { clean } from './stringMatch.js';

// ── Re-exports for backwards compatibility ──────────────
export { clean, stripLocation, normalise, wordOverlap, levenshtein } from './stringMatch.js';
export { buildRegistry } from './registry.js';
export { lookupMeta, resolve, shortName } from './activityLookup.js';
export { getDistance, getStartDistance, getGPSDistanceToActivity, getLunchDistance } from './distanceLookup.js';

// ─────────────────────────────────────────
// 1. METADATA PARSER
// ─────────────────────────────────────────

export function parseMetadata(csvText) {
  const { data } = Papa.parse(csvText, { skipEmptyLines: true });

  // Header is row 0
  const headers = data[0].map(clean);

  function col(pattern) {
    return headers.findIndex((h) => pattern.test(h));
  }

  const iName = col(/activity\s*name/i);
  const iUid = col(/uid/i);
  const iSeason = col(/season/i);
  const iLocation = col(/general\s*location|activity.*location|^zone$/i);
  const iIO = col(/indoor.*outdoor|outdoor.*indoor/i);
  const iIntensity = col(/intensity/i);
  const iValue = col(/customer\s*value|value\s*rating/i);
  const iSetup = col(/setup/i);
  const iStaff = col(/staff/i);
  const iScalable = col(/compress|scal/i);
  const iMaxGroups = col(/max.*activity.*group|max.*group/i);
  const iGPS = col(/gps/i);
  const iLocDesc = col(/location\s*desc/i);
  const iUnique = col(/unique/i);
  const iSimilarity = col(/similarity|grouping/i);

  if (iName === -1)
    throw new Error('Metadata CSV: could not find "Activity Name" column');

  const activities = {};

  for (let i = 1; i < data.length; i++) {
    const row = data[i].map(clean);
    const rawName = row[iName];
    if (!rawName) continue;

    activities[rawName] = {
      rawName,
      uid: iUid >= 0 ? row[iUid] : null,
      season: iSeason >= 0 ? row[iSeason] : "",
      location: iLocation >= 0 ? row[iLocation] : "",
      maxGroups: iMaxGroups >= 0 ? parseInt(row[iMaxGroups], 10) || 1 : 99,
      io: iIO >= 0 ? row[iIO] : "",
      intensity: iIntensity >= 0 ? row[iIntensity] : "",
      value: iValue >= 0 ? parseInt(row[iValue], 10) || 0 : 0,
      setup: iSetup >= 0 ? row[iSetup] : "",
      staff: iStaff >= 0 ? row[iStaff] : "",
      scalable: iScalable >= 0 ? row[iScalable] : "",
      gps: iGPS >= 0 ? row[iGPS] : "",
      locationDesc: iLocDesc >= 0 ? row[iLocDesc] : "",
      unique: iUnique >= 0 ? row[iUnique] : "",
      similarityGroup: iSimilarity >= 0 ? row[iSimilarity] : "",
    };
  }

  return activities;
}

// ─────────────────────────────────────────
// 2. DISTANCE MATRIX PARSER
// ─────────────────────────────────────────

export function parseDistances(csvText) {
  const { data } = Papa.parse(csvText, { skipEmptyLines: true });

  // Row 0 = column headers; col 0 is a label, cols 1+ are activity names
  const colNames = data[0].slice(1).map(clean);

  const matrix = {};

  for (let i = 1; i < data.length; i++) {
    const row = data[i].map(clean);
    const rowName = row[0];
    if (!rowName) continue;

    const dists = {};
    for (let j = 0; j < colNames.length; j++) {
      const d = parseInt(row[j + 1], 10);
      if (!isNaN(d)) dists[colNames[j]] = d;
    }
    matrix[rowName] = dists;
  }

  // Collect all unique names (from both row labels and column headers)
  const allNames = [...new Set([...Object.keys(matrix), ...colNames])];

  // Separate "(start)" entries from regular activity names
  const startLocations = allNames.filter((n) => /^\(start\)/i.test(n.trim()));
  const names = allNames.filter((n) => !/^\(start\)/i.test(n.trim()));

  return { matrix, names, startLocations };
}

// ─────────────────────────────────────────
// 3. SCHEDULE MATRIX PARSER
// ─────────────────────────────────────────

export function parseSchedule(csvText) {
  const { data } = Papa.parse(csvText, { skipEmptyLines: false });

  // --- Find day row (contains "Monday") and time row (contains times) ---
  let dayRowIdx = -1,
    timeRowIdx = -1;
  for (let i = 0; i < Math.min(data.length, 10); i++) {
    const row = data[i].map(clean);
    if (row.some((c) => /^monday$/i.test(c))) dayRowIdx = i;
    if (row.some((c) => /\d{1,2}:\d{2}\s*(AM|PM)/i.test(c))) timeRowIdx = i;
  }
  if (dayRowIdx === -1 || timeRowIdx === -1) {
    throw new Error("Schedule CSV: could not find day/time header rows");
  }

  // --- Build time slots ---
  const dayRow = data[dayRowIdx].map(clean);
  const timeRow = data[timeRowIdx].map(clean);

  // Propagate day names across empty merged cells
  const days = [];
  let curDay = "";
  for (let j = 0; j < dayRow.length; j++) {
    if (/monday|tuesday|wednesday|thursday|friday/i.test(dayRow[j]))
      curDay = dayRow[j];
    days[j] = curDay;
  }

  const timeSlots = [];
  const slotCols = [];
  for (let j = 0; j < timeRow.length; j++) {
    if (/\d{1,2}:\d{2}\s*(AM|PM)/i.test(timeRow[j]) && days[j]) {
      timeSlots.push({ day: days[j], time: timeRow[j] });
      slotCols.push(j);
    }
  }

  // Build day slices
  const daySlices = [];
  let prevDay = "";
  for (let i = 0; i < timeSlots.length; i++) {
    if (timeSlots[i].day !== prevDay) {
      if (daySlices.length) daySlices[daySlices.length - 1].end = i;
      daySlices.push({
        name: timeSlots[i].day,
        start: i,
        end: timeSlots.length,
      });
      prevDay = timeSlots[i].day;
    }
  }
  if (daySlices.length) daySlices[daySlices.length - 1].end = timeSlots.length;

  // --- Parse rotation sections ---
  const rotations = [];
  let currentRot = null;

  for (let i = timeRowIdx + 1; i < data.length; i++) {
    const row = data[i].map(clean);
    const label = row[0].toLowerCase();

    // Detect rotation start
    if (
      /activity\s*rotation|^rotation/i.test(label) &&
      !/backup/i.test(label)
    ) {
      const match = label.match(/rotation\s*([a-z])/i);
      const name = match
        ? match[1].toUpperCase()
        : String.fromCharCode(65 + rotations.length);
      currentRot = { name, groups: [] };
      rotations.push(currentRot);
    }

    // Stop at backup section
    if (/backup/i.test(label)) currentRot = null;

    // Extract group data
    if (currentRot) {
      const groupNum = row[2];
      const n = parseInt(groupNum, 10);
      if (!isNaN(n) && n >= 1 && n <= 99) {
        const activities = slotCols.map((c) => clean(data[i][c]) || "");
        currentRot.groups.push(activities);
      }
    }
  }

  return { rotations, timeSlots, daySlices };
}

// ─────────────────────────────────────────
// 3b. EXTRACT SIMILARITIES FROM METADATA
// ─────────────────────────────────────────

/**
 * Build similarities data from parsed metadata activities (when similarity
 * grouping column is present in the metadata CSV).
 */
export function extractSimilarities(metadataActivities) {
  const groups = {};
  const activityToGroup = {};
  const ungrouped = [];

  for (const [name, meta] of Object.entries(metadataActivities)) {
    const group = meta.similarityGroup;
    if (group) {
      if (!groups[group]) groups[group] = [];
      groups[group].push(name);
      activityToGroup[name] = group;
    } else {
      ungrouped.push(name);
    }
  }

  return { groups, ungrouped, activityToGroup };
}

// ─────────────────────────────────────────
// 4. SIMILARITIES PARSER (legacy separate file)
// ─────────────────────────────────────────

/**
 * Parse the Activity Similarities CSV file.
 * Expected format:
 *   Activity Name, Activity Similarity Grouping
 *   High Ropes (Aerial Trust Dive), High Ropes
 *   High Ropes (Crate Stacking), High Ropes
 *   Tennis, Racquet Sports
 *   ...
 *
 * Returns: {
 *   groups: { [groupName]: string[] },      // groupName -> array of activity names
 *   ungrouped: string[],                     // activities without a group
 *   activityToGroup: { [actName]: string }  // activity name -> group name
 * }
 */
export function parseSimilarities(csvText) {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return { groups: {}, ungrouped: [], activityToGroup: {} };
  }

  // Parse header to find column indices
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const nameIdx = header.findIndex(
    (h) =>
      (h.includes("activity") && h.includes("name")) || h === "activity name"
  );
  const groupIdx = header.findIndex(
    (h) =>
      h.includes("similarity") || h.includes("grouping") || h.includes("group")
  );

  // Fallback to first two columns if headers not found
  const activityCol = nameIdx >= 0 ? nameIdx : 0;
  const groupCol = groupIdx >= 0 ? groupIdx : 1;

  const groups = {}; // groupName -> [activities]
  const activityToGroup = {}; // activityName -> groupName
  const ungrouped = [];

  for (let i = 1; i < lines.length; i++) {
    // Handle CSV parsing with potential commas in quoted fields
    const row = parseCSVRow(lines[i]);
    if (row.length < 2) continue;

    const activityName = row[activityCol]?.trim();
    const groupName = row[groupCol]?.trim();

    if (!activityName) continue;

    if (groupName && groupName.length > 0) {
      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(activityName);
      activityToGroup[activityName] = groupName;
    } else {
      ungrouped.push(activityName);
    }
  }

  return { groups, ungrouped, activityToGroup };
}

/**
 * Simple CSV row parser that handles quoted fields
 */
function parseCSVRow(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);

  return result;
}
