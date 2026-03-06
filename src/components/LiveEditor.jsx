import React, { useState } from "react";
import useEditorState from "../hooks/useEditorState.js";
import EditorToolbar from "./editor/EditorToolbar.jsx";
import EditorGrid from "./editor/EditorGrid.jsx";
import EditorSidebar from "./editor/EditorSidebar.jsx";

/* ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
   LiveEditor — Orchestrator
   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ */

export default function LiveEditor({
  rotations,
  onSave,
  savedEdits,
}) {
  const [rotIdx, setRotIdx] = useState(0);

  const {
    // State
    draft,
    original,
    op,
    pick1,
    pick2,
    cycles,
    cycleOn,
    flashKeys,
    changes,
    preview,
    impactStats,
    dayBounds,
    history,
    future,
    // Actions
    undo,
    redo,
    revertAll,
    selectOp,
    onGroupClick,
    onSlotClick,
    onCellClick,
    toggleCycle,
    commitCycles,
    displayVal,
  } = useEditorState({ rotations, rotIdx });

  return (
    <div className="min-h-screen bg-base-800 text-text-primary font-sans">
      <EditorToolbar
        rotations={rotations}
        rotIdx={rotIdx}
        setRotIdx={setRotIdx}
        op={op}
        selectOp={selectOp}
        undo={undo}
        redo={redo}
        revertAll={revertAll}
        changes={changes}
        history={history}
        future={future}
        onSave={onSave}
        draft={draft}
        savedEdits={savedEdits}
      />

      <div className="flex">
        <EditorGrid
          draft={draft}
          original={original}
          op={op}
          pick1={pick1}
          pick2={pick2}
          cycles={cycles}
          cycleOn={cycleOn}
          flashKeys={flashKeys}
          preview={preview}
          dayBounds={dayBounds}
          displayVal={displayVal}
          onGroupClick={onGroupClick}
          onSlotClick={onSlotClick}
          onCellClick={onCellClick}
        />

        <EditorSidebar
          op={op}
          pick1={pick1}
          pick2={pick2}
          cycles={cycles}
          cycleOn={cycleOn}
          toggleCycle={toggleCycle}
          commitCycles={commitCycles}
          impactStats={impactStats}
          changes={changes}
          draft={draft}
          original={original}
        />
      </div>
    </div>
  );
}
