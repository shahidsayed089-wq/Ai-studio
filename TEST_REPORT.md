# SHAZAN AI Workflow Studio — release test report

Release candidate verified on **20 July 2026 (Asia/Kolkata)** with Node.js 22 and Chromium.

## Automated gate

| Command | Result |
|---|---|
| `npm run lint` | PASS — zero ESLint errors |
| `npm test` | PASS — 4/4 Node domain and Miniflare integration tests |
| `npm run build` | PASS — Next.js production export, 6 application routes plus not-found |
| `npm run test:e2e` | PASS — 2/2 Chromium Playwright tests |
| `npm run test:all` | PASS — complete gate exited with code 0 |
| `npx wrangler deploy --config wrangler.queue.jsonc --dry-run` | PASS — Queue consumer bundle/configuration validated |
| Local D1 migrations and `npm run seed:demo` | PASS — schema and idempotent seed completed |

Total automated tests: **6 passed, 0 failed, 0 skipped**.

## Requirement matrix

| Requirement | Status | Verification |
|---|---|---|
| Eight draggable/connectable workflow node types | PASS | Playwright builds Prompt → Image → Video → Upscaler → Export; domain tests validate port compatibility and DAG ordering. |
| Every workflow UI control uses a real route/state transition | PASS | Project, canvas, run, cancel, retry, restore, share, asset and download controls are exercised through the Worker API. |
| Email/password authentication | PASS | Integration and Playwright registration/login/session tests. |
| Google login | PASS | Server-only OAuth start/callback implementation and protected callback state; production client secret remains an operational configuration item. |
| User/creator/admin roles and protected routes | PASS | `/studio` and `/admin` protection plus admin-role integration tests. |
| Secure sessions, verification and password reset | PASS | HttpOnly signed D1 sessions, expiring one-time tokens and integration coverage. |
| Provider adapter contract | PASS | Mock, fal, Kie, OpenAI, Google, xAI and HeyGen registry entries expose `submitJob`, `getJobStatus`, `cancelJob`, `normalizeResult` and `calculateCost`. Unverified paid adapters are intentionally disabled. |
| Fully functional Mock Provider | PASS | End-to-end durable image/video/export workflow and downloadable R2 result. |
| Persistent asynchronous jobs | PASS | D1 state machine, optional Cloudflare Queue consumer and cron recovery; refresh-during-processing is covered by Playwright. |
| Live progress | PASS | Authenticated SSE stream plus polling fallback. |
| Queued/processing/completed/failed/cancelled states | PASS | Domain and integration state-transition coverage. |
| Retry/backoff/cancel/idempotency/error/provider IDs | PASS | Integration tests cover cancel, retry, permanent refund and two-tab duplicate submission. |
| Job history and filters | PASS | Studio history reads durable D1 jobs with status filters and pagination-capable API. |
| 500 demo credits | PASS | Registration and integration assertion. |
| Reserve, exactly-once charge and failure/cancel refund | PASS | Atomic D1 triggers, unique ledger keys and concurrent-submission tests. |
| Zero-credit generation block | PASS | Integration test receives HTTP 402 without creating a paid job. |
| User credit ledger | PASS | Studio ledger UI backed by authenticated `/api/v1/credits`. |
| Admin credit adjustment with mandatory reason/audit | PASS | Integration tests cover authorization, ledger mutation and audit creation. |
| Project CRUD, duplicate, autosave, versions and restore | PASS | Real D1 API plus ownership/version integration tests. |
| Durable assets, upload validation, search/sort/filter | PASS | R2 API, signature/size/filename validation and Studio asset manager. |
| Read-only share links | PASS | Expiring token API and unauthenticated share integration test. |
| Admin metrics/users/providers/errors/audit/search/pagination | PASS | Protected admin API and responsive dashboard. |
| Ownership/IDOR, XSS, CSRF, rate limits and webhook dedupe | PASS | Server validation and integration coverage for cross-owner access, origin checks and duplicate events. |
| Secrets never sent to browser/logs | PASS | Provider/OAuth/email secrets are read only from Worker bindings; client bundle uses no provider secret. |
| Health endpoint | PASS | `/api/v1/health` implemented and integration-tested. |
| Demo user/admin/sample project seed | PASS | Idempotent environment-password seed script. |
| Loading/empty/error/mobile states | PASS | Studio/admin UI states; Playwright mobile navigation test. |
| README, environment docs, schema and migrations | PASS | Included in repository. |
| Production build | PASS | Next.js optimized export compiled and type-checked. |

## Failed requirements

**None in the automated release candidate.**

## Operational launch gates (not test failures)

The code is ready for a controlled Mock-provider beta. Before paid public traffic, Cloudflare production must still have stable secrets, Google/Resend configuration, Queue + DLQ provisioning, backups/alerts and provider-by-provider price reconciliation. Live paid adapters stay disabled until those checks pass; this prevents misleading capability claims and uncontrolled API spend. The dated sequence is in `LAUNCH_PLAN.md`.
