import React, { useState, useMemo } from 'react';
import {
  INTENSITY_COLORS, INTENSITY_TEXT,
  DAY_COLORS, ACCENT, ROT_COLORS,
  valueColor, valueTextColor,
} from '../../constants/colors.js';
import { computeOverallStats } from '../../utils/scheduleStats.js';
import { getDistance, getStartDistance, lookupMeta, shortName } from '../../utils/parsers.js';
import { getDaySlice } from './validation.js';

/* Delta stat for comparison */
function DeltaStat({ label, oldVal, newVal, unit, higherIsBetter }) {
  const delta = newVal - oldVal;
  const improved = higherIsBetter ? delta > 0 : delta < 0;
  const regressed = higherIsBetter ? delta < 0 : delta > 0;
  const dc = delta === 0 ? '#555' : improved ? '#34d399' : regressed ? '#f87171' : '#555';
  return (
    <div className="py-2.5 border-b border-base-500">
      <div className="text-[9px] text-text-muted uppercase tracking-wide mb-1.5">{label}</div>
      <div className="flex items-baseline gap-4">
        <div className="flex-1"><span className="text-[10px] text-text-secondary mr-1">OLD</span><span className="text-lg font-bold font-mono text-text-secondary">{oldVal}{unit||''}</span></div>
        <div className="flex-1"><span className="text-[10px] mr-1 text-accent-orange">NEW</span><span className="text-lg font-bold font-mono text-text-primary">{newVal}{unit||''}</span></div>
        <div className="text-[13px] font-bold font-mono min-w-[60px] text-right text-[var(--delta-color)]" style={{ '--delta-color': dc }}>
          {delta > 0 ? '+' : ''}{delta}{unit||''}{delta !== 0 && <span className="text-[10px] ml-[3px]">{improved ? '\u25B2' : '\u25BC'}</span>}
        </div>
      </div>
    </div>
  );
}

