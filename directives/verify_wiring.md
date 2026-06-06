# Directive: Verify System Wiring

> **Purpose:** Confirm that the 3-layer architecture is set up correctly and all layers can communicate. Also covers the full dev environment setup for Topsheet AI.

## Goal

Run the example execution script and verify that:

1. The `.env` file is loading properly
2. Python can write to `.tmp/`
3. Log output is generated
4. An output JSON file is created

## Inputs

- None (self-contained smoke test)

## Execution

```bash
python3 execution/verify_wiring.py --verbose
```

## Expected Output

- Exit code: `0`
- File created: `.tmp/wiring_check.json`
- Log entries printed to stdout

## Edge Cases

- **Missing `.env`**: Script should warn and fall back to defaults
- **Missing `.tmp/`**: Script should create it automatically

---

## Full Dev Setup

### Basic (Frontend Only)

```bash
npm install
npm run dev
```

This starts the Vite dev server with hot reload. The app connects to the live Firebase project (Auth, Firestore) using credentials from `.env.local`. No local emulators required for basic frontend development.

**Verify it works:**
1. `npm run dev` starts without errors
2. Browser opens to `http://localhost:5173`
3. Google sign-in popup appears and completes
4. Project list loads from Firestore

### Full Dev with Cloud Functions

```bash
npm run dev:full
# or equivalently:
bash dev-full.sh
```

This starts both the Vite frontend AND the Firebase emulators (Auth, Firestore, Functions) so you can develop and test Cloud Functions locally. The frontend auto-connects to emulators when they're running.

**Verify it works:**
1. Firebase emulators start (check terminal output for emulator ports)
2. Vite dev server starts on its usual port
3. Console shows "Connected to Firebase Emulators" (not production)
4. Cloud Functions execute locally on trigger

---

## Firebase Config Requirements

### `.env.local` Variables

All Firebase config vars must be prefixed with `VITE_` (Vite convention — only `VITE_*` vars are exposed to the client bundle):

```env
VITE_GEMINI_API_KEY=your-gemini-api-key
VITE_FIREBASE_API_KEY=your-firebase-api-key
VITE_FIREBASE_AUTH_DOMAIN=topsheet-ai.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=topsheet-ai
VITE_FIREBASE_STORAGE_BUCKET=topsheet-ai.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
```

**Missing vars:** The app will fail silently or throw cryptic Firebase errors if any `VITE_FIREBASE_*` var is missing. Always verify all 6 Firebase vars are set before debugging auth or Firestore issues.

**Wrong project ID:** If `VITE_FIREBASE_PROJECT_ID` doesn't match the Firebase console project, writes will succeed but data won't appear where expected. Double-check this first when data seems to "disappear."

---

## Common Gotchas

### Firebase Double-Init During HMR

**Problem:** Vite's hot module replacement re-executes `firebase.ts` on save, calling `initializeApp()` again. Firebase throws `FirebaseError: Firebase: Firebase App named '[DEFAULT]' already exists`.

**Fix:** Guard initialization with `getApps().length`:

```typescript
import { initializeApp, getApps, getApp } from 'firebase/app';

const app = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApp();
```

This is already implemented in `src/lib/firebase.ts` — do not remove the guard. If you see double-init errors, check that no other file is calling `initializeApp()` directly.

### macOS Sandbox EPERM

**Problem:** Writing to `.tmp/` from Python inside VS Code's sandboxed terminal triggers `PermissionError: [Errno 1] Operation not permitted`.

**Fix:** The `verify_wiring.py` script falls back to `/tmp/lemon_budget_engine/` when EPERM is caught. This is a known VS Code sandbox issue on macOS — see the `macos_dev_env` KI for details.

**Workaround for new scripts:** Always wrap `.tmp/` writes in a try/except that falls back:

```python
import os

TMP_DIR = '.tmp'
try:
    os.makedirs(TMP_DIR, exist_ok=True)
    # test write
    test_path = os.path.join(TMP_DIR, '.write_test')
    with open(test_path, 'w') as f:
        f.write('ok')
    os.remove(test_path)
except PermissionError:
    TMP_DIR = '/tmp/lemon_budget_engine'
    os.makedirs(TMP_DIR, exist_ok=True)
```

### Zustand Persist Stale Cache

**Problem:** After changing Firestore data structure or store shape, localStorage still has the old shape. The app hydrates stale/incompatible state and behaves unpredictably.

**Fix:** Clear localStorage in the browser (`Application > Local Storage > Clear All`) or bump the store's `version` number in the `persist` config. `loadFromFirestore()` always overwrites on project open, but stale data can flash briefly or cause type errors before the Firestore load completes.

### Gemini Content Filter Blocks

**Problem:** Screenplay content (violence, drugs, mature themes) triggers Gemini's `PROHIBITED_CONTENT` safety filter, returning an empty response instead of the expected JSON breakdown.

**Fix:** Safety settings are set to `BLOCK_NONE` in the Gemini client config (`src/lib/ai/gemini-client.ts`). If you still get blocked responses, the content may exceed even `BLOCK_NONE` thresholds. Handle gracefully — show user a clear error message and suggest breaking the script into smaller scene batches.

### Port Already In Use

**Problem:** `npm run dev` silently picks the next available port (5174, 5175, etc.) when 5173 is occupied by a zombie Vite process or another app. You end up running on an unexpected port, or the user's browser tab points at a stale server.

**Fix:** Always check and free the port before launching:

```bash
# Check what's on port 5173
lsof -ti:5173

# Kill anything occupying it
lsof -ti:5173 | xargs kill -9 2>/dev/null

# Then start the dev server
npm run dev
```

**Rule:** Before every `npm run dev`, verify port 5173 is free. If you see `Port 5173 is in use, trying another one...` in the Vite output, stop and clean up the port first.

---

## Learnings

- **macOS Sandbox EPERM (2026-02-22)**: Writing to `.tmp/` from Python inside VS Code's sandboxed terminal triggers `PermissionError: [Errno 1] Operation not permitted`. The script now falls back to `/tmp/lemon_budget_engine/` when EPERM is caught. This is a known VS Code sandbox issue on macOS — see the `macos_dev_env` KI for details.
- **Port availability check (2026-06-05)**: Always check that port 5173 is free before running `npm run dev`. Stale Vite processes accumulate and silently push the server to higher ports. Use `lsof -ti:5173 | xargs kill -9` to clean up.
