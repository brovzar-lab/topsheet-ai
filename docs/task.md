# Lemon Budget Engine — Build Tasks

## Phase 1: Project Scaffold + Brand Shell

- [x] Initialize Vite + React + TypeScript project
- [x] Install all dependencies
- [x] Set up Tailwind CSS 4 with brand tokens
- [x] Create TypeScript type definitions
- [x] Create data files (element categories, budget categories, DOOD codes)
- [x] Create Zustand stores
- [x] Build app shell with routing and sidebar
- [x] Verify app runs with `npm run dev`

## Phase 2: PDF Upload + Screenplay Parser

- [x] Build PDF parser (pdfjs-dist)
- [x] Build screenplay parser (EN + ES, scene detection, page counts)
- [x] Build scene store (Zustand with persistence)
- [x] Build upload page with dropzone, parsing pipeline, and metadata form
- [x] Verify with real screenplay PDF

## Phase 3: AI Breakdown Engine

- [x] Gemini API client wrapper
- [x] Breakdown extraction prompt
- [x] Batch processor with progress
- [x] Breakdown page UI (scene browser + breakdown cards)

## Phase 4: Budget Calculator + Draft System

- [x] MPI seed data (55 items, real MXN rates)
- [x] Calculator engine (centavos, fringes, auto-budget)
- [x] Draft versioning (clone, compare)
- [x] Budget page UI (topsheet, line items, draft selector)m breakdown + MPI
- [x] Draft manager (create, clone, compare)
- [x] Budget page UI (topsheet + detail table + comparison)
- [x] Export to Excel button wired to exportBudgetExcel
- [x] MPI learner (upload budgets to expand pricing)

## Phase 5: Stripboard Scheduling

- [x] Schedule types (StripboardStrip, ShootDay, ScheduleDraft)
- [x] Schedule store (Zustand + persistence)
- [x] Auto-schedule engine (location grouping + bin-packing)
- [x] SchedulePage with @dnd-kit drag-and-drop stripboard
- [x] Route + sidebar nav link (CalendarDays icon between Breakdown/Budget)
