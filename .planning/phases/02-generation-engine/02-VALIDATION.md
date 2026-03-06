---
phase: 2
slug: generation-engine
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-06
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (installed by Plan 00) |
| **Config file** | vitest.config.js |
| **Quick run command** | `npx vitest run src/__tests__/generationEngine.test.js` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | < 5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/__tests__/generationEngine.test.js`
- **After every plan wave:** Full manual check with sample CSV
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds (unit tests)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-00-01 | 00 | 1 | GEN-01, GEN-03 | automated | `npx vitest run` (exits 0) | vitest.config.js | ⬜ pending |
| 2-00-02 | 00 | 1 | GEN-01, GEN-03 | automated | `npx vitest run src/__tests__/generationEngine.test.js` | src/__tests__/generationEngine.test.js | ⬜ pending |
| 2-01-01 | 01 | 2 | GEN-01 | automated | `npx vitest run src/__tests__/generationEngine.test.js --reporter=verbose` | src/__tests__/generationEngine.test.js | ⬜ pending |
| 2-01-02 | 01 | 2 | GEN-03, GEN-05 | automated | `npx vitest run src/__tests__/generationEngine.test.js --reporter=verbose` | src/__tests__/generationEngine.test.js | ⬜ pending |
| 2-02-01 | 02 | 3 | GEN-01, GEN-02 | automated | grep for orchestrator wiring | N/A | ⬜ pending |
| 2-02-02 | 02 | 3 | GEN-02, GEN-04 | automated | grep for old state removal | N/A | ⬜ pending |
| 2-02-03 | 02 | 3 | All GEN | manual | Full end-to-end checkpoint | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Plan 00 satisfies all Wave 0 requirements:
- Installs vitest and creates vitest.config.js
- Creates src/__tests__/generationEngine.test.js with unit tests for filterBySeason (GEN-01) and partitionActivities (GEN-03)
- All tests are pure JS — no DOM, no React, no browser dependency
- Test run completes in < 5 seconds

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Season dropdown filters activity pool | GEN-01 | UI interaction required | 1. Select "Fall" season 2. Generate 3. Verify winter-only activities excluded |
| Valid Latin squares for each N | GEN-04 | Need visual inspection of matrix | 1. Generate 2. Check each rotation tab 3. Verify no row/column duplicates |
| Balanced value across rotations | GEN-03 | Requires comparing rotation stats | 1. Generate with N=2 2. Compare total value sums between rotations |
| Season format parsing | GEN-01 | CSV format edge cases | 1. Upload CSV with "Fall/Spring" and "All" entries 2. Verify correct filtering |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
