import { useState, useRef, useCallback } from 'react';
import { storage } from '../utils/storage';

const FILE_TYPES = [
  {
    key: 'metadata',
    label: 'Activity Metadata',
    description: 'Activity names, GPS locations, customer value, intensity, location zones, staff requirements',
    hint: 'The CDS / data sheet',
    icon: '\u{1F4CB}',
    required: true,
  },
  {
    key: 'schedule',
    label: 'Schedule Matrix',
    description: 'Activity rotations \u2014 groups \u00D7 time slots across days',
    hint: 'The 1-hour activity blocks',
    icon: '\u{1F4C5}',
    required: true,
  },
];

function DropZone({ fileType, file, onFile }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  }, [onFile]);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const isLoaded = !!file;
  const isOptional = !fileType.required;

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDrag}
      onDragLeave={() => setDragOver(false)}
      onClick={() => inputRef.current?.click()}
      className={`flex-[1_1_280px] min-h-[180px] border-2 border-dashed rounded-xl p-6 cursor-pointer transition-all duration-200 flex flex-col justify-center items-center text-center gap-2 ${
        isLoaded
          ? 'bg-[#1a2e1a] border-success'
          : dragOver
            ? 'bg-base-500 border-accent-gold'
            : 'bg-base-700 border-base-400'
      } ${isOptional && !isLoaded ? 'border-[#2a304080] opacity-75' : ''}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.tsv,.txt"
        className="hidden"
        onChange={(e) => { if (e.target.files[0]) onFile(e.target.files[0]); }}
      />

      <div className="text-[32px]">{isLoaded ? '\u2705' : fileType.icon}</div>

      <div className={`text-[15px] font-bold font-display flex items-center gap-1.5 ${
        isLoaded ? 'text-success' : 'text-accent-gold'
      }`}>
        {fileType.label}
        {isOptional && (
          <span className="text-[11px] font-medium text-text-muted bg-base-400 px-1.5 py-0.5 rounded-[3px]">
            OPTIONAL
          </span>
        )}
      </div>

      <div className="text-[12px] text-text-secondary leading-[1.4]">
        {fileType.description}
      </div>

      {isLoaded ? (
        <div className="mt-2">
          <div className="text-xs text-success font-semibold">
            {file.name}
          </div>
          <div className="text-[11px] text-text-muted mt-0.5">
            {(file.size / 1024).toFixed(1)} KB — click to replace
          </div>
        </div>
      ) : (
        <div className="mt-2 text-[12px] text-text-muted px-3.5 py-1.5 border border-base-400 rounded-md">
          Drop CSV here or click to browse
        </div>
      )}

      <div className="text-[11px] text-text-faint italic mt-1">
        {fileType.hint}
      </div>
    </div>
  );
}

function loadExistingFiles() {
  const result = {};
  for (const key of ['metadata', 'schedule']) {
    const text = storage.loadCSV(key);
    if (text) {
      result[key] = { name: `${key}.csv (saved)`, size: new Blob([text]).size, text };
    } else {
      result[key] = null;
    }
  }
  return result;
}

export default function FileUploader({ onFilesReady, hasExisting }) {
  const [files, setFiles] = useState(() =>
    hasExisting ? loadExistingFiles() : { metadata: null, schedule: null }
  );
  const [error, setError] = useState(null);

  const handleFile = (key) => async (file) => {
    setError(null);
    const text = await file.text();
    setFiles(prev => ({ ...prev, [key]: { name: file.name, size: file.size, text } }));
  };

  // Required files check
  const requiredReady = files.metadata && files.schedule;

  const handleLoad = () => {
    if (!requiredReady) return;
    setError(null);
    try {
      onFilesReady({
        metadata: files.metadata.text,
        schedule: files.schedule.text,
      });
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-10">
      <div className="max-w-[1200px] w-full">
        {/* Title */}
        <div className="text-center mb-10">
          <h1 className="text-[28px] font-display text-accent-gold mb-2">
            Fall Activity Matrix — SR 2026
          </h1>
          <p className="text-sm text-text-secondary">
            Upload your CSV files to load the schedule dashboard
          </p>
        </div>

        {/* Required files section */}
        <div className="mb-6">
          <div className="text-[12px] text-text-secondary uppercase tracking-[1px] mb-3 pl-1">
            Required Files
          </div>
          <div className="flex gap-5 flex-wrap">
            {FILE_TYPES.filter(ft => ft.required).map(ft => (
              <DropZone
                key={ft.key}
                fileType={ft}
                file={files[ft.key]}
                onFile={handleFile(ft.key)}
              />
            ))}
          </div>
        </div>


        {/* Actions */}
        <div className="flex justify-center gap-4 flex-wrap">
          <button
            onClick={handleLoad}
            disabled={!requiredReady}
            className={`px-9 py-3 rounded-lg border-none text-sm font-bold font-sans transition-all duration-200 ${
              requiredReady
                ? 'bg-accent-gold text-base-800 cursor-pointer'
                : 'bg-base-400 text-text-faint cursor-not-allowed'
            }`}
          >
            {hasExisting ? 'Re-load Dashboard' : 'Load Dashboard'}
          </button>

          {hasExisting && (
            <button
              onClick={() => onFilesReady(null)}
              className="px-7 py-3 rounded-lg border border-base-400 bg-transparent text-text-secondary text-[13px] font-medium cursor-pointer transition-all duration-200"
            >
              Back to Dashboard
            </button>
          )}
        </div>

        {/* Status summary */}
        <div className="mt-5 text-center text-[12px] text-text-muted">
          {requiredReady ? (
            <span className="text-success">
              &#10003; All required files loaded
            </span>
          ) : (
            <span>
              {[
                !files.metadata && 'metadata',
                !files.schedule && 'schedule',
              ].filter(Boolean).join(', ')} still needed
            </span>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mt-5 px-5 py-3 rounded-lg bg-[#3d1111] border border-[#ef4444] text-accent-red text-xs text-center">
            {error}
          </div>
        )}

        {/* File format hints */}
        <div className="mt-12 p-5 bg-base-700 rounded-xl border border-base-500">
          <h3 className="text-[13px] text-accent-gold mb-2.5 font-display">
            Notes on File Compatibility
          </h3>
          <div className="text-[12px] text-text-secondary leading-[1.6]">
            Activity names may vary between files (e.g., location info in parentheses,
            apostrophe variants, typos). The dashboard will automatically match names
            across files using fuzzy matching and flag any discrepancies for review.
            Data is saved in your browser and persists across reloads — no server needed.
          </div>
        </div>
      </div>
    </div>
  );
}
