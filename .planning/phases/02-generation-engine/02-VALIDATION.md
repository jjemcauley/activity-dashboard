---
phase: 2
slug: generation-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual verification (no test framework configured) |
| **Config file** | none |
| **Quick run command** | `npm run dev` + manual verification |
| **Full suite command** | `npm run dev` + manual verification |
| **Estimated runtime** | ~15 seconds (manual) |

---

## Sampling Rate

- **After every task commit:** Verify generation produces valid output
- **After every plan wave:** Full manual check with sample CSV
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | GEN-01 | automated | grep for season filter logic | N/A | ⬜ pending |
| 2-01-02 | 01 | 1 | GEN-04, GEN-05 | automated | grep for generateRotation + scoreCandidate | N/A | ⬜ pending |
| 2-01-03 | 01 | 1 | GEN-02, GEN-03 | automated | grep for partition logic | N/A | ⬜ pending |
| 2-01-04 | 01 | 1 | GEN-02 | manual | Run generator, verify N=1..max tabs | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements — pure function changes to Generator.jsx with manual verification via dev server.*

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

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
