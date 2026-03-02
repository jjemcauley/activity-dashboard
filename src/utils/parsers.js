/**
 * parsers.js — Parse the three CSV file types into structured data.
 *
 * Handles the real-world messiness of these files:
 *   - Multi-line cell content (activity names with location on second line)
 *   - Inconsistent naming between files (typos, apostrophes, location suffixes)
 *   - Variable column counts and header positions
 */
import Papa from "papaparse";

// ─────────────────────────────────────────
// Name normalisation
// ─────────────────────────────────────────

/** Join multi-line content, collapse whitespace */
function clean(val) {
  if (val == null) return "";
  return String(val).replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
}

/** Strip parenthetical location info: "Pump Track (The Park)" → "Pump Track" */
function stripLocation(name) {
  return name
    .replace(/\s*\(.*?\)\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Deep normalise for matching: lowercase, strip apostrophes/punctuation, collapse ws */
function normalise(name) {
  return stripLocation(name)
    .toLowerCase()
    .replace(/['''`]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Levenshtein distance */
function levenshtein(a, b) {
  const m = a.length,
    n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
  return dp[m][n];
}

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
  const iLocation = col(/general\s*location|activity.*location/i);
  const iIO = col(/indoor.*outdoor|outdoor.*indoor/i);
  const iIntensity = col(/intensity/i);
  const iValue = col(/customer\s*value|value\s*rating/i);
  const iSetup = col(/setup/i);
  const iStaff = col(/staff/i);
  const iScalable = col(/compress|scal/i);
  const iMaxGroups = col(/max.*activity.*group|max.*group/i);

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
// 4. SIMILARITIES PARSER
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

// ─────────────────────────────────────────
// 5. NAME REGISTRY — cross-file reconciliation
// ─────────────────────────────────────────

/**
 * Build a registry that maps every raw activity name from any file
 * to a canonical entry. Metadata names are the canonical source.
 *
 * Returns: {
 *   canonical: { [canonicalName]: { metadata, aliases: string[] } },
 *   nameMap:   { [anyRawName]: canonicalName },
 *   warnings:  { name, source, issue, suggestion }[]
 * }
 */
export function buildRegistry(
  metadataActivities,
  distanceNames,
  scheduleNames
) {
  const canonical = {}; // canonicalName → { metadata, aliases }
  const nameMap = {}; // anyRawName → canonicalName
  const warnings = [];

  // Step 1: Seed with metadata names (canonical source)
  const metaNames = Object.keys(metadataActivities);
  for (const name of metaNames) {
    canonical[name] = { metadata: metadataActivities[name], aliases: [name] };
    nameMap[name] = name;
  }

  // Step 2: Match distance + schedule names to metadata
  function matchName(rawName, source) {
    if (!rawName || nameMap[rawName]) return; // already mapped

    const normRaw = normalise(rawName);

    // Exact normalised match
    for (const cn of metaNames) {
      if (normalise(cn) === normRaw) {
        canonical[cn].aliases.push(rawName);
        nameMap[rawName] = cn;
        return;
      }
    }

    // Fuzzy match
    let bestDist = Infinity,
      bestMatch = null;
    for (const cn of metaNames) {
      const d = levenshtein(normRaw, normalise(cn));
      if (d < bestDist) {
        bestDist = d;
        bestMatch = cn;
      }
    }

    const threshold = Math.max(3, Math.floor(normRaw.length * 0.3));
    if (bestDist <= threshold && bestMatch) {
      canonical[bestMatch].aliases.push(rawName);
      nameMap[rawName] = bestMatch;
      if (bestDist > 0) {
        warnings.push({
          name: rawName,
          source,
          issue: `Fuzzy-matched (distance: ${bestDist})`,
          suggestion: bestMatch,
        });
      }
      return;
    }

    // No match — register as orphan
    warnings.push({
      name: rawName,
      source,
      issue: "No match in metadata",
      suggestion: null,
    });
    canonical[rawName] = { metadata: null, aliases: [rawName] };
    nameMap[rawName] = rawName;
  }

  for (const dn of distanceNames) matchName(dn, "distances");
  for (const sn of scheduleNames) matchName(sn, "schedule");

  return { canonical, nameMap, warnings };
}

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
    // Find which raw distance-matrix key maps to canonical x
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

  // Try reverse: activity row → start column
  for (const alias of [...new Set(aAliases)]) {
    const row = distMatrix[alias];
    if (row && row[startKey] !== undefined) return row[startKey];
  }

  return null;
}

/**
 * Look up metadata for an activity by any of its names.
 */
export function lookupMeta(rawName, registry) {
  if (!rawName) return null;
  const cn = registry.nameMap[rawName];
  if (!cn) return null;
  return registry.canonical[cn]?.metadata || null;
}

/**
 * Resolve a raw name to its canonical form.
 */
export function resolve(rawName, nameMap) {
  return nameMap[rawName] || rawName;
}

/**
 * Get a short display name for any activity.
 * Uses initials for multi-word prefixes, keeps parenthetical qualifiers for disambiguation.
 * e.g. "High Ropes (Drop Zone)" → "HR (Drop Zone)"
 *      "Photo Scavenger Hunt" → "PSH"
 *      "Indoor Climbing Wall (Field House)" → "ICW"
 *      "Arts n' Crafts" → "A&C"
 */
export function shortName(name) {
  if (!name) return "";

  // Separate base name from parenthetical qualifier
  const parenMatch = name.match(/^(.+?)\s*\((.+?)\)\s*$/);
  const base = parenMatch ? parenMatch[1].trim() : name.trim();
  const qualifier = parenMatch ? parenMatch[2].trim() : null;

  // Special-case mappings for common names (base only, no parens)
  const baseNorm = base
    .toLowerCase()
    .replace(/['''`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const specialCases = {
    "high ropes": "HR",
    "indoor climbing wall": "ICW",
    "photo scavenger hunt": "PSH",
    "scooters & longboards": "S&L",
    "scooters longboards": "S&L",
    "team building games": "TBG",
    "hike the trail": "Hike",
    "arts n crafts": "A&C",
    "arts n  crafts": "A&C",
  };

  let short = specialCases[baseNorm];

  if (!short) {
    // For multi-word names (3+ words), use initials
    const words = base.split(/\s+/).filter((w) => w.length > 0);
    if (words.length >= 3) {
      short = words.map((w) => w[0].toUpperCase()).join("");
    } else {
      // 1-2 word names stay as-is (Broomball, Pickleball, Tennis, Zipline, etc.)
      short = base;
    }
  }

  // Append qualifier if present (keeps "HR (Drop Zone)" distinct from "HR (Blocks)")
  if (qualifier) {
    return `${short} (${qualifier})`;
  }
  return short;
}
