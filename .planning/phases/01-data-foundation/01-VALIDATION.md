---
phase: 1
slug: data-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (or manual verification — no test framework currently configured) |
| **Config file** | none — Wave 0 installs if needed |
| **Quick run command** | `npm run dev` + manual verification |
| **Full suite command** | `npm run dev` + manual verification |
| **Estimated runtime** | ~10 seconds (manual) |

---

## Sampling Rate

- **After every task commit:** Verify zone data flows from CSV to generator
- **After every plan wave:** Full manual check with sample CSV
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | CON-04 | manual | Dev server + CSV upload | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements — this is a surgical code change to Generator.jsx removing hard-coded ZONE_MAP and reading from registry metadata instead.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Zone data from CSV reflected in generator | CON-04 | No test framework configured; change is in UI component | 1. Upload metadata CSV with location column 2. Open Generator tab 3. Verify activities show zones from CSV, not hard-coded values |
| Changed zone assignments reflected | CON-04 | Requires CSV re-upload to verify | 1. Modify activity zone in CSV 2. Re-upload 3. Verify generator uses new zone |

*All phase behaviors require manual verification due to no existing test infrastructure.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
