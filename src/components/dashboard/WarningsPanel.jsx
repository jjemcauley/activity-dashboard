import React from 'react';

/**
 * WarningsPanel — Displays name-matching warnings when toggled on.
 */
export default function WarningsPanel({ warnings, show }) {
  if (!show || !warnings.length) return null;

  return (
    <div className="px-7 py-3.5 bg-[#1a1810] border-b border-[#3d2e11]">
      <div className="text-xs font-bold text-warning mb-2">Name Matching Warnings</div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-2">
        {warnings.map((w, i) => (
          <div key={i} className="px-3 py-2 bg-base-700 rounded-md border border-base-400 text-[11px]">
            <span className="text-warning font-semibold">[{w.source}]</span>{' '}
            <span className="text-text-primary">"{w.name}"</span>{' '}
            <span className="text-text-secondary">&mdash; {w.issue}</span>
            {w.suggestion && <span className="text-[#60a5fa]"> &rarr; "{w.suggestion}"</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
