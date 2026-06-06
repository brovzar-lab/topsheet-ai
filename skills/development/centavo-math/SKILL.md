---
name: centavo-math
description: >
  Enforces integer-centavo arithmetic for all monetary values in Topsheet AI.
  Use whenever modifying budget calculations, adding new financial fields, changing
  how money is displayed, or working in src/lib/budget/. Triggers on: any code
  touching MXN amounts, budget line items, fringes, totals, cost calculations,
  or financial display formatting.
---

# Centavo Math

## The Rule (Non-Negotiable)

ALL monetary values are stored and calculated as **integers in centavos** (MXN × 100).

- `35,000 pesos = 3_500_000 centavos`
- Never use floating-point for money. Ever.
- Convert to pesos ONLY at the display layer (÷ 100)
- Use `Math.round()` on EVERY intermediate calculation to prevent float drift

## Why This Matters

Floating-point arithmetic produces rounding errors that compound across 388+ budget line items, 34 categories, fringes, contingency calculations, and subtotals. A single float leak can produce budget totals that are off by thousands of pesos — unacceptable for a professional budgeting tool.

## Patterns

**Correct:**

```typescript
const subtotal = Math.round(rate * quantity * weeks); // all in centavos
const withFringe = Math.round(subtotal * 1.35); // 35% IMSS fringe
const displayPesos = (centavos / 100).toLocaleString('es-MX', { minimumFractionDigits: 2 });
```

**Wrong:**

```typescript
const subtotal = rate * quantity * weeks; // missing Math.round
const pesos = subtotal / 100; // converting too early
const withFringe = pesos * 1.35; // calculating on float pesos
```

## Key Files

- `src/lib/budget/calculator.ts` — Core budget math
- `src/lib/budget/fringe-engine.ts` — Fringe/social cost calculations
- `src/lib/budget/auto-budget.ts` — Automated budget generation
- `src/lib/budget/mpi-learner.ts` — MPI rate learning
- `src/lib/budget/eficine.ts` — EFICINE tax incentive calculations
- `src/lib/budget/draft-manager.ts` — Budget draft versioning
- `src/stores/budget-store.ts` — Budget state management
- `src/lib/export/budget-excel.ts` — Excel export (must display pesos, not centavos)
- `src/lib/export/BudgetPDF.tsx` — PDF export (must display pesos, not centavos)

## Validation After Any Budget Change

```bash
npm test -- --grep budget
```

Existing test files: `auto-budget.test.ts`, `calculator.test.ts`, `draft-manager.test.ts`, `eficine.test.ts`, `fringe-engine.test.ts`

## Checklist

- [ ] All new monetary fields are typed as `number` (integer centavos)
- [ ] `Math.round()` wraps every multiplication/division
- [ ] No `/ 100` appears outside display/export code
- [ ] Budget tests pass: `npm test -- --grep budget`
- [ ] Excel/PDF exports show pesos, not centavos
