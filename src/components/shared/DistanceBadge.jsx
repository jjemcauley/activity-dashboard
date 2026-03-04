import React from 'react';
import { getDistanceBadgeColors } from '../../constants/colors.js';

export default function DistanceBadge({ dist, compact }) {
  if (dist === null || dist === undefined) return null;
  const { color, bg } = getDistanceBadgeColors(dist);
  return (
    <div
      className={`rounded-[3px] font-semibold font-mono text-center text-[var(--badge-color)] bg-[var(--badge-bg)] ${compact ? 'text-[8px] px-[3px] leading-[13px] min-w-[24px]' : 'text-[9px] px-1 py-px leading-[14px] min-w-[28px]'}`}
      style={{ '--badge-color': color, '--badge-bg': bg }}
    >
      {dist}m
    </div>
  );
}
