import { useState } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { storage } from '../utils/storage';

function LocationSection({ title, description, locations, onAdd, onRemove, accentColor }) {
  const [name, setName] = useState('');
  const [gps, setGps] = useState('');
  const [error, setError] = useState(null);

  function handleAdd() {
    const trimName = name.trim();
    const trimGps = gps.trim();
    if (!trimName) { setError('Name is required'); return; }
    if (!trimGps) { setError('GPS coordinates are required'); return; }
    const parts = trimGps.split(',').map(s => parseFloat(s.trim()));
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) {
      setError('GPS must be "lat, lng" (e.g. 45.251925, -79.623436)');
      return;
    }
    if (locations.some(l => l.name === trimName)) {
      setError('A location with this name already exists');
      return;
    }
    onAdd({ name: trimName, lat: parts[0], lng: parts[1] });
    setName('');
    setGps('');
    setError(null);
  }

  return (
    <div className="bg-base-700 rounded-xl border border-base-500 p-5 mb-5">
      <h3 className="m-0 mb-1 text-[15px] font-display font-bold" style={{ color: accentColor }}>
        {title}
      </h3>
      <p className="mt-0 mb-4 text-[12px] text-text-muted">{description}</p>

      {locations.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-4">
          {locations.map((loc) => (
            <div key={loc.name} className="flex items-center gap-3 py-2 px-3 rounded-md bg-base-800 border border-base-500">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-text-primary">{loc.name}</div>
                <div className="text-[11px] font-mono text-text-muted">{loc.lat}, {loc.lng}</div>
              </div>
              <button
                onClick={() => onRemove(loc.name)}
                className="px-2 py-1 rounded text-[11px] font-semibold border border-error/25 bg-transparent text-error cursor-pointer"
              >Remove</button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 items-end flex-wrap">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-text-muted uppercase tracking-wide">Name</label>
          <input
            value={name}
            onChange={e => { setName(e.target.value); setError(null); }}
            placeholder="e.g. Main Lodge"
            className="py-1.5 px-2.5 rounded-md text-[12px] bg-base-800 border border-base-400 text-text-primary font-sans w-[180px]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-text-muted uppercase tracking-wide">GPS (lat, lng)</label>
          <input
            value={gps}
            onChange={e => { setGps(e.target.value); setError(null); }}
            placeholder="45.251925, -79.623436"
            className="py-1.5 px-2.5 rounded-md text-[12px] bg-base-800 border border-base-400 text-text-primary font-mono w-[220px]"
          />
        </div>
        <button
          onClick={handleAdd}
          className="py-1.5 px-4 rounded-md text-[12px] font-bold border-none cursor-pointer text-base-900"
          style={{ backgroundColor: accentColor }}
        >+ Add</button>
      </div>
      {error && <div className="text-[11px] text-error mt-1.5">{error}</div>}
    </div>
  );
}

export default function DataView() {
  const { registry, similarities, startLocations, foodLocations, setStartLocations, setFoodLocations } = useDashboard();

  function updateStartLocations(fn) {
    setStartLocations(prev => {
      const next = fn(prev);
      storage.saveStartLocations(next);
      return next;
    });
  }

  function updateFoodLocations(fn) {
    setFoodLocations(prev => {
      const next = fn(prev);
      storage.saveFoodLocations(next);
      return next;
    });
  }

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

  activities.sort((a, b) => {
    const groupA = a.similarityGroup || 'zzz_none';
    const groupB = b.similarityGroup || 'zzz_none';
    if (groupA !== groupB) return groupA.localeCompare(groupB);
    return a.name.localeCompare(b.name);
  });

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
      <h2 className="m-0 mb-5 text-xl font-display text-accent-green">Locations</h2>

      <LocationSection
        title="Start Locations"
        description="Where groups begin their day. These appear in the Dashboard START dropdown."
        locations={startLocations}
        onAdd={loc => updateStartLocations(prev => [...prev, loc])}
        onRemove={name => updateStartLocations(prev => prev.filter(l => l.name !== name))}
        accentColor="#60a5fa"
      />

      <LocationSection
        title="Food Locations"
        description="Lunch/meal locations. Used to calculate lunch-break distances: morning activity -> food -> afternoon activity."
        locations={foodLocations}
        onAdd={loc => updateFoodLocations(prev => [...prev, loc])}
        onRemove={name => updateFoodLocations(prev => prev.filter(l => l.name !== name))}
        accentColor="#fbbf24"
      />

      <h2 className="m-0 mb-5 mt-8 text-xl font-display text-accent-green">Activity Similarity Groups</h2>

      {!similarities ? (
        <div className="p-5 bg-[#1a1510] rounded-lg border border-accent-amber/25 text-accent-amber text-[13px]">
          No similarity data found. Include an "Activity Similarity Grouping" column in your metadata CSV.
        </div>
      ) : (
        <>
          <div className="flex gap-4 mb-6 flex-wrap">
            <div className="stat-card">
              <div className="section-label text-text-muted mb-1">Similarity Groups</div>
              <div className="text-2xl font-bold text-accent-green font-mono">{groupNames.length}</div>
            </div>
            <div className="stat-card">
              <div className="section-label text-text-muted mb-1">Grouped Activities</div>
              <div className="text-2xl font-bold text-accent-cyan font-mono">{activities.length - ungrouped.length}</div>
            </div>
            {ungrouped.length > 0 && (
              <div className="py-3 px-5 bg-base-700 rounded-lg border border-accent-amber/25">
                <div className="section-label text-text-muted mb-1">No Group Assigned</div>
                <div className="text-2xl font-bold text-accent-amber font-mono">{ungrouped.length}</div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            {groupNames.map(groupName => (
              <div key={groupName} className="bg-base-700 rounded-xl border border-base-500 p-4">
                <div className="flex items-center gap-2.5 mb-3">
                  <span className="text-sm font-bold text-accent-green font-display">{groupName}</span>
                  <span className="text-[11px] py-0.5 px-2 rounded-xl bg-accent-green/10 text-accent-green font-semibold">
                    {grouped[groupName].length} activities
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {grouped[groupName].map(act => (
                    <div key={act.name} className="py-2 px-3 rounded-md bg-base-800 border border-base-500">
                      <div className="text-xs font-semibold text-text-primary mb-1">{act.name}</div>
                      <div className="flex gap-2 text-[11px] text-text-muted">
                        <span className={act.value >= 70 ? 'text-accent-green' : act.value >= 50 ? 'text-accent-amber' : 'text-text-secondary'}>
                          Val: {act.value}
                        </span>
                        <span className={act.intensity === 'Intense' ? 'text-accent-red' : act.intensity === 'Moderate' ? 'text-accent-amber' : 'text-accent-green'}>
                          {act.intensity}
                        </span>
                        {act.maxGroups < 99 && <span className="text-accent-pink">Max: {act.maxGroups}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {ungrouped.length > 0 && (
              <div className="bg-[#1a1510] rounded-xl border border-accent-amber/25 p-4">
                <div className="flex items-center gap-2.5 mb-3">
                  <span className="text-sm font-bold text-accent-amber font-display">No Similarity Group</span>
                  <span className="text-[11px] text-text-secondary">(No diminishing returns applied)</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {ungrouped.map(act => (
                    <div key={act.name} className="py-2 px-3 rounded-md bg-base-800 border border-accent-amber/25">
                      <div className="text-xs font-semibold text-accent-amber mb-1">{act.name}</div>
                      <div className="text-[11px] text-text-muted">Val: {act.value} · {act.intensity}</div>
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