/* Schedule strip for comparison view */
function ScheduleStrip({ group, timeSlots, daySlices, registry, distMatrix, startLocation, label, color, colorMode }) {
  const dayBoundaries = new Set(daySlices.map(d => d.start).filter(s => s > 0));
  function getCellStyle(activity) {
    const meta = lookupMeta(activity, registry);
    if (!meta) return { bg: '#333', text: '#e74c3c', hasMeta: false };
    if (colorMode === 'intensity') return { bg: INTENSITY_COLORS[meta.intensity] || '#333', text: INTENSITY_TEXT[meta.intensity] || '#fff', hasMeta: true };
    return { bg: valueColor(meta.value), text: valueTextColor(meta.value), hasMeta: true };
  }
  return (
    <div>
      <div className="text-xs font-bold mb-2 font-display flex items-center gap-2 text-[var(--strip-color)]" style={{ '--strip-color': color }}>
        <div className="w-1 h-[18px] rounded-sm bg-[var(--strip-color)]" />{label}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>{daySlices.map((d, di) => <React.Fragment key={d.name}>{di > 0 && <th className="w-3.5" />}<th colSpan={d.end - d.start} className="text-center text-[11px] font-bold py-1 font-display text-[var(--day-color)] border-b-2 border-b-[var(--day-border)]" style={{ '--day-color': DAY_COLORS?.[d.name] || DAY_COLORS?.[di] || '#888', '--day-border': `${(DAY_COLORS?.[d.name] || DAY_COLORS?.[di] || '#555')}30` }}>{d.name}</th></React.Fragment>)}</tr>
            <tr>{timeSlots.map((s, si) => { const nd = dayBoundaries.has(si); return <React.Fragment key={si}>{nd && <th className="w-3.5" />}<th className="text-[9px] text-text-secondary text-center px-[3px] pb-2 pt-[3px] font-medium font-mono whitespace-nowrap">{s.time}</th></React.Fragment>; })}</tr>
          </thead>
          <tbody><tr>{group.map((activity, si) => {
            const meta = lookupMeta(activity, registry); const cellStyle = getCellStyle(activity);
            const nd = dayBoundaries.has(si); const fd = daySlices.some(d => d.start === si);
            const dist = (si > 0 && !nd) ? getDistance(group[si-1], activity, distMatrix, registry.nameMap) : null;
            const sd = (fd && startLocation) ? getStartDistance(startLocation, activity, distMatrix, registry.nameMap) : null;
            const distColor = dist > 600 ? '#dc2626' : dist > 400 ? '#d97706' : dist > 200 ? '#6b7280' : '#059669';
            const distBg = dist > 600 ? '#fef2f2' : dist > 400 ? '#fffbeb' : dist > 200 ? '#f3f4f6' : '#ecfdf5';
            return <React.Fragment key={si}>{nd && <td className="w-3.5" />}<td className="px-[1px] py-0.5 align-top relative">
              {dist !== null && <div className="absolute top-1/2 -left-0.5 -translate-x-1/2 -translate-y-1/2 z-[3]"><div className="text-[8px] rounded-[3px] px-[3px] py-[1px] font-semibold font-mono text-[var(--dist-color)] bg-[var(--dist-bg)]" style={{ '--dist-color': distColor, '--dist-bg': distBg }}>{dist}m</div></div>}
              {sd !== null && <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[3]"><div className="text-[7px] text-[#60a5fa] bg-[#112a3d] rounded-[3px] px-[3px] py-[1px] font-semibold font-mono whitespace-nowrap border border-[#1e3a5f]">{'\u25B8'} {sd}m</div></div>}
              <div className={`rounded-md px-1.5 py-2 min-h-[68px] flex flex-col justify-between bg-[var(--cell-bg)] text-[var(--cell-text)] ${cellStyle.hasMeta ? 'border border-transparent' : 'border border-dashed border-[#e74c3c55]'}`} style={{ '--cell-bg': cellStyle.bg, '--cell-text': cellStyle.text }}>
                <div className="text-[11px] font-semibold leading-tight mb-0.5">{shortName(activity)}</div>
                {meta && <div className="text-[8px] opacity-70 mb-0.5">{meta.intensity} {'\u00B7'} {meta.io}</div>}
                <div className="flex justify-between items-center mt-auto">
                  <span className="text-[8px] opacity-75">{(meta?.location || '').substring(0, 8)}</span>
                  <span className="text-[10px] font-bold font-mono bg-black/20 rounded-[3px] px-[5px] py-[1px]">{meta?.value ?? '?'}</span>
                </div>
              </div>
            </td></React.Fragment>;
          })}</tr></tbody>
        </table>
      </div>
    </div>
  );
}

/* Day comparison card */
function ComparisonDayCard({ dayName, oldStats, newStats, color, slotCount }) {
  const buildAlerts = s => {
    const a = [];
    if (s.maxDist > 700) a.push({ type: 'error', msg: `Long walk: ${s.maxDist}m` });
    else if (s.maxDist > 500) a.push({ type: 'warn', msg: `Far walk: ${s.maxDist}m` });
    if (s.indoorCount === 0 && slotCount >= 3) a.push({ type: 'info', msg: 'No indoor option' });
    return a;
  };
  const oa = buildAlerts(oldStats), na = buildAlerts(newStats);
  return (
    <div className="flex-[1_1_280px] bg-base-700 rounded-[10px] border border-base-500 p-[18px] min-w-[260px]">
      <div className="flex items-center gap-2 mb-3.5">
        <div className="w-1 h-[22px] rounded-sm bg-[var(--day-color)]" style={{ '--day-color': color }} />
        <h4 className="m-0 text-[15px] font-display text-[var(--day-color)]" style={{ '--day-color': color }}>{dayName}</h4>
        <span className="text-[10px] text-text-faint ml-auto">{slotCount} slots</span>
      </div>
      <DeltaStat label="Avg Value" oldVal={oldStats.avgVal} newVal={newStats.avgVal} higherIsBetter={true} />
      <DeltaStat label="Total Walk" oldVal={oldStats.totalDist} newVal={newStats.totalDist} unit="m" higherIsBetter={false} />
      <DeltaStat label="Max Walk" oldVal={oldStats.maxDist} newVal={newStats.maxDist} unit="m" higherIsBetter={false} />
      <DeltaStat label="Indoor" oldVal={oldStats.indoorCount} newVal={newStats.indoorCount} higherIsBetter={true} />
      <div className="mt-3">
        <div className="text-[9px] text-text-muted uppercase tracking-wide mb-1">Intensity Flow</div>
        <div className="mb-1">
          <div className="text-[8px] text-text-faint mb-0.5">OLD</div>
          <div className="flex gap-0.5">{oldStats.intensities.map((int, i) => <div key={i} className="flex-1 h-[7px] rounded-[3px] bg-[var(--int-bg)]" style={{ '--int-bg': INTENSITY_COLORS[int] || '#333' }} title={int} />)}</div>
        </div>
        <div>
          <div className="text-[8px] mb-0.5 text-accent-orange">NEW</div>
          <div className="flex gap-0.5">{newStats.intensities.map((int, i) => <div key={i} className="flex-1 h-[7px] rounded-[3px] bg-[var(--int-bg)]" style={{ '--int-bg': INTENSITY_COLORS[int] || '#333' }} title={int} />)}</div>
        </div>
      </div>
      {(oa.length > 0 || na.length > 0) && <div className="mt-2.5">
        {na.map((a, i) => { const isNew = !oa.find(o => o.msg === a.msg); const alertBg = a.type === 'error' ? '#3d1111' : a.type === 'warn' ? '#3d2e11' : '#112a3d'; const alertColor = a.type === 'error' ? '#f87171' : a.type === 'warn' ? '#fbbf24' : '#60a5fa'; const alertBorder = a.type === 'error' ? '#ef4444' : a.type === 'warn' ? '#f59e0b' : '#3b82f6'; return <div key={`n${i}`} className="text-[10px] px-[7px] py-[3px] rounded-[3px] mb-0.5 flex items-center gap-1.5 bg-[var(--alert-bg)] text-[var(--alert-color)] border-l-2 border-l-[var(--alert-border)]" style={{ '--alert-bg': alertBg, '--alert-color': alertColor, '--alert-border': alertBorder }}>{a.msg}{isNew && <span className="text-[8px] font-bold text-accent-orange bg-[#f9731620] px-1 rounded-sm">NEW</span>}</div>; })}
        {oa.filter(a => !na.find(n => n.msg === a.msg)).map((a, i) => <div key={`r${i}`} className="text-[10px] px-[7px] py-[3px] rounded-[3px] mb-0.5 bg-[#0f1f0f] text-success-light line-through opacity-70 border-l-2 border-l-[#22c55e]">{a.msg} <span className="text-[8px] font-bold">RESOLVED</span></div>)}
      </div>}
    </div>
  );
}

/* Comparison View */
export default function ComparisonView({ newGroup, oldGroup, oldLabel, newLabel, timeSlots, daySlices, registry, distMatrix, startLocation, startLocations, onClose, onChangeOldSource, existingRotations, selectedOldRot, selectedOldGroup }) {
  const [colorMode, setColorMode] = useState('value');
  const [localStart, setLocalStart] = useState(startLocation);
  const oldO = useMemo(() => computeOverallStats(oldGroup, daySlices, registry, distMatrix, localStart), [oldGroup, daySlices, registry, distMatrix, localStart]);
  const newO = useMemo(() => computeOverallStats(newGroup, daySlices, registry, distMatrix, localStart), [newGroup, daySlices, registry, distMatrix, localStart]);
  const oldActs = new Set(oldGroup.filter(Boolean)), newActs = new Set(newGroup.filter(Boolean));
  const added = [...newActs].filter(a => !oldActs.has(a)), removed = [...oldActs].filter(a => !newActs.has(a)), kept = [...newActs].filter(a => oldActs.has(a));

  return (
    <div className="fixed inset-0 z-[2000] bg-base-800 overflow-y-auto font-sans">
      {/* Top bar */}
      <div className="sticky top-0 z-10 px-7 py-3 flex items-center justify-between bg-[linear-gradient(135deg,#1a1f2e,#0f1219)] border-b-2 border-b-accent-orange">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="px-3.5 py-1.5 rounded-md border border-base-400 bg-base-600 text-text-secondary cursor-pointer text-xs font-semibold flex items-center gap-1.5">{'\u2190'} Back to Builder</button>
          <h2 className="m-0 text-lg font-display text-accent-orange">Group Comparison</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-text-secondary uppercase">Compare vs:</span>
          {existingRotations.map((rot, ri) => <div key={ri} className="flex gap-0.5">{rot.groups.map((_, gi) => {
            const isActive = selectedOldRot === ri && selectedOldGroup === gi;
            return <button key={gi} onClick={() => onChangeOldSource(ri, gi)} className={`px-[7px] py-1 rounded text-[9px] font-semibold font-mono cursor-pointer ${isActive ? 'border border-accent-orange bg-accent-orange/10 text-accent-orange' : 'border border-[#2a3040] bg-transparent text-[#555]'}`}>{rot.name}{gi+1}</button>;
          })}</div>)}
          <div className="w-px h-6 bg-base-400" />
          {[{ id: 'value', label: 'Value' }, { id: 'intensity', label: 'Intensity' }].map(m => {
            const isActive = colorMode === m.id;
            return <button key={m.id} onClick={() => setColorMode(m.id)} className={`px-2.5 py-1 rounded text-[10px] font-medium cursor-pointer ${isActive ? 'border border-accent-orange bg-accent-orange/10 text-accent-orange' : 'border border-[#2a3040] bg-transparent text-[#888]'}`}>{m.label}</button>;
          })}
          <div className="w-px h-6 bg-base-400" />
          <select value={localStart || ''} onChange={e => setLocalStart(e.target.value || null)} className="px-2 py-1 rounded text-[10px] border border-base-400 bg-base-800 cursor-pointer font-mono max-w-[180px] text-accent-orange">
            <option value="">No start</option>
            {(startLocations||[]).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="px-7 py-6 max-w-[1400px] mx-auto">
        {/* Summary banner */}
        <div className="flex gap-4 mb-7 flex-wrap">
          {[
            { label: 'Avg Value', old: oldO.avgVal, new: newO.avgVal, u: '', b: true },
            { label: 'Total Walk', old: oldO.totalDist, new: newO.totalDist, u: 'm', b: false },
            { label: 'Max Walk', old: oldO.maxDist, new: newO.maxDist, u: 'm', b: false },
            { label: 'Indoor', old: oldO.indoorCount, new: newO.indoorCount, u: '', b: true },
            { label: 'Unique Activities', old: oldO.uniqueActivities, new: newO.uniqueActivities, u: '', b: true },
          ].map(m => {
            const d = m.new - m.old; const imp = m.b ? d > 0 : d < 0; const reg = m.b ? d < 0 : d > 0;
            const deltaColor = imp ? '#34d399' : reg ? '#f87171' : '#555';
            return <div key={m.label} className="flex-[1_1_160px] px-[18px] py-3.5 rounded-[10px] bg-base-700 border border-base-500">
              <div className="text-[9px] text-text-muted uppercase mb-1.5">{m.label}</div>
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold font-mono text-text-muted">{m.old}{m.u}</span>
                <span className="text-base text-text-faint">{'\u2192'}</span>
                <span className="text-[22px] font-bold font-mono text-text-primary">{m.new}{m.u}</span>
              </div>
              {d !== 0 && <div className="text-[11px] font-bold mt-1 font-mono text-[var(--delta-color)]" style={{ '--delta-color': deltaColor }}>{d > 0 ? '+' : ''}{d}{m.u} {imp ? '\u25B2' : '\u25BC'}</div>}
            </div>;
          })}
        </div>

        {/* Activity diff */}
        <div className="px-5 py-4 rounded-[10px] mb-6 bg-base-700 border border-base-500">
          <div className="text-[13px] font-bold text-text-primary font-display mb-3">Activity Changes</div>
          <div className="flex gap-5 flex-wrap">
            {added.length > 0 && <div><div className="text-[9px] text-success-light uppercase font-bold mb-1.5">+ Added ({added.length})</div><div className="flex gap-1 flex-wrap">{added.map(a => { const m = lookupMeta(a, registry); return <div key={a} className="px-2.5 py-1 rounded-[5px] text-[10px] font-semibold bg-[#34d39915] border border-[#34d39930] text-success-light">{shortName(a)} <span className="font-mono opacity-70">V:{m?.value||'?'}</span></div>; })}</div></div>}
            {removed.length > 0 && <div><div className="text-[9px] text-error-light uppercase font-bold mb-1.5">- Removed ({removed.length})</div><div className="flex gap-1 flex-wrap">{removed.map(a => { const m = lookupMeta(a, registry); return <div key={a} className="px-2.5 py-1 rounded-[5px] text-[10px] font-semibold bg-[#f8717115] border border-[#f8717130] text-error-light line-through">{shortName(a)} <span className="font-mono opacity-70">V:{m?.value||'?'}</span></div>; })}</div></div>}
            {kept.length > 0 && <div><div className="text-[9px] text-text-secondary uppercase font-bold mb-1.5">Retained ({kept.length})</div><div className="flex gap-1 flex-wrap">{kept.map(a => <div key={a} className="px-2.5 py-1 rounded-[5px] text-[10px] font-medium bg-base-600 border border-base-400 text-text-secondary">{shortName(a)}</div>)}</div></div>}
            {!added.length && !removed.length && <div className="text-[11px] text-success-light">Identical activities - only ordering differs.</div>}
          </div>
        </div>

        {/* Schedule strips */}
        <div className="mb-7"><ScheduleStrip group={oldGroup} timeSlots={timeSlots} daySlices={daySlices} registry={registry} distMatrix={distMatrix} startLocation={localStart} label={oldLabel} color="#888" colorMode={colorMode} /></div>
        <div className="mb-7"><ScheduleStrip group={newGroup} timeSlots={timeSlots} daySlices={daySlices} registry={registry} distMatrix={distMatrix} startLocation={localStart} label={newLabel} color={ACCENT} colorMode={colorMode} /></div>

        {/* Per-day breakdown */}
        <h3 className="text-[15px] font-display mb-3.5 text-accent-orange">Day-by-Day Comparison</h3>
        <div className="flex gap-4 flex-wrap mb-7">
          {daySlices.map((d, di) => <ComparisonDayCard key={d.name} dayName={d.name} oldStats={oldO.dayStats[di]} newStats={newO.dayStats[di]} color={DAY_COLORS?.[d.name] || DAY_COLORS?.[di] || '#888'} slotCount={d.end - d.start} />)}
        </div>

        {/* Slot diff */}
        <h3 className="text-[15px] font-display mb-3.5 text-accent-orange">Slot-by-Slot Diff</h3>
        <div className="overflow-x-auto bg-base-700 rounded-[10px] border border-base-500 p-4">
          <table className="w-full border-separate border-spacing-0.5">
            <thead><tr><th className="text-[9px] text-text-faint text-left px-2 py-1 min-w-[40px]" />{timeSlots.map((ts, i) => { const ds = getDaySlice(i, daySlices); const isF = daySlices.some(d => d.start === i); return <th key={i} className={`text-[8px] text-text-faint text-center px-0.5 py-[3px] font-mono whitespace-nowrap ${isF && i > 0 ? 'border-l-2 border-l-[#2a3040]' : ''}`}><div className="text-[7px] text-text-dim">{ds?.name?.substring(0, 3)}</div>{ts.time}</th>; })}</tr></thead>
            <tbody>
              <tr><td className="text-[9px] text-text-secondary font-semibold px-2 py-1">OLD</td>{oldGroup.map((act, i) => { const ch = act !== newGroup[i]; const isF = daySlices.some(d => d.start === i); return <td key={i} className={`p-0.5 text-center ${isF && i > 0 ? 'border-l-2 border-l-[#2a3040]' : ''}`}><div className={`text-[9px] font-semibold px-1 py-1.5 rounded ${ch ? 'bg-[#f8717110] text-error-light border border-[#f8717125]' : 'bg-base-600 text-text-secondary border border-base-500'}`}>{shortName(act) || '\u2014'}</div></td>; })}</tr>
              <tr><td className="text-[9px] font-semibold px-2 py-1 text-accent-orange">NEW</td>{newGroup.map((act, i) => { const ch = act !== oldGroup[i]; const isF = daySlices.some(d => d.start === i); return <td key={i} className={`p-0.5 text-center ${isF && i > 0 ? 'border-l-2 border-l-[#2a3040]' : ''}`}><div className={`text-[9px] font-semibold px-1 py-1.5 rounded ${ch ? 'bg-accent-orange/10 text-accent-orange border border-accent-orange/20' : 'bg-[#1a1f2e] text-[#888] border border-[#1e2636]'}`}>{shortName(act) || '\u2014'}</div></td>; })}</tr>
              <tr><td className="text-[8px] text-text-faint px-2 py-0.5">{'\u0394'}</td>{newGroup.map((act, i) => { const same = act === oldGroup[i]; const isF = daySlices.some(d => d.start === i); return <td key={i} className={`text-center p-0.5 ${isF && i > 0 ? 'border-l-2 border-l-[#2a3040]' : ''}`}><div className={`text-[10px] font-bold ${same ? 'text-[#333]' : 'text-accent-orange'}`}>{same ? '\u00B7' : '\u2260'}</div></td>; })}</tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* Error Summary */
export function ErrorSummary({ errorsA, errorsB }) {
  const all = [...errorsA.map(e => ({ ...e, rot: 'A' })), ...errorsB.map(e => ({ ...e, rot: 'B' }))];
  if (!all.length) return null;
  return (
    <div className="bg-base-700 rounded-[10px] border border-base-500 p-4 mt-4">
      <div className="text-[13px] font-bold text-text-primary font-display mb-2.5">Validation Issues ({all.length})</div>
      <div className="flex flex-col gap-1 max-h-[200px] overflow-auto">
        {all.filter(e => e.severity === 'error').map((e, i) => <div key={`e${i}`} className="text-[11px] px-2.5 py-1 rounded bg-[#dc262612] text-error-light flex gap-2 items-center"><span className="text-[9px] font-bold px-[5px] rounded-[3px] bg-[var(--rot-bg)] text-[var(--rot-color)]" style={{ '--rot-bg': ROT_COLORS[e.rot] + '30', '--rot-color': ROT_COLORS[e.rot] }}>Rot {e.rot}</span><span className="font-semibold">G{e.row+1}</span><span className="text-[#f8717199]">{e.msg}</span></div>)}
        {all.filter(e => e.severity === 'warn').map((e, i) => <div key={`w${i}`} className="text-[11px] px-2.5 py-1 rounded bg-[#f59e0b08] text-warning flex gap-2 items-center"><span className="text-[9px] font-bold px-[5px] rounded-[3px] bg-[var(--rot-bg)] text-[var(--rot-color)]" style={{ '--rot-bg': ROT_COLORS[e.rot] + '30', '--rot-color': ROT_COLORS[e.rot] }}>Rot {e.rot}</span><span className="font-semibold">G{e.row+1}</span><span className="text-[#fbbf2499]">{e.msg}</span></div>)}
      </div>
    </div>
  );
}
