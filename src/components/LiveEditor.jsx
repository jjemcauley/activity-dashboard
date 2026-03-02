import React, { useState, useMemo, useEffect } from "react";
import { DAY_COLORS, valueColor, valueTextColor } from "../constants/colors.js";
import { getDistance, lookupMeta, shortName } from "../utils/parsers.js";

/* â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–
   Constants
    */

const CYCLE_COLORS = [
  "#22d3ee",
  "#f472b6",
  "#a78bfa",
  "#34d399",
  "#fbbf24",
  "#fb923c",
  "#818cf8",
  "#f87171",
  "#2dd4bf",
  "#e879f9",
];

const OPS = {
  "row-swap": {
    label: "Row Swap",
    icon: "â‡…",
    desc: "Swap two groups' entire schedules",
  },
  "col-swap": {
    label: "Column Swap",
    icon: "â‡†",
    desc: "Swap two time slots across the schedule",
  },
  "symbol-swap": {
    label: "Symbol Swap",
    icon: "âŸ²",
    desc: "Globally trade every instance of two activities",
  },
  "cycle-switch": {
    label: "Cycle Switch",
    icon: "âŸ³",
    desc: "Decompose and selectively switch cycles between two groups",
  },
};

/* â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–
   Pure logic helpers
   â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â– */

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

/* â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–
   Inject keyframes once
   â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â– */

let styleInjected = false;
function injectStyles() {
  if (styleInjected) return;
  styleInjected = true;
  const s = document.createElement("style");
  s.textContent = `
    @keyframes edFlash {
      0%   { box-shadow: 0 0 0 0 rgba(34,211,238,0.5); }
      100% { box-shadow: 0 0 0 0 rgba(34,211,238,0); }
    }
    @keyframes edSlideIn {
      from { opacity:0; transform:translateY(-6px); }
      to   { opacity:1; transform:translateY(0); }
    }
    @keyframes edPulse {
      0%,100% { opacity:1; }
      50%     { opacity:0.6; }
    }
    .ed-cell {
      transition: border-color 0.2s, transform 0.12s, box-shadow 0.2s;
      will-change: transform;
    }
    .ed-cell:hover {
      transform: scale(1.05);
      z-index: 6 !important;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    }
    .ed-fadein { animation: edSlideIn 0.18s ease-out both; }
    .ed-btn {
      transition: all 0.15s;
      cursor: pointer;
      user-select: none;
    }
    .ed-btn:hover { filter: brightness(1.15); }
  `;
  document.head.appendChild(s);
}

/* â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–
   LiveEditor Component
   â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â– */

