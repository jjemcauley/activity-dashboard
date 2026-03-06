/**
 * colors.js — Consolidated color constants and helpers.
 *
 * Single source of truth for all color mappings used across components.
 * Components should import from here instead of defining local constants.
 */

// ── Intensity colors (badge backgrounds + text) ──

export const INTENSITY_COLORS = {
  Minimal: '#8dbfa3',
  Mild: '#e0cd80',
  Moderate: '#d9982e',
  Intense: '#c94040',
};

export const INTENSITY_TEXT = {
  Minimal: '#1a4d2e',
  Mild: '#6e5c00',
  Moderate: '#6e3500',
  Intense: '#fff',
};

export const INTENSITY_BADGE = {
  Intense:  { bg: '#dc262620', color: '#f87171', label: 'INT' },
  Moderate: { bg: '#f59e0b20', color: '#fbbf24', label: 'MOD' },
  Mild:     { bg: '#22c55e20', color: '#34d399', label: 'MLD' },
  Minimal:  { bg: '#6b728020', color: '#9ca3af', label: 'MIN' },
};

// ── Unique colors (badge backgrounds + text) ──

export const UNIQUE_COLORS = {
  Yes: '#2e86de',
  Mixed: '#d9982e',
  No: '#7f8c8d',
};

export const UNIQUE_TEXT = {
  Yes: '#fff',
  Mixed: '#fff',
  No: '#fff',
};

// ── Location colors ──

export const LOCATION_COLORS = {
  'Main Camp': '#4a90d9',
  'High Ropes': '#c0392b',
  Gwitmock: '#27ae60',
  'Gwitmock Path': '#2ecc71',
  Fieldhouse: '#8e44ad',
};

// ── Day colors ──

export const DAY_COLORS = {
  Monday: '#5b8def',
  Tuesday: '#d4a847',
  Wednesday: '#8b5cf6',
  Thursday: '#e74c3c',
  Friday: '#27ae60',
};

// ── Rotation colors ──

export const ROT_COLORS = { A: '#d4a847', B: '#22d3ee' };

// ── Accents for Builder ──

export const ACCENT = '#f97316';
export const ACCENT_DIM = '#f9731640';
export const ACCENT_FAINT = '#f9731615';

// ── Cycle editor colors ──

export const CYCLE_COLORS = [
  '#22d3ee', '#f472b6', '#a78bfa', '#34d399', '#fbbf24',
  '#fb923c', '#818cf8', '#f87171', '#2dd4bf', '#e879f9',
];

// ── Similarity group colors (for chips/badges) ──

export const SIMILARITY_COLORS = [
  '#f472b6', '#a78bfa', '#34d399', '#fbbf24', '#22d3ee',
  '#fb923c', '#818cf8', '#f87171', '#2dd4bf', '#e879f9',
];

// ── Cell group colors (Builder drag groups) ──

export const GROUP_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#ec4899',
  '#84cc16', '#f43f5e', '#6366f1', '#0ea5e9', '#a855f7',
];

// ── Generator value tier colors ──

export const VALUE_COLORS = [
  { min: 90, bg: '#064e3b', text: '#6ee7b7' },
  { min: 70, bg: '#1e3a2f', text: '#86efac' },
  { min: 50, bg: '#1a2332', text: '#93c5fd' },
  { min: 30, bg: '#27242e', text: '#d4c6ff' },
  { min: 0,  bg: '#1f1f24', text: '#c8c8d0' },
];

export function getCellColors(value) {
  for (const vc of VALUE_COLORS) {
    if (value >= vc.min) return vc;
  }
  return VALUE_COLORS[VALUE_COLORS.length - 1];
}

// ── Generator similarity group colors (named groups) ──

export const SIM_GROUP_COLORS = {
  'Courage / Arial': '#ef4444',
  'Precision': '#f97316',
  'Racquet': '#eab308',
  'Skateboards': '#22c55e',
  'Lesuire Sport': '#06b6d4',
  'Auxilary': '#8b5cf6',
};

export function getSimColor(group) {
  return SIM_GROUP_COLORS[group] || '#6b7280';
}

// ── Distance badge colors ──

export function getDistanceBadgeColors(dist) {
  if (dist > 600) return { color: '#f87171', bg: '#dc262630' };
  if (dist > 400) return { color: '#fbbf24', bg: '#d9770630' };
  if (dist > 200) return { color: '#d1d5db', bg: '#6b728030' };
  return { color: '#6ee7b7', bg: '#05966930' };
}

// ── Value gradient helpers ──

export function valueColor(v) {
  const t = (v ?? 0) / 100;
  // Dark backgrounds that vary by value — high value = richer green, low value = muted dark
  const r = Math.round(25 + (1 - t) * 15);
  const g = Math.round(35 + t * 40);
  const b = Math.round(30 + (1 - t) * 10);
  return `rgb(${r},${g},${b})`;
}

export function valueTextColor(v) {
  const t = (v ?? 0) / 100;
  // High value = bright white, low value = still readable light gray
  const base = 180 + Math.round(t * 65);
  return `rgb(${base},${base + 5},${base})`;
}
