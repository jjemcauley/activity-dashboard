import { useState, useMemo, useEffect } from "react";
import { useDashboard } from "../context/DashboardContext";
import { computeDayStats } from "../utils/scheduleStats.js";

/* ── Pure logic helpers ── */

function cloneGroups(groups) {
  return groups.map((g) => [...g]);
}

/** Decompose the permutation between two Latin square rows into disjoint cycles */
function decomposeCycles(rowA, rowB) {
  const visited = new Set();
  const cycles = [];

  for (let c = 0; c < rowA.length; c++) {
    const start = rowA[c];
    if (!start || visited.has(start)) continue;

    const cycle = [];
    let sym = start;
    while (!visited.has(sym)) {
      visited.add(sym);
      const col = rowA.indexOf(sym);
      if (col === -1) break;
      cycle.push({ col, fromA: sym, fromB: rowB[col] });
      sym = rowB[col]; // follow the permutation
    }
    if (cycle.length >= 2) cycles.push(cycle);
  }
  return cycles;
}

/** Apply selected cycles: swap cells between two rows at the cycle's columns */
function applyCycles(groups, rA, rB, cycles, which) {
  const g = cloneGroups(groups);
  for (const ci of which) {
    for (const { col } of cycles[ci]) {
      [g[rA][col], g[rB][col]] = [g[rB][col], g[rA][col]];
    }
  }
  return g;
}

/* ── Hook ── */

