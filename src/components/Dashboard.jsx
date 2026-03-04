import React, { useState, useMemo } from 'react';
import { useDashboard } from '../context/DashboardContext';
import {
  INTENSITY_COLORS, INTENSITY_TEXT, LOCATION_COLORS, DAY_COLORS,
  valueColor, valueTextColor,
} from '../constants/colors.js';
import { getDistance, getStartDistance, lookupMeta, shortName } from '../utils/parsers.js';
import { parseStaff, escapeCSV, computeDayStats } from '../utils/scheduleStats.js';
import DistanceBadge from './shared/DistanceBadge.jsx';


/**
 * Generate CSV content matching the Google Sheets format.
 * Format:
 *   - Row 1: Day headers spread across time slots
 *   - Row 2: Time headers (9:00 AM, 10:00 AM, etc.)
 *   - Activity rows: Rotation name, blank, Group number, activities...
 */
function generateExportCSV(rotations, timeSlots, daySlices) {
  const rows = [];
  const numSlots = timeSlots.length;

  // Build day header row: empty cells for label columns, then day names spread across their slots
  const dayRow = ['', '', ''];
  for (const day of daySlices) {
    const slotCount = day.end - day.start;
    dayRow.push(day.name);
    // Fill remaining slots for this day with empty
    for (let i = 1; i < slotCount; i++) {
      dayRow.push('');
    }
  }
  rows.push(dayRow.map(escapeCSV).join(','));

  // Build time header row
  const timeRow = ['', '', ''];
  for (const slot of timeSlots) {
    timeRow.push(slot.time);
  }
  rows.push(timeRow.map(escapeCSV).join(','));

  // Build rotation data rows
  for (const rot of rotations) {
    for (let gi = 0; gi < rot.groups.length; gi++) {
      const group = rot.groups[gi];
      const row = [];

      // First cell: rotation name only on first group
      row.push(gi === 0 ? `Activity Rotation ${rot.name}` : '');

      // Second cell: empty
      row.push('');

      // Third cell: group number
      row.push(gi + 1);

      // Activity cells
      for (let si = 0; si < numSlots; si++) {
        row.push(group[si] || '');
      }

      rows.push(row.map(escapeCSV).join(','));
    }

    // Add empty row between rotations for readability
    rows.push('');
  }

  return rows.join('\n');
}

