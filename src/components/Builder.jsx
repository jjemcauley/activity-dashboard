import React from 'react';
import { ROT_COLORS } from '../constants/colors.js';
import useBuilderState from '../hooks/useBuilderState.js';
import BuilderPalette from './builder/BuilderPalette.jsx';
import BuilderToolbar from './builder/BuilderToolbar.jsx';
import RotationMatrix from './builder/RotationMatrix.jsx';
import ComparisonView, { ErrorSummary } from './builder/ComparisonView.jsx';
import FullTableComparison from './builder/FullTableComparison.jsx';

/* ===================== MAIN BUILDER ===================== */
export default function Builder({ rotations, onSave, persistedState, onStateChange }) {
  const state = useBuilderState({ rotations, onSave, persistedState, onStateChange });
  const {
    registry, distMatrix, timeSlots, daySlices, similarities, startLocations, numCols,
    groupsA, groupsB, numGroupsA, numGroupsB,
    selectedActivity, setSelectedActivity, dropPreview, setDropPreview,
    paletteFilter, setPaletteFilter, paletteSort, setPaletteSort,
    paletteSimilarity, setPaletteSimilarity,
    activityRotAssign, paletteRotFilter, setPaletteRotFilter,
    clipboard, setClipboard, isSelecting, selectionStart,
    setSelectionStart, setSelectionEnd, setIsSelecting,
    cellGroups,
    showCrossValidation, setShowCrossValidation,
    compareView, setCompareView, compareOldRot, setCompareOldRot,
    compareOldGroup, setCompareOldGroup,
    undoStack,
    activityList, simColorMap, simGroups, filteredActivities,
    errorsA, errorsB, crossErrors, statsA, statsB,
    isActivityAllowedForRot, handleRotAssign,
    getSelectionBounds, isInSelection, clearSelection,
    getGroupColor,
    handleCreateGroup, handleDeleteGroup, handleCopyGroup,
    handleCopy, handlePaste,
    handleUndo,
    handleDrop, handleClear, handleMove,
    handleAddGroup, handleRemoveGroup, handleClearAll,
    handleImportRotation, handleSaveToDashboard, handleCompareRow,
  } = state;

  // Comparison overlay
  if (compareView && rotations?.length) {
    const ng = compareView.rot === 'A' ? groupsA[compareView.row] : groupsB[compareView.row];
    const og = rotations[compareOldRot]?.groups?.[compareOldGroup] || [];
    const ogp = Array(numCols).fill('').map((_, i) => og[i] || '');
    return <ComparisonView newGroup={ng} oldGroup={ogp}
      oldLabel={`Existing: Rotation ${rotations[compareOldRot]?.name||'?'} \u2014 Group ${compareOldGroup+1}`}
      newLabel={`Builder: Rotation ${compareView.rot} \u2014 Group ${compareView.row+1}`}
      timeSlots={timeSlots} daySlices={daySlices} registry={registry} distMatrix={distMatrix}
      startLocation={startLocations?.[0]||null} startLocations={startLocations}
      onClose={() => setCompareView(null)} onChangeOldSource={(r,g) => { setCompareOldRot(r); setCompareOldGroup(g); }}
      existingRotations={rotations} selectedOldRot={compareOldRot} selectedOldGroup={compareOldGroup} />;
  }

  return (
    <div className="flex min-h-[calc(100vh-52px)] bg-base-800">
      <BuilderPalette
        paletteFilter={paletteFilter} setPaletteFilter={setPaletteFilter}
        paletteSort={paletteSort} setPaletteSort={setPaletteSort}
        paletteSimilarity={paletteSimilarity} setPaletteSimilarity={setPaletteSimilarity}
        simGroups={simGroups}
        paletteRotFilter={paletteRotFilter} setPaletteRotFilter={setPaletteRotFilter}
        clipboard={clipboard} setClipboard={setClipboard} clearSelection={clearSelection}
        getSelectionBounds={getSelectionBounds} handleCreateGroup={handleCreateGroup} handleCopy={handleCopy}
        cellGroups={cellGroups} handleCopyGroup={handleCopyGroup} handleDeleteGroup={handleDeleteGroup}
        selectedActivity={selectedActivity} setSelectedActivity={setSelectedActivity}
        filteredActivities={filteredActivities} activityList={activityList} simColorMap={simColorMap}
        setDropPreview={setDropPreview} activityRotAssign={activityRotAssign} handleRotAssign={handleRotAssign}
      />

      {/* Main */}
      <div className="flex-1 overflow-auto px-6 py-5">
        <BuilderToolbar
          rotations={rotations} handleImportRotation={handleImportRotation}
          showCrossValidation={showCrossValidation} setShowCrossValidation={setShowCrossValidation}
          undoStack={undoStack} handleUndo={handleUndo} handleClearAll={handleClearAll}
        />

        {crossErrors.length > 0 && <div className="px-4 py-2.5 rounded-lg mb-4 bg-[#dc262610] border border-[#dc262630]"><div className="text-[11px] font-bold text-error-light mb-1.5">Cross-Rotation Conflicts ({crossErrors.length})</div>{crossErrors.slice(0, 5).map((e, i) => <div key={i} className="text-[11px] text-[#f8717199] mb-0.5">{e.msg}</div>)}{crossErrors.length > 5 && <div className="text-[11px] text-[#f8717160]">...and {crossErrors.length - 5} more</div>}</div>}

        <RotationMatrix rotLabel="A" rotColor={ROT_COLORS.A} groups={groupsA} numGroups={numGroupsA} timeSlots={timeSlots} daySlices={daySlices} registry={registry} similarities={similarities} simColorMap={simColorMap} errors={errorsA} dropPreview={dropPreview} onDrop={(r, c, a) => handleDrop('A', r, c, a)} onClear={(r, c) => handleClear('A', r, c)} onMove={(sr, sc, dr, dc) => handleMove('A', sr, sc, dr, dc)} onAddGroup={() => handleAddGroup('A')} onRemoveGroup={() => handleRemoveGroup('A')} onCompareRow={handleCompareRow} isInSelection={isInSelection} onSelectionStart={(rot, r, c) => { setSelectionStart({ rot, row: r, col: c }); setSelectionEnd({ rot, row: r, col: c }); setIsSelecting(true); }} onSelectionMove={(rot, r, c) => { if (isSelecting && selectionStart?.rot === rot) setSelectionEnd({ rot, row: r, col: c }); }} onPaste={handlePaste} hasClipboard={!!clipboard} isActivityAllowed={(act) => isActivityAllowedForRot(act, 'A')} onSave={onSave ? () => handleSaveToDashboard('A') : null} selectedActivity={selectedActivity} onClickPlace={(r, c, a) => handleDrop('A', r, c, a)} getGroupColor={getGroupColor} />
        <div className="h-5" />
        <RotationMatrix rotLabel="B" rotColor={ROT_COLORS.B} groups={groupsB} numGroups={numGroupsB} timeSlots={timeSlots} daySlices={daySlices} registry={registry} similarities={similarities} simColorMap={simColorMap} errors={errorsB} dropPreview={dropPreview} onDrop={(r, c, a) => handleDrop('B', r, c, a)} onClear={(r, c) => handleClear('B', r, c)} onMove={(sr, sc, dr, dc) => handleMove('B', sr, sc, dr, dc)} onAddGroup={() => handleAddGroup('B')} onRemoveGroup={() => handleRemoveGroup('B')} onCompareRow={handleCompareRow} isInSelection={isInSelection} onSelectionStart={(rot, r, c) => { setSelectionStart({ rot, row: r, col: c }); setSelectionEnd({ rot, row: r, col: c }); setIsSelecting(true); }} onSelectionMove={(rot, r, c) => { if (isSelecting && selectionStart?.rot === rot) setSelectionEnd({ rot, row: r, col: c }); }} onPaste={handlePaste} hasClipboard={!!clipboard} isActivityAllowed={(act) => isActivityAllowedForRot(act, 'B')} onSave={onSave ? () => handleSaveToDashboard('B') : null} selectedActivity={selectedActivity} onClickPlace={(r, c, a) => handleDrop('B', r, c, a)} getGroupColor={getGroupColor} />

        <ErrorSummary errorsA={errorsA} errorsB={errorsB} />

        <div className="flex gap-4 mt-5 flex-wrap">
          {[{ label: 'Rotation A Fill', val: statsA, color: ROT_COLORS.A }, { label: 'Rotation B Fill', val: statsB, color: ROT_COLORS.B }].map(s => <div key={s.label} className="px-5 py-3.5 bg-base-700 rounded-[10px] border border-base-500 flex-[1_1_200px]"><div className="text-[11px] text-text-muted uppercase mb-1">{s.label}</div><div className="text-[28px] font-bold font-mono text-[var(--stat-color)]" style={{ '--stat-color': s.val.pct === 100 ? '#34d399' : s.color }}>{s.val.filled}/{s.val.total}<span className="text-xs text-text-faint ml-1.5">{s.val.pct}%</span></div></div>)}
          <div className="px-5 py-3.5 bg-base-700 rounded-[10px] border border-base-500 flex-[1_1_200px]"><div className="text-[11px] text-text-muted uppercase mb-1">Validation</div><div className="flex gap-3 items-baseline"><span className={`text-[28px] font-bold font-mono ${errorsA.length + errorsB.length === 0 ? 'text-[#34d399]' : 'text-[#dc2626]'}`}>{errorsA.filter(e => e.severity === 'error').length + errorsB.filter(e => e.severity === 'error').length}</span><span className="text-[11px] text-text-muted">errors</span><span className="text-xl font-bold font-mono text-warning">{errorsA.filter(e => e.severity === 'warn').length + errorsB.filter(e => e.severity === 'warn').length}</span><span className="text-[11px] text-text-muted">warnings</span></div></div>
          <div className={`px-5 py-3.5 bg-base-700 rounded-[10px] flex-[1_1_200px] ${crossErrors.length ? 'border border-[#dc262640]' : 'border border-[#1e2636]'}`}><div className="text-[11px] text-text-muted uppercase mb-1">Cross-Rotation</div><div className={`text-[28px] font-bold font-mono ${crossErrors.length === 0 ? 'text-[#34d399]' : 'text-[#dc2626]'}`}>{crossErrors.length}</div></div>
        </div>

        {/* -- Full Table Comparison -- */}
        <FullTableComparison
          groupsA={groupsA} groupsB={groupsB}
          statsA={statsA} statsB={statsB}
          rotations={rotations} registry={registry}
          distMatrix={distMatrix} daySlices={daySlices}
          timeSlots={timeSlots} startLocations={startLocations}
        />
      </div>
    </div>
  );
}
