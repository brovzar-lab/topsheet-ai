# Topsheet AI — Agent Instructions

> Mirrored across CLAUDE.md, AGENTS.md, and GEMINI.md.

## What This Is

Topsheet AI is a **film and TV production budgeting tool** — a React SPA where producers upload a screenplay PDF, get an AI-powered breakdown (characters, locations, props, etc.), build a shooting schedule on a stripboard, and generate budgets with line-item detail. It supports both feature films (single project) and TV series (multiple episodes with shared resources). Deployed to Firebase Hosting.

## Tech Stack

- **Frontend:** React 19, TypeScript 5.7, Vite 6, Tailwind CSS 4
- **State:** Zustand 5 (with `persist` middleware + localStorage)
- **Backend:** Firebase (Auth, Firestore, Hosting) — no custom server
- **AI:** Google Gemini 2.5 Flash via `@google/generative-ai`
- **Routing:** react-router-dom 7
- **Data fetching:** @tanstack/react-query 5
- **Tables:** @tanstack/react-table 8
- **Export:** exceljs (Excel), @react-pdf/renderer (PDF)
- **Charts:** recharts
- **Icons:** lucide-react (only — do not introduce other icon libs)
- **Drag-and-drop:** @dnd-kit
- **PDF parsing:** pdfjs-dist

## Directory Structure

```
src/
  main.tsx              # Entry point — BrowserRouter + QueryClientProvider + App
  App.tsx               # Route definitions + auth listener + keyboard shortcuts
  index.css             # Design system tokens (@theme) and base styles
  components/           # Shared components (AuthGate, Sidebar, ProjectLoader, panels)
    layout/             # Layout shells (Sidebar, ErrorBoundary)
  pages/                # Route-level page components (one per route)
  stores/               # Zustand stores — one per domain (auth, project, budget, etc.)
  types/                # TypeScript interfaces and type unions
  hooks/                # Custom React hooks
  lib/
    firebase.ts         # Firebase app init, auth, Firestore with offline persistence
    auth-state.ts       # Singleton UID module (avoids circular store imports)
    firestore/          # Firestore CRUD operations — one file per collection
    ai/                 # Gemini client, batch processor, prompt templates
    budget/             # Budget calculation engine, fringe engine, MPI learner, draft manager
    schedule/           # Schedule engine, DOOD matrix, conflict detector
    parsers/            # PDF and screenplay text parsers
    export/             # Excel and PDF export generators
  data/                 # Static reference data (budget categories, element categories, MPI)
  test/                 # Test setup (vitest + @testing-library/jest-dom)
brand/                  # Brand assets (logo PNGs, CSS tokens, style guide)
data/                   # Root-level reference data (MPI JSON, production knowledge)
docs/                   # Design docs, implementation plans, feature specs
directives/             # SOPs for agent-driven workflows
execution/              # Utility scripts (PDF parse tests, wiring verification)
public/                 # Static assets served at root (logos)
```

## Architecture

### Auth Flow
Firebase Google sign-in popup → `auth-store.ts` → `AuthGate` wrapper blocks all routes until authenticated → UID stored in singleton `auth-state.ts` (used by all stores without circular imports).

### Data Flow (Optimistic Sync)
All stores follow the same pattern:
1. **Update local Zustand state immediately** (UI is instant)
2. **Fire-and-forget Firestore write** (`.catch(console.error)`)
3. Stores use `persist` middleware to cache in localStorage as fallback
4. On project open, `ProjectLoader` hydrates all stores from Firestore in parallel via `loadProjectData()`

### Firestore Data Model
All data is scoped under `users/{uid}/`:
- `projects/{projectId}` — Film project metadata
- `projects/{projectId}/content` — Large script text (separate doc for fast project list)
- `projects/{projectId}/scenes/{sceneId}` — Parsed scenes
- `projects/{projectId}/breakdowns/{breakdownId}` — Scene breakdown elements
- `projects/{projectId}/schedules/{scheduleId}` — Stripboard schedule
- `projects/{projectId}/budgetDrafts/{draftId}` — Budget header
- `projects/{projectId}/budgetDrafts/{draftId}/lineItems/{lineId}` — Budget line items
- `series/{seriesId}` — TV series metadata
- `series/{seriesId}/episodes/{episodeId}` — Episode records
- `series/{seriesId}/roster/{entryId}` — Series cast/crew roster

Security rule: `request.auth.uid == uid` — users can only access their own data.

### Routing
```
/                           → HomeScreen (format selector: Film vs TV)
/project/new                → ProjectNewPage (PDF upload + AI analysis)
/project/:id                → ProjectPage (script viewer)
/project/:id/breakdown      → BreakdownPage
/project/:id/schedule       → SchedulePage (stripboard)
/project/:id/budget         → BudgetPage
/project/:id/doods          → DOODsPage (Day Out Of Days)
/project/:id/elements       → ElementsPage
/project/:id/calendar       → CalendarPage
/settings                   → SettingsPage
/series/new                 → SeriesNewPage
/series/:seriesId           → SeriesDashboardPage (episode grid)
/series/:seriesId/budget    → SeriesBudgetPage (rollup + amortized costs)
/series/:seriesId/schedule  → SeriesMasterSchedulePage
/series/:seriesId/roster    → SeriesRosterPage
/series/:seriesId/upload/:episodeId → EpisodeUploadPage
```

TV episodes link to film projects — each episode gets its own `projectId`, reusing the full film workflow.