export default function LiveEditor({
  registry,
  distMatrix,
  rotations,
  timeSlots,
  daySlices,
  onSave,
  savedEdits,
}) {
  useEffect(injectStyles, []);

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
    <div
      style={{
        minHeight: "100vh",
        background: "#0f1219",
        color: "#e8e6e1",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* â–â–â– Toolbar â–â–â– */}
      <div
        style={{
          padding: "8px 28px",
          background: "#111827",
          borderBottom: "1px solid #1a2030",
          display: "flex",
          gap: 6,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {/* Rotation selector */}
        {rotations.map((r, i) => (
          <button
            key={i}
            onClick={() => setRotIdx(i)}
            className="ed-btn"
            style={{
              padding: "6px 14px",
              borderRadius: 5,
              fontSize: 11,
              fontWeight: 600,
              border: rotIdx === i ? "1px solid #22d3ee" : "1px solid #1e2636",
              background: rotIdx === i ? "#22d3ee" : "transparent",
              color: rotIdx === i ? "#0f1219" : "#666",
            }}
          >
            Rot {r.name}
          </button>
        ))}

        <div
          style={{
            width: 1,
            height: 24,
            background: "#1e2636",
            margin: "0 4px",
            flexShrink: 0,
          }}
        />

        {/* Operation buttons */}
        {Object.entries(OPS).map(([key, { label, icon }]) => {
          const active = op === key;
          return (
            <button
              key={key}
              onClick={() => selectOp(key)}
              className="ed-btn"
              style={{
                padding: "7px 14px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 5,
                border: active ? "1px solid #22d3ee" : "1px solid #1e2636",
                background: active ? "rgba(34,211,238,0.08)" : "transparent",
                color: active ? "#22d3ee" : "#666",
              }}
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>{icon}</span>
              {label}
            </button>
          );
        })}

        <div
          style={{
            width: 1,
            height: 24,
            background: "#1e2636",
            margin: "0 4px",
            flexShrink: 0,
          }}
        />

        {/* Undo / redo */}
        <button
          onClick={undo}
          disabled={!history.length}
          className="ed-btn"
          style={{
            padding: "5px 10px",
            borderRadius: 5,
            fontSize: 10,
            fontWeight: 600,
            border: "1px solid #1e2636",
            background: "transparent",
            color: history.length ? "#888" : "#333",
            opacity: history.length ? 1 : 0.4,
          }}
        >
          â†© Undo
        </button>
        <button
          onClick={redo}
          disabled={!future.length}
          className="ed-btn"
          style={{
            padding: "5px 10px",
            borderRadius: 5,
            fontSize: 10,
            fontWeight: 600,
            border: "1px solid #1e2636",
            background: "transparent",
            color: future.length ? "#888" : "#333",
            opacity: future.length ? 1 : 0.4,
          }}
        >
          â†ª Redo
        </button>

        {changes > 0 && (
          <button
            onClick={revertAll}
            className="ed-btn"
            style={{
              padding: "5px 10px",
              borderRadius: 5,
              fontSize: 10,
              fontWeight: 600,
              border: "1px solid #dc262640",
              background: "transparent",
              color: "#dc2626",
            }}
          >
            âœ• Revert
          </button>
        )}

        {changes > 0 && (
          <span
            style={{
              fontSize: 10,
              color: "#fbbf24",
              fontWeight: 600,
              marginLeft: 4,
            }}
          >
            {changes} changed
          </span>
        )}

        {/* Save to Dashboard */}
        {changes > 0 && onSave && (
          <button
            onClick={() => onSave(rotIdx, draft)}
            className="ed-btn"
            style={{
              padding: "5px 12px",
              borderRadius: 5,
              fontSize: 10,
              fontWeight: 600,
              border: "1px solid #27ae60",
              background: "rgba(39,174,96,0.08)",
              color: "#27ae60",
              marginLeft: 2,
            }}
          >
            &#x2714; Save to Dashboard
          </button>
        )}

        {/* Indicator: edits are saved for this rotation */}
        {changes === 0 && savedEdits?.[rotIdx] && (
          <span
            style={{
              fontSize: 10,
              color: "#27ae60",
              fontWeight: 600,
              marginLeft: 4,
            }}
          >
            &#x2714; Saved edits active
          </span>
        )}

        {/* Context hint */}
        {op && (
          <div
            className="ed-fadein"
            style={{
              marginLeft: "auto",
              fontSize: 11,
              color: "#555",
              fontStyle: "italic",
            }}
          >
            {OPS[op].desc}
          </div>
        )}
      </div>

      {/* â–â–â– Main layout â–â–â– */}
      <div style={{ display: "flex" }}>
        {/* -- Grid -- */}
        <div style={{ flex: 1, padding: "16px 24px", overflowX: "auto" }}>
          <table
            style={{
              borderCollapse: "separate",
              borderSpacing: 0,
              width: "100%",
              minWidth: 1050,
            }}
          >
            <thead>
              {/* Day row */}
              <tr>
                <th style={{ width: 36 }} />
                {daySlices.map((d, di) => (
                  <React.Fragment key={d.name}>
                    {di > 0 && <th style={{ width: 18 }} />}
                    <th
                      colSpan={d.end - d.start}
                      style={{
                        textAlign: "center",
                        fontSize: 12,
                        fontWeight: 700,
                        color: dayColorMap[d.name],
                        padding: "5px 0 2px",
                        borderBottom: `2px solid ${dayColorMap[d.name]}25`,
                        fontFamily: "'Playfair Display', serif",
                        letterSpacing: 1,
                      }}
                    >
                      {d.name}
                    </th>
                  </React.Fragment>
                ))}
              </tr>

              {/* Time slot row */}
              <tr>
                <th
                  style={{ fontSize: 9, color: "#555", padding: "3px 4px 8px" }}
                >
                  Grp
                </th>
                {timeSlots.map((s, si) => {
                  const isGap = dayBounds.has(si);
                  const isSelCol = op === "col-swap" && pick1 === si;
                  return (
                    <React.Fragment key={si}>
                      {isGap && <th style={{ width: 18 }} />}
                      <th
                        onClick={() => onSlotClick(si)}
                        style={{
                          fontSize: 9,
                          textAlign: "center",
                          padding: "3px 3px 8px",
                          fontFamily: "'DM Mono', monospace",
                          whiteSpace: "nowrap",
                          color: isSelCol ? "#22d3ee" : "#777",
                          cursor: op === "col-swap" ? "pointer" : "default",
                          fontWeight: isSelCol ? 700 : 400,
                          transition: "color 0.15s",
                        }}
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
                    style={{
                      textAlign: "center",
                      fontWeight: 700,
                      fontSize: 12,
                      padding: "0 4px",
                      fontFamily: "'DM Mono', monospace",
                      background: "#111827",
                      position: "sticky",
                      left: 0,
                      zIndex: 3,
                      cursor:
                        op === "row-swap" || op === "cycle-switch"
                          ? "pointer"
                          : "default",
                      transition: "all 0.15s",
                      color:
                        (pick1 === gi || pick2 === gi) &&
                        (op === "row-swap" || op === "cycle-switch")
                          ? "#22d3ee"
                          : "#d4a847",
                      borderRight:
                        (pick1 === gi || pick2 === gi) &&
                        (op === "row-swap" || op === "cycle-switch")
                          ? "2px solid #22d3ee"
                          : "2px solid transparent",
                    }}
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
                        {isGap && <td style={{ width: 18 }} />}
                        <td
                          style={{
                            padding: "2px 1px",
                            verticalAlign: "top",
                            position: "relative",
                          }}
                        >
                          {/* Distance badge */}
                          {dist !== null && (
                            <div
                              style={{
                                position: "absolute",
                                top: "50%",
                                left: -1,
                                transform: "translate(-50%, -50%)",
                                zIndex: 4,
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 8,
                                  borderRadius: 3,
                                  padding: "0px 3px",
                                  fontWeight: 600,
                                  fontFamily: "'DM Mono', monospace",
                                  lineHeight: "13px",
                                  minWidth: 24,
                                  textAlign: "center",
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
                            className="ed-cell"
                            onClick={() => onCellClick(gi, si)}
                            style={{
                              background: overlay
                                ? `linear-gradient(${overlay},${overlay}),${bg}`
                                : bg,
                              color: fg,
                              borderRadius: 6,
                              padding: "5px 5px",
                              minHeight: 50,
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "space-between",
                              border: borderFor(state),
                              position: "relative",
                              cursor: op ? "pointer" : "default",
                              opacity: isPreviewed ? 0.55 : 1,
                              animation: flashKeys.has(`${gi}-${si}`)
                                ? "edFlash 0.5s ease-out"
                                : undefined,
                            }}
                          >
                            {/* Changed dot */}
                            {isChanged && !isPreviewed && (
                              <div
                                style={{
                                  position: "absolute",
                                  top: 3,
                                  right: 3,
                                  width: 4,
                                  height: 4,
                                  borderRadius: "50%",
                                  background: "#fbbf24",
                                }}
                              />
                            )}

                            {/* Preview label */}
                            {isPreviewed && (
                              <div
                                style={{
                                  position: "absolute",
                                  top: 1,
                                  left: 3,
                                  fontSize: 6,
                                  color: "#22d3ee",
                                  fontWeight: 700,
                                  letterSpacing: 0.5,
                                  textTransform: "uppercase",
                                  animation:
                                    "edPulse 1.5s ease-in-out infinite",
                                }}
                              >
                                preview
                              </div>
                            )}

                            <div
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                lineHeight: 1.2,
                                marginTop: isPreviewed ? 6 : 0,
                              }}
                            >
                              {shortName(val)}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginTop: "auto",
                              }}
                            >
                              <span style={{ fontSize: 7, opacity: 0.65 }}>
                                {(meta?.location || "").substring(0, 8)}
                              </span>
                              <span
                                style={{
                                  fontSize: 8,
                                  fontWeight: 700,
                                  fontFamily: "'DM Mono', monospace",
                                  background: "rgba(0,0,0,0.18)",
                                  borderRadius: 3,
                                  padding: "0 4px",
                                }}
                              >
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
            className="ed-fadein"
            style={{
              width: 270,
              flexShrink: 0,
              background: "#111827",
              borderLeft: "1px solid #1a2030",
              padding: "16px 18px",
              overflowY: "auto",
              maxHeight: "calc(100vh - 80px)",
              fontSize: 12,
            }}
          >
            <h3
              style={{
                margin: "0 0 12px",
                fontSize: 14,
                fontFamily: "'Playfair Display', serif",
                color: "#22d3ee",
              }}
            >
              {OPS[op].icon} {OPS[op].label}
            </h3>

            {/* -- Row Swap guide -- */}
            {op === "row-swap" && (
              <div>
                <p
                  style={{ color: "#666", lineHeight: 1.5, margin: "0 0 14px" }}
                >
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
                <p
                  style={{ color: "#666", lineHeight: 1.5, margin: "0 0 14px" }}
                >
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
                <p
                  style={{ color: "#666", lineHeight: 1.5, margin: "0 0 14px" }}
                >
                  Click any cell to select activity A, then click a cell with
                  activity B. Every instance globally swaps.
                </p>
                {pick1 && (
                  <div
                    className="ed-fadein"
                    style={{
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1px solid #f472b644",
                      background: "#1f0f1a",
                      marginBottom: 10,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 9,
                        color: "#666",
                        textTransform: "uppercase",
                        letterSpacing: 0.8,
                        marginBottom: 3,
                      }}
                    >
                      Selected
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#f472b6",
                      }}
                    >
                      {shortName(pick1)}
                    </div>
                    <div style={{ fontSize: 10, color: "#555", marginTop: 3 }}>
                      Now click a different activity
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* -- Cycle Switch guide + controls -- */}
            {op === "cycle-switch" && (
              <div>
                <p
                  style={{ color: "#666", lineHeight: 1.5, margin: "0 0 14px" }}
                >
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
                    <div
                      style={{
                        fontSize: 10,
                        color: "#888",
                        marginBottom: 10,
                        padding: "7px 10px",
                        background: "#0c1520",
                        borderRadius: 6,
                        border: "1px solid #1a2030",
                      }}
                    >
                      Groups{" "}
                      <strong style={{ color: "#22d3ee" }}>{pick1 + 1}</strong>{" "}
                      â†”{" "}
                      <strong style={{ color: "#22d3ee" }}>{pick2 + 1}</strong>
                      {" Â· "}
                      {cycles.length} cycle{cycles.length !== 1 ? "s" : ""}
                    </div>

                    {cycles.map((cyc, ci) => {
                      const color = CYCLE_COLORS[ci % CYCLE_COLORS.length];
                      const on = cycleOn[ci];
                      return (
                        <div
                          key={ci}
                          onClick={() => toggleCycle(ci)}
                          className="ed-btn"
                          style={{
                            marginBottom: 6,
                            borderRadius: 8,
                            overflow: "hidden",
                            border: `1px solid ${on ? color : "#1a2030"}`,
                            background: on ? `${color}08` : "transparent",
                            transition: "all 0.2s",
                          }}
                        >
                          {/* Header */}
                          <div
                            style={{
                              padding: "8px 10px",
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <div
                              style={{
                                width: 16,
                                height: 16,
                                borderRadius: 3,
                                flexShrink: 0,
                                border: `2px solid ${on ? color : "#333"}`,
                                background: on ? color : "transparent",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                transition: "all 0.15s",
                              }}
                            >
                              {on && (
                                <span
                                  style={{
                                    color: "#0f1219",
                                    fontSize: 10,
                                    fontWeight: 800,
                                    lineHeight: 1,
                                  }}
                                >
                                  âœ”
                                </span>
                              )}
                            </div>
                            <div>
                              <div
                                style={{ fontSize: 11, fontWeight: 600, color }}
                              >
                                {cyc.length}-cycle
                              </div>
                              <div style={{ fontSize: 8, color: "#555" }}>
                                cols: {cyc.map((s) => s.col + 1).join(", ")}
                              </div>
                            </div>
                          </div>

                          {/* Chain visualization */}
                          <div
                            style={{
                              padding: "2px 10px 8px",
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 2,
                              alignItems: "center",
                            }}
                          >
                            {cyc.map((step, i) => (
                              <React.Fragment key={i}>
                                <span
                                  style={{
                                    fontSize: 8,
                                    padding: "1px 5px",
                                    borderRadius: 3,
                                    background: `${color}18`,
                                    color,
                                    fontWeight: 500,
                                    fontFamily: "'DM Mono', monospace",
                                    border: `1px solid ${color}28`,
                                  }}
                                >
                                  {shortName(step.fromA)}
                                </span>
                                <span style={{ fontSize: 9, color: "#444" }}>
                                  →
                                </span>
                              </React.Fragment>
                            ))}
                            <span
                              style={{
                                fontSize: 8,
                                padding: "1px 5px",
                                borderRadius: 3,
                                background: `${color}18`,
                                color,
                                fontWeight: 500,
                                fontFamily: "'DM Mono', monospace",
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
                      <div
                        className="ed-fadein"
                        style={{
                          marginTop: 10,
                          padding: "10px 10px",
                          borderRadius: 6,
                          background: "#0c1520",
                          border: "1px solid #1a2030",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 9,
                            color: "#555",
                            textTransform: "uppercase",
                            letterSpacing: 0.8,
                            marginBottom: 8,
                          }}
                        >
                          Impact Preview
                        </div>
                        {[pick1, pick2].map((gi) => (
                          <div key={gi} style={{ marginBottom: 8 }}>
                            <div
                              style={{
                                fontSize: 10,
                                color: "#22d3ee",
                                fontWeight: 600,
                                marginBottom: 4,
                              }}
                            >
                              Group {gi + 1}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                gap: 6,
                                flexWrap: "wrap",
                              }}
                            >
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
                                    style={{
                                      padding: "3px 6px",
                                      borderRadius: 4,
                                      background: "#0f1219",
                                      border: "1px solid #1a2030",
                                      fontSize: 9,
                                    }}
                                  >
                                    <div
                                      style={{
                                        color: dayColorMap[d.name],
                                        fontWeight: 600,
                                        marginBottom: 2,
                                        fontSize: 8,
                                      }}
                                    >
                                      {d.name.substring(0, 3)}
                                    </div>
                                    <div
                                      style={{
                                        color: valColor,
                                        fontFamily: "'DM Mono', monospace",
                                      }}
                                    >
                                      val {s.valDelta >= 0 ? "+" : ""}
                                      {s.valDelta}
                                    </div>
                                    <div
                                      style={{
                                        color: distColor,
                                        fontFamily: "'DM Mono', monospace",
                                      }}
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
                        className="ed-btn ed-fadein"
                        style={{
                          width: "100%",
                          padding: "10px",
                          borderRadius: 8,
                          marginTop: 10,
                          border: "1px solid #22d3ee",
                          background: "rgba(34,211,238,0.08)",
                          color: "#22d3ee",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        Apply {cycleOn.filter(Boolean).length} Cycle
                        {cycleOn.filter(Boolean).length !== 1 ? "s" : ""}
                      </button>
                    )}
                  </div>
                )}

                {pick1 !== null && pick2 !== null && cycles.length === 0 && (
                  <div
                    className="ed-fadein"
                    style={{
                      padding: 12,
                      background: "#0f1f0f",
                      borderRadius: 8,
                      border: "1px solid #27ae6033",
                      fontSize: 11,
                      color: "#34d399",
                    }}
                  >
                    Identical schedules — nothing to switch.
                  </div>
                )}
              </div>
            )}

            {/* -- Change log -- */}
            {changes > 0 && (
              <div
                style={{
                  marginTop: 20,
                  paddingTop: 14,
                  borderTop: "1px solid #1a2030",
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    color: "#555",
                    textTransform: "uppercase",
                    letterSpacing: 0.8,
                    marginBottom: 8,
                  }}
                >
                  Changes ({changes})
                </div>
                <div style={{ maxHeight: 180, overflowY: "auto" }}>
                  {draft
                    .flatMap((g, gi) =>
                      g.map((act, si) => {
                        const orig = original[gi]?.[si];
                        if (act === orig) return null;
                        return (
                          <div
                            key={`${gi}-${si}`}
                            style={{
                              fontSize: 9,
                              padding: "3px 0",
                              borderBottom: "1px solid #111827",
                              display: "flex",
                              gap: 4,
                              alignItems: "center",
                              color: "#666",
                            }}
                          >
                            <span
                              style={{
                                color: "#d4a847",
                                fontFamily: "'DM Mono', monospace",
                                fontWeight: 600,
                                minWidth: 22,
                              }}
                            >
                              G{gi + 1}
                            </span>
                            <span style={{ color: "#f87171" }}>
                              {shortName(orig)}
                            </span>
                            <span style={{ color: "#333" }}>→</span>
                            <span style={{ color: "#34d399" }}>
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

/* â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–
   Tiny sub-components
   â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â–â– */

function PickBadge({ label, sub }) {
  return (
    <div
      className="ed-fadein"
      style={{
        padding: "10px 12px",
        background: "rgba(34,211,238,0.05)",
        borderRadius: 8,
        border: "1px solid #22d3ee33",
        marginBottom: 10,
      }}
    >
      <div style={{ fontSize: 11, color: "#22d3ee", fontWeight: 600 }}>
        {label}
      </div>
      {sub && (
        <div style={{ fontSize: 10, color: "#555", marginTop: 3 }}>{sub}</div>
      )}
    </div>
  );
}
