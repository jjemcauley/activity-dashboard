import React from 'react';
import { INTENSITY_COLORS } from '../../constants/colors.js';
import { parseStaff, computeDayStats } from '../../utils/scheduleStats.js';
import { lookupMeta } from '../../utils/parsers.js';

// -----------------------------------------
// DayStatsCard — Single-group per-day stats
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
    <div className="flex-[1_1_220px] bg-base-700 rounded-xl border border-base-500 p-5 min-w-[200px]">
      <div className="flex items-center gap-2 mb-3.5" style={{ '--day-color': color }}>
        <div className="w-1 h-[22px] rounded-sm bg-[var(--day-color)]" />
        <h4 className="m-0 text-[15px] font-display text-[var(--day-color)]">{dayName}</h4>
        <span className="text-[12px] text-text-faint ml-auto">{slotCount} slots</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="section-label text-text-muted mb-0.5">Avg Value</div>
          <div className="text-[22px] font-bold font-mono text-[var(--avg-color)]" style={{ '--avg-color': avgValColor }}>{stats.avgVal}</div>
        </div>
        <div>
          <div className="section-label text-text-muted mb-0.5">Walk Dist</div>
          <div className="text-[22px] font-bold font-mono text-[#aaa]">
            {stats.totalDist}<span className="text-[12px]">m</span>
            {stats.startDist !== null && stats.startDist !== undefined && (
              <span className="text-[11px] text-[#60a5fa] ml-1">(+{stats.startDist})</span>
            )}
          </div>
        </div>
        <div>
          <div className="section-label text-text-muted mb-0.5">Max Walk</div>
          <div className="text-[17px] font-semibold font-mono text-[var(--max-dist-color)]" style={{ '--max-dist-color': maxDistColor }}>{stats.maxDist}<span className="text-[12px]">m</span></div>
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
                className="text-[11px] px-[7px] py-[3px] rounded-[3px] mb-0.5 bg-[var(--alert-bg)] text-[var(--alert-color)] border-l-2 border-l-[var(--alert-border)]"
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

// -----------------------------------------
// SingleGroupStats — Day-by-day breakdown for one group
// -----------------------------------------

export function SingleGroupStats({ focusGroup, focusedDayStats, dayColors }) {
  return (
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
  );
}

// -----------------------------------------
// AllGroupsStats — Per-day averages across all groups
// -----------------------------------------

