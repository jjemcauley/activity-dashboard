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

  // Ã¢â‚¬â€ Single effective rotations array Ã¢â‚¬â€
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

  // Ã¢â‚¬â€ Loading Ã¢â‚¬â€
  if (mode === 'loading') {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 12,
      }}>
        <div style={{ fontSize: 20, fontFamily: "'Playfair Display', serif", color: '#d4a847' }}>
          Loading...
        </div>
        <div style={{ fontSize: 12, color: '#666' }}>Checking for saved data</div>
      </div>
    );
  }

  // Ã¢â‚¬â€ Upload Ã¢â‚¬â€
  if (mode === 'upload') {
    return (
      <FileUploader
        onFilesReady={handleFilesReady}
        hasExisting={storage.hasAllFiles()}
      />
    );
  }

  // Ã¢â‚¬â€ Main app Ã¢â‚¬â€
  if (mode === 'app' && dashData) {
    const activeTab = TABS.find(t => t.id === tab) || TABS[0];
    const hasSimilarities = !!dashData.similarities;

    return (
      <div style={{ minHeight: '100vh', background: '#0f1219' }}>

        {/* Ã¢â‚¬â€ Top Nav Bar Ã¢â‚¬â€ */}
        <div style={{
          background: 'linear-gradient(135deg, #1a1f2e, #0f1219)',
          borderBottom: `2px solid ${activeTab.accent}`,
          padding: '0 28px',
          display: 'flex', alignItems: 'stretch', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
            <div style={{
              display: 'flex', alignItems: 'center', paddingRight: 28, marginRight: 4,
              borderRight: '1px solid #1e2636',
            }}>
              <h1 style={{
                margin: 0, fontSize: 18, fontFamily: "'Playfair Display', serif",
                color: '#e8e6e1', letterSpacing: 0.5, whiteSpace: 'nowrap',
              }}>
                Fall Activity Matrix
                <span style={{ color: '#555', fontWeight: 400, fontSize: 13, marginLeft: 8 }}>SR 2026</span>
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
                  style={{
                    padding: '14px 20px', background: 'transparent',
                    border: 'none', borderBottom: active ? `3px solid ${t.accent}` : '3px solid transparent',
                    color: isDisabled ? '#444' : active ? t.accent : '#666',
                    fontSize: 13, fontWeight: active ? 700 : 500,
                    cursor: isDisabled ? 'not-allowed' : 'pointer', 
                    transition: 'all 0.15s',
                    fontFamily: "'DM Sans', sans-serif",
                    marginBottom: -2,
                    display: 'flex', alignItems: 'center', gap: 6,
                    opacity: isDisabled ? 0.5 : 1,
                  }}
                >
                  {t.label}
                  {showBadge && (
                    <span style={{
                      fontSize: 8, fontWeight: 700, color: '#0f1219',
                      background: '#22d3ee', borderRadius: 3, padding: '1px 5px',
                      lineHeight: '12px',
                    }}>EDITED</span>
                  )}
                  {showSimBadge && (
                    <span style={{
                      fontSize: 8, fontWeight: 700, color: '#0f1219',
                      background: '#a78bfa', borderRadius: 3, padding: '1px 5px',
                      lineHeight: '12px',
                    }}>READY</span>
                  )}
                  {isDisabled && (
                    <span style={{
                      fontSize: 8, fontWeight: 600, color: '#666',
                      background: '#2a3040', borderRadius: 3, padding: '1px 5px',
                      lineHeight: '12px',
                    }}>NO DATA</span>
                  )}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Similarities indicator */}
            {hasSimilarities && (
              <div style={{
                fontSize: 10, color: '#a78bfa', display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <span style={{ fontSize: 12 }}>Ã°Å¸â€—</span>
                {Object.keys(dashData.similarities.groups).length} similarity groups
              </div>
            )}
            <button onClick={handleReset} style={{
              padding: '6px 12px', borderRadius: 6, border: '1px solid #2a3040',
              background: 'transparent', color: '#555', fontSize: 11,
              cursor: 'pointer', transition: 'all 0.15s',
              fontFamily: "'DM Sans', sans-serif",
            }}>Ã¢â€ Â» Re-upload</button>
          </div>
        </div>

        {/* Ã¢â‚¬â€ Tab Content Ã¢â‚¬â€ */}
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

/* Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
   INLINE DATA VIEW - Shows activities and their similarity groups
   Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */

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
    <div style={{ padding: 28, background: '#0f1219', minHeight: '100vh' }}>
      <h2 style={{ 
        margin: '0 0 20px', fontSize: 20, 
        fontFamily: "'Playfair Display', serif", color: '#34d399' 
      }}>
        Activity Similarity Groups
      </h2>
      
      {!similarities ? (
        <div style={{
          padding: 20, background: '#1a1510', borderRadius: 8, 
          border: '1px solid #fbbf2440', color: '#fbbf24', fontSize: 13,
        }}>
          Ã¢Å¡Â Ã¯Â¸Â No similarity data loaded. Upload the Activity Similarities CSV.
        </div>
      ) : (
        <>
          {/* Summary */}
          <div style={{ 
            display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' 
          }}>
            <div style={{
              padding: '12px 20px', background: '#141924', borderRadius: 8,
              border: '1px solid #1e2636',
            }}>
              <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', marginBottom: 4 }}>
                Similarity Groups
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#34d399', fontFamily: "'DM Mono', monospace" }}>
                {groupNames.length}
              </div>
            </div>
            <div style={{
              padding: '12px 20px', background: '#141924', borderRadius: 8,
              border: '1px solid #1e2636',
            }}>
              <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', marginBottom: 4 }}>
                Grouped Activities
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#22d3ee', fontFamily: "'DM Mono', monospace" }}>
                {activities.length - ungrouped.length}
              </div>
            </div>
            {ungrouped.length > 0 && (
              <div style={{
                padding: '12px 20px', background: '#141924', borderRadius: 8,
                border: '1px solid #fbbf2440',
              }}>
                <div style={{ fontSize: 9, color: '#666', textTransform: 'uppercase', marginBottom: 4 }}>
                  No Group Assigned
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#fbbf24', fontFamily: "'DM Mono', monospace" }}>
                  {ungrouped.length}
                </div>
              </div>
            )}
          </div>
          
          {/* Groups */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {groupNames.map(groupName => (
              <div key={groupName} style={{
                background: '#141924', borderRadius: 8, border: '1px solid #1e2636',
                padding: 16,
              }}>
                <div style={{ 
                  display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 
                }}>
                  <span style={{
                    fontSize: 14, fontWeight: 700, color: '#34d399',
                    fontFamily: "'Playfair Display', serif",
                  }}>
                    {groupName}
                  </span>
                  <span style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 10,
                    background: '#34d39920', color: '#34d399', fontWeight: 600,
                  }}>
                    {grouped[groupName].length} activities
                  </span>
                </div>
                
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {grouped[groupName].map(act => (
                    <div key={act.name} style={{
                      padding: '8px 12px', borderRadius: 6,
                      background: '#0f1219', border: '1px solid #1e2636',
                    }}>
                      <div style={{ 
                        fontSize: 12, fontWeight: 600, color: '#e8e6e1', marginBottom: 4 
                      }}>
                        {act.name}
                      </div>
                      <div style={{ 
                        display: 'flex', gap: 8, fontSize: 10, color: '#666' 
                      }}>
                        <span style={{ 
                          color: act.value >= 70 ? '#34d399' : act.value >= 50 ? '#fbbf24' : '#888' 
                        }}>
                          Val: {act.value}
                        </span>
                        <span style={{
                          color: act.intensity === 'Intense' ? '#f87171' : 
                                 act.intensity === 'Moderate' ? '#fbbf24' : '#34d399'
                        }}>
                          {act.intensity}
                        </span>
                        {act.maxGroups < 99 && (
                          <span style={{ color: '#f472b6' }}>Max: {act.maxGroups}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            
            {/* Ungrouped */}
            {ungrouped.length > 0 && (
              <div style={{
                background: '#1a1510', borderRadius: 8, border: '1px solid #fbbf2440',
                padding: 16,
              }}>
                <div style={{ 
                  display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 
                }}>
                  <span style={{
                    fontSize: 14, fontWeight: 700, color: '#fbbf24',
                    fontFamily: "'Playfair Display', serif",
                  }}>
                    Ã¢Å¡Â Ã¯Â¸Â No Similarity Group
                  </span>
                  <span style={{ fontSize: 10, color: '#888' }}>
                    (No diminishing returns applied)
                  </span>
                </div>
                
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {ungrouped.map(act => (
                    <div key={act.name} style={{
                      padding: '8px 12px', borderRadius: 6,
                      background: '#0f1219', border: '1px solid #fbbf2440',
                    }}>
                      <div style={{ 
                        fontSize: 12, fontWeight: 600, color: '#fbbf24', marginBottom: 4 
                      }}>
                        {act.name}
                      </div>
                      <div style={{ fontSize: 10, color: '#666' }}>
                        Val: {act.value} Ã¢â‚¬Â¢ {act.intensity}
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
