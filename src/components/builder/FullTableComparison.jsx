import React from 'react';
import { DAY_COLORS, ROT_COLORS } from '../../constants/colors.js';
import { computeTableAverages } from '../../utils/scheduleStats.js';

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
      <td className="px-3 py-2 text-xs font-bold font-mono text-center border-b border-base-500 text-[var(--delta-color)]" style={{ '--delta-color': dc }}>
        {delta !== 0 ? `${delta > 0 ? '+' : ''}${fmt(delta)}${unit || ''}` : '\u2014'}
        {delta !== 0 && <span className="ml-1 text-[11px]">{improved ? '\u25B2' : '\u25BC'}</span>}
      </td>
    </tr>
  );
}

export default function FullTableComparison({ groupsA, groupsB, statsA, statsB, rotations, registry, distMatrix, daySlices, timeSlots, startLocations }) {
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
        <span className="text-[12px] font-normal text-text-faint font-sans ml-2">Averages across all groups</span>
      </h3>

      {pairs.map(({ label, builderStats, dashStat, color }) => (
        <div key={label} className="bg-base-700 rounded-xl overflow-hidden mb-5 border border-[var(--rot-border)]" style={{ '--rot-border': `${color}30` }}>
          {/* Header */}
          <div className="px-5 py-3 flex items-center gap-3 bg-[image:var(--header-bg)] border-b border-b-[var(--header-bb)]" style={{ '--header-bg': `linear-gradient(135deg, ${color}10, transparent)`, '--header-bb': `${color}20` }}>
            <div className="text-[15px] font-bold font-display text-[var(--rot-color)]" style={{ '--rot-color': color }}>
              Rotation {label}
            </div>
            <span className="text-[12px] text-text-muted font-mono">
              Dashboard ({dashStat.groupCount} groups) vs Builder ({builderStats.groupCount} groups)
            </span>
          </div>

          <div className="px-2 pb-4">
            {/* Overall averages table */}
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="px-3 py-2.5 text-[11px] text-text-faint uppercase tracking-wide text-left border-b-2 border-base-400">Metric</th>
                  <th className="px-3 py-2.5 text-[11px] text-text-secondary uppercase tracking-wide text-center border-b-2 border-base-400">Dashboard</th>
                  <th className="px-3 py-2.5 text-[11px] uppercase tracking-wide text-center border-b-2 border-base-400 text-accent-orange">Builder</th>
                  <th className="px-3 py-2.5 text-[11px] text-text-faint uppercase tracking-wide text-center border-b-2 border-base-400">Delta</th>
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
                  <th className="px-3 py-1.5 text-[11px] text-text-faint text-left border-b border-base-400">Day</th>
                  <th colSpan={2} className="px-3 py-1.5 text-[11px] text-text-faint text-center border-b border-base-400">Avg Value</th>
                  <th colSpan={2} className="px-3 py-1.5 text-[11px] text-text-faint text-center border-b border-base-400">Avg Walk</th>
                  <th colSpan={2} className="px-3 py-1.5 text-[11px] text-text-faint text-center border-b border-base-400">Avg Max Walk</th>
                  <th colSpan={2} className="px-3 py-1.5 text-[11px] text-text-faint text-center border-b border-base-400">Avg Indoor</th>
                </tr>
                <tr>
                  <th />
                  {['Avg Value', 'Avg Walk', 'Avg Max Walk', 'Avg Indoor'].map(h => <React.Fragment key={h}>
                    <th className="px-1.5 py-1 text-[11px] text-text-muted text-center">Dash</th>
                    <th className="px-1.5 py-1 text-[11px] text-center text-accent-orange">Build</th>
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
                    const cellColor = d === 0 ? '#888' : imp ? '#34d399' : reg ? '#f87171' : '#e8e6e1';
                    return <>
                      <td className="px-1.5 py-1.5 text-[11px] font-mono text-text-secondary text-center border-b border-base-500">{oldV}{unit||''}</td>
                      <td className="px-1.5 py-1.5 text-[11px] font-mono font-semibold text-center border-b border-base-500 text-[var(--cell-color)]" style={{ '--cell-color': cellColor }}>{newV}{unit||''}{d !== 0 && <span className="text-[11px] ml-0.5">{imp ? '\u25B2' : '\u25BC'}</span>}</td>
                    </>;
                  };
                  return (
                    <tr key={dd.name}>
                      <td className="px-3 py-1.5 text-[11px] font-semibold border-b border-base-500 whitespace-nowrap text-[var(--day-color)]" style={{ '--day-color': dayColor }}>
                        <span className="inline-block w-[3px] h-3 rounded-sm mr-1.5 align-middle bg-[var(--day-color)]" />
                        {dd.name} <span className="text-[11px] text-text-faint font-normal">({dd.slots})</span>
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
