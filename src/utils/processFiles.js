import {
  parseMetadata, parseDistances, parseSchedule, buildRegistry, parseSimilarities,
} from './parsers.js';

/**
 * Process raw CSV texts into the structured data the dashboard needs.
 */
export function processFiles(metaCSV, distCSV, schedCSV, simCSV = null) {
  const metadataActivities = parseMetadata(metaCSV);
  const { matrix: distMatrix, names: distNames, startLocations } = parseDistances(distCSV);
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

  // Parse similarities if provided
  const similarities = simCSV ? parseSimilarities(simCSV) : null;

  return { registry, distMatrix, rotations, timeSlots, daySlices, startLocations, similarities };
}
