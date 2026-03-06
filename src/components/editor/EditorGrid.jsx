import React, { useMemo } from "react";
import { useDashboard } from "../../context/DashboardContext";
import { DAY_COLORS, CYCLE_COLORS, valueColor, valueTextColor } from "../../constants/colors.js";
import DistanceBadge from "../shared/DistanceBadge.jsx";
import { getDistance, lookupMeta, shortName } from "../../utils/parsers.js";

/* ── Cell classification helpers ── */

function cellState(gi, si, { op, pick1, pick2, draft, original, flashKeys, cycles, cycleOn }) {
  const key = `${gi}-${si}`;
  if (flashKeys.has(key)) return "flash";

  if (op === "row-swap" && pick1 === gi) return "sel-row";
  if (op === "col-swap" && pick1 === si) return "sel-col";
  if (op === "col-swap" && pick1 !== null && pick1 !== si) return "target-col";
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

function cellBackground(overlay, bg) {
  return overlay
    ? `linear-gradient(${overlay},${overlay}),${bg}`
    : bg;
}

/* ── Component ── */

export default function EditorGrid({
  draft,
  original,
  op,
  pick1,
  pick2,
  cycles,
  cycleOn,
  flashKeys,
  preview,
  dayBounds,
  displayVal,
  onGroupClick,
  onSlotClick,
  onCellClick,
}) {
  const { registry, distMatrix, timeSlots, daySlices } = useDashboard();

  const dayColorMap = useMemo(() => {
    const m = {};
    daySlices.forEach((d) => {
      m[d.name] = DAY_COLORS[d.name] || "#d4a847";
    });
    return m;
  }, [daySlices]);

  const ctx = { op, pick1, pick2, draft, original, flashKeys, cycles, cycleOn };

  return (
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
                  className="text-center text-xs font-bold font-display tracking-wide pb-0.5 pt-[5px] text-[var(--day-color)] border-b-2 border-b-[var(--day-border)]"
                  style={{
                    '--day-color': dayColorMap[d.name],
                    '--day-border': `${dayColorMap[d.name]}25`,
                  }}
                >
                  {d.name}
                </th>
              </React.Fragment>
            ))}
          </tr>

          {/* Time slot row */}
          <tr>
            <th className="text-[11px] text-text-faint px-1 pb-2 pt-[3px]">
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
                    className={`text-[11px] text-center px-[3px] pb-2 pt-[3px] font-mono whitespace-nowrap transition-colors duration-150 ${
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
                const state = cellState(gi, si, ctx);
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

                const isFlashing = flashKeys.has(`${gi}-${si}`);

                return (
                  <React.Fragment key={si}>
                    {isGap && <td className="w-[18px]" />}
                    <td className="px-px py-0.5 align-top relative">
                      {/* Distance badge */}
                      {dist !== null && (
                        <div className="absolute top-1/2 -left-px -translate-x-1/2 -translate-y-1/2 z-[4]">
                          <DistanceBadge dist={dist} compact />
                        </div>
                      )}

                      <div
                        className={`ed-cell hover:scale-[1.03] hover:z-[6] hover:shadow-[0_2px_12px_rgba(0,0,0,0.5)] flex flex-col justify-between rounded-[6px] p-2 min-h-[63px] relative bg-[var(--cell-bg)] text-[var(--cell-fg)] border-[var(--cell-border)] ${
                          op ? "cursor-pointer" : "cursor-default"
                        } ${isPreviewed ? "opacity-55" : ""} ${isFlashing ? "animate-ed-flash" : ""}`}
                        onClick={() => onCellClick(gi, si)}
                        style={{
                          '--cell-bg': cellBackground(overlay, bg),
                          '--cell-fg': fg,
                          '--cell-border': borderFor(state),
                        }}
                      >
                        {/* Changed dot */}
                        {isChanged && !isPreviewed && (
                          <div className="absolute top-[3px] right-[3px] w-1 h-1 rounded-full bg-warning" />
                        )}

                        {/* Preview label */}
                        {isPreviewed && (
                          <div className="absolute top-px left-[3px] text-[11px] font-bold tracking-wide uppercase text-accent-cyan animate-ed-pulse">

                            preview
                          </div>
                        )}

                        <div
                          className={`text-[13px] font-semibold leading-[1.2] ${isPreviewed ? "mt-1.5" : "mt-0"}`}
                        >
                          {shortName(val)}
                        </div>
                        <div className="flex justify-between items-center mt-auto">
                          <span className="text-[11px] opacity-65">
                            {(meta?.location || "").substring(0, 8)}
                          </span>
                          <span className="text-[11px] font-bold font-mono bg-black/18 rounded-[3px] px-1">
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
  );
}
