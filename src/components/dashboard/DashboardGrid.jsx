import React from 'react';
import { lookupMeta, getDistance, shortName, getGPSDistanceToActivity, getLunchDistance } from '../../utils/parsers.js';
import DistanceBadge from '../shared/DistanceBadge.jsx';

/**
 * Parse a time string like "11:00 AM" or "2:00 PM" into minutes since midnight.
 */
function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const m = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  let hours = parseInt(m[1], 10);
  const mins = parseInt(m[2], 10);
  const ampm = m[3].toUpperCase();
  if (ampm === 'PM' && hours !== 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  return hours * 60 + mins;
}

/**
 * Check if slot transition is a meal break (2+ hour gap between consecutive same-day slots).
 */
function isMealBreak(prevSlotIdx, curSlotIdx, timeSlots, dayBoundaries) {
  if (dayBoundaries.has(curSlotIdx)) return false; // different days
  const prevTime = parseTimeToMinutes(timeSlots[prevSlotIdx]?.time);
  const curTime = parseTimeToMinutes(timeSlots[curSlotIdx]?.time);
  if (prevTime === null || curTime === null) return false;
  return (curTime - prevTime) >= 120; // 2+ hour gap
}

/**
 * DashboardGrid — The main schedule matrix table with day/time headers,
 * group rows, activity cells, and distance badges.
 */
