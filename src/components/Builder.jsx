import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  INTENSITY_COLORS, INTENSITY_TEXT, LOCATION_COLORS, DAY_COLORS,
  INTENSITY_BADGE, ROT_COLORS, ACCENT, ACCENT_DIM, ACCENT_FAINT,
  SIMILARITY_COLORS, GROUP_COLORS,
  valueColor, valueTextColor,
} from '../constants/colors.js';
import { parseStaff, computeDayStats, computeOverallStats, computeTableAverages } from '../utils/scheduleStats.js';
import { getDistance, getStartDistance, lookupMeta, shortName } from '../utils/parsers.js';

function cloneMatrix(m) { return m.map(row => [...row]); }
function countInColumn(groups, colIdx, activityName) { let c = 0; for (const row of groups) if (row[colIdx] === activityName) c++; return c; }
function countInRowForDay(row, dayStart, dayEnd, activityName) { let c = 0; for (let i = dayStart; i < dayEnd; i++) if (row[i] === activityName) c++; return c; }
function getDaySlice(colIdx, daySlices) { for (const ds of daySlices) if (colIdx >= ds.start && colIdx < ds.end) return ds; return null; }

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
      className={`rounded-md flex items-center gap-1.5 transition-all select-none shrink-0 ${compact ? 'px-2 py-1' : 'px-2.5 py-1.5'} ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-grab'}`}
      style={{ background: disabled ? '#1a1f2e80' : '#1a1f2e', border: `1px solid ${assignColor || (disabled ? '#1e263680' : '#2a3040')}`, ...extraStyle }}>
      {sc && <div className="w-[3px] rounded-sm shrink-0" style={{ height: compact ? 14 : 18, background: sc }} />}
      <div className="min-w-0 flex-1">
        <div className={`font-semibold whitespace-nowrap overflow-hidden text-ellipsis font-sans ${compact ? 'text-[10px]' : 'text-[11px]'} ${disabled ? 'text-text-faint' : 'text-text-primary'}`}>{compact ? shortName(name) : name}</div>
        {!compact && <div className="flex gap-1.5 mt-0.5 text-[9px]">
          <span className="px-1 rounded-[3px] font-semibold" style={{ color: int.color, background: int.bg }}>{int.label}</span>
          <span className="font-mono" style={{ color: (meta?.value||0) >= 70 ? '#34d399' : (meta?.value||0) >= 40 ? '#fbbf24' : '#888' }}>V:{meta?.value||'?'}</span>
          {(meta?.maxGroups||1) === 1 && <span className="font-semibold text-accent-pink">x1</span>}
          {(meta?.maxGroups||1) > 1 && <span className="font-semibold text-[#818cf8]">x{meta.maxGroups}</span>}
        </div>}
      </div>
      {/* Rotation assignment buttons */}
      {!compact && onRotAssign && (
        <div className="flex gap-0.5 ml-auto shrink-0" onClick={e => e.stopPropagation()}>
          <button
            onClick={(e) => { e.stopPropagation(); onRotAssign(name, 'A'); }}
            className="w-[18px] h-[18px] rounded-[3px] text-[9px] font-bold cursor-pointer flex items-center justify-center"
            style={{
              border: `1px solid ${rotAssign === 'A' ? ROT_COLORS.A : '#2a3040'}`,
              background: rotAssign === 'A' ? ROT_COLORS.A : 'transparent',
              color: rotAssign === 'A' ? '#0f1219' : '#555',
            }}
            title="Assign to Rotation A only"
          >A</button>
          <button
            onClick={(e) => { e.stopPropagation(); onRotAssign(name, 'B'); }}
            className="w-[18px] h-[18px] rounded-[3px] text-[9px] font-bold cursor-pointer flex items-center justify-center"
            style={{
              border: `1px solid ${rotAssign === 'B' ? ROT_COLORS.B : '#2a3040'}`,
              background: rotAssign === 'B' ? ROT_COLORS.B : 'transparent',
              color: rotAssign === 'B' ? '#0f1219' : '#555',
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
          const src = JSON.parse(cellData);
          if (src.rot === rotLabel) onMove(src.row, src.col, row, col);
        } else if (act) {
          onDrop(row, col, act);
        }
      }}
      onClick={e => {
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
      className={`min-w-[88px] h-[52px] rounded-md flex items-center justify-center gap-1 transition-all relative overflow-hidden select-none ${activity ? 'cursor-grab' : (selectedActivity && !clickBlocked) ? 'cursor-pointer' : 'cursor-default'}`}
      style={{ border: `1.5px solid ${borderColor}`, background: bgColor }}>
      {activity ? <>
        {sc && <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: sc }} />}
        <div className="text-center px-1.5">
          <div className="text-[10px] font-bold text-text-primary font-sans leading-[14px]">{shortName(activity)}</div>
          <div className="flex gap-[3px] justify-center mt-0.5">
            {int && <span className="text-[8px] px-[3px] rounded-sm font-bold" style={{ color: int.color, background: int.bg }}>{int.label}</span>}
            <span className="text-[8px] font-mono" style={{ color: (meta?.value||0) >= 70 ? '#34d399' : (meta?.value||0) >= 40 ? '#fbbf24' : '#666' }}>{meta?.value||'?'}</span>
          </div>
        </div>
        {(hasError || hasWarn) && <div className="absolute top-0.5 right-[3px] text-[8px] font-[800]" style={{ color: hasError ? '#dc2626' : '#f59e0b' }}>{hasError ? 'X' : '!'}</div>}
        <div onClick={e => { e.stopPropagation(); onClear(row, col); }} className="cell-clear-btn absolute top-0.5 left-1 text-[9px] text-text-faint cursor-pointer opacity-0 transition-opacity">x</div>
      </> : <div className="text-[18px] font-light" style={{ color: clickBlocked ? '#dc262680' : blocked ? '#dc262680' : dragOver ? ACCENT : selectedActivity ? ACCENT : '#1e2636' }}>{clickBlocked || blocked ? 'X' : '+'}</div>}
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
    <div className="bg-base-700 rounded-xl overflow-hidden" style={{ border: `1px solid ${rotColor}30` }}>
      <div className="px-5 py-3.5 flex items-center justify-between cursor-pointer" style={{ background: `linear-gradient(135deg, ${rotColor}12, transparent)`, borderBottom: `1px solid ${rotColor}25` }} onClick={() => setCollapsed(c => !c)}>
        <div className="flex items-center gap-3">
          <div className="text-xs transition-transform duration-200" style={{ color: rotColor, transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>{'\u25BC'}</div>
          <div className="text-lg font-[800] font-display" style={{ color: rotColor }}>Rotation {rotLabel}</div>
          <div className="text-[10px] text-text-secondary font-mono">{numGroups} groups x {numCols} slots</div>
        </div>
        <div className="flex items-center gap-3.5">
          <div className="flex items-center gap-2">
            <div className="w-20 h-1.5 rounded-[3px] bg-base-800 overflow-hidden">
              <div className="h-full rounded-[3px] transition-[width] duration-300" style={{ width: `${fillPct}%`, background: fillPct === 100 ? '#34d399' : rotColor }} />
            </div>
            <span className="text-[10px] font-mono" style={{ color: fillPct === 100 ? '#34d399' : '#888' }}>{fillPct}%</span>
          </div>
          {errCount > 0 && <span className="text-[10px] font-bold text-error px-2 py-0.5 rounded bg-[#dc262620]">{errCount} err</span>}
          {wrnCount > 0 && <span className="text-[10px] font-bold text-warning px-2 py-0.5 rounded bg-[#f59e0b20]">{wrnCount} wrn</span>}
          {onSave && fillPct === 100 && (
            <button onClick={e => { e.stopPropagation(); onSave(); }} className="px-3 py-1 rounded border border-success-light text-success-light text-[10px] font-bold cursor-pointer bg-[#34d39920]">
              Save to Dashboard
            </button>
          )}
          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
            <button onClick={onRemoveGroup} disabled={numGroups <= 1} className={`w-6 h-6 rounded border border-base-400 bg-base-800 text-sm flex items-center justify-center ${numGroups <= 1 ? 'text-base-300 cursor-not-allowed' : 'text-text-secondary cursor-pointer'}`}>-</button>
            <button onClick={onAddGroup} className="w-6 h-6 rounded border border-base-400 bg-base-800 text-text-secondary cursor-pointer text-sm flex items-center justify-center">+</button>
          </div>
        </div>
      </div>
      {!collapsed && <div className="overflow-auto px-4 pt-3 pb-4">
        <table className="border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="min-w-[48px]" />
              {daySlices.map((ds, di) => <React.Fragment key={ds.name}>{di > 0 && <th className="w-2.5" />}<th colSpan={ds.end - ds.start} className="text-center py-1 text-[11px] font-bold font-display" style={{ color: DAY_COLORS?.[di] || '#888', borderBottom: `3px solid ${DAY_COLORS?.[di] || '#333'}50` }}>{ds.name}</th></React.Fragment>)}
              <th className="min-w-[80px]" />
            </tr>
            <tr>
              <th className="text-[9px] text-text-faint font-semibold text-center px-1.5 py-1">GRP</th>
              {timeSlots.map((ts, ci) => { const isNewDay = ci > 0 && daySlices.some(d => d.start === ci); return <React.Fragment key={ci}>{isNewDay && <th className="w-2.5" />}<th className="text-[9px] text-text-faint font-medium text-center px-1 py-1 font-mono whitespace-nowrap">{ts.time}</th></React.Fragment>; })}
              <th />
            </tr>
          </thead>
          <tbody>
            {groups.map((row, ri) => {
              const isFilled = row.every(cell => cell && cell.length > 0);
              return (
                <tr key={ri}>
                  <td className="text-[11px] font-bold text-center px-2 font-mono whitespace-nowrap" style={{ color: rotColor }}>G{ri + 1}</td>
                  {row.map((act, ci) => {
                    const meta = act ? lookupMeta(act, registry) : null;
                    const sg = act ? similarities?.activityToGroup?.[act] || null : null;
                    const isNewDay = ci > 0 && daySlices.some(d => d.start === ci);
                    const dayIdx = daySlices.findIndex(d => ci >= d.start && ci < d.end);
                    const dayColor = DAY_COLORS?.[dayIdx] || '#333';
                    return <React.Fragment key={ci}>{isNewDay && <td className="w-2.5" style={{ background: `${dayColor}08`, borderLeft: `2px solid ${dayColor}20` }} />}<td className="p-0"><MatrixCell activity={act} row={ri} col={ci} errors={errors} meta={meta} simGroup={sg} simColorMap={simColorMap} onDrop={onDrop} onClear={onClear} onMove={onMove} dropPreview={dropPreview} registry={registry} daySlices={daySlices} allGroups={groups} rotLabel={rotLabel} isSelected={isInSelection?.(rotLabel, ri, ci)} onSelectionStart={onSelectionStart} onSelectionMove={onSelectionMove} onPaste={onPaste} hasClipboard={hasClipboard} isActivityAllowed={isActivityAllowed} selectedActivity={selectedActivity} onClickPlace={onClickPlace} groupColor={getGroupColor?.(rotLabel, ri, ci)} /></td></React.Fragment>;
                  })}
                  <td className="px-1 align-middle">
                    {isFilled ? (
                      <button onClick={() => onCompareRow(rotLabel, ri)} className="px-2.5 py-1.5 rounded-md text-[9px] font-bold cursor-pointer transition-all whitespace-nowrap flex items-center gap-1 border border-[#f9731650] bg-[linear-gradient(135deg,#f9731615,#f9731608)] text-accent-orange" title={`Compare Group ${ri+1}`}>
                        <span className="text-xs leading-none">&#8660;</span> Compare
                      </button>
                    ) : <div className="text-[9px] text-base-300 text-center py-1.5 px-1 whitespace-nowrap">Fill row</div>}
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
    <div className="py-2.5 border-b border-base-500">
      <div className="text-[9px] text-text-muted uppercase tracking-wide mb-1.5">{label}</div>
      <div className="flex items-baseline gap-4">
        <div className="flex-1"><span className="text-[10px] text-text-secondary mr-1">OLD</span><span className="text-lg font-bold font-mono text-text-secondary">{oldVal}{unit||''}</span></div>
        <div className="flex-1"><span className="text-[10px] mr-1 text-accent-orange">NEW</span><span className="text-lg font-bold font-mono text-text-primary">{newVal}{unit||''}</span></div>
        <div className="text-[13px] font-bold font-mono min-w-[60px] text-right" style={{ color: dc }}>
          {delta > 0 ? '+' : ''}{delta}{unit||''}{delta !== 0 && <span className="text-[10px] ml-[3px]">{improved ? '\u25B2' : '\u25BC'}</span>}
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
      <div className="text-xs font-bold mb-2 font-display flex items-center gap-2" style={{ color }}>
        <div className="w-1 h-[18px] rounded-sm" style={{ background: color }} />{label}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>{daySlices.map((d, di) => <React.Fragment key={d.name}>{di > 0 && <th className="w-3.5" />}<th colSpan={d.end - d.start} className="text-center text-[11px] font-bold py-1 font-display" style={{ color: DAY_COLORS?.[d.name] || DAY_COLORS?.[di] || '#888', borderBottom: `2px solid ${(DAY_COLORS?.[d.name] || DAY_COLORS?.[di] || '#555')}30` }}>{d.name}</th></React.Fragment>)}</tr>
            <tr>{timeSlots.map((s, si) => { const nd = dayBoundaries.has(si); return <React.Fragment key={si}>{nd && <th className="w-3.5" />}<th className="text-[9px] text-text-secondary text-center px-[3px] pb-2 pt-[3px] font-medium font-mono whitespace-nowrap">{s.time}</th></React.Fragment>; })}</tr>
          </thead>
          <tbody><tr>{group.map((activity, si) => {
            const meta = lookupMeta(activity, registry); const cellStyle = getCellStyle(activity);
            const nd = dayBoundaries.has(si); const fd = daySlices.some(d => d.start === si);
            const dist = (si > 0 && !nd) ? getDistance(group[si-1], activity, distMatrix, registry.nameMap) : null;
            const sd = (fd && startLocation) ? getStartDistance(startLocation, activity, distMatrix, registry.nameMap) : null;
            return <React.Fragment key={si}>{nd && <td className="w-3.5" />}<td className="px-[1px] py-0.5 align-top relative">
              {dist !== null && <div className="absolute top-1/2 -left-0.5 -translate-x-1/2 -translate-y-1/2 z-[3]"><div className="text-[8px] rounded-[3px] px-[3px] py-[1px] font-semibold font-mono" style={{ color: dist > 600 ? '#dc2626' : dist > 400 ? '#d97706' : dist > 200 ? '#6b7280' : '#059669', background: dist > 600 ? '#fef2f2' : dist > 400 ? '#fffbeb' : dist > 200 ? '#f3f4f6' : '#ecfdf5' }}>{dist}m</div></div>}
              {sd !== null && <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[3]"><div className="text-[7px] text-[#60a5fa] bg-[#112a3d] rounded-[3px] px-[3px] py-[1px] font-semibold font-mono whitespace-nowrap border border-[#1e3a5f]">{'\u25B8'} {sd}m</div></div>}
              <div className="rounded-md px-1.5 py-2 min-h-[68px] flex flex-col justify-between" style={{ ...cellStyle, border: meta ? '1px solid transparent' : '1px dashed #e74c3c55' }}>
                <div className="text-[11px] font-semibold leading-tight mb-0.5">{shortName(activity)}</div>
                {meta && <div className="text-[8px] opacity-70 mb-0.5">{meta.intensity} {'\u00B7'} {meta.io}</div>}
                <div className="flex justify-between items-center mt-auto">
                  <span className="text-[8px] opacity-75">{(meta?.location || '').substring(0, 8)}</span>
                  <span className="text-[10px] font-bold font-mono bg-black/20 rounded-[3px] px-[5px] py-[1px]">{meta?.value ?? '?'}</span>
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
    <div className="flex-[1_1_280px] bg-base-700 rounded-[10px] border border-base-500 p-[18px] min-w-[260px]">
      <div className="flex items-center gap-2 mb-3.5">
        <div className="w-1 h-[22px] rounded-sm" style={{ background: color }} />
        <h4 className="m-0 text-[15px] font-display" style={{ color }}>{dayName}</h4>
        <span className="text-[10px] text-text-faint ml-auto">{slotCount} slots</span>
      </div>
      <DeltaStat label="Avg Value" oldVal={oldStats.avgVal} newVal={newStats.avgVal} higherIsBetter={true} />
      <DeltaStat label="Total Walk" oldVal={oldStats.totalDist} newVal={newStats.totalDist} unit="m" higherIsBetter={false} />
      <DeltaStat label="Max Walk" oldVal={oldStats.maxDist} newVal={newStats.maxDist} unit="m" higherIsBetter={false} />
      <DeltaStat label="Indoor" oldVal={oldStats.indoorCount} newVal={newStats.indoorCount} higherIsBetter={true} />
      <div className="mt-3">
        <div className="text-[9px] text-text-muted uppercase tracking-wide mb-1">Intensity Flow</div>
        <div className="mb-1">
          <div className="text-[8px] text-text-faint mb-0.5">OLD</div>
          <div className="flex gap-0.5">{oldStats.intensities.map((int, i) => <div key={i} className="flex-1 h-[7px] rounded-[3px]" style={{ background: INTENSITY_COLORS[int] || '#333' }} title={int} />)}</div>
        </div>
        <div>
          <div className="text-[8px] mb-0.5 text-accent-orange">NEW</div>
          <div className="flex gap-0.5">{newStats.intensities.map((int, i) => <div key={i} className="flex-1 h-[7px] rounded-[3px]" style={{ background: INTENSITY_COLORS[int] || '#333' }} title={int} />)}</div>
        </div>
      </div>
      {(oa.length > 0 || na.length > 0) && <div className="mt-2.5">
        {na.map((a, i) => { const isNew = !oa.find(o => o.msg === a.msg); return <div key={`n${i}`} className="text-[10px] px-[7px] py-[3px] rounded-[3px] mb-0.5 flex items-center gap-1.5" style={{ background: a.type === 'error' ? '#3d1111' : a.type === 'warn' ? '#3d2e11' : '#112a3d', color: a.type === 'error' ? '#f87171' : a.type === 'warn' ? '#fbbf24' : '#60a5fa', borderLeft: `2px solid ${a.type === 'error' ? '#ef4444' : a.type === 'warn' ? '#f59e0b' : '#3b82f6'}` }}>{a.msg}{isNew && <span className="text-[8px] font-bold text-accent-orange bg-[#f9731620] px-1 rounded-sm">NEW</span>}</div>; })}
        {oa.filter(a => !na.find(n => n.msg === a.msg)).map((a, i) => <div key={`r${i}`} className="text-[10px] px-[7px] py-[3px] rounded-[3px] mb-0.5 bg-[#0f1f0f] text-success-light line-through opacity-70 border-l-2 border-l-[#22c55e]">{a.msg} <span className="text-[8px] font-bold">RESOLVED</span></div>)}
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
    <div className="fixed inset-0 z-[2000] bg-base-800 overflow-y-auto font-sans">
      {/* Top bar */}
      <div className="sticky top-0 z-10 px-7 py-3 flex items-center justify-between bg-[linear-gradient(135deg,#1a1f2e,#0f1219)] border-b-2 border-b-accent-orange">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="px-3.5 py-1.5 rounded-md border border-base-400 bg-base-600 text-text-secondary cursor-pointer text-xs font-semibold flex items-center gap-1.5">{'\u2190'} Back to Builder</button>
          <h2 className="m-0 text-lg font-display text-accent-orange">Group Comparison</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-text-secondary uppercase">Compare vs:</span>
          {existingRotations.map((rot, ri) => <div key={ri} className="flex gap-0.5">{rot.groups.map((_, gi) => <button key={gi} onClick={() => onChangeOldSource(ri, gi)} className="px-[7px] py-1 rounded text-[9px] font-semibold font-mono cursor-pointer" style={{ border: selectedOldRot === ri && selectedOldGroup === gi ? `1px solid ${ACCENT}` : '1px solid #2a3040', background: selectedOldRot === ri && selectedOldGroup === gi ? ACCENT_FAINT : 'transparent', color: selectedOldRot === ri && selectedOldGroup === gi ? ACCENT : '#555' }}>{rot.name}{gi+1}</button>)}</div>)}
          <div className="w-px h-6 bg-base-400" />
          {[{ id: 'value', label: 'Value' }, { id: 'intensity', label: 'Intensity' }].map(m => <button key={m.id} onClick={() => setColorMode(m.id)} className="px-2.5 py-1 rounded text-[10px] font-medium cursor-pointer" style={{ border: colorMode === m.id ? `1px solid ${ACCENT}` : '1px solid #2a3040', background: colorMode === m.id ? ACCENT_FAINT : 'transparent', color: colorMode === m.id ? ACCENT : '#888' }}>{m.label}</button>)}
          <div className="w-px h-6 bg-base-400" />
          <select value={localStart || ''} onChange={e => setLocalStart(e.target.value || null)} className="px-2 py-1 rounded text-[10px] border border-base-400 bg-base-800 cursor-pointer font-mono max-w-[180px] text-accent-orange">
            <option value="">No start</option>
            {(startLocations||[]).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="px-7 py-6 max-w-[1400px] mx-auto">
        {/* Summary banner */}
        <div className="flex gap-4 mb-7 flex-wrap">
          {[
            { label: 'Avg Value', old: oldO.avgVal, new: newO.avgVal, u: '', b: true },
            { label: 'Total Walk', old: oldO.totalDist, new: newO.totalDist, u: 'm', b: false },
            { label: 'Max Walk', old: oldO.maxDist, new: newO.maxDist, u: 'm', b: false },
            { label: 'Indoor', old: oldO.indoorCount, new: newO.indoorCount, u: '', b: true },
            { label: 'Unique Activities', old: oldO.uniqueActivities, new: newO.uniqueActivities, u: '', b: true },
          ].map(m => {
            const d = m.new - m.old; const imp = m.b ? d > 0 : d < 0; const reg = m.b ? d < 0 : d > 0;
            return <div key={m.label} className="flex-[1_1_160px] px-[18px] py-3.5 rounded-[10px] bg-base-700 border border-base-500">
              <div className="text-[9px] text-text-muted uppercase mb-1.5">{m.label}</div>
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold font-mono text-text-muted">{m.old}{m.u}</span>
                <span className="text-base text-text-faint">{'\u2192'}</span>
                <span className="text-[22px] font-bold font-mono text-text-primary">{m.new}{m.u}</span>
              </div>
              {d !== 0 && <div className="text-[11px] font-bold mt-1 font-mono" style={{ color: imp ? '#34d399' : reg ? '#f87171' : '#555' }}>{d > 0 ? '+' : ''}{d}{m.u} {imp ? '\u25B2' : '\u25BC'}</div>}
            </div>;
          })}
        </div>

        {/* Activity diff */}
        <div className="px-5 py-4 rounded-[10px] mb-6 bg-base-700 border border-base-500">
          <div className="text-[13px] font-bold text-text-primary font-display mb-3">Activity Changes</div>
          <div className="flex gap-5 flex-wrap">
            {added.length > 0 && <div><div className="text-[9px] text-success-light uppercase font-bold mb-1.5">+ Added ({added.length})</div><div className="flex gap-1 flex-wrap">{added.map(a => { const m = lookupMeta(a, registry); return <div key={a} className="px-2.5 py-1 rounded-[5px] text-[10px] font-semibold bg-[#34d39915] border border-[#34d39930] text-success-light">{shortName(a)} <span className="font-mono opacity-70">V:{m?.value||'?'}</span></div>; })}</div></div>}
            {removed.length > 0 && <div><div className="text-[9px] text-error-light uppercase font-bold mb-1.5">- Removed ({removed.length})</div><div className="flex gap-1 flex-wrap">{removed.map(a => { const m = lookupMeta(a, registry); return <div key={a} className="px-2.5 py-1 rounded-[5px] text-[10px] font-semibold bg-[#f8717115] border border-[#f8717130] text-error-light line-through">{shortName(a)} <span className="font-mono opacity-70">V:{m?.value||'?'}</span></div>; })}</div></div>}
            {kept.length > 0 && <div><div className="text-[9px] text-text-secondary uppercase font-bold mb-1.5">Retained ({kept.length})</div><div className="flex gap-1 flex-wrap">{kept.map(a => <div key={a} className="px-2.5 py-1 rounded-[5px] text-[10px] font-medium bg-base-600 border border-base-400 text-text-secondary">{shortName(a)}</div>)}</div></div>}
            {!added.length && !removed.length && <div className="text-[11px] text-success-light">Identical activities - only ordering differs.</div>}
          </div>
        </div>

        {/* Schedule strips */}
        <div className="mb-7"><ScheduleStrip group={oldGroup} timeSlots={timeSlots} daySlices={daySlices} registry={registry} distMatrix={distMatrix} startLocation={localStart} label={oldLabel} color="#888" colorMode={colorMode} /></div>
        <div className="mb-7"><ScheduleStrip group={newGroup} timeSlots={timeSlots} daySlices={daySlices} registry={registry} distMatrix={distMatrix} startLocation={localStart} label={newLabel} color={ACCENT} colorMode={colorMode} /></div>

        {/* Per-day breakdown */}
        <h3 className="text-[15px] font-display mb-3.5 text-accent-orange">Day-by-Day Comparison</h3>
        <div className="flex gap-4 flex-wrap mb-7">
          {daySlices.map((d, di) => <ComparisonDayCard key={d.name} dayName={d.name} oldStats={oldO.dayStats[di]} newStats={newO.dayStats[di]} color={DAY_COLORS?.[d.name] || DAY_COLORS?.[di] || '#888'} slotCount={d.end - d.start} />)}
        </div>

        {/* Slot diff */}
        <h3 className="text-[15px] font-display mb-3.5 text-accent-orange">Slot-by-Slot Diff</h3>
        <div className="overflow-x-auto bg-base-700 rounded-[10px] border border-base-500 p-4">
          <table className="w-full border-separate border-spacing-0.5">
            <thead><tr><th className="text-[9px] text-text-faint text-left px-2 py-1 min-w-[40px]" />{timeSlots.map((ts, i) => { const ds = getDaySlice(i, daySlices); const isF = daySlices.some(d => d.start === i); return <th key={i} className="text-[8px] text-text-faint text-center px-0.5 py-[3px] font-mono whitespace-nowrap" style={{ borderLeft: isF && i > 0 ? '2px solid #2a3040' : 'none' }}><div className="text-[7px] text-text-dim">{ds?.name?.substring(0, 3)}</div>{ts.time}</th>; })}</tr></thead>
            <tbody>
              <tr><td className="text-[9px] text-text-secondary font-semibold px-2 py-1">OLD</td>{oldGroup.map((act, i) => { const ch = act !== newGroup[i]; const isF = daySlices.some(d => d.start === i); return <td key={i} className="p-0.5 text-center" style={{ borderLeft: isF && i > 0 ? '2px solid #2a3040' : 'none' }}><div className={`text-[9px] font-semibold px-1 py-1.5 rounded ${ch ? 'bg-[#f8717110] text-error-light border border-[#f8717125]' : 'bg-base-600 text-text-secondary border border-base-500'}`}>{shortName(act) || '\u2014'}</div></td>; })}</tr>
              <tr><td className="text-[9px] font-semibold px-2 py-1 text-accent-orange">NEW</td>{newGroup.map((act, i) => { const ch = act !== oldGroup[i]; const isF = daySlices.some(d => d.start === i); return <td key={i} className="p-0.5 text-center" style={{ borderLeft: isF && i > 0 ? '2px solid #2a3040' : 'none' }}><div className="text-[9px] font-semibold px-1 py-1.5 rounded" style={{ background: ch ? `${ACCENT}15` : '#1a1f2e', color: ch ? ACCENT : '#888', border: ch ? `1px solid ${ACCENT}30` : '1px solid #1e2636' }}>{shortName(act) || '\u2014'}</div></td>; })}</tr>
              <tr><td className="text-[8px] text-text-faint px-2 py-0.5">{'\u0394'}</td>{newGroup.map((act, i) => { const same = act === oldGroup[i]; const isF = daySlices.some(d => d.start === i); return <td key={i} className="text-center p-0.5" style={{ borderLeft: isF && i > 0 ? '2px solid #2a3040' : 'none' }}><div className="text-[10px] font-bold" style={{ color: same ? '#333' : ACCENT }}>{same ? '\u00B7' : '\u2260'}</div></td>; })}</tr>
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
    <div className="bg-base-700 rounded-[10px] border border-base-500 p-4 mt-4">
      <div className="text-[13px] font-bold text-text-primary font-display mb-2.5">Validation Issues ({all.length})</div>
      <div className="flex flex-col gap-1 max-h-[200px] overflow-auto">
        {all.filter(e => e.severity === 'error').map((e, i) => <div key={`e${i}`} className="text-[11px] px-2.5 py-1 rounded bg-[#dc262612] text-error-light flex gap-2 items-center"><span className="text-[9px] font-bold px-[5px] rounded-[3px]" style={{ background: ROT_COLORS[e.rot] + '30', color: ROT_COLORS[e.rot] }}>Rot {e.rot}</span><span className="font-semibold">G{e.row+1}</span><span className="text-[#f8717199]">{e.msg}</span></div>)}
        {all.filter(e => e.severity === 'warn').map((e, i) => <div key={`w${i}`} className="text-[11px] px-2.5 py-1 rounded bg-[#f59e0b08] text-warning flex gap-2 items-center"><span className="text-[9px] font-bold px-[5px] rounded-[3px]" style={{ background: ROT_COLORS[e.rot] + '30', color: ROT_COLORS[e.rot] }}>Rot {e.rot}</span><span className="font-semibold">G{e.row+1}</span><span className="text-[#fbbf2499]">{e.msg}</span></div>)}
      </div>
    </div>
  );
}

/* ===================== FULL TABLE COMPARISON ===================== */

function TableComparisonRow({ label, oldVal, newVal, unit, higherIsBetter, format }) {
  const fmt = format || (v => v);
  const delta = typeof newVal === 'number' && typeof oldVal === 'number' ? +(newVal - oldVal).toFixed(1) : 0;
  const improved = higherIsBetter ? delta > 0 : delta < 0;
  const regressed = higherIsBetter ? delta < 0 : delta > 0;
  const dc = delta === 0 ? '#555' : improved ? '#34d399' : regressed ? '#f87171' : '#555';
  return (
    <tr>
      <td className="px-3 py-2 text-[11px] text-text-secondary border-b border-base-500">{label}</td>
      <td className="px-3 py-2 text-[13px] font-semibold font-mono text-text-secondary text-center border-b border-base-500">{fmt(oldVal)}{unit || ''}</td>
      <td className="px-3 py-2 text-[13px] font-bold font-mono text-text-primary text-center border-b border-base-500">{fmt(newVal)}{unit || ''}</td>
      <td className="px-3 py-2 text-xs font-bold font-mono text-center border-b border-base-500" style={{ color: dc }}>
        {delta !== 0 ? `${delta > 0 ? '+' : ''}${fmt(delta)}${unit || ''}` : '\u2014'}
        {delta !== 0 && <span className="ml-1 text-[9px]">{improved ? '\u25B2' : '\u25BC'}</span>}
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

  const dashStats = rotations.map(rot => ({
    name: rot.name,
    ...computeTableAverages(rot.groups, daySlices, registry, distMatrix, startLoc),
  }));

  const builderA = aFull ? computeTableAverages(groupsA, daySlices, registry, distMatrix, startLoc) : null;
  const builderB = bFull ? computeTableAverages(groupsB, daySlices, registry, distMatrix, startLoc) : null;

  const pairs = [];
  if (builderA && dashStats[0]) pairs.push({ label: 'A', builderStats: builderA, dashStat: dashStats[0], color: ROT_COLORS.A });
  if (builderB && dashStats[dashStats.length > 1 ? 1 : 0]) pairs.push({ label: 'B', builderStats: builderB, dashStat: dashStats[dashStats.length > 1 ? 1 : 0], color: ROT_COLORS.B });

  return (
    <div className="mt-7">
      <h3 className="text-base font-display mb-4 flex items-center gap-2 text-accent-orange">
        <div className="w-1 h-[22px] rounded-sm bg-accent-orange" />
        Full Table Comparison
        <span className="text-[10px] font-normal text-text-faint font-sans ml-2">Averages across all groups</span>
      </h3>

      {pairs.map(({ label, builderStats, dashStat, color }) => (
        <div key={label} className="bg-base-700 rounded-xl overflow-hidden mb-5" style={{ border: `1px solid ${color}30` }}>
          {/* Header */}
          <div className="px-5 py-3 flex items-center gap-3" style={{ background: `linear-gradient(135deg, ${color}10, transparent)`, borderBottom: `1px solid ${color}20` }}>
            <div className="text-[15px] font-bold font-display" style={{ color }}>
              Rotation {label}
            </div>
            <span className="text-[10px] text-text-muted font-mono">
              Dashboard ({dashStat.groupCount} groups) vs Builder ({builderStats.groupCount} groups)
            </span>
          </div>

          <div className="px-2 pb-4">
            {/* Overall averages table */}
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="px-3 py-2.5 text-[9px] text-text-faint uppercase tracking-wide text-left border-b-2 border-base-400">Metric</th>
                  <th className="px-3 py-2.5 text-[9px] text-text-secondary uppercase tracking-wide text-center border-b-2 border-base-400">Dashboard</th>
                  <th className="px-3 py-2.5 text-[9px] uppercase tracking-wide text-center border-b-2 border-base-400 text-accent-orange">Builder</th>
                  <th className="px-3 py-2.5 text-[9px] text-text-faint uppercase tracking-wide text-center border-b-2 border-base-400">Delta</th>
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
            <div className="mt-4 text-[11px] font-bold text-text-secondary px-3 pb-2 font-display">Per Day</div>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="px-3 py-1.5 text-[9px] text-text-faint text-left border-b border-base-400">Day</th>
                  <th colSpan={2} className="px-3 py-1.5 text-[9px] text-text-faint text-center border-b border-base-400">Avg Value</th>
                  <th colSpan={2} className="px-3 py-1.5 text-[9px] text-text-faint text-center border-b border-base-400">Avg Walk</th>
                  <th colSpan={2} className="px-3 py-1.5 text-[9px] text-text-faint text-center border-b border-base-400">Avg Max Walk</th>
                  <th colSpan={2} className="px-3 py-1.5 text-[9px] text-text-faint text-center border-b border-base-400">Avg Indoor</th>
                </tr>
                <tr>
                  <th />
                  {['Avg Value', 'Avg Walk', 'Avg Max Walk', 'Avg Indoor'].map(h => <React.Fragment key={h}>
                    <th className="px-1.5 py-1 text-[8px] text-text-muted text-center">Dash</th>
                    <th className="px-1.5 py-1 text-[8px] text-center text-accent-orange">Build</th>
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
                      <td className="px-1.5 py-1.5 text-[11px] font-mono text-text-secondary text-center border-b border-base-500">{oldV}{unit||''}</td>
                      <td className="px-1.5 py-1.5 text-[11px] font-mono font-semibold text-center border-b border-base-500" style={{ color: d === 0 ? '#888' : imp ? '#34d399' : reg ? '#f87171' : '#e8e6e1' }}>{newV}{unit||''}{d !== 0 && <span className="text-[8px] ml-0.5">{imp ? '\u25B2' : '\u25BC'}</span>}</td>
                    </>;
                  };
                  return (
                    <tr key={dd.name}>
                      <td className="px-3 py-1.5 text-[11px] font-semibold border-b border-base-500 whitespace-nowrap" style={{ color: dayColor }}>
                        <span className="inline-block w-[3px] h-3 rounded-sm mr-1.5 align-middle" style={{ background: dayColor }} />
                        {dd.name} <span className="text-[9px] text-text-faint font-normal">({dd.slots})</span>
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

  const [activityRotAssign, setActivityRotAssign] = useState(() => persistedState?.activityRotAssign ?? {});
  const [paletteRotFilter, setPaletteRotFilter] = useState(() => persistedState?.paletteRotFilter ?? 'all');

  const [clipboard, setClipboard] = useState(() => persistedState?.clipboard ?? null);
  const [selectionStart, setSelectionStart] = useState(null);
  const [selectionEnd, setSelectionEnd] = useState(null);
  const [isSelecting, setIsSelecting] = useState(false);

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

  const isActivityAllowedForRot = useCallback((activityName, rot) => {
    const assign = activityRotAssign[activityName];
    if (!assign || assign === 'both') return true;
    return assign === rot;
  }, [activityRotAssign]);

  const handleRotAssign = useCallback((activityName, rot) => {
    setActivityRotAssign(prev => {
      const current = prev[activityName];
      if (current === rot) {
        const next = { ...prev };
        delete next[activityName];
        return next;
      }
      return { ...prev, [activityName]: rot };
    });
  }, []);

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

  const getGroupForCell = useCallback((rot, row, col) => {
    for (const [groupId, group] of Object.entries(cellGroups)) {
      if (group.cells.some(c => c.rot === rot && c.row === row && c.col === col)) {
        return { groupId, ...group };
      }
    }
    return null;
  }, [cellGroups]);

  const handleCopy = useCallback(() => {
    const bounds = getSelectionBounds();
    if (!bounds) return;
    const groups = bounds.rot === 'A' ? groupsA : groupsB;
    const cells = [];

    let commonGroupColor = null;
    let allInSameGroup = true;

    for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
      for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
        cells.push({ row: r - bounds.minRow, col: c - bounds.minCol, activity: groups[r]?.[c] || '' });

        const cellGroup = getGroupForCell(bounds.rot, r, c);
        if (cellGroup) {
          if (commonGroupColor === null) {
            commonGroupColor = cellGroup.color;
          } else if (commonGroupColor !== cellGroup.color) {
            allInSameGroup = false;
          }
        } else {
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

  const clearSelection = useCallback(() => {
    setSelectionStart(null);
    setSelectionEnd(null);
    setIsSelecting(false);
  }, []);

  const getUsedColors = useCallback(() => {
    return new Set(Object.values(cellGroups).map(g => g.color));
  }, [cellGroups]);

  const getNextGroupColor = useCallback(() => {
    const used = getUsedColors();
    for (const color of GROUP_COLORS) {
      if (!used.has(color)) return color;
    }
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
          if (isActivityAllowedForRot(cell.activity, targetRot)) {
            n[r][c] = cell.activity;
            pastedCells.push({ rot: targetRot, row: r, col: c });
          }
        }
      }
      return n;
    });

    if (clipboard.isGroup && clipboard.groupColor && pastedCells.length > 0) {
      setCellGroups(prev => {
        const updated = {};
        for (const [id, group] of Object.entries(prev)) {
          const remainingCells = group.cells.filter(cell =>
            !pastedCells.some(c => c.rot === cell.rot && c.row === cell.row && c.col === cell.col)
          );
          if (remainingCells.length > 0) {
            updated[id] = { ...group, cells: remainingCells };
          }
        }
        updated[`group-${nextGroupId}`] = { color: clipboard.groupColor, cells: pastedCells };
        return updated;
      });
      setNextGroupId(prev => prev + 1);
    }
  }, [clipboard, numCols, isActivityAllowedForRot, pushUndo, nextGroupId]);

  const handleDrop = useCallback((rot, row, col, act) => {
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
      n[srcRow][srcCol] = dstAct;
      return n;
    });
  }, [pushUndo]);
  const handleAddGroup = useCallback(rot => { pushUndo(); if (rot === 'A') { setNumGroupsA(n => n+1); setGroupsA(p => [...p, Array(numCols).fill('')]); } else { setNumGroupsB(n => n+1); setGroupsB(p => [...p, Array(numCols).fill('')]); } }, [pushUndo, numCols]);
  const handleRemoveGroup = useCallback(rot => { pushUndo(); if (rot === 'A') { setNumGroupsA(n => Math.max(1, n-1)); setGroupsA(p => p.length > 1 ? p.slice(0,-1) : p); } else { setNumGroupsB(n => Math.max(1, n-1)); setGroupsB(p => p.length > 1 ? p.slice(0,-1) : p); } }, [pushUndo]);
  const handleClearAll = useCallback(() => { pushUndo(); setGroupsA(Array.from({ length: numGroupsA }, () => Array(numCols).fill(''))); setGroupsB(Array.from({ length: numGroupsB }, () => Array(numCols).fill(''))); }, [pushUndo, numGroupsA, numGroupsB, numCols]);
  const handleImportRotation = useCallback((rot, idx) => { if (!rotations?.[idx]) return; pushUndo(); const s = rotations[idx]; const imp = s.groups.map(g => { const r = Array(numCols).fill(''); for (let c = 0; c < Math.min(g.length, numCols); c++) r[c] = g[c] || ''; return r; }); if (rot === 'A') { setGroupsA(imp); setNumGroupsA(imp.length); } else { setGroupsB(imp); setNumGroupsB(imp.length); } }, [rotations, pushUndo, numCols]);

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
    <div className="flex min-h-[calc(100vh-52px)] bg-base-800">
      {/* Palette */}
      <div className="w-[280px] shrink-0 bg-base-700 border-r border-base-500 flex flex-col overflow-hidden">
        <div className="px-3.5 pt-4 pb-3 border-b border-base-500">
          <div className="text-sm font-bold font-display mb-2.5 text-accent-orange">Activity Palette</div>
          <input type="text" placeholder="Filter activities..." value={paletteFilter} onChange={e => setPaletteFilter(e.target.value)} className="w-full px-2.5 py-[7px] rounded-md border border-base-400 bg-base-800 text-text-primary text-[11px] outline-none font-sans box-border" />
          <div className="flex gap-1 mt-2 flex-wrap">
            {[{ id: 'value', l: 'Value' }, { id: 'name', l: 'A-Z' }, { id: 'intensity', l: 'Intensity' }, { id: 'group', l: 'Group' }].map(s => <button key={s.id} onClick={() => setPaletteSort(s.id)} className="px-2 py-[3px] rounded text-[9px] cursor-pointer font-semibold" style={{ border: `1px solid ${paletteSort === s.id ? ACCENT : '#2a3040'}`, background: paletteSort === s.id ? ACCENT_FAINT : 'transparent', color: paletteSort === s.id ? ACCENT : '#666' }}>{s.l}</button>)}
          </div>
          {simGroups.length > 0 && <select value={paletteSimilarity} onChange={e => setPaletteSimilarity(e.target.value)} className="w-full px-2 py-[5px] rounded-md border border-base-400 bg-base-800 text-text-secondary text-[10px] mt-2 outline-none cursor-pointer"><option value="all">All Similarity Groups</option><option value="none">No Group</option>{simGroups.map(g => <option key={g} value={g}>{g}</option>)}</select>}
          {/* Rotation filter */}
          <div className="flex gap-1 mt-2 items-center">
            <span className="text-[9px] text-text-muted font-semibold">Show:</span>
            {[{ id: 'all', l: 'All', c: '#888' }, { id: 'A', l: 'Rot A', c: ROT_COLORS.A }, { id: 'B', l: 'Rot B', c: ROT_COLORS.B }, { id: 'unassigned', l: 'Unassigned', c: '#666' }].map(f => (
              <button key={f.id} onClick={() => setPaletteRotFilter(f.id)} className="px-1.5 py-[3px] rounded text-[9px] cursor-pointer font-semibold" style={{ border: `1px solid ${paletteRotFilter === f.id ? f.c : '#2a3040'}`, background: paletteRotFilter === f.id ? `${f.c}20` : 'transparent', color: paletteRotFilter === f.id ? f.c : '#555' }}>{f.l}</button>
            ))}
          </div>
        </div>
        {/* Clipboard indicator */}
        {clipboard && (
          <div className="px-3.5 py-2 flex items-center gap-2" style={{ background: clipboard.isGroup ? `${clipboard.groupColor}20` : '#a78bfa15', borderBottom: `1px solid ${clipboard.isGroup ? clipboard.groupColor + '50' : '#a78bfa30'}` }}>
            <span className="text-[10px] font-semibold" style={{ color: clipboard.isGroup ? clipboard.groupColor : '#a78bfa' }}>Clipboard:</span>
            <span className="text-[10px] text-text-primary">{clipboard.width}x{clipboard.height} cells{clipboard.isGroup && ' (group)'}</span>
            <button onClick={() => { setClipboard(null); clearSelection(); }} className="ml-auto text-[10px] text-text-secondary bg-transparent border-none cursor-pointer">Clear</button>
          </div>
        )}
        {/* Selection indicator */}
        {getSelectionBounds() && (
          <div className="px-3.5 py-2 bg-[#a78bfa10] flex items-center gap-2 border-b border-b-[#a78bfa20]">
            <span className="text-[10px] text-accent-purple font-semibold">Selected:</span>
            <span className="text-[10px] text-text-primary">{(getSelectionBounds().maxRow - getSelectionBounds().minRow + 1)}x{(getSelectionBounds().maxCol - getSelectionBounds().minCol + 1)}</span>
            <button onClick={handleCreateGroup} className="ml-auto px-2 py-0.5 rounded-[3px] text-[9px] border border-success-light bg-[#22c55e20] text-success-light cursor-pointer font-semibold">Group</button>
            <button onClick={handleCopy} className="px-2 py-0.5 rounded-[3px] text-[9px] border border-accent-purple bg-[#a78bfa20] text-accent-purple cursor-pointer font-semibold">Copy</button>
            <button onClick={clearSelection} className="text-[10px] text-text-secondary bg-transparent border-none cursor-pointer">x</button>
          </div>
        )}
        {/* Cell Groups panel */}
        {Object.keys(cellGroups).length > 0 && (
          <div className="px-3.5 py-2 bg-base-800 border-b border-base-500">
            <div className="text-[9px] text-text-muted font-semibold mb-1.5 uppercase tracking-wide">Cell Groups ({Object.keys(cellGroups).length})</div>
            <div className="flex flex-col gap-1">
              {Object.entries(cellGroups).map(([id, group]) => (
                <div key={id} className="flex items-center gap-1.5 px-2 py-1 rounded" style={{ background: `${group.color}15`, border: `1px solid ${group.color}40` }}>
                  <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: group.color }} />
                  <span className="text-[10px] text-text-primary flex-1">{group.cells.length} cells</span>
                  <span className="text-[9px] text-text-muted">Rot {group.cells[0]?.rot}</span>
                  <button onClick={() => handleCopyGroup(id)} className="px-[5px] py-[1px] rounded-sm text-[8px] border border-[#a78bfa50] bg-transparent text-accent-purple cursor-pointer font-semibold">Copy</button>
                  <button onClick={() => handleDeleteGroup(id)} className="text-[9px] text-text-secondary bg-transparent border-none cursor-pointer">{'\u00D7'}</button>
                </div>
              ))}
            </div>
          </div>
        )}
        {selectedActivity && <div className="px-3.5 py-2 flex items-center gap-2 bg-[#f9731615] border-b border-b-[#f9731630]"><span className="text-[10px] font-semibold text-accent-orange">Click-placing:</span><span className="text-[11px] text-text-primary font-bold font-sans">{shortName(selectedActivity)}</span><button onClick={() => setSelectedActivity(null)} className="ml-auto text-[10px] text-text-secondary bg-transparent border-none cursor-pointer">x</button></div>}
        <div className="flex-1 overflow-auto px-2.5 py-2 flex flex-col gap-1">
          {filteredActivities.map(a => <ActivityChip key={a.name} name={a.name} meta={a.meta} simGroup={a.simGroup} simColorMap={simColorMap} compact={false} onDragStart={n => setDropPreview(n)} onClick={n => setSelectedActivity(p => p === n ? null : n)} style={selectedActivity === a.name ? { border: `1.5px solid ${ACCENT}`, background: ACCENT_FAINT } : {}} rotAssign={activityRotAssign[a.name]} onRotAssign={handleRotAssign} disabled={paletteRotFilter !== 'all' && paletteRotFilter !== 'unassigned' && activityRotAssign[a.name] && activityRotAssign[a.name] !== paletteRotFilter} />)}
          {!filteredActivities.length && <div className="text-[11px] text-text-faint text-center p-5">No matches</div>}
        </div>
        <div className="px-3.5 py-2 border-t border-base-500 text-[10px] text-text-faint text-center">{filteredActivities.length} / {activityList.length} | {Object.keys(activityRotAssign).length} assigned</div>
      </div>

      {/* Main */}
      <div className="flex-1 overflow-auto px-6 py-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-xl font-[800] text-text-primary font-display">Matrix Builder<span className="text-[11px] text-text-faint font-normal ml-2.5 font-sans">Drag activities into cells {'\u00B7'} fill a row to compare</span></div>
          <div className="flex gap-2 items-center">
            {rotations?.length > 0 && <div className="flex gap-1">{rotations.map((rot, idx) => <div key={idx} className="flex gap-0.5"><button onClick={() => handleImportRotation('A', idx)} className="px-2.5 py-[5px] rounded-[5px] text-[10px] border border-base-400 bg-base-600 text-text-secondary cursor-pointer font-semibold">Import {rot.name} {'\u2192'} A</button><button onClick={() => handleImportRotation('B', idx)} className="px-2.5 py-[5px] rounded-[5px] text-[10px] border border-base-400 bg-base-600 text-text-secondary cursor-pointer font-semibold">Import {rot.name} {'\u2192'} B</button></div>)}</div>}
            <button onClick={() => setShowCrossValidation(v => !v)} className="px-2.5 py-[5px] rounded-[5px] text-[10px] cursor-pointer font-semibold" style={{ border: `1px solid ${showCrossValidation ? ACCENT : '#2a3040'}`, background: showCrossValidation ? ACCENT_FAINT : 'transparent', color: showCrossValidation ? ACCENT : '#666' }}>Cross-Rot {showCrossValidation ? 'ON' : 'OFF'}</button>
            <button onClick={handleUndo} disabled={!undoStack.length} className={`px-2.5 py-[5px] rounded-[5px] text-[10px] border border-base-400 bg-base-600 font-semibold ${undoStack.length ? 'text-text-secondary cursor-pointer' : 'text-text-dim cursor-not-allowed'}`}>{'\u21A9'} Undo ({undoStack.length})</button>
            <button onClick={handleClearAll} className="px-2.5 py-[5px] rounded-[5px] text-[10px] border border-[#dc262640] bg-[#dc262610] text-error-light cursor-pointer font-semibold">Clear All</button>
          </div>
        </div>

        {crossErrors.length > 0 && <div className="px-4 py-2.5 rounded-lg mb-4 bg-[#dc262610] border border-[#dc262630]"><div className="text-[11px] font-bold text-error-light mb-1.5">Cross-Rotation Conflicts ({crossErrors.length})</div>{crossErrors.slice(0, 5).map((e, i) => <div key={i} className="text-[10px] text-[#f8717199] mb-0.5">{e.msg}</div>)}{crossErrors.length > 5 && <div className="text-[10px] text-[#f8717160]">...and {crossErrors.length - 5} more</div>}</div>}

        <RotationMatrix rotLabel="A" rotColor={ROT_COLORS.A} groups={groupsA} numGroups={numGroupsA} timeSlots={timeSlots} daySlices={daySlices} registry={registry} similarities={similarities} simColorMap={simColorMap} errors={errorsA} dropPreview={dropPreview} onDrop={(r, c, a) => handleDrop('A', r, c, a)} onClear={(r, c) => handleClear('A', r, c)} onMove={(sr, sc, dr, dc) => handleMove('A', sr, sc, dr, dc)} onAddGroup={() => handleAddGroup('A')} onRemoveGroup={() => handleRemoveGroup('A')} onCompareRow={handleCompareRow} isInSelection={isInSelection} onSelectionStart={(rot, r, c) => { setSelectionStart({ rot, row: r, col: c }); setSelectionEnd({ rot, row: r, col: c }); setIsSelecting(true); }} onSelectionMove={(rot, r, c) => { if (isSelecting && selectionStart?.rot === rot) setSelectionEnd({ rot, row: r, col: c }); }} onPaste={handlePaste} hasClipboard={!!clipboard} isActivityAllowed={(act) => isActivityAllowedForRot(act, 'A')} onSave={onSave ? () => handleSaveToDashboard('A') : null} selectedActivity={selectedActivity} onClickPlace={(r, c, a) => handleDrop('A', r, c, a)} getGroupColor={getGroupColor} />
        <div className="h-5" />
        <RotationMatrix rotLabel="B" rotColor={ROT_COLORS.B} groups={groupsB} numGroups={numGroupsB} timeSlots={timeSlots} daySlices={daySlices} registry={registry} similarities={similarities} simColorMap={simColorMap} errors={errorsB} dropPreview={dropPreview} onDrop={(r, c, a) => handleDrop('B', r, c, a)} onClear={(r, c) => handleClear('B', r, c)} onMove={(sr, sc, dr, dc) => handleMove('B', sr, sc, dr, dc)} onAddGroup={() => handleAddGroup('B')} onRemoveGroup={() => handleRemoveGroup('B')} onCompareRow={handleCompareRow} isInSelection={isInSelection} onSelectionStart={(rot, r, c) => { setSelectionStart({ rot, row: r, col: c }); setSelectionEnd({ rot, row: r, col: c }); setIsSelecting(true); }} onSelectionMove={(rot, r, c) => { if (isSelecting && selectionStart?.rot === rot) setSelectionEnd({ rot, row: r, col: c }); }} onPaste={handlePaste} hasClipboard={!!clipboard} isActivityAllowed={(act) => isActivityAllowedForRot(act, 'B')} onSave={onSave ? () => handleSaveToDashboard('B') : null} selectedActivity={selectedActivity} onClickPlace={(r, c, a) => handleDrop('B', r, c, a)} getGroupColor={getGroupColor} />

        <ErrorSummary errorsA={errorsA} errorsB={errorsB} />

        <div className="flex gap-4 mt-5 flex-wrap">
          {[{ label: 'Rotation A Fill', val: statsA, color: ROT_COLORS.A }, { label: 'Rotation B Fill', val: statsB, color: ROT_COLORS.B }].map(s => <div key={s.label} className="px-5 py-3.5 bg-base-700 rounded-[10px] border border-base-500 flex-[1_1_200px]"><div className="text-[9px] text-text-muted uppercase mb-1">{s.label}</div><div className="text-[28px] font-bold font-mono" style={{ color: s.val.pct === 100 ? '#34d399' : s.color }}>{s.val.filled}/{s.val.total}<span className="text-xs text-text-faint ml-1.5">{s.val.pct}%</span></div></div>)}
          <div className="px-5 py-3.5 bg-base-700 rounded-[10px] border border-base-500 flex-[1_1_200px]"><div className="text-[9px] text-text-muted uppercase mb-1">Validation</div><div className="flex gap-3 items-baseline"><span className="text-[28px] font-bold font-mono" style={{ color: errorsA.length + errorsB.length === 0 ? '#34d399' : '#dc2626' }}>{errorsA.filter(e => e.severity === 'error').length + errorsB.filter(e => e.severity === 'error').length}</span><span className="text-[10px] text-text-muted">errors</span><span className="text-xl font-bold font-mono text-warning">{errorsA.filter(e => e.severity === 'warn').length + errorsB.filter(e => e.severity === 'warn').length}</span><span className="text-[10px] text-text-muted">warnings</span></div></div>
          <div className="px-5 py-3.5 bg-base-700 rounded-[10px] flex-[1_1_200px]" style={{ border: `1px solid ${crossErrors.length ? '#dc262640' : '#1e2636'}` }}><div className="text-[9px] text-text-muted uppercase mb-1">Cross-Rotation</div><div className="text-[28px] font-bold font-mono" style={{ color: crossErrors.length === 0 ? '#34d399' : '#dc2626' }}>{crossErrors.length}</div></div>
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
    </div>
  );
}
