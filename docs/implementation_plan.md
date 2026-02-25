# Lemon Budget Engine — Implementation Plan

## Goal

Build the Lemon Budget Engine: a React web app that takes screenplay PDFs and produces real MXN budgets using AI-powered breakdowns and a Master Price Index with 388 line items.

---

## Proposed Changes

### Phase 1: Project Scaffold + Brand Shell ✅

Set up the Vite+React+TypeScript project with brand identity, routing, and Firebase config.

- `package.json` + `vite.config.ts` — Vite 7 + React 19 + all deps
- `src/index.css` — Tailwind v4 @theme with Editorial Punk tokens
- `src/App.tsx` — React Router with 6 routes
- `src/components/layout/Sidebar.tsx` — Brand sidebar with cyan active states
- `src/types/` — 8 type files (project, scene, element, character, budget, mpi, schedule)
- `src/data/` — Element categories (17), budget categories (34), DOOD codes
- `src/stores/` — 4 Zustand stores with localStorage persistence

---

### Phase 2: PDF Upload + Screenplay Parser

- `src/lib/parsers/pdf-parser.ts` — PDF text extraction (pdfjs-dist)
- `src/lib/parsers/screenplay-parser.ts` — EN + ES scene detection, slugline parsing, 1/8th page counts
- `src/pages/ProjectNewPage.tsx` — Upload dropzone + metadata form + progress bar

---

### Phase 3: AI Breakdown Engine

- `src/lib/ai/gemini-client.ts` — Gemini API wrapper
- `src/lib/ai/prompts/breakdown.ts` — Scene element extraction prompt
- `src/lib/ai/batch-processor.ts` — Chunked processing (5-10 scenes/call)
- `src/pages/BreakdownPage.tsx` — Scene browser + breakdown cards + element editor

---

### Phase 4: Budget Calculator + Draft System

- `src/lib/budget/calculator.ts` — Integer centavo arithmetic
- `src/lib/budget/fringe-engine.ts` — IMSS 35%, ANDA 13%, OT 5-8%
- `src/lib/budget/auto-budget.ts` — MPI rates × breakdown = first-pass budget
- `src/lib/budget/draft-manager.ts` — Immutable draft snapshots
- `src/lib/budget/mpi-learner.ts` — Upload budgets to expand MPI knowledge
- `src/pages/BudgetPage.tsx` — Topsheet + line-item table + draft comparison

---

## Verification Plan

### Automated Tests

```bash
npm run build          # TypeScript compilation — zero errors
npm run lint           # ESLint — zero warnings
npm run test:run       # Vitest unit tests
```

### Manual Verification

1. Upload a real screenplay PDF → verify scene list
2. Run AI breakdown → verify elements extracted correctly
3. Generate budget → verify MPI rates, fringes, totals
4. Save/compare drafts → verify immutability and diff view
5. Visual check → Editorial Punk brand throughout
