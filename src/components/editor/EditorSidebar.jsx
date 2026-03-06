import React from "react";
import { useDashboard } from "../../context/DashboardContext";
import { DAY_COLORS, CYCLE_COLORS } from "../../constants/colors.js";
import { shortName } from "../../utils/parsers.js";
import { OPS } from "./EditorToolbar.jsx";
import CycleSwitchPanel from "./CycleSwitchPanel.jsx";
import ChangeLog from "./ChangeLog.jsx";

function PickBadge({ label, sub }) {
  return (
    <div className="animate-ed-slide-in mb-2.5 rounded-lg border border-accent-cyan/20 bg-accent-cyan/5 px-3 py-2.5">
      <div className="text-[11px] font-semibold text-accent-cyan">
        {label}
      </div>
      {sub && (
        <div className="mt-[3px] text-[11px] text-text-faint">{sub}</div>
      )}
    </div>
  );
}

export default function EditorSidebar({
  op,
  pick1,
  pick2,
  cycles,
  cycleOn,
  toggleCycle,
  commitCycles,
  impactStats,
  changes,
  draft,
  original,
}) {
  const { timeSlots, daySlices } = useDashboard();

  if (!op) return null;

  return (
    <div
      className="animate-ed-slide-in w-[300px] shrink-0 overflow-y-auto p-4 px-[18px] text-xs bg-[#111827] border-l border-[#1a2030] max-h-[calc(100vh-80px)]"
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
            <div className="animate-ed-slide-in mb-2.5 rounded-lg border border-accent-pink/25 bg-[#1f0f1a] px-3 py-2.5">

              <div className="mb-[3px] text-[11px] uppercase tracking-wider text-text-muted">
                Selected
              </div>
              <div className="text-[13px] font-semibold text-accent-pink">
                {shortName(pick1)}
              </div>
              <div className="mt-[3px] text-[11px] text-text-faint">
                Now click a different activity
              </div>
            </div>
          )}
        </div>
      )}

      {/* -- Cycle Switch guide + controls -- */}
      {op === "cycle-switch" && (
        <CycleSwitchPanel
          pick1={pick1}
          pick2={pick2}
          cycles={cycles}
          cycleOn={cycleOn}
          toggleCycle={toggleCycle}
          commitCycles={commitCycles}
          impactStats={impactStats}
          daySlices={daySlices}
        />
      )}

      {/* -- Change log -- */}
      {changes > 0 && (
        <ChangeLog draft={draft} original={original} changes={changes} />
      )}
    </div>
  );
}