export function AllGroupsStats({ schedule, daySlices, dayColors, numGroups, registry, distMatrix, startLocation }) {
  return (
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
            <div key={d.name} className="flex-[1_1_220px] bg-base-700 rounded-xl border border-base-500 p-5 min-w-[200px]">
              <div className="flex items-center gap-2 mb-3.5" style={{ '--day-color': dayColors[di] }}>
                <div className="w-1 h-[22px] rounded-sm bg-[var(--day-color)]" />
                <h4 className="m-0 text-[15px] font-display text-[var(--day-color)]">{d.name}</h4>
                <span className="text-[12px] text-text-faint ml-auto">{d.end - d.start} slots</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="section-label text-text-muted mb-0.5">Avg Value</div>
                  <div className="text-[22px] font-bold font-mono text-[var(--avg-color)]" style={{ '--avg-color': avgValColor }}>{avgVal}</div>
                </div>
                <div>
                  <div className="section-label text-text-muted mb-0.5">Avg Walk</div>
                  <div className="text-[22px] font-bold font-mono text-[#aaa]">{avgDist}<span className="text-[12px]">m</span></div>
                </div>
                <div>
                  <div className="section-label text-text-muted mb-0.5">Worst Max Walk</div>
                  <div className="text-[17px] font-semibold font-mono text-[var(--max-dist-color)]" style={{ '--max-dist-color': maxDistColor }}>{maxDistWorst}<span className="text-[12px]">m</span></div>
                </div>
                <div>
                  <div className="section-label text-text-muted mb-0.5">Intensity Flags</div>
                  <div className="text-[17px] font-semibold font-mono text-[var(--flag-color)]" style={{ '--flag-color': intFlagColor }}>{intensityFlags}<span className="text-[12px]"> / {numGroups}</span></div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -----------------------------------------
// StaffingStats — Staffing requirements with group/day toggles
// -----------------------------------------

export function StaffingStats({
  schedule,
  daySlices,
  dayColors,
  numGroups,
  timeSlots,
  registry,
  staffGroups,
  setStaffGroups,
  staffDays,
  setStaffDays,
}) {
  return (
    <div className="px-7 pb-7">
      <div className="flex items-center gap-3 mb-3.5 flex-wrap">
        <h3 className="text-[15px] font-display text-accent-gold m-0">
          Staffing Requirements
        </h3>

        {/* Group toggles */}
        <div className="flex items-center gap-1">
          <button onClick={() => setStaffGroups(new Set(Array.from({ length: numGroups }, (_, i) => i)))}
            className={`px-2 py-[3px] rounded-[3px] text-[11px] font-semibold border border-base-400 cursor-pointer transition-all duration-200 ${staffGroups.size === numGroups ? 'bg-base-400 text-accent-gold' : 'bg-transparent text-text-faint'}`}
          >All</button>
          <button onClick={() => setStaffGroups(new Set())}
            className={`px-2 py-[3px] rounded-[3px] text-[11px] font-semibold border border-base-400 cursor-pointer transition-all duration-200 ${staffGroups.size === 0 ? 'bg-base-400 text-accent-gold' : 'bg-transparent text-text-faint'}`}
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
                className={`px-1.5 py-[3px] rounded-[3px] text-[11px] font-semibold min-w-[22px] text-center cursor-pointer font-mono transition-all duration-200 ${on ? 'border border-accent-gold bg-accent-gold text-base-800' : 'border border-base-400 bg-transparent text-text-faint'}`}
              >{gi + 1}</button>
            );
          })}
        </div>

        <span className="text-[12px] text-text-faint">
          {staffGroups.size} of {numGroups} groups
        </span>

        {/* Separator */}
        <div className="w-px h-5 bg-base-400" />

        {/* Day toggles */}
        <div className="flex gap-[3px] items-center">
          {daySlices.map((d, di) => {
            const on = staffDays.has(di);
            const shortLabel = d.name.charAt(0).toUpperCase();
            return (
              <button key={di} onClick={() => {
                setStaffDays(prev => {
                  const next = new Set(prev);
                  if (next.has(di)) next.delete(di); else next.add(di);
                  return next;
                });
              }}
                className={`px-2 py-[3px] rounded-[3px] text-[11px] font-semibold min-w-[24px] text-center cursor-pointer font-mono transition-all duration-200 ${on ? 'border border-[var(--day-btn-color)] bg-[var(--day-btn-color)] text-base-800' : 'border border-base-400 bg-transparent text-text-faint'}`}
                style={{ '--day-btn-color': dayColors[di] }}
              >{shortLabel}</button>
            );
          })}
        </div>

        <span className="text-[12px] text-text-faint">
          {staffDays.size} of {daySlices.length} days
        </span>
      </div>

      <div className="flex gap-4 flex-wrap">
        {daySlices.map((d, di) => {
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
            <div key={d.name} className="flex-[1_1_220px] bg-base-700 rounded-xl border border-base-500 p-5 min-w-[200px]">
              <div className="flex items-center gap-2 mb-3.5" style={{ '--day-color': dayColors[di] }}>
                <div className="w-1 h-[22px] rounded-sm bg-[var(--day-color)]" />
                <h4 className="m-0 text-[15px] font-display text-[var(--day-color)]">{d.name}</h4>
                <span className="text-[12px] text-text-faint ml-auto">{d.end - d.start} slots</span>
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
                  <span className="text-[12px] text-text-secondary font-mono">{s.time}</span>
                  <div className="flex gap-2.5">
                    <span className="text-[11px] font-semibold font-mono text-[#e8a838]">
                      {s.min}<span className="text-[11px] text-text-muted font-normal"> min</span>
                    </span>
                    <span className="text-[11px] font-semibold font-mono text-accent-gold">
                      {s.ideal}<span className="text-[11px] text-text-muted font-normal"> ideal</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
