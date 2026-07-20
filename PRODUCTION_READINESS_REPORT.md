# SHAZAN AI Workflow Studio — Production Readiness Report

## Release identity

- Production URL: `https://ai-studio-1n1.pages.dev`
- Candidate commit: `73ce1c6dee6006734ca82f20eab0252d4a156540`
- Commit timestamp: `2026-07-20T19:40:50+05:30`
- First production verification of this Worker code: `2026-07-20T14:12:40Z` (`2026-07-20T19:42:40+05:30`)
- Exact Cloudflare deployment timestamp: **unavailable because this environment has no authenticated Cloudflare API access**
- Report evidence cutoff: `2026-07-20T14:16:37Z`
- Existing UI design: **unchanged**; `npm run test:ui-freeze` verified all 11 frozen visual source files.

## Honest verdict

**NOT PUBLIC BETA READY.**

The new Pages Worker/API build is live, the Mock-only local controlled-beta core is strong, and production readiness now fails closed instead of claiming a false success. Public launch is blocked by incomplete Cloudflare Queue/DLQ and migration proof, missing real Google OAuth/Resend/alerts, missing production R2 isolation proof, no backup/restore rehearsal, incomplete authenticated production load/smoke tests, two browser-only tests blocked by this execution environment, unresolved production dependency advisories, and missing verified legal/operator contact details.

## Production state observed from the public URL

`GET /api/health` returned HTTP 200 with `core_ready:true`. `GET /api/health/ready` returned HTTP 503 with:

```json
{
  "ready": false,
  "environment": "production",
  "core_ready": true,
  "launch_gates": {
    "cloudflare_queue": false,
    "google_oauth": false,
    "transactional_email": false,
    "operational_alerts": false,
    "paid_features_closed": true
  },
  "job_queue": "durable_d1_fallback",
  "asset_storage": true,
  "mock_provider": true,
  "authentication": true,
  "live_payments": "disabled"
}
```

This is intentional: liveness remains available while launch readiness returns 503 until every required integration is configured.

## Gate-by-gate result

| Gate | Result | Evidence |
|---|---|---|
| Actual Pages Worker/API production deployment | PASS | Public health response contains the new `environment`, `core_ready`, `launch_gates` and `error_alerts` fields from commit `73ce1c6`. |
| Production D1 migrations | BLOCKED | Runtime schema is operational, but remote migration ledger and `0004_public_beta_release_lock.sql` application could not be verified without `CLOUDFLARE_API_TOKEN`. |
| Cloudflare Queue and DLQ | FAIL | Public readiness says `cloudflare_queue:false`; queue consumer/config exists but Queue, DLQ, consumer deployment and Pages producer binding are not proven. |
| Production R2 lifecycle and isolation | SKIPPED | Local Miniflare R2 tests pass. Deployed smoke requires two dedicated production smoke accounts; credentials were not supplied. |
| Real Google OAuth | FAIL | Public readiness says `google_oauth:false`. Local test covers authorization redirect/state rejection only, not a real Google sign-in. |
| Production Resend verification/reset | FAIL | Public readiness says `transactional_email:false`. Local debug-token verification/reset passes; no real delivered email was tested. |
| Five legal routes | PARTIAL PASS | `/privacy`, `/terms`, `/acceptable-use`, `/dmca`, `/refund-policy` all return 200. Verified operator/legal/copyright contact and jurisdiction remain missing and are disclosed as a blocker on the pages. |
| Backup/restore rehearsal | BLOCKED | Not executed; Cloudflare authentication and a separate rehearsal D1 database are required. |
| Structured API/failed-job alerts | CODE PASS / CONFIG FAIL | Structured webhook delivery code is deployed; readiness says `operational_alerts:false`. No live alert delivery/receipt was tested. |
| Deployed public smoke | FAIL | 12 passed, 2 failed, 8 skipped. Details below. |
| Dependency and client-secret scans | FAIL / PASS | Client bundle: 115 files, 0 findings. npm audit: 4 vulnerabilities (1 moderate, 3 high), marked no fix available. |
| Basic load tests | FAIL | 25 public health requests had 0 errors, but authenticated login/projects/jobs/credits/assets/SSE were skipped. p95 was 8,813 ms. |
| No default production demo/admin password | PARTIAL | Source/seed script has no default password and requires explicit 12+ character values. Remote production account audit could not run without Cloudflare access. |
| Stripe/community/paid providers disabled | PASS | Code-level release lock overrides DB/admin/env attempts; migration also resets flags/providers. Public readiness confirms `paid_features_closed:true` and `live_payments:"disabled"`. |
| Mock results visibly labeled Demo | PASS | Successful Playwright result contains exact label `Demo Output — no paid AI model was called.` |

