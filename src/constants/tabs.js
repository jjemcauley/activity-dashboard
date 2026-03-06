import { lazy } from 'react';

export const TABS = [
  { id: 'dashboard', label: 'Dashboard', accent: '#d4a847', component: lazy(() => import('../components/Dashboard')) },
  { id: 'editor', label: 'Live Editor', accent: '#22d3ee', component: lazy(() => import('../components/LiveEditor')) },
  { id: 'builder', label: 'Builder', accent: '#f97316', component: lazy(() => import('../components/Builder')) },
  { id: 'generator', label: 'Generator', accent: '#a78bfa', component: lazy(() => import('../components/Generator')), requiresSimilarities: true },
  { id: 'data', label: 'Data', accent: '#34d399', component: lazy(() => import('../components/DataView')) },
];
