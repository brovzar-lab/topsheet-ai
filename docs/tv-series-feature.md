# TV Series Support — Feature Spec

> Approved 2026-03-17. Designs reviewed and signed off via visual companion.

---

## Overview

Feature Film is a single-project model: one screenplay → one breakdown → one schedule → one budget.

TV Series introduces a **series container** that holds N episode compartments. Each episode is its own screenplay → breakdown → schedule → budget unit. The series layer adds consolidated views on top: a series-level top-sheet budget (rollup), a master schedule across all episodes, and a shared series roster with per-episode overrides.

---

## User Flow (3 Screens)

### Screen 1 — Choose a Format (`/project/new`)

The existing New Project page becomes a **format selector** before the screenplay upload step.

| Option | Description |
|--------|-------------|
| **Feature Film** | Existing flow unchanged. Proceeds directly to screenplay upload. |
| **TV Series** | Proceeds to Series Configuration (Screen 2). |

The format selector uses the same page layout as the current `ProjectNewPage` — no modal, no overlay. The two format cards are the primary content of the page.

---

### Screen 2 — Series Configuration (`/project/new/series`)

A form page that collects series metadata before any episode is uploaded.

**Series Identity fields:**

| Field | Type | Notes |
|-------|------|-------|
| Series Title | Text input | Required |
| Season | Select | Season 1–N |
| Format | Select | Drama Series, Comedy Series, Limited Series, Anthology, Procedural, Docuseries |
| Production Location | Select | Same options as current project creation |
| Budget Tier | Select | Low / Mid / Premium — same as current |

**Series Structure fields:**

| Field | Type | Notes |
|-------|------|-------|
| Number of Episodes | Stepper + quick-select | Quick-select: 6, 8, 10, 13, 20. Free-form 1–100. |
| Episode Runtime | Preset buttons + free-form | Presets: 22 / 44 / 60 / 90 min. Custom input snaps to nearest budget template bracket with a visible hint. |

**Runtime → Template mapping:**

| Runtime range | Template used |
|--------------|---------------|
| ≤ 30 min | Half-hour comedy template |
| 31–52 min | One-hour drama template |
| 53–75 min | Premium one-hour template |
| 76+ min | Limited series / event template |

User can override the auto-selected template independently after creation.

**Pilot Designation:**

Episode 1 is auto-designated as the pilot (toggle, on by default). When enabled:
- Ep 01 renders with yellow accent band and ★ label throughout the app
- Budget template gets pilot-specific line items: extended prep days, pilot director deal, network delivery costs
- Schedule template adds extra prep weeks

CTA: **"Create Series & Episodes"** — creates the series document and N empty episode compartments, then navigates to Screen 3.

---

### Screen 3 — Series Dashboard (`/series/:seriesId`)

The main hub for a TV series. Replaces the per-project layout for series projects.

**Series header bar (always visible):**
- Series title, breadcrumb, series chips (Season, Format, Episode count, Runtime, Tier, Location, Pilot badge)
- "Edit Series" button — opens Series Configuration form in edit mode
- "+ Upload Episode" primary CTA

**Tab bar (series-level views):**

| Tab | Description |
|-----|-------------|
| **Episodes** | The episode compartment grid (default view) |
| **Series Budget** | Consolidated top-sheet. All episode budgets roll up here. Includes amortized cost pool. |
| **Master Schedule** | Cross-episode stripboard. All shoot days combined. Sortable by air order or production order. |
| **Series Roster** | Shared cast & crew list. Series regulars defined here, per-episode overrides available. |

**Progress strip:**
Shows Uploaded / Total Episodes / Awaiting, plus a linear progress bar.

**Episode compartment grid:**

Each episode is a card with:
- Episode number (air order label)
- Status badge: `Complete` / `In Progress` / `Awaiting`
- Episode title (populated after screenplay upload)
- Scene count, page count, estimated shoot days (populated after breakdown)
- Three progress dots: **Breakdown · Schedule · Budget**
- Footer actions (done cards): Breakdown | Schedule | Budget
- Upload CTA (empty cards): "↑ Upload Screenplay"

Episode card states:
- **Awaiting** — no screenplay uploaded; dashed upload CTA at bottom
- **In Progress** — screenplay uploaded, at least one of breakdown/schedule/budget incomplete
- **Complete** — all three dots filled

**Air Order vs Production Order toggle:**
Section header has Air Order / Prod Order buttons. Each episode has both an air number and a production number (set per-episode inside the episode view). The grid re-sorts by the selected order.

---

## Data Model

### Series document (`series/{seriesId}`)

