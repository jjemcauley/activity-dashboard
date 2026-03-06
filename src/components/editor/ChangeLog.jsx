import React from "react";
import { shortName } from "../../utils/parsers.js";

export default function ChangeLog({ draft, original, changes }) {
  return (
    <div className="mt-5 pt-3.5 border-t border-[#1a2030]">

      <div className="mb-2 text-[11px] uppercase tracking-wider text-text-faint">
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
                  className="flex items-center gap-1 py-[3px] text-[11px] text-text-muted border-b border-[#111827]"
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
  );
}