export default function DashboardGrid({
  displayGroups,
  isSingleGroup,
  daySlices,
  dayColors,
  dayBoundaries,
  timeSlots,
  registry,
  distMatrix,
  startLocation,
  startLocations,
  foodLocations,
  colorMode,
  getCellStyle,
  hoveredCell,
  setHoveredCell,
  setSelectedActivity,
  setFocusGroup,
}) {
  // Resolve the selected start location object from the name
  const startLoc = startLocation ? startLocations?.find(s => s.name === startLocation) : null;

  return (
    <div className="px-7 py-5 overflow-x-auto">
      <table className={`border-separate border-spacing-0 w-full ${isSingleGroup ? 'min-w-[800px]' : 'min-w-[1050px]'}`}>
        <thead>
          {/* Day headers */}
          <tr>
            {!isSingleGroup && <th className="w-[50px]" />}
            {daySlices.map((d, di) => (
              <React.Fragment key={d.name}>
                {di > 0 && <th className="w-5" />}
                <th colSpan={d.end - d.start}
                  className="text-center text-[13px] font-bold pt-1.5 pb-0.5 font-display tracking-[1px] text-[var(--day-hdr-color)] border-b-2 border-b-[var(--day-hdr-border)]"
                  style={{ '--day-hdr-color': dayColors[di], '--day-hdr-border': dayColors[di] + '30' }}
                >{d.name}</th>
              </React.Fragment>
            ))}
          </tr>
          {/* Time headers */}
          <tr>
            {!isSingleGroup && <th className="text-[12px] text-text-muted text-center px-1.5 pb-2.5 pt-1 font-medium">Grp</th>}
            {timeSlots.map((s, si) => {
              const isNewDay = dayBoundaries.has(si);
              return (
                <React.Fragment key={si}>
                  {isNewDay && <th className="w-5" />}
                  <th className="text-[12px] text-[#aaa] text-center px-1 pb-2.5 pt-1 font-medium font-mono whitespace-nowrap">{s.time}</th>
                </React.Fragment>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {displayGroups.map(({ group, idx: gi }) => (
            <tr key={gi}>
              {!isSingleGroup && (
                <td onClick={() => setFocusGroup(gi)} title={`Focus Group ${gi + 1}`}
                  className="text-center font-bold text-[13px] text-accent-gold px-1.5 font-mono bg-base-700 sticky left-0 z-[2] cursor-pointer"
                >{gi + 1}</td>
              )}
              {group.map((activity, si) => {
                const meta = lookupMeta(activity, registry);
                const cellVars = getCellStyle(activity);
                const isNewDay = dayBoundaries.has(si);
                const isFirstOfDay = daySlices.some(d => d.start === si);

                // Distance calculation
                let dist = null;
                let lunchInfo = null;
                if (si > 0 && !isNewDay) {
                  const mealBreak = isMealBreak(si - 1, si, timeSlots, dayBoundaries);
                  if (mealBreak && foodLocations?.length > 0) {
                    lunchInfo = getLunchDistance(group[si - 1], activity, foodLocations, registry);
                  }
                  if (!lunchInfo) {
                    dist = getDistance(group[si - 1], activity, distMatrix, registry.nameMap);
                  }
                }

                // Start distance: GPS-based from Data page start locations
                const startDist = (isFirstOfDay && startLoc)
                  ? getGPSDistanceToActivity(startLoc, activity, registry)
                  : null;

                const isHovered = hoveredCell?.g === gi && hoveredCell?.s === si;

                return (
                  <React.Fragment key={si}>
                    {isNewDay && (
                      <td className="w-5 bg-transparent" />
                    )}
                    <td className="px-px py-0.5 align-top relative">
                      {/* Normal distance badge */}
                      {dist !== null && !lunchInfo && (
                        <div className="absolute top-1/2 -left-0.5 -translate-x-1/2 -translate-y-1/2 z-[3]">
                          <DistanceBadge dist={dist} />
                        </div>
                      )}
                      {/* Lunch break two-leg distance badge */}
                      {lunchInfo && (
                        <div className="absolute top-1/2 -left-0.5 -translate-x-1/2 -translate-y-1/2 z-[3]">
                          <div
                            className="flex flex-col items-center gap-px"
                            title={`Via ${lunchInfo.foodName}: ${lunchInfo.toFood}m + ${lunchInfo.fromFood}m`}
                          >
                            <div className="text-[9px] font-mono font-semibold text-[#fbbf24] bg-[#2a2008] rounded-t-[3px] px-1 leading-[14px] whitespace-nowrap border border-b-0 border-[#3d3010]">
                              {lunchInfo.toFood}m
                            </div>
                            <div className="text-[8px] font-semibold text-[#fbbf24] bg-[#2a2008] px-1 leading-[12px] border-x border-[#3d3010]">
                              {lunchInfo.foodName}
                            </div>
                            <div className="text-[9px] font-mono font-semibold text-[#fbbf24] bg-[#2a2008] rounded-b-[3px] px-1 leading-[14px] whitespace-nowrap border border-t-0 border-[#3d3010]">
                              {lunchInfo.fromFood}m
                            </div>
                          </div>
                        </div>
                      )}
                      {/* Start distance badge */}
                      {startDist !== null && (
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[3]">
                          <div className="text-[11px] text-[#60a5fa] bg-[#112a3d] rounded-[3px] px-1 py-px font-semibold font-mono whitespace-nowrap border border-[#1e3a5f]">
                            &#x25B8; {startDist}m
                          </div>
                        </div>
                      )}
                      <div
                        onClick={() => setSelectedActivity(activity)}
                        onMouseEnter={() => setHoveredCell({ g: gi, s: si })}
                        onMouseLeave={() => setHoveredCell(null)}
                        className={`rounded-md flex flex-col justify-between transition-all duration-150 relative cursor-pointer bg-[var(--cell-bg)] text-[var(--cell-color)] ${
                          isSingleGroup ? 'px-3 py-3 min-h-[88px]' : 'px-2.5 py-2 min-h-[68px]'
                        } ${
                          isHovered
                            ? 'scale-[1.03] shadow-[0_2px_12px_rgba(0,0,0,0.4)] z-[5] border border-white/30'
                            : meta ? 'scale-100 shadow-none z-[1] border border-white/[0.06]' : 'scale-100 shadow-none z-[1] border border-dashed border-[#e74c3c55]'
                        }`}
                        style={cellVars}
                      >
                        <div className={`font-semibold leading-[1.2] mb-0.5 ${isSingleGroup ? 'text-[15px]' : 'text-[13px]'}`}>
                          {shortName(activity)}
                        </div>
                        {isSingleGroup && meta && (
                          <div className="text-[11px] opacity-70 mb-0.5">
                            {meta.intensity} &middot; {meta.setup} setup
                          </div>
                        )}
                        <div className="flex justify-between items-center mt-auto">
                          <span className={`opacity-75 ${isSingleGroup ? 'text-[11px]' : 'text-[11px]'}`}>{(meta?.location || '').substring(0, 8)}</span>
                          <span className={`font-bold font-mono bg-black/20 rounded-[3px] px-[5px] py-px ${isSingleGroup ? 'text-[13px]' : 'text-[11px]'}`}>{meta?.value ?? '?'}</span>
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
