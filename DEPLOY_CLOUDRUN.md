# Netlify → Google Cloud Run Migration
### ForestAI Platform · May 2026

---

## Overview

This document captures the full migration of the `forest-ai-platform` marketing site from Netlify to Google Cloud Run, including every obstacle encountered and how it was resolved.

**Project:** Astro v4 SSR app (React + Tailwind)
**From:** Netlify Functions adapter
**To:** Google Cloud Run (GCP) via Express server
**Live URL:** https://forest-ai-platform-121325752190.us-central1.run.app

---

## Starting Point

The project was an Astro 4 site configured for Netlify:

- Adapter: `@astrojs/netlify`
- API routes using AWS S3 (`upload.ts`, `getAnalysis.ts`, `debug.ts`)
- `netlify.toml` for build config
- `output: 'server'` (SSR mode, not static)

The demo page linked to `forestai-platform.web.app` — a **separate production platform** already on Firebase Hosting. This distinction matters (see Firebase incident below).

---

## Step 1 — New Branch & Dependency Swap

Created branch `cloudrun` and replaced the Netlify adapter:

```bash
git checkout -b cloudrun
npm uninstall @astrojs/netlify @aws-sdk/client-s3 @aws-sdk/credential-providers @aws-sdk/s3-request-presigner
npm install @astrojs/node --legacy-peer-deps
```

Also removed all three S3 API routes since they were no longer used in this codebase, and cleaned up `env.d.ts` and `astro.config.mjs`.

---

## Step 2 — First Adapter Version Was Wrong

### Problem
`@astrojs/node` installed the latest version (v8+), which requires `astro: '^4.2.0'`. Build failed:

```
SyntaxError: The requested module 'astro/config' does not provide an export named 'sessionDrivers'
```

### Fix
Pin to the version compatible with Astro 4.x:

| `@astrojs/node` version | Compatible with |
|---|---|
| v4.x | Astro 1.x |
| v5.x–v6.x | Astro 2.x–3.x |
| **v7.x** | **Astro 4.0+** |
| **v8.x** | **Astro 4.2+** |

```bash
npm install @astrojs/node@7.0.4 --legacy-peer-deps
```

Build passed. ✓

---

## Step 3 — Static Assets Not Loading (v7 Bug)

### Problem
Running the built server (`node ./dist/server/entry.mjs`) showed pages loading but with no CSS/styles. All `/_astro/*` asset requests returned 404.

### Root Cause
A bug in `@astrojs/node@7` standalone mode. In `standalone.js`, the `resolvePaths` function computes the client assets path relative to `import.meta.url` of the adapter package itself (inside `node_modules/@astrojs/node/dist/`), not relative to the actual dist output directory.

Result: server looked for CSS in `node_modules/@astrojs/node/client/` instead of `dist/client/`.

### Fix
Upgrade to v8, where this was rewritten correctly:

```bash
npm install @astrojs/node@8.3.4 --legacy-peer-deps
```

Rebuild and retest — all assets returned 200. ✓

---

## Step 4 — Firebase Hosting Incident ⚠️

### What happened
Attempted to use Firebase Hosting as a proxy to Cloud Run (to bypass an IAM policy issue — see Step 5). Created `firebase.json` pointing at the `forestai-platform` Firebase Hosting site and deployed.

**This accidentally overwrote the production app at `forestai-platform.web.app`.**

### Lesson
`forestai-platform.web.app` was the existing production platform used by real users. Firebase Hosting deploy with `firebase.json` pointing at a site ID replaces whatever is currently live at that site.

**Always create a new, separate Firebase Hosting site** for a new app:
```bash
firebase hosting:sites:create <new-site-name>
```

Then specify `"site": "<new-site-name>"` in `firebase.json`.

### Recovery
Roll back via Firebase Console:
`console.firebase.google.com/project/forestai-platform/hosting` → Release History → Rollback

---

## Step 5 — GCP Org IAM Policy Blocking Public Access

### Problem
After deploying to Cloud Run, the service returned:
```
Error: Forbidden — Your client does not have permission to get URL / from this server.
```

