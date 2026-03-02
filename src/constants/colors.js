export const INTENSITY_COLORS = {
  Minimal: '#a8d5ba',
  Mild: '#f9e79f',
  Moderate: '#f5b041',
  Intense: '#e74c3c',
};

export const INTENSITY_TEXT = {
  Minimal: '#1a4d2e',
  Mild: '#6e5c00',
  Moderate: '#6e3500',
  Intense: '#fff',
};

export const LOCATION_COLORS = {
  'Main Camp': '#4a90d9',
  'High Ropes': '#c0392b',
  Gwitmock: '#27ae60',
  'Gwitmock Path': '#2ecc71',
  Fieldhouse: '#8e44ad',
};

export const DAY_COLORS = {
  Monday: '#5b8def',
  Tuesday: '#d4a847',
  Wednesday: '#8b5cf6',
  Thursday: '#e74c3c',
  Friday: '#27ae60',
};

export function valueColor(v) {
  const t = (v ?? 0) / 100;
  return `rgb(${Math.round(220 - t * 180)},${Math.round(230 - t * 80)},${Math.round(220 - t * 150)})`;
}

export function valueTextColor(v) {
  return (v ?? 0) > 70 ? '#fff' : '#1a2a1a';
}
