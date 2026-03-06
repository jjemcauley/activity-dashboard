import { parseMetadata, parseSchedule, parseSimilarities, extractSimilarities } from './parsers.js';
import { buildRegistry } from './registry.js';
import { buildDistanceMatrix } from './distanceCalculator.js';

/**
 * Process raw CSV texts into the structured data the dashboard needs.
 * Distance matrix is now computed live from GPS coordinates in the metadata.
 */
export function processFiles(metaCSV, schedCSV, simCSV = null) {
  const metadataActivities = parseMetadata(metaCSV);
  const { matrix: distMatrix, names: distNames } = buildDistanceMatrix(metadataActivities);
  const { rotations, timeSlots, daySlices } = parseSchedule(schedCSV);

  const scheduleNames = new Set();
  for (const rot of rotations) {
    for (const group of rot.groups) {
      for (const a of group) {
        if (a) scheduleNames.add(a);
      }
    }
  }

  const registry = buildRegistry(metadataActivities, distNames, [...scheduleNames]);

  // Extract similarities from metadata (embedded column) or fall back to separate file
  const hasSimilarityData = Object.values(metadataActivities).some(a => a.similarityGroup);
  const similarities = hasSimilarityData
    ? extractSimilarities(metadataActivities)
    : simCSV ? parseSimilarities(simCSV) : null;

  return { registry, distMatrix, rotations, timeSlots, daySlices, similarities };
}
