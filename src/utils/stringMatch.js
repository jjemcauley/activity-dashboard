/**
 * stringMatch.js — String normalization and similarity functions
 * for cross-file activity name reconciliation.
 */

/** Join multi-line content, collapse whitespace */
export function clean(val) {
  if (val == null) return "";
  return String(val).replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
}

/** Strip parenthetical location info: "Pump Track (The Park)" -> "Pump Track" */
export function stripLocation(name) {
  return name
    .replace(/\s*\(.*?\)\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Deep normalise for matching: lowercase, strip apostrophes/punctuation, collapse ws */
export function normalise(name) {
  return stripLocation(name)
    .toLowerCase()
    .replace(/['''`]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Word-overlap similarity: fraction of shared words (Jaccard-like) */
export function wordOverlap(a, b) {
  const wordsA = new Set(a.split(/\s+/).filter(w => w.length > 0));
  const wordsB = new Set(b.split(/\s+/).filter(w => w.length > 0));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let shared = 0;
  for (const w of wordsA) if (wordsB.has(w)) shared++;
  const smaller = Math.min(wordsA.size, wordsB.size);
  return shared / smaller;
}

/** Levenshtein distance */
export function levenshtein(a, b) {
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