## Automated test results

### Passed

- UI freeze: 11/11 existing visual source files unchanged.
- ESLint: PASS.
- Next production build: PASS; 12 static pages generated.
- Node tests: **5 passed, 0 failed**.
- Playwright request/API tests: **17 passed, 0 failed**.
- Client bundle secret scan: **115 files scanned, 0 findings**.

The 17 separate Playwright request/API tests cover:

1. Registration/login/logout.
2. Google OAuth authorization redirect and state rejection (contract only; real production OAuth remains missing).
3. Password reset one-time token and session revocation (test email mode only).
4. Admin authorization after configured-email verification.
5. Cross-user project rejection.
6. Server-disabled provider rejection.
7. Expiring share links.
8. R2 upload/private download/deletion.
9. Cross-user R2 rejection.
10. Job cancellation/refund.
11. Job retry without double charge.
12. Two-tab idempotent credit concurrency.
13. Successful exact-once credit capture.
14. Permanent-failure refund.
15. Duplicate webhook handling.
16. Health/readiness response and security headers.
17. All legal routes.

### Failed, blocked or skipped

- Full Playwright run: 17 API tests passed; two browser-only tests did not execute because Chromium cannot open the required OS socket in this sandbox. A request for unsandboxed execution was rejected by environment policy. The affected tests are refresh-safe browser workflow/download and mobile navigation.
- Real Google OAuth: skipped; credentials and interactive Google account unavailable.
- Real Resend verification/reset: skipped; Resend production configuration unavailable.
- Production D1 migration verification: blocked; Wrangler reports no authentication.
- Queue/DLQ provisioning and consumer proof: blocked; Wrangler reports no authentication.
- Production R2 and cross-user isolation: skipped; two dedicated production smoke accounts unavailable.
- Backup/restore rehearsal: blocked; Cloudflare authentication unavailable.
- Alert delivery: skipped; `ALERT_WEBHOOK_URL` unavailable.
- Authenticated deployed smoke/load: skipped; dedicated credentials and `LOAD_JOB_ID` unavailable.
- Dependency vulnerability gate: failed due to four advisories with no installed-version fix.

## Deployed smoke-test results

Command timestamp: `2026-07-20T14:16:00.650Z`.

- Passed: **12**
- Failed: **2**
- Skipped: **8**

Passed: public liveness, core-ready payload, HSTS, CSP, request ID, all five legal pages, unauthenticated project rejection, unauthenticated admin rejection.

Failed: readiness HTTP status (503) and aggregate launch gates. Skipped: two production logins, project creation/isolation and R2 upload/download/isolation/deletion because dedicated smoke credentials were missing.

## Load-test results

Timestamp: `2026-07-20T14:16:27.526Z`.

- Target: `https://ai-studio-1n1.pages.dev`
- Public health requests: 25
- Concurrency: 5
- Errors: 0
- p50: 712 ms
- p95: 8,813 ms
- p99/max: 8,832 ms
- Missing required authenticated routes: login, projects, jobs, credits, assets, SSE
- Verdict: FAIL; both coverage and latency require investigation/retest from a stable network location.

## Dependency vulnerability scan

`npm audit --omit=dev --audit-level=high` reported:

- Playwright SSL browser-download authenticity advisory, high severity, no fix available in the installed dependency graph.
- Next-bundled PostCSS unescaped `</style>` advisory, moderate severity, no fix available in the installed dependency graph.
- Total reported by npm: **4 vulnerabilities (1 moderate, 3 high)**.

These findings remain a release blocker until versions/mitigations are reviewed and the production audit gate is green or formally risk-accepted by the operator.

## Backup/restore result

**Not performed.** No production backup file was created and no rehearsal database was mutated. The exact safe procedure is documented in `CLOUDFLARE_DEPLOYMENT.md`: export production, import into a separately named rehearsal D1 database, compare critical table counts and wallet invariants, record results, then remove the rehearsal database only after explicit approval.

## Missing production configuration / authority

