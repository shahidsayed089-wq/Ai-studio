# SHAZAN AI Workflow Studio

Production-oriented visual AI workflow application built on Next.js static export, Cloudflare Pages Advanced Mode, D1, R2 and an optional Cloudflare Queue consumer.

The public Studio has a verified **fal.ai live rollout** for Nano Banana 2, FLUX 2 Pro, Seedance 2.0 Standard and Seedance 2.0 Fast. The advanced canvas keeps the deterministic Mock Provider for workflow testing. Other paid adapters remain disabled until their exact endpoints, pricing and cancellation behavior pass staging.

## What works

- Visual drag/connect canvas for Text Prompt, Image Upload, Image Generator, Image-to-Video, Text-to-Video, Video Upscaler, Result Preview and Download/Export.
- Email/password and Google OAuth, HttpOnly D1 sessions, verification and password reset.
- User, creator and admin roles with protected `/studio` and `/admin` routes.
- Project CRUD, duplicate, auto-save with optimistic conflict detection, version restore and expiring read-only shares.
- Validated R2 uploads and durable generated assets.
- D1-persistent async jobs, SSE progress, cancel, retry, automatic exponential backoff and idempotency keys.
- Atomic 400-credit signup grant, server-side per-model estimates, reservation, exactly-once charge, permanent-failure refund and complete ledger.
- Admin metrics, user status/role, mandatory-reason credit adjustment, provider switches and audit logs.
- Webhook event deduplication and health endpoint.
- Server-enforced feature flags; disabled providers reject direct API calls even if a client is modified.
- D1 job lease locking, heartbeats, expired-lease recovery and durable attempt records.
- Global CSP/HSTS/security headers, request IDs and redacted structured error/slow-request logs.
- Current-device and all-device logout; verified `ADMIN_EMAIL` bootstrap without a hardcoded password.
- Live results are copied from trusted fal.ai result hosts into the authenticated user's private R2 path.

## Architecture

```text
Browser
  ├─ static UI ────────────────────────────── Cloudflare Pages
  └─ /api/* ─ Pages Advanced Mode Worker
                ├─ D1: users, sessions, projects, jobs, credits, audit
                ├─ R2: uploads and generated exports
                ├─ Queue producer (optional)
                └─ Provider adapter registry (secrets remain server-side)
                         │
                         └─ Cloudflare Queue consumer + cron fallback
```

`public/_worker.js` is copied to `out/_worker.js`. `public/workflow-api.js` contains the ownership-enforced API and D1 job state machine. `worker/queue-consumer.js` is the optional independent Queue consumer. Without the Queue binding, Mock jobs still persist in D1 and advance safely through status/SSE requests.

## Local development

Requires Node.js 22.13+.

```bash
npm ci
cp .dev.vars.example .dev.vars
npm run dev
```

Build and automated verification:

```bash
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm test` runs domain and Miniflare integration tests. The integration suite uses real D1/R2 emulation and verifies authentication, IDOR protection, version persistence, simultaneous-tab deduplication, credit reservation/charge/refund, duplicate webhook handling, admin authorization, cancel/retry and durable download. Playwright refreshes the page while the Mock job is processing and checks the charge occurs exactly once.

## Database

- `migrations/0001_auth.sql` — auth users, sessions and rate limits.
- `migrations/0002_workflow_studio.sql` — profiles, wallets, ledger, projects, versions, shares, assets, jobs, events, providers, webhooks, audits and atomic credit triggers.
- `migrations/0003_production_hardening.sql` — feature flags, Runway/MuAPI registry records, durable leases and job-attempt history.
- `migrations/0005_verified_fal_launch.sql` — enables the reviewed fal.ai provider and feature gate without changing existing user balances.

Apply locally:

```bash
npx wrangler d1 migrations apply ai-studio-wallet --local
```

Apply to production during a maintenance window:

```bash
npx wrangler d1 migrations apply ai-studio-wallet --remote
```

The Worker also uses idempotent runtime schema checks so a missing table produces a recoverable initialization instead of exposing provider keys or corrupting a wallet.

## Demo seed

The seed command creates one verified demo creator, one verified admin and a sample Prompt → Image → Video → Upscaler → Export project. Passwords are read from environment and never committed.

```bash
AUTH_PEPPER='same-as-target-environment' \
DEMO_USER_PASSWORD='strong-private-password' \
DEMO_ADMIN_PASSWORD='another-private-password' \
npm run seed:demo -- --remote
```

