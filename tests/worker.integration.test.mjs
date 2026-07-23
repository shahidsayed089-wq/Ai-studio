import test from "node:test";
import assert from "node:assert/strict";
import { Miniflare } from "miniflare";

const ORIGIN = "http://shazan.test";
const PASSWORD = "StrongPass!2026";

const workflow = {
  nodes: [
    { id: "prompt", type: "text_prompt", position: { x: 0, y: 0 }, data: { prompt: "A cinematic city" } },
    { id: "image", type: "image_generator", position: { x: 250, y: 0 }, data: { model: "mock" } },
    { id: "video", type: "image_to_video", position: { x: 500, y: 0 }, data: { model: "mock" } },
    { id: "upscale", type: "video_upscaler", position: { x: 750, y: 0 }, data: { scale: 2 } },
    { id: "export", type: "download_export", position: { x: 1000, y: 0 }, data: { format: "json" } },
  ],
  edges: [
    { id: "e1", source: "prompt", target: "image", kind: "text" },
    { id: "e2", source: "image", target: "video", kind: "image" },
    { id: "e3", source: "video", target: "upscale", kind: "video" },
    { id: "e4", source: "upscale", target: "export", kind: "video" },
  ],
};

const makeRuntime = () => new Miniflare({
  modules: true,
  modulesRules: [{ type: "ESModule", include: ["**/*.js"] }],
  scriptPath: "public/_worker.js",
  compatibilityDate: "2026-05-22",
  compatibilityFlags: ["nodejs_compat"],
  d1Databases: ["DB"],
  r2Buckets: ["MEDIA"],
  bindings: {
    AUTH_PEPPER: "integration-auth-pepper-0123456789abcdef",
    SESSION_SIGNING_KEY: "integration-session-key-0123456789abcdef",
    WEBHOOK_SECRET: "integration-webhook-secret-0123456789abcdef",
    ADMIN_EMAIL: "founder@example.com",
    APP_ENV: "test",
  },
});

const cookieFrom = (response) => response.headers.get("set-cookie")?.split(";")[0] || "";