### Path Alias
`@/` maps to `./src/` (configured in both `vite.config.ts` and `tsconfig.app.json`). Always use `@/` imports, never relative `../../`.

## Development

### Setup
```bash
npm install
npm run dev          # Vite dev server (hot reload)
```

### Environment Variables (`.env.local`)
All prefixed with `VITE_` (Vite convention):
- `VITE_GEMINI_API_KEY` — Google Gemini API key for AI breakdown/analysis
- `VITE_FIREBASE_API_KEY` — Firebase web API key
- `VITE_FIREBASE_AUTH_DOMAIN` — Firebase auth domain
- `VITE_FIREBASE_PROJECT_ID` — Firebase project ID (`topsheet-ai`)
- `VITE_FIREBASE_STORAGE_BUCKET` — Firebase storage bucket
- `VITE_FIREBASE_MESSAGING_SENDER_ID` — Firebase messaging sender ID
- `VITE_FIREBASE_APP_ID` — Firebase app ID

### Commands
- `npm run dev` — Start dev server
- `npm run build` — Production build to `dist/`
- `npm run preview` — Preview production build locally
- `npm test` — Run vitest (unit tests)
- `npm run test:watch` — Vitest in watch mode
- `npm run lint` — ESLint

### Deploy
Firebase Hosting — `dist/` is the public directory. SPA rewrites all routes to `/index.html`.

### Testing
Vitest with jsdom environment. Tests live next to source files (e.g., `calculator.test.ts` next to `calculator.ts`). Setup file: `src/test/setup.ts` (imports `@testing-library/jest-dom`).

## Code Conventions

### Money: Integer Centavos Only
**ALL monetary values are stored as integers in centavos (MXN × 100).** Never use floats for money. Convert to pesos ONLY at the display layer. `35000 pesos = 3_500_000 centavos`.

### Firestore Writes
Every Firestore write includes `_updatedAt: serverTimestamp()` for server-side ordering. The `_updatedAt` field is stripped when reading back (destructured out).

### Store Pattern
Each Zustand store:
- Uses `persist` middleware with `partialize` to exclude large/sensitive fields from localStorage
- Has a `loadFromFirestore(uid, ...)` method called on project/series open
- Has a `clearAll()` for sign-out cleanup
- Does optimistic local updates, then async Firestore sync

### Design System
Dark theme with custom tokens defined in `src/index.css` under `@theme`:
- **Backgrounds:** `lemon-bg-primary` (#2A2A2A), `lemon-bg-secondary` (#1A1A1A), `lemon-bg-tertiary` (#0F0F0F)
- **Accents:** `lemon-cyan` (#00E5C8), `lemon-yellow` (#FFFF00), `lemon-coral` (#FF6B6B)
- **Text:** `lemon-text-primary` (#F0F0F0), `lemon-text-body` (#C8C8C8), `lemon-text-muted` (#757575)
- **Fonts:** Display = Barlow Condensed, Body = Archivo, Mono = Space Mono
- **Utilities:** `.lemon-label`, `.lemon-highlight-cyan`, `.lemon-textured`, `.lemon-glow-cyan`

Headings are uppercase, tight letter-spacing, display font. Use `lucide-react` for all icons.

### Naming
- Pages: PascalCase (`BudgetPage.tsx`)
- Stores: kebab-case (`budget-store.ts`)
- Lib modules: kebab-case (`gemini-client.ts`)
- Types: PascalCase interfaces, string union types for enums
- IDs: `crypto.randomUUID()` for new records

### TypeScript
Strict mode enabled with `noUncheckedIndexedAccess`. No `any` types — use `unknown` and narrow.

## Product Rules

### Film ↔ TV Parity Rule (non-negotiable)

Before shipping any UI or workflow change, ask: **"Does this apply to both the Film side and the TV Episode side?"**

If yes, implement on **both** in the same session. Never leave one side behind.

- **Applies to both always:** upload screens, navigation elements (back buttons, breadcrumbs, settings), settings page, any global UI component, breakdown UI, schedule UI, page header patterns
- **Film-only:** feature film budget template, single-project schedule defaults
- **TV-only:** amortized costs, series roster, block shooting flags, episode count

When in doubt, consult `.agent/skills/line-producer.skill` to determine if a workflow concept is universal to production or TV-specific.

### Gemini AI Usage
- Model: `gemini-2.5-flash` with `responseMimeType: 'application/json'`
- Safety settings: `BLOCK_NONE` on all categories (screenplays contain violence/mature content)
- Use `thinkingConfig: { thinkingBudget: 0 }` for fast extraction tasks (prevents 30-90s thinking delays)
- Always handle content-filter blocks gracefully — some screenplay content triggers `PROHIBITED_CONTENT`
- Retry once on 429/500/503, then surface error to user

### Never Do
- Never store money as floats — integer centavos only
- Never import stores from other stores directly — use `auth-state.ts` singleton for UID
- Never use relative imports when `@/` works
- Never add icon libraries besides lucide-react
- Never bypass AuthGate — all routes require authentication
- Never write Firestore data without `_updatedAt: serverTimestamp()`

### Fragile Areas
- **Budget centavo math** — rounding errors compound fast. Always use `Math.round()` on intermediate calculations
- **Gemini JSON parsing** — LLM responses sometimes include markdown fences or unexpected structures. Always strip fences and handle both array and `{ elements: [...] }` shapes
- **Firebase hot-reload** — `initializeApp` can double-init during HMR. Guard with `getApps().length` check
- **Zustand persist + Firestore** — localStorage cache can go stale. `loadFromFirestore` always wins on project open
