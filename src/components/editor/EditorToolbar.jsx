import React from "react";

const OPS = {
  "row-swap": {
    label: "Row Swap",
    icon: "\u21C5",
    desc: "Swap two groups' entire schedules",
  },
  "col-swap": {
    label: "Column Swap",
    icon: "\u21C6",
    desc: "Swap two time slots across the schedule",
  },
  "symbol-swap": {
    label: "Symbol Swap",
    icon: "\u27F2",
    desc: "Globally trade every instance of two activities",
  },
  "cycle-switch": {
    label: "Cycle Switch",
    icon: "\u27F3",
    desc: "Decompose and selectively switch cycles between two groups",
  },
};

export { OPS };

export default function EditorToolbar({
  rotations,
  rotIdx,
  setRotIdx,
  op,
  selectOp,
  undo,
  redo,
  revertAll,
  changes,
  history,
  future,
  onSave,
  draft,
  savedEdits,
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-7 py-2 bg-[#111827] border-b border-[#1a2030]">
      {/* Rotation selector */}
      {rotations.map((r, i) => (
        <button
          key={i}
          onClick={() => setRotIdx(i)}
          className={`ed-btn hover:brightness-[1.15] rounded-[5px] px-3.5 py-1.5 text-[13px] font-semibold ${
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
            className={`ed-btn hover:brightness-[1.15] flex items-center gap-[5px] rounded-[6px] px-3.5 py-[7px] text-[13px] font-semibold ${
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
        className={`ed-btn hover:brightness-[1.15] rounded-[5px] border border-base-500 bg-transparent px-3 py-1.5 text-[13px] font-semibold ${
          history.length ? "text-text-secondary" : "text-base-300 opacity-40"
        }`}
      >
        ↩ Undo
      </button>
      <button
        onClick={redo}
        disabled={!future.length}
        className={`ed-btn hover:brightness-[1.15] rounded-[5px] border border-base-500 bg-transparent px-3 py-1.5 text-[13px] font-semibold ${
          future.length ? "text-text-secondary" : "text-base-300 opacity-40"
        }`}
      >
        ↪ Redo
      </button>

      {changes > 0 && (
        <button
          onClick={revertAll}
          className="ed-btn hover:brightness-[1.15] rounded-[5px] border border-error/25 bg-transparent px-3 py-1.5 text-[13px] font-semibold text-error"
        >
          ✕ Revert
        </button>
      )}

      {changes > 0 && (
        <span className="ml-1 text-[13px] font-semibold text-warning">
          {changes} changed
        </span>
      )}

      {/* Save to Dashboard */}
      {changes > 0 && onSave && (
        <button
          onClick={() => onSave(rotIdx, draft)}
          className="ed-btn hover:brightness-[1.15] ml-0.5 rounded-[5px] border border-success bg-success/[0.08] px-3 py-[5px] text-[13px] font-semibold text-success"
        >
          &#x2714; Save to Dashboard
        </button>
      )}

      {/* Indicator: edits are saved for this rotation */}
      {changes === 0 && savedEdits?.[rotIdx] && (
        <span className="ml-1 text-[13px] font-semibold text-success">
          &#x2714; Saved edits active
        </span>
      )}

      {/* Context hint */}
      {op && (
        <div className="animate-ed-slide-in ml-auto text-[13px] italic text-text-faint">
          {OPS[op].desc}
        </div>
      )}
    </div>
  );
}
