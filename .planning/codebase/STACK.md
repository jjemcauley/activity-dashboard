# Technology Stack

**Analysis Date:** 2026-03-06

## Languages

**Primary:**
- JavaScript/JSX - React components and utilities
- CSS - Tailwind CSS styling with custom design tokens

## Runtime

**Environment:**
- Node.js (version not pinned in project)

**Package Manager:**
- npm - Manages dependencies
- Lockfile: `package-lock.json` present (lockfileVersion 3)

## Frameworks

**Core:**
- React 18.2.0 - UI framework for building interactive components
- React DOM 18.2.0 - React rendering for browser

**Styling:**
- Tailwind CSS 4.2.1 - Utility-first CSS framework
- @tailwindcss/vite 4.2.1 - Vite integration for Tailwind processing

**Build/Dev:**
- Vite 5.1.0 - Modern frontend build tool and dev server
- @vitejs/plugin-react 4.2.1 - Vite plugin for React with Fast Refresh

## Key Dependencies

**Critical:**
- papaparse 5.4.1 - CSV parsing library for processing metadata and schedule files
  - Used in `src/utils/parsers.js` for parseMetadata() and parseSchedule()
  - Handles various CSV formats (TSV, TXT variants)

**Build Chain:**
- @babel/* - Babel transpilation toolchain (via Vite transitive dependencies)
- esbuild - JavaScript bundler (included in Vite)
- postcss - CSS processing (Tailwind dependency)
- lightningcss - CSS parser (Tailwind v4 component)

## Configuration

**Environment:**
- No environment variables configured in project
- Client-side only (no backend required)
- Data persisted in browser localStorage (no server API needed)

**Build:**
- `vite.config.js` - Vite configuration with React and Tailwind plugins
- `eslint.config.js` - ESLint configuration for code linting
- No TypeScript configuration (pure JavaScript/JSX)

**Development:**
- Tailwind CSS design tokens defined in `src/index.css` with @theme block
- Custom color palette: base colors (900-100), text tiers, accents, semantic colors, intensity levels

## Platform Requirements

**Development:**
- Node.js (any recent version)
- npm or compatible package manager
- Modern browser with ES2020+ support and localStorage API

**Production:**
- Static hosting (GitHub Pages, Vercel, Netlify, S3, etc.)
- Modern browser with localStorage support
- No server/backend required
- Client-side only application

## Package Scripts

**Development:**
- `npm run dev` - Start Vite dev server with hot module replacement
- `npm run build` - Build optimized production bundle to `dist/`
- `npm run preview` - Preview production build locally

## Browser APIs Used

**Required:**
- localStorage - Persisting CSV data, application state, and location preferences
- Blob API - File handling and data export functionality
- URL API - Object URL creation for file downloads (`URL.createObjectURL()`)
- File API - File upload handling in FileUploader component

---

*Stack analysis: 2026-03-06*
