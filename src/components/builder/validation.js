import { lookupMeta, shortName } from '../../utils/parsers.js';

export function cloneMatrix(m) { return m.map(row => [...row]); }
export function countInColumn(groups, colIdx, activityName) { let c = 0; for (const row of groups) if (row[colIdx] === activityName) c++; return c; }
export function countInRowForDay(row, dayStart, dayEnd, activityName) { let c = 0; for (let i = dayStart; i < dayEnd; i++) if (row[i] === activityName) c++; return c; }
export function getDaySlice(colIdx, daySlices) { for (const ds of daySlices) if (colIdx >= ds.start && colIdx < ds.end) return ds; return null; }

export function validateMatrix(groups, timeSlots, daySlices, registry, similarities) {
  const errors = [];
  for (let r = 0; r < groups.length; r++) for (let c = 0; c < timeSlots.length; c++) {
    const act = groups[r][c]; if (!act) continue;
    const meta = lookupMeta(act, registry); const ds = getDaySlice(c, daySlices);
    if (meta) { const cc = countInColumn(groups, c, act); if (cc > (meta.maxGroups || 1)) errors.push({ row: r, col: c, type: 'max-groups', severity: 'error', msg: `${shortName(act)} exceeds max concurrent (${cc}/${meta.maxGroups || 1})` }); }
    if (ds) { const dc = countInRowForDay(groups[r], ds.start, ds.end, act); if (dc > 1) errors.push({ row: r, col: c, type: 'day-duplicate', severity: 'error', msg: `${shortName(act)} appears ${dc}x for Group ${r+1} on ${ds.name}` }); }
    if (ds && similarities) { const sg = similarities.activityToGroup?.[act]; if (sg) { let sc = 0; for (let i = ds.start; i < ds.end; i++) if (groups[r][i] && similarities.activityToGroup?.[groups[r][i]] === sg) sc++; if (sc >= 3) errors.push({ row: r, col: c, type: 'similarity', severity: 'warn', msg: `${sc} "${sg}" activities for Group ${r+1} on ${ds.name}` }); } }
  }
  return errors;
}

export function wouldCauseError(groups, row, col, activity, daySlices, registry) {
  const meta = lookupMeta(activity, registry); const ds = getDaySlice(col, daySlices);
  if (meta && countInColumn(groups, col, activity) >= (meta.maxGroups || 1)) return 'max-groups';
  if (ds && countInRowForDay(groups[row], ds.start, ds.end, activity) >= 1) return 'day-duplicate';
  return null;
}

export function validateCrossRotation(groupsA, groupsB, timeSlots, registry) {
  const errs = [];
  for (let c = 0; c < timeSlots.length; c++) {
    const counts = {};
    for (const row of groupsA) if (row[c]) counts[row[c]] = (counts[row[c]] || 0) + 1;
    for (const row of groupsB) if (row[c]) counts[row[c]] = (counts[row[c]] || 0) + 1;
    for (const [act, n] of Object.entries(counts)) { const meta = lookupMeta(act, registry); if (meta && n > (meta.maxGroups || 1)) errs.push({ col: c, msg: `${shortName(act)} used ${n}x in slot ${c+1} across rotations (max: ${meta.maxGroups || 1})` }); }
  }
  return errs;
}
