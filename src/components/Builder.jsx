import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useDashboard } from '../context/DashboardContext';
import {
  INTENSITY_BADGE, ROT_COLORS, ACCENT, ACCENT_DIM, ACCENT_FAINT,
  SIMILARITY_COLORS, GROUP_COLORS,
} from '../constants/colors.js';
import { computeTableAverages } from '../utils/scheduleStats.js';
import { shortName } from '../utils/parsers.js';
import { cloneMatrix, validateMatrix, wouldCauseError, validateCrossRotation } from './builder/validation.js';
import ActivityChip from './builder/ActivityChip.jsx';
import RotationMatrix from './builder/RotationMatrix.jsx';
import ComparisonView, { ErrorSummary } from './builder/ComparisonView.jsx';
import FullTableComparison from './builder/FullTableComparison.jsx';

/* ===================== MAIN BUILDER ===================== */
export default function Builder({ rotations, onSave, persistedState, onStateChange }) {
  const { registry, distMatrix, timeSlots, daySlices, similarities, startLocations } = useDashboard();
  const numCols = timeSlots.length;
  const defaultGC = rotations?.[0]?.groups?.length || 11;

  // Initialize from persisted state or defaults
  const [numGroupsA, setNumGroupsA] = useState(() => persistedState?.numGroupsA ?? defaultGC);
  const [numGroupsB, setNumGroupsB] = useState(() => persistedState?.numGroupsB ?? defaultGC);
  const [groupsA, setGroupsA] = useState(() => persistedState?.groupsA ?? Array.from({ length: defaultGC }, () => Array(numCols).fill('')));
  const [groupsB, setGroupsB] = useState(() => persistedState?.groupsB ?? Array.from({ length: defaultGC }, () => Array(numCols).fill('')));
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [dropPreview, setDropPreview] = useState(null);
  const [paletteFilter, setPaletteFilter] = useState('');
  const [paletteSort, setPaletteSort] = useState(() => persistedState?.paletteSort ?? 'value');
  const [paletteSimilarity, setPaletteSimilarity] = useState(() => persistedState?.paletteSimilarity ?? 'all');
  const [showCrossValidation, setShowCrossValidation] = useState(() => persistedState?.showCrossValidation ?? true);
  const [undoStack, setUndoStack] = useState(() => persistedState?.undoStack ?? []);
  const [compareView, setCompareView] = useState(null);
  const [compareOldRot, setCompareOldRot] = useState(0);
  const [compareOldGroup, setCompareOldGroup] = useState(0);

  const [activityRotAssign, setActivityRotAssign] = useState(() => persistedState?.activityRotAssign ?? {});
  const [paletteRotFilter, setPaletteRotFilter] = useState(() => persistedState?.paletteRotFilter ?? 'all');

  const [clipboard, setClipboard] = useState(() => persistedState?.clipboard ?? null);
  const [selectionStart, setSelectionStart] = useState(null);
  const [selectionEnd, setSelectionEnd] = useState(null);
  const [isSelecting, setIsSelecting] = useState(false);

  const [cellGroups, setCellGroups] = useState(() => persistedState?.cellGroups ?? {});
  const [nextGroupId, setNextGroupId] = useState(() => persistedState?.nextGroupId ?? 1);

  // Persist state changes back to parent
  useEffect(() => {
    if (onStateChange) {
      onStateChange({
        numGroupsA,
        numGroupsB,
        groupsA,
        groupsB,
        paletteSort,
        paletteSimilarity,
        showCrossValidation,
        undoStack,
        activityRotAssign,
        paletteRotFilter,
        clipboard,
        cellGroups,
        nextGroupId,
      });
    }
  }, [numGroupsA, numGroupsB, groupsA, groupsB, paletteSort, paletteSimilarity, showCrossValidation, undoStack, activityRotAssign, paletteRotFilter, clipboard, cellGroups, nextGroupId, onStateChange]);

  const activityList = useMemo(() => { const l = []; for (const [n, e] of Object.entries(registry.canonical)) if (e.metadata) l.push({ name: n, meta: e.metadata, simGroup: similarities?.activityToGroup?.[n] || null }); return l; }, [registry, similarities]);
  const simColorMap = useMemo(() => { if (!similarities) return {}; const m = {}; Object.keys(similarities.groups).sort().forEach((g, i) => { m[g] = SIMILARITY_COLORS[i % SIMILARITY_COLORS.length]; }); return m; }, [similarities]);
  const simGroups = useMemo(() => similarities ? Object.keys(similarities.groups).sort() : [], [similarities]);

  const filteredActivities = useMemo(() => {
    let l = [...activityList];
    if (paletteFilter) { const f = paletteFilter.toLowerCase(); l = l.filter(a => a.name.toLowerCase().includes(f) || shortName(a.name).toLowerCase().includes(f)); }
    if (paletteSimilarity !== 'all') l = paletteSimilarity === 'none' ? l.filter(a => !a.simGroup) : l.filter(a => a.simGroup === paletteSimilarity);
    if (paletteRotFilter !== 'all') {
      l = l.filter(a => {
        const assign = activityRotAssign[a.name];
        if (paletteRotFilter === 'unassigned') return !assign || assign === 'both';
        if (paletteRotFilter === 'A') return assign === 'A' || assign === 'both' || !assign;
        if (paletteRotFilter === 'B') return assign === 'B' || assign === 'both' || !assign;
        return true;
      });
    }
    l.sort((a, b) => {
      if (paletteSort === 'value') return (b.meta.value||0) - (a.meta.value||0);
      if (paletteSort === 'name') return a.name.localeCompare(b.name);
      if (paletteSort === 'intensity') { const o = { Intense: 0, Moderate: 1, Mild: 2, Minimal: 3 }; return (o[a.meta.intensity]??4) - (o[b.meta.intensity]??4); }
      if (paletteSort === 'group') return (a.simGroup||'zzz').localeCompare(b.simGroup||'zzz') || (b.meta.value||0) - (a.meta.value||0);
      return 0;
    });
    return l;
  }, [activityList, paletteFilter, paletteSort, paletteSimilarity, paletteRotFilter, activityRotAssign]);

  const isActivityAllowedForRot = useCallback((activityName, rot) => {
    const assign = activityRotAssign[activityName];
    if (!assign || assign === 'both') return true;
    return assign === rot;
  }, [activityRotAssign]);

  const handleRotAssign = useCallback((activityName, rot) => {
    setActivityRotAssign(prev => {
      const current = prev[activityName];
      if (current === rot) {
        const next = { ...prev };
        delete next[activityName];
        return next;
      }
      return { ...prev, [activityName]: rot };
    });
  }, []);

  const getSelectionBounds = useCallback(() => {
    if (!selectionStart || !selectionEnd || selectionStart.rot !== selectionEnd.rot) return null;
    return {
      rot: selectionStart.rot,
      minRow: Math.min(selectionStart.row, selectionEnd.row),
      maxRow: Math.max(selectionStart.row, selectionEnd.row),
      minCol: Math.min(selectionStart.col, selectionEnd.col),
      maxCol: Math.max(selectionStart.col, selectionEnd.col),
    };
  }, [selectionStart, selectionEnd]);

  const isInSelection = useCallback((rot, row, col) => {
    const bounds = getSelectionBounds();
    if (!bounds || bounds.rot !== rot) return false;
    return row >= bounds.minRow && row <= bounds.maxRow && col >= bounds.minCol && col <= bounds.maxCol;
  }, [getSelectionBounds]);

  const getGroupForCell = useCallback((rot, row, col) => {
    for (const [groupId, group] of Object.entries(cellGroups)) {
      if (group.cells.some(c => c.rot === rot && c.row === row && c.col === col)) {
        return { groupId, ...group };
      }
    }
    return null;
  }, [cellGroups]);

  const handleCopy = useCallback(() => {
    const bounds = getSelectionBounds();
    if (!bounds) return;
    const groups = bounds.rot === 'A' ? groupsA : groupsB;
    const cells = [];

    let commonGroupColor = null;
    let allInSameGroup = true;

    for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
      for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
        cells.push({ row: r - bounds.minRow, col: c - bounds.minCol, activity: groups[r]?.[c] || '' });

        const cellGroup = getGroupForCell(bounds.rot, r, c);
        if (cellGroup) {
          if (commonGroupColor === null) {
            commonGroupColor = cellGroup.color;
          } else if (commonGroupColor !== cellGroup.color) {
            allInSameGroup = false;
          }
        } else {
          if (commonGroupColor !== null) {
            allInSameGroup = false;
          }
        }
      }
    }

    setClipboard({
      rot: bounds.rot,
      cells,
      width: bounds.maxCol - bounds.minCol + 1,
      height: bounds.maxRow - bounds.minRow + 1,
      isGroup: allInSameGroup && commonGroupColor !== null,
      groupColor: allInSameGroup ? commonGroupColor : null,
    });
  }, [getSelectionBounds, groupsA, groupsB, getGroupForCell]);

  const clearSelection = useCallback(() => {
    setSelectionStart(null);
    setSelectionEnd(null);
    setIsSelecting(false);
  }, []);

  const getUsedColors = useCallback(() => {
    return new Set(Object.values(cellGroups).map(g => g.color));
  }, [cellGroups]);

  const getNextGroupColor = useCallback(() => {
    const used = getUsedColors();
    for (const color of GROUP_COLORS) {
      if (!used.has(color)) return color;
    }
    return GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)];
  }, [getUsedColors]);

  const getGroupColor = useCallback((rot, row, col) => {
    const group = getGroupForCell(rot, row, col);
    return group?.color || null;
  }, [getGroupForCell]);

  const handleCreateGroup = useCallback(() => {
    const bounds = getSelectionBounds();
    if (!bounds) return;

    const cells = [];
    for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
      for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
        cells.push({ rot: bounds.rot, row: r, col: c });
      }
    }

    setCellGroups(prev => {
      const updated = {};
      for (const [id, group] of Object.entries(prev)) {
        const remainingCells = group.cells.filter(cell =>
          !cells.some(c => c.rot === cell.rot && c.row === cell.row && c.col === cell.col)
        );
        if (remainingCells.length > 0) {
          updated[id] = { ...group, cells: remainingCells };
        }
      }
      const color = getNextGroupColor();
      updated[`group-${nextGroupId}`] = { color, cells };
      return updated;
    });

    setNextGroupId(prev => prev + 1);
    clearSelection();
  }, [getSelectionBounds, getNextGroupColor, nextGroupId, clearSelection]);

  const handleDeleteGroup = useCallback((groupId) => {
    setCellGroups(prev => {
      const updated = { ...prev };
      delete updated[groupId];
      return updated;
    });
  }, []);

  const handleCopyGroup = useCallback((groupId) => {
    const group = cellGroups[groupId];
    if (!group) return;

    const groups = group.cells[0]?.rot === 'A' ? groupsA : groupsB;

    const rows = group.cells.map(c => c.row);
    const cols = group.cells.map(c => c.col);
    const minRow = Math.min(...rows);
    const minCol = Math.min(...cols);
    const maxRow = Math.max(...rows);
    const maxCol = Math.max(...cols);

    const cells = [];
    for (const cell of group.cells) {
      cells.push({
        row: cell.row - minRow,
        col: cell.col - minCol,
        activity: groups[cell.row]?.[cell.col] || '',
      });
    }

    setClipboard({
      rot: group.cells[0]?.rot,
      cells,
      width: maxCol - minCol + 1,
      height: maxRow - minRow + 1,
      isGroup: true,
      groupColor: group.color,
    });
  }, [cellGroups, groupsA, groupsB]);

  const errorsA = useMemo(() => validateMatrix(groupsA, timeSlots, daySlices, registry, similarities), [groupsA, timeSlots, daySlices, registry, similarities]);
  const errorsB = useMemo(() => validateMatrix(groupsB, timeSlots, daySlices, registry, similarities), [groupsB, timeSlots, daySlices, registry, similarities]);
  const crossErrors = useMemo(() => showCrossValidation ? validateCrossRotation(groupsA, groupsB, timeSlots, registry) : [], [groupsA, groupsB, timeSlots, registry, showCrossValidation]);

  const pushUndo = useCallback(() => { setUndoStack(prev => [...prev.slice(-30), { groupsA: cloneMatrix(groupsA), groupsB: cloneMatrix(groupsB), numGroupsA, numGroupsB }]); }, [groupsA, groupsB, numGroupsA, numGroupsB]);
  const handleUndo = useCallback(() => { setUndoStack(prev => { if (!prev.length) return prev; const l = prev[prev.length-1]; setGroupsA(l.groupsA); setGroupsB(l.groupsB); setNumGroupsA(l.numGroupsA); setNumGroupsB(l.numGroupsB); return prev.slice(0,-1); }); }, []);

  const handlePaste = useCallback((targetRot, targetRow, targetCol) => {
    if (!clipboard) return;
    pushUndo();

    const pastedCells = [];
    const setter = targetRot === 'A' ? setGroupsA : setGroupsB;
    setter(prev => {
      const n = cloneMatrix(prev);
      for (const cell of clipboard.cells) {
        const r = targetRow + cell.row;
        const c = targetCol + cell.col;
        if (r >= 0 && r < n.length && c >= 0 && c < numCols && cell.activity) {
          if (isActivityAllowedForRot(cell.activity, targetRot)) {
            n[r][c] = cell.activity;
            pastedCells.push({ rot: targetRot, row: r, col: c });
          }
        }
      }
      return n;
    });

    if (clipboard.isGroup && clipboard.groupColor && pastedCells.length > 0) {
      setCellGroups(prev => {
        const updated = {};
        for (const [id, group] of Object.entries(prev)) {
          const remainingCells = group.cells.filter(cell =>
            !pastedCells.some(c => c.rot === cell.rot && c.row === cell.row && c.col === cell.col)
          );
          if (remainingCells.length > 0) {
            updated[id] = { ...group, cells: remainingCells };
          }
        }
        updated[`group-${nextGroupId}`] = { color: clipboard.groupColor, cells: pastedCells };
        return updated;
      });
      setNextGroupId(prev => prev + 1);
    }
  }, [clipboard, numCols, isActivityAllowedForRot, pushUndo, nextGroupId]);

  const handleDrop = useCallback((rot, row, col, act) => {
    if (!isActivityAllowedForRot(act, rot)) return;
    pushUndo();
    (rot === 'A' ? setGroupsA : setGroupsB)(p => { const n = cloneMatrix(p); n[row][col] = act; return n; });
  }, [pushUndo, isActivityAllowedForRot]);
  const handleClear = useCallback((rot, row, col) => { pushUndo(); (rot === 'A' ? setGroupsA : setGroupsB)(p => { const n = cloneMatrix(p); n[row][col] = ''; return n; }); }, [pushUndo]);
  const handleMove = useCallback((rot, srcRow, srcCol, dstRow, dstCol) => {
    if (srcRow === dstRow && srcCol === dstCol) return;
    pushUndo();
    (rot === 'A' ? setGroupsA : setGroupsB)(p => {
      const n = cloneMatrix(p);
      const srcAct = n[srcRow][srcCol];
      const dstAct = n[dstRow][dstCol];
      n[dstRow][dstCol] = srcAct;
      n[srcRow][srcCol] = dstAct;
      return n;
    });
  }, [pushUndo]);
  const handleAddGroup = useCallback(rot => { pushUndo(); if (rot === 'A') { setNumGroupsA(n => n+1); setGroupsA(p => [...p, Array(numCols).fill('')]); } else { setNumGroupsB(n => n+1); setGroupsB(p => [...p, Array(numCols).fill('')]); } }, [pushUndo, numCols]);
  const handleRemoveGroup = useCallback(rot => { pushUndo(); if (rot === 'A') { setNumGroupsA(n => Math.max(1, n-1)); setGroupsA(p => p.length > 1 ? p.slice(0,-1) : p); } else { setNumGroupsB(n => Math.max(1, n-1)); setGroupsB(p => p.length > 1 ? p.slice(0,-1) : p); } }, [pushUndo]);
  const handleClearAll = useCallback(() => { pushUndo(); setGroupsA(Array.from({ length: numGroupsA }, () => Array(numCols).fill(''))); setGroupsB(Array.from({ length: numGroupsB }, () => Array(numCols).fill(''))); }, [pushUndo, numGroupsA, numGroupsB, numCols]);
  const handleImportRotation = useCallback((rot, idx) => { if (!rotations?.[idx]) return; pushUndo(); const s = rotations[idx]; const imp = s.groups.map(g => { const r = Array(numCols).fill(''); for (let c = 0; c < Math.min(g.length, numCols); c++) r[c] = g[c] || ''; return r; }); if (rot === 'A') { setGroupsA(imp); setNumGroupsA(imp.length); } else { setGroupsB(imp); setNumGroupsB(imp.length); } }, [rotations, pushUndo, numCols]);

  const handleSaveToDashboard = useCallback((rot) => {
    if (!onSave) return;
    const groups = rot === 'A' ? groupsA : groupsB;
    const rotIdx = rot === 'A' ? 0 : 1;
    onSave(rotIdx, groups);
  }, [onSave, groupsA, groupsB]);

  const handleCompareRow = useCallback((rot, rowIdx) => {
    const dr = 0, dg = Math.min(rowIdx, (rotations?.[0]?.groups?.length||1)-1);
    setCompareOldRot(dr); setCompareOldGroup(dg); setCompareView({ rot, row: rowIdx });
  }, [rotations]);

  const statsA = useMemo(() => { const f = groupsA.reduce((s, r) => s + r.filter(Boolean).length, 0); const t = numGroupsA * numCols; return { filled: f, total: t, pct: t ? Math.round(f/t*100) : 0 }; }, [groupsA, numGroupsA, numCols]);
  const statsB = useMemo(() => { const f = groupsB.reduce((s, r) => s + r.filter(Boolean).length, 0); const t = numGroupsB * numCols; return { filled: f, total: t, pct: t ? Math.round(f/t*100) : 0 }; }, [groupsB, numGroupsB, numCols]);

  useEffect(() => { const h = () => setDropPreview(null); document.addEventListener('dragend', h); return () => document.removeEventListener('dragend', h); }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        if (getSelectionBounds()) {
          e.preventDefault();
          handleCopy();
        }
      }
      if (e.key === 'Escape') {
        clearSelection();
        setClipboard(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleCopy, clearSelection, getSelectionBounds]);

  useEffect(() => {
    const handleMouseUp = () => {
      if (isSelecting) {
        setIsSelecting(false);
      }
    };
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [isSelecting]);

  // Comparison overlay
  if (compareView && rotations?.length) {
    const ng = compareView.rot === 'A' ? groupsA[compareView.row] : groupsB[compareView.row];
    const og = rotations[compareOldRot]?.groups?.[compareOldGroup] || [];
    const ogp = Array(numCols).fill('').map((_, i) => og[i] || '');
    return <ComparisonView newGroup={ng} oldGroup={ogp}
      oldLabel={`Existing: Rotation ${rotations[compareOldRot]?.name||'?'} \u2014 Group ${compareOldGroup+1}`}
      newLabel={`Builder: Rotation ${compareView.rot} \u2014 Group ${compareView.row+1}`}
      timeSlots={timeSlots} daySlices={daySlices} registry={registry} distMatrix={distMatrix}
      startLocation={startLocations?.[0]||null} startLocations={startLocations}
      onClose={() => setCompareView(null)} onChangeOldSource={(r,g) => { setCompareOldRot(r); setCompareOldGroup(g); }}
      existingRotations={rotations} selectedOldRot={compareOldRot} selectedOldGroup={compareOldGroup} />;
  }

  return (
    <div className="flex min-h-[calc(100vh-52px)] bg-base-800">
      {/* Palette */}
      <div className="w-[280px] shrink-0 bg-base-700 border-r border-base-500 flex flex-col overflow-hidden">
        <div className="px-3.5 pt-4 pb-3 border-b border-base-500">
          <div className="text-sm font-bold font-display mb-2.5 text-accent-orange">Activity Palette</div>
          <input type="text" placeholder="Filter activities..." value={paletteFilter} onChange={e => setPaletteFilter(e.target.value)} className="w-full px-2.5 py-[7px] rounded-md border border-base-400 bg-base-800 text-text-primary text-[11px] outline-none font-sans box-border" />
          <div className="flex gap-1 mt-2 flex-wrap">
            {[{ id: 'value', l: 'Value' }, { id: 'name', l: 'A-Z' }, { id: 'intensity', l: 'Intensity' }, { id: 'group', l: 'Group' }].map(s => <button key={s.id} onClick={() => setPaletteSort(s.id)} className={`px-2 py-[3px] rounded text-[9px] cursor-pointer font-semibold ${paletteSort === s.id ? 'border border-accent-orange bg-accent-orange/10 text-accent-orange' : 'border border-[#2a3040] bg-transparent text-[#666]'}`}>{s.l}</button>)}
          </div>
          {simGroups.length > 0 && <select value={paletteSimilarity} onChange={e => setPaletteSimilarity(e.target.value)} className="w-full px-2 py-[5px] rounded-md border border-base-400 bg-base-800 text-text-secondary text-[10px] mt-2 outline-none cursor-pointer"><option value="all">All Similarity Groups</option><option value="none">No Group</option>{simGroups.map(g => <option key={g} value={g}>{g}</option>)}</select>}
          {/* Rotation filter */}
          <div className="flex gap-1 mt-2 items-center">
            <span className="text-[9px] text-text-muted font-semibold">Show:</span>
            {[{ id: 'all', l: 'All', c: '#888' }, { id: 'A', l: 'Rot A', c: ROT_COLORS.A }, { id: 'B', l: 'Rot B', c: ROT_COLORS.B }, { id: 'unassigned', l: 'Unassigned', c: '#666' }].map(f => {
              const isActive = paletteRotFilter === f.id;
              return <button key={f.id} onClick={() => setPaletteRotFilter(f.id)} className={`px-1.5 py-[3px] rounded text-[9px] cursor-pointer font-semibold border border-[var(--btn-border)] bg-[var(--btn-bg)] text-[var(--btn-color)]`} style={{ '--btn-border': isActive ? f.c : '#2a3040', '--btn-bg': isActive ? `${f.c}20` : 'transparent', '--btn-color': isActive ? f.c : '#555' }}>{f.l}</button>;
            })}
          </div>
        </div>
        {/* Clipboard indicator */}
        {clipboard && (
          <div className="px-3.5 py-2 flex items-center gap-2 bg-[var(--clip-bg)] border-b border-b-[var(--clip-border)]" style={{ '--clip-bg': clipboard.isGroup ? `${clipboard.groupColor}20` : '#a78bfa15', '--clip-border': clipboard.isGroup ? clipboard.groupColor + '50' : '#a78bfa30' }}>
            <span className="text-[10px] font-semibold text-[var(--clip-color)]" style={{ '--clip-color': clipboard.isGroup ? clipboard.groupColor : '#a78bfa' }}>Clipboard:</span>
            <span className="text-[10px] text-text-primary">{clipboard.width}x{clipboard.height} cells{clipboard.isGroup && ' (group)'}</span>
            <button onClick={() => { setClipboard(null); clearSelection(); }} className="ml-auto text-[10px] text-text-secondary bg-transparent border-none cursor-pointer">Clear</button>
          </div>
        )}
        {/* Selection indicator */}
        {getSelectionBounds() && (
          <div className="px-3.5 py-2 bg-[#a78bfa10] flex items-center gap-2 border-b border-b-[#a78bfa20]">
            <span className="text-[10px] text-accent-purple font-semibold">Selected:</span>
            <span className="text-[10px] text-text-primary">{(getSelectionBounds().maxRow - getSelectionBounds().minRow + 1)}x{(getSelectionBounds().maxCol - getSelectionBounds().minCol + 1)}</span>
            <button onClick={handleCreateGroup} className="ml-auto px-2 py-0.5 rounded-[3px] text-[9px] border border-success-light bg-[#22c55e20] text-success-light cursor-pointer font-semibold">Group</button>
            <button onClick={handleCopy} className="px-2 py-0.5 rounded-[3px] text-[9px] border border-accent-purple bg-[#a78bfa20] text-accent-purple cursor-pointer font-semibold">Copy</button>
            <button onClick={clearSelection} className="text-[10px] text-text-secondary bg-transparent border-none cursor-pointer">x</button>
          </div>
        )}
        {/* Cell Groups panel */}
        {Object.keys(cellGroups).length > 0 && (
          <div className="px-3.5 py-2 bg-base-800 border-b border-base-500">
            <div className="text-[9px] text-text-muted font-semibold mb-1.5 uppercase tracking-wide">Cell Groups ({Object.keys(cellGroups).length})</div>
            <div className="flex flex-col gap-1">
              {Object.entries(cellGroups).map(([id, group]) => (
                <div key={id} className="flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--grp-bg)] border border-[var(--grp-border)]" style={{ '--grp-bg': `${group.color}15`, '--grp-border': `${group.color}40` }}>
                  <div className="w-2.5 h-2.5 rounded-sm shrink-0 bg-[var(--grp-color)]" style={{ '--grp-color': group.color }} />
                  <span className="text-[10px] text-text-primary flex-1">{group.cells.length} cells</span>
                  <span className="text-[9px] text-text-muted">Rot {group.cells[0]?.rot}</span>
                  <button onClick={() => handleCopyGroup(id)} className="px-[5px] py-[1px] rounded-sm text-[8px] border border-[#a78bfa50] bg-transparent text-accent-purple cursor-pointer font-semibold">Copy</button>
                  <button onClick={() => handleDeleteGroup(id)} className="text-[9px] text-text-secondary bg-transparent border-none cursor-pointer">{'\u00D7'}</button>
                </div>
              ))}
            </div>
          </div>
        )}
        {selectedActivity && <div className="px-3.5 py-2 flex items-center gap-2 bg-[#f9731615] border-b border-b-[#f9731630]"><span className="text-[10px] font-semibold text-accent-orange">Click-placing:</span><span className="text-[11px] text-text-primary font-bold font-sans">{shortName(selectedActivity)}</span><button onClick={() => setSelectedActivity(null)} className="ml-auto text-[10px] text-text-secondary bg-transparent border-none cursor-pointer">x</button></div>}
        <div className="flex-1 overflow-auto px-2.5 py-2 flex flex-col gap-1">
          {filteredActivities.map(a => { const isSelected = selectedActivity === a.name; return <ActivityChip key={a.name} name={a.name} meta={a.meta} simGroup={a.simGroup} simColorMap={simColorMap} compact={false} onDragStart={n => setDropPreview(n)} onClick={n => setSelectedActivity(p => p === n ? null : n)} style={isSelected ? { '--chip-border': ACCENT, '--chip-bg': ACCENT_FAINT, '--chip-border-w': '1.5px' } : {}} rotAssign={activityRotAssign[a.name]} onRotAssign={handleRotAssign} disabled={paletteRotFilter !== 'all' && paletteRotFilter !== 'unassigned' && activityRotAssign[a.name] && activityRotAssign[a.name] !== paletteRotFilter} />; })}
          {!filteredActivities.length && <div className="text-[11px] text-text-faint text-center p-5">No matches</div>}
        </div>
        <div className="px-3.5 py-2 border-t border-base-500 text-[10px] text-text-faint text-center">{filteredActivities.length} / {activityList.length} | {Object.keys(activityRotAssign).length} assigned</div>
      </div>

      {/* Main */}
      <div className="flex-1 overflow-auto px-6 py-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-xl font-[800] text-text-primary font-display">Matrix Builder<span className="text-[11px] text-text-faint font-normal ml-2.5 font-sans">Drag activities into cells {'\u00B7'} fill a row to compare</span></div>
          <div className="flex gap-2 items-center">
            {rotations?.length > 0 && <div className="flex gap-1">{rotations.map((rot, idx) => <div key={idx} className="flex gap-0.5"><button onClick={() => handleImportRotation('A', idx)} className="px-2.5 py-[5px] rounded-[5px] text-[10px] border border-base-400 bg-base-600 text-text-secondary cursor-pointer font-semibold">Import {rot.name} {'\u2192'} A</button><button onClick={() => handleImportRotation('B', idx)} className="px-2.5 py-[5px] rounded-[5px] text-[10px] border border-base-400 bg-base-600 text-text-secondary cursor-pointer font-semibold">Import {rot.name} {'\u2192'} B</button></div>)}</div>}
            <button onClick={() => setShowCrossValidation(v => !v)} className={`px-2.5 py-[5px] rounded-[5px] text-[10px] cursor-pointer font-semibold ${showCrossValidation ? 'border border-accent-orange bg-accent-orange/10 text-accent-orange' : 'border border-[#2a3040] bg-transparent text-[#666]'}`}>Cross-Rot {showCrossValidation ? 'ON' : 'OFF'}</button>
            <button onClick={handleUndo} disabled={!undoStack.length} className={`px-2.5 py-[5px] rounded-[5px] text-[10px] border border-base-400 bg-base-600 font-semibold ${undoStack.length ? 'text-text-secondary cursor-pointer' : 'text-text-dim cursor-not-allowed'}`}>{'\u21A9'} Undo ({undoStack.length})</button>
            <button onClick={handleClearAll} className="px-2.5 py-[5px] rounded-[5px] text-[10px] border border-[#dc262640] bg-[#dc262610] text-error-light cursor-pointer font-semibold">Clear All</button>
          </div>
        </div>

        {crossErrors.length > 0 && <div className="px-4 py-2.5 rounded-lg mb-4 bg-[#dc262610] border border-[#dc262630]"><div className="text-[11px] font-bold text-error-light mb-1.5">Cross-Rotation Conflicts ({crossErrors.length})</div>{crossErrors.slice(0, 5).map((e, i) => <div key={i} className="text-[10px] text-[#f8717199] mb-0.5">{e.msg}</div>)}{crossErrors.length > 5 && <div className="text-[10px] text-[#f8717160]">...and {crossErrors.length - 5} more</div>}</div>}

        <RotationMatrix rotLabel="A" rotColor={ROT_COLORS.A} groups={groupsA} numGroups={numGroupsA} timeSlots={timeSlots} daySlices={daySlices} registry={registry} similarities={similarities} simColorMap={simColorMap} errors={errorsA} dropPreview={dropPreview} onDrop={(r, c, a) => handleDrop('A', r, c, a)} onClear={(r, c) => handleClear('A', r, c)} onMove={(sr, sc, dr, dc) => handleMove('A', sr, sc, dr, dc)} onAddGroup={() => handleAddGroup('A')} onRemoveGroup={() => handleRemoveGroup('A')} onCompareRow={handleCompareRow} isInSelection={isInSelection} onSelectionStart={(rot, r, c) => { setSelectionStart({ rot, row: r, col: c }); setSelectionEnd({ rot, row: r, col: c }); setIsSelecting(true); }} onSelectionMove={(rot, r, c) => { if (isSelecting && selectionStart?.rot === rot) setSelectionEnd({ rot, row: r, col: c }); }} onPaste={handlePaste} hasClipboard={!!clipboard} isActivityAllowed={(act) => isActivityAllowedForRot(act, 'A')} onSave={onSave ? () => handleSaveToDashboard('A') : null} selectedActivity={selectedActivity} onClickPlace={(r, c, a) => handleDrop('A', r, c, a)} getGroupColor={getGroupColor} />
        <div className="h-5" />
        <RotationMatrix rotLabel="B" rotColor={ROT_COLORS.B} groups={groupsB} numGroups={numGroupsB} timeSlots={timeSlots} daySlices={daySlices} registry={registry} similarities={similarities} simColorMap={simColorMap} errors={errorsB} dropPreview={dropPreview} onDrop={(r, c, a) => handleDrop('B', r, c, a)} onClear={(r, c) => handleClear('B', r, c)} onMove={(sr, sc, dr, dc) => handleMove('B', sr, sc, dr, dc)} onAddGroup={() => handleAddGroup('B')} onRemoveGroup={() => handleRemoveGroup('B')} onCompareRow={handleCompareRow} isInSelection={isInSelection} onSelectionStart={(rot, r, c) => { setSelectionStart({ rot, row: r, col: c }); setSelectionEnd({ rot, row: r, col: c }); setIsSelecting(true); }} onSelectionMove={(rot, r, c) => { if (isSelecting && selectionStart?.rot === rot) setSelectionEnd({ rot, row: r, col: c }); }} onPaste={handlePaste} hasClipboard={!!clipboard} isActivityAllowed={(act) => isActivityAllowedForRot(act, 'B')} onSave={onSave ? () => handleSaveToDashboard('B') : null} selectedActivity={selectedActivity} onClickPlace={(r, c, a) => handleDrop('B', r, c, a)} getGroupColor={getGroupColor} />

        <ErrorSummary errorsA={errorsA} errorsB={errorsB} />

        <div className="flex gap-4 mt-5 flex-wrap">
          {[{ label: 'Rotation A Fill', val: statsA, color: ROT_COLORS.A }, { label: 'Rotation B Fill', val: statsB, color: ROT_COLORS.B }].map(s => <div key={s.label} className="px-5 py-3.5 bg-base-700 rounded-[10px] border border-base-500 flex-[1_1_200px]"><div className="text-[9px] text-text-muted uppercase mb-1">{s.label}</div><div className="text-[28px] font-bold font-mono text-[var(--stat-color)]" style={{ '--stat-color': s.val.pct === 100 ? '#34d399' : s.color }}>{s.val.filled}/{s.val.total}<span className="text-xs text-text-faint ml-1.5">{s.val.pct}%</span></div></div>)}
          <div className="px-5 py-3.5 bg-base-700 rounded-[10px] border border-base-500 flex-[1_1_200px]"><div className="text-[9px] text-text-muted uppercase mb-1">Validation</div><div className="flex gap-3 items-baseline"><span className={`text-[28px] font-bold font-mono ${errorsA.length + errorsB.length === 0 ? 'text-[#34d399]' : 'text-[#dc2626]'}`}>{errorsA.filter(e => e.severity === 'error').length + errorsB.filter(e => e.severity === 'error').length}</span><span className="text-[10px] text-text-muted">errors</span><span className="text-xl font-bold font-mono text-warning">{errorsA.filter(e => e.severity === 'warn').length + errorsB.filter(e => e.severity === 'warn').length}</span><span className="text-[10px] text-text-muted">warnings</span></div></div>
          <div className={`px-5 py-3.5 bg-base-700 rounded-[10px] flex-[1_1_200px] ${crossErrors.length ? 'border border-[#dc262640]' : 'border border-[#1e2636]'}`}><div className="text-[9px] text-text-muted uppercase mb-1">Cross-Rotation</div><div className={`text-[28px] font-bold font-mono ${crossErrors.length === 0 ? 'text-[#34d399]' : 'text-[#dc2626]'}`}>{crossErrors.length}</div></div>
        </div>

        {/* -- Full Table Comparison -- */}
        <FullTableComparison
          groupsA={groupsA} groupsB={groupsB}
          statsA={statsA} statsB={statsB}
          rotations={rotations} registry={registry}
          distMatrix={distMatrix} daySlices={daySlices}
          timeSlots={timeSlots} startLocations={startLocations}
        />
      </div>
    </div>
  );
}
