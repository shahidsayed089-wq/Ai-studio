# SHAZAN AI — 15-day public launch plan

Target public launch: **4 August 2026 (Asia/Kolkata)**.

The repository is a production candidate for a Mock-provider beta. The following operational gates deliberately separate code-complete from publicly spending real provider balance.

| Day | Date | Release gate |
|---|---|---|
| 1 | 21 Jul | Deploy candidate to Pages preview; apply D1 migrations; run production health and Mock smoke test. |
| 2 | 22 Jul | Provision Workflow Queue + DLQ, deploy consumer, verify cron recovery and queue redelivery. |
| 3 | 23 Jul | Configure Google OAuth, Resend sender/domain and email verification/reset deliverability. |
| 4 | 24 Jul | Security review: CSRF, IDOR, upload signatures, rate limits, session revocation and admin boundaries. |
| 5 | 25 Jul | Load test registration, autosave, concurrent run submission, SSE reconnect and D1 contention. |
| 6 | 26 Jul | R2 lifecycle/retention policy, backup restore drill and project/share expiry checks. |
| 7 | 27 Jul | Reconcile provider price sheet to SHAZAN credits; keep every unverified live adapter disabled. |
| 8 | 28 Jul | Connect first staged live provider through queue consumer; verify submit/status/cancel/result normalization. |
| 9 | 29 Jul | Add purchase checkout only after signed webhook + idempotent credit grant staging tests pass. |
| 10 | 30 Jul | Abuse controls, per-user quotas, moderation/error disclosure and cost ceiling tests. |
| 11 | 31 Jul | Closed beta with 10–25 users; monitor failures, retries, costs, mobile UX and support issues. |
| 12 | 1 Aug | Fix beta findings; rerun complete unit, integration and Playwright suite. |
| 13 | 2 Aug | Production migration/backup rehearsal and rollback exercise; freeze schema and pricing. |
| 14 | 3 Aug | Final go/no-go: secrets, bindings, Queue, email, dashboards, alerts, legal pages and support channel. |
| 15 | 4 Aug | Public launch with Mock Provider plus only live providers that passed cost reconciliation; monitor continuously. |

## Non-negotiable go/no-go checks

- `npm run test:all` passes with zero failures.
- `/api/v1/health` is 200 in Production.
- D1 backup is restorable and R2 result download survives page refresh.
- One concurrent idempotency key creates one job and one reservation.
- Completion creates exactly one charge; permanent failure/cancel creates one refund.
- Admin and project IDOR tests return 403/404 as designed.
- Provider secrets never appear in HTML, JavaScript bundles, logs or API errors.
- No live provider is enabled before its endpoint, cancellation semantics and credit cost are verified in staging.
