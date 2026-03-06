import React from 'react';
import { INTENSITY_COLORS, INTENSITY_TEXT } from '../../constants/colors.js';
import { lookupMeta, shortName } from '../../utils/parsers.js';

/**
 * ActivityDetailPanel — Side drawer showing activity metadata,
 * value bar, and nearest activities from the distance matrix.
 */
export default function ActivityDetailPanel({ activity, registry, distMatrix, onClose }) {
  const meta = lookupMeta(activity, registry);

  if (!meta) return (
    <div className="fixed top-0 right-0 w-[400px] h-screen bg-base-600 z-[1000] border-l border-base-400 shadow-[-2px_0_16px_rgba(0,0,0,0.3)] overflow-y-auto p-6">
      <div className="flex justify-between mb-5">
        <h2 className="m-0 text-lg font-display text-accent-gold">{registry.nameMap[activity] || activity}</h2>
        <button onClick={onClose} className="bg-transparent border-none text-[#999] text-[22px] cursor-pointer">&times;</button>
      </div>
      <div className="text-xs text-error-light px-3 py-2 bg-[#3d1111] rounded-md">
        No metadata found for this activity. Check name matching in the warnings panel.
      </div>
    </div>
  );

  // Find nearest activities from distance matrix
  const cn = registry.nameMap[activity] || activity;
  const allAliases = registry.canonical[cn]?.aliases || [cn];
  let distRow = null;
  for (const alias of allAliases) {
    if (distMatrix[alias]) { distRow = distMatrix[alias]; break; }
  }

  const nearest = distRow
    ? Object.entries(distRow)
        .filter(([k, v]) => v > 0 && (registry.nameMap[k] || k) !== cn)
        .sort((a, b) => a[1] - b[1])
        .slice(0, 5)
    : [];

  const ioBg = meta.io === 'Indoor' ? '#8e44ad' : '#27ae60';
  const intensityBg = INTENSITY_COLORS[meta.intensity] || '#333';
  const intensityText = INTENSITY_TEXT[meta.intensity] || '#fff';

  return (
    <div className="fixed top-0 right-0 w-[400px] h-screen bg-base-600 text-text-primary z-[1000] shadow-[-2px_0_16px_rgba(0,0,0,0.3)] overflow-y-auto font-sans border-l border-base-400">
      <div className="p-6">
        <div className="flex justify-between items-start mb-5">
          <h2 className="m-0 text-xl font-display text-accent-gold leading-[1.3]">{cn}</h2>
          <button onClick={onClose} className="bg-transparent border-none text-[#999] text-[22px] cursor-pointer px-1">&times;</button>
        </div>
        <div className="flex gap-2 mb-5 flex-wrap">
          <span className="text-white px-2.5 py-[3px] rounded text-[11px] font-semibold bg-[var(--io-bg)]" style={{ '--io-bg': ioBg }}>{meta.io}</span>
          <span className="px-2.5 py-[3px] rounded text-[11px] font-semibold bg-[var(--int-bg)] text-[var(--int-text)]" style={{ '--int-bg': intensityBg, '--int-text': intensityText }}>{meta.intensity}</span>
          <span className="bg-base-400 text-[#aaa] px-2.5 py-[3px] rounded text-[11px]">{meta.season}</span>
        </div>
        {/* Value bar */}
        <div className="bg-gradient-to-br from-base-400 to-base-500 rounded-lg p-4 mb-4">
          <div className="text-[11px] text-text-secondary uppercase tracking-[1px] mb-1.5">Customer Value</div>
          <div className="flex items-center gap-3">
            <div className="text-4xl font-bold text-accent-gold font-mono">{meta.value}</div>
            <div className="flex-1 bg-base-600 rounded h-2">
              <div className="h-full rounded bg-gradient-to-r from-[#8b6914] to-[#d4a847] w-[var(--val-width)]" style={{ '--val-width': `${meta.value}%` }} />
            </div>
          </div>
        </div>
        {[['Location Zone', meta.location], ['Unique', meta.unique], ['Staff Required', meta.staff], ['Setup Time', meta.setup], ['Scalability', meta.scalable], ['UID', meta.uid]].map(([label, val]) => (
          <div key={label} className="flex justify-between py-2.5 border-b border-base-400">
            <span className="text-xs text-text-secondary">{label}</span>
            <span className="text-[13px] text-text-primary font-medium">{val || '\u2014'}</span>
          </div>
        ))}
        {/* Nearest activities */}
        {nearest.length > 0 && (
          <div className="mt-5">
            <div className="text-[11px] text-text-secondary uppercase tracking-[1px] mb-2.5">Nearest Activities</div>
            {nearest.map(([name, dist]) => {
              const distColor = dist < 200 ? '#27ae60' : dist < 500 ? '#d4a847' : '#e74c3c';
              return (
                <div key={name} className="flex justify-between py-1.5 text-xs">
                  <span className="text-[#bbb]">{shortName(name)}</span>
                  <span className="font-mono font-semibold text-[var(--dist-color)]" style={{ '--dist-color': distColor }}>{dist}m</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
