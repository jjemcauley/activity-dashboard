import React, { useState, useMemo } from 'react';
import { useDashboard } from '../context/DashboardContext';
import {
  INTENSITY_COLORS, INTENSITY_TEXT, UNIQUE_COLORS, UNIQUE_TEXT,
  LOCATION_COLORS, DAY_COLORS, valueColor, valueTextColor,
} from '../constants/colors.js';
import { lookupMeta } from '../utils/parsers.js';
import { computeDayStats, escapeCSV } from '../utils/scheduleStats.js';

import DashboardNav from './dashboard/DashboardNav.jsx';
import WarningsPanel from './dashboard/WarningsPanel.jsx';
import DashboardGrid from './dashboard/DashboardGrid.jsx';
import { SingleGroupStats, AllGroupsStats, StaffingStats } from './dashboard/DashboardStats.jsx';
import ActivityDetailPanel from './dashboard/ActivityDetailPanel.jsx';


/**
 * Generate CSV content matching the Google Sheets format.
 */
function generateExportCSV(rotations, timeSlots, daySlices) {
  const rows = [];
  const numSlots = timeSlots.length;

  const dayRow = ['', '', ''];
  for (const day of daySlices) {
    const slotCount = day.end - day.start;
    dayRow.push(day.name);
    for (let i = 1; i < slotCount; i++) dayRow.push('');
  }
  rows.push(dayRow.map(escapeCSV).join(','));

  const timeRow = ['', '', ''];
  for (const slot of timeSlots) timeRow.push(slot.time);
  rows.push(timeRow.map(escapeCSV).join(','));

  for (const rot of rotations) {
    for (let gi = 0; gi < rot.groups.length; gi++) {
      const group = rot.groups[gi];
      const row = [gi === 0 ? `Activity Rotation ${rot.name}` : '', '', gi + 1];
      for (let si = 0; si < numSlots; si++) row.push(group[si] || '');
      rows.push(row.map(escapeCSV).join(','));
    }
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
// Main Dashboard (orchestrator)
// -----------------------------------------

export default function Dashboard({ rotations, editFlags, useEdited, onToggleEdited, onClearEdit }) {
  const { registry, distMatrix, timeSlots, daySlices, startLocations, foodLocations } = useDashboard();
  const [rotIdx, setRotIdx] = useState(0);
  const [colorMode, setColorMode] = useState('value');
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [focusGroup, setFocusGroup] = useState('all');
  const [showWarnings, setShowWarnings] = useState(false);
  const [startLocation, setStartLocation] = useState(null);

  const currentRot = rotations[rotIdx] || rotations[0];
  const schedule = currentRot?.groups || [];
  const numGroups = schedule.length;
  const hasAnyEdits = editFlags && Object.keys(editFlags).length > 0;
  const hasEditForRot = !!(editFlags && editFlags[rotIdx]);

  const [staffGroups, setStaffGroups] = useState(() => new Set(Array.from({ length: 12 }, (_, i) => i)));
  const [staffDays, setStaffDays] = useState(() => new Set(daySlices.map((_, i) => i)));

  const displayGroups = focusGroup === 'all'
    ? schedule.map((g, i) => ({ group: g, idx: i }))
    : [{ group: schedule[focusGroup], idx: focusGroup }];
  const isSingleGroup = focusGroup !== 'all';

  const dayBoundaries = new Set(daySlices.map(d => d.start).filter(s => s > 0));

  const locationZones = useMemo(() => {
    const zones = new Set();
    Object.values(registry.canonical).forEach(e => {
      if (e.metadata?.location) zones.add(e.metadata.location);
    });
    return zones;
  }, [registry]);

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
    if (colorMode === 'unique') return { '--cell-bg': UNIQUE_COLORS[meta.unique] || '#555', '--cell-color': UNIQUE_TEXT[meta.unique] || '#fff' };
    if (colorMode === 'io') return { '--cell-bg': meta.io === 'Indoor' ? '#6c3483' : '#1e8449', '--cell-color': '#fff' };
    if (colorMode === 'location') return { '--cell-bg': LOCATION_COLORS[meta.location] || '#555', '--cell-color': '#fff' };
    return { '--cell-bg': '#333', '--cell-color': '#ccc' };
  }

  const dayColors = daySlices.map(d => DAY_COLORS[d.name] || '#d4a847');

  const handleExport = () => {
    const csv = generateExportCSV(rotations, timeSlots, daySlices);
    const timestamp = new Date().toISOString().slice(0, 10);
    downloadCSV(csv, `activity-matrix-${timestamp}.csv`);
  };

  return (
    <div className="bg-base-800 text-text-primary font-sans">

      <DashboardNav
        rotations={rotations} rotIdx={rotIdx} setRotIdx={setRotIdx}
        editFlags={editFlags} hasAnyEdits={hasAnyEdits} hasEditForRot={hasEditForRot}
        useEdited={useEdited} onToggleEdited={onToggleEdited} onClearEdit={onClearEdit}
        focusGroup={focusGroup} setFocusGroup={setFocusGroup} numGroups={numGroups}
        colorMode={colorMode} setColorMode={setColorMode}
        startLocation={startLocation} setStartLocation={setStartLocation}
        startLocations={startLocations}
        showWarnings={showWarnings} setShowWarnings={setShowWarnings}
        warningCount={registry.warnings.length}
        locationZones={locationZones}
        onExport={handleExport}
      />

      <WarningsPanel warnings={registry.warnings} show={showWarnings} />

      {/* Edited data banner */}
      {useEdited && hasEditForRot && (
        <div className="px-7 py-2 bg-[#0c1a2a] border-b border-accent-cyan/15 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-accent-cyan shadow-[0_0_6px_#22d3ee55]" />
          <span className="text-[11px] text-accent-cyan font-semibold">
            Viewing edited schedule for Rotation {currentRot?.name}
          </span>
          <span className="text-[11px] text-text-faint">
            &mdash; toggle off to compare with original
          </span>
        </div>
      )}

      <DashboardGrid
        displayGroups={displayGroups} isSingleGroup={isSingleGroup}
        daySlices={daySlices} dayColors={dayColors} dayBoundaries={dayBoundaries}
        timeSlots={timeSlots} registry={registry} distMatrix={distMatrix}
        startLocation={startLocation} startLocations={startLocations} foodLocations={foodLocations}
        colorMode={colorMode} getCellStyle={getCellStyle}
        hoveredCell={hoveredCell} setHoveredCell={setHoveredCell}
        setSelectedActivity={setSelectedActivity} setFocusGroup={setFocusGroup}
      />

      {isSingleGroup && focusedDayStats && (
        <SingleGroupStats focusGroup={focusGroup} focusedDayStats={focusedDayStats} dayColors={dayColors} />
      )}

      {!isSingleGroup && (
        <AllGroupsStats
          schedule={schedule} daySlices={daySlices} dayColors={dayColors}
          numGroups={numGroups} registry={registry} distMatrix={distMatrix}
          startLocation={startLocation}
        />
      )}

      <StaffingStats
        schedule={schedule} daySlices={daySlices} dayColors={dayColors}
        numGroups={numGroups} timeSlots={timeSlots} registry={registry}
        staffGroups={staffGroups} setStaffGroups={setStaffGroups}
        staffDays={staffDays} setStaffDays={setStaffDays}
      />

      {selectedActivity && (
        <ActivityDetailPanel
          activity={selectedActivity} registry={registry}
          distMatrix={distMatrix} onClose={() => setSelectedActivity(null)}
        />
      )}
    </div>
  );
}
