/**
 * distanceCalculator.js — Compute a distance matrix from GPS coordinates
 * found in the CDS metadata. Uses the Haversine formula to calculate
 * straight-line distances in meters between activity locations.
 */

const EARTH_RADIUS_M = 6_371_000; // metres

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Haversine distance between two GPS points, returned in metres (rounded).
 */
export function haversine(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/**
 * Parse a GPS string like "45.251925, -79.623436" into { lat, lng }.
 * Returns null if unparseable.
 */
function parseGPS(gpsStr) {
  if (!gpsStr) return null;
  const parts = gpsStr.split(',').map(s => parseFloat(s.trim()));
  if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { lat: parts[0], lng: parts[1] };
  }
  return null;
}

/**
 * Build a pairwise distance matrix from parsed metadata activities.
 *
 * @param {Object} metadataActivities — output of parseMetadata(), keyed by activity name
 * @returns {{ matrix, names }} — same shape as parseDistances() (minus startLocations)
 *   matrix: { [nameA]: { [nameB]: distMetres, ... }, ... }
 *   names:  string[]  — all activity names that had valid GPS
 */
export function buildDistanceMatrix(metadataActivities) {
  // Collect activities with valid GPS
  const entries = [];
  for (const [name, meta] of Object.entries(metadataActivities)) {
    const gps = parseGPS(meta.gps);
    if (gps) entries.push({ name, ...gps });
  }

  const names = entries.map(e => e.name);
  const matrix = {};

  for (const a of entries) {
    const row = {};
    for (const b of entries) {
      row[b.name] = haversine(a.lat, a.lng, b.lat, b.lng);
    }
    matrix[a.name] = row;
  }

  return { matrix, names };
}
