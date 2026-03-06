import React from 'react';
import { INTENSITY_COLORS, UNIQUE_COLORS, LOCATION_COLORS } from '../../constants/colors.js';

/**
 * DashboardNav — Top control bar with rotation selector, group/color/start pickers,
 * warnings toggle, export button, and color legend.
 */
export default function DashboardNav({
  rotations,
  rotIdx,
  setRotIdx,
  editFlags,
  hasAnyEdits,
  hasEditForRot,
  useEdited,
  onToggleEdited,
  onClearEdit,
  focusGroup,
  setFocusGroup,
  numGroups,
  colorMode,
  setColorMode,
  startLocation,
  setStartLocation,
  startLocations,
  showWarnings,
  setShowWarnings,
  warningCount,
  locationZones,
  onExport,
}) {
  return (
    <div className="px-7 py-2.5 bg-base-700 border-b border-base-500 flex flex-col gap-1">
      {/* Row 1: Rotation selector, Edit toggle, Group selector, Export button */}
      <div className="flex gap-3 items-center flex-wrap">
        {/* Rotation selector */}
        <div className="flex items-center gap-1.5">
          {rotations.map((r, i) => {
            const hasEdit = !!(editFlags && editFlags[i]);
            return (
              <button key={i} onClick={() => setRotIdx(i)}
                className={`btn-sm flex items-center gap-1 transition-all duration-200 ${rotIdx === i ? 'border-accent-gold bg-accent-gold text-base-800' : 'border-base-400 bg-transparent text-text-secondary'}`}
              >
                Rot {r.name}
                {hasEdit && (
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        <div className="w-px h-6 bg-base-400" />

        {/* Edit toggle */}
        {hasAnyEdits && (
          <>
            <div className="flex items-center gap-1.5">
              <button onClick={onToggleEdited}
                className={`btn-sm flex items-center gap-[5px] transition-all duration-200 ${useEdited ? 'border-accent-cyan bg-accent-cyan/10 text-accent-cyan' : 'border-base-400 bg-transparent text-text-secondary'}`}
              >
                <span className="text-[13px] leading-none">{useEdited ? '\u2611' : '\u2610'}</span>
                Edited
              </button>
              {useEdited && hasEditForRot && onClearEdit && (
                <button onClick={() => onClearEdit(rotIdx)}
                  className="py-1 px-2.5 rounded text-[11px] font-semibold border border-error/25 bg-transparent text-error cursor-pointer transition-all duration-200"
                >Revert</button>
              )}
            </div>
            <div className="w-px h-6 bg-base-400" />
          </>
        )}

        {/* Group selector */}
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] text-text-secondary uppercase tracking-[1px] mr-1">Group</span>
          <button onClick={() => setFocusGroup('all')}
            className={`btn-pill transition-all duration-200 ${focusGroup === 'all' ? 'border border-accent-gold bg-accent-gold text-base-800' : 'border border-base-400 bg-transparent text-text-muted'}`}
          >All</button>
          {Array.from({ length: numGroups }, (_, i) => (
            <button key={i} onClick={() => setFocusGroup(i)}
              className={`btn-pill min-w-[24px] text-center font-mono transition-all duration-200 ${focusGroup === i ? 'border border-accent-gold bg-accent-gold text-base-800' : 'border border-base-400 bg-transparent text-text-muted'}`}
            >{i + 1}</button>
          ))}
        </div>

        <div className="w-px h-6 bg-base-400" />

        {/* Export button */}
        <button
          onClick={onExport}
          className="btn-pill border border-[#3b82f6] bg-transparent text-[#60a5fa] flex items-center gap-[5px] transition-all duration-200"
        >
          &darr; Export CSV
        </button>
      </div>

      {/* Row 2: Color mode, Start location, Warnings toggle, Legend (right-aligned) */}
      <div className="flex gap-3 items-center flex-wrap">
        {/* Color mode */}
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] text-text-secondary uppercase tracking-[1px] mr-1">Color</span>
          <select
            value={colorMode}
            onChange={(e) => setColorMode(e.target.value)}
            className="py-1 px-2 rounded text-[11px] font-medium border border-base-400 bg-base-800 text-accent-gold cursor-pointer font-mono max-w-[200px]"
          >
            <option value="value">Value</option>
            <option value="intensity">Intensity</option>
            <option value="unique">Unique</option>
            <option value="io">In/Out</option>
            <option value="location">Zone</option>
          </select>
        </div>

        <div className="w-px h-6 bg-base-400" />

        {/* Start location */}
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] text-text-secondary uppercase tracking-[1px] mr-1">Start</span>
          <select
            value={startLocation || ''}
            onChange={(e) => setStartLocation(e.target.value || null)}
            className="py-1 px-2 rounded text-[11px] font-medium border border-base-400 bg-base-800 text-accent-gold cursor-pointer font-mono max-w-[200px]"
          >
            <option value="">None</option>
            {startLocations.map(s => (
              <option key={s.name} value={s.name}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Warnings toggle */}
        {warningCount > 0 && (
          <>
            <div className="w-px h-6 bg-base-400" />
            <button onClick={() => setShowWarnings(!showWarnings)}
              className={`btn-pill border border-[#f59e0b] transition-all duration-200 text-warning ${showWarnings ? 'bg-[#3d2e11]' : 'bg-transparent'}`}
            >
              &#x26A0; {warningCount} Name {warningCount === 1 ? 'Warning' : 'Warnings'}
            </button>
          </>
        )}

        {/* Legend */}
        <div className="ml-auto flex gap-2.5 items-center flex-wrap">
          {colorMode === 'intensity' && Object.entries(INTENSITY_COLORS).map(([k, c]) => (
            <div key={k} className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm bg-[var(--legend-color)]" style={{ '--legend-color': c }} />
              <span className="text-[11px] text-text-secondary">{k}</span>
            </div>
          ))}
          {colorMode === 'value' && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-text-secondary">0</span>
              <div className="w-20 h-2.5 rounded-sm bg-gradient-to-r from-[rgb(220,230,220)] to-[rgb(40,150,70)]" />
              <span className="text-[11px] text-text-secondary">100</span>
            </div>
          )}
          {colorMode === 'unique' && Object.entries(UNIQUE_COLORS).map(([k, c]) => (
            <div key={k} className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm bg-[var(--legend-color)]" style={{ '--legend-color': c }} />
              <span className="text-[11px] text-text-secondary">{k}</span>
            </div>
          ))}
          {colorMode === 'io' && ['Indoor', 'Outdoor'].map(t => (
            <div key={t} className="flex items-center gap-1">
              <div className={`w-2.5 h-2.5 rounded-sm ${t === 'Indoor' ? 'bg-[#6c3483]' : 'bg-[#1e8449]'}`} />
              <span className="text-[11px] text-text-secondary">{t}</span>
            </div>
          ))}
          {colorMode === 'location' && [...locationZones].map(k => (
            <div key={k} className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm bg-[var(--loc-color)]" style={{ '--loc-color': LOCATION_COLORS[k] || '#555' }} />
              <span className="text-[11px] text-text-secondary">{k}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
