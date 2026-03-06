import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import FileUploader from './components/FileUploader';
import { storage } from './utils/storage';
import { processFiles } from './utils/processFiles';
import { DashboardProvider } from './context/DashboardContext';
import { TABS } from './constants/tabs';

/** Load all CSVs from storage and run processFiles. Returns processed data. */
function loadFromStorage() {
  return processFiles(
    storage.loadCSV('metadata'),
    storage.loadCSV('distances'),
    storage.loadCSV('schedule'),
    storage.loadCSV('similarities'),
  );
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
        setDashData(loadFromStorage());
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
          setDashData(loadFromStorage());
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

  // Context value for child components (stable reference via useMemo)
  const dashCtx = useMemo(() => dashData ? ({
    registry: dashData.registry,
    distMatrix: dashData.distMatrix,
    timeSlots: dashData.timeSlots,
    daySlices: dashData.daySlices,
    startLocations: dashData.startLocations,
    similarities: dashData.similarities,
  }) : null, [dashData]);

  // Tab-specific props lookup
  const getTabProps = (id) => {
    switch (id) {
      case 'dashboard':
        return { rotations: effectiveRotations, editFlags, useEdited, onToggleEdited: () => setUseEdited(v => !v), onClearEdit: handleClearEdit };
      case 'editor':
        return { rotations: effectiveRotations, onSave: handleSaveEdits, savedEdits };
      case 'builder':
        return { rotations: effectiveRotations, onSave: handleSaveEdits, persistedState: builderState, onStateChange: setBuilderState };
      default:
        return {};
    }
  };

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
          className="bg-base-800 px-7 flex items-stretch justify-between border-b border-base-500"
          style={{ '--tab-accent': activeTab.accent }}
        >
          <div className="flex items-stretch gap-0">
            <div className="flex items-center pr-7 mr-1 border-r border-base-500">
              <h1 className="m-0 text-lg font-display text-text-primary tracking-wide whitespace-nowrap">
                Fall Activity Matrix
                <span className="text-text-faint font-normal text-[14px] ml-2">SR 2026</span>
              </h1>
            </div>

            {TABS.map(t => {
              const active = tab === t.id;
              const showBadge = t.id === 'dashboard' && hasAnyEdits;
              const showSimBadge = t.requiresSimilarities && hasSimilarities;
              const isDisabled = t.requiresSimilarities && !hasSimilarities;

              return (
                <button
                  key={t.id}
                  onClick={() => !isDisabled && setTab(t.id)}
                  title={isDisabled ? 'Upload similarities file to enable' : undefined}
                  className={`py-4 px-6 bg-transparent border-0 border-b-2 border-solid text-[14px] font-sans -mb-0.5 flex items-center gap-1.5 transition-all duration-150 ${
                    active ? 'font-bold' : 'font-medium'
                  } ${
                    isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                  } ${
                    active && !isDisabled ? 'border-b-[var(--btn-accent)] text-[var(--btn-accent)]' : 'border-b-transparent'
                  } ${
                    isDisabled ? 'text-[#444]' : !active ? 'text-[#666]' : ''
                  }`}
                  style={{ '--btn-accent': t.accent }}
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
              <div className="text-[12px] text-accent-purple flex items-center gap-1">
                <span className="text-xs">{'\ud83d\uddc7'}</span>
                {Object.keys(dashData.similarities.groups).length} similarity groups
              </div>
            )}
            <button
              onClick={handleReset}
              className="py-1.5 px-3 rounded-md border border-base-400 bg-transparent text-text-faint text-[13px] cursor-pointer transition-all duration-150 font-sans"
            >{'\u21bb'} Re-upload</button>
          </div>
        </div>

        {/* --- Tab Content --- */}
        <DashboardProvider value={dashCtx}>
          <Suspense fallback={<div className="p-8 text-center text-text-muted">Loading...</div>}>
            {TABS.map(t => {
              if (tab !== t.id) return null;
              if (t.requiresSimilarities && !hasSimilarities) return null;
              const TabComponent = t.component;
              const props = getTabProps(t.id);
              return <TabComponent key={t.id} {...props} />;
            })}
          </Suspense>
        </DashboardProvider>
      </div>
    );
  }

  return null;
}
