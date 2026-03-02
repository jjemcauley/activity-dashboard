import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  INTENSITY_COLORS, INTENSITY_TEXT, LOCATION_COLORS, DAY_COLORS,
  valueColor, valueTextColor,
} from '../constants/colors.js';
import { getDistance, getStartDistance, lookupMeta, shortName } from '../utils/parsers.js';

const ACCENT = '#f97316';
const ACCENT_DIM = '#f9731640';
const ACCENT_FAINT = '#f9731615';
const ROT_COLORS = { A: '#d4a847', B: '#22d3ee' };
const INTENSITY_BADGE = {
  Intense:  { bg: '#dc262620', color: '#f87171', label: 'INT' },
  Moderate: { bg: '#f59e0b20', color: '#fbbf24', label: 'MOD' },
  Mild:     { bg: '#22c55e20', color: '#34d399', label: 'MLD' },
  Minimal:  { bg: '#6b728020', color: '#9ca3af', label: 'MIN' },
};
const SIMILARITY_COLORS = [
  '#f472b6', '#a78bfa', '#34d399', '#fbbf24', '#22d3ee',
  '#fb923c', '#818cf8', '#f87171', '#2dd4bf', '#e879f9',
];

// Colors for activity groups (distinct from similarity colors)
const GROUP_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#ec4899',
  '#84cc16', '#f43f5e', '#6366f1', '#0ea5e9', '#a855f7',
];

function cloneMatrix(m) { return m.map(row => [...row]); }
function countInColumn(groups, colIdx, activityName) { let c = 0; for (const row of groups) if (row[colIdx] === activityName) c++; return c; }
function countInRowForDay(row, dayStart, dayEnd, activityName) { let c = 0; for (let i = dayStart; i < dayEnd; i++) if (row[i] === activityName) c++; return c; }
function getDaySlice(colIdx, daySlices) { for (const ds of daySlices) if (colIdx >= ds.start && colIdx < ds.end) return ds; return null; }
function parseStaff(staffStr) { if (!staffStr?.trim()) return { min: 0, ideal: 0 }; const m = staffStr.match(/\((\d+)\s*\/\s*(\d+)\)/); return m ? { min: parseInt(m[1], 10), ideal: parseInt(m[2], 10) } : { min: 0, ideal: 0 }; }

function computeDayStats(group, start, end, registry, distMatrix, startLocation) {
  const slice = group.slice(start, end);
  const active = slice.filter(Boolean);
  const vals = active.map(a => lookupMeta(a, registry)?.value ?? 0);
  const avgVal = active.length ? Math.round(vals.reduce((s, v) => s + v, 0) / active.length) : 0;
  let totalDist = 0, maxDist = 0, consecutiveIntense = 0, maxConsecutiveIntense = 0, startDist = null;
  if (startLocation && slice[0]) {
    startDist = getStartDistance(startLocation, slice[0], distMatrix, registry.nameMap);
    if (startDist !== null) { totalDist += startDist; maxDist = Math.max(maxDist, startDist); }
  }
  for (let i = 0; i < slice.length; i++) {
    if (!slice[i]) continue;
    const meta = lookupMeta(slice[i], registry);
    if (meta?.intensity === 'Intense') { consecutiveIntense++; maxConsecutiveIntense = Math.max(maxConsecutiveIntense, consecutiveIntense); } else consecutiveIntense = 0;
    if (i > 0 && slice[i - 1]) { const d = getDistance(slice[i - 1], slice[i], distMatrix, registry.nameMap); if (d !== null) { totalDist += d; maxDist = Math.max(maxDist, d); } }
  }
  const indoorCount = active.filter(a => lookupMeta(a, registry)?.io === 'Indoor').length;
  const intensities = slice.map(a => a ? (lookupMeta(a, registry)?.intensity || 'Unknown') : 'Empty');
  return { avgVal, totalDist, maxDist, maxConsecutiveIntense, indoorCount, intensities, startDist };
}

function computeOverallStats(group, daySlices, registry, distMatrix, startLocation) {
  const dayStats = daySlices.map(d => computeDayStats(group, d.start, d.end, registry, distMatrix, startLocation));
  const active = group.filter(Boolean);
  const vals = active.map(a => lookupMeta(a, registry)?.value ?? 0);
  const avgVal = active.length ? Math.round(vals.reduce((s, v) => s + v, 0) / active.length) : 0;
  const totalDist = dayStats.reduce((s, d) => s + d.totalDist, 0);
  const maxDist = Math.max(...dayStats.map(d => d.maxDist), 0);
  const maxConsecutiveIntense = Math.max(...dayStats.map(d => d.maxConsecutiveIntense), 0);
  const indoorCount = dayStats.reduce((s, d) => s + d.indoorCount, 0);
  const uniqueActivities = new Set(active).size;
  return { avgVal, totalDist, maxDist, maxConsecutiveIntense, indoorCount, uniqueActivities, dayStats };
}

