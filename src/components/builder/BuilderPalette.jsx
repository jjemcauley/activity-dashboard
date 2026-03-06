import React from 'react';
import { ROT_COLORS, ACCENT, ACCENT_FAINT } from '../../constants/colors.js';
import { shortName } from '../../utils/parsers.js';
import ActivityChip from './ActivityChip.jsx';

export default function BuilderPalette({
  paletteFilter, setPaletteFilter, paletteSort, setPaletteSort,
  paletteSimilarity, setPaletteSimilarity, simGroups,
  paletteRotFilter, setPaletteRotFilter,
  clipboard, setClipboard, clearSelection,
  getSelectionBounds, handleCreateGroup, handleCopy,
  cellGroups, handleCopyGroup, handleDeleteGroup,
  selectedActivity, setSelectedActivity,
  filteredActivities, activityList, simColorMap,
  setDropPreview, activityRotAssign, handleRotAssign,
}) {
  const selectionBounds = getSelectionBounds();

  return (
    <div className="w-[300px] shrink-0 bg-base-700 border-r border-base-500 flex flex-col overflow-hidden">
      <div className="px-3.5 pt-4 pb-3 border-b border-base-500">
        <div className="text-sm font-bold font-display mb-2.5 text-accent-orange">Activity Palette</div>
        <input type="text" placeholder="Filter activities..." value={paletteFilter} onChange={e => setPaletteFilter(e.target.value)} className="w-full px-2.5 py-[7px] rounded-md border border-base-400 bg-base-800 text-text-primary text-[13px] outline-none font-sans box-border" />
        <div className="flex gap-1 mt-2 flex-wrap">
          {[{ id: 'value', l: 'Value' }, { id: 'name', l: 'A-Z' }, { id: 'intensity', l: 'Intensity' }, { id: 'group', l: 'Group' }].map(s => <button key={s.id} onClick={() => setPaletteSort(s.id)} className={`px-2 py-[3px] rounded text-[11px] cursor-pointer font-semibold ${paletteSort === s.id ? 'border border-accent-orange bg-accent-orange/10 text-accent-orange' : 'border border-[#2a3040] bg-transparent text-[#666]'}`}>{s.l}</button>)}
        </div>
        {simGroups.length > 0 && <select value={paletteSimilarity} onChange={e => setPaletteSimilarity(e.target.value)} className="w-full px-2 py-[5px] rounded-md border border-base-400 bg-base-800 text-text-secondary text-[11px] mt-2 outline-none cursor-pointer"><option value="all">All Similarity Groups</option><option value="none">No Group</option>{simGroups.map(g => <option key={g} value={g}>{g}</option>)}</select>}
        {/* Rotation filter */}
        <div className="flex gap-1 mt-2 items-center">
          <span className="text-[11px] text-text-muted font-semibold">Show:</span>
          {[{ id: 'all', l: 'All', c: '#888' }, { id: 'A', l: 'Rot A', c: ROT_COLORS.A }, { id: 'B', l: 'Rot B', c: ROT_COLORS.B }, { id: 'unassigned', l: 'Unassigned', c: '#666' }].map(f => {
            const isActive = paletteRotFilter === f.id;
            return <button key={f.id} onClick={() => setPaletteRotFilter(f.id)} className={`px-1.5 py-[3px] rounded text-[11px] cursor-pointer font-semibold border border-[var(--btn-border)] bg-[var(--btn-bg)] text-[var(--btn-color)]`} style={{ '--btn-border': isActive ? f.c : '#2a3040', '--btn-bg': isActive ? `${f.c}20` : 'transparent', '--btn-color': isActive ? f.c : '#555' }}>{f.l}</button>;
          })}
        </div>
      </div>
      {/* Clipboard indicator */}
      {clipboard && (
        <div className="px-3.5 py-2 flex items-center gap-2 bg-[var(--clip-bg)] border-b border-b-[var(--clip-border)]" style={{ '--clip-bg': clipboard.isGroup ? `${clipboard.groupColor}20` : '#a78bfa15', '--clip-border': clipboard.isGroup ? clipboard.groupColor + '50' : '#a78bfa30' }}>
          <span className="text-[11px] font-semibold text-[var(--clip-color)]" style={{ '--clip-color': clipboard.isGroup ? clipboard.groupColor : '#a78bfa' }}>Clipboard:</span>
          <span className="text-[11px] text-text-primary">{clipboard.width}x{clipboard.height} cells{clipboard.isGroup && ' (group)'}</span>
          <button onClick={() => { setClipboard(null); clearSelection(); }} className="ml-auto text-[11px] text-text-secondary bg-transparent border-none cursor-pointer">Clear</button>
        </div>
      )}
      {/* Selection indicator */}
      {selectionBounds && (
        <div className="px-3.5 py-2 bg-[#a78bfa10] flex items-center gap-2 border-b border-b-[#a78bfa20]">
          <span className="text-[11px] text-accent-purple font-semibold">Selected:</span>
          <span className="text-[11px] text-text-primary">{(selectionBounds.maxRow - selectionBounds.minRow + 1)}x{(selectionBounds.maxCol - selectionBounds.minCol + 1)}</span>
          <button onClick={handleCreateGroup} className="ml-auto px-2 py-0.5 rounded-[3px] text-[11px] border border-success-light bg-[#22c55e20] text-success-light cursor-pointer font-semibold">Group</button>
          <button onClick={handleCopy} className="px-2 py-0.5 rounded-[3px] text-[11px] border border-accent-purple bg-[#a78bfa20] text-accent-purple cursor-pointer font-semibold">Copy</button>
          <button onClick={clearSelection} className="text-[11px] text-text-secondary bg-transparent border-none cursor-pointer">x</button>
        </div>
      )}
      {/* Cell Groups panel */}
      {Object.keys(cellGroups).length > 0 && (
        <div className="px-3.5 py-2 bg-base-800 border-b border-base-500">
          <div className="text-[11px] text-text-muted font-semibold mb-1.5 uppercase tracking-wide">Cell Groups ({Object.keys(cellGroups).length})</div>
          <div className="flex flex-col gap-1">
            {Object.entries(cellGroups).map(([id, group]) => (
              <div key={id} className="flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--grp-bg)] border border-[var(--grp-border)]" style={{ '--grp-bg': `${group.color}15`, '--grp-border': `${group.color}40` }}>
                <div className="w-2.5 h-2.5 rounded-sm shrink-0 bg-[var(--grp-color)]" style={{ '--grp-color': group.color }} />
                <span className="text-[11px] text-text-primary flex-1">{group.cells.length} cells</span>
                <span className="text-[11px] text-text-muted">Rot {group.cells[0]?.rot}</span>
                <button onClick={() => handleCopyGroup(id)} className="px-[5px] py-[1px] rounded-sm text-[11px] border border-[#a78bfa50] bg-transparent text-accent-purple cursor-pointer font-semibold">Copy</button>
                <button onClick={() => handleDeleteGroup(id)} className="text-[11px] text-text-secondary bg-transparent border-none cursor-pointer">{'\u00D7'}</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {selectedActivity && <div className="px-3.5 py-2 flex items-center gap-2 bg-[#f9731615] border-b border-b-[#f9731630]"><span className="text-[11px] font-semibold text-accent-orange">Click-placing:</span><span className="text-[11px] text-text-primary font-bold font-sans">{shortName(selectedActivity)}</span><button onClick={() => setSelectedActivity(null)} className="ml-auto text-[11px] text-text-secondary bg-transparent border-none cursor-pointer">x</button></div>}
      <div className="flex-1 overflow-auto px-2.5 py-2 flex flex-col gap-1">
        {filteredActivities.map(a => { const isSelected = selectedActivity === a.name; return <ActivityChip key={a.name} name={a.name} meta={a.meta} simGroup={a.simGroup} simColorMap={simColorMap} compact={false} onDragStart={n => setDropPreview(n)} onClick={n => setSelectedActivity(p => p === n ? null : n)} style={isSelected ? { '--chip-border': ACCENT, '--chip-bg': ACCENT_FAINT, '--chip-border-w': '1.5px' } : {}} rotAssign={activityRotAssign[a.name]} onRotAssign={handleRotAssign} disabled={paletteRotFilter !== 'all' && paletteRotFilter !== 'unassigned' && activityRotAssign[a.name] && activityRotAssign[a.name] !== paletteRotFilter} />; })}
        {!filteredActivities.length && <div className="text-[11px] text-text-faint text-center p-5">No matches</div>}
      </div>
      <div className="px-3.5 py-2 border-t border-base-500 text-[11px] text-text-faint text-center">{filteredActivities.length} / {activityList.length} | {Object.keys(activityRotAssign).length} assigned</div>
    </div>
  );
}
