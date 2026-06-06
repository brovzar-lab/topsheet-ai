# Directive: Deploy Topsheet AI

> **Purpose:** Build and deploy Topsheet AI to Firebase Hosting with a working Cloud Function proxy.

## Goal

Execute a complete production deployment: build the frontend, deploy Cloud Functions, deploy hosting, and verify everything works end-to-end.

## Pre-Deployment Checks

Run all three and confirm they pass before deploying:

```bash
npm run lint        # ESLint — must pass clean
npm test            # Vitest unit tests — must pass
npm run build       # Vite production build — must succeed, creates dist/
```

If any of these fail, fix the issue before proceeding. Do not deploy broken code.

## Deployment Steps

### Option A: Deploy Everything

```bash
npx firebase deploy
```

This deploys both hosting and Cloud Functions in one command.

### Option B: Deploy Separately (recommended for debugging)

**1. Build frontend:**
```bash
npm run build
```
Verify `dist/` directory exists and contains `index.html` + `assets/` folder.

**2. Deploy Cloud Functions:**
```bash
npm run deploy:functions
```
This runs: `cd functions && npm run build && npx firebase deploy --only functions`

**3. Deploy Hosting:**
```bash
npx firebase deploy --only hosting
```

## Post-Deployment Verification

1. **SPA loads:** Visit the live URL — the React app should render
2. **Routing works:** Navigate to `/settings`, `/project/new`, `/series/new` — all routes should load (SPA rewrite to `/index.html`)
3. **API proxy works:** Hit `/api/llm` — the Cloud Function `llmProxy` should respond (requires LiteLLM proxy server to be running)
4. **Static assets cached:** Check response headers for `/assets/**` — should have `Cache-Control: public, max-age=31536000, immutable`
5. **Firebase Console:** Verify function deployment status shows green in the Firebase Console

## Configuration

| Setting | Value |
|---------|-------|
| Firebase project | `topsheet-ai` (see `.firebaserc`) |
| Hosting directory | `dist/` |
| SPA rewrite | All routes → `/index.html` |
| API rewrite | `/api/llm` → Cloud Function `llmProxy` |
| Functions runtime | Node 22 |
| Functions SDK | firebase-functions@7.2.5 |

## CI/CD Status

- **CI:** GitHub Actions runs `tsc → lint → test → build` on push/PR to `main` and `feature/**` branches
- **CD:** Manual. No automated deployment pipeline exists yet.
- Future improvement: add a GitHub Actions deploy step triggered on merge to `main`

## Edge Cases & Learnings

- **Cloud Build IAM failures:** If Cloud Functions deployment fails with IAM permission errors, run `python3 execution/fix_cloudbuild_iam.py` to fix service account permissions.

- **LiteLLM proxy dependency:** The `/api/llm` Cloud Function proxies requests to a LiteLLM server. If the LiteLLM server is down, AI features will fail gracefully (the app falls back to the direct Gemini API key from Settings if configured).

- **Functions dependencies:** If `functions/node_modules` doesn't exist, install before deploying:
  ```bash
  cd functions && npm install && cd ..
  ```

- **Vite build environment:** The build reads `.env.local` for `VITE_*` environment variables. Ensure all Firebase config vars are present:
  - `VITE_FIREBASE_API_KEY`
  - `VITE_FIREBASE_AUTH_DOMAIN`
  - `VITE_FIREBASE_PROJECT_ID`
  - `VITE_FIREBASE_STORAGE_BUCKET`
  - `VITE_FIREBASE_MESSAGING_SENDER_ID`
  - `VITE_FIREBASE_APP_ID`
  - `VITE_GEMINI_API_KEY` (optional — can be set in Settings UI instead)
