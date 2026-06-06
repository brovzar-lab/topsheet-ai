---
name: tv-episode-flow
description: >
  Encodes the TV episode workflow architecture in Topsheet AI and tracks known
  issues. Use whenever working on series routes (/series/*), episode upload,
  episode breakdown/schedule/budget, or series-level aggregation (master schedule,
  rollup budget, roster). Triggers on: episode upload, series dashboard, TV budget,
  amortized costs, block shooting, series roster, episode workflow, or any work
  touching the Series ↔ Episode ↔ Project relationship.
---

# TV Episode Workflow

## Core Doctrine

A television episode is broken down using the **same methodology as a feature film**. The script breakdown process is identical. The difference is not in HOW you break the script; it is in HOW the budget is structured.

> **Do not simplify the breakdown methodology for TV.** Run the full breakdown workflow exactly as you would for a feature.

## Data Hierarchy

```
Series → Episodes[] → Project (per episode)
  → Scenes[]
  → BreakdownElements[] (per scene)
  → StripboardStrips[] → ShootDays[]
  → BudgetLineItems[] → BudgetDraft (versioned)
  → DOODs matrix (cast × shoot days)
```

- Each episode gets its own `projectId`, reusing the full film workflow
- Episode inherits `seriesTier`, `seriesLocation`, `episodeRuntime`, `format` from parent series
- Firestore paths: `/users/{uid}/series/{seriesId}/episodes/{episodeId}`
- Episode project: `/users/{uid}/projects/{projectId}` (linked via `episode.projectId`)

## The 5-Tab Episode Workflow

1. **Breakdown** — Identical to film. All 17 categories. Margo AI assistant.
2. **Schedule** — Same stripboard with TV-specific pages-per-day benchmarks:
   - Drama (45-55 min): 8-12 pages/day → 6-10 shooting days
   - Comedy (22-30 min): 10-14 pages/day → 4-6 shooting days
   - Block scheduling flag for multi-episode shoots
3. **Budget** — TV-specific cost types:
   - EPISODE COST — charged directly to this episode
   - AMORTIZED COST — fraction of season-level investment
   - SERIES-LEVEL COST — not in episode budget, only in series rollup
4. **DOODs** — Same matrix. Series regulars flagged separately from guest cast.
5. **Elements** — Identical to film.

## Known Issues (from docs/topsheet-tv-prompt.md)

### Problem 1: Redundant Upload Screen
When uploading a screenplay for an episode, the app currently redirects to `/project/new?seriesId=...&episodeId=...` which shows a full project setup screen asking for tier, location, and format AGAIN. These were already set at series creation.

**Correct flow:** PDF upload → parse → create project linked to episode → navigate directly to Breakdown tab. No metadata re-entry.

### Problem 2: Episode Workflow Not Fully Wired
The episode must expose the full 5-tab workflow identical to film, with TV budget layer differences.

### Problem 3: Navigation Persistence
Tab state must survive navigation. Active tab in URL params. Breadcrumb: `Series → Episode N: Title → Tab`.

## Series Dashboard Episode Card States

- **AWAITING** (gray, dashed border) — No screenplay uploaded
- **IN PROGRESS** (cyan accent) — Screenplay uploaded, shows progress dots (Break · Sched · Budget)
- **COMPLETE** (solid cyan band) — All three dots filled
- **PILOT** (yellow band, ★ prefix) — Episode 01 with pilot designation

## Key Files

- `src/pages/EpisodeUploadPage.tsx` — Episode screenplay upload
- `src/pages/SeriesDashboardPage.tsx` — Series overview with episode cards
- `src/pages/SeriesNewPage.tsx` — Series creation
- `src/pages/SeriesBudgetPage.tsx` — Series-level budget rollup
- `src/pages/SeriesEpisodeBudgetPage.tsx` — Per-episode budget
- `src/pages/SeriesMasterSchedulePage.tsx` — Cross-episode schedule
- `src/pages/SeriesRosterPage.tsx` — Series cast/crew roster
- `src/stores/series-store.ts` — Series state
- `src/lib/firestore/series.ts` — Series Firestore operations
- `src/types/series.ts` — Series TypeScript types
- `docs/topsheet-tv-prompt.md` — Full TV feature specification
- `docs/tv-series-feature.md` — Original TV series feature spec

## Reference

For the full detailed specification of the TV episode workflow and budget architecture, see `docs/topsheet-tv-prompt.md` (283 lines).
