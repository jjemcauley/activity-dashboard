import React from 'react';
import { INTENSITY_BADGE, ROT_COLORS } from '../../constants/colors.js';
import { shortName } from '../../utils/parsers.js';

export default function ActivityChip({ name, meta, simGroup, simColorMap, compact, onDragStart, onClick, disabled, style: extraStyle, rotAssign, onRotAssign }) {
  const int = INTENSITY_BADGE[meta?.intensity] || INTENSITY_BADGE.Minimal;
  const sc = simGroup ? (simColorMap[simGroup] || '#666') : null;
  const assignColor = rotAssign === 'A' ? ROT_COLORS.A : rotAssign === 'B' ? ROT_COLORS.B : null;
  const chipBorderColor = assignColor || (disabled ? '#1e263680' : '#2a3040');
  const valueScore = meta?.value || 0;
  return (
    <div draggable={!disabled} onDragStart={e => { if (disabled) return; e.dataTransfer.setData('text/plain', name); e.dataTransfer.effectAllowed = 'copy'; onDragStart?.(name); }}
      onClick={() => !disabled && onClick?.(name)}
      className={`rounded-md flex items-center gap-1.5 transition-all select-none shrink-0 ${compact ? 'px-2 py-1' : 'px-2.5 py-1.5'} ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-grab'} border-[length:var(--chip-border-w)] border-[var(--chip-border)] bg-[var(--chip-bg)]`}
      style={{ '--chip-border': chipBorderColor, '--chip-bg': disabled ? '#1a1f2e80' : '#1a1f2e', '--chip-border-w': '1px', ...extraStyle }}>
      {sc && <div className={`w-[3px] rounded-sm shrink-0 bg-[var(--sim-color)] ${compact ? 'h-[14px]' : 'h-[18px]'}`} style={{ '--sim-color': sc }} />}
      <div className="min-w-0 flex-1">
        <div className={`font-semibold whitespace-nowrap overflow-hidden text-ellipsis font-sans ${compact ? 'text-[10px]' : 'text-[11px]'} ${disabled ? 'text-text-faint' : 'text-text-primary'}`}>{compact ? shortName(name) : name}</div>
        {!compact && <div className="flex gap-1.5 mt-0.5 text-[9px]">
          <span className="px-1 rounded-[3px] font-semibold text-[var(--int-color)] bg-[var(--int-bg)]" style={{ '--int-color': int.color, '--int-bg': int.bg }}>{int.label}</span>
          <span className={`font-mono ${valueScore >= 70 ? 'text-[#34d399]' : valueScore >= 40 ? 'text-[#fbbf24]' : 'text-[#888]'}`}>V:{meta?.value||'?'}</span>
          {(meta?.maxGroups||1) === 1 && <span className="font-semibold text-accent-pink">x1</span>}
          {(meta?.maxGroups||1) > 1 && <span className="font-semibold text-[#818cf8]">x{meta.maxGroups}</span>}
        </div>}
      </div>
      {/* Rotation assignment buttons */}
      {!compact && onRotAssign && (
        <div className="flex gap-0.5 ml-auto shrink-0" onClick={e => e.stopPropagation()}>
          <button
            onClick={(e) => { e.stopPropagation(); onRotAssign(name, 'A'); }}
            className={`w-[18px] h-[18px] rounded-[3px] text-[9px] font-bold cursor-pointer flex items-center justify-center border border-[var(--btn-border)] bg-[var(--btn-bg)] text-[var(--btn-color)]`}
            style={{ '--btn-border': rotAssign === 'A' ? ROT_COLORS.A : '#2a3040', '--btn-bg': rotAssign === 'A' ? ROT_COLORS.A : 'transparent', '--btn-color': rotAssign === 'A' ? '#0f1219' : '#555' }}
            title="Assign to Rotation A only"
          >A</button>
          <button
            onClick={(e) => { e.stopPropagation(); onRotAssign(name, 'B'); }}
            className={`w-[18px] h-[18px] rounded-[3px] text-[9px] font-bold cursor-pointer flex items-center justify-center border border-[var(--btn-border)] bg-[var(--btn-bg)] text-[var(--btn-color)]`}
            style={{ '--btn-border': rotAssign === 'B' ? ROT_COLORS.B : '#2a3040', '--btn-bg': rotAssign === 'B' ? ROT_COLORS.B : 'transparent', '--btn-color': rotAssign === 'B' ? '#0f1219' : '#555' }}
            title="Assign to Rotation B only"
          >B</button>
        </div>
      )}
    </div>
  );
}
