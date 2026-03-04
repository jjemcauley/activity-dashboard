import React, { useState } from 'react';
import { DAY_COLORS, ROT_COLORS } from '../../constants/colors.js';
import { lookupMeta } from '../../utils/parsers.js';
import MatrixCell from './MatrixCell.jsx';

export default function RotationMatrix({ rotLabel, rotColor, groups, numGroups, timeSlots, daySlices, registry, similarities, simColorMap, errors, dropPreview, onDrop, onClear, onMove, onAddGroup, onRemoveGroup, onCompareRow, isInSelection, onSelectionStart, onSelectionMove, onPaste, hasClipboard, isActivityAllowed, onSave, selectedActivity, onClickPlace, getGroupColor }) {
  const [collapsed, setCollapsed] = useState(false);
  const numCols = timeSlots.length;
  const filledCount = groups.reduce((s, r) => s + r.filter(Boolean).length, 0);
  const totalCells = numGroups * numCols;
  const fillPct = totalCells > 0 ? Math.round((filledCount / totalCells) * 100) : 0;
  const errCount = errors.filter(e => e.severity === 'error').length;
  const wrnCount = errors.filter(e => e.severity === 'warn').length;
  return (
    <div className="bg-base-700 rounded-xl overflow-hidden border border-[var(--rot-border)]" style={{ '--rot-border': `${rotColor}30` }}>
      <div className="px-5 py-3.5 flex items-center justify-between cursor-pointer bg-[image:var(--header-bg)] border-b border-b-[var(--header-bb)]" style={{ '--header-bg': `linear-gradient(135deg, ${rotColor}12, transparent)`, '--header-bb': `${rotColor}25` }} onClick={() => setCollapsed(c => !c)}>
        <div className="flex items-center gap-3">
          <div className={`text-xs transition-transform duration-200 text-[var(--rot-color)] ${collapsed ? '-rotate-90' : 'rotate-0'}`} style={{ '--rot-color': rotColor }}>{'\u25BC'}</div>
          <div className="text-lg font-[800] font-display text-[var(--rot-color)]" style={{ '--rot-color': rotColor }}>Rotation {rotLabel}</div>
          <div className="text-[10px] text-text-secondary font-mono">{numGroups} groups x {numCols} slots</div>
        </div>
        <div className="flex items-center gap-3.5">
          <div className="flex items-center gap-2">
            <div className="w-20 h-1.5 rounded-[3px] bg-base-800 overflow-hidden">
              <div className="h-full rounded-[3px] transition-[width] duration-300 bg-[var(--fill-color)] w-[var(--fill-pct)]" style={{ '--fill-color': fillPct === 100 ? '#34d399' : rotColor, '--fill-pct': `${fillPct}%` }} />
            </div>
            <span className={`text-[10px] font-mono ${fillPct === 100 ? 'text-[#34d399]' : 'text-[#888]'}`}>{fillPct}%</span>
          </div>
          {errCount > 0 && <span className="text-[10px] font-bold text-error px-2 py-0.5 rounded bg-[#dc262620]">{errCount} err</span>}
          {wrnCount > 0 && <span className="text-[10px] font-bold text-warning px-2 py-0.5 rounded bg-[#f59e0b20]">{wrnCount} wrn</span>}
          {onSave && fillPct === 100 && (
            <button onClick={e => { e.stopPropagation(); onSave(); }} className="px-3 py-1 rounded border border-success-light text-success-light text-[10px] font-bold cursor-pointer bg-[#34d39920]">
              Save to Dashboard
            </button>
          )}
          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
            <button onClick={onRemoveGroup} disabled={numGroups <= 1} className={`w-6 h-6 rounded border border-base-400 bg-base-800 text-sm flex items-center justify-center ${numGroups <= 1 ? 'text-base-300 cursor-not-allowed' : 'text-text-secondary cursor-pointer'}`}>-</button>
            <button onClick={onAddGroup} className="w-6 h-6 rounded border border-base-400 bg-base-800 text-text-secondary cursor-pointer text-sm flex items-center justify-center">+</button>
          </div>
        </div>
      </div>
      {!collapsed && <div className="overflow-auto px-4 pt-3 pb-4">
        <table className="border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="min-w-[48px]" />
              {daySlices.map((ds, di) => <React.Fragment key={ds.name}>{di > 0 && <th className="w-2.5" />}<th colSpan={ds.end - ds.start} className="text-center py-1 text-[11px] font-bold font-display text-[var(--day-color)] border-b-[3px] border-b-[var(--day-border)]" style={{ '--day-color': DAY_COLORS?.[di] || '#888', '--day-border': `${DAY_COLORS?.[di] || '#333'}50` }}>{ds.name}</th></React.Fragment>)}
              <th className="min-w-[80px]" />
            </tr>
            <tr>
              <th className="text-[9px] text-text-faint font-semibold text-center px-1.5 py-1">GRP</th>
              {timeSlots.map((ts, ci) => { const isNewDay = ci > 0 && daySlices.some(d => d.start === ci); return <React.Fragment key={ci}>{isNewDay && <th className="w-2.5" />}<th className="text-[9px] text-text-faint font-medium text-center px-1 py-1 font-mono whitespace-nowrap">{ts.time}</th></React.Fragment>; })}
              <th />
            </tr>
          </thead>
          <tbody>
            {groups.map((row, ri) => {
              const isFilled = row.every(cell => cell && cell.length > 0);
              return (
                <tr key={ri}>
                  <td className="text-[11px] font-bold text-center px-2 font-mono whitespace-nowrap text-[var(--rot-color)]" style={{ '--rot-color': rotColor }}>G{ri + 1}</td>
                  {row.map((act, ci) => {
                    const meta = act ? lookupMeta(act, registry) : null;
                    const sg = act ? similarities?.activityToGroup?.[act] || null : null;
                    const isNewDay = ci > 0 && daySlices.some(d => d.start === ci);
                    const dayIdx = daySlices.findIndex(d => ci >= d.start && ci < d.end);
                    const dayColor = DAY_COLORS?.[dayIdx] || '#333';
                    return <React.Fragment key={ci}>{isNewDay && <td className="w-2.5 bg-[var(--day-bg)] border-l-2 border-l-[var(--day-bl)]" style={{ '--day-bg': `${dayColor}08`, '--day-bl': `${dayColor}20` }} />}<td className="p-0"><MatrixCell activity={act} row={ri} col={ci} errors={errors} meta={meta} simGroup={sg} simColorMap={simColorMap} onDrop={onDrop} onClear={onClear} onMove={onMove} dropPreview={dropPreview} registry={registry} daySlices={daySlices} allGroups={groups} rotLabel={rotLabel} isSelected={isInSelection?.(rotLabel, ri, ci)} onSelectionStart={onSelectionStart} onSelectionMove={onSelectionMove} onPaste={onPaste} hasClipboard={hasClipboard} isActivityAllowed={isActivityAllowed} selectedActivity={selectedActivity} onClickPlace={onClickPlace} groupColor={getGroupColor?.(rotLabel, ri, ci)} /></td></React.Fragment>;
                  })}
                  <td className="px-1 align-middle">
                    {isFilled ? (
                      <button onClick={() => onCompareRow(rotLabel, ri)} className="px-2.5 py-1.5 rounded-md text-[9px] font-bold cursor-pointer transition-all whitespace-nowrap flex items-center gap-1 border border-[#f9731650] bg-[linear-gradient(135deg,#f9731615,#f9731608)] text-accent-orange" title={`Compare Group ${ri+1}`}>
                        <span className="text-xs leading-none">&#8660;</span> Compare
                      </button>
                    ) : <div className="text-[9px] text-base-300 text-center py-1.5 px-1 whitespace-nowrap">Fill row</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>}
    </div>
  );
}
