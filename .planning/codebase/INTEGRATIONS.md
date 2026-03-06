# External Integrations

**Analysis Date:** 2026-03-06

## APIs & External Services

**None Currently Integrated**
- This is a client-side only application with no external API calls
- No backend services, microservices, or third-party APIs in use
- All data processing occurs in the browser

## Data Storage

**Databases:**
- None - Application uses browser localStorage only

**File Storage:**
- localStorage (Browser Web Storage API)
  - Prefix: `actdash_` for all keys
  - Persists CSV data: `actdash_csv_metadata`, `actdash_csv_schedule`
  - Persists parsed registry: `actdash_registry`
  - Persists location data: `actdash_data_startLocations`, `actdash_data_foodLocations`
  - Implementation: `src/utils/storage.js`

**Caching:**
- Browser localStorage serves as the cache layer
- In-memory React state for current session data
- No explicit caching layer or library

## Authentication & Identity

**Auth Provider:**
- None - No authentication system
- Application is public with no user login or access control
- No roles, permissions, or multi-user support

## Monitoring & Observability

**Error Tracking:**
- None configured
- Console warnings for localStorage failures (`console.warn()`)

**Logs:**
- Console logging only (minimal - warnings on storage failures)
- No log aggregation service

## CI/CD & Deployment

**Hosting:**
- Static hosting required (GitHub Pages, Vercel, Netlify, S3, etc.)
- Build output: `dist/` directory

**CI Pipeline:**
- None configured in project
- No GitHub Actions, GitLab CI, or deployment automation

**Build Output:**
- Vite builds single-page application to `dist/` folder
- All assets bundled and minified for production

## Environment Configuration

**Required env vars:**
- None - Application has zero environment variable dependencies
- Configuration done via `src/index.css` design tokens
- No secrets or credentials needed

**Secrets location:**
- Not applicable - No secrets in this project
- localStorage is unencrypted (browser local storage)

## File Input/Output

**Accepted File Formats:**
- CSV (Comma-Separated Values) - Primary format for metadata and schedule
- TSV (Tab-Separated Values) - Alternative delimiter support
- TXT (Plain text) - Generic text files with delimiters

**File Upload:**
- Component: `src/components/FileUploader.jsx`
- Required files:
  - `metadata` - Activity metadata (names, GPS, intensity, zones, staff requirements)
  - `schedule` - Activity rotations (groups × time slots × days)
- Optional files:
  - Similarity grouping data (embedded in metadata column or separate file)

**Data Export:**
- Blob + URL API for generating downloadable files
- Implementation: `src/components/Dashboard.jsx` (downloadCSV function)
- Formats: CSV export of edited schedules and data

## Webhooks & Callbacks

**Incoming:**
- None - No server endpoints or webhooks

**Outgoing:**
- None - No external service notifications

## Google Fonts Integration

**Fonts Loaded:**
- From: `https://fonts.googleapis.com/css2`
- Families:
  - DM Sans (weights: 400, 500, 600, 700) - Body text
  - Playfair Display (weights: 600, 700) - Display/headings
  - DM Mono (weights: 400, 500) - Monospace text
- Used in `index.html` via `<link>` tag

## Third-Party JavaScript (Global)

**None configured** - All dependencies are npm packages installed locally

---

*Integration audit: 2026-03-06*