test("production API: auth, ownership, persistence, queue, credits, webhooks and admin", { timeout: 30000 }, async () => {
  const runtime = makeRuntime();
  const request = async (path, { method = "GET", cookie = "", body, headers = {} } = {}) => {
    const init = { method, redirect: "manual", headers: { Origin: ORIGIN, ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(cookie ? { Cookie: cookie } : {}), ...headers } };
    if (body !== undefined) init.body = typeof body === "string" ? body : JSON.stringify(body);
    return runtime.dispatchFetch(`${ORIGIN}${path}`, init);
  };
  const json = async (response) => ({ response, payload: await response.json() });
  const register = async (name, email) => {
    const result = await json(await request("/api/auth/register", { method: "POST", body: { name, email, password: PASSWORD } }));
    assert.equal(result.response.status, 201, JSON.stringify(result.payload));
    return { ...result.payload.user, cookie: cookieFrom(result.response) };
  };

  try {
    const health = await json(await request("/api/v1/health"));
    assert.equal(health.response.status, 200);
    assert.equal(health.payload.mock_provider, true);
    assert.equal(health.payload.job_queue, "durable_d1_fallback");
    const ready = await json(await request("/api/health/ready"));
    assert.equal(ready.response.status, 200);
    assert.equal(ready.payload.ready, true);
    assert.match(ready.response.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    assert.match(ready.response.headers.get("x-request-id"), /^[A-Za-z0-9_.:-]{8,80}$/);
    const features = await json(await request("/api/v1/features"));
    assert.equal(features.payload.features.ENABLE_DEMO_PROVIDER, true);
    assert.equal(features.payload.features.ENABLE_LIVE_PAYMENTS, false);

    const unauthenticatedStudio = await request("/studio", { headers: { Accept: "text/html" } });
    assert.equal(unauthenticatedStudio.status, 302);
    assert.match(unauthenticatedStudio.headers.get("location"), /auth=login/);
    assert.equal((await request("/studio.html", { headers: { Accept: "text/html" } })).status, 302);
    assert.equal((await request("/projects", { headers: { Accept: "text/html" } })).status, 302);
    assert.equal((await request("/assets", { headers: { Accept: "text/html" } })).status, 302);
    assert.equal((await request("/advanced/canvas", { headers: { Accept: "text/html" } })).status, 302);

    const owner = await register("Workflow Owner", "owner@example.com");
    const stranger = await register("Second Browser", "stranger@example.com");
    const admin = await register("Studio Admin", "admin@example.com");
    const founder = await register("Verified Founder", "founder@example.com");
    assert.equal(owner.credits, 400);

    const quickCreation = await json(await request("/api/v1/creations", {
      method: "POST",
      cookie: stranger.cookie,
      headers: { "Idempotency-Key": "quick-studio-creation-0001" },
      body: { mode: "image", model: "nano_banana_2", prompt: "A cinematic golden city", aspect_ratio: "16:9", resolution: "720p", duration: 5 },
    }));
    assert.equal(quickCreation.response.status, 503);
    assert.match(quickCreation.payload.message, /ENABLE_FAL=true/);
    const quickCredits = await json(await request("/api/v1/credits", { cookie: stranger.cookie }));
    assert.deepEqual({ available: quickCredits.payload.wallet.available, reserved: quickCredits.payload.wallet.reserved, spent: quickCredits.payload.wallet.spent }, { available: 400, reserved: 0, spent: 0 });

    const founderVerification = await json(await request("/api/auth/verification/send", { method: "POST", cookie: founder.cookie, body: {} }));
    assert.equal((await request(`/api/auth/verification/confirm?token=${founderVerification.payload.debug_token}`)).status, 200);
    assert.equal((await request("/api/v1/admin/metrics", { cookie: founder.cookie })).status, 200);

    const badLogin = await request("/api/auth/login", { method: "POST", body: { email: owner.email, password: "incorrect-password" } });
    assert.equal(badLogin.status, 401);

    const created = await json(await request("/api/v1/projects", { method: "POST", cookie: owner.cookie, body: { name: "Launch workflow" } }));
    assert.equal(created.response.status, 201, JSON.stringify(created.payload));
    const projectId = created.payload.project.id;

    const idor = await request(`/api/v1/projects/${projectId}`, { cookie: stranger.cookie });
    assert.equal(idor.status, 404);

    const verification = await json(await request("/api/auth/verification/send", { method: "POST", cookie: owner.cookie, body: {} }));
    assert.match(verification.payload.debug_token, /^[A-Za-z0-9_-]{40,60}$/);
    const verified = await request(`/api/auth/verification/confirm?token=${verification.payload.debug_token}`);
    assert.equal(verified.status, 200);

    const forgot = await json(await request("/api/auth/password/forgot", { method: "POST", body: { email: stranger.email } }));
    assert.match(forgot.payload.debug_token, /^[A-Za-z0-9_-]{40,60}$/);
    const reset = await json(await request("/api/auth/password/reset", { method: "POST", body: { token: forgot.payload.debug_token, password: "Replacement!2026" } }));
    assert.equal(reset.payload.reset, true);
    const relogin = await request("/api/auth/login", { method: "POST", body: { email: stranger.email, password: "Replacement!2026" } });
    assert.equal(relogin.status, 200);

    const saved = await json(await request(`/api/v1/projects/${projectId}/workflow`, { method: "PUT", cookie: owner.cookie, body: { workflow, base_version: 1, reason: "E2E graph" } }));
    assert.equal(saved.response.status, 200, JSON.stringify(saved.payload));
    assert.equal(saved.payload.project.version, 2);
    const versions = await json(await request(`/api/v1/projects/${projectId}/versions`, { cookie: owner.cookie }));
    assert.equal(versions.payload.versions.length, 2);

    const idempotencyKey = "two-tabs-same-run-0001";
    const submissions = await Promise.all([
      json(await request(`/api/v1/projects/${projectId}/runs`, { method: "POST", cookie: owner.cookie, headers: { "Idempotency-Key": idempotencyKey }, body: { provider: "mock" } })),
      json(await request(`/api/v1/projects/${projectId}/runs`, { method: "POST", cookie: owner.cookie, headers: { "Idempotency-Key": idempotencyKey }, body: { provider: "mock" } })),
    ]);
    assert.equal(submissions[0].payload.job.id, submissions[1].payload.job.id);
    const jobId = submissions[0].payload.job.id;
    const during = await json(await request("/api/v1/credits", { cookie: owner.cookie }));
    assert.deepEqual({ available: during.payload.wallet.available, reserved: during.payload.wallet.reserved, spent: during.payload.wallet.spent }, { available: 330, reserved: 70, spent: 0 });

    let current;
    for (let attempt = 0; attempt < 16; attempt += 1) {
      current = await json(await request(`/api/v1/jobs/${jobId}`, { cookie: owner.cookie }));
      if (current.payload.job.status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    assert.equal(current.payload.job.status, "completed", JSON.stringify(current.payload));
    const after = await json(await request("/api/v1/credits?limit=100", { cookie: owner.cookie }));
    assert.deepEqual({ available: after.payload.wallet.available, reserved: after.payload.wallet.reserved, spent: after.payload.wallet.spent }, { available: 330, reserved: 0, spent: 70 });
    assert.equal(after.payload.ledger.filter((entry) => entry.entry_type === "charge" && entry.job_id === jobId).length, 1);

    const download = await request(current.payload.job.result_url, { cookie: owner.cookie });
    assert.equal(download.status, 200);
    const demoOutput = await download.text();
    assert.match(demoOutput, /SHAZAN AI Workflow Studio/);
    assert.match(demoOutput, /Demo Output — no paid AI model was called/);

    const db = await runtime.getD1Database("DB");
    const attempts = await db.prepare("SELECT status FROM shazan_job_attempts_v1 WHERE job_id=?").bind(jobId).all();
    assert.equal(attempts.results.some((attempt) => attempt.status === "completed"), true);
    assert.equal(Number((await db.prepare("SELECT COUNT(*) AS value FROM shazan_job_leases_v1 WHERE job_id=?").bind(jobId).first()).value), 0);

    const webhookBody = { event_id: "provider-event-001", job_id: jobId, status: "completed", message: "duplicate completion" };
    const webhookHeaders = { "X-Webhook-Secret": "integration-webhook-secret-0123456789abcdef" };
    const webhookFirst = await json(await request("/api/v1/webhooks/mock", { method: "POST", body: webhookBody, headers: webhookHeaders }));
    const webhookSecond = await json(await request("/api/v1/webhooks/mock", { method: "POST", body: webhookBody, headers: webhookHeaders }));
    assert.equal(webhookFirst.payload.ignored, true);
    assert.equal(webhookSecond.payload.duplicate, true);
    const afterDuplicate = await json(await request("/api/v1/credits?limit=100", { cookie: owner.cookie }));
    assert.equal(afterDuplicate.payload.ledger.filter((entry) => entry.entry_type === "charge" && entry.job_id === jobId).length, 1);

    const cancelRun = await json(await request(`/api/v1/projects/${projectId}/runs`, { method: "POST", cookie: owner.cookie, headers: { "Idempotency-Key": "cancel-run-unique-0001" }, body: { provider: "mock" } }));
    const cancelled = await json(await request(`/api/v1/jobs/${cancelRun.payload.job.id}/cancel`, { method: "POST", cookie: owner.cookie, body: {} }));
    assert.equal(cancelled.payload.job.status, "cancelled");
    const retry = await json(await request(`/api/v1/jobs/${cancelRun.payload.job.id}/retry`, { method: "POST", cookie: owner.cookie, headers: { "Idempotency-Key": "retry-run-unique-0001" }, body: {} }));
    assert.equal(retry.response.status, 202);
    const retryCancelled = await request(`/api/v1/jobs/${retry.payload.job.id}/cancel`, { method: "POST", cookie: owner.cookie, body: {} });
    assert.equal(retryCancelled.status, 200);
    const afterCancelRetry = await json(await request("/api/v1/credits?limit=100", { cookie: owner.cookie }));
    assert.deepEqual({ available: afterCancelRetry.payload.wallet.available, reserved: afterCancelRetry.payload.wallet.reserved, spent: afterCancelRetry.payload.wallet.spent }, { available: 330, reserved: 0, spent: 70 });

    const forbiddenAdmin = await request("/api/v1/admin/metrics", { cookie: owner.cookie });
    assert.equal(forbiddenAdmin.status, 403);
    assert.equal((await request("/admin", { cookie: owner.cookie })).status, 403);
    await db.prepare("UPDATE shazan_user_profiles_v1 SET role='admin' WHERE user_id=?").bind(admin.id).run();
    const disableDemo = await json(await request("/api/v1/admin/features/ENABLE_DEMO_PROVIDER", { method: "PATCH", cookie: admin.cookie, body: { enabled: false, reason: "Verify direct API feature enforcement" } }));
    assert.equal(disableDemo.payload.flag.effective_enabled, false);
    const disabledRun = await request(`/api/v1/projects/${projectId}/runs`, { method: "POST", cookie: owner.cookie, headers: { "Idempotency-Key": "feature-disabled-run-0001" }, body: { provider: "mock" } });
    assert.equal(disabledRun.status, 503);
    const enableDemo = await request("/api/v1/admin/features/ENABLE_DEMO_PROVIDER", { method: "PATCH", cookie: admin.cookie, body: { enabled: true, reason: "Restore Demo Provider after gate test" } });
    assert.equal(enableDemo.status, 200);
    const paidProviderBlocked = await request("/api/v1/admin/providers/fal", { method: "PATCH", cookie: admin.cookie, body: { enabled: true, reason: "Verified fal.ai rollout provider switch" } });
    assert.equal(paidProviderBlocked.status, 200);
    const adjustment = await json(await request(`/api/v1/admin/users/${owner.id}/credits`, { method: "POST", cookie: admin.cookie, body: { delta: 25, reason: "Launch support grant" } }));
    assert.equal(Number(adjustment.payload.wallet.available), 355);
    const removal = await json(await request(`/api/v1/admin/users/${owner.id}/credits`, { method: "POST", cookie: admin.cookie, body: { delta: -355, reason: "Verify strict zero-credit gate" } }));
    assert.equal(Number(removal.payload.wallet.available), 0);
    const noCreditRun = await request(`/api/v1/projects/${projectId}/runs`, { method: "POST", cookie: owner.cookie, headers: { "Idempotency-Key": "no-credit-run-0001" }, body: { provider: "mock" } });
    assert.equal(noCreditRun.status, 402);
    const audit = await json(await request("/api/v1/admin/audit", { cookie: admin.cookie }));
    assert.equal(audit.payload.logs.some((entry) => entry.action === "credits.adjust" && entry.target_id === owner.id), true);

    const share = await json(await request(`/api/v1/projects/${projectId}/share`, { method: "POST", cookie: owner.cookie, body: { days: 7 } }));
    const shared = await request(`/api/v1/share/${share.payload.share.token}`);
    assert.equal(shared.status, 200);

    const secondOwnerLogin = await request("/api/auth/login", { method: "POST", body: { email: owner.email, password: PASSWORD } });
    const secondOwnerCookie = cookieFrom(secondOwnerLogin);
    const logoutAll = await request("/api/auth/logout-all", { method: "POST", cookie: owner.cookie, body: {} });
    assert.equal(logoutAll.status, 200);
    assert.equal((await json(await request("/api/auth/session", { cookie: owner.cookie }))).payload.authenticated, false);
    assert.equal((await json(await request("/api/auth/session", { cookie: secondOwnerCookie }))).payload.authenticated, false);
  } finally {
    await runtime.dispose();
  }
});
