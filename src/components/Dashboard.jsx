import React, { useState, useMemo } from 'react';
import {
  INTENSITY_COLORS, INTENSITY_TEXT, LOCATION_COLORS, DAY_COLORS,
  valueColor, valueTextColor,
} from '../constants/colors.js';
import { getDistance, getStartDistance, lookupMeta, shortName } from '../utils/parsers.js';


// Helpers

/** Parse staff string like "(1/2)", "(4/4)", "(1/2) + float" -> { min, ideal } */
function parseStaff(staffStr) {
  if (!staffStr || !staffStr.trim()) return { min: 0, ideal: 0 };
  const m = staffStr.match(/\((\d+)\s*\/\s*(\d+)\)/);
  if (!m) return { min: 0, ideal: 0 };
  return { min: parseInt(m[1], 10), ideal: parseInt(m[2], 10) };
}

/** Escape a value for CSV (wrap in quotes if contains comma, newline, or quote) */
function escapeCSV(val) {
  if (val == null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

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

function DistanceBadge({ dist }) {
  if (dist === null || dist === undefined) return null;
  let color = '#059669', bg = '#ecfdf5';
  if (dist > 600) { color = '#dc2626'; bg = '#fef2f2'; }
  else if (dist > 400) { color = '#d97706'; bg = '#fffbeb'; }
  else if (dist > 200) { color = '#6b7280'; bg = '#f3f4f6'; }
  return (
    <div style={{
      fontSize: 9, color, background: bg, borderRadius: 3,
      padding: '1px 4px', textAlign: 'center', fontWeight: 600,
      lineHeight: '14px', minWidth: 28, fontFamily: "'DM Mono', monospace",
    }}>
      {dist}m
    </div>
  );
}

function DayStatsCard({ dayName, stats, color, slotCount }) {
  const alerts = [];
  if (stats.maxConsecutiveIntense >= 3)
    alerts.push({ type: 'error', msg: `${stats.maxConsecutiveIntense} consecutive intense` });
  else if (stats.maxConsecutiveIntense === 2)
    alerts.push({ type: 'warn', msg: '2 back-to-back intense' });
  if (stats.maxDist > 700) alerts.push({ type: 'error', msg: `Long walk: ${stats.maxDist}m` });
  else if (stats.maxDist > 500) alerts.push({ type: 'warn', msg: `Far walk: ${stats.maxDist}m` });
  if (stats.indoorCount === 0 && slotCount >= 3) alerts.push({ type: 'info', msg: 'No indoor option' });

  return (
    <div style={{
      flex: '1 1 220px', background: '#141924', borderRadius: 10,
      border: '1px solid #1e2636', padding: 18, minWidth: 200,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{ width: 4, height: 22, borderRadius: 2, background: color }} />
        <h4 style={{ margin: 0, fontSize: 15, fontFamily: "'Playfair Display', serif", color }}>{dayName}</h4>
        <span style={{ fontSize: 10, color: '#555', marginLeft: 'auto' }}>{slotCount} slots</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Avg Value</div>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: stats.avgVal > 65 ? '#27ae60' : stats.avgVal > 45 ? '#d4a847' : '#e74c3c' }}>{stats.avgVal}</div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Walk Dist</div>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: '#aaa' }}>
            {stats.totalDist}<span style={{ fontSize: 10 }}>m</span>
            {stats.startDist !== null && stats.startDist !== undefined && (
              <span style={{ fontSize: 9, color: '#60a5fa', marginLeft: 4 }}>(+{stats.startDist})</span>
            )}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Max Walk</div>
          <div style={{ fontSize: 17, fontWeight: 600, fontFamily: "'DM Mono', monospace", color: stats.maxDist > 600 ? '#e74c3c' : stats.maxDist > 400 ? '#d97706' : '#888' }}>{stats.maxDist}<span style={{ fontSize: 10 }}>m</span></div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Indoor</div>
          <div style={{ fontSize: 17, fontWeight: 600, fontFamily: "'DM Mono', monospace", color: stats.indoorCount > 0 ? '#8e44ad' : '#555' }}>{stats.indoorCount}</div>
        </div>
      </div>
      {/* Intensity flow */}
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Intensity Flow</div>
        <div style={{ display: 'flex', gap: 3 }}>
          {stats.intensities.map((int, i) => (
            <div key={i} style={{ flex: 1, height: 8, borderRadius: 3, background: INTENSITY_COLORS[int] || '#333' }} title={int} />
          ))}
        </div>
      </div>
      {alerts.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {alerts.map((a, i) => (
            <div key={i} style={{
              fontSize: 10, padding: '3px 7px', borderRadius: 3, marginBottom: 2,
              background: a.type === 'error' ? '#3d1111' : a.type === 'warn' ? '#3d2e11' : '#112a3d',
              color: a.type === 'error' ? '#f87171' : a.type === 'warn' ? '#fbbf24' : '#60a5fa',
              borderLeft: `2px solid ${a.type === 'error' ? '#ef4444' : a.type === 'warn' ? '#f59e0b' : '#3b82f6'}`,
            }}>
              {a.msg}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DetailPanel({ activity, registry, distMatrix, onClose }) {
  const meta = lookupMeta(activity, registry);
  if (!meta) return (
    <div style={{
      position: 'fixed', top: 0, right: 0, width: 360, height: '100vh',
      background: '#1a1f2e', zIndex: 1000, borderLeft: '3px solid #d4a847',
      boxShadow: '-4px 0 30px rgba(0,0,0,0.5)', overflowY: 'auto', padding: 24,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontFamily: "'Playfair Display', serif", color: '#d4a847' }}>{registry.nameMap[activity] || activity}</h2>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#999', fontSize: 22, cursor: 'pointer' }}>&times;</button>
      </div>
      <div style={{ fontSize: 12, color: '#e74c3c', padding: '8px 12px', background: '#3d1111', borderRadius: 6 }}>
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

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, width: 360, height: '100vh',
      background: '#1a1f2e', color: '#e8e6e1', zIndex: 1000,
      boxShadow: '-4px 0 30px rgba(0,0,0,0.5)', overflowY: 'auto',
      fontFamily: "'DM Sans', sans-serif", borderLeft: '3px solid #d4a847',
    }}>
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontFamily: "'Playfair Display', serif", color: '#d4a847', lineHeight: 1.3 }}>{cn}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#999', fontSize: 22, cursor: 'pointer', padding: '0 4px' }}>&times;</button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <span style={{ background: meta.io === 'Indoor' ? '#8e44ad' : '#27ae60', color: '#fff', padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{meta.io}</span>
          <span style={{ background: INTENSITY_COLORS[meta.intensity] || '#333', color: INTENSITY_TEXT[meta.intensity] || '#fff', padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{meta.intensity}</span>
          <span style={{ background: '#2a3040', color: '#aaa', padding: '3px 10px', borderRadius: 4, fontSize: 11 }}>{meta.season}</span>
        </div>
        {/* Value bar */}
        <div style={{ background: 'linear-gradient(135deg, #2a3040, #1e2636)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Customer Value</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 36, fontWeight: 700, color: '#d4a847', fontFamily: "'DM Mono', monospace" }}>{meta.value}</div>
            <div style={{ flex: 1, background: '#1a1f2e', borderRadius: 4, height: 8 }}>
              <div style={{ width: `${meta.value}%`, height: '100%', borderRadius: 4, background: 'linear-gradient(90deg, #8b6914, #d4a847)' }} />
            </div>
          </div>
        </div>
        {[['Location Zone', meta.location], ['Staff Required', meta.staff], ['Setup Time', meta.setup], ['Scalability', meta.scalable], ['UID', meta.uid]].map(([label, val]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #2a3040' }}>
            <span style={{ fontSize: 12, color: '#888' }}>{label}</span>
            <span style={{ fontSize: 13, color: '#e8e6e1', fontWeight: 500 }}>{val || 'â€”'}</span>
          </div>
        ))}
        {/* Nearest activities */}
        {nearest.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Nearest Activities</div>
            {nearest.map(([name, dist]) => (
              <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 12 }}>
                <span style={{ color: '#bbb' }}>{shortName(name)}</span>
                <span style={{ color: dist < 200 ? '#27ae60' : dist < 500 ? '#d4a847' : '#e74c3c', fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{dist}m</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------
// Day stats computation
// -----------------------------------------

function computeDayStats(group, start, end, registry, distMatrix, startLocation) {
  const slice = group.slice(start, end);
  const vals = slice.map(a => lookupMeta(a, registry)?.value ?? 0);
  const avgVal = slice.length ? Math.round(vals.reduce((s, v) => s + v, 0) / slice.length) : 0;

  let totalDist = 0, maxDist = 0, consecutiveIntense = 0, maxConsecutiveIntense = 0;
  let startDist = null;

  // Add start â†’ first activity distance
  if (startLocation && slice.length > 0) {
    startDist = getStartDistance(startLocation, slice[0], distMatrix, registry.nameMap);
    if (startDist !== null) { totalDist += startDist; maxDist = Math.max(maxDist, startDist); }
  }

  for (let i = 0; i < slice.length; i++) {
    const meta = lookupMeta(slice[i], registry);
    if (meta?.intensity === 'Intense') {
      consecutiveIntense++;
      maxConsecutiveIntense = Math.max(maxConsecutiveIntense, consecutiveIntense);
    } else {
      consecutiveIntense = 0;
    }
    if (i > 0) {
      const d = getDistance(slice[i - 1], slice[i], distMatrix, registry.nameMap);
      if (d !== null) { totalDist += d; maxDist = Math.max(maxDist, d); }
    }
  }

  const indoorCount = slice.filter(a => lookupMeta(a, registry)?.io === 'Indoor').length;
  const intensities = slice.map(a => lookupMeta(a, registry)?.intensity || 'Unknown');
  return { avgVal, totalDist, maxDist, maxConsecutiveIntense, indoorCount, intensities, startDist };
}

// -----------------------------------------
// Main Dashboard
// -----------------------------------------

export default function Dashboard({ registry, distMatrix, rotations, timeSlots, daySlices, startLocations, editFlags, useEdited, onToggleEdited, onClearEdit }) {
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
    if (!meta) return { background: '#333', color: '#e74c3c' };
    if (colorMode === 'value') return { background: valueColor(meta.value), color: valueTextColor(meta.value) };
    if (colorMode === 'intensity') return { background: INTENSITY_COLORS[meta.intensity] || '#333', color: INTENSITY_TEXT[meta.intensity] || '#fff' };
    if (colorMode === 'io') return { background: meta.io === 'Indoor' ? '#6c3483' : '#1e8449', color: '#fff' };
    if (colorMode === 'location') return { background: LOCATION_COLORS[meta.location] || '#555', color: '#fff' };
    return { background: '#333', color: '#ccc' };
  }

  const dayColors = daySlices.map(d => DAY_COLORS[d.name] || '#d4a847');

  return (
    <div style={{ background: '#0f1219', color: '#e8e6e1', fontFamily: "'DM Sans', sans-serif" }}>

      {/* -- Controls -- */}
      <div style={{ padding: '10px 28px', background: '#141924', borderBottom: '1px solid #1e2636', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Rotation selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {rotations.map((r, i) => {
            const hasEdit = !!(editFlags && editFlags[i]);
            return (
            <button key={i} onClick={() => setRotIdx(i)} style={{
              padding: '5px 14px', borderRadius: 5, border: '1px solid',
              borderColor: rotIdx === i ? '#d4a847' : '#2a3040',
              background: rotIdx === i ? '#d4a847' : 'transparent',
              color: rotIdx === i ? '#0f1219' : '#888',
              fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              Rot {r.name}
              {hasEdit && (
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: '#22d3ee', flexShrink: 0,
                }} />
              )}
            </button>
            );
          })}
        </div>

        <div style={{ width: 1, height: 24, background: '#2a3040' }} />

        {/* Edit toggle â€” controls App-level state */}
        {hasAnyEdits && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={onToggleEdited} style={{
                padding: '5px 14px', borderRadius: 5, border: '1px solid',
                borderColor: useEdited ? '#22d3ee' : '#2a3040',
                background: useEdited ? 'rgba(34,211,238,0.10)' : 'transparent',
                color: useEdited ? '#22d3ee' : '#888',
                fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <span style={{ fontSize: 13, lineHeight: 1 }}>{useEdited ? '\u2611' : '\u2610'}</span>
                Edited
              </button>
              {useEdited && hasEditForRot && onClearEdit && (
                <button onClick={() => onClearEdit(rotIdx)} style={{
                  padding: '4px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                  border: '1px solid #dc262640', background: 'transparent',
                  color: '#dc2626', cursor: 'pointer', transition: 'all 0.2s',
                }}>Revert</button>
              )}
            </div>
            <div style={{ width: 1, height: 24, background: '#2a3040' }} />
          </>
        )}

        {/* Group selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginRight: 4 }}>Group</span>
          <button onClick={() => setFocusGroup('all')} style={{
            padding: '4px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: 'pointer',
            border: focusGroup === 'all' ? '1px solid #d4a847' : '1px solid #2a3040',
            background: focusGroup === 'all' ? '#d4a847' : 'transparent',
            color: focusGroup === 'all' ? '#0f1219' : '#666', transition: 'all 0.2s',
          }}>All</button>
          {Array.from({ length: numGroups }, (_, i) => (
            <button key={i} onClick={() => setFocusGroup(i)} style={{
              padding: '4px 7px', borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: 'pointer',
              minWidth: 24, textAlign: 'center', fontFamily: "'DM Mono', monospace",
              border: focusGroup === i ? '1px solid #d4a847' : '1px solid #2a3040',
              background: focusGroup === i ? '#d4a847' : 'transparent',
              color: focusGroup === i ? '#0f1219' : '#666', transition: 'all 0.2s',
            }}>{i + 1}</button>
          ))}
        </div>

        <div style={{ width: 1, height: 24, background: '#2a3040' }} />

        {/* Color mode */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginRight: 4 }}>Color</span>
          {[{ key: 'value', label: 'Value' }, { key: 'intensity', label: 'Intensity' }, { key: 'io', label: 'In/Out' }, { key: 'location', label: 'Zone' }].map(m => (
            <button key={m.key} onClick={() => setColorMode(m.key)} style={{
              padding: '4px 10px', borderRadius: 4, fontSize: 10, fontWeight: 500, cursor: 'pointer',
              border: colorMode === m.key ? '1px solid #d4a847' : '1px solid #2a3040',
              background: colorMode === m.key ? '#2a2518' : 'transparent',
              color: colorMode === m.key ? '#d4a847' : '#888', transition: 'all 0.2s',
            }}>{m.label}</button>
          ))}
        </div>

        <div style={{ width: 1, height: 24, background: '#2a3040' }} />

        {/* Start location */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginRight: 4 }}>Start</span>
          <select
            value={startLocation || ''}
            onChange={(e) => setStartLocation(e.target.value || null)}
            style={{
              padding: '4px 8px', borderRadius: 4, fontSize: 10, fontWeight: 500,
              border: '1px solid #2a3040', background: '#0f1219', color: '#d4a847',
              cursor: 'pointer', fontFamily: "'DM Mono', monospace",
              maxWidth: 200,
            }}
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
            <div style={{ width: 1, height: 24, background: '#2a3040' }} />
            <button onClick={() => setShowWarnings(!showWarnings)} style={{
              padding: '4px 12px', borderRadius: 4, fontSize: 10, fontWeight: 600,
              border: '1px solid #f59e0b', background: showWarnings ? '#3d2e11' : 'transparent',
              color: '#fbbf24', cursor: 'pointer', transition: 'all 0.2s',
            }}>
              Ã¢Å¡Â  {registry.warnings.length} Name {registry.warnings.length === 1 ? 'Warning' : 'Warnings'}
            </button>
          </>
        )}

        {/* Export button */}
        <div style={{ width: 1, height: 24, background: '#2a3040' }} />
        <button 
          onClick={() => {
            const csv = generateExportCSV(rotations, timeSlots, daySlices);
            const timestamp = new Date().toISOString().slice(0, 10);
            downloadCSV(csv, `activity-matrix-${timestamp}.csv`);
          }}
          style={{
            padding: '4px 12px', borderRadius: 4, fontSize: 10, fontWeight: 600,
            border: '1px solid #3b82f6', background: 'transparent',
            color: '#60a5fa', cursor: 'pointer', transition: 'all 0.2s',
            display: 'flex', alignItems: 'center', gap: 5,
          }}
        >
          ↓ Export CSV
        </button>

        {/* Legend */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {colorMode === 'intensity' && Object.entries(INTENSITY_COLORS).map(([k, c]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: c }} />
              <span style={{ fontSize: 10, color: '#888' }}>{k}</span>
            </div>
          ))}
          {colorMode === 'value' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: '#888' }}>0</span>
              <div style={{ width: 80, height: 10, borderRadius: 2, background: 'linear-gradient(90deg, rgb(220,230,220), rgb(40,150,70))' }} />
              <span style={{ fontSize: 10, color: '#888' }}>100</span>
            </div>
          )}
          {colorMode === 'io' && ['Indoor', 'Outdoor'].map(t => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: t === 'Indoor' ? '#6c3483' : '#1e8449' }} />
              <span style={{ fontSize: 10, color: '#888' }}>{t}</span>
            </div>
          ))}
          {colorMode === 'location' && [...locationZones].map(k => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: LOCATION_COLORS[k] || '#555' }} />
              <span style={{ fontSize: 10, color: '#888' }}>{k}</span>
            </div>
          ))}
        </div>
      </div>

      {/* -- Warnings panel -- */}
      {showWarnings && registry.warnings.length > 0 && (
        <div style={{ padding: '14px 28px', background: '#1a1810', borderBottom: '1px solid #3d2e11' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24', marginBottom: 8 }}>Name Matching Warnings</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 8 }}>
            {registry.warnings.map((w, i) => (
              <div key={i} style={{
                padding: '8px 12px', background: '#141924', borderRadius: 6,
                border: '1px solid #2a3040', fontSize: 11,
              }}>
                <span style={{ color: '#fbbf24', fontWeight: 600 }}>[{w.source}]</span>{' '}
                <span style={{ color: '#e8e6e1' }}>"{w.name}"</span>{' '}
                <span style={{ color: '#888' }}>â€” {w.issue}</span>
                {w.suggestion && <span style={{ color: '#60a5fa' }}> â†’ "{w.suggestion}"</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edited data banner */}
      {useEdited && hasEditForRot && (
        <div style={{
          padding: '8px 28px', background: '#0c1a2a',
          borderBottom: '1px solid #22d3ee25',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%', background: '#22d3ee',
            boxShadow: '0 0 6px #22d3ee55',
          }} />
          <span style={{ fontSize: 11, color: '#22d3ee', fontWeight: 600 }}>
            Viewing edited schedule for Rotation {currentRot?.name}
          </span>
          <span style={{ fontSize: 10, color: '#555' }}>
            &mdash; toggle off to compare with original
          </span>
        </div>
      )}

      {/* -- Schedule Grid -- */}
      <div style={{ padding: '20px 28px', overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', minWidth: isSingleGroup ? 800 : 1050 }}>
          <thead>
            {/* Day headers */}
            <tr>
              {!isSingleGroup && <th style={{ width: 50 }} />}
              {daySlices.map((d, di) => (
                <React.Fragment key={d.name}>
                  {di > 0 && <th style={{ width: 20 }} />}
                  <th colSpan={d.end - d.start} style={{
                    textAlign: 'center', fontSize: 13, fontWeight: 700,
                    color: dayColors[di],
                    padding: '6px 0 2px',
                    borderBottom: `2px solid ${dayColors[di]}30`,
                    fontFamily: "'Playfair Display', serif", letterSpacing: 1,
                  }}>{d.name}</th>
                </React.Fragment>
              ))}
            </tr>
            {/* Time headers */}
            <tr>
              {!isSingleGroup && <th style={{ fontSize: 10, color: '#666', textAlign: 'center', padding: '4px 6px 10px', fontWeight: 500 }}>Grp</th>}
              {timeSlots.map((s, si) => {
                const isNewDay = dayBoundaries.has(si);
                return (
                  <React.Fragment key={si}>
                    {isNewDay && <th style={{ width: 20 }} />}
                    <th style={{
                      fontSize: 10, color: '#aaa', textAlign: 'center',
                      padding: '4px 4px 10px', fontWeight: 500,
                      fontFamily: "'DM Mono', monospace", whiteSpace: 'nowrap',
                    }}>{s.time}</th>
                  </React.Fragment>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {displayGroups.map(({ group, idx: gi }) => (
              <tr key={gi}>
                {!isSingleGroup && (
                  <td onClick={() => setFocusGroup(gi)} title={`Focus Group ${gi + 1}`} style={{
                    textAlign: 'center', fontWeight: 700, fontSize: 13, color: '#d4a847',
                    padding: '0 6px', fontFamily: "'DM Mono', monospace",
                    background: '#141924', position: 'sticky', left: 0, zIndex: 2, cursor: 'pointer',
                  }}>{gi + 1}</td>
                )}
                {group.map((activity, si) => {
                  const meta = lookupMeta(activity, registry);
                  const style = getCellStyle(activity);
                  const isNewDay = dayBoundaries.has(si);
                  const isFirstOfDay = daySlices.some(d => d.start === si);
                  const dist = (si > 0 && !isNewDay) ? getDistance(group[si - 1], activity, distMatrix, registry.nameMap) : null;
                  const startDist = (isFirstOfDay && startLocation) ? getStartDistance(startLocation, activity, distMatrix, registry.nameMap) : null;
                  const isHovered = hoveredCell?.g === gi && hoveredCell?.s === si;
                  const cellH = isSingleGroup ? 80 : 54;

                  return (
                    <React.Fragment key={si}>
                      {isNewDay && (
                        <td style={{ width: 20, background: 'transparent' }} />
                      )}
                      <td style={{ padding: '2px 1px', verticalAlign: 'top', position: 'relative' }}>
                        {dist !== null && (
                          <div style={{ position: 'absolute', top: '50%', left: -2, transform: 'translate(-50%, -50%)', zIndex: 3 }}>
                            <DistanceBadge dist={dist} />
                          </div>
                        )}
                        {startDist !== null && (
                          <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translate(-50%, -50%)', zIndex: 3 }}>
                            <div style={{
                              fontSize: 8, color: '#60a5fa', background: '#112a3d',
                              borderRadius: 3, padding: '1px 4px', fontWeight: 600,
                              fontFamily: "'DM Mono', monospace", whiteSpace: 'nowrap',
                              border: '1px solid #1e3a5f',
                            }}>
                              Ã¢â€“Â¸ {startDist}m
                            </div>
                          </div>
                        )}
                        <div
                          onClick={() => setSelectedActivity(activity)}
                          onMouseEnter={() => setHoveredCell({ g: gi, s: si })}
                          onMouseLeave={() => setHoveredCell(null)}
                          style={{
                            ...style, borderRadius: 6,
                            padding: isSingleGroup ? '10px 10px' : '6px 5px',
                            minHeight: cellH, cursor: 'pointer',
                            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                            transition: 'all 0.15s',
                            transform: isHovered ? 'scale(1.04)' : 'scale(1)',
                            boxShadow: isHovered ? '0 4px 16px rgba(0,0,0,0.4)' : 'none',
                            zIndex: isHovered ? 5 : 1, position: 'relative',
                            border: isHovered ? '1px solid rgba(255,255,255,0.3)' : meta ? '1px solid transparent' : '1px dashed #e74c3c55',
                          }}
                        >
                          <div style={{ fontSize: isSingleGroup ? 13 : 10, fontWeight: 600, lineHeight: 1.2, marginBottom: 2 }}>
                            {shortName(activity)}
                          </div>
                          {isSingleGroup && meta && (
                            <div style={{ fontSize: 9, opacity: 0.7, marginBottom: 2 }}>
                              {meta.intensity} Ã‚Â· {meta.setup} setup
                            </div>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                            <span style={{ fontSize: isSingleGroup ? 9 : 8, opacity: 0.75 }}>{(meta?.location || '').substring(0, 8)}</span>
                            <span style={{
                              fontSize: isSingleGroup ? 12 : 9, fontWeight: 700,
                              fontFamily: "'DM Mono', monospace",
                              background: 'rgba(0,0,0,0.2)', borderRadius: 3, padding: '1px 5px',
                            }}>{meta?.value ?? '?'}</span>
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
        <div style={{ padding: '0 28px 28px' }}>
          <h3 style={{ fontSize: 15, fontFamily: "'Playfair Display', serif", color: '#d4a847', marginBottom: 14 }}>
            Group {focusGroup + 1} â€” Day-by-Day Breakdown
          </h3>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {focusedDayStats.map((d, i) => (
              <DayStatsCard key={d.name} dayName={d.name} stats={d.stats} color={dayColors[i]} slotCount={d.end - d.start} />
            ))}
          </div>
        </div>
      )}

      {/* -- Per-Day Stats: All Groups aggregate -- */}
      {!isSingleGroup && (
        <div style={{ padding: '0 28px 28px' }}>
          <h3 style={{ fontSize: 15, fontFamily: "'Playfair Display', serif", color: '#d4a847', marginBottom: 14 }}>
            Per-Day Averages â€” All Groups
          </h3>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {daySlices.map((d, di) => {
              const allStats = schedule.map(g => computeDayStats(g, d.start, d.end, registry, distMatrix, startLocation));
              const avgVal = Math.round(allStats.reduce((s, st) => s + st.avgVal, 0) / allStats.length);
              const avgDist = Math.round(allStats.reduce((s, st) => s + st.totalDist, 0) / allStats.length);
              const maxDistWorst = Math.max(...allStats.map(s => s.maxDist));
              const intensityFlags = allStats.filter(s => s.maxConsecutiveIntense >= 2).length;
              return (
                <div key={d.name} style={{ flex: '1 1 220px', background: '#141924', borderRadius: 10, border: '1px solid #1e2636', padding: 18, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <div style={{ width: 4, height: 22, borderRadius: 2, background: dayColors[di] }} />
                    <h4 style={{ margin: 0, fontSize: 15, fontFamily: "'Playfair Display', serif", color: dayColors[di] }}>{d.name}</h4>
                    <span style={{ fontSize: 10, color: '#555', marginLeft: 'auto' }}>{d.end - d.start} slots</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Avg Value</div>
                      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: avgVal > 65 ? '#27ae60' : avgVal > 45 ? '#d4a847' : '#e74c3c' }}>{avgVal}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Avg Walk</div>
                      <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: '#aaa' }}>{avgDist}<span style={{ fontSize: 10 }}>m</span></div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Worst Max Walk</div>
                      <div style={{ fontSize: 17, fontWeight: 600, fontFamily: "'DM Mono', monospace", color: maxDistWorst > 600 ? '#e74c3c' : maxDistWorst > 400 ? '#d97706' : '#888' }}>{maxDistWorst}<span style={{ fontSize: 10 }}>m</span></div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Intensity Flags</div>
                      <div style={{ fontSize: 17, fontWeight: 600, fontFamily: "'DM Mono', monospace", color: intensityFlags > 0 ? '#e74c3c' : '#27ae60' }}>{intensityFlags}<span style={{ fontSize: 10 }}> / {numGroups}</span></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}


      {/* Staffing Requirements */}
      <div style={{ padding: '0 28px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: 15, fontFamily: "'Playfair Display', serif", color: '#d4a847', margin: 0 }}>
            Staffing Requirements
          </h3>

          {/* Group toggles */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => setStaffGroups(new Set(Array.from({ length: numGroups }, (_, i) => i)))} style={{
              padding: '3px 8px', borderRadius: 3, fontSize: 9, fontWeight: 600,
              border: '1px solid #2a3040', background: staffGroups.size === numGroups ? '#2a3040' : 'transparent',
              color: staffGroups.size === numGroups ? '#d4a847' : '#555',
              cursor: 'pointer', transition: 'all 0.2s',
            }}>All</button>
            <button onClick={() => setStaffGroups(new Set())} style={{
              padding: '3px 8px', borderRadius: 3, fontSize: 9, fontWeight: 600,
              border: '1px solid #2a3040', background: staffGroups.size === 0 ? '#2a3040' : 'transparent',
              color: staffGroups.size === 0 ? '#d4a847' : '#555',
              cursor: 'pointer', transition: 'all 0.2s',
            }}>None</button>
          </div>

          <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
            {Array.from({ length: numGroups }, (_, gi) => {
              const on = staffGroups.has(gi);
              return (
                <button key={gi} onClick={() => {
                  setStaffGroups(prev => {
                    const next = new Set(prev);
                    if (next.has(gi)) next.delete(gi); else next.add(gi);
                    return next;
                  });
                }} style={{
                  padding: '3px 6px', borderRadius: 3, fontSize: 9, fontWeight: 600,
                  minWidth: 22, textAlign: 'center', cursor: 'pointer',
                  fontFamily: "'DM Mono', monospace", transition: 'all 0.2s',
                  border: on ? '1px solid #d4a847' : '1px solid #2a3040',
                  background: on ? '#d4a847' : 'transparent',
                  color: on ? '#0f1219' : '#555',
                }}>{gi + 1}</button>
              );
            })}
          </div>

          <span style={{ fontSize: 10, color: '#555' }}>
            {staffGroups.size} of {numGroups} groups
          </span>

          {/* Separator */}
          <div style={{ width: 1, height: 20, background: '#2a3040' }} />

          {/* Day toggles */}
          <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
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
                }} style={{
                  padding: '3px 8px', borderRadius: 3, fontSize: 9, fontWeight: 600,
                  minWidth: 24, textAlign: 'center', cursor: 'pointer',
                  fontFamily: "'DM Mono', monospace", transition: 'all 0.2s',
                  border: on ? `1px solid ${dayColors[di]}` : '1px solid #2a3040',
                  background: on ? dayColors[di] : 'transparent',
                  color: on ? '#0f1219' : '#555',
                }}>{shortLabel}</button>
              );
            })}
          </div>

          <span style={{ fontSize: 10, color: '#555' }}>
            {staffDays.size} of {daySlices.length} days
          </span>
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
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
              <div key={d.name} style={{
                flex: '1 1 220px', background: '#141924', borderRadius: 10,
                border: '1px solid #1e2636', padding: 18, minWidth: 200,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <div style={{ width: 4, height: 22, borderRadius: 2, background: dayColors[di] }} />
                  <h4 style={{ margin: 0, fontSize: 15, fontFamily: "'Playfair Display', serif", color: dayColors[di] }}>{d.name}</h4>
                  <span style={{ fontSize: 10, color: '#555', marginLeft: 'auto' }}>{d.end - d.start} slots</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Peak Min</div>
                    <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: '#e8a838' }}>{peakMin}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Peak Ideal</div>
                    <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: '#d4a847' }}>{peakIdeal}</div>
                  </div>
                </div>

                <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Per Slot</div>
                {slotStaff.map(s => (
                  <div key={s.si} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '4px 0', borderBottom: '1px solid #1e2636',
                  }}>
                    <span style={{ fontSize: 10, color: '#888', fontFamily: "'DM Mono', monospace" }}>{s.time}</span>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, fontFamily: "'DM Mono', monospace", color: '#e8a838' }}>
                        {s.min}<span style={{ fontSize: 8, color: '#666', fontWeight: 400 }}> min</span>
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 600, fontFamily: "'DM Mono', monospace", color: '#d4a847' }}>
                        {s.ideal}<span style={{ fontSize: 8, color: '#666', fontWeight: 400 }}> ideal</span>
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
