# Quick Audit Report — Topsheet AI
**Date:** 2026-03-27
**Mode:** Quick (Phase 1 + Phase 4)
**Compared against:** [2026-03-27-audit.md](2026-03-27-audit.md) (full audit run earlier today)

---

## Score Comparison

| Metric | Full Audit | This Audit | Delta |
|--------|-----------|------------|-------|
| BudgetPage LOC | 1,196 | **477** | ✅ −719 |
| SchedulePage LOC | 1,179 | **645** | ✅ −534 |
| SettingsPage store imports | 10 | **1** | ✅ −9 |
| Series routes ErrorBoundary | ❌ None | ✅ Wrapped | Fixed |
| React.lazy routes | 0 | **16** | ✅ All routes |
| Main bundle (JS) | 4.1 MB | **45 KB** | ✅ −98% |
| Unit tests | 116 | **144** | ✅ +28 |
| E2E test suite | ❌ None | ✅ 3 specs | Added |
| data-testid attributes | 0 | **31** | Added |
| `any` types | 0 | 0 | ✅ Clean |
| Inline style ratio | 1:23.7 | 1:44.5 | ✅ Better |
| Raw hex color bypasses | 7 | 0 critical | ✅ Fixed |
| Component subdirectories | 1 (layout/) | **4** (budget/schedule/settings/layout/) | Organised |

---

## What Changed

### Component Architecture
- **budget/** — 5 new components extracted from BudgetPage (Topsheet, LineItemTable, BulkOperationsBar, EFICINEPanel, TierComparison)
- **schedule/** — 4 new components extracted from SchedulePage (DayGroup, SortableStrip, OverlayStrip, InlineInput, StripSynopsis) + shared `strip-colors.ts`
- **settings/** — 3 panels extracted from SettingsPage (AgentBrainsPanel, MPILearnerPanel, ResetDataPanel)
- **Total components:** 8 → **22** (same domain coverage, better organised)

### Remaining IMMEDIATELY Items
All 4 original IMMEDIATELY items are resolved.

### Remaining LATER Items
All 8 original LATER items are resolved.

---

## Still Open

### One Remaining God Component
- **BreakdownPage.tsx** (833 LOC): imports 7 stores — scene, breakdown, budget, project, settings, schedule, agent-brain. This is the last high-coupling page. It's a complex orchestration page (runs AI breakdown, manages scenes, displays elements, ties into the line producer panel) which legitimately touches many domains, but could be further decomposed into a `SceneViewer` + `BreakdownPanel` split.

### @tanstack/react-query Still Unused
- Present in vendor-ui chunk (adds to bundle weight). Either adopt for Firestore queries or remove.

### vendor-pdf Chunk Still 1.9 MB
- Contains both `pdfjs-dist` (PDF parsing) and `@react-pdf/renderer` (PDF generation). These could be split further since PDF export is rare and pdfjs is only used during upload. Both could be further lazy-loaded within the routes that need them, reducing the vendor-pdf chunk size on first visit.

### SOMEDAY Items Still Open
| # | Item | Status |
|---|------|--------|
| 13 | Prettier | Not done |
| 16 | CI/CD (GitHub Actions) | Not done |
| 17 | Remove @tanstack/react-query | Not done |
| 15 | Storybook | Not done |

---

## Engineering Posture

| Area | Status |
|------|--------|
| TypeScript strictness | ✅ 0 `any` types |
| Lint | ✅ 0 errors, 0 warnings |
| Unit tests | ✅ 144/144 passing |
| Build | ✅ Clean |
| Bundle (main) | ✅ 45 KB (was 4.1 MB) |
| Error boundaries | ✅ Film + Series routes covered |
| Code splitting | ✅ All 16 routes lazy |
| ARIA / a11y | ✅ Contrast fixed, landmarks added, aria-labels on icon buttons |
| Design system | ✅ No banned colors, no raw hex bypasses |
