import { useState, useEffect, useCallback, useMemo } from 'react';
import FileUploader from './components/FileUploader';
import Dashboard from './components/Dashboard';
import LiveEditor from './components/LiveEditor';
import Generator from './components/Generator';
import Builder from './components/Builder';
import { storage } from './utils/storage';
import {
  parseMetadata, parseDistances, parseSchedule, buildRegistry, parseSimilarities,
} from './utils/parsers';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', accent: '#d4a847' },
  { id: 'editor',    label: 'Live Editor', accent: '#22d3ee' },
  { id: 'builder',   label: 'Builder', accent: '#f97316' },
  { id: 'generator', label: 'Generator', accent: '#a78bfa' },
  { id: 'data',      label: 'Data', accent: '#34d399' },
];

/**
 * Process raw CSV texts into the structured data the dashboard needs.
 */
function processFiles(metaCSV, distCSV, schedCSV, simCSV = null) {
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

export default function App() {
  const [mode, setMode] = useState('loading');
  const [tab, setTab] = useState('dashboard');
  const [dashData, setDashData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [savedEdits, setSavedEdits] = useState({});
  const [useEdited, setUseEdited] = useState(true);

  // Builder state - lifted here for persistence across tab changes
  const [builderState, setBuilderState] = useState(null);

  // On mount: check localStorage for existing data
  useEffect(() => {
    if (storage.hasAllFiles()) {
      try {
        const data = processFiles(
          storage.loadCSV('metadata'),
          storage.loadCSV('distances'),
          storage.loadCSV('schedule'),
          storage.loadCSV('similarities'),
        );
        setDashData(data);
        setMode('app');
      } catch (e) {
        console.warn('Failed to load saved data, clearing:', e);
        storage.clearAll();
        setMode('upload');
      }
    } else {
      setMode('upload');
    }
  }, []);

  const handleFilesReady = useCallback((files) => {
    setLoadError(null);

    if (files === null) {
      if (storage.hasAllFiles()) {
        try {
          const data = processFiles(
            storage.loadCSV('metadata'),
            storage.loadCSV('distances'),
            storage.loadCSV('schedule'),
            storage.loadCSV('similarities'),
          );
          setDashData(data);
          setMode('app');
        } catch (e) {
          setLoadError(e.message);
        }
      }
      return;
    }

    try {
      storage.saveCSV('metadata', files.metadata);
      storage.saveCSV('distances', files.distances);
      storage.saveCSV('schedule', files.schedule);

      // Save similarities if provided, or clear if not
      if (files.similarities) {
        storage.saveCSV('similarities', files.similarities);
      } else {
        storage.clearCSV('similarities');
      }

      const data = processFiles(files.metadata, files.distances, files.schedule, files.similarities);

      storage.saveJSON('registry', {
        warnings: data.registry.warnings,
        canonicalNames: Object.keys(data.registry.canonical),
        nameMap: data.registry.nameMap,
      });

      setDashData(data);
      setMode('app');
    } catch (e) {
      setLoadError(e.message);
      throw e;
    }
  }, []);

  const handleReset = useCallback(() => {
    storage.clearAll();
    setDashData(null);
    setSavedEdits({});
    setMode('upload');
  }, []);

  const handleSaveEdits = useCallback((rotIdx, groups) => {
    setSavedEdits(prev => ({ ...prev, [rotIdx]: groups.map(g => [...g]) }));
  }, []);

  const handleClearEdit = useCallback((rotIdx) => {
    setSavedEdits(prev => {
      const next = { ...prev };
      delete next[rotIdx];
      return next;
    });
  }, []);

  // --- Single effective rotations array ---
  // Toggle lives here so Dashboard receives ONE consistent dataset
  const hasAnyEdits = Object.keys(savedEdits).length > 0;

  const effectiveRotations = useMemo(() => {
    if (!dashData) return [];
    if (!hasAnyEdits || !useEdited) return dashData.rotations;
    return dashData.rotations.map((rot, i) =>
      savedEdits[i]
        ? { ...rot, groups: savedEdits[i].map(g => [...g]) }
        : rot
    );
  }, [dashData, savedEdits, hasAnyEdits, useEdited]);

  // Per-rotation edit flags for UI indicators
  const editFlags = useMemo(() => {
    const flags = {};
    for (const key of Object.keys(savedEdits)) flags[key] = true;
    return flags;
  }, [savedEdits]);

  // --- Loading ---
  if (mode === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-3">
        <div className="text-xl font-display text-accent-gold">
          Loading...
        </div>
        <div className="text-xs text-text-muted">Checking for saved data</div>
      </div>
    );
  }

  // --- Upload ---
  if (mode === 'upload') {
    return (
      <FileUploader
        onFilesReady={handleFilesReady}
        hasExisting={storage.hasAllFiles()}
      />
    );
  }

  // --- Main app ---
  if (mode === 'app' && dashData) {
    const activeTab = TABS.find(t => t.id === tab) || TABS[0];
    const hasSimilarities = !!dashData.similarities;

    return (
      <div className="min-h-screen bg-base-800">

        {/* --- Top Nav Bar --- */}
        <div
          className="bg-gradient-to-br from-base-600 to-base-800 px-7 flex items-stretch justify-between"
          style={{ borderBottom: `2px solid ${activeTab.accent}` }}
        >
          <div className="flex items-stretch gap-0">
            <div className="flex items-center pr-7 mr-1 border-r border-base-500">
              <h1 className="m-0 text-lg font-display text-text-primary tracking-wide whitespace-nowrap">
                Fall Activity Matrix
                <span className="text-text-faint font-normal text-[13px] ml-2">SR 2026</span>
              </h1>
            </div>

            {TABS.map(t => {
              const active = tab === t.id;
              const showBadge = t.id === 'dashboard' && hasAnyEdits;
              const showSimBadge = t.id === 'generator' && hasSimilarities;
              const isDisabled = t.id === 'generator' && !hasSimilarities;

              return (
                <button
                  key={t.id}
                  onClick={() => !isDisabled && setTab(t.id)}
                  title={isDisabled ? 'Upload similarities file to enable' : undefined}
                  className={`py-3.5 px-5 bg-transparent border-0 border-b-3 border-solid text-[13px] font-sans -mb-0.5 flex items-center gap-1.5 transition-all duration-150 ${
                    active ? 'font-bold' : 'font-medium'
                  } ${
                    isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                  }`}
                  style={{
                    borderBottomColor: active ? t.accent : 'transparent',
                    color: isDisabled ? '#444' : active ? t.accent : '#666',
                  }}
                >
                  {t.label}
                  {showBadge && (
                    <span className="badge text-base-800 bg-accent-cyan">EDITED</span>
                  )}
                  {showSimBadge && (
                    <span className="badge text-base-800 bg-accent-purple">READY</span>
                  )}
                  {isDisabled && (
                    <span className="badge text-text-muted bg-base-400">NO DATA</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            {/* Similarities indicator */}
            {hasSimilarities && (
              <div className="text-[10px] text-accent-purple flex items-center gap-1">
                <span className="text-xs">{'\ud83d\uddc7'}</span>
                {Object.keys(dashData.similarities.groups).length} similarity groups
              </div>
            )}
            <button
              onClick={handleReset}
              className="py-1.5 px-3 rounded-md border border-base-400 bg-transparent text-text-faint text-[11px] cursor-pointer transition-all duration-150 font-sans"
            >{'\u21bb'} Re-upload</button>
          </div>
        </div>

        {/* --- Tab Content --- */}
        {tab === 'dashboard' && (
          <Dashboard
            registry={dashData.registry}
            distMatrix={dashData.distMatrix}
            rotations={effectiveRotations}
            timeSlots={dashData.timeSlots}
            daySlices={dashData.daySlices}
            startLocations={dashData.startLocations}
            editFlags={editFlags}
            useEdited={useEdited}
            onToggleEdited={() => setUseEdited(v => !v)}
            onClearEdit={handleClearEdit}
          />
        )}
        {tab === 'editor' && (
          <LiveEditor
            registry={dashData.registry}
            distMatrix={dashData.distMatrix}
            rotations={effectiveRotations}
            timeSlots={dashData.timeSlots}
            daySlices={dashData.daySlices}
            onSave={handleSaveEdits}
            savedEdits={savedEdits}
          />
        )}
        {tab === 'builder' && (
          <Builder
            registry={dashData.registry}
            distMatrix={dashData.distMatrix}
            rotations={effectiveRotations}
            timeSlots={dashData.timeSlots}
            daySlices={dashData.daySlices}
            similarities={dashData.similarities}
            startLocations={dashData.startLocations}
            onSave={handleSaveEdits}
            persistedState={builderState}
            onStateChange={setBuilderState}
          />
        )}
        {tab === 'generator' && hasSimilarities && (
          <Generator
            registry={dashData.registry}
            distMatrix={dashData.distMatrix}
            timeSlots={dashData.timeSlots}
            daySlices={dashData.daySlices}
            similarities={dashData.similarities}
            startLocations={dashData.startLocations}
          />
        )}
        {tab === 'data' && (
          <DataView
            registry={dashData.registry}
            similarities={dashData.similarities}
          />
        )}
      </div>
    );
  }

  return null;
}

/* ========================================================================
   INLINE DATA VIEW - Shows activities and their similarity groups
   ======================================================================== */

function DataView({ registry, similarities }) {
  // Build activity list with similarity info
  const activities = [];
  for (const [name, entry] of Object.entries(registry.canonical)) {
    if (entry.metadata) {
      activities.push({
        name,
        value: entry.metadata.value || 0,
        intensity: entry.metadata.intensity || 'Unknown',
        maxGroups: entry.metadata.maxGroups || 99,
        similarityGroup: similarities?.activityToGroup?.[name] || null,
      });
    }
  }

  // Sort by similarity group, then by name
  activities.sort((a, b) => {
    const groupA = a.similarityGroup || 'zzz_none';
    const groupB = b.similarityGroup || 'zzz_none';
    if (groupA !== groupB) return groupA.localeCompare(groupB);
    return a.name.localeCompare(b.name);
  });

  // Group activities by similarity group
  const grouped = {};
  const ungrouped = [];
  for (const act of activities) {
    if (act.similarityGroup) {
      if (!grouped[act.similarityGroup]) grouped[act.similarityGroup] = [];
      grouped[act.similarityGroup].push(act);
    } else {
      ungrouped.push(act);
    }
  }

  const groupNames = Object.keys(grouped).sort();

  return (
    <div className="p-7 bg-base-800 min-h-screen">
      <h2 className="m-0 mb-5 text-xl font-display text-accent-green">
        Activity Similarity Groups
      </h2>

      {!similarities ? (
        <div className="p-5 bg-[#1a1510] rounded-lg border border-accent-amber/25 text-accent-amber text-[13px]">
          {'\u26a0\ufe0f'} No similarity data loaded. Upload the Activity Similarities CSV.
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="flex gap-4 mb-6 flex-wrap">
            <div className="stat-card">
              <div className="section-label text-text-muted mb-1">
                Similarity Groups
              </div>
              <div className="text-2xl font-bold text-accent-green font-mono">
                {groupNames.length}
              </div>
            </div>
            <div className="stat-card">
              <div className="section-label text-text-muted mb-1">
                Grouped Activities
              </div>
              <div className="text-2xl font-bold text-accent-cyan font-mono">
                {activities.length - ungrouped.length}
              </div>
            </div>
            {ungrouped.length > 0 && (
              <div className="py-3 px-5 bg-base-700 rounded-lg border border-accent-amber/25">
                <div className="section-label text-text-muted mb-1">
                  No Group Assigned
                </div>
                <div className="text-2xl font-bold text-accent-amber font-mono">
                  {ungrouped.length}
                </div>
              </div>
            )}
          </div>

          {/* Groups */}
          <div className="flex flex-col gap-4">
            {groupNames.map(groupName => (
              <div key={groupName} className="bg-base-700 rounded-lg border border-base-500 p-4">
                <div className="flex items-center gap-2.5 mb-3">
                  <span className="text-sm font-bold text-accent-green font-display">
                    {groupName}
                  </span>
                  <span className="text-[10px] py-0.5 px-2 rounded-xl bg-accent-green/10 text-accent-green font-semibold">
                    {grouped[groupName].length} activities
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {grouped[groupName].map(act => (
                    <div key={act.name} className="py-2 px-3 rounded-md bg-base-800 border border-base-500">
                      <div className="text-xs font-semibold text-text-primary mb-1">
                        {act.name}
                      </div>
                      <div className="flex gap-2 text-[10px] text-text-muted">
                        <span className={
                          act.value >= 70 ? 'text-accent-green' : act.value >= 50 ? 'text-accent-amber' : 'text-text-secondary'
                        }>
                          Val: {act.value}
                        </span>
                        <span className={
                          act.intensity === 'Intense' ? 'text-accent-red' :
                          act.intensity === 'Moderate' ? 'text-accent-amber' : 'text-accent-green'
                        }>
                          {act.intensity}
                        </span>
                        {act.maxGroups < 99 && (
                          <span className="text-accent-pink">Max: {act.maxGroups}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Ungrouped */}
            {ungrouped.length > 0 && (
              <div className="bg-[#1a1510] rounded-lg border border-accent-amber/25 p-4">
                <div className="flex items-center gap-2.5 mb-3">
                  <span className="text-sm font-bold text-accent-amber font-display">
                    {'\u26a0\ufe0f'} No Similarity Group
                  </span>
                  <span className="text-[10px] text-text-secondary">
                    (No diminishing returns applied)
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {ungrouped.map(act => (
                    <div key={act.name} className="py-2 px-3 rounded-md bg-base-800 border border-accent-amber/25">
                      <div className="text-xs font-semibold text-accent-amber mb-1">
                        {act.name}
                      </div>
                      <div className="text-[10px] text-text-muted">
                        Val: {act.value} {'\u2022'} {act.intensity}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
