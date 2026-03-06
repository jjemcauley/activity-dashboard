import React from 'react';

export default function BuilderToolbar({
  rotations, handleImportRotation,
  showCrossValidation, setShowCrossValidation,
  undoStack, handleUndo, handleClearAll,
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="text-xl font-[800] text-text-primary font-display">Matrix Builder<span className="text-[11px] text-text-faint font-normal ml-2.5 font-sans">Drag activities into cells {'\u00B7'} fill a row to compare</span></div>
      <div className="flex gap-2 items-center">
        {rotations?.length > 0 && <div className="flex gap-1">{rotations.map((rot, idx) => <div key={idx} className="flex gap-0.5"><button onClick={() => handleImportRotation('A', idx)} className="px-2.5 py-[5px] rounded-[5px] text-[13px] border border-base-400 bg-base-600 text-text-secondary cursor-pointer font-semibold">Import {rot.name} {'\u2192'} A</button><button onClick={() => handleImportRotation('B', idx)} className="px-2.5 py-[5px] rounded-[5px] text-[13px] border border-base-400 bg-base-600 text-text-secondary cursor-pointer font-semibold">Import {rot.name} {'\u2192'} B</button></div>)}</div>}
        <button onClick={() => setShowCrossValidation(v => !v)} className={`px-2.5 py-[5px] rounded-[5px] text-[13px] cursor-pointer font-semibold ${showCrossValidation ? 'border border-accent-orange bg-accent-orange/10 text-accent-orange' : 'border border-[#2a3040] bg-transparent text-[#666]'}`}>Cross-Rot {showCrossValidation ? 'ON' : 'OFF'}</button>
        <button onClick={handleUndo} disabled={!undoStack.length} className={`px-2.5 py-[5px] rounded-[5px] text-[13px] border border-base-400 bg-base-600 font-semibold ${undoStack.length ? 'text-text-secondary cursor-pointer' : 'text-text-dim cursor-not-allowed'}`}>{'\u21A9'} Undo ({undoStack.length})</button>
        <button onClick={handleClearAll} className="px-2.5 py-[5px] rounded-[5px] text-[13px] border border-[#dc262640] bg-[#dc262610] text-error-light cursor-pointer font-semibold">Clear All</button>
      </div>
    </div>
  );
}