/** Trigger browser download of CSV content */
function downloadCSV(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// -----------------------------------------
// Sub-components
// -----------------------------------------


function DayStatsCard({ dayName, stats, color, slotCount }) {
  const alerts = [];
  if (stats.maxConsecutiveIntense >= 3)
    alerts.push({ type: 'error', msg: `${stats.maxConsecutiveIntense} consecutive intense` });
  else if (stats.maxConsecutiveIntense === 2)
    alerts.push({ type: 'warn', msg: '2 back-to-back intense' });
  if (stats.maxDist > 700) alerts.push({ type: 'error', msg: `Long walk: ${stats.maxDist}m` });
  else if (stats.maxDist > 500) alerts.push({ type: 'warn', msg: `Far walk: ${stats.maxDist}m` });
  if (stats.indoorCount === 0 && slotCount >= 3) alerts.push({ type: 'info', msg: 'No indoor option' });

  const avgValColor = stats.avgVal > 65 ? '#27ae60' : stats.avgVal > 45 ? '#d4a847' : '#e74c3c';
  const maxDistColor = stats.maxDist > 600 ? '#e74c3c' : stats.maxDist > 400 ? '#d97706' : '#888';
  const indoorColor = stats.indoorCount > 0 ? '#8e44ad' : '#555';

  return (
    <div className="flex-[1_1_220px] bg-base-700 rounded-[10px] border border-base-500 p-[18px] min-w-[200px]">
      <div className="flex items-center gap-2 mb-3.5" style={{ '--day-color': color }}>
        <div className="w-1 h-[22px] rounded-sm bg-[var(--day-color)]" />
        <h4 className="m-0 text-[15px] font-display text-[var(--day-color)]">{dayName}</h4>
        <span className="text-[10px] text-text-faint ml-auto">{slotCount} slots</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="section-label text-text-muted mb-0.5">Avg Value</div>
          <div className="text-[22px] font-bold font-mono text-[var(--avg-color)]" style={{ '--avg-color': avgValColor }}>{stats.avgVal}</div>
        </div>
        <div>
          <div className="section-label text-text-muted mb-0.5">Walk Dist</div>
          <div className="text-[22px] font-bold font-mono text-[#aaa]">
            {stats.totalDist}<span className="text-[10px]">m</span>
            {stats.startDist !== null && stats.startDist !== undefined && (
              <span className="text-[9px] text-[#60a5fa] ml-1">(+{stats.startDist})</span>
            )}
          </div>
        </div>
        <div>
          <div className="section-label text-text-muted mb-0.5">Max Walk</div>
          <div className="text-[17px] font-semibold font-mono text-[var(--max-dist-color)]" style={{ '--max-dist-color': maxDistColor }}>{stats.maxDist}<span className="text-[10px]">m</span></div>
        </div>
        <div>
          <div className="section-label text-text-muted mb-0.5">Indoor</div>
          <div className="text-[17px] font-semibold font-mono text-[var(--indoor-color)]" style={{ '--indoor-color': indoorColor }}>{stats.indoorCount}</div>
        </div>
      </div>
      {/* Intensity flow */}
      <div className="mt-3">
        <div className="section-label text-text-muted mb-1">Intensity Flow</div>
        <div className="flex gap-[3px]">
          {stats.intensities.map((int, i) => (
            <div key={i} className="flex-1 h-2 rounded-[3px] bg-[var(--int-color)]" style={{ '--int-color': INTENSITY_COLORS[int] || '#333' }} title={int} />
          ))}
        </div>
      </div>
      {alerts.length > 0 && (
        <div className="mt-2.5">
          {alerts.map((a, i) => {
            const alertBg = a.type === 'error' ? '#3d1111' : a.type === 'warn' ? '#3d2e11' : '#112a3d';
            const alertColor = a.type === 'error' ? '#f87171' : a.type === 'warn' ? '#fbbf24' : '#60a5fa';
            const alertBorder = a.type === 'error' ? '#ef4444' : a.type === 'warn' ? '#f59e0b' : '#3b82f6';
            return (
              <div key={i}
                className="text-[10px] px-[7px] py-[3px] rounded-[3px] mb-0.5 bg-[var(--alert-bg)] text-[var(--alert-color)] border-l-2 border-l-[var(--alert-border)]"
                style={{ '--alert-bg': alertBg, '--alert-color': alertColor, '--alert-border': alertBorder }}
              >
                {a.msg}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DetailPanel({ activity, registry, distMatrix, onClose }) {
  const meta = lookupMeta(activity, registry);
  if (!meta) return (
    <div className="fixed top-0 right-0 w-[360px] h-screen bg-base-600 z-[1000] border-l-[3px] border-accent-gold shadow-[-4px_0_30px_rgba(0,0,0,0.5)] overflow-y-auto p-6">
      <div className="flex justify-between mb-5">
        <h2 className="m-0 text-lg font-display text-accent-gold">{registry.nameMap[activity] || activity}</h2>
        <button onClick={onClose} className="bg-transparent border-none text-[#999] text-[22px] cursor-pointer">&times;</button>
      </div>
      <div className="text-xs text-error-light px-3 py-2 bg-[#3d1111] rounded-md">
        No metadata found for this activity. Check name matching in the warnings panel.
      </div>
    </div>
  );

  // Find nearest activities from distance matrix
  const cn = registry.nameMap[activity] || activity;
  const allAliases = registry.canonical[cn]?.aliases || [cn];
  let distRow = null;
  for (const alias of allAliases) {
    if (distMatrix[alias]) { distRow = distMatrix[alias]; break; }
  }

  const nearest = distRow
    ? Object.entries(distRow)
        .filter(([k, v]) => v > 0 && (registry.nameMap[k] || k) !== cn)
        .sort((a, b) => a[1] - b[1])
        .slice(0, 5)
    : [];

  const ioBg = meta.io === 'Indoor' ? '#8e44ad' : '#27ae60';
  const intensityBg = INTENSITY_COLORS[meta.intensity] || '#333';
  const intensityText = INTENSITY_TEXT[meta.intensity] || '#fff';

  return (
    <div className="fixed top-0 right-0 w-[360px] h-screen bg-base-600 text-text-primary z-[1000] shadow-[-4px_0_30px_rgba(0,0,0,0.5)] overflow-y-auto font-sans border-l-[3px] border-accent-gold">
      <div className="p-6">
        <div className="flex justify-between items-start mb-5">
          <h2 className="m-0 text-xl font-display text-accent-gold leading-[1.3]">{cn}</h2>
          <button onClick={onClose} className="bg-transparent border-none text-[#999] text-[22px] cursor-pointer px-1">&times;</button>
        </div>
        <div className="flex gap-2 mb-5 flex-wrap">
          <span className="text-white px-2.5 py-[3px] rounded text-[11px] font-semibold bg-[var(--io-bg)]" style={{ '--io-bg': ioBg }}>{meta.io}</span>
          <span className="px-2.5 py-[3px] rounded text-[11px] font-semibold bg-[var(--int-bg)] text-[var(--int-text)]" style={{ '--int-bg': intensityBg, '--int-text': intensityText }}>{meta.intensity}</span>
          <span className="bg-base-400 text-[#aaa] px-2.5 py-[3px] rounded text-[11px]">{meta.season}</span>
        </div>
        {/* Value bar */}
        <div className="bg-gradient-to-br from-base-400 to-base-500 rounded-lg p-4 mb-4">
          <div className="text-[11px] text-text-secondary uppercase tracking-[1px] mb-1.5">Customer Value</div>
          <div className="flex items-center gap-3">
            <div className="text-4xl font-bold text-accent-gold font-mono">{meta.value}</div>
            <div className="flex-1 bg-base-600 rounded h-2">
              <div className="h-full rounded bg-gradient-to-r from-[#8b6914] to-[#d4a847] w-[var(--val-width)]" style={{ '--val-width': `${meta.value}%` }} />
            </div>
          </div>
        </div>
        {[['Location Zone', meta.location], ['Staff Required', meta.staff], ['Setup Time', meta.setup], ['Scalability', meta.scalable], ['UID', meta.uid]].map(([label, val]) => (
          <div key={label} className="flex justify-between py-2.5 border-b border-base-400">
            <span className="text-xs text-text-secondary">{label}</span>
            <span className="text-[13px] text-text-primary font-medium">{val || '\u2014'}</span>
          </div>
        ))}
        {/* Nearest activities */}
        {nearest.length > 0 && (
          <div className="mt-5">
            <div className="text-[11px] text-text-secondary uppercase tracking-[1px] mb-2.5">Nearest Activities</div>
            {nearest.map(([name, dist]) => {
              const distColor = dist < 200 ? '#27ae60' : dist < 500 ? '#d4a847' : '#e74c3c';
              return (
                <div key={name} className="flex justify-between py-1.5 text-xs">
                  <span className="text-[#bbb]">{shortName(name)}</span>
                  <span className="font-mono font-semibold text-[var(--dist-color)]" style={{ '--dist-color': distColor }}>{dist}m</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------
// Main Dashboard
// -----------------------------------------

export default function Dashboard({ rotations, editFlags, useEdited, onToggleEdited, onClearEdit }) {
  const { registry, distMatrix, timeSlots, daySlices, startLocations } = useDashboard();
  const [rotIdx, setRotIdx] = useState(0);
  const [colorMode, setColorMode] = useState('value');
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [focusGroup, setFocusGroup] = useState('all');
  const [showWarnings, setShowWarnings] = useState(false);
  const [startLocation, setStartLocation] = useState(startLocations?.[0] || null);

  // All possible start points: (start) entries first, then all distance matrix locations
  const allStartOptions = useMemo(() => {
    const distKeys = Object.keys(distMatrix).filter(k => !/^\(start\)/i.test(k));
    return [
      ...startLocations,
      ...distKeys,
    ];
  }, [distMatrix, startLocations]);

  // rotations is already the effective dataset (original or edited), resolved by App
  const currentRot = rotations[rotIdx] || rotations[0];
  const schedule = currentRot?.groups || [];
  const numGroups = schedule.length;
  const hasAnyEdits = editFlags && Object.keys(editFlags).length > 0;
  const hasEditForRot = !!(editFlags && editFlags[rotIdx]);

  // Staffing group selection (defaults all on)
  const [staffGroups, setStaffGroups] = useState(() => new Set(Array.from({ length: 12 }, (_, i) => i)));

  // Staffing day selection (defaults all on)
  const [staffDays, setStaffDays] = useState(() => new Set(daySlices.map((_, i) => i)));


  const displayGroups = focusGroup === 'all'
    ? schedule.map((g, i) => ({ group: g, idx: i }))
    : [{ group: schedule[focusGroup], idx: focusGroup }];
  const isSingleGroup = focusGroup !== 'all';

  // Determine which slot indices start a new day (for gap insertion)
  const dayBoundaries = new Set(daySlices.map(d => d.start).filter(s => s > 0));

  // Get the known location zones from metadata
  const locationZones = useMemo(() => {
    const zones = new Set();
    Object.values(registry.canonical).forEach(e => {
      if (e.metadata?.location) zones.add(e.metadata.location);
    });
    return zones;
  }, [registry]);

  // Single group day stats
  const focusedDayStats = useMemo(() => {
    if (!isSingleGroup) return null;
    return daySlices.map(d => ({
      ...d,
      stats: computeDayStats(schedule[focusGroup], d.start, d.end, registry, distMatrix, startLocation),
    }));
  }, [schedule, focusGroup, isSingleGroup, registry, distMatrix, daySlices, startLocation]);

  function getCellStyle(activity) {
    const meta = lookupMeta(activity, registry);
    if (!meta) return { '--cell-bg': '#333', '--cell-color': '#e74c3c' };
    if (colorMode === 'value') return { '--cell-bg': valueColor(meta.value), '--cell-color': valueTextColor(meta.value) };
    if (colorMode === 'intensity') return { '--cell-bg': INTENSITY_COLORS[meta.intensity] || '#333', '--cell-color': INTENSITY_TEXT[meta.intensity] || '#fff' };
    if (colorMode === 'io') return { '--cell-bg': meta.io === 'Indoor' ? '#6c3483' : '#1e8449', '--cell-color': '#fff' };
    if (colorMode === 'location') return { '--cell-bg': LOCATION_COLORS[meta.location] || '#555', '--cell-color': '#fff' };
    return { '--cell-bg': '#333', '--cell-color': '#ccc' };
  }

  const dayColors = daySlices.map(d => DAY_COLORS[d.name] || '#d4a847');

  return (
    <div className="bg-base-800 text-text-primary font-sans">

      {/* -- Controls -- */}
      <div className="px-7 py-2.5 bg-base-700 border-b border-base-500 flex gap-3 items-center flex-wrap">
        {/* Rotation selector */}
        <div className="flex items-center gap-1.5">
          {rotations.map((r, i) => {
            const hasEdit = !!(editFlags && editFlags[i]);
            return (
            <button key={i} onClick={() => setRotIdx(i)}
              className={`btn-sm flex items-center gap-1 transition-all duration-200 ${rotIdx === i ? 'border-accent-gold bg-accent-gold text-base-800' : 'border-base-400 bg-transparent text-text-secondary'}`}
            >
              Rot {r.name}
              {hasEdit && (
                <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan shrink-0" />
              )}
            </button>
            );
          })}
        </div>

        <div className="w-px h-6 bg-base-400" />

        {/* Edit toggle -- controls App-level state */}
        {hasAnyEdits && (
          <>
            <div className="flex items-center gap-1.5">
              <button onClick={onToggleEdited}
                className={`btn-sm flex items-center gap-[5px] transition-all duration-200 ${useEdited ? 'border-accent-cyan bg-accent-cyan/10 text-accent-cyan' : 'border-base-400 bg-transparent text-text-secondary'}`}
              >
                <span className="text-[13px] leading-none">{useEdited ? '\u2611' : '\u2610'}</span>
                Edited
              </button>
              {useEdited && hasEditForRot && onClearEdit && (
                <button onClick={() => onClearEdit(rotIdx)}
                  className="py-1 px-2.5 rounded text-[10px] font-semibold border border-error/25 bg-transparent text-error cursor-pointer transition-all duration-200"
                >Revert</button>
              )}
            </div>
            <div className="w-px h-6 bg-base-400" />
          </>
        )}

        {/* Group selector */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-text-secondary uppercase tracking-[1px] mr-1">Group</span>
          <button onClick={() => setFocusGroup('all')}
            className={`btn-pill transition-all duration-200 ${focusGroup === 'all' ? 'border border-accent-gold bg-accent-gold text-base-800' : 'border border-base-400 bg-transparent text-text-muted'}`}
          >All</button>
          {Array.from({ length: numGroups }, (_, i) => (
            <button key={i} onClick={() => setFocusGroup(i)}
              className={`btn-pill min-w-[24px] text-center font-mono transition-all duration-200 ${focusGroup === i ? 'border border-accent-gold bg-accent-gold text-base-800' : 'border border-base-400 bg-transparent text-text-muted'}`}
            >{i + 1}</button>
          ))}
        </div>

        <div className="w-px h-6 bg-base-400" />

        {/* Color mode */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-text-secondary uppercase tracking-[1px] mr-1">Color</span>
          {[{ key: 'value', label: 'Value' }, { key: 'intensity', label: 'Intensity' }, { key: 'io', label: 'In/Out' }, { key: 'location', label: 'Zone' }].map(m => (
            <button key={m.key} onClick={() => setColorMode(m.key)}
              className={`btn-pill font-medium transition-all duration-200 ${colorMode === m.key ? 'border border-accent-gold bg-[#2a2518] text-accent-gold' : 'border border-base-400 bg-transparent text-text-secondary'}`}
            >{m.label}</button>
          ))}
        </div>

        <div className="w-px h-6 bg-base-400" />

        {/* Start location */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-text-secondary uppercase tracking-[1px] mr-1">Start</span>
          <select
            value={startLocation || ''}
            onChange={(e) => setStartLocation(e.target.value || null)}
            className="py-1 px-2 rounded text-[10px] font-medium border border-base-400 bg-base-800 text-accent-gold cursor-pointer font-mono max-w-[200px]"
          >
            <option value="">None</option>
            {startLocations.length > 0 && (
              <optgroup label="Start Locations">
                {startLocations.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </optgroup>
            )}
            <optgroup label="All Locations">
              {allStartOptions.filter(s => !startLocations.includes(s)).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </optgroup>
          </select>
        </div>

        {/* Warnings toggle */}
        {registry.warnings.length > 0 && (
          <>
            <div className="w-px h-6 bg-base-400" />
            <button onClick={() => setShowWarnings(!showWarnings)}
              className={`btn-pill border border-[#f59e0b] transition-all duration-200 text-warning ${showWarnings ? 'bg-[#3d2e11]' : 'bg-transparent'}`}
            >
              &#x26A0; {registry.warnings.length} Name {registry.warnings.length === 1 ? 'Warning' : 'Warnings'}
            </button>
          </>
        )}

        {/* Export button */}
        <div className="w-px h-6 bg-base-400" />
        <button
          onClick={() => {
            const csv = generateExportCSV(rotations, timeSlots, daySlices);
            const timestamp = new Date().toISOString().slice(0, 10);
            downloadCSV(csv, `activity-matrix-${timestamp}.csv`);
          }}
          className="btn-pill border border-[#3b82f6] bg-transparent text-[#60a5fa] flex items-center gap-[5px] transition-all duration-200"
        >
          &darr; Export CSV
        </button>

        {/* Legend */}
        <div className="ml-auto flex gap-2.5 items-center flex-wrap">
          {colorMode === 'intensity' && Object.entries(INTENSITY_COLORS).map(([k, c]) => (
            <div key={k} className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm bg-[var(--legend-color)]" style={{ '--legend-color': c }} />
              <span className="text-[10px] text-text-secondary">{k}</span>
            </div>
          ))}
          {colorMode === 'value' && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-text-secondary">0</span>
              <div className="w-20 h-2.5 rounded-sm bg-gradient-to-r from-[rgb(220,230,220)] to-[rgb(40,150,70)]" />
              <span className="text-[10px] text-text-secondary">100</span>
            </div>
          )}
          {colorMode === 'io' && ['Indoor', 'Outdoor'].map(t => (
            <div key={t} className="flex items-center gap-1">
              <div className={`w-2.5 h-2.5 rounded-sm ${t === 'Indoor' ? 'bg-[#6c3483]' : 'bg-[#1e8449]'}`} />
              <span className="text-[10px] text-text-secondary">{t}</span>
            </div>
          ))}
          {colorMode === 'location' && [...locationZones].map(k => (
            <div key={k} className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm bg-[var(--loc-color)]" style={{ '--loc-color': LOCATION_COLORS[k] || '#555' }} />
              <span className="text-[10px] text-text-secondary">{k}</span>
            </div>
          ))}
        </div>
      </div>

      {/* -- Warnings panel -- */}
      {showWarnings && registry.warnings.length > 0 && (
        <div className="px-7 py-3.5 bg-[#1a1810] border-b border-[#3d2e11]">
          <div className="text-xs font-bold text-warning mb-2">Name Matching Warnings</div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-2">
            {registry.warnings.map((w, i) => (
              <div key={i} className="px-3 py-2 bg-base-700 rounded-md border border-base-400 text-[11px]">
                <span className="text-warning font-semibold">[{w.source}]</span>{' '}
                <span className="text-text-primary">"{w.name}"</span>{' '}
                <span className="text-text-secondary">&mdash; {w.issue}</span>
                {w.suggestion && <span className="text-[#60a5fa]"> &rarr; "{w.suggestion}"</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edited data banner */}
      {useEdited && hasEditForRot && (
        <div className="px-7 py-2 bg-[#0c1a2a] border-b border-accent-cyan/15 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-accent-cyan shadow-[0_0_6px_#22d3ee55]" />
          <span className="text-[11px] text-accent-cyan font-semibold">
            Viewing edited schedule for Rotation {currentRot?.name}
          </span>
          <span className="text-[10px] text-text-faint">
            &mdash; toggle off to compare with original
          </span>
        </div>
      )}

      {/* -- Schedule Grid -- */}
      <div className="px-7 py-5 overflow-x-auto">
        <table className={`border-separate border-spacing-0 w-full ${isSingleGroup ? 'min-w-[800px]' : 'min-w-[1050px]'}`}>
          <thead>
            {/* Day headers */}
            <tr>
              {!isSingleGroup && <th className="w-[50px]" />}
              {daySlices.map((d, di) => (
                <React.Fragment key={d.name}>
                  {di > 0 && <th className="w-5" />}
                  <th colSpan={d.end - d.start}
                    className="text-center text-[13px] font-bold pt-1.5 pb-0.5 font-display tracking-[1px] text-[var(--day-hdr-color)] border-b-2 border-b-[var(--day-hdr-border)]"
                    style={{ '--day-hdr-color': dayColors[di], '--day-hdr-border': dayColors[di] + '30' }}
                  >{d.name}</th>
                </React.Fragment>
              ))}
            </tr>
            {/* Time headers */}
            <tr>
              {!isSingleGroup && <th className="text-[10px] text-text-muted text-center px-1.5 pb-2.5 pt-1 font-medium">Grp</th>}
              {timeSlots.map((s, si) => {
                const isNewDay = dayBoundaries.has(si);
                return (
                  <React.Fragment key={si}>
                    {isNewDay && <th className="w-5" />}
                    <th className="text-[10px] text-[#aaa] text-center px-1 pb-2.5 pt-1 font-medium font-mono whitespace-nowrap">{s.time}</th>
                  </React.Fragment>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {displayGroups.map(({ group, idx: gi }) => (
              <tr key={gi}>
                {!isSingleGroup && (
                  <td onClick={() => setFocusGroup(gi)} title={`Focus Group ${gi + 1}`}
                    className="text-center font-bold text-[13px] text-accent-gold px-1.5 font-mono bg-base-700 sticky left-0 z-[2] cursor-pointer"
                  >{gi + 1}</td>
                )}
                {group.map((activity, si) => {
                  const meta = lookupMeta(activity, registry);
                  const cellVars = getCellStyle(activity);
                  const isNewDay = dayBoundaries.has(si);
                  const isFirstOfDay = daySlices.some(d => d.start === si);
                  const dist = (si > 0 && !isNewDay) ? getDistance(group[si - 1], activity, distMatrix, registry.nameMap) : null;
                  const startDist = (isFirstOfDay && startLocation) ? getStartDistance(startLocation, activity, distMatrix, registry.nameMap) : null;
                  const isHovered = hoveredCell?.g === gi && hoveredCell?.s === si;

                  return (
                    <React.Fragment key={si}>
                      {isNewDay && (
                        <td className="w-5 bg-transparent" />
                      )}
                      <td className="px-px py-0.5 align-top relative">
                        {dist !== null && (
                          <div className="absolute top-1/2 -left-0.5 -translate-x-1/2 -translate-y-1/2 z-[3]">
                            <DistanceBadge dist={dist} />
                          </div>
                        )}
                        {startDist !== null && (
                          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[3]">
                            <div className="text-[8px] text-[#60a5fa] bg-[#112a3d] rounded-[3px] px-1 py-px font-semibold font-mono whitespace-nowrap border border-[#1e3a5f]">
                              &#x25B8; {startDist}m
                            </div>
                          </div>
                        )}
                        <div
                          onClick={() => setSelectedActivity(activity)}
                          onMouseEnter={() => setHoveredCell({ g: gi, s: si })}
                          onMouseLeave={() => setHoveredCell(null)}
                          className={`rounded-md flex flex-col justify-between transition-all duration-150 relative cursor-pointer bg-[var(--cell-bg)] text-[var(--cell-color)] ${
                            isSingleGroup ? 'px-2.5 py-2.5 min-h-[80px]' : 'px-[5px] py-1.5 min-h-[54px]'
                          } ${
                            isHovered
                              ? 'scale-[1.04] shadow-[0_4px_16px_rgba(0,0,0,0.4)] z-[5] border border-white/30'
                              : meta ? 'scale-100 shadow-none z-[1] border border-transparent' : 'scale-100 shadow-none z-[1] border border-dashed border-[#e74c3c55]'
                          }`}
                          style={cellVars}
                        >
                          <div className={`font-semibold leading-[1.2] mb-0.5 ${isSingleGroup ? 'text-[13px]' : 'text-[10px]'}`}>
                            {shortName(activity)}
                          </div>
                          {isSingleGroup && meta && (
                            <div className="text-[9px] opacity-70 mb-0.5">
                              {meta.intensity} &middot; {meta.setup} setup
                            </div>
                          )}
                          <div className="flex justify-between items-center mt-auto">
                            <span className={`opacity-75 ${isSingleGroup ? 'text-[9px]' : 'text-[8px]'}`}>{(meta?.location || '').substring(0, 8)}</span>
                            <span className={`font-bold font-mono bg-black/20 rounded-[3px] px-[5px] py-px ${isSingleGroup ? 'text-[12px]' : 'text-[9px]'}`}>{meta?.value ?? '?'}</span>
                          </div>
                        </div>
                      </td>
                    </React.Fragment>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* -- Per-Day Stats: Single Group -- */}
      {isSingleGroup && focusedDayStats && (
        <div className="px-7 pb-7">
          <h3 className="text-[15px] font-display text-accent-gold mb-3.5">
            Group {focusGroup + 1} &mdash; Day-by-Day Breakdown
          </h3>
          <div className="flex gap-4 flex-wrap">
            {focusedDayStats.map((d, i) => (
              <DayStatsCard key={d.name} dayName={d.name} stats={d.stats} color={dayColors[i]} slotCount={d.end - d.start} />
            ))}
          </div>
        </div>
      )}

      {/* -- Per-Day Stats: All Groups aggregate -- */}
      {!isSingleGroup && (
        <div className="px-7 pb-7">
          <h3 className="text-[15px] font-display text-accent-gold mb-3.5">
            Per-Day Averages &mdash; All Groups
          </h3>
          <div className="flex gap-4 flex-wrap">
            {daySlices.map((d, di) => {
              const allStats = schedule.map(g => computeDayStats(g, d.start, d.end, registry, distMatrix, startLocation));
              const avgVal = Math.round(allStats.reduce((s, st) => s + st.avgVal, 0) / allStats.length);
              const avgDist = Math.round(allStats.reduce((s, st) => s + st.totalDist, 0) / allStats.length);
              const maxDistWorst = Math.max(...allStats.map(s => s.maxDist));
              const intensityFlags = allStats.filter(s => s.maxConsecutiveIntense >= 2).length;
              const avgValColor = avgVal > 65 ? '#27ae60' : avgVal > 45 ? '#d4a847' : '#e74c3c';
              const maxDistColor = maxDistWorst > 600 ? '#e74c3c' : maxDistWorst > 400 ? '#d97706' : '#888';
              const intFlagColor = intensityFlags > 0 ? '#e74c3c' : '#27ae60';
              return (
                <div key={d.name} className="flex-[1_1_220px] bg-base-700 rounded-[10px] border border-base-500 p-[18px] min-w-[200px]">
                  <div className="flex items-center gap-2 mb-3.5" style={{ '--day-color': dayColors[di] }}>
                    <div className="w-1 h-[22px] rounded-sm bg-[var(--day-color)]" />
                    <h4 className="m-0 text-[15px] font-display text-[var(--day-color)]">{d.name}</h4>
                    <span className="text-[10px] text-text-faint ml-auto">{d.end - d.start} slots</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="section-label text-text-muted mb-0.5">Avg Value</div>
                      <div className="text-[22px] font-bold font-mono text-[var(--avg-color)]" style={{ '--avg-color': avgValColor }}>{avgVal}</div>
                    </div>
                    <div>
                      <div className="section-label text-text-muted mb-0.5">Avg Walk</div>
                      <div className="text-[22px] font-bold font-mono text-[#aaa]">{avgDist}<span className="text-[10px]">m</span></div>
                    </div>
                    <div>
                      <div className="section-label text-text-muted mb-0.5">Worst Max Walk</div>
                      <div className="text-[17px] font-semibold font-mono text-[var(--max-dist-color)]" style={{ '--max-dist-color': maxDistColor }}>{maxDistWorst}<span className="text-[10px]">m</span></div>
                    </div>
                    <div>
                      <div className="section-label text-text-muted mb-0.5">Intensity Flags</div>
                      <div className="text-[17px] font-semibold font-mono text-[var(--flag-color)]" style={{ '--flag-color': intFlagColor }}>{intensityFlags}<span className="text-[10px]"> / {numGroups}</span></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}


      {/* Staffing Requirements */}
      <div className="px-7 pb-7">
        <div className="flex items-center gap-3 mb-3.5 flex-wrap">
          <h3 className="text-[15px] font-display text-accent-gold m-0">
            Staffing Requirements
          </h3>

          {/* Group toggles */}
          <div className="flex items-center gap-1">
            <button onClick={() => setStaffGroups(new Set(Array.from({ length: numGroups }, (_, i) => i)))}
              className={`px-2 py-[3px] rounded-[3px] text-[9px] font-semibold border border-base-400 cursor-pointer transition-all duration-200 ${staffGroups.size === numGroups ? 'bg-base-400 text-accent-gold' : 'bg-transparent text-text-faint'}`}
            >All</button>
            <button onClick={() => setStaffGroups(new Set())}
              className={`px-2 py-[3px] rounded-[3px] text-[9px] font-semibold border border-base-400 cursor-pointer transition-all duration-200 ${staffGroups.size === 0 ? 'bg-base-400 text-accent-gold' : 'bg-transparent text-text-faint'}`}
            >None</button>
          </div>

          <div className="flex gap-[3px] items-center">
            {Array.from({ length: numGroups }, (_, gi) => {
              const on = staffGroups.has(gi);
              return (
                <button key={gi} onClick={() => {
                  setStaffGroups(prev => {
                    const next = new Set(prev);
                    if (next.has(gi)) next.delete(gi); else next.add(gi);
                    return next;
                  });
                }}
                  className={`px-1.5 py-[3px] rounded-[3px] text-[9px] font-semibold min-w-[22px] text-center cursor-pointer font-mono transition-all duration-200 ${on ? 'border border-accent-gold bg-accent-gold text-base-800' : 'border border-base-400 bg-transparent text-text-faint'}`}
                >{gi + 1}</button>
              );
            })}
          </div>

          <span className="text-[10px] text-text-faint">
            {staffGroups.size} of {numGroups} groups
          </span>

          {/* Separator */}
          <div className="w-px h-5 bg-base-400" />

          {/* Day toggles */}
          <div className="flex gap-[3px] items-center">
            {daySlices.map((d, di) => {
              const on = staffDays.has(di);
              // Get short day label (M, T, W, Th, F, etc.)
              const shortLabel = d.name.charAt(0).toUpperCase();
              return (
                <button key={di} onClick={() => {
                  setStaffDays(prev => {
                    const next = new Set(prev);
                    if (next.has(di)) next.delete(di); else next.add(di);
                    return next;
                  });
                }}
                  className={`px-2 py-[3px] rounded-[3px] text-[9px] font-semibold min-w-[24px] text-center cursor-pointer font-mono transition-all duration-200 ${on ? 'border border-[var(--day-btn-color)] bg-[var(--day-btn-color)] text-base-800' : 'border border-base-400 bg-transparent text-text-faint'}`}
                  style={{ '--day-btn-color': dayColors[di] }}
                >{shortLabel}</button>
              );
            })}
          </div>

          <span className="text-[10px] text-text-faint">
            {staffDays.size} of {daySlices.length} days
          </span>
        </div>

        <div className="flex gap-4 flex-wrap">
          {daySlices.map((d, di) => {
            // Skip days that are not selected
            if (!staffDays.has(di)) return null;

            const slotStaff = [];
            for (let si = d.start; si < d.end; si++) {
              let slotMin = 0, slotIdeal = 0;
              for (const gi of staffGroups) {
                if (gi >= schedule.length) continue;
                const activity = schedule[gi]?.[si];
                if (!activity) continue;
                const meta = lookupMeta(activity, registry);
                const s = parseStaff(meta?.staff);
                slotMin += s.min;
                slotIdeal += s.ideal;
              }
              slotStaff.push({ si, time: timeSlots[si]?.time, min: slotMin, ideal: slotIdeal });
            }
            const peakMin = slotStaff.length ? Math.max(...slotStaff.map(s => s.min)) : 0;
            const peakIdeal = slotStaff.length ? Math.max(...slotStaff.map(s => s.ideal)) : 0;

            return (
              <div key={d.name} className="flex-[1_1_220px] bg-base-700 rounded-[10px] border border-base-500 p-[18px] min-w-[200px]">
                <div className="flex items-center gap-2 mb-3.5" style={{ '--day-color': dayColors[di] }}>
                  <div className="w-1 h-[22px] rounded-sm bg-[var(--day-color)]" />
                  <h4 className="m-0 text-[15px] font-display text-[var(--day-color)]">{d.name}</h4>
                  <span className="text-[10px] text-text-faint ml-auto">{d.end - d.start} slots</span>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3.5">
                  <div>
                    <div className="section-label text-text-muted mb-0.5">Peak Min</div>
                    <div className="text-[22px] font-bold font-mono text-[#e8a838]">{peakMin}</div>
                  </div>
                  <div>
                    <div className="section-label text-text-muted mb-0.5">Peak Ideal</div>
                    <div className="text-[22px] font-bold font-mono text-accent-gold">{peakIdeal}</div>
                  </div>
                </div>

                <div className="section-label text-text-muted mb-1.5">Per Slot</div>
                {slotStaff.map(s => (
                  <div key={s.si} className="flex items-center justify-between py-1 border-b border-base-500">
                    <span className="text-[10px] text-text-secondary font-mono">{s.time}</span>
                    <div className="flex gap-2.5">
                      <span className="text-[11px] font-semibold font-mono text-[#e8a838]">
                        {s.min}<span className="text-[8px] text-text-muted font-normal"> min</span>
                      </span>
                      <span className="text-[11px] font-semibold font-mono text-accent-gold">
                        {s.ideal}<span className="text-[8px] text-text-muted font-normal"> ideal</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* -- Detail Panel -- */}
      {selectedActivity && (
        <DetailPanel
          activity={selectedActivity}
          registry={registry}
          distMatrix={distMatrix}
          onClose={() => setSelectedActivity(null)}
        />
      )}
    </div>
  );
}