/* Validation */
function validateMatrix(groups, timeSlots, daySlices, registry, similarities) {
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
function wouldCauseError(groups, row, col, activity, daySlices, registry) {
  const meta = lookupMeta(activity, registry); const ds = getDaySlice(col, daySlices);
  if (meta && countInColumn(groups, col, activity) >= (meta.maxGroups || 1)) return 'max-groups';
  if (ds && countInRowForDay(groups[row], ds.start, ds.end, activity) >= 1) return 'day-duplicate';
  return null;
}
function validateCrossRotation(groupsA, groupsB, timeSlots, registry) {
  const errs = [];
  for (let c = 0; c < timeSlots.length; c++) {
    const counts = {};
    for (const row of groupsA) if (row[c]) counts[row[c]] = (counts[row[c]] || 0) + 1;
    for (const row of groupsB) if (row[c]) counts[row[c]] = (counts[row[c]] || 0) + 1;
    for (const [act, n] of Object.entries(counts)) { const meta = lookupMeta(act, registry); if (meta && n > (meta.maxGroups || 1)) errs.push({ col: c, msg: `${shortName(act)} used ${n}x in slot ${c+1} across rotations (max: ${meta.maxGroups || 1})` }); }
  }
  return errs;
}

/* Activity Chip */
function ActivityChip({ name, meta, simGroup, simColorMap, compact, onDragStart, onClick, disabled, style: extraStyle, rotAssign, onRotAssign }) {
  const int = INTENSITY_BADGE[meta?.intensity] || INTENSITY_BADGE.Minimal;
  const sc = simGroup ? (simColorMap[simGroup] || '#666') : null;
  const assignColor = rotAssign === 'A' ? ROT_COLORS.A : rotAssign === 'B' ? ROT_COLORS.B : null;
  return (
    <div draggable={!disabled} onDragStart={e => { if (disabled) return; e.dataTransfer.setData('text/plain', name); e.dataTransfer.effectAllowed = 'copy'; onDragStart?.(name); }}
      onClick={() => !disabled && onClick?.(name)}
      style={{ padding: compact ? '4px 8px' : '6px 10px', borderRadius: 6, background: disabled ? '#1a1f2e80' : '#1a1f2e', border: `1px solid ${assignColor || (disabled ? '#1e263680' : '#2a3040')}`, cursor: disabled ? 'not-allowed' : 'grab', opacity: disabled ? 0.4 : 1, display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.12s', userSelect: 'none', flexShrink: 0, ...extraStyle }}>
      {sc && <div style={{ width: 3, height: compact ? 14 : 18, borderRadius: 2, background: sc, flexShrink: 0 }} />}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: compact ? 10 : 11, fontWeight: 600, color: disabled ? '#555' : '#e8e6e1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: "'DM Sans', sans-serif" }}>{compact ? shortName(name) : name}</div>
        {!compact && <div style={{ display: 'flex', gap: 6, marginTop: 2, fontSize: 9 }}>
          <span style={{ color: int.color, background: int.bg, padding: '0 4px', borderRadius: 3, fontWeight: 600 }}>{int.label}</span>
          <span style={{ color: (meta?.value||0) >= 70 ? '#34d399' : (meta?.value||0) >= 40 ? '#fbbf24' : '#888', fontFamily: "'DM Mono', monospace" }}>V:{meta?.value||'?'}</span>
          {(meta?.maxGroups||1) === 1 && <span style={{ color: '#f472b6', fontWeight: 600 }}>x1</span>}
          {(meta?.maxGroups||1) > 1 && <span style={{ color: '#818cf8', fontWeight: 600 }}>x{meta.maxGroups}</span>}
        </div>}
      </div>
      {/* Rotation assignment buttons */}
      {!compact && onRotAssign && (
        <div style={{ display: 'flex', gap: 2, marginLeft: 'auto', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button
            onClick={(e) => { e.stopPropagation(); onRotAssign(name, 'A'); }}
            style={{
              width: 18, height: 18, borderRadius: 3, fontSize: 9, fontWeight: 700,
              border: `1px solid ${rotAssign === 'A' ? ROT_COLORS.A : '#2a3040'}`,
              background: rotAssign === 'A' ? ROT_COLORS.A : 'transparent',
              color: rotAssign === 'A' ? '#0f1219' : '#555',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            title="Assign to Rotation A only"
          >A</button>
          <button
            onClick={(e) => { e.stopPropagation(); onRotAssign(name, 'B'); }}
            style={{
              width: 18, height: 18, borderRadius: 3, fontSize: 9, fontWeight: 700,
              border: `1px solid ${rotAssign === 'B' ? ROT_COLORS.B : '#2a3040'}`,
              background: rotAssign === 'B' ? ROT_COLORS.B : 'transparent',
              color: rotAssign === 'B' ? '#0f1219' : '#555',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            title="Assign to Rotation B only"
          >B</button>
        </div>
      )}
    </div>
  );
}

/* Matrix Cell */
function MatrixCell({ activity, row, col, errors, meta, simGroup, simColorMap, onDrop, onClear, onMove, dropPreview, registry, daySlices, allGroups, rotLabel, isSelected, onSelectionStart, onSelectionMove, onPaste, hasClipboard, isActivityAllowed, selectedActivity, onClickPlace, groupColor }) {
  const [dragOver, setDragOver] = useState(false);
  const cellErrors = errors.filter(e => e.row === row && e.col === col);
  const hasError = cellErrors.some(e => e.severity === 'error');
  const hasWarn = cellErrors.some(e => e.severity === 'warn');
  const borderColor = isSelected ? '#a78bfa' : hasError ? '#dc2626' : hasWarn ? '#f59e0b' : groupColor ? groupColor : dragOver ? ACCENT : (selectedActivity && !activity) ? ACCENT_DIM : '#1e2636';
  const bgColor = groupColor ? `${groupColor}25` : isSelected ? '#a78bfa20' : hasError ? '#dc262610' : hasWarn ? '#f59e0b08' : dragOver ? ACCENT_FAINT : (selectedActivity && !activity) ? ACCENT_FAINT : '#0f1219';
  const int = activity ? (INTENSITY_BADGE[meta?.intensity] || INTENSITY_BADGE.Minimal) : null;
  const sc = simGroup ? (simColorMap[simGroup] || '#666') : null;
  const blocked = dropPreview && !activity ? (wouldCauseError(allGroups, row, col, dropPreview, daySlices, registry) || (isActivityAllowed && !isActivityAllowed(dropPreview))) : null;
  const clickBlocked = selectedActivity && !activity ? (wouldCauseError(allGroups, row, col, selectedActivity, daySlices, registry) || (isActivityAllowed && !isActivityAllowed(selectedActivity))) : null;
  return (
    <div
      draggable={!!activity}
      onDragStart={e => {
        if (!activity) { e.preventDefault(); return; }
        e.dataTransfer.setData('text/plain', activity);
        e.dataTransfer.setData('application/x-cell', JSON.stringify({ rot: rotLabel, row, col }));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = e.dataTransfer.types.includes('application/x-cell') ? 'move' : 'copy'; setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault(); setDragOver(false);
        const cellData = e.dataTransfer.getData('application/x-cell');
        const act = e.dataTransfer.getData('text/plain');
        if (cellData) {
          // Internal cell drag - move or swap
          const src = JSON.parse(cellData);
          if (src.rot === rotLabel) onMove(src.row, src.col, row, col);
        } else if (act) {
          // Palette drag
          onDrop(row, col, act);
        }
      }}
      onClick={e => {
        // Click-to-place mode
        if (selectedActivity && !activity && !clickBlocked && !e.shiftKey) {
          e.preventDefault();
          onClickPlace?.(row, col, selectedActivity);
        }
      }}
      onMouseDown={e => {
        if (e.button === 0 && e.shiftKey) {
          e.preventDefault();
          onSelectionStart?.(rotLabel, row, col);
        }
      }}
      onMouseEnter={e => {
        if (e.buttons === 1 && e.shiftKey) {
          onSelectionMove?.(rotLabel, row, col);
        }
      }}
      onContextMenu={e => {
        e.preventDefault();
        if (hasClipboard && !activity) {
          onPaste?.(rotLabel, row, col);
        } else if (activity) {
          onClear(row, col);
        }
      }}
      title={cellErrors.length ? cellErrors.map(e => e.msg).join('\n') : activity ? `${activity}\nDrag to move/swap - Right-click to remove` : selectedActivity ? (clickBlocked ? 'Cannot place here' : `Click to place ${shortName(selectedActivity)}`) : hasClipboard ? 'Right-click to paste' : 'Drop here - Shift+drag to select'}
      style={{ minWidth: 88, height: 52, border: `1.5px solid ${borderColor}`, borderRadius: 6, background: bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: activity ? 'grab' : (selectedActivity && !clickBlocked) ? 'pointer' : 'default', transition: 'all 0.1s', position: 'relative', overflow: 'hidden', userSelect: 'none' }}>
      {activity ? <>
        {sc && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: sc }} />}
        <div style={{ textAlign: 'center', padding: '0 6px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#e8e6e1', fontFamily: "'DM Sans', sans-serif", lineHeight: '14px' }}>{shortName(activity)}</div>
          <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginTop: 2 }}>
            {int && <span style={{ fontSize: 8, color: int.color, background: int.bg, padding: '0 3px', borderRadius: 2, fontWeight: 700 }}>{int.label}</span>}
            <span style={{ fontSize: 8, fontFamily: "'DM Mono', monospace", color: (meta?.value||0) >= 70 ? '#34d399' : (meta?.value||0) >= 40 ? '#fbbf24' : '#666' }}>{meta?.value||'?'}</span>
          </div>
        </div>
        {(hasError || hasWarn) && <div style={{ position: 'absolute', top: 2, right: 3, fontSize: 8, fontWeight: 800, color: hasError ? '#dc2626' : '#f59e0b' }}>{hasError ? 'X' : '!'}</div>}
        <div onClick={e => { e.stopPropagation(); onClear(row, col); }} style={{ position: 'absolute', top: 2, left: 4, fontSize: 9, color: '#555', cursor: 'pointer', opacity: 0, transition: 'opacity 0.15s' }} className="cell-clear-btn">x</div>
      </> : <div style={{ fontSize: 18, color: clickBlocked ? '#dc262680' : blocked ? '#dc262680' : dragOver ? ACCENT : selectedActivity ? ACCENT : '#1e2636', fontWeight: 300 }}>{clickBlocked || blocked ? 'X' : '+'}</div>}
    </div>
  );
}

/* Rotation Matrix */
function RotationMatrix({ rotLabel, rotColor, groups, numGroups, timeSlots, daySlices, registry, similarities, simColorMap, errors, dropPreview, onDrop, onClear, onMove, onAddGroup, onRemoveGroup, onCompareRow, isInSelection, onSelectionStart, onSelectionMove, onPaste, hasClipboard, isActivityAllowed, onSave, selectedActivity, onClickPlace, getGroupColor }) {
  const [collapsed, setCollapsed] = useState(false);
  const numCols = timeSlots.length;
  const filledCount = groups.reduce((s, r) => s + r.filter(Boolean).length, 0);
  const totalCells = numGroups * numCols;
  const fillPct = totalCells > 0 ? Math.round((filledCount / totalCells) * 100) : 0;
  const errCount = errors.filter(e => e.severity === 'error').length;
  const wrnCount = errors.filter(e => e.severity === 'warn').length;
  return (
    <div style={{ background: '#141924', borderRadius: 12, border: `1px solid ${rotColor}30`, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', background: `linear-gradient(135deg, ${rotColor}12, transparent)`, borderBottom: `1px solid ${rotColor}25`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setCollapsed(c => !c)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 12, color: rotColor, transition: 'transform 0.2s', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>{'\u25BC'}</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: rotColor, fontFamily: "'Playfair Display', serif" }}>Rotation {rotLabel}</div>
          <div style={{ fontSize: 10, color: '#888', fontFamily: "'DM Mono', monospace" }}>{numGroups} groups x {numCols} slots</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 80, height: 6, borderRadius: 3, background: '#0f1219', overflow: 'hidden' }}>
              <div style={{ width: `${fillPct}%`, height: '100%', borderRadius: 3, background: fillPct === 100 ? '#34d399' : rotColor, transition: 'width 0.3s' }} />
            </div>
            <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: fillPct === 100 ? '#34d399' : '#888' }}>{fillPct}%</span>
          </div>
          {errCount > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', background: '#dc262620', padding: '2px 8px', borderRadius: 4 }}>{errCount} err</span>}
          {wrnCount > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', background: '#f59e0b20', padding: '2px 8px', borderRadius: 4 }}>{wrnCount} wrn</span>}
          {onSave && fillPct === 100 && (
            <button onClick={e => { e.stopPropagation(); onSave(); }} style={{ padding: '4px 12px', borderRadius: 4, border: '1px solid #34d399', background: '#34d39920', color: '#34d399', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
              Save to Dashboard
            </button>
          )}
          <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
            <button onClick={onRemoveGroup} disabled={numGroups <= 1} style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid #2a3040', background: '#0f1219', color: numGroups <= 1 ? '#333' : '#888', cursor: numGroups <= 1 ? 'not-allowed' : 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>-</button>
            <button onClick={onAddGroup} style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid #2a3040', background: '#0f1219', color: '#888', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
          </div>
        </div>
      </div>
      {!collapsed && <div style={{ overflow: 'auto', padding: '12px 16px 16px' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 4 }}>
          <thead>
            <tr>
              <th style={{ minWidth: 48 }} />
              {daySlices.map((ds, di) => <React.Fragment key={ds.name}>{di > 0 && <th style={{ width: 10 }} />}<th colSpan={ds.end - ds.start} style={{ textAlign: 'center', padding: '4px 0', fontSize: 11, fontWeight: 700, color: DAY_COLORS?.[di] || '#888', fontFamily: "'Playfair Display', serif", borderBottom: `3px solid ${DAY_COLORS?.[di] || '#333'}50` }}>{ds.name}</th></React.Fragment>)}
              <th style={{ minWidth: 80 }} />
            </tr>
            <tr>
              <th style={{ fontSize: 9, color: '#555', fontWeight: 600, textAlign: 'center', padding: '4px 6px' }}>GRP</th>
              {timeSlots.map((ts, ci) => { const isNewDay = ci > 0 && daySlices.some(d => d.start === ci); return <React.Fragment key={ci}>{isNewDay && <th style={{ width: 10 }} />}<th style={{ fontSize: 9, color: '#555', fontWeight: 500, textAlign: 'center', padding: '4px 4px', fontFamily: "'DM Mono', monospace", whiteSpace: 'nowrap' }}>{ts.time}</th></React.Fragment>; })}
              <th />
            </tr>
          </thead>
          <tbody>
            {groups.map((row, ri) => {
              const isFilled = row.every(cell => cell && cell.length > 0);
              return (
                <tr key={ri}>
                  <td style={{ fontSize: 11, fontWeight: 700, color: rotColor, textAlign: 'center', padding: '0 8px', fontFamily: "'DM Mono', monospace", whiteSpace: 'nowrap' }}>G{ri + 1}</td>
                  {row.map((act, ci) => {
                    const meta = act ? lookupMeta(act, registry) : null;
                    const sg = act ? similarities?.activityToGroup?.[act] || null : null;
                    const isNewDay = ci > 0 && daySlices.some(d => d.start === ci);
                    const dayIdx = daySlices.findIndex(d => ci >= d.start && ci < d.end);
                    const dayColor = DAY_COLORS?.[dayIdx] || '#333';
                    return <React.Fragment key={ci}>{isNewDay && <td style={{ width: 10, background: `${dayColor}08`, borderLeft: `2px solid ${dayColor}20` }} />}<td style={{ padding: 0 }}><MatrixCell activity={act} row={ri} col={ci} errors={errors} meta={meta} simGroup={sg} simColorMap={simColorMap} onDrop={onDrop} onClear={onClear} onMove={onMove} dropPreview={dropPreview} registry={registry} daySlices={daySlices} allGroups={groups} rotLabel={rotLabel} isSelected={isInSelection?.(rotLabel, ri, ci)} onSelectionStart={onSelectionStart} onSelectionMove={onSelectionMove} onPaste={onPaste} hasClipboard={hasClipboard} isActivityAllowed={isActivityAllowed} selectedActivity={selectedActivity} onClickPlace={onClickPlace} groupColor={getGroupColor?.(rotLabel, ri, ci)} /></td></React.Fragment>;
                  })}
                  <td style={{ padding: '0 4px', verticalAlign: 'middle' }}>
                    {isFilled ? (
                      <button onClick={() => onCompareRow(rotLabel, ri)} style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${ACCENT}50`, background: `linear-gradient(135deg, ${ACCENT}15, ${ACCENT}08)`, color: ACCENT, fontSize: 9, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }} title={`Compare Group ${ri+1}`}>
                        <span style={{ fontSize: 12, lineHeight: 1 }}>&#8660;</span> Compare
                      </button>
                    ) : <div style={{ fontSize: 9, color: '#333', textAlign: 'center', padding: '6px 4px', whiteSpace: 'nowrap' }}>Fill row</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>}
    </div>
  );
}

/* Delta stat for comparison */
function DeltaStat({ label, oldVal, newVal, unit, higherIsBetter }) {
  const delta = newVal - oldVal;
  const improved = higherIsBetter ? delta > 0 : delta < 0;
  const regressed = higherIsBetter ? delta < 0 : delta > 0;
  const dc = delta === 0 ? '#555' : improved ? '#34d399' : regressed ? '#f87171' : '#555';
  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid #1e2636' }}>
      <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
        <div style={{ flex: 1 }}><span style={{ fontSize: 10, color: '#888', marginRight: 4 }}>OLD</span><span style={{ fontSize: 18, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: '#888' }}>{oldVal}{unit||''}</span></div>
        <div style={{ flex: 1 }}><span style={{ fontSize: 10, color: ACCENT, marginRight: 4 }}>NEW</span><span style={{ fontSize: 18, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: '#e8e6e1' }}>{newVal}{unit||''}</span></div>
        <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: dc, minWidth: 60, textAlign: 'right' }}>
          {delta > 0 ? '+' : ''}{delta}{unit||''}{delta !== 0 && <span style={{ fontSize: 10, marginLeft: 3 }}>{improved ? '\u25B2' : '\u25BC'}</span>}
        </div>
      </div>
    </div>
  );
}

/* Schedule strip for comparison view */
function ScheduleStrip({ group, timeSlots, daySlices, registry, distMatrix, startLocation, label, color, colorMode }) {
  const dayBoundaries = new Set(daySlices.map(d => d.start).filter(s => s > 0));
  function getCellStyle(activity) {
    const meta = lookupMeta(activity, registry);
    if (!meta) return { background: '#333', color: '#e74c3c' };
    if (colorMode === 'intensity') return { background: INTENSITY_COLORS[meta.intensity] || '#333', color: INTENSITY_TEXT[meta.intensity] || '#fff' };
    return { background: valueColor(meta.value), color: valueTextColor(meta.value) };
  }
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 8, fontFamily: "'Playfair Display', serif", display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 4, height: 18, borderRadius: 2, background: color }} />{label}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
          <thead>
            <tr>{daySlices.map((d, di) => <React.Fragment key={d.name}>{di > 0 && <th style={{ width: 14 }} />}<th colSpan={d.end - d.start} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: DAY_COLORS?.[d.name] || DAY_COLORS?.[di] || '#888', padding: '4px 0 2px', fontFamily: "'Playfair Display', serif", borderBottom: `2px solid ${(DAY_COLORS?.[d.name] || DAY_COLORS?.[di] || '#555')}30` }}>{d.name}</th></React.Fragment>)}</tr>
            <tr>{timeSlots.map((s, si) => { const nd = dayBoundaries.has(si); return <React.Fragment key={si}>{nd && <th style={{ width: 14 }} />}<th style={{ fontSize: 9, color: '#888', textAlign: 'center', padding: '3px 3px 8px', fontWeight: 500, fontFamily: "'DM Mono', monospace", whiteSpace: 'nowrap' }}>{s.time}</th></React.Fragment>; })}</tr>
          </thead>
          <tbody><tr>{group.map((activity, si) => {
            const meta = lookupMeta(activity, registry); const style = getCellStyle(activity);
            const nd = dayBoundaries.has(si); const fd = daySlices.some(d => d.start === si);
            const dist = (si > 0 && !nd) ? getDistance(group[si-1], activity, distMatrix, registry.nameMap) : null;
            const sd = (fd && startLocation) ? getStartDistance(startLocation, activity, distMatrix, registry.nameMap) : null;
            return <React.Fragment key={si}>{nd && <td style={{ width: 14 }} />}<td style={{ padding: '2px 1px', verticalAlign: 'top', position: 'relative' }}>
              {dist !== null && <div style={{ position: 'absolute', top: '50%', left: -2, transform: 'translate(-50%, -50%)', zIndex: 3 }}><div style={{ fontSize: 8, borderRadius: 3, padding: '1px 3px', fontWeight: 600, fontFamily: "'DM Mono', monospace", color: dist > 600 ? '#dc2626' : dist > 400 ? '#d97706' : dist > 200 ? '#6b7280' : '#059669', background: dist > 600 ? '#fef2f2' : dist > 400 ? '#fffbeb' : dist > 200 ? '#f3f4f6' : '#ecfdf5' }}>{dist}m</div></div>}
              {sd !== null && <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translate(-50%, -50%)', zIndex: 3 }}><div style={{ fontSize: 7, color: '#60a5fa', background: '#112a3d', borderRadius: 3, padding: '1px 3px', fontWeight: 600, fontFamily: "'DM Mono', monospace", whiteSpace: 'nowrap', border: '1px solid #1e3a5f' }}>{'\u25B8'} {sd}m</div></div>}
              <div style={{ ...style, borderRadius: 6, padding: '8px 6px', minHeight: 68, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: meta ? '1px solid transparent' : '1px dashed #e74c3c55' }}>
                <div style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.2, marginBottom: 2 }}>{shortName(activity)}</div>
                {meta && <div style={{ fontSize: 8, opacity: 0.7, marginBottom: 2 }}>{meta.intensity} {'\u00B7'} {meta.io}</div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                  <span style={{ fontSize: 8, opacity: 0.75 }}>{(meta?.location || '').substring(0, 8)}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'DM Mono', monospace", background: 'rgba(0,0,0,0.2)', borderRadius: 3, padding: '1px 5px' }}>{meta?.value ?? '?'}</span>
                </div>
              </div>
            </td></React.Fragment>;
          })}</tr></tbody>
        </table>
      </div>
    </div>
  );
}

/* Day comparison card */
function ComparisonDayCard({ dayName, oldStats, newStats, color, slotCount }) {
  const buildAlerts = s => {
    const a = [];
    if (s.maxDist > 700) a.push({ type: 'error', msg: `Long walk: ${s.maxDist}m` });
    else if (s.maxDist > 500) a.push({ type: 'warn', msg: `Far walk: ${s.maxDist}m` });
    if (s.indoorCount === 0 && slotCount >= 3) a.push({ type: 'info', msg: 'No indoor option' });
    return a;
  };
  const oa = buildAlerts(oldStats), na = buildAlerts(newStats);
  return (
    <div style={{ flex: '1 1 280px', background: '#141924', borderRadius: 10, border: '1px solid #1e2636', padding: 18, minWidth: 260 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{ width: 4, height: 22, borderRadius: 2, background: color }} />
        <h4 style={{ margin: 0, fontSize: 15, fontFamily: "'Playfair Display', serif", color }}>{dayName}</h4>
        <span style={{ fontSize: 10, color: '#555', marginLeft: 'auto' }}>{slotCount} slots</span>
      </div>
      <DeltaStat label="Avg Value" oldVal={oldStats.avgVal} newVal={newStats.avgVal} higherIsBetter={true} />
      <DeltaStat label="Total Walk" oldVal={oldStats.totalDist} newVal={newStats.totalDist} unit="m" higherIsBetter={false} />
      <DeltaStat label="Max Walk" oldVal={oldStats.maxDist} newVal={newStats.maxDist} unit="m" higherIsBetter={false} />
      <DeltaStat label="Indoor" oldVal={oldStats.indoorCount} newVal={newStats.indoorCount} higherIsBetter={true} />
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Intensity Flow</div>
        <div style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 8, color: '#555', marginBottom: 2 }}>OLD</div>
          <div style={{ display: 'flex', gap: 2 }}>{oldStats.intensities.map((int, i) => <div key={i} style={{ flex: 1, height: 7, borderRadius: 3, background: INTENSITY_COLORS[int] || '#333' }} title={int} />)}</div>
        </div>
        <div>
          <div style={{ fontSize: 8, color: ACCENT, marginBottom: 2 }}>NEW</div>
          <div style={{ display: 'flex', gap: 2 }}>{newStats.intensities.map((int, i) => <div key={i} style={{ flex: 1, height: 7, borderRadius: 3, background: INTENSITY_COLORS[int] || '#333' }} title={int} />)}</div>
        </div>
      </div>
      {(oa.length > 0 || na.length > 0) && <div style={{ marginTop: 10 }}>
        {na.map((a, i) => { const isNew = !oa.find(o => o.msg === a.msg); return <div key={`n${i}`} style={{ fontSize: 10, padding: '3px 7px', borderRadius: 3, marginBottom: 2, background: a.type === 'error' ? '#3d1111' : a.type === 'warn' ? '#3d2e11' : '#112a3d', color: a.type === 'error' ? '#f87171' : a.type === 'warn' ? '#fbbf24' : '#60a5fa', borderLeft: `2px solid ${a.type === 'error' ? '#ef4444' : a.type === 'warn' ? '#f59e0b' : '#3b82f6'}`, display: 'flex', alignItems: 'center', gap: 6 }}>{a.msg}{isNew && <span style={{ fontSize: 8, fontWeight: 700, color: '#f97316', background: '#f9731620', padding: '0 4px', borderRadius: 2 }}>NEW</span>}</div>; })}
        {oa.filter(a => !na.find(n => n.msg === a.msg)).map((a, i) => <div key={`r${i}`} style={{ fontSize: 10, padding: '3px 7px', borderRadius: 3, marginBottom: 2, background: '#0f1f0f', color: '#34d399', borderLeft: '2px solid #22c55e', textDecoration: 'line-through', opacity: 0.7 }}>{a.msg} <span style={{ fontSize: 8, fontWeight: 700 }}>RESOLVED</span></div>)}
      </div>}
    </div>
  );
}

/* Comparison View */
function ComparisonView({ newGroup, oldGroup, oldLabel, newLabel, timeSlots, daySlices, registry, distMatrix, startLocation, startLocations, onClose, onChangeOldSource, existingRotations, selectedOldRot, selectedOldGroup }) {
  const [colorMode, setColorMode] = useState('value');
  const [localStart, setLocalStart] = useState(startLocation);
  const oldO = useMemo(() => computeOverallStats(oldGroup, daySlices, registry, distMatrix, localStart), [oldGroup, daySlices, registry, distMatrix, localStart]);
  const newO = useMemo(() => computeOverallStats(newGroup, daySlices, registry, distMatrix, localStart), [newGroup, daySlices, registry, distMatrix, localStart]);
  const oldActs = new Set(oldGroup.filter(Boolean)), newActs = new Set(newGroup.filter(Boolean));
  const added = [...newActs].filter(a => !oldActs.has(a)), removed = [...oldActs].filter(a => !newActs.has(a)), kept = [...newActs].filter(a => oldActs.has(a));

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: '#0f1219', overflowY: 'auto', fontFamily: "'DM Sans', sans-serif" }}>
      {/* Top bar */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'linear-gradient(135deg, #1a1f2e, #0f1219)', borderBottom: `2px solid ${ACCENT}`, padding: '12px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={onClose} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #2a3040', background: '#1a1f2e', color: '#888', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>{'\u2190'} Back to Builder</button>
          <h2 style={{ margin: 0, fontSize: 18, fontFamily: "'Playfair Display', serif", color: ACCENT }}>Group Comparison</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 10, color: '#888', textTransform: 'uppercase' }}>Compare vs:</span>
          {existingRotations.map((rot, ri) => <div key={ri} style={{ display: 'flex', gap: 2 }}>{rot.groups.map((_, gi) => <button key={gi} onClick={() => onChangeOldSource(ri, gi)} style={{ padding: '4px 7px', borderRadius: 4, fontSize: 9, fontWeight: 600, fontFamily: "'DM Mono', monospace", cursor: 'pointer', border: selectedOldRot === ri && selectedOldGroup === gi ? `1px solid ${ACCENT}` : '1px solid #2a3040', background: selectedOldRot === ri && selectedOldGroup === gi ? ACCENT_FAINT : 'transparent', color: selectedOldRot === ri && selectedOldGroup === gi ? ACCENT : '#555' }}>{rot.name}{gi+1}</button>)}</div>)}
          <div style={{ width: 1, height: 24, background: '#2a3040' }} />
          {[{ id: 'value', label: 'Value' }, { id: 'intensity', label: 'Intensity' }].map(m => <button key={m.id} onClick={() => setColorMode(m.id)} style={{ padding: '4px 10px', borderRadius: 4, fontSize: 10, fontWeight: 500, cursor: 'pointer', border: colorMode === m.id ? `1px solid ${ACCENT}` : '1px solid #2a3040', background: colorMode === m.id ? ACCENT_FAINT : 'transparent', color: colorMode === m.id ? ACCENT : '#888' }}>{m.label}</button>)}
          <div style={{ width: 1, height: 24, background: '#2a3040' }} />
          <select value={localStart || ''} onChange={e => setLocalStart(e.target.value || null)} style={{ padding: '4px 8px', borderRadius: 4, fontSize: 10, border: '1px solid #2a3040', background: '#0f1219', color: ACCENT, cursor: 'pointer', fontFamily: "'DM Mono', monospace", maxWidth: 180 }}>
            <option value="">No start</option>
            {(startLocations||[]).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
        {/* Summary banner */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
          {[
            { label: 'Avg Value', old: oldO.avgVal, new: newO.avgVal, u: '', b: true },
            { label: 'Total Walk', old: oldO.totalDist, new: newO.totalDist, u: 'm', b: false },
            { label: 'Max Walk', old: oldO.maxDist, new: newO.maxDist, u: 'm', b: false },
            { label: 'Indoor', old: oldO.indoorCount, new: newO.indoorCount, u: '', b: true },
            { label: 'Unique Activities', old: oldO.uniqueActivities, new: newO.uniqueActivities, u: '', b: true },
          ].map(m => {
            const d = m.new - m.old; const imp = m.b ? d > 0 : d < 0; const reg = m.b ? d < 0 : d > 0;
            return <div key={m.label} style={{ flex: '1 1 160px', padding: '14px 18px', borderRadius: 10, background: '#141924', border: '1px solid #1e2636' }}>
              <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', marginBottom: 6 }}>{m.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, fontFamily: "'DM Mono', monospace", color: '#666' }}>{m.old}{m.u}</span>
                <span style={{ fontSize: 16, color: '#555' }}>{'\u2192'}</span>
                <span style={{ fontSize: 22, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: '#e8e6e1' }}>{m.new}{m.u}</span>
              </div>
              {d !== 0 && <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4, color: imp ? '#34d399' : reg ? '#f87171' : '#555', fontFamily: "'DM Mono', monospace" }}>{d > 0 ? '+' : ''}{d}{m.u} {imp ? '\u25B2' : '\u25BC'}</div>}
            </div>;
          })}
        </div>

        {/* Activity diff */}
        <div style={{ padding: '16px 20px', borderRadius: 10, marginBottom: 24, background: '#141924', border: '1px solid #1e2636' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#e8e6e1', fontFamily: "'Playfair Display', serif", marginBottom: 12 }}>Activity Changes</div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {added.length > 0 && <div><div style={{ fontSize: 9, color: '#34d399', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>+ Added ({added.length})</div><div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{added.map(a => { const m = lookupMeta(a, registry); return <div key={a} style={{ padding: '4px 10px', borderRadius: 5, fontSize: 10, fontWeight: 600, background: '#34d39915', border: '1px solid #34d39930', color: '#34d399' }}>{shortName(a)} <span style={{ fontFamily: "'DM Mono', monospace", opacity: 0.7 }}>V:{m?.value||'?'}</span></div>; })}</div></div>}
            {removed.length > 0 && <div><div style={{ fontSize: 9, color: '#f87171', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>- Removed ({removed.length})</div><div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{removed.map(a => { const m = lookupMeta(a, registry); return <div key={a} style={{ padding: '4px 10px', borderRadius: 5, fontSize: 10, fontWeight: 600, background: '#f8717115', border: '1px solid #f8717130', color: '#f87171', textDecoration: 'line-through' }}>{shortName(a)} <span style={{ fontFamily: "'DM Mono', monospace", opacity: 0.7 }}>V:{m?.value||'?'}</span></div>; })}</div></div>}
            {kept.length > 0 && <div><div style={{ fontSize: 9, color: '#888', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>Retained ({kept.length})</div><div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{kept.map(a => <div key={a} style={{ padding: '4px 10px', borderRadius: 5, fontSize: 10, fontWeight: 500, background: '#1a1f2e', border: '1px solid #2a3040', color: '#888' }}>{shortName(a)}</div>)}</div></div>}
            {!added.length && !removed.length && <div style={{ fontSize: 11, color: '#34d399' }}>Identical activities - only ordering differs.</div>}
          </div>
        </div>

        {/* Schedule strips */}
        <div style={{ marginBottom: 28 }}><ScheduleStrip group={oldGroup} timeSlots={timeSlots} daySlices={daySlices} registry={registry} distMatrix={distMatrix} startLocation={localStart} label={oldLabel} color="#888" colorMode={colorMode} /></div>
        <div style={{ marginBottom: 28 }}><ScheduleStrip group={newGroup} timeSlots={timeSlots} daySlices={daySlices} registry={registry} distMatrix={distMatrix} startLocation={localStart} label={newLabel} color={ACCENT} colorMode={colorMode} /></div>

        {/* Per-day breakdown */}
        <h3 style={{ fontSize: 15, fontFamily: "'Playfair Display', serif", color: ACCENT, marginBottom: 14 }}>Day-by-Day Comparison</h3>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
          {daySlices.map((d, di) => <ComparisonDayCard key={d.name} dayName={d.name} oldStats={oldO.dayStats[di]} newStats={newO.dayStats[di]} color={DAY_COLORS?.[d.name] || DAY_COLORS?.[di] || '#888'} slotCount={d.end - d.start} />)}
        </div>

        {/* Slot diff */}
        <h3 style={{ fontSize: 15, fontFamily: "'Playfair Display', serif", color: ACCENT, marginBottom: 14 }}>Slot-by-Slot Diff</h3>
        <div style={{ overflowX: 'auto', background: '#141924', borderRadius: 10, border: '1px solid #1e2636', padding: 16 }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 2, width: '100%' }}>
            <thead><tr><th style={{ fontSize: 9, color: '#555', textAlign: 'left', padding: '4px 8px', minWidth: 40 }} />{timeSlots.map((ts, i) => { const ds = getDaySlice(i, daySlices); const isF = daySlices.some(d => d.start === i); return <th key={i} style={{ fontSize: 8, color: '#555', textAlign: 'center', padding: '3px 2px', fontFamily: "'DM Mono', monospace", whiteSpace: 'nowrap', borderLeft: isF && i > 0 ? '2px solid #2a3040' : 'none' }}><div style={{ fontSize: 7, color: '#444' }}>{ds?.name?.substring(0, 3)}</div>{ts.time}</th>; })}</tr></thead>
            <tbody>
              <tr><td style={{ fontSize: 9, color: '#888', fontWeight: 600, padding: '4px 8px' }}>OLD</td>{oldGroup.map((act, i) => { const ch = act !== newGroup[i]; const isF = daySlices.some(d => d.start === i); return <td key={i} style={{ padding: 2, textAlign: 'center', borderLeft: isF && i > 0 ? '2px solid #2a3040' : 'none' }}><div style={{ fontSize: 9, fontWeight: 600, padding: '6px 4px', borderRadius: 4, background: ch ? '#f8717110' : '#1a1f2e', color: ch ? '#f87171' : '#888', border: ch ? '1px solid #f8717125' : '1px solid #1e2636' }}>{shortName(act) || '\u2014'}</div></td>; })}</tr>
              <tr><td style={{ fontSize: 9, color: ACCENT, fontWeight: 600, padding: '4px 8px' }}>NEW</td>{newGroup.map((act, i) => { const ch = act !== oldGroup[i]; const isF = daySlices.some(d => d.start === i); return <td key={i} style={{ padding: 2, textAlign: 'center', borderLeft: isF && i > 0 ? '2px solid #2a3040' : 'none' }}><div style={{ fontSize: 9, fontWeight: 600, padding: '6px 4px', borderRadius: 4, background: ch ? `${ACCENT}15` : '#1a1f2e', color: ch ? ACCENT : '#888', border: ch ? `1px solid ${ACCENT}30` : '1px solid #1e2636' }}>{shortName(act) || '\u2014'}</div></td>; })}</tr>
              <tr><td style={{ fontSize: 8, color: '#555', padding: '2px 8px' }}>{'\u0394'}</td>{newGroup.map((act, i) => { const same = act === oldGroup[i]; const isF = daySlices.some(d => d.start === i); return <td key={i} style={{ textAlign: 'center', padding: 2, borderLeft: isF && i > 0 ? '2px solid #2a3040' : 'none' }}><div style={{ fontSize: 10, fontWeight: 700, color: same ? '#333' : ACCENT }}>{same ? '\u00B7' : '\u2260'}</div></td>; })}</tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* Error Summary */
function ErrorSummary({ errorsA, errorsB }) {
  const all = [...errorsA.map(e => ({ ...e, rot: 'A' })), ...errorsB.map(e => ({ ...e, rot: 'B' }))];
  if (!all.length) return null;
  return (
    <div style={{ background: '#141924', borderRadius: 10, border: '1px solid #1e2636', padding: 16, marginTop: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#e8e6e1', fontFamily: "'Playfair Display', serif", marginBottom: 10 }}>Validation Issues ({all.length})</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflow: 'auto' }}>
        {all.filter(e => e.severity === 'error').map((e, i) => <div key={`e${i}`} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 4, background: '#dc262612', color: '#f87171', display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ fontSize: 9, fontWeight: 700, background: ROT_COLORS[e.rot] + '30', color: ROT_COLORS[e.rot], padding: '0 5px', borderRadius: 3 }}>Rot {e.rot}</span><span style={{ fontWeight: 600 }}>G{e.row+1}</span><span style={{ color: '#f8717199' }}>{e.msg}</span></div>)}
        {all.filter(e => e.severity === 'warn').map((e, i) => <div key={`w${i}`} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 4, background: '#f59e0b08', color: '#fbbf24', display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ fontSize: 9, fontWeight: 700, background: ROT_COLORS[e.rot] + '30', color: ROT_COLORS[e.rot], padding: '0 5px', borderRadius: 3 }}>Rot {e.rot}</span><span style={{ fontWeight: 600 }}>G{e.row+1}</span><span style={{ color: '#fbbf2499' }}>{e.msg}</span></div>)}
      </div>
    </div>
  );
}

/* ===================== FULL TABLE COMPARISON ===================== */

function computeTableAverages(groups, daySlices, registry, distMatrix, startLocation) {
  const allOverall = groups.map(g => computeOverallStats(g, daySlices, registry, distMatrix, startLocation));
  const n = allOverall.length || 1;
  const avg = (arr, key) => Math.round(arr.reduce((s, o) => s + o[key], 0) / n);
  const avgF = (arr, key) => +(arr.reduce((s, o) => s + o[key], 0) / n).toFixed(1);

  const overall = {
    avgVal: avg(allOverall, 'avgVal'),
    totalDist: avg(allOverall, 'totalDist'),
    maxDist: Math.round(Math.max(...allOverall.map(o => o.maxDist))),
    avgMaxDist: avg(allOverall, 'maxDist'),
    indoorCount: avgF(allOverall, 'indoorCount'),
    uniqueActivities: avgF(allOverall, 'uniqueActivities'),
  };

  const perDay = daySlices.map((ds, di) => {
    const dayData = allOverall.map(o => o.dayStats[di]);
    return {
      name: ds.name,
      slots: ds.end - ds.start,
      avgVal: avg(dayData, 'avgVal'),
      totalDist: avg(dayData, 'totalDist'),
      maxDist: avg(dayData, 'maxDist'),
      indoorCount: avgF(dayData, 'indoorCount'),
    };
  });

  return { overall, perDay, groupCount: groups.length };
}

function TableComparisonRow({ label, oldVal, newVal, unit, higherIsBetter, format }) {
  const fmt = format || (v => v);
  const delta = typeof newVal === 'number' && typeof oldVal === 'number' ? +(newVal - oldVal).toFixed(1) : 0;
  const improved = higherIsBetter ? delta > 0 : delta < 0;
  const regressed = higherIsBetter ? delta < 0 : delta > 0;
  const dc = delta === 0 ? '#555' : improved ? '#34d399' : regressed ? '#f87171' : '#555';
  return (
    <tr>
      <td style={{ padding: '8px 12px', fontSize: 11, color: '#888', borderBottom: '1px solid #1e2636' }}>{label}</td>
      <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600, fontFamily: "'DM Mono', monospace", color: '#888', textAlign: 'center', borderBottom: '1px solid #1e2636' }}>{fmt(oldVal)}{unit || ''}</td>
      <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: '#e8e6e1', textAlign: 'center', borderBottom: '1px solid #1e2636' }}>{fmt(newVal)}{unit || ''}</td>
      <td style={{ padding: '8px 12px', fontSize: 12, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: dc, textAlign: 'center', borderBottom: '1px solid #1e2636' }}>
        {delta !== 0 ? `${delta > 0 ? '+' : ''}${fmt(delta)}${unit || ''}` : '\u2014'}
        {delta !== 0 && <span style={{ marginLeft: 4, fontSize: 9 }}>{improved ? '\u25B2' : '\u25BC'}</span>}
      </td>
    </tr>
  );
}

function FullTableComparison({ groupsA, groupsB, statsA, statsB, rotations, registry, distMatrix, daySlices, timeSlots, startLocations }) {
  const aFull = statsA.pct === 100;
  const bFull = statsB.pct === 100;
  if (!aFull && !bFull) return null;
  if (!rotations?.length) return null;

  const startLoc = startLocations?.[0] || null;

  // Dashboard averages per rotation
  const dashStats = rotations.map(rot => ({
    name: rot.name,
    ...computeTableAverages(rot.groups, daySlices, registry, distMatrix, startLoc),
  }));

  // Builder averages
  const builderA = aFull ? computeTableAverages(groupsA, daySlices, registry, distMatrix, startLoc) : null;
  const builderB = bFull ? computeTableAverages(groupsB, daySlices, registry, distMatrix, startLoc) : null;

  const pairs = [];
  if (builderA && dashStats[0]) pairs.push({ label: 'A', builderStats: builderA, dashStat: dashStats[0], color: ROT_COLORS.A });
  if (builderB && dashStats[dashStats.length > 1 ? 1 : 0]) pairs.push({ label: 'B', builderStats: builderB, dashStat: dashStats[dashStats.length > 1 ? 1 : 0], color: ROT_COLORS.B });

  return (
    <div style={{ marginTop: 28 }}>
      <h3 style={{ fontSize: 16, fontFamily: "'Playfair Display', serif", color: ACCENT, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 4, height: 22, borderRadius: 2, background: ACCENT }} />
        Full Table Comparison
        <span style={{ fontSize: 10, fontWeight: 400, color: '#555', fontFamily: "'DM Sans', sans-serif", marginLeft: 8 }}>Averages across all groups</span>
      </h3>

      {pairs.map(({ label, builderStats, dashStat, color }) => (
        <div key={label} style={{ background: '#141924', borderRadius: 12, border: `1px solid ${color}30`, overflow: 'hidden', marginBottom: 20 }}>
          {/* Header */}
          <div style={{ padding: '12px 20px', background: `linear-gradient(135deg, ${color}10, transparent)`, borderBottom: `1px solid ${color}20`, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color, fontFamily: "'Playfair Display', serif" }}>
              Rotation {label}
            </div>
            <span style={{ fontSize: 10, color: '#666', fontFamily: "'DM Mono', monospace" }}>
              Dashboard ({dashStat.groupCount} groups) vs Builder ({builderStats.groupCount} groups)
            </span>
          </div>

          <div style={{ padding: '0 8px 16px' }}>
            {/* Overall averages table */}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ padding: '10px 12px', fontSize: 9, color: '#555', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'left', borderBottom: '2px solid #2a3040' }}>Metric</th>
                  <th style={{ padding: '10px 12px', fontSize: 9, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center', borderBottom: '2px solid #2a3040' }}>Dashboard</th>
                  <th style={{ padding: '10px 12px', fontSize: 9, color: ACCENT, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center', borderBottom: '2px solid #2a3040' }}>Builder</th>
                  <th style={{ padding: '10px 12px', fontSize: 9, color: '#555', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center', borderBottom: '2px solid #2a3040' }}>Delta</th>
                </tr>
              </thead>
              <tbody>
                <TableComparisonRow label="Avg Value (all groups)" oldVal={dashStat.overall.avgVal} newVal={builderStats.overall.avgVal} higherIsBetter={true} />
                <TableComparisonRow label="Avg Total Walk / group" oldVal={dashStat.overall.totalDist} newVal={builderStats.overall.totalDist} unit="m" higherIsBetter={false} />
                <TableComparisonRow label="Avg Max Single Walk" oldVal={dashStat.overall.avgMaxDist} newVal={builderStats.overall.avgMaxDist} unit="m" higherIsBetter={false} />
                <TableComparisonRow label="Worst Max Walk (any group)" oldVal={dashStat.overall.maxDist} newVal={builderStats.overall.maxDist} unit="m" higherIsBetter={false} />
                <TableComparisonRow label="Avg Indoor / group" oldVal={dashStat.overall.indoorCount} newVal={builderStats.overall.indoorCount} higherIsBetter={true} />
                <TableComparisonRow label="Avg Unique Activities / group" oldVal={dashStat.overall.uniqueActivities} newVal={builderStats.overall.uniqueActivities} higherIsBetter={true} />
              </tbody>
            </table>

            {/* Per-day breakdown */}
            <div style={{ marginTop: 16, fontSize: 11, fontWeight: 700, color: '#888', padding: '0 12px 8px', fontFamily: "'Playfair Display', serif" }}>Per Day</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ padding: '6px 12px', fontSize: 9, color: '#555', textAlign: 'left', borderBottom: '1px solid #2a3040' }}>Day</th>
                  <th colSpan={2} style={{ padding: '6px 12px', fontSize: 9, color: '#555', textAlign: 'center', borderBottom: '1px solid #2a3040' }}>Avg Value</th>
                  <th colSpan={2} style={{ padding: '6px 12px', fontSize: 9, color: '#555', textAlign: 'center', borderBottom: '1px solid #2a3040' }}>Avg Walk</th>
                  <th colSpan={2} style={{ padding: '6px 12px', fontSize: 9, color: '#555', textAlign: 'center', borderBottom: '1px solid #2a3040' }}>Avg Max Walk</th>
                  <th colSpan={2} style={{ padding: '6px 12px', fontSize: 9, color: '#555', textAlign: 'center', borderBottom: '1px solid #2a3040' }}>Avg Indoor</th>
                </tr>
                <tr>
                  <th />
                  {['Avg Value', 'Avg Walk', 'Avg Max Walk', 'Avg Indoor'].map(h => <React.Fragment key={h}>
                    <th style={{ padding: '4px 6px', fontSize: 8, color: '#666', textAlign: 'center' }}>Dash</th>
                    <th style={{ padding: '4px 6px', fontSize: 8, color: ACCENT, textAlign: 'center' }}>Build</th>
                  </React.Fragment>)}
                </tr>
              </thead>
              <tbody>
                {dashStat.perDay.map((dd, di) => {
                  const bd = builderStats.perDay[di];
                  if (!bd) return null;
                  const dayColor = DAY_COLORS?.[di] || '#888';
                  const cell = (oldV, newV, unit, hib) => {
                    const d = +(newV - oldV).toFixed(1);
                    const imp = hib ? d > 0 : d < 0;
                    const reg = hib ? d < 0 : d > 0;
                    return <>
                      <td style={{ padding: '6px 6px', fontSize: 11, fontFamily: "'DM Mono', monospace", color: '#888', textAlign: 'center', borderBottom: '1px solid #1e2636' }}>{oldV}{unit||''}</td>
                      <td style={{ padding: '6px 6px', fontSize: 11, fontFamily: "'DM Mono', monospace", fontWeight: 600, color: d === 0 ? '#888' : imp ? '#34d399' : reg ? '#f87171' : '#e8e6e1', textAlign: 'center', borderBottom: '1px solid #1e2636' }}>{newV}{unit||''}{d !== 0 && <span style={{ fontSize: 8, marginLeft: 2 }}>{imp ? '\u25B2' : '\u25BC'}</span>}</td>
                    </>;
                  };
                  return (
                    <tr key={dd.name}>
                      <td style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, color: dayColor, borderBottom: '1px solid #1e2636', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-block', width: 3, height: 12, borderRadius: 1, background: dayColor, marginRight: 6, verticalAlign: 'middle' }} />
                        {dd.name} <span style={{ fontSize: 9, color: '#555', fontWeight: 400 }}>({dd.slots})</span>
                      </td>
                      {cell(dd.avgVal, bd.avgVal, '', true)}
                      {cell(dd.totalDist, bd.totalDist, 'm', false)}
                      {cell(dd.maxDist, bd.maxDist, 'm', false)}
                      {cell(dd.indoorCount, bd.indoorCount, '', true)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ===================== MAIN BUILDER ===================== */
export default function Builder({ registry, distMatrix, timeSlots, daySlices, similarities, startLocations, rotations, onSave, persistedState, onStateChange }) {
  const numCols = timeSlots.length;
  const defaultGC = rotations?.[0]?.groups?.length || 11;
  
  // Initialize from persisted state or defaults
  const [numGroupsA, setNumGroupsA] = useState(() => persistedState?.numGroupsA ?? defaultGC);
  const [numGroupsB, setNumGroupsB] = useState(() => persistedState?.numGroupsB ?? defaultGC);
  const [groupsA, setGroupsA] = useState(() => persistedState?.groupsA ?? Array.from({ length: defaultGC }, () => Array(numCols).fill('')));
  const [groupsB, setGroupsB] = useState(() => persistedState?.groupsB ?? Array.from({ length: defaultGC }, () => Array(numCols).fill('')));
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [dropPreview, setDropPreview] = useState(null);
  const [paletteFilter, setPaletteFilter] = useState('');
  const [paletteSort, setPaletteSort] = useState(() => persistedState?.paletteSort ?? 'value');
  const [paletteSimilarity, setPaletteSimilarity] = useState(() => persistedState?.paletteSimilarity ?? 'all');
  const [showCrossValidation, setShowCrossValidation] = useState(() => persistedState?.showCrossValidation ?? true);
  const [undoStack, setUndoStack] = useState(() => persistedState?.undoStack ?? []);
  const [compareView, setCompareView] = useState(null);
  const [compareOldRot, setCompareOldRot] = useState(0);
  const [compareOldGroup, setCompareOldGroup] = useState(0);
  
  // Feature 1: Rotation assignment for activities
  // activityRotationAssignment: { activityName: 'A' | 'B' | 'both' | null }
  const [activityRotAssign, setActivityRotAssign] = useState(() => persistedState?.activityRotAssign ?? {});
  const [paletteRotFilter, setPaletteRotFilter] = useState(() => persistedState?.paletteRotFilter ?? 'all'); // 'all', 'A', 'B', 'unassigned'
  
  // Feature 2: Copy/Paste with selection
  const [clipboard, setClipboard] = useState(() => persistedState?.clipboard ?? null);
  const [selectionStart, setSelectionStart] = useState(null); // { rot, row, col }
  const [selectionEnd, setSelectionEnd] = useState(null); // { rot, row, col }
  const [isSelecting, setIsSelecting] = useState(false);
  
  // Feature 3: Cell Groups - group cells together for copy/paste as a unit
  // cellGroups: { [groupId]: { color: string, cells: [{rot, row, col}] } }
  const [cellGroups, setCellGroups] = useState(() => persistedState?.cellGroups ?? {});
  const [nextGroupId, setNextGroupId] = useState(() => persistedState?.nextGroupId ?? 1);
  
  // Persist state changes back to parent
  useEffect(() => {
    if (onStateChange) {
      onStateChange({
        numGroupsA,
        numGroupsB,
        groupsA,
        groupsB,
        paletteSort,
        paletteSimilarity,
        showCrossValidation,
        undoStack,
        activityRotAssign,
        paletteRotFilter,
        clipboard,
        cellGroups,
        nextGroupId,
      });
    }
  }, [numGroupsA, numGroupsB, groupsA, groupsB, paletteSort, paletteSimilarity, showCrossValidation, undoStack, activityRotAssign, paletteRotFilter, clipboard, cellGroups, nextGroupId, onStateChange]);

  const activityList = useMemo(() => { const l = []; for (const [n, e] of Object.entries(registry.canonical)) if (e.metadata) l.push({ name: n, meta: e.metadata, simGroup: similarities?.activityToGroup?.[n] || null }); return l; }, [registry, similarities]);
  const simColorMap = useMemo(() => { if (!similarities) return {}; const m = {}; Object.keys(similarities.groups).sort().forEach((g, i) => { m[g] = SIMILARITY_COLORS[i % SIMILARITY_COLORS.length]; }); return m; }, [similarities]);
  const simGroups = useMemo(() => similarities ? Object.keys(similarities.groups).sort() : [], [similarities]);

  const filteredActivities = useMemo(() => {
    let l = [...activityList];
    if (paletteFilter) { const f = paletteFilter.toLowerCase(); l = l.filter(a => a.name.toLowerCase().includes(f) || shortName(a.name).toLowerCase().includes(f)); }
    if (paletteSimilarity !== 'all') l = paletteSimilarity === 'none' ? l.filter(a => !a.simGroup) : l.filter(a => a.simGroup === paletteSimilarity);
    // Filter by rotation assignment
    if (paletteRotFilter !== 'all') {
      l = l.filter(a => {
        const assign = activityRotAssign[a.name];
        if (paletteRotFilter === 'unassigned') return !assign || assign === 'both';
        if (paletteRotFilter === 'A') return assign === 'A' || assign === 'both' || !assign;
        if (paletteRotFilter === 'B') return assign === 'B' || assign === 'both' || !assign;
        return true;
      });
    }
    l.sort((a, b) => {
      if (paletteSort === 'value') return (b.meta.value||0) - (a.meta.value||0);
      if (paletteSort === 'name') return a.name.localeCompare(b.name);
      if (paletteSort === 'intensity') { const o = { Intense: 0, Moderate: 1, Mild: 2, Minimal: 3 }; return (o[a.meta.intensity]??4) - (o[b.meta.intensity]??4); }
      if (paletteSort === 'group') return (a.simGroup||'zzz').localeCompare(b.simGroup||'zzz') || (b.meta.value||0) - (a.meta.value||0);
      return 0;
    });
    return l;
  }, [activityList, paletteFilter, paletteSort, paletteSimilarity, paletteRotFilter, activityRotAssign]);
  
  // Check if activity is allowed for a rotation based on assignment
  const isActivityAllowedForRot = useCallback((activityName, rot) => {
    const assign = activityRotAssign[activityName];
    if (!assign || assign === 'both') return true;
    return assign === rot;
  }, [activityRotAssign]);
  
  // Handle rotation assignment change
  const handleRotAssign = useCallback((activityName, rot) => {
    setActivityRotAssign(prev => {
      const current = prev[activityName];
      if (current === rot) {
        // Toggle off - remove assignment
        const next = { ...prev };
        delete next[activityName];
        return next;
      }
      return { ...prev, [activityName]: rot };
    });
  }, []);
  
  // Selection helpers
  const getSelectionBounds = useCallback(() => {
    if (!selectionStart || !selectionEnd || selectionStart.rot !== selectionEnd.rot) return null;
    return {
      rot: selectionStart.rot,
      minRow: Math.min(selectionStart.row, selectionEnd.row),
      maxRow: Math.max(selectionStart.row, selectionEnd.row),
      minCol: Math.min(selectionStart.col, selectionEnd.col),
      maxCol: Math.max(selectionStart.col, selectionEnd.col),
    };
  }, [selectionStart, selectionEnd]);
  
  const isInSelection = useCallback((rot, row, col) => {
    const bounds = getSelectionBounds();
    if (!bounds || bounds.rot !== rot) return false;
    return row >= bounds.minRow && row <= bounds.maxRow && col >= bounds.minCol && col <= bounds.maxCol;
  }, [getSelectionBounds]);

  // Get group for a specific cell (needed before handleCopy)
  const getGroupForCell = useCallback((rot, row, col) => {
    for (const [groupId, group] of Object.entries(cellGroups)) {
      if (group.cells.some(c => c.rot === rot && c.row === row && c.col === col)) {
        return { groupId, ...group };
      }
    }
    return null;
  }, [cellGroups]);
  
  // Copy selection to clipboard
  const handleCopy = useCallback(() => {
    const bounds = getSelectionBounds();
    if (!bounds) return;
    const groups = bounds.rot === 'A' ? groupsA : groupsB;
    const cells = [];
    
    // Check if all selected cells belong to the same group
    let commonGroupColor = null;
    let allInSameGroup = true;
    
    for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
      for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
        cells.push({ row: r - bounds.minRow, col: c - bounds.minCol, activity: groups[r]?.[c] || '' });
        
        // Check group membership
        const cellGroup = getGroupForCell(bounds.rot, r, c);
        if (cellGroup) {
          if (commonGroupColor === null) {
            commonGroupColor = cellGroup.color;
          } else if (commonGroupColor !== cellGroup.color) {
            allInSameGroup = false;
          }
        } else {
          // Cell not in any group
          if (commonGroupColor !== null) {
            allInSameGroup = false;
          }
        }
      }
    }
    
    setClipboard({
      rot: bounds.rot,
      cells,
      width: bounds.maxCol - bounds.minCol + 1,
      height: bounds.maxRow - bounds.minRow + 1,
      isGroup: allInSameGroup && commonGroupColor !== null,
      groupColor: allInSameGroup ? commonGroupColor : null,
    });
  }, [getSelectionBounds, groupsA, groupsB, getGroupForCell]);
  
  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectionStart(null);
    setSelectionEnd(null);
    setIsSelecting(false);
  }, []);

  // Cell Groups helper functions
  const getUsedColors = useCallback(() => {
    return new Set(Object.values(cellGroups).map(g => g.color));
  }, [cellGroups]);

  const getNextGroupColor = useCallback(() => {
    const used = getUsedColors();
    for (const color of GROUP_COLORS) {
      if (!used.has(color)) return color;
    }
    // All colors used, pick a random one
    return GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)];
  }, [getUsedColors]);

  const getGroupColor = useCallback((rot, row, col) => {
    const group = getGroupForCell(rot, row, col);
    return group?.color || null;
  }, [getGroupForCell]);

  const handleCreateGroup = useCallback(() => {
    const bounds = getSelectionBounds();
    if (!bounds) return;
    
    const cells = [];
    for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
      for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
        cells.push({ rot: bounds.rot, row: r, col: c });
      }
    }
    
    // Remove these cells from any existing groups
    setCellGroups(prev => {
      const updated = {};
      for (const [id, group] of Object.entries(prev)) {
        const remainingCells = group.cells.filter(cell => 
          !cells.some(c => c.rot === cell.rot && c.row === cell.row && c.col === cell.col)
        );
        if (remainingCells.length > 0) {
          updated[id] = { ...group, cells: remainingCells };
        }
      }
      // Add new group
      const color = getNextGroupColor();
      updated[`group-${nextGroupId}`] = { color, cells };
      return updated;
    });
    
    setNextGroupId(prev => prev + 1);
    clearSelection();
  }, [getSelectionBounds, getNextGroupColor, nextGroupId, clearSelection]);

  const handleDeleteGroup = useCallback((groupId) => {
    setCellGroups(prev => {
      const updated = { ...prev };
      delete updated[groupId];
      return updated;
    });
  }, []);

  const handleCopyGroup = useCallback((groupId) => {
    const group = cellGroups[groupId];
    if (!group) return;
    
    const groups = group.cells[0]?.rot === 'A' ? groupsA : groupsB;
    
    // Find bounds of group
    const rows = group.cells.map(c => c.row);
    const cols = group.cells.map(c => c.col);
    const minRow = Math.min(...rows);
    const minCol = Math.min(...cols);
    const maxRow = Math.max(...rows);
    const maxCol = Math.max(...cols);
    
    const cells = [];
    for (const cell of group.cells) {
      cells.push({
        row: cell.row - minRow,
        col: cell.col - minCol,
        activity: groups[cell.row]?.[cell.col] || '',
      });
    }
    
    setClipboard({
      rot: group.cells[0]?.rot,
      cells,
      width: maxCol - minCol + 1,
      height: maxRow - minRow + 1,
      isGroup: true,
      groupColor: group.color,
    });
  }, [cellGroups, groupsA, groupsB]);

  const errorsA = useMemo(() => validateMatrix(groupsA, timeSlots, daySlices, registry, similarities), [groupsA, timeSlots, daySlices, registry, similarities]);
  const errorsB = useMemo(() => validateMatrix(groupsB, timeSlots, daySlices, registry, similarities), [groupsB, timeSlots, daySlices, registry, similarities]);
  const crossErrors = useMemo(() => showCrossValidation ? validateCrossRotation(groupsA, groupsB, timeSlots, registry) : [], [groupsA, groupsB, timeSlots, registry, showCrossValidation]);

  const pushUndo = useCallback(() => { setUndoStack(prev => [...prev.slice(-30), { groupsA: cloneMatrix(groupsA), groupsB: cloneMatrix(groupsB), numGroupsA, numGroupsB }]); }, [groupsA, groupsB, numGroupsA, numGroupsB]);
  const handleUndo = useCallback(() => { setUndoStack(prev => { if (!prev.length) return prev; const l = prev[prev.length-1]; setGroupsA(l.groupsA); setGroupsB(l.groupsB); setNumGroupsA(l.numGroupsA); setNumGroupsB(l.numGroupsB); return prev.slice(0,-1); }); }, []);
  
  // Paste clipboard at position (needs pushUndo defined first)
  const handlePaste = useCallback((targetRot, targetRow, targetCol) => {
    if (!clipboard) return;
    pushUndo();
    
    const pastedCells = [];
    const setter = targetRot === 'A' ? setGroupsA : setGroupsB;
    setter(prev => {
      const n = cloneMatrix(prev);
      for (const cell of clipboard.cells) {
        const r = targetRow + cell.row;
        const c = targetCol + cell.col;
        if (r >= 0 && r < n.length && c >= 0 && c < numCols && cell.activity) {
          // Check if activity is allowed for this rotation
          if (isActivityAllowedForRot(cell.activity, targetRot)) {
            n[r][c] = cell.activity;
            pastedCells.push({ rot: targetRot, row: r, col: c });
          }
        }
      }
      return n;
    });
    
    // If clipboard came from a group, create a new group for pasted cells with same color
    if (clipboard.isGroup && clipboard.groupColor && pastedCells.length > 0) {
      setCellGroups(prev => {
        // Remove pasted cells from any existing groups first
        const updated = {};
        for (const [id, group] of Object.entries(prev)) {
          const remainingCells = group.cells.filter(cell => 
            !pastedCells.some(c => c.rot === cell.rot && c.row === cell.row && c.col === cell.col)
          );
          if (remainingCells.length > 0) {
            updated[id] = { ...group, cells: remainingCells };
          }
        }
        // Add new group with same color as source
        updated[`group-${nextGroupId}`] = { color: clipboard.groupColor, cells: pastedCells };
        return updated;
      });
      setNextGroupId(prev => prev + 1);
    }
  }, [clipboard, numCols, isActivityAllowedForRot, pushUndo, nextGroupId]);

  const handleDrop = useCallback((rot, row, col, act) => {
    // Check rotation assignment
    if (!isActivityAllowedForRot(act, rot)) return;
    pushUndo();
    (rot === 'A' ? setGroupsA : setGroupsB)(p => { const n = cloneMatrix(p); n[row][col] = act; return n; });
  }, [pushUndo, isActivityAllowedForRot]);
  const handleClear = useCallback((rot, row, col) => { pushUndo(); (rot === 'A' ? setGroupsA : setGroupsB)(p => { const n = cloneMatrix(p); n[row][col] = ''; return n; }); }, [pushUndo]);
  const handleMove = useCallback((rot, srcRow, srcCol, dstRow, dstCol) => {
    if (srcRow === dstRow && srcCol === dstCol) return;
    pushUndo();
    (rot === 'A' ? setGroupsA : setGroupsB)(p => {
      const n = cloneMatrix(p);
      const srcAct = n[srcRow][srcCol];
      const dstAct = n[dstRow][dstCol];
      n[dstRow][dstCol] = srcAct;
      n[srcRow][srcCol] = dstAct; // swap (empty string if dst was empty = move)
      return n;
    });
  }, [pushUndo]);
  const handleAddGroup = useCallback(rot => { pushUndo(); if (rot === 'A') { setNumGroupsA(n => n+1); setGroupsA(p => [...p, Array(numCols).fill('')]); } else { setNumGroupsB(n => n+1); setGroupsB(p => [...p, Array(numCols).fill('')]); } }, [pushUndo, numCols]);
  const handleRemoveGroup = useCallback(rot => { pushUndo(); if (rot === 'A') { setNumGroupsA(n => Math.max(1, n-1)); setGroupsA(p => p.length > 1 ? p.slice(0,-1) : p); } else { setNumGroupsB(n => Math.max(1, n-1)); setGroupsB(p => p.length > 1 ? p.slice(0,-1) : p); } }, [pushUndo]);
  const handleClearAll = useCallback(() => { pushUndo(); setGroupsA(Array.from({ length: numGroupsA }, () => Array(numCols).fill(''))); setGroupsB(Array.from({ length: numGroupsB }, () => Array(numCols).fill(''))); }, [pushUndo, numGroupsA, numGroupsB, numCols]);
  const handleImportRotation = useCallback((rot, idx) => { if (!rotations?.[idx]) return; pushUndo(); const s = rotations[idx]; const imp = s.groups.map(g => { const r = Array(numCols).fill(''); for (let c = 0; c < Math.min(g.length, numCols); c++) r[c] = g[c] || ''; return r; }); if (rot === 'A') { setGroupsA(imp); setNumGroupsA(imp.length); } else { setGroupsB(imp); setNumGroupsB(imp.length); } }, [rotations, pushUndo, numCols]);
  
  // Feature 3: Save to Dashboard
  const handleSaveToDashboard = useCallback((rot) => {
    if (!onSave) return;
    const groups = rot === 'A' ? groupsA : groupsB;
    const rotIdx = rot === 'A' ? 0 : 1;
    onSave(rotIdx, groups);
  }, [onSave, groupsA, groupsB]);

  const handleCompareRow = useCallback((rot, rowIdx) => {
    const dr = 0, dg = Math.min(rowIdx, (rotations?.[0]?.groups?.length||1)-1);
    setCompareOldRot(dr); setCompareOldGroup(dg); setCompareView({ rot, row: rowIdx });
  }, [rotations]);

  const statsA = useMemo(() => { const f = groupsA.reduce((s, r) => s + r.filter(Boolean).length, 0); const t = numGroupsA * numCols; return { filled: f, total: t, pct: t ? Math.round(f/t*100) : 0 }; }, [groupsA, numGroupsA, numCols]);
  const statsB = useMemo(() => { const f = groupsB.reduce((s, r) => s + r.filter(Boolean).length, 0); const t = numGroupsB * numCols; return { filled: f, total: t, pct: t ? Math.round(f/t*100) : 0 }; }, [groupsB, numGroupsB, numCols]);

  useEffect(() => { const h = () => setDropPreview(null); document.addEventListener('dragend', h); return () => document.removeEventListener('dragend', h); }, []);
  
  // Keyboard shortcuts for copy/paste
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        if (getSelectionBounds()) {
          e.preventDefault();
          handleCopy();
        }
      }
      if (e.key === 'Escape') {
        clearSelection();
        setClipboard(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleCopy, clearSelection, getSelectionBounds]);
  
  // Mouse up listener for selection
  useEffect(() => {
    const handleMouseUp = () => {
      if (isSelecting) {
        setIsSelecting(false);
      }
    };
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [isSelecting]);

  // Comparison overlay
  if (compareView && rotations?.length) {
    const ng = compareView.rot === 'A' ? groupsA[compareView.row] : groupsB[compareView.row];
    const og = rotations[compareOldRot]?.groups?.[compareOldGroup] || [];
    const ogp = Array(numCols).fill('').map((_, i) => og[i] || '');
    return <ComparisonView newGroup={ng} oldGroup={ogp}
      oldLabel={`Existing: Rotation ${rotations[compareOldRot]?.name||'?'} \u2014 Group ${compareOldGroup+1}`}
      newLabel={`Builder: Rotation ${compareView.rot} \u2014 Group ${compareView.row+1}`}
      timeSlots={timeSlots} daySlices={daySlices} registry={registry} distMatrix={distMatrix}
      startLocation={startLocations?.[0]||null} startLocations={startLocations}
      onClose={() => setCompareView(null)} onChangeOldSource={(r,g) => { setCompareOldRot(r); setCompareOldGroup(g); }}
      existingRotations={rotations} selectedOldRot={compareOldRot} selectedOldGroup={compareOldGroup} />;
  }

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 52px)', background: '#0f1219' }}>
      {/* Palette */}
      <div style={{ width: 280, flexShrink: 0, background: '#141924', borderRight: '1px solid #1e2636', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px 14px 12px', borderBottom: '1px solid #1e2636' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: ACCENT, fontFamily: "'Playfair Display', serif", marginBottom: 10 }}>Activity Palette</div>
          <input type="text" placeholder="Filter activities..." value={paletteFilter} onChange={e => setPaletteFilter(e.target.value)} style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #2a3040', background: '#0f1219', color: '#e8e6e1', fontSize: 11, outline: 'none', fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
            {[{ id: 'value', l: 'Value' }, { id: 'name', l: 'A-Z' }, { id: 'intensity', l: 'Intensity' }, { id: 'group', l: 'Group' }].map(s => <button key={s.id} onClick={() => setPaletteSort(s.id)} style={{ padding: '3px 8px', borderRadius: 4, fontSize: 9, border: `1px solid ${paletteSort === s.id ? ACCENT : '#2a3040'}`, background: paletteSort === s.id ? ACCENT_FAINT : 'transparent', color: paletteSort === s.id ? ACCENT : '#666', cursor: 'pointer', fontWeight: 600 }}>{s.l}</button>)}
          </div>
          {simGroups.length > 0 && <select value={paletteSimilarity} onChange={e => setPaletteSimilarity(e.target.value)} style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #2a3040', background: '#0f1219', color: '#888', fontSize: 10, marginTop: 8, outline: 'none', cursor: 'pointer' }}><option value="all">All Similarity Groups</option><option value="none">No Group</option>{simGroups.map(g => <option key={g} value={g}>{g}</option>)}</select>}
          {/* Rotation filter */}
          <div style={{ display: 'flex', gap: 4, marginTop: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: '#666', fontWeight: 600 }}>Show:</span>
            {[{ id: 'all', l: 'All', c: '#888' }, { id: 'A', l: 'Rot A', c: ROT_COLORS.A }, { id: 'B', l: 'Rot B', c: ROT_COLORS.B }, { id: 'unassigned', l: 'Unassigned', c: '#666' }].map(f => (
              <button key={f.id} onClick={() => setPaletteRotFilter(f.id)} style={{ padding: '3px 6px', borderRadius: 4, fontSize: 9, border: `1px solid ${paletteRotFilter === f.id ? f.c : '#2a3040'}`, background: paletteRotFilter === f.id ? `${f.c}20` : 'transparent', color: paletteRotFilter === f.id ? f.c : '#555', cursor: 'pointer', fontWeight: 600 }}>{f.l}</button>
            ))}
          </div>
        </div>
        {/* Clipboard indicator */}
        {clipboard && (
          <div style={{ padding: '8px 14px', background: clipboard.isGroup ? `${clipboard.groupColor}20` : '#a78bfa15', borderBottom: `1px solid ${clipboard.isGroup ? clipboard.groupColor + '50' : '#a78bfa30'}`, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, color: clipboard.isGroup ? clipboard.groupColor : '#a78bfa', fontWeight: 600 }}>Clipboard:</span>
            <span style={{ fontSize: 10, color: '#e8e6e1' }}>{clipboard.width}x{clipboard.height} cells{clipboard.isGroup && ' (group)'}</span>
            <button onClick={() => { setClipboard(null); clearSelection(); }} style={{ marginLeft: 'auto', fontSize: 10, color: '#888', background: 'transparent', border: 'none', cursor: 'pointer' }}>Clear</button>
          </div>
        )}
        {/* Selection indicator */}
        {getSelectionBounds() && (
          <div style={{ padding: '8px 14px', background: '#a78bfa10', borderBottom: '1px solid #a78bfa20', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, color: '#a78bfa', fontWeight: 600 }}>Selected:</span>
            <span style={{ fontSize: 10, color: '#e8e6e1' }}>{(getSelectionBounds().maxRow - getSelectionBounds().minRow + 1)}x{(getSelectionBounds().maxCol - getSelectionBounds().minCol + 1)}</span>
            <button onClick={handleCreateGroup} style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 3, fontSize: 9, border: '1px solid #22c55e', background: '#22c55e20', color: '#22c55e', cursor: 'pointer', fontWeight: 600 }}>Group</button>
            <button onClick={handleCopy} style={{ padding: '2px 8px', borderRadius: 3, fontSize: 9, border: '1px solid #a78bfa', background: '#a78bfa20', color: '#a78bfa', cursor: 'pointer', fontWeight: 600 }}>Copy</button>
            <button onClick={clearSelection} style={{ fontSize: 10, color: '#888', background: 'transparent', border: 'none', cursor: 'pointer' }}>x</button>
          </div>
        )}
        {/* Cell Groups panel */}
        {Object.keys(cellGroups).length > 0 && (
          <div style={{ padding: '8px 14px', background: '#0f1219', borderBottom: '1px solid #1e2636' }}>
            <div style={{ fontSize: 9, color: '#666', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Cell Groups ({Object.keys(cellGroups).length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {Object.entries(cellGroups).map(([id, group]) => (
                <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 4, background: `${group.color}15`, border: `1px solid ${group.color}40` }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: group.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: '#e8e6e1', flex: 1 }}>{group.cells.length} cells</span>
                  <span style={{ fontSize: 9, color: '#666' }}>Rot {group.cells[0]?.rot}</span>
                  <button onClick={() => handleCopyGroup(id)} style={{ padding: '1px 5px', borderRadius: 2, fontSize: 8, border: '1px solid #a78bfa50', background: 'transparent', color: '#a78bfa', cursor: 'pointer', fontWeight: 600 }}>Copy</button>
                  <button onClick={() => handleDeleteGroup(id)} style={{ fontSize: 9, color: '#888', background: 'transparent', border: 'none', cursor: 'pointer' }}>×</button>
                </div>
              ))}
            </div>
          </div>
        )}
        {selectedActivity && <div style={{ padding: '8px 14px', background: ACCENT_FAINT, borderBottom: `1px solid ${ACCENT}30`, display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 10, color: ACCENT, fontWeight: 600 }}>Click-placing:</span><span style={{ fontSize: 11, color: '#e8e6e1', fontWeight: 700, fontFamily: "'DM Sans', sans-serif" }}>{shortName(selectedActivity)}</span><button onClick={() => setSelectedActivity(null)} style={{ marginLeft: 'auto', fontSize: 10, color: '#888', background: 'transparent', border: 'none', cursor: 'pointer' }}>x</button></div>}
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {filteredActivities.map(a => <ActivityChip key={a.name} name={a.name} meta={a.meta} simGroup={a.simGroup} simColorMap={simColorMap} compact={false} onDragStart={n => setDropPreview(n)} onClick={n => setSelectedActivity(p => p === n ? null : n)} style={selectedActivity === a.name ? { border: `1.5px solid ${ACCENT}`, background: ACCENT_FAINT } : {}} rotAssign={activityRotAssign[a.name]} onRotAssign={handleRotAssign} disabled={paletteRotFilter !== 'all' && paletteRotFilter !== 'unassigned' && activityRotAssign[a.name] && activityRotAssign[a.name] !== paletteRotFilter} />)}
          {!filteredActivities.length && <div style={{ fontSize: 11, color: '#555', textAlign: 'center', padding: 20 }}>No matches</div>}
        </div>
        <div style={{ padding: '8px 14px', borderTop: '1px solid #1e2636', fontSize: 10, color: '#555', textAlign: 'center' }}>{filteredActivities.length} / {activityList.length} | {Object.keys(activityRotAssign).length} assigned</div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#e8e6e1', fontFamily: "'Playfair Display', serif" }}>Matrix Builder<span style={{ fontSize: 11, color: '#555', fontWeight: 400, marginLeft: 10, fontFamily: "'DM Sans', sans-serif" }}>Drag activities into cells {'\u00B7'} fill a row to compare</span></div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {rotations?.length > 0 && <div style={{ display: 'flex', gap: 4 }}>{rotations.map((rot, idx) => <div key={idx} style={{ display: 'flex', gap: 2 }}><button onClick={() => handleImportRotation('A', idx)} style={{ padding: '5px 10px', borderRadius: 5, fontSize: 10, border: '1px solid #2a3040', background: '#1a1f2e', color: '#888', cursor: 'pointer', fontWeight: 600 }}>Import {rot.name} {'\u2192'} A</button><button onClick={() => handleImportRotation('B', idx)} style={{ padding: '5px 10px', borderRadius: 5, fontSize: 10, border: '1px solid #2a3040', background: '#1a1f2e', color: '#888', cursor: 'pointer', fontWeight: 600 }}>Import {rot.name} {'\u2192'} B</button></div>)}</div>}
            <button onClick={() => setShowCrossValidation(v => !v)} style={{ padding: '5px 10px', borderRadius: 5, fontSize: 10, border: `1px solid ${showCrossValidation ? ACCENT : '#2a3040'}`, background: showCrossValidation ? ACCENT_FAINT : 'transparent', color: showCrossValidation ? ACCENT : '#666', cursor: 'pointer', fontWeight: 600 }}>Cross-Rot {showCrossValidation ? 'ON' : 'OFF'}</button>
            <button onClick={handleUndo} disabled={!undoStack.length} style={{ padding: '5px 10px', borderRadius: 5, fontSize: 10, border: '1px solid #2a3040', background: '#1a1f2e', color: undoStack.length ? '#888' : '#444', cursor: undoStack.length ? 'pointer' : 'not-allowed', fontWeight: 600 }}>{'\u21A9'} Undo ({undoStack.length})</button>
            <button onClick={handleClearAll} style={{ padding: '5px 10px', borderRadius: 5, fontSize: 10, border: '1px solid #dc262640', background: '#dc262610', color: '#f87171', cursor: 'pointer', fontWeight: 600 }}>Clear All</button>
          </div>
        </div>

        {crossErrors.length > 0 && <div style={{ padding: '10px 16px', borderRadius: 8, marginBottom: 16, background: '#dc262610', border: '1px solid #dc262630' }}><div style={{ fontSize: 11, fontWeight: 700, color: '#f87171', marginBottom: 6 }}>Cross-Rotation Conflicts ({crossErrors.length})</div>{crossErrors.slice(0, 5).map((e, i) => <div key={i} style={{ fontSize: 10, color: '#f8717199', marginBottom: 2 }}>{e.msg}</div>)}{crossErrors.length > 5 && <div style={{ fontSize: 10, color: '#f8717160' }}>...and {crossErrors.length - 5} more</div>}</div>}

        <RotationMatrix rotLabel="A" rotColor={ROT_COLORS.A} groups={groupsA} numGroups={numGroupsA} timeSlots={timeSlots} daySlices={daySlices} registry={registry} similarities={similarities} simColorMap={simColorMap} errors={errorsA} dropPreview={dropPreview} onDrop={(r, c, a) => handleDrop('A', r, c, a)} onClear={(r, c) => handleClear('A', r, c)} onMove={(sr, sc, dr, dc) => handleMove('A', sr, sc, dr, dc)} onAddGroup={() => handleAddGroup('A')} onRemoveGroup={() => handleRemoveGroup('A')} onCompareRow={handleCompareRow} isInSelection={isInSelection} onSelectionStart={(rot, r, c) => { setSelectionStart({ rot, row: r, col: c }); setSelectionEnd({ rot, row: r, col: c }); setIsSelecting(true); }} onSelectionMove={(rot, r, c) => { if (isSelecting && selectionStart?.rot === rot) setSelectionEnd({ rot, row: r, col: c }); }} onPaste={handlePaste} hasClipboard={!!clipboard} isActivityAllowed={(act) => isActivityAllowedForRot(act, 'A')} onSave={onSave ? () => handleSaveToDashboard('A') : null} selectedActivity={selectedActivity} onClickPlace={(r, c, a) => handleDrop('A', r, c, a)} getGroupColor={getGroupColor} />
        <div style={{ height: 20 }} />
        <RotationMatrix rotLabel="B" rotColor={ROT_COLORS.B} groups={groupsB} numGroups={numGroupsB} timeSlots={timeSlots} daySlices={daySlices} registry={registry} similarities={similarities} simColorMap={simColorMap} errors={errorsB} dropPreview={dropPreview} onDrop={(r, c, a) => handleDrop('B', r, c, a)} onClear={(r, c) => handleClear('B', r, c)} onMove={(sr, sc, dr, dc) => handleMove('B', sr, sc, dr, dc)} onAddGroup={() => handleAddGroup('B')} onRemoveGroup={() => handleRemoveGroup('B')} onCompareRow={handleCompareRow} isInSelection={isInSelection} onSelectionStart={(rot, r, c) => { setSelectionStart({ rot, row: r, col: c }); setSelectionEnd({ rot, row: r, col: c }); setIsSelecting(true); }} onSelectionMove={(rot, r, c) => { if (isSelecting && selectionStart?.rot === rot) setSelectionEnd({ rot, row: r, col: c }); }} onPaste={handlePaste} hasClipboard={!!clipboard} isActivityAllowed={(act) => isActivityAllowedForRot(act, 'B')} onSave={onSave ? () => handleSaveToDashboard('B') : null} selectedActivity={selectedActivity} onClickPlace={(r, c, a) => handleDrop('B', r, c, a)} getGroupColor={getGroupColor} />

        <ErrorSummary errorsA={errorsA} errorsB={errorsB} />

        <div style={{ display: 'flex', gap: 16, marginTop: 20, flexWrap: 'wrap' }}>
          {[{ label: 'Rotation A Fill', val: statsA, color: ROT_COLORS.A }, { label: 'Rotation B Fill', val: statsB, color: ROT_COLORS.B }].map(s => <div key={s.label} style={{ padding: '14px 20px', background: '#141924', borderRadius: 10, border: '1px solid #1e2636', flex: '1 1 200px' }}><div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', marginBottom: 4 }}>{s.label}</div><div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: s.val.pct === 100 ? '#34d399' : s.color }}>{s.val.filled}/{s.val.total}<span style={{ fontSize: 12, color: '#555', marginLeft: 6 }}>{s.val.pct}%</span></div></div>)}
          <div style={{ padding: '14px 20px', background: '#141924', borderRadius: 10, border: '1px solid #1e2636', flex: '1 1 200px' }}><div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', marginBottom: 4 }}>Validation</div><div style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}><span style={{ fontSize: 28, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: errorsA.length + errorsB.length === 0 ? '#34d399' : '#dc2626' }}>{errorsA.filter(e => e.severity === 'error').length + errorsB.filter(e => e.severity === 'error').length}</span><span style={{ fontSize: 10, color: '#666' }}>errors</span><span style={{ fontSize: 20, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: '#f59e0b' }}>{errorsA.filter(e => e.severity === 'warn').length + errorsB.filter(e => e.severity === 'warn').length}</span><span style={{ fontSize: 10, color: '#666' }}>warnings</span></div></div>
          <div style={{ padding: '14px 20px', background: '#141924', borderRadius: 10, border: `1px solid ${crossErrors.length ? '#dc262640' : '#1e2636'}`, flex: '1 1 200px' }}><div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', marginBottom: 4 }}>Cross-Rotation</div><div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: crossErrors.length === 0 ? '#34d399' : '#dc2626' }}>{crossErrors.length}</div></div>
        </div>

        {/* -- Full Table Comparison -- */}
        <FullTableComparison
          groupsA={groupsA} groupsB={groupsB}
          statsA={statsA} statsB={statsB}
          rotations={rotations} registry={registry}
          distMatrix={distMatrix} daySlices={daySlices}
          timeSlots={timeSlots} startLocations={startLocations}
        />
      </div>

      <style>{`td:hover .cell-clear-btn { opacity: 1 !important; }`}</style>
    </div>
  );
}