```ts
interface Series {
  id: string
  userId: string
  title: string
  season: number
  format: SeriesFormat        // 'drama' | 'comedy' | 'limited' | 'anthology' | 'procedural' | 'docuseries'
  location: string
  tier: ProductionTier        // 'low' | 'mid' | 'premium'
  episodeCount: number
  runtimeMinutes: number
  runtimeTemplate: RuntimeTemplate  // 'half-hour' | 'one-hour' | 'premium-one-hour' | 'limited'
  runtimeTemplateOverride?: RuntimeTemplate
  pilotDesignated: boolean    // if true, ep 1 uses pilot budget/schedule templates
  airOrderCount: number       // tracks current air-order numbering
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

### Episode document (`series/{seriesId}/episodes/{episodeId}`)

```ts
interface Episode {
  id: string
  seriesId: string
  airNumber: number           // display order (Ep 01, Ep 02…)
  productionNumber: number    // shoot order (can differ from air order)
  isPilot: boolean
  title?: string              // populated after screenplay upload
  projectId?: string          // links to existing Project document after upload
  status: 'awaiting' | 'in_progress' | 'complete'
  breakdownComplete: boolean
  scheduleComplete: boolean
  budgetComplete: boolean
  sceneCount?: number
  pageCount?: number
  estimatedShootDays?: number
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

### Series Roster document (`series/{seriesId}/roster/{rosterId}`)

```ts
interface RosterEntry {
  id: string
  name: string
  role: string
  department: string
  isSeriesRegular: boolean
  episodeOverrides: {
    [episodeId: string]: {
      included: boolean       // false = not in this episode
      notes?: string
    }
  }
}
```

### Series Budget document (`series/{seriesId}/budget`)

```ts
interface SeriesBudget {
  id: string
  seriesId: string
  amortizedCosts: AmortizedCostLine[]   // standing sets, writers' room, series deals, etc.
  episodeAllocations: {
    [episodeId: string]: number         // manual allocation amount per episode
  }
  rollupTotal: number                   // sum of all episode budgets + amortized costs
  updatedAt: Timestamp
}

interface AmortizedCostLine {
  id: string
  category: string
  description: string
  totalCost: number
  allocatedAmounts: { [episodeId: string]: number }
}
```

---

## Routing

| Route | Component | Description |
|-------|-----------|-------------|
| `/project/new` | `ProjectNewPage` (updated) | Format selector — Film or TV Series |
| `/project/new/series` | `SeriesNewPage` | Series configuration form |
| `/series/:seriesId` | `SeriesDashboardPage` | Episode grid + series-level tabs |
| `/series/:seriesId/budget` | `SeriesBudgetPage` | Consolidated top-sheet + amortized costs |
| `/series/:seriesId/schedule` | `SeriesMasterSchedulePage` | Cross-episode stripboard |
| `/series/:seriesId/roster` | `SeriesRosterPage` | Series regulars + episode overrides |
| `/series/:seriesId/episode/:episodeId` | redirects to `/project/:projectId` | Episode-level breakdown/schedule/budget (reuses existing Project flow) |

---

## Store

New Zustand store: `series-store.ts`

```ts
interface SeriesStore {
  // State
  series: Series | null
  episodes: Episode[]
  loading: boolean
  error: string | null

  // Actions
  createSeries: (data: CreateSeriesInput) => Promise<string>   // returns seriesId
  loadSeries: (seriesId: string) => Promise<void>
  updateSeries: (seriesId: string, data: Partial<Series>) => Promise<void>
  loadEpisodes: (seriesId: string) => Promise<void>
  updateEpisode: (seriesId: string, episodeId: string, data: Partial<Episode>) => Promise<void>
  linkEpisodeToProject: (seriesId: string, episodeId: string, projectId: string) => Promise<void>
}
```

---

## TV-Specific Line Producer Considerations

These are pre-built into the pilot and episode budget templates:

### Pilot episode budget additions
- Extended prep period (4–6 weeks vs 2–3 for regular episodes)
- Pilot director deal (usually a flat fee, separate from per-episode director costs)
- Network/platform delivery line items
- Pilot-specific insurance and legal

### All episodes
- Pattern days (recurring crew days across episodes)
- Standing set maintenance (amortized via series budget, not per-episode)
- Day-out-of-days (DOODs) calculated per episode, cross-referenced in series roster
- Block shooting notation on master schedule (one director shooting multiple eps back-to-back)

### Series-level amortized costs (in Series Budget tab)
- Writers' room
- Showrunner deal
- Standing sets (build once, use all season)
- Series regular cast deals (weekly holds)
- Series-level E&O insurance
- Post production infrastructure (editing suites, color, mix)

---

## What Stays Unchanged

- The existing `Project` document schema is **not modified**
- Each episode, once a screenplay is uploaded, creates a normal `Project` document and uses all existing breakdown/schedule/budget flows without modification
- The series layer sits **on top of** existing project functionality — it does not replace or alter it
- Feature Film projects are completely unaffected

---

## Out of Scope (this feature)

- Multi-season management (Season 2+ can use the same flow with Season selector)
- Cross-series comparisons
- Episode-level PDF export (uses existing project export)
- Series Bible / Writer's Room tools
