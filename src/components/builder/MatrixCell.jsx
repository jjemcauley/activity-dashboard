import React, { useState } from 'react';
import { INTENSITY_BADGE, ACCENT, ACCENT_DIM, ACCENT_FAINT } from '../../constants/colors.js';
import { shortName } from '../../utils/parsers.js';
import { wouldCauseError } from './validation.js';

export default function MatrixCell({ activity, row, col, errors, meta, simGroup, simColorMap, onDrop, onClear, onMove, dropPreview, registry, daySlices, allGroups, rotLabel, isSelected, onSelectionStart, onSelectionMove, onPaste, hasClipboard, isActivityAllowed, selectedActivity, onClickPlace, groupColor }) {
  const [dragOver, setDragOver] = useState(false);
  const cellErrors = errors.filter(e => e.row === row && e.col === col);
  const hasError = cellErrors.some(e => e.severity === 'error');
  const hasWarn = cellErrors.some(e => e.severity === 'warn');
  const borderColor = isSelected ? '#a78bfa' : hasError ? '#dc2626' : hasWarn ? '#f59e0b' : groupColor ? groupColor : dragOver ? ACCENT : (selectedActivity && !activity) ? ACCENT_DIM : '#1e2636';
  const bgColor = groupColor ? `${groupColor}25` : isSelected ? '#a78bfa20' : hasError ? '#dc262610' : hasWarn ? '#f59e0b08' : dragOver ? ACCENT_FAINT : (selectedActivity && !activity) ? ACCENT_FAINT : '#0f1219';
  const int = activity ? (INTENSITY_BADGE[meta?.intensity] || INTENSITY_BADGE.Minimal) : null;
  const sc = simGroup ? (simColorMap[simGroup] || '#666') : null;
  const blocked = dropPreview && !activity ? (wouldCauseError(allGroups, row, col, dropPreview, daySlices, registry) || (isActivityAllowed && !isActivityAllowed(dropPreview))) : null;
  const clickBlocked = selectedActivity && !activity ? (wouldCauseError(allGroups, row, col, selectedActivity, daySlices, registry) || (isActivityAllowed && !isActivityAllowed(selectedActivity))) : null;
  const valueScore = meta?.value || 0;
  const emptyColor = clickBlocked ? '#dc262680' : blocked ? '#dc262680' : dragOver ? ACCENT : selectedActivity ? ACCENT : '#1e2636';
  return (
    <div
      draggable={!!activity}
      onDragStart={e => {
        if (!activity) { e.preventDefault(); return; }
        e.dataTransfer.setData('text/plain', activity);
        e.dataTransfer.setData('application/x-cell', JSON.stringify({ rot: rotLabel, row, col }));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = e.dataTransfer.types.includes('application/x-cell') ? 'move' : 'copy'; setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault(); setDragOver(false);
        const cellData = e.dataTransfer.getData('application/x-cell');
        const act = e.dataTransfer.getData('text/plain');
        if (cellData) {
          const src = JSON.parse(cellData);
          if (src.rot === rotLabel) onMove(src.row, src.col, row, col);
        } else if (act) {
          onDrop(row, col, act);
        }
      }}
      onClick={e => {
        if (selectedActivity && !activity && !clickBlocked && !e.shiftKey) {
          e.preventDefault();
          onClickPlace?.(row, col, selectedActivity);
        }
      }}
      onMouseDown={e => {
        if (e.button === 0 && e.shiftKey) {
          e.preventDefault();
          onSelectionStart?.(rotLabel, row, col);
        }
      }}
      onMouseEnter={e => {
        if (e.buttons === 1 && e.shiftKey) {
          onSelectionMove?.(rotLabel, row, col);
        }
      }}
      onContextMenu={e => {
        e.preventDefault();
        if (hasClipboard && !activity) {
          onPaste?.(rotLabel, row, col);
        } else if (activity) {
          onClear(row, col);
        }
      }}
      title={cellErrors.length ? cellErrors.map(e => e.msg).join('\n') : activity ? `${activity}\nDrag to move/swap - Right-click to remove` : selectedActivity ? (clickBlocked ? 'Cannot place here' : `Click to place ${shortName(selectedActivity)}`) : hasClipboard ? 'Right-click to paste' : 'Drop here - Shift+drag to select'}
      className={`min-w-[100px] h-[64px] rounded-md flex items-center justify-center gap-1 transition-all relative overflow-hidden select-none border-[1.5px] border-[var(--cell-border)] bg-[var(--cell-bg)] ${activity ? 'cursor-grab' : (selectedActivity && !clickBlocked) ? 'cursor-pointer' : 'cursor-default'}`}
      style={{ '--cell-border': borderColor, '--cell-bg': bgColor }}>
      {activity ? <>
        {sc && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[var(--sim-color)]" style={{ '--sim-color': sc }} />}
        <div className="text-center px-1.5">
          <div className="text-[13px] font-bold text-text-primary font-sans leading-[16px]">{shortName(activity)}</div>
          <div className="flex gap-[3px] justify-center mt-0.5">
            {int && <span className="text-[11px] px-[3px] rounded-sm font-bold text-[var(--int-color)] bg-[var(--int-bg)]" style={{ '--int-color': int.color, '--int-bg': int.bg }}>{int.label}</span>}
            <span className={`text-[11px] font-mono ${valueScore >= 70 ? 'text-[#34d399]' : valueScore >= 40 ? 'text-[#fbbf24]' : 'text-[#666]'}`}>{meta?.value||'?'}</span>
          </div>
        </div>
        {(hasError || hasWarn) && <div className={`absolute top-0.5 right-[3px] text-[11px] font-[800] ${hasError ? 'text-[#dc2626]' : 'text-[#f59e0b]'}`}>{hasError ? 'X' : '!'}</div>}
        <div onClick={e => { e.stopPropagation(); onClear(row, col); }} className="cell-clear-btn absolute top-0.5 left-1 text-[11px] text-text-faint cursor-pointer opacity-0 transition-opacity">x</div>
      </> : <div className="text-[20px] font-light text-[var(--empty-color)]" style={{ '--empty-color': emptyColor }}>{clickBlocked || blocked ? 'X' : '+'}</div>}
    </div>
  );
}
