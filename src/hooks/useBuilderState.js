import { useState, useMemo, useCallback, useEffect } from 'react';
import { useDashboard } from '../context/DashboardContext';
import { SIMILARITY_COLORS, GROUP_COLORS } from '../constants/colors.js';
import { shortName } from '../utils/parsers.js';
import { cloneMatrix, validateMatrix, validateCrossRotation } from '../components/builder/validation.js';

export default function useBuilderState({ rotations, onSave, persistedState, onStateChange }) {
  const { registry, distMatrix, timeSlots, daySlices, similarities } = useDashboard();
  const numCols = timeSlots.length;
  const defaultGC = rotations?.[0]?.groups?.length || 11;

  // ── Matrix state ──
  const [numGroupsA, setNumGroupsA] = useState(() => persistedState?.numGroupsA ?? defaultGC);
  const [numGroupsB, setNumGroupsB] = useState(() => persistedState?.numGroupsB ?? defaultGC);
  const [groupsA, setGroupsA] = useState(() => persistedState?.groupsA ?? Array.from({ length: defaultGC }, () => Array(numCols).fill('')));
  const [groupsB, setGroupsB] = useState(() => persistedState?.groupsB ?? Array.from({ length: defaultGC }, () => Array(numCols).fill('')));

  // ── Palette state ──
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [dropPreview, setDropPreview] = useState(null);
  const [paletteFilter, setPaletteFilter] = useState('');
  const [paletteSort, setPaletteSort] = useState(() => persistedState?.paletteSort ?? 'value');
  const [paletteSimilarity, setPaletteSimilarity] = useState(() => persistedState?.paletteSimilarity ?? 'all');
  const [activityRotAssign, setActivityRotAssign] = useState(() => persistedState?.activityRotAssign ?? {});
  const [paletteRotFilter, setPaletteRotFilter] = useState(() => persistedState?.paletteRotFilter ?? 'all');

  // ── Selection & clipboard state ──
  const [clipboard, setClipboard] = useState(() => persistedState?.clipboard ?? null);
  const [selectionStart, setSelectionStart] = useState(null);
  const [selectionEnd, setSelectionEnd] = useState(null);
  const [isSelecting, setIsSelecting] = useState(false);

  // ── Cell groups ──
  const [cellGroups, setCellGroups] = useState(() => persistedState?.cellGroups ?? {});
  const [nextGroupId, setNextGroupId] = useState(() => persistedState?.nextGroupId ?? 1);

  // ── Undo stack ──
  const [undoStack, setUndoStack] = useState(() => persistedState?.undoStack ?? []);

  // ── Comparison state ──
  const [showCrossValidation, setShowCrossValidation] = useState(() => persistedState?.showCrossValidation ?? true);
  const [compareView, setCompareView] = useState(null);
  const [compareOldRot, setCompareOldRot] = useState(0);
  const [compareOldGroup, setCompareOldGroup] = useState(0);

  // ── Persist state changes back to parent ──
  useEffect(() => {
    if (onStateChange) {
      onStateChange({
        numGroupsA, numGroupsB, groupsA, groupsB,
        paletteSort, paletteSimilarity, showCrossValidation, undoStack,
        activityRotAssign, paletteRotFilter, clipboard, cellGroups, nextGroupId,
      });
    }
  }, [numGroupsA, numGroupsB, groupsA, groupsB, paletteSort, paletteSimilarity, showCrossValidation, undoStack, activityRotAssign, paletteRotFilter, clipboard, cellGroups, nextGroupId, onStateChange]);

  // ── Derived data ──
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

  // ── Callbacks: rotation assignment ──
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

  // ── Callbacks: selection ──
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

  const clearSelection = useCallback(() => {
    setSelectionStart(null);
    setSelectionEnd(null);
    setIsSelecting(false);
  }, []);

  // ── Callbacks: cell groups ──
  const getGroupForCell = useCallback((rot, row, col) => {
    for (const [groupId, group] of Object.entries(cellGroups)) {
      if (group.cells.some(c => c.rot === rot && c.row === row && c.col === col)) {
        return { groupId, ...group };
      }
    }
    return null;
  }, [cellGroups]);

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

  // ── Callbacks: clipboard ──
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

  // ── Callbacks: undo ──
  const pushUndo = useCallback(() => { setUndoStack(prev => [...prev.slice(-30), { groupsA: cloneMatrix(groupsA), groupsB: cloneMatrix(groupsB), numGroupsA, numGroupsB }]); }, [groupsA, groupsB, numGroupsA, numGroupsB]);
  const handleUndo = useCallback(() => { setUndoStack(prev => { if (!prev.length) return prev; const l = prev[prev.length-1]; setGroupsA(l.groupsA); setGroupsB(l.groupsB); setNumGroupsA(l.numGroupsA); setNumGroupsB(l.numGroupsB); return prev.slice(0,-1); }); }, []);

  // ── Callbacks: paste ──
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

  // ── Callbacks: matrix operations ──
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

  // ── Validation ──
  const errorsA = useMemo(() => validateMatrix(groupsA, timeSlots, daySlices, registry, similarities), [groupsA, timeSlots, daySlices, registry, similarities]);
  const errorsB = useMemo(() => validateMatrix(groupsB, timeSlots, daySlices, registry, similarities), [groupsB, timeSlots, daySlices, registry, similarities]);
  const crossErrors = useMemo(() => showCrossValidation ? validateCrossRotation(groupsA, groupsB, timeSlots, registry) : [], [groupsA, groupsB, timeSlots, registry, showCrossValidation]);

  // ── Stats ──
  const statsA = useMemo(() => { const f = groupsA.reduce((s, r) => s + r.filter(Boolean).length, 0); const t = numGroupsA * numCols; return { filled: f, total: t, pct: t ? Math.round(f/t*100) : 0 }; }, [groupsA, numGroupsA, numCols]);
  const statsB = useMemo(() => { const f = groupsB.reduce((s, r) => s + r.filter(Boolean).length, 0); const t = numGroupsB * numCols; return { filled: f, total: t, pct: t ? Math.round(f/t*100) : 0 }; }, [groupsB, numGroupsB, numCols]);

  // ── Global event effects ──
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

  return {
    // Context data
    registry, distMatrix, timeSlots, daySlices, similarities, numCols,

    // Matrix state
    groupsA, groupsB, numGroupsA, numGroupsB,

    // Palette state
    selectedActivity, setSelectedActivity, dropPreview, setDropPreview,
    paletteFilter, setPaletteFilter, paletteSort, setPaletteSort,
    paletteSimilarity, setPaletteSimilarity,
    activityRotAssign, paletteRotFilter, setPaletteRotFilter,

    // Selection & clipboard
    clipboard, setClipboard, isSelecting, selectionStart,
    setSelectionStart, setSelectionEnd, setIsSelecting,

    // Cell groups
    cellGroups, nextGroupId,

    // Comparison
    showCrossValidation, setShowCrossValidation,
    compareView, setCompareView, compareOldRot, setCompareOldRot,
    compareOldGroup, setCompareOldGroup,

    // Undo
    undoStack,

    // Derived data
    activityList, simColorMap, simGroups, filteredActivities,

    // Validation & stats
    errorsA, errorsB, crossErrors, statsA, statsB,

    // Callbacks
    isActivityAllowedForRot, handleRotAssign,
    getSelectionBounds, isInSelection, clearSelection,
    getGroupForCell, getGroupColor,
    handleCreateGroup, handleDeleteGroup, handleCopyGroup,
    handleCopy, handlePaste,
    pushUndo, handleUndo,
    handleDrop, handleClear, handleMove,
    handleAddGroup, handleRemoveGroup, handleClearAll,
    handleImportRotation, handleSaveToDashboard, handleCompareRow,
  };
}
