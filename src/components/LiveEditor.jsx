import React, { useState, useMemo, useEffect } from "react";
import { DAY_COLORS, CYCLE_COLORS, valueColor, valueTextColor } from "../constants/colors.js";
import { getDistance, lookupMeta, shortName } from "../utils/parsers.js";

/* ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
   Constants
    */

const OPS = {
  "row-swap": {
    label: "Row Swap",
    icon: "⇅",
    desc: "Swap two groups' entire schedules",
  },
  "col-swap": {
    label: "Column Swap",
    icon: "⇆",
    desc: "Swap two time slots across the schedule",
  },
  "symbol-swap": {
    label: "Symbol Swap",
    icon: "⟲",
    desc: "Globally trade every instance of two activities",
  },
  "cycle-switch": {
    label: "Cycle Switch",
    icon: "⟳",
    desc: "Decompose and selectively switch cycles between two groups",
  },
};

/* ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
   Pure logic helpers
   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ */

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

/** Compute per-day stats for a single group row */
function dayStats(group, start, end, registry, distMatrix) {
  const slice = group.slice(start, end);
  const vals = slice.map((a) => lookupMeta(a, registry)?.value ?? 0);
  const avg = slice.length
    ? Math.round(vals.reduce((s, v) => s + v, 0) / slice.length)
    : 0;
  let totalDist = 0,
    maxDist = 0;
  for (let i = 1; i < slice.length; i++) {
    const d = getDistance(slice[i - 1], slice[i], distMatrix, registry.nameMap);
    if (d !== null) {
      totalDist += d;
      maxDist = Math.max(maxDist, d);
    }
  }
  return { avg, totalDist, maxDist };
}

/* ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
   LiveEditor Component
   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ */

