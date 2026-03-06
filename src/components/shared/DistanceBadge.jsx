import React from 'react';
import { getDistanceBadgeColors } from '../../constants/colors.js';

export default function DistanceBadge({ dist, compact }) {
  if (dist === null || dist === undefined) return null;
  const { color, bg } = getDistanceBadgeColors(dist);
  return (
    <div
      className={`rounded-[3px] font-semibold font-mono text-center text-[var(--badge-color)] bg-[var(--badge-bg)] ${compact ? 'text-[11px] px-1 leading-[16px] min-w-[30px]' : 'text-[11px] px-1.5 py-px leading-[16px] min-w-[34px]'}`}
      style={{ '--badge-color': color, '--badge-bg': bg }}
    >
      {dist}m
    </div>
  );
}
