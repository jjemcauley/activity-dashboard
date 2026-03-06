import React, { useMemo } from "react";
import { CYCLE_COLORS, DAY_COLORS } from "../../constants/colors.js";
import { shortName } from "../../utils/parsers.js";

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

export default function CycleSwitchPanel({
  pick1,
  pick2,
  cycles,
  cycleOn,
  toggleCycle,
  commitCycles,
  impactStats,
  daySlices,
}) {
  const dayColorMap = useMemo(() => {
    const m = {};
    daySlices.forEach((d) => {
      m[d.name] = DAY_COLORS[d.name] || "#d4a847";
    });
    return m;
  }, [daySlices]);

  return (
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
        <div className="animate-ed-slide-in">
          <div className="mb-2.5 rounded-[6px] bg-[#0c1520] border border-[#1a2030] px-2.5 py-[7px] text-[11px] text-text-secondary">

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
                className={`ed-btn hover:brightness-[1.15] mb-1.5 overflow-hidden rounded-lg transition-all duration-200 border border-[var(--cyc-border)] bg-[var(--cyc-bg)]`}
                style={{
                  '--cyc-border': on ? color : "#1a2030",
                  '--cyc-bg': on ? `${color}08` : "transparent",
                }}
              >
                {/* Header */}
                <div className="flex items-center gap-2 px-2.5 py-2">
                  <div
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] transition-all duration-150 border-2 border-[var(--chk-border)] bg-[var(--chk-bg)]"
                    style={{
                      '--chk-border': on ? color : "#333",
                      '--chk-bg': on ? color : "transparent",
                    }}
                  >
                    {on && (
                      <span className="text-[11px] font-extrabold leading-none text-base-800">
                        ✓
                      </span>
                    )}
                  </div>
                  <div>
                    <div
                      className="text-[11px] font-semibold text-[var(--cyc-color)]"
                      style={{ '--cyc-color': color }}
                    >
                      {cyc.length}-cycle
                    </div>
                    <div className="text-[11px] text-text-faint">
                      cols: {cyc.map((s) => s.col + 1).join(", ")}
                    </div>
                  </div>
                </div>

                {/* Chain visualization */}
                <div className="flex flex-wrap items-center gap-0.5 px-2.5 pb-2 pt-0.5">
                  {cyc.map((step, i) => (
                    <React.Fragment key={i}>
                      <span
                        className="rounded-[3px] px-[5px] py-px text-[11px] font-medium font-mono bg-[var(--chain-bg)] text-[var(--chain-fg)] border border-[var(--chain-border)]"
                        style={{
                          '--chain-bg': `${color}18`,
                          '--chain-fg': color,
                          '--chain-border': `${color}28`,
                        }}
                      >
                        {shortName(step.fromA)}
                      </span>
                      <span className="text-[11px] text-text-dim">
                        →
                      </span>
                    </React.Fragment>
                  ))}
                  <span
                    className="rounded-[3px] px-[5px] py-px text-[11px] font-medium font-mono bg-[var(--chain-bg)] text-[var(--chain-fg)] border border-[var(--chain-border)]"
                    style={{
                      '--chain-bg': `${color}18`,
                      '--chain-fg': color,
                      '--chain-border': `${color}28`,
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
            <div className="animate-ed-slide-in mt-2.5 rounded-[6px] bg-[#0c1520] border border-[#1a2030] p-2.5">

              <div className="mb-2 text-[11px] uppercase tracking-wider text-text-faint">
                Impact Preview
              </div>
              {[pick1, pick2].map((gi) => (
                <div key={gi} className="mb-2">
                  <div className="mb-1 text-[11px] font-semibold text-accent-cyan">
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
                          className="rounded bg-base-800 border border-[#1a2030] px-2 py-1 text-[11px]"
                          style={{
                            '--day-label-color': dayColorMap[d.name],
                            '--val-color': valColor,
                            '--dist-color': distColor,
                          }}
                        >
                          <div className="mb-0.5 text-[11px] font-semibold text-[var(--day-label-color)]">
                            {d.name.substring(0, 3)}
                          </div>
                          <div className="font-mono text-[var(--val-color)]">
                            val {s.valDelta >= 0 ? "+" : ""}
                            {s.valDelta}
                          </div>
                          <div className="font-mono text-[var(--dist-color)]">
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
              className="ed-btn hover:brightness-[1.15] animate-ed-slide-in mt-2.5 w-full rounded-lg border border-accent-cyan bg-accent-cyan/[0.08] p-2.5 text-xs font-semibold text-accent-cyan"
            >
              Apply {cycleOn.filter(Boolean).length} Cycle
              {cycleOn.filter(Boolean).length !== 1 ? "s" : ""}
            </button>
          )}
        </div>
      )}

      {pick1 !== null && pick2 !== null && cycles.length === 0 && (
        <div className="animate-ed-slide-in rounded-lg bg-[#0f1f0f] border border-success/20 p-3 text-[11px] text-success-light">

          Identical schedules — nothing to switch.
        </div>
      )}
    </div>
  );
}
