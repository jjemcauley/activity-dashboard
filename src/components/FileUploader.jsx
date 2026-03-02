import { useState, useRef, useCallback } from 'react';

const FILE_TYPES = [
  {
    key: 'metadata',
    label: 'Activity Metadata',
    description: 'Activity names, customer value, intensity, location zones, staff requirements',
    hint: 'The CDS / data sheet',
    icon: 'ðŸ“‹',
    required: true,
  },
  {
    key: 'distances',
    label: 'Distance Matrix',
    description: 'Pairwise walking distances between activity locations (meters)',
    hint: 'The distances sheet',
    icon: 'ðŸ“',
    required: true,
  },
  {
    key: 'schedule',
    label: 'Schedule Matrix',
    description: 'Activity rotations — groups Ã— time slots across days',
    hint: 'The 1-hour activity blocks',
    icon: 'ðŸ“…',
    required: true,
  },
  {
    key: 'similarities',
    label: 'Activity Similarities',
    description: 'Activity groupings for matrix generation constraints',
    hint: 'Optional — for auto-generation',
    icon: 'ðŸ”—',
    required: false,
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
      style={{
        flex: '1 1 280px',
        minHeight: 180,
        background: isLoaded ? '#1a2e1a' : dragOver ? '#1e2636' : '#141924',
        border: `2px dashed ${isLoaded ? '#27ae60' : dragOver ? '#d4a847' : isOptional ? '#2a304080' : '#2a3040'}`,
        borderRadius: 12,
        padding: 24,
        cursor: 'pointer',
        transition: 'all 0.2s',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
        gap: 8,
        opacity: isOptional && !isLoaded ? 0.75 : 1,
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.tsv,.txt"
        style={{ display: 'none' }}
        onChange={(e) => { if (e.target.files[0]) onFile(e.target.files[0]); }}
      />

      <div style={{ fontSize: 32 }}>{isLoaded ? 'âœ…' : fileType.icon}</div>

      <div style={{
        fontSize: 15, fontWeight: 700, color: isLoaded ? '#27ae60' : '#d4a847',
        fontFamily: "'Playfair Display', serif",
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        {fileType.label}
        {isOptional && (
          <span style={{
            fontSize: 9, fontWeight: 500, color: '#666',
            background: '#2a3040', padding: '2px 6px', borderRadius: 3,
          }}>
            OPTIONAL
          </span>
        )}
      </div>

      <div style={{ fontSize: 11, color: '#888', lineHeight: 1.4 }}>
        {fileType.description}
      </div>

      {isLoaded ? (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, color: '#27ae60', fontWeight: 600 }}>
            {file.name}
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
            {(file.size / 1024).toFixed(1)} KB — click to replace
          </div>
        </div>
      ) : (
        <div style={{
          marginTop: 8, fontSize: 11, color: '#666',
          padding: '6px 14px', border: '1px solid #2a3040', borderRadius: 6,
        }}>
          Drop CSV here or click to browse
        </div>
      )}

      <div style={{ fontSize: 10, color: '#555', fontStyle: 'italic', marginTop: 4 }}>
        {fileType.hint}
      </div>
    </div>
  );
}

export default function FileUploader({ onFilesReady, hasExisting }) {
  const [files, setFiles] = useState({ metadata: null, distances: null, schedule: null, similarities: null });
  const [error, setError] = useState(null);

  const handleFile = (key) => async (file) => {
    setError(null);
    const text = await file.text();
    setFiles(prev => ({ ...prev, [key]: { name: file.name, size: file.size, text } }));
  };

  const clearFile = (key) => {
    setFiles(prev => ({ ...prev, [key]: null }));
  };

  // Required files check
  const requiredReady = files.metadata && files.distances && files.schedule;

  const handleLoad = () => {
    if (!requiredReady) return;
    setError(null);
    try {
      onFilesReady({
        metadata: files.metadata.text,
        distances: files.distances.text,
        schedule: files.schedule.text,
        similarities: files.similarities?.text || null,
      });
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: 40,
    }}>
      <div style={{ maxWidth: 1200, width: '100%' }}>
        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{
            fontSize: 28, fontFamily: "'Playfair Display', serif",
            color: '#d4a847', marginBottom: 8,
          }}>
            Fall Activity Matrix — SR 2026
          </h1>
          <p style={{ fontSize: 14, color: '#888' }}>
            Upload your CSV files to load the schedule dashboard
          </p>
        </div>

        {/* Required files section */}
        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 11, color: '#888', textTransform: 'uppercase',
            letterSpacing: 1, marginBottom: 12, paddingLeft: 4,
          }}>
            Required Files
          </div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
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

        {/* Optional files section */}
        <div style={{ marginBottom: 32 }}>
          <div style={{
            fontSize: 11, color: '#666', textTransform: 'uppercase',
            letterSpacing: 1, marginBottom: 12, paddingLeft: 4,
          }}>
            Optional Files
          </div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {FILE_TYPES.filter(ft => !ft.required).map(ft => (
              <div key={ft.key} style={{ position: 'relative', flex: '1 1 280px', maxWidth: 320 }}>
                <DropZone
                  fileType={ft}
                  file={files[ft.key]}
                  onFile={handleFile(ft.key)}
                />
                {files[ft.key] && (
                  <button
                    onClick={(e) => { e.stopPropagation(); clearFile(ft.key); }}
                    style={{
                      position: 'absolute', top: 8, right: 8,
                      width: 24, height: 24, borderRadius: '50%',
                      border: '1px solid #dc262640', background: '#1a1010',
                      color: '#dc2626', fontSize: 14, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s',
                    }}
                    title="Remove file"
                  >
                    Ã—
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
          <button
            onClick={handleLoad}
            disabled={!requiredReady}
            style={{
              padding: '12px 36px', borderRadius: 8, border: 'none',
              background: requiredReady ? '#d4a847' : '#2a3040',
              color: requiredReady ? '#0f1219' : '#555',
              fontSize: 14, fontWeight: 700, cursor: requiredReady ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Load Dashboard
          </button>

          {hasExisting && (
            <button
              onClick={() => onFilesReady(null)}
              style={{
                padding: '12px 28px', borderRadius: 8,
                border: '1px solid #2a3040', background: 'transparent',
                color: '#888', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              Use Previously Loaded Data
            </button>
          )}
        </div>

        {/* Status summary */}
        <div style={{
          marginTop: 20, textAlign: 'center', fontSize: 11, color: '#666',
        }}>
          {requiredReady ? (
            <span style={{ color: '#27ae60' }}>
              âœ“ All required files loaded
              {files.similarities && <span style={{ color: '#22d3ee' }}> + similarities data</span>}
            </span>
          ) : (
            <span>
              {[
                !files.metadata && 'metadata',
                !files.distances && 'distances',
                !files.schedule && 'schedule',
              ].filter(Boolean).join(', ')} still needed
            </span>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            marginTop: 20, padding: '12px 20px', borderRadius: 8,
            background: '#3d1111', border: '1px solid #ef4444',
            color: '#f87171', fontSize: 12, textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        {/* File format hints */}
        <div style={{
          marginTop: 48, padding: 20, background: '#141924',
          borderRadius: 10, border: '1px solid #1e2636',
        }}>
          <h3 style={{
            fontSize: 13, color: '#d4a847', marginBottom: 10,
            fontFamily: "'Playfair Display', serif",
          }}>
            Notes on File Compatibility
          </h3>
          <div style={{ fontSize: 11, color: '#888', lineHeight: 1.6 }}>
            Activity names may vary between files (e.g., location info in parentheses,
            apostrophe variants, typos). The dashboard will automatically match names
            across files using fuzzy matching and flag any discrepancies for review.
            Data is saved in your browser and persists across reloads — no server needed.
          </div>
          <div style={{ fontSize: 11, color: '#666', lineHeight: 1.6, marginTop: 12, paddingTop: 12, borderTop: '1px solid #1e2636' }}>
            <strong style={{ color: '#22d3ee' }}>Similarities file:</strong> Used for the matrix auto-generation feature.
            Should contain activity names and their similarity groupings (e.g., "High Ropes" activities grouped together).
          </div>
        </div>
      </div>
    </div>
  );
}
