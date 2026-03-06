/**
 * registry.js — Build a name registry that maps every raw activity name
 * from any file to a canonical entry.
 */
import { normalise, wordOverlap, levenshtein } from './stringMatch.js';

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
  const canonical = {}; // canonicalName -> { metadata, aliases }
  const nameMap = {}; // anyRawName -> canonicalName
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

    // Word-overlap match
    let bestOverlap = 0,
      bestOverlapMatch = null;
    for (const cn of metaNames) {
      const overlap = wordOverlap(normRaw, normalise(cn));
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestOverlapMatch = cn;
      }
    }
    if (bestOverlap >= 0.75 && bestOverlapMatch) {
      canonical[bestOverlapMatch].aliases.push(rawName);
      nameMap[rawName] = bestOverlapMatch;
      warnings.push({
        name: rawName,
        source,
        issue: `Word-overlap matched (${Math.round(bestOverlap * 100)}%)`,
        suggestion: bestOverlapMatch,
      });
      return;
    }

    // Fuzzy match (character-level levenshtein)
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