The standard fix — granting `allUsers` the `roles/run.invoker` role — was blocked:
```
FAILED_PRECONDITION: One or more users named in the policy do not belong to a permitted customer
```

The `forestai.us` Google Workspace org had the policy `iam.allowedPolicyMemberDomains` set to only allow users within the org's customer ID. This blocks adding `allUsers` to any IAM policy in the organization.

### Failed attempts
- `gcloud run services add-iam-policy-binding ... --member="allUsers"` → blocked by org policy
- `gcloud resource-manager org-policies set-policy` → `pyang@forestai.us` lacked `orgpolicy.policyAdmin`
- Firebase Hosting rewrite → Firebase also can't grant itself invoker access due to same org policy

### Discovery
By comparing the IAM annotations on the working `geosmart-ai` service vs `forest-ai-platform`:

```yaml
# geosmart-ai (working)
run.googleapis.com/invoker-iam-disabled: 'true'   ← KEY DIFFERENCE

# forest-ai-platform (broken)
# annotation missing
```

`invoker-iam-disabled: true` is a Cloud Run annotation that **completely bypasses IAM-based auth checks**, making the service public without needing `allUsers` in the IAM policy at all.

### Fix
```bash
gcloud run services update forest-ai-platform \
  --region us-central1 \
  --no-invoker-iam-check
```

Service immediately became publicly accessible. ✓

---

## Step 6 — Adopting the GeoSMART Pattern

Instead of `@astrojs/node` standalone mode, the proven pattern (from the working `geosmart-ai` deployment) uses:

1. **Middleware mode** — Astro exports a `handler` function instead of running its own server
2. **Express wrapper** — an `express` server handles static files and delegates SSR to the Astro handler
3. **Port 8080** — Cloud Run's default expected port

### `server.mjs`
```js
import express from 'express';
import { handler } from './dist/server/entry.mjs';

const app = express();
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || '0.0.0.0';

app.use(express.static('dist/client', { fallthrough: true, maxAge: '1h' }));
app.use(handler);

app.listen(port, host, () => {
  console.log(`Server listening on http://${host}:${port}`);
});
```

### `astro.config.mjs`
```js
adapter: node({ mode: 'middleware' })
```

### `package.json` scripts
```json
"build:gcp": "astro build",
"start:gcp": "node ./server.mjs"
```

### `Dockerfile`
```dockerfile
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build:gcp
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.mjs ./server.mjs
EXPOSE 8080
CMD ["npm", "run", "start:gcp"]
```

---

## Final Deploy Commands

```bash
# Deploy (builds via Dockerfile in Cloud Build)
gcloud run deploy forest-ai-platform \
  --source . \
  --region us-central1 \
  --set-env-vars FOREST_AI_REPLY_EMAIL=you@example.com

# Make public (one-time, bypasses org IAM domain policy)
gcloud run services update forest-ai-platform \
  --region us-central1 \
  --no-invoker-iam-check
```

---

## Lessons Learned

| # | Lesson |
|---|---|
| 1 | **Pin adapter versions to Astro compatibility.** `@astrojs/node` version must match your Astro major version. |
| 2 | **`@astrojs/node` standalone v7 has a static file path bug.** Use v8+ or the Express middleware pattern instead. |
| 3 | **Never deploy Firebase Hosting without specifying a `"site"` key.** Default deploy targets the project's primary site, which may be a live production app. |
| 4 | **GCP org IAM domain restriction blocks `allUsers`.** The fix is `--no-invoker-iam-check` (sets `invoker-iam-disabled: true` annotation) — no IAM binding needed. |
| 5 | **Study existing working deployments in the same project before troubleshooting.** `geosmart-ai` had the answer — comparing its annotations directly revealed the missing flag. |
| 6 | **Express middleware pattern is more reliable than standalone for Cloud Run.** Explicit static file serving via `express.static` avoids adapter-specific path resolution bugs. |
| 7 | **Cloud Run expects port 8080 by default.** Always set `ENV PORT=8080` and `ENV HOST=0.0.0.0` in the Dockerfile. |
