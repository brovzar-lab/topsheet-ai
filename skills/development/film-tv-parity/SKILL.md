---
name: film-tv-parity
description: >
  Enforces the Film ↔ TV Parity Rule in Topsheet AI. This is a NON-NEGOTIABLE
  product rule: before shipping any UI or workflow change, ask "Does this apply
  to both the Film side and the TV Episode side?" If yes, implement on BOTH in
  the same session. Use whenever modifying pages, components, stores, or workflows
  that could affect both film projects and TV series episodes. Triggers on: any
  UI change, new component, page modification, navigation change, workflow update,
  or feature addition.
---

# Film ↔ TV Parity Rule

> **Non-negotiable:** Before shipping any UI or workflow change, ask: *"Does this apply to both the Film side and the TV Episode side?"* If yes, implement on **BOTH** in the same session. Never leave one side behind.

## The Architecture

TV episodes link to film projects — each episode gets its own `projectId`, reusing the full film workflow. This means most features apply to both sides.

### Route Pairs

These routes are Film ↔ TV parallels. Changes to one often require changes to the other:

| Film Route | TV Route | Shared? |
|---|---|---|
| `/project/new` (ProjectNewPage) | `/series/:id/upload/:epId` (EpisodeUploadPage) | Upload + parse flow |
| `/project/:id` (ProjectPage) | `/series/:id` (SeriesDashboardPage) | Project overview |
| `/project/:id/breakdown` (BreakdownPage) | Same (via episode projectId) | Identical |
| `/project/:id/schedule` (SchedulePage) | `/series/:id/schedule` (SeriesMasterSchedulePage) | Schedule views |
| `/project/:id/budget` (BudgetPage) | `/series/:id/budget` (SeriesBudgetPage) | Budget views |
| `/project/:id/doods` (DOODsPage) | Same (via episode projectId) | Identical |
| `/project/:id/elements` (ElementsPage) | Same (via episode projectId) | Identical |
| `/project/:id/calendar` (CalendarPage) | Same (via episode projectId) | Identical |
| — | `/series/:id/roster` (SeriesRosterPage) | TV-only |
| — | `/series/new` (SeriesNewPage) | TV-only |

### Scope Classification

**Always applies to BOTH (implement together):**
- Upload screens and screenplay parsing
- Navigation elements (back buttons, breadcrumbs, settings links)
- Settings page (global)
- Any global UI component (sidebar, error boundary, loading states)
- Breakdown UI and logic
- Schedule UI (stripboard, strips, day groups)
- Budget display components (line item table, topsheet, tier comparison)
- DOOD matrix display
- Elements list display
- Export functionality (Excel, PDF)
- AI agent integration (Margo, Rafa)
- Page header patterns and layout shells

**Film-only:**
- Feature film budget template defaults
- Single-project schedule defaults (pages-per-day for features)

**TV-only:**
- Amortized costs / cost type flags (EPISODE / AMORTIZED / SERIES-LEVEL)
- Series roster management
- Block shooting flags
- Episode count and runtime inheritance
- Series-level budget rollup
- Master schedule (cross-episode view)
- Series Dashboard episode card states

### How to Check

1. Before implementing: identify if the change is Film-only, TV-only, or universal
2. If universal: implement on both Film and TV in the same session
3. After implementing: visually verify both `/project/:id/*` and `/series/:id/*` routes
4. When in doubt: check `skills/creative/line-producer/SKILL.md` for whether the production concept is universal

### Checklist
- [ ] Classified change as Film-only, TV-only, or Universal
- [ ] If Universal: implemented on both sides
- [ ] Verified Film routes work correctly
- [ ] Verified TV routes work correctly
- [ ] Navigation (breadcrumbs, back buttons) works on both sides
- [ ] No hardcoded "project" vs "series" assumptions in shared components
