/**
 * activityLookup.js — Functions for looking up activity metadata,
 * resolving canonical names, and generating short display names.
 */

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
 * e.g. "High Ropes (Drop Zone)" -> "HR (Drop Zone)"
 *      "Photo Scavenger Hunt" -> "PSH"
 *      "Indoor Climbing Wall (Field House)" -> "ICW"
 *      "Arts n' Crafts" -> "A&C"
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
