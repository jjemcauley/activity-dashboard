import { useDashboard } from '../context/DashboardContext';

export default function DataView() {
  const { registry, similarities } = useDashboard();
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