- `CLOUDFLARE_API_TOKEN` with least-privilege D1/Queues/Workers/Pages access.
- Provisioned `shazan-workflow-jobs` and `shazan-workflow-jobs-dlq`.
- Deployed queue consumer and Pages `WORKFLOW_QUEUE` producer binding.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, authorized production redirect URI and a test Google account.
- `RESEND_API_KEY`, verified `AUTH_EMAIL_FROM` domain and two deliverable test inboxes.
- `ALERT_WEBHOOK_URL` (and token if required) plus a receiver where delivery can be observed.
- Two dedicated production smoke account credentials and a durable `LOAD_JOB_ID`.
- Verified operator name, governing jurisdiction, support/legal contact and DMCA agent contact.
- A CI/browser runner permitted to launch Chromium.
- Dependency versions or an approved, documented security mitigation/risk decision.

## Commands executed

The following release/audit commands were executed during this candidate pass (inspection-only `sed`/`rg` commands are included as a category after the evidence commands):

```bash
git status --short 2>/dev/null || true
rg -n "function uploadAsset|uploadAsset|share|webhook|cancel|retry|register|reset-password|verify-email|features|ADMIN_EMAIL" public tests scripts app -g '!out/**' -g '!node_modules/**'
rg --files | sort
node --check scripts/scan-client-secrets.mjs
node --check scripts/production-smoke.mjs
node --check scripts/load-test.mjs
node --check scripts/cloudflare-verify.mjs
node --check public/workflow-api.js
node --check public/_worker.js
node --check worker/queue-consumer.js
npm run lint
npm test
npm run build
npm run scan:client-secrets
npm run test:e2e
npx playwright install chromium
PLAYWRIGHT_BROWSERS_PATH=/workspace/scratch/a80b3c34fc4d/.playwright-browsers npx playwright install chromium
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/workspace/scratch/a80b3c34fc4d/.playwright-browsers/chromium-1187/chrome-linux/chrome npx playwright test tests/e2e/workflow.spec.ts tests/e2e/jobs.spec.ts --workers=1
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/workspace/scratch/a80b3c34fc4d/.playwright-browsers/chromium-1187/chrome-linux/chrome npm run test:all
rmdir /workspace/scratch/a80b3c34fc4d/.playwright-browsers/__dirlock
PLAYWRIGHT_BROWSERS_PATH=/workspace/scratch/a80b3c34fc4d/.playwright-browsers npx playwright install chromium-headless-shell
npx playwright test --grep-invert "account to durable|mobile navigation" --workers=4
npm run test:ui-freeze
npm run lint
npm test
npm run build
npm run scan:client-secrets
npm audit --omit=dev --audit-level=high
npm outdated || true
npm ls next @playwright/test playwright postcss --depth=3
curl -sS -D /tmp/shazan-headers.txt https://ai-studio-1n1.pages.dev/api/health/ready
curl -sS -o /dev/null -w 'privacy=%{http_code}\n' https://ai-studio-1n1.pages.dev/privacy
curl checks for /privacy, /terms, /acceptable-use, /dmca and /refund-policy
PRODUCTION_BASE_URL=https://ai-studio-1n1.pages.dev npm run test:production-smoke
PRODUCTION_BASE_URL=https://ai-studio-1n1.pages.dev LOAD_REQUESTS=25 LOAD_CONCURRENCY=5 npm run test:load
npm run verify:cloudflare
```

The unsandboxed `npm run test:all` request was rejected before execution. The headless-shell download was interrupted after it stalled. Wrangler verification reached `whoami`/remote migration listing and failed because no Cloudflare login or API token was available.

GitHub connector actions executed: searched the current `main` head, uploaded 27 blobs, created tree `b47579ead0adaf863acb203d5e13310d21b67b8b`, created commit `73ce1c6dee6006734ca82f20eab0252d4a156540`, and advanced `main` by fast-forward.

Inspection commands read `package.json`, Wrangler configs, migrations, Worker/API/queue code, test server, Playwright config, existing tests, authentication/email/OAuth handlers, README, deployment runbook and environment-variable example. No existing UI source file was edited.

## Required next evidence before launch

1. Authenticate Wrangler with a least-privilege token; apply/list production migrations and attach the output.
2. Create Queue/DLQ, deploy consumer, bind producer, then prove refresh/server-restart persistence.
3. Configure Google, Resend and alerts; complete their real external end-to-end tests.
4. Configure two smoke accounts; rerun deployed R2/project isolation and authenticated load/SSE tests.
5. Complete and record backup/restore counts and wallet invariants.
6. Run all 19 Playwright tests in CI with Chromium; require a green result.
7. Resolve or formally review the dependency advisories and rerun the vulnerability gate.
8. Publish verified operator/legal/DMCA contact details.

Only after all eight items pass may this report's verdict be changed to **Public Beta Ready**.
