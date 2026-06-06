---
name: firestore-sync-guard
description: >
  Guards the optimistic sync pattern between Zustand stores and Firestore in
  Topsheet AI. Use whenever modifying stores (src/stores/), Firestore CRUD
  operations (src/lib/firestore/), or the ProjectLoader component. Triggers on:
  new store creation, store field changes, Firestore write modifications,
  data loading flow changes, or auth-related data scoping.
---

# Firestore Sync Guard

## The Sync Pattern

Topsheet AI uses optimistic sync:

1. **Update local Zustand state immediately** (UI is instant)
2. **Fire-and-forget Firestore write** (`.catch(console.error)`)
3. Stores use `persist` middleware to cache in localStorage as fallback
4. On project open, `ProjectLoader` hydrates all stores from Firestore in parallel via `loadProjectData()`
5. **Firestore always wins** — `loadFromFirestore()` overwrites localStorage cache on project open

## Mandatory Rules

### 1. Every Firestore write MUST include `_updatedAt: serverTimestamp()`

This enables server-side ordering and conflict detection. Strip `_updatedAt` when reading back (destructure it out):

```typescript
// Writing
await setDoc(docRef, { ...data, _updatedAt: serverTimestamp() });

// Reading
const { _updatedAt, ...rest } = docSnap.data();
```

### 2. Never import stores from other stores

This causes circular dependency crashes at runtime. Use `src/lib/auth-state.ts` singleton for UID access across stores:

```typescript
// WRONG — circular dependency
import { useAuthStore } from './auth-store';

// CORRECT — singleton, no circular import
import { getAuthUid } from '@/lib/auth-state';
```

### 3. Every store MUST have:

- **`persist` middleware** with `partialize` (exclude large/sensitive fields from localStorage)
- **`loadFromFirestore(uid, ...)`** method — called on project/series open
- **`clearAll()`** method — called on sign-out to wipe local state
- **Optimistic local updates**, then async Firestore sync

### 4. Firestore data is scoped under `users/{uid}/`

- Security rule: `request.auth.uid == uid`
- All paths: `users/{uid}/projects/{projectId}/...`
- Never write to paths outside the authenticated user's scope

### 5. Use `strip-undefined.ts` utility

Firestore rejects `undefined` values with a runtime error. Always strip undefined fields before writing:

```typescript
import { stripUndefined } from '@/lib/firestore/strip-undefined';

await setDoc(docRef, stripUndefined({ ...data, _updatedAt: serverTimestamp() }));
```

## Firestore Collections

```
users/{uid}/
  projects/{projectId}
  projects/{projectId}/content          — large script text
  projects/{projectId}/scenes/{id}      — parsed scenes
  projects/{projectId}/breakdowns/{id}  — breakdown elements
  projects/{projectId}/schedules/{id}   — stripboard
  projects/{projectId}/budgetDrafts/{id} — budget header
  projects/{projectId}/budgetDrafts/{id}/lineItems/{id}
  series/{seriesId}
  series/{seriesId}/episodes/{id}
  series/{seriesId}/roster/{id}
```

## Key Files

- `src/stores/*.ts` — 12 Zustand stores (auth, project, breakdown, budget, chat, memory, mpi, scene, schedule, series, settings, agent-brain)
- `src/lib/firestore/*.ts` — 11 CRUD modules (breakdowns, budgets, index, memories, mpi, project-content, projects, scenes, schedules, series, strip-undefined)
- `src/lib/firebase.ts` — Firebase app init with offline persistence
- `src/lib/auth-state.ts` — UID singleton
- `src/components/ProjectLoader.tsx` — Hydration on project open
- `src/components/AuthGate.tsx` — Auth guard wrapper

## Fragile Areas

- **Firebase HMR double-init:** `initializeApp` can double-init during Vite hot reload. Guard with `getApps().length` check in `firebase.ts`
- **localStorage staleness:** If a user modifies data on another device, localStorage has stale data. `loadFromFirestore()` always wins on project open — never trust localStorage alone
- **Undefined values:** Firestore rejects `undefined`. Always use the `stripUndefined()` utility before writes

## Checklist

- [ ] New Firestore writes include `_updatedAt: serverTimestamp()`
- [ ] `_updatedAt` is stripped on reads
- [ ] No store-to-store imports (use `auth-state.ts` for UID)
- [ ] `persist` middleware uses `partialize`
- [ ] Store has `loadFromFirestore()` and `clearAll()`
- [ ] `stripUndefined()` used before Firestore writes
- [ ] Data scoped under `users/{uid}/`