export default function useEditorState({ rotations, rotIdx }) {
  const { registry, distMatrix, timeSlots, daySlices } = useDashboard();

  const original = useMemo(
    () => rotations[rotIdx]?.groups || [],
    [rotations, rotIdx]
  );

  // -- Working state --
  const [draft, setDraft] = useState(() => cloneGroups(original));
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [flashKeys, setFlashKeys] = useState(new Set());

  // -- Operation mode --
  const [op, setOp] = useState(null);
  const [pick1, setPick1] = useState(null);
  const [pick2, setPick2] = useState(null);

  // Cycle-switch specifics
  const [cycles, setCycles] = useState([]);
  const [cycleOn, setCycleOn] = useState([]);

  // Day boundaries
  const dayBounds = useMemo(
    () => new Set(daySlices.map((d) => d.start).filter((s) => s > 0)),
    [daySlices]
  );

  // Reset draft when rotation changes
  useEffect(() => {
    setDraft(cloneGroups(original));
    setHistory([]);
    setFuture([]);
    clearPicks();
  }, [original]);

  // -- Helpers --

  function clearPicks() {
    setPick1(null);
    setPick2(null);
    setCycles([]);
    setCycleOn([]);
  }

  function commit(next, affected) {
    setHistory((h) => [...h, draft]);
    setFuture([]);
    setDraft(next);
    setFlashKeys(new Set(affected));
    setTimeout(() => setFlashKeys(new Set()), 600);
    clearPicks();
  }

  function undo() {
    if (!history.length) return;
    setFuture((f) => [...f, draft]);
    setDraft(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
    clearPicks();
  }

  function redo() {
    if (!future.length) return;
    setHistory((h) => [...h, draft]);
    setDraft(future[future.length - 1]);
    setFuture((f) => f.slice(0, -1));
    clearPicks();
  }

  function revertAll() {
    setHistory((h) => [...h, draft]);
    setFuture([]);
    setDraft(cloneGroups(original));
    clearPicks();
  }

  function selectOp(o) {
    clearPicks();
    setOp((prev) => (prev === o ? null : o));
  }

  // Change count
  const changes = useMemo(() => {
    let n = 0;
    for (let g = 0; g < draft.length; g++)
      for (let s = 0; s < (draft[g]?.length || 0); s++)
        if (draft[g][s] !== original[g]?.[s]) n++;
    return n;
  }, [draft, original]);

  // -- Operation handlers --

  function onGroupClick(gi) {
    if (op === "row-swap") {
      if (pick1 === null) return setPick1(gi);
      if (pick1 === gi) return setPick1(null);
      const next = cloneGroups(draft);
      [next[pick1], next[gi]] = [next[gi], next[pick1]];
      const keys = [];
      for (let s = 0; s < timeSlots.length; s++)
        keys.push(`${pick1}-${s}`, `${gi}-${s}`);
      commit(next, keys);
    }
    if (op === "cycle-switch") {
      if (pick1 === null) return setPick1(gi);
      if (pick1 === gi) return clearPicks();
      setPick2(gi);
      const c = decomposeCycles(draft[pick1], draft[gi]);
      setCycles(c);
      setCycleOn(c.map(() => false));
    }
  }

  function onSlotClick(si) {
    if (op !== "col-swap") return;
    if (pick1 === null) return setPick1(si);
    if (pick1 === si) return setPick1(null);
    const next = cloneGroups(draft);
    const keys = [];
    for (let g = 0; g < next.length; g++) {
      [next[g][pick1], next[g][si]] = [next[g][si], next[g][pick1]];
      keys.push(`${g}-${pick1}`, `${g}-${si}`);
    }
    commit(next, keys);
  }

  function onCellClick(gi, si) {
    if (op !== "symbol-swap") return;
    const act = draft[gi][si];
    if (!pick1) return setPick1(act);
    if (pick1 === act) return setPick1(null);
    const next = cloneGroups(draft);
    const keys = [];
    for (let g = 0; g < next.length; g++) {
      for (let s = 0; s < next[g].length; s++) {
        if (next[g][s] === pick1) {
          next[g][s] = act;
          keys.push(`${g}-${s}`);
        } else if (next[g][s] === act) {
          next[g][s] = pick1;
          keys.push(`${g}-${s}`);
        }
      }
    }
    commit(next, keys);
  }

  function toggleCycle(ci) {
    setCycleOn((p) => p.map((v, i) => (i === ci ? !v : v)));
  }

  function commitCycles() {
    const sel = cycleOn.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    if (!sel.length) return;
    const next = applyCycles(draft, pick1, pick2, cycles, sel);
    const keys = [];
    for (const ci of sel)
      for (const { col } of cycles[ci])
        keys.push(`${pick1}-${col}`, `${pick2}-${col}`);
    commit(next, keys);
  }

  // -- Preview for cycle switch --
  const preview = useMemo(() => {
    if (
      op !== "cycle-switch" ||
      !cycles.length ||
      pick1 === null ||
      pick2 === null
    )
      return null;
    const sel = cycleOn.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    if (!sel.length) return null;
    return applyCycles(draft, pick1, pick2, cycles, sel);
  }, [op, cycles, cycleOn, draft, pick1, pick2]);

  // -- Impact stats for cycle preview --
  const impactStats = useMemo(() => {
    if (!preview || pick1 === null || pick2 === null) return null;
    const stats = {};
    for (const gi of [pick1, pick2]) {
      stats[gi] = {};
      for (const d of daySlices) {
        const before = computeDayStats(
          draft[gi],
          d.start,
          d.end,
          registry,
          distMatrix,
          null
        );
        const after = computeDayStats(
          preview[gi],
          d.start,
          d.end,
          registry,
          distMatrix,
          null
        );
        stats[gi][d.name] = {
          valDelta: after.avgVal - before.avgVal,
          distDelta: after.totalDist - before.totalDist,
        };
      }
    }
    return stats;
  }, [preview, pick1, pick2, draft, daySlices, registry, distMatrix]);

  // -- Display value (respects preview) --
  function displayVal(gi, si) {
    if (preview && (gi === pick1 || gi === pick2)) return preview[gi][si];
    return draft[gi]?.[si];
  }

  return {
    // State
    draft,
    original,
    op,
    pick1,
    pick2,
    cycles,
    cycleOn,
    flashKeys,
    changes,
    preview,
    impactStats,
    dayBounds,
    history,
    future,

    // Actions
    undo,
    redo,
    revertAll,
    selectOp,
    onGroupClick,
    onSlotClick,
    onCellClick,
    toggleCycle,
    commitCycles,
    displayVal,
  };
}