Optional emails: `DEMO_USER_EMAIL` and `DEMO_ADMIN_EMAIL`. Do not use published/default passwords in production.

## Cloudflare Pages deployment

Existing project settings:

- Production branch: `main`
- Build command: `npm run build`
- Output directory: `out`
- Node.js: `22`
- `DB` → D1 `ai-studio-wallet`
- `MEDIA` → R2 `ai-studio-media`

The production bindings live in `wrangler.jsonc`; dashboard controls can appear read-only because repository configuration is authoritative. Do not create a second `DB` binding.

Required encrypted secrets:

- `AUTH_PEPPER` — stable random 32+ character password pepper.
- `WEBHOOK_SECRET` — stable random 32+ character provider webhook secret.
- `ADMIN_EMAIL` — initial administrator email; admin role is granted only after that address is verified.

Authentication integrations:

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, optional `GOOGLE_REDIRECT_URI`.
- `RESEND_API_KEY`, `AUTH_EMAIL_FROM` for verification/reset delivery.
- `ALERT_WEBHOOK_URL`, optional `ALERT_WEBHOOK_TOKEN` for structured API-error and failed-job alerts.

Live provider configuration (server only):

- `FAL_KEY` — required for the verified live models; never expose it to the browser.
- `ENABLE_FAL=true` — production feature gate after the key is installed.
- `LIVE_DAILY_CREDIT_LIMIT=2000` — default global exposure cap (about $20 at 100 credits/USD).
- `LIVE_USER_DAILY_CREDIT_LIMIT=400` — default per-user daily cap.
- `KIE_API_KEY`, `OPENAI_API_KEY` remain optional and disabled for public generation.

Payments, community, Kie, OpenAI, Google AI, xAI, HeyGen, Runway and MuAPI remain code-level release-locked off. fal.ai is the only reviewed live provider in this release. Email/password users must verify their email before a paid request can start. Provider cancellation is intentionally unavailable until fal cancellation billing behavior passes staging; failed provider jobs are refunded automatically.

The legacy owner bridge remains locked by `STUDIO_ACCESS_CODE`. Public `/studio` generation uses the authenticated D1 job and wallet path; it never sends `FAL_KEY` to the browser.

Never use a `NEXT_PUBLIC_` name for these values and never paste secrets into browser code, GitHub, screenshots or client logs.

## Production verification commands

```bash
npm run verify:cloudflare
npm run test:production-smoke
npm run test:load
npm run scan:dependencies
npm run build && npm run scan:client-secrets
```

`test:production-smoke` requires two dedicated accounts through `PRODUCTION_SMOKE_USER_EMAIL`, `PRODUCTION_SMOKE_USER_PASSWORD`, `PRODUCTION_SMOKE_SECOND_EMAIL` and `PRODUCTION_SMOKE_SECOND_PASSWORD` to prove private R2 and cross-user isolation without creating unmanaged production accounts. `test:load` uses the primary account and `LOAD_JOB_ID` for authenticated/SSE routes.

## Optional Cloudflare Queue consumer

Create `shazan-workflow-jobs` and `shazan-workflow-jobs-dlq`, add a Pages producer binding named `WORKFLOW_QUEUE`, then deploy:

```bash
npx wrangler deploy --config wrangler.queue.jsonc
```

The consumer retries with delayed exponential backoff and a minute cron fallback. D1 is always the source of truth, so Queue delivery is at-least-once while charging remains exactly-once through unique ledger keys and database triggers.

## API overview

- `GET /api/v1/health`
- `GET /api/health` and `GET /api/health/ready`
- `GET /api/v1/features`
- `/api/auth/register`, `/login`, `/logout`, `/session`
- `POST /api/auth/logout-all`
- `/api/auth/verification/send`, `/verification/confirm`
- `/api/auth/password/forgot`, `/password/reset`
- `/api/auth/google/start`, `/google/callback`
- `/api/v1/projects/*`, `/versions/*`, `/share`
- `/api/v1/assets/*`
- `/api/v1/jobs/*`, `/events`, `/cancel`, `/retry`
- `/api/v1/credits`
- `/api/v1/admin/metrics`, `/users`, `/providers`, `/audit`
- `/api/v1/admin/features`
- `/api/v1/webhooks/:provider`

Every private project, job and asset query includes the authenticated owner ID. Mutations reject cross-site origins. Auth and generation paths are rate-limited, uploads are MIME/signature/size checked, filenames are sanitized and all provider secrets stay in Worker bindings.
