# Cloudflare production runbook

## Pages project

- Project: `ai-studio-1n1`
- Branch: `main`
- Build: `npm run build`
- Output: `out`
- Node: `22`

`wrangler.jsonc` owns the production bindings:

- `DB` → `ai-studio-wallet`
- `MEDIA` → `ai-studio-media`

If the dashboard says a binding name already exists, do not add another one. Commit the binding in `wrangler.jsonc` and redeploy.

## Release order

1. Back up D1.
2. Run `npm ci && npm run lint && npm test && npm run build && npm run test:e2e`.
3. Apply `0001_auth.sql` and `0002_workflow_studio.sql` remotely.
4. Verify Production secrets and bindings.
5. Merge/push `main`; wait for Cloudflare Pages deployment success.
6. Check `/api/v1/health`, register a staging account and execute one Mock workflow.
7. Confirm available/reserved/spent balances and exactly one `charge` ledger entry.
8. Verify protected `/studio` and `/admin`, share link, R2 download and mobile navigation.
9. Enable live providers one at a time only after staging cost reconciliation.

## Required production secrets

- `AUTH_PEPPER` (32+ characters, stable)
- `WEBHOOK_SECRET` (32+ characters, stable)

Optional integrations:

- Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- Email: `RESEND_API_KEY`, `AUTH_EMAIL_FROM`
- Providers: `FAL_KEY`, `KIE_API_KEY`, `OPENAI_API_KEY`
- Legacy owner route only: `STUDIO_ACCESS_CODE`; keep `STUDIO_ALLOW_PUBLIC=false`

Cloudflare variable names must use underscores exactly. Names such as `Fal ai`, `Open ai key` or `Kie.com` are not read by the Worker.

## Migrations

```bash
npx wrangler d1 migrations apply ai-studio-wallet --remote
```

Both migrations are idempotent. Do not manually edit balances: use the admin credit adjustment endpoint/dashboard so the mandatory reason and audit log remain intact.

## Queue consumer

Mock execution has a D1/SSE fallback. For true background delivery, create:

- Queue `shazan-workflow-jobs`
- Dead-letter queue `shazan-workflow-jobs-dlq`
- Pages producer binding `WORKFLOW_QUEUE`

Then deploy the independent consumer:

```bash
npx wrangler deploy --config wrangler.queue.jsonc
```

Its cron runs every minute as a recovery sweep. Queue redelivery cannot double-charge because D1 state transitions and ledger event keys are atomic and unique.

## Rollback

- Roll back Pages to the previous successful deployment.
- Disable live providers in `/admin`; Mock Provider stays enabled.
- Do not delete D1/R2 data during rollback.
- Inspect `/admin` recent errors and audit logs before retrying.