export default function LiveEditor({
  registry,
  distMatrix,
  rotations,
  timeSlots,
  daySlices,
  onSave,
  savedEdits,
}) {
  const [rotIdx, setRotIdx] = useState(0);
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
        const before = dayStats(
          draft[gi],
          d.start,
          d.end,
          registry,
          distMatrix
        );
        const after = dayStats(
          preview[gi],
          d.start,
          d.end,
          registry,
          distMatrix
        );
        stats[gi][d.name] = {
          valDelta: after.avg - before.avg,
          distDelta: after.totalDist - before.totalDist,
        };
      }
    }
    return stats;
  }, [preview, pick1, pick2, draft, daySlices, registry, distMatrix]);

  // -- Cell classification --

  function cellState(gi, si) {
    const key = `${gi}-${si}`;
    if (flashKeys.has(key)) return "flash";

    if (op === "row-swap" && pick1 === gi) return "sel-row";
    if (op === "col-swap" && pick1 === si) return "sel-col";
    if (op === "col-swap" && pick1 !== null && pick1 !== si)
      return "target-col";
    if (op === "symbol-swap" && draft[gi]?.[si] === pick1) return "sel-sym-a";
    if (
      op === "cycle-switch" &&
      cycles.length > 0 &&
      (gi === pick1 || gi === pick2)
    ) {
      for (let ci = 0; ci < cycles.length; ci++) {
        if (cycles[ci].some((step) => step.col === si)) {
          return cycleOn[ci] ? `cyc-on-${ci}` : `cyc-off-${ci}`;
        }
      }
    }
    const isChanged = draft[gi]?.[si] !== original[gi]?.[si];
    return isChanged ? "changed" : null;
  }

  function borderFor(state) {
    if (!state) return "1px solid transparent";
    if (state === "flash") return "1px solid #22d3ee";
    if (state === "sel-row") return "2px solid #22d3ee";
    if (state === "sel-col") return "2px solid #22d3ee";
    if (state === "target-col") return "1px dashed #22d3ee44";
    if (state === "sel-sym-a") return "2px solid #f472b6";
    if (state === "changed") return "1px solid #d4a84744";
    if (state.startsWith("cyc-on-")) {
      return `2px solid ${
        CYCLE_COLORS[parseInt(state.split("-")[2]) % CYCLE_COLORS.length]
      }`;
    }
    if (state.startsWith("cyc-off-")) {
      return `1px dashed ${
        CYCLE_COLORS[parseInt(state.split("-")[2]) % CYCLE_COLORS.length]
      }44`;
    }
    return "1px solid transparent";
  }

  function overlayFor(state) {
    if (state === "sel-row") return "rgba(34,211,238,0.06)";
    if (state?.startsWith("cyc-on-")) {
      const c =
        CYCLE_COLORS[parseInt(state.split("-")[2]) % CYCLE_COLORS.length];
      return `${c}12`;
    }
    return null;
  }

  function displayVal(gi, si) {
    if (preview && (gi === pick1 || gi === pick2)) return preview[gi][si];
    return draft[gi]?.[si];
  }

  // -- Day color lookup --
  const dayColorMap = useMemo(() => {
    const m = {};
    daySlices.forEach((d) => {
      m[d.name] = DAY_COLORS[d.name] || "#d4a847";
    });
    return m;
  }, [daySlices]);

  // -- Render --

  const rotName = rotations[rotIdx]?.name || "?";

  return (
    <div className="min-h-screen bg-base-800 text-text-primary font-sans">
      {/* ▓▓▓ Toolbar ▓▓▓ */}
      <div className="flex flex-wrap items-center gap-1.5 px-7 py-2 bg-[#111827] border-b border-[#1a2030]">

        {/* Rotation selector */}
        {rotations.map((r, i) => (
          <button
            key={i}
            onClick={() => setRotIdx(i)}
            className={`ed-btn rounded-[5px] px-3.5 py-1.5 text-[11px] font-semibold ${
              rotIdx === i
                ? "border border-accent-cyan bg-accent-cyan text-base-800"
                : "border border-base-500 bg-transparent text-text-muted"
            }`}
          >
            Rot {r.name}
          </button>
        ))}

        <div className="mx-1 h-6 w-px shrink-0 bg-base-500" />

        {/* Operation buttons */}
        {Object.entries(OPS).map(([key, { label, icon }]) => {
          const active = op === key;
          return (
            <button
              key={key}
              onClick={() => selectOp(key)}
              className={`ed-btn flex items-center gap-[5px] rounded-[6px] px-3.5 py-[7px] text-[11px] font-semibold ${
                active
                  ? "border border-accent-cyan bg-accent-cyan/[0.08] text-accent-cyan"
                  : "border border-base-500 bg-transparent text-text-muted"
              }`}
            >
              <span className="text-sm leading-none">{icon}</span>
              {label}
            </button>
          );
        })}

        <div className="mx-1 h-6 w-px shrink-0 bg-base-500" />

        {/* Undo / redo */}
        <button
          onClick={undo}
          disabled={!history.length}
          className={`ed-btn rounded-[5px] border border-base-500 bg-transparent px-2.5 py-[5px] text-[10px] font-semibold ${
            history.length ? "text-text-secondary" : "text-base-300 opacity-40"
          }`}
        >
          ↩ Undo
        </button>
        <button
          onClick={redo}
          disabled={!future.length}
          className={`ed-btn rounded-[5px] border border-base-500 bg-transparent px-2.5 py-[5px] text-[10px] font-semibold ${
            future.length ? "text-text-secondary" : "text-base-300 opacity-40"
          }`}
        >
          ↪ Redo
        </button>

        {changes > 0 && (
          <button
            onClick={revertAll}
            className="ed-btn rounded-[5px] border border-error/25 bg-transparent px-2.5 py-[5px] text-[10px] font-semibold text-error"
          >
            ✕ Revert
          </button>
        )}

        {changes > 0 && (
          <span className="ml-1 text-[10px] font-semibold text-warning">
            {changes} changed
          </span>
        )}

        {/* Save to Dashboard */}
        {changes > 0 && onSave && (
          <button
            onClick={() => onSave(rotIdx, draft)}
            className="ed-btn ml-0.5 rounded-[5px] border border-success bg-success/[0.08] px-3 py-[5px] text-[10px] font-semibold text-success"
          >
            &#x2714; Save to Dashboard
          </button>
        )}

        {/* Indicator: edits are saved for this rotation */}
        {changes === 0 && savedEdits?.[rotIdx] && (
          <span className="ml-1 text-[10px] font-semibold text-success">
            &#x2714; Saved edits active
          </span>
        )}

        {/* Context hint */}
        {op && (
          <div className="ed-fadein ml-auto text-[11px] italic text-text-faint">
            {OPS[op].desc}
          </div>
        )}
      </div>

      {/* ▓▓▓ Main layout ▓▓▓ */}
      <div className="flex">
        {/* -- Grid -- */}
        <div className="flex-1 overflow-x-auto px-6 py-4">
          <table className="w-full min-w-[1050px] border-separate border-spacing-0">
            <thead>
              {/* Day row */}
              <tr>
                <th className="w-9" />
                {daySlices.map((d, di) => (
                  <React.Fragment key={d.name}>
                    {di > 0 && <th className="w-[18px]" />}
                    <th
                      colSpan={d.end - d.start}
                      className="text-center text-xs font-bold font-display tracking-wide pb-0.5 pt-[5px]"
                      style={{
                        color: dayColorMap[d.name],
                        borderBottom: `2px solid ${dayColorMap[d.name]}25`,
                      }}
                    >
                      {d.name}
                    </th>
                  </React.Fragment>
                ))}
              </tr>

              {/* Time slot row */}
              <tr>
                <th className="text-[9px] text-text-faint px-1 pb-2 pt-[3px]">
                  Grp
                </th>
                {timeSlots.map((s, si) => {
                  const isGap = dayBounds.has(si);
                  const isSelCol = op === "col-swap" && pick1 === si;
                  return (
                    <React.Fragment key={si}>
                      {isGap && <th className="w-[18px]" />}
                      <th
                        onClick={() => onSlotClick(si)}
                        className={`text-[9px] text-center px-[3px] pb-2 pt-[3px] font-mono whitespace-nowrap transition-colors duration-150 ${
                          isSelCol ? "text-accent-cyan font-bold" : "font-normal text-[#777]"
                        } ${op === "col-swap" ? "cursor-pointer" : "cursor-default"}`}
                      >
                        {s.time}
                      </th>
                    </React.Fragment>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {draft.map((group, gi) => (
                <tr key={gi}>
                  {/* Group label */}
                  <td
                    onClick={() => onGroupClick(gi)}
                    className={`text-center font-bold text-xs px-1 font-mono sticky left-0 z-[3] transition-all duration-150 bg-[#111827] ${
                      op === "row-swap" || op === "cycle-switch"
                        ? "cursor-pointer"
                        : "cursor-default"
                    } ${
                      (pick1 === gi || pick2 === gi) &&
                      (op === "row-swap" || op === "cycle-switch")
                        ? "text-accent-cyan border-r-2 border-r-accent-cyan"
                        : "text-accent-gold border-r-2 border-r-transparent"
                    }`}
                  >
                    {gi + 1}
                  </td>

                  {group.map((_, si) => {
                    const val = displayVal(gi, si);
                    const meta = lookupMeta(val, registry);
                    const state = cellState(gi, si);
                    const isGap = dayBounds.has(si);
                    const isPreviewed =
                      preview &&
                      (gi === pick1 || gi === pick2) &&
                      val !== draft[gi][si];
                    const bg = meta ? valueColor(meta.value) : "#2a2a2a";
                    const fg = meta ? valueTextColor(meta.value) : "#f87171";
                    const overlay = overlayFor(state);
                    const isChanged = draft[gi]?.[si] !== original[gi]?.[si];

                    // Distance badge
                    const prev =
                      si > 0 && !dayBounds.has(si)
                        ? displayVal(gi, si - 1)
                        : null;
                    const dist = prev
                      ? getDistance(prev, val, distMatrix, registry.nameMap)
                      : null;

                    return (
                      <React.Fragment key={si}>
                        {isGap && <td className="w-[18px]" />}
                        <td className="px-px py-0.5 align-top relative">
                          {/* Distance badge */}
                          {dist !== null && (
                            <div className="absolute top-1/2 -left-px -translate-x-1/2 -translate-y-1/2 z-[4]">
                              <div
                                className="text-[8px] rounded-[3px] px-[3px] font-semibold font-mono leading-[13px] min-w-[24px] text-center"
                                style={{
                                  color:
                                    dist > 600
                                      ? "#dc2626"
                                      : dist > 400
                                      ? "#d97706"
                                      : dist > 200
                                      ? "#6b7280"
                                      : "#059669",
                                  background:
                                    dist > 600
                                      ? "#fef2f2"
                                      : dist > 400
                                      ? "#fffbeb"
                                      : dist > 200
                                      ? "#f3f4f6"
                                      : "#ecfdf5",
                                }}
                              >
                                {dist}m
                              </div>
                            </div>
                          )}

                          <div
                            className={`ed-cell flex flex-col justify-between rounded-[6px] p-[5px] min-h-[50px] relative ${
                              op ? "cursor-pointer" : "cursor-default"
                            }`}
                            onClick={() => onCellClick(gi, si)}
                            style={{
                              background: overlay
                                ? `linear-gradient(${overlay},${overlay}),${bg}`
                                : bg,
                              color: fg,
                              border: borderFor(state),
                              opacity: isPreviewed ? 0.55 : 1,
                              animation: flashKeys.has(`${gi}-${si}`)
                                ? "edFlash 0.5s ease-out"
                                : undefined,
                            }}
                          >
                            {/* Changed dot */}
                            {isChanged && !isPreviewed && (
                              <div className="absolute top-[3px] right-[3px] w-1 h-1 rounded-full bg-warning" />
                            )}

                            {/* Preview label */}
                            {isPreviewed && (
                              <div className="absolute top-px left-[3px] text-[6px] font-bold tracking-wide uppercase text-accent-cyan animate-[edPulse_1.5s_ease-in-out_infinite]">

                                preview
                              </div>
                            )}

                            <div
                              className={`text-[10px] font-semibold leading-[1.2] ${isPreviewed ? "mt-1.5" : "mt-0"}`}
                            >
                              {shortName(val)}
                            </div>
                            <div className="flex justify-between items-center mt-auto">
                              <span className="text-[7px] opacity-65">
                                {(meta?.location || "").substring(0, 8)}
                              </span>
                              <span className="text-[8px] font-bold font-mono bg-black/18 rounded-[3px] px-1">
                                {meta?.value ?? "?"}
                              </span>
                            </div>
                          </div>
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* -- Side Panel -- */}
        {op && (
          <div
            className="ed-fadein w-[270px] shrink-0 overflow-y-auto p-4 px-[18px] text-xs bg-[#111827] border-l border-[#1a2030] max-h-[calc(100vh-80px)]"
          >
            <h3 className="mb-3 text-sm font-display text-accent-cyan">
              {OPS[op].icon} {OPS[op].label}
            </h3>

            {/* -- Row Swap guide -- */}
            {op === "row-swap" && (
              <div>
                <p className="mb-3.5 leading-relaxed text-text-muted">
                  Click a group number, then another. Their entire rows swap —
                  always valid.
                </p>
                {pick1 !== null && (
                  <PickBadge
                    label={`Group ${pick1 + 1} selected`}
                    sub="Click another group"
                  />
                )}
              </div>
            )}

            {/* -- Column Swap guide -- */}
            {op === "col-swap" && (
              <div>
                <p className="mb-3.5 leading-relaxed text-text-muted">
                  Click a time slot header, then another. All groups swap in
                  those columns. Works across days.
                </p>
                {pick1 !== null && (
                  <PickBadge
                    label={`Slot ${timeSlots[pick1]?.time} selected`}
                    sub="Pick any other slot"
                  />
                )}
              </div>
            )}

            {/* -- Symbol Swap guide -- */}
            {op === "symbol-swap" && (
              <div>
                <p className="mb-3.5 leading-relaxed text-text-muted">
                  Click any cell to select activity A, then click a cell with
                  activity B. Every instance globally swaps.
                </p>
                {pick1 && (
                  <div className="ed-fadein mb-2.5 rounded-lg border border-accent-pink/25 bg-[#1f0f1a] px-3 py-2.5">

                    <div className="mb-[3px] text-[9px] uppercase tracking-wider text-text-muted">
                      Selected
                    </div>
                    <div className="text-[13px] font-semibold text-accent-pink">
                      {shortName(pick1)}
                    </div>
                    <div className="mt-[3px] text-[10px] text-text-faint">
                      Now click a different activity
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* -- Cycle Switch guide + controls -- */}
            {op === "cycle-switch" && (
              <div>
                <p className="mb-3.5 leading-relaxed text-text-muted">
                  Click two group numbers. Their permutation decomposes into
                  independent cycles you can toggle.
                </p>

                {pick1 !== null && pick2 === null && (
                  <PickBadge
                    label={`Group ${pick1 + 1} selected`}
                    sub="Click another group"
                  />
                )}

                {/* Cycle list */}
                {cycles.length > 0 && (
                  <div className="ed-fadein">
                    <div className="mb-2.5 rounded-[6px] bg-[#0c1520] border border-[#1a2030] px-2.5 py-[7px] text-[10px] text-text-secondary">

                      Groups{" "}
                      <strong className="text-accent-cyan">{pick1 + 1}</strong>{" "}
                      ↔{" "}
                      <strong className="text-accent-cyan">{pick2 + 1}</strong>
                      {" · "}
                      {cycles.length} cycle{cycles.length !== 1 ? "s" : ""}
                    </div>

                    {cycles.map((cyc, ci) => {
                      const color = CYCLE_COLORS[ci % CYCLE_COLORS.length];
                      const on = cycleOn[ci];
                      return (
                        <div
                          key={ci}
                          onClick={() => toggleCycle(ci)}
                          className="ed-btn mb-1.5 overflow-hidden rounded-lg transition-all duration-200"
                          style={{
                            border: `1px solid ${on ? color : "#1a2030"}`,
                            background: on ? `${color}08` : "transparent",
                          }}
                        >
                          {/* Header */}
                          <div className="flex items-center gap-2 px-2.5 py-2">
                            <div
                              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] transition-all duration-150"
                              style={{
                                border: `2px solid ${on ? color : "#333"}`,
                                background: on ? color : "transparent",
                              }}
                            >
                              {on && (
                                <span className="text-[10px] font-extrabold leading-none text-base-800">
                                  ✓
                                </span>
                              )}
                            </div>
                            <div>
                              <div
                                className="text-[11px] font-semibold"
                                style={{ color }}
                              >
                                {cyc.length}-cycle
                              </div>
                              <div className="text-[8px] text-text-faint">
                                cols: {cyc.map((s) => s.col + 1).join(", ")}
                              </div>
                            </div>
                          </div>

                          {/* Chain visualization */}
                          <div className="flex flex-wrap items-center gap-0.5 px-2.5 pb-2 pt-0.5">
                            {cyc.map((step, i) => (
                              <React.Fragment key={i}>
                                <span
                                  className="rounded-[3px] px-[5px] py-px text-[8px] font-medium font-mono"
                                  style={{
                                    background: `${color}18`,
                                    color,
                                    border: `1px solid ${color}28`,
                                  }}
                                >
                                  {shortName(step.fromA)}
                                </span>
                                <span className="text-[9px] text-text-dim">
                                  →
                                </span>
                              </React.Fragment>
                            ))}
                            <span
                              className="rounded-[3px] px-[5px] py-px text-[8px] font-medium font-mono"
                              style={{
                                background: `${color}18`,
                                color,
                                border: `1px solid ${color}28`,
                              }}
                            >
                              {shortName(cyc[0].fromA)}
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    {/* Impact preview */}
                    {impactStats && (
                      <div className="ed-fadein mt-2.5 rounded-[6px] bg-[#0c1520] border border-[#1a2030] p-2.5">

                        <div className="mb-2 text-[9px] uppercase tracking-wider text-text-faint">
                          Impact Preview
                        </div>
                        {[pick1, pick2].map((gi) => (
                          <div key={gi} className="mb-2">
                            <div className="mb-1 text-[10px] font-semibold text-accent-cyan">
                              Group {gi + 1}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {daySlices.map((d) => {
                                const s = impactStats[gi]?.[d.name];
                                if (!s) return null;
                                const valColor =
                                  s.valDelta > 0
                                    ? "#34d399"
                                    : s.valDelta < 0
                                    ? "#f87171"
                                    : "#555";
                                const distColor =
                                  s.distDelta < 0
                                    ? "#34d399"
                                    : s.distDelta > 0
                                    ? "#f87171"
                                    : "#555";
                                return (
                                  <div
                                    key={d.name}
                                    className="rounded bg-base-800 border border-[#1a2030] px-1.5 py-[3px] text-[9px]"
                                  >
                                    <div
                                      className="mb-0.5 text-[8px] font-semibold"
                                      style={{ color: dayColorMap[d.name] }}
                                    >
                                      {d.name.substring(0, 3)}
                                    </div>
                                    <div
                                      className="font-mono"
                                      style={{ color: valColor }}
                                    >
                                      val {s.valDelta >= 0 ? "+" : ""}
                                      {s.valDelta}
                                    </div>
                                    <div
                                      className="font-mono"
                                      style={{ color: distColor }}
                                    >
                                      dist {s.distDelta >= 0 ? "+" : ""}
                                      {s.distDelta}m
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Apply button */}
                    {cycleOn.some(Boolean) && (
                      <button
                        onClick={commitCycles}
                        className="ed-btn ed-fadein mt-2.5 w-full rounded-lg border border-accent-cyan bg-accent-cyan/[0.08] p-2.5 text-xs font-semibold text-accent-cyan"
                      >
                        Apply {cycleOn.filter(Boolean).length} Cycle
                        {cycleOn.filter(Boolean).length !== 1 ? "s" : ""}
                      </button>
                    )}
                  </div>
                )}

                {pick1 !== null && pick2 !== null && cycles.length === 0 && (
                  <div className="ed-fadein rounded-lg bg-[#0f1f0f] border border-success/20 p-3 text-[11px] text-success-light">

                    Identical schedules — nothing to switch.
                  </div>
                )}
              </div>
            )}

            {/* -- Change log -- */}
            {changes > 0 && (
              <div className="mt-5 pt-3.5 border-t border-[#1a2030]">

                <div className="mb-2 text-[9px] uppercase tracking-wider text-text-faint">
                  Changes ({changes})
                </div>
                <div className="max-h-[180px] overflow-y-auto">
                  {draft
                    .flatMap((g, gi) =>
                      g.map((act, si) => {
                        const orig = original[gi]?.[si];
                        if (act === orig) return null;
                        return (
                          <div
                            key={`${gi}-${si}`}
                            className="flex items-center gap-1 py-[3px] text-[9px] text-text-muted border-b border-[#111827]"
                          >
                            <span className="min-w-[22px] font-mono font-semibold text-accent-gold">
                              G{gi + 1}
                            </span>
                            <span className="text-accent-red">
                              {shortName(orig)}
                            </span>
                            <span className="text-base-300">→</span>
                            <span className="text-accent-green">
                              {shortName(act)}
                            </span>
                          </div>
                        );
                      })
                    )
                    .filter(Boolean)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
   Tiny sub-components
   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ */

function PickBadge({ label, sub }) {
  return (
    <div className="ed-fadein mb-2.5 rounded-lg border border-accent-cyan/20 bg-accent-cyan/5 px-3 py-2.5">
      <div className="text-[11px] font-semibold text-accent-cyan">
        {label}
      </div>
      {sub && (
        <div className="mt-[3px] text-[10px] text-text-faint">{sub}</div>
      )}
    </div>
  );
}
