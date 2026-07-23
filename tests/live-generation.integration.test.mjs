import test from "node:test";
import assert from "node:assert/strict";
import { Miniflare } from "miniflare";

const ORIGIN = "http://shazan.test";
const PASSWORD = "StrongPass!2026";

test("verified fal lifecycle reserves, stores, charges and refunds without a paid call", { timeout: 30000 }, async () => {
  let providerState = "IN_PROGRESS";
  const runtime = new Miniflare({
    modules: true,
    modulesRules: [{ type: "ESModule", include: ["**/*.js"] }],
    outboundService: async (request) => {
      const url = new URL(request.url);
      if (request.method === "POST" && url.pathname === "/fal-ai/nano-banana-2") {
        const body = await request.json();
        assert.equal(body.prompt, "A real cinematic city");
        assert.equal(body.end_user_id.length > 10, true);
        return Response.json({ request_id: "verified-smoke-request" });
      }
      if (url.pathname === "/fal-ai/nano-banana-2/requests/verified-smoke-request/status") {
        return Response.json(
          providerState === "FAILED"
            ? { status: "FAILED", error: "Controlled provider failure" }
            : providerState === "COMPLETED"
              ? { status: "COMPLETED" }
              : { status: "IN_PROGRESS", progress: 40 },
        );
      }
      if (url.pathname === "/fal-ai/nano-banana-2/requests/verified-smoke-request" && providerState === "COMPLETED") {
        return Response.json({
          images: [{
            url: "https://storage.googleapis.com/falserverless/example_outputs/nano-banana-2-t2i-output.png",
            content_type: "image/png",
          }],
        });
      }
      if (url.hostname === "storage.googleapis.com") {
        return new Response(new Uint8Array(2048), {
          headers: { "Content-Type": "image/png", "Content-Length": "2048" },
        });
      }
      return Response.json({ error: "unhandled outbound", url: request.url }, { status: 404 });
    },
    scriptPath: "public/_worker.js",
    compatibilityDate: "2026-05-22",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: ["DB"],
    r2Buckets: ["MEDIA"],
    bindings: {
      AUTH_PEPPER: "live-smoke-auth-pepper-0123456789abcdef",
      WEBHOOK_SECRET: "live-smoke-webhook-0123456789abcdef",
      APP_ENV: "test",
      ENABLE_FAL: "true",
      FAL_KEY: "test-fal-key-never-sent-to-real-provider",
      FAL_QUEUE_BASE_URL: "https://queue.fal.run",
      LIVE_DAILY_CREDIT_LIMIT: "2000",
      LIVE_USER_DAILY_CREDIT_LIMIT: "400",
    },
  });

  const request = (path, options = {}) => runtime.dispatchFetch(`${ORIGIN}${path}`, {
    redirect: "manual",
    ...options,
    headers: { Origin: ORIGIN, ...(options.headers || {}) },
  });
  const read = async (response) => ({ response, payload: await response.json() });
  const create = async (cookie, key) => read(await request("/api/v1/creations", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify({
      mode: "image",
      model: "nano_banana_2",
      prompt: "A real cinematic city",
      aspect_ratio: "16:9",
      resolution: "720p",
      duration: 5,
    }),
  }));

  try {
    const registered = await read(await request("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Live Smoke", email: "live-smoke@example.com", password: PASSWORD }),
    }));
    assert.equal(registered.response.status, 201);
    assert.equal(registered.payload.user.credits, 400);
    const cookie = registered.response.headers.get("set-cookie").split(";")[0];

    const unverified = await create(cookie, "live-smoke-unverified-0001");
    assert.equal(unverified.response.status, 403);

    const verification = await read(await request("/api/auth/verification/send", {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: "{}",
    }));
    assert.equal((await request(`/api/auth/verification/confirm?token=${verification.payload.debug_token}`)).status, 200);

    const created = await create(cookie, "live-smoke-creation-0001");
    assert.equal(created.response.status, 202, JSON.stringify(created.payload));
    assert.equal(created.payload.job.provider, "fal");
    assert.equal(created.payload.job.estimated_credits, 16);
    assert.equal(created.payload.job.status, "processing");

    const reserved = await read(await request("/api/v1/credits", { headers: { Cookie: cookie } }));
    assert.deepEqual(
      { available: reserved.payload.wallet.available, reserved: reserved.payload.wallet.reserved, spent: reserved.payload.wallet.spent },
      { available: 384, reserved: 16, spent: 0 },
    );

    const processing = await read(await request(`/api/v1/jobs/${created.payload.job.id}`, { headers: { Cookie: cookie } }));
    assert.equal(processing.payload.job.status, "processing");
    assert.equal(processing.payload.job.progress, 40);

    providerState = "FAILED";
    const failed = await read(await request(`/api/v1/jobs/${created.payload.job.id}`, { headers: { Cookie: cookie } }));
    assert.equal(failed.payload.job.status, "failed");
    const refunded = await read(await request("/api/v1/credits?limit=100", { headers: { Cookie: cookie } }));
    assert.deepEqual(
      { available: refunded.payload.wallet.available, reserved: refunded.payload.wallet.reserved, spent: refunded.payload.wallet.spent },
      { available: 400, reserved: 0, spent: 0 },
    );
    assert.equal(refunded.payload.ledger.some((entry) => entry.entry_type === "refund" && entry.job_id === created.payload.job.id), true);

    providerState = "COMPLETED";
    const successful = await create(cookie, "live-smoke-creation-0002");
    assert.equal(successful.response.status, 202, JSON.stringify(successful.payload));
    const completed = await read(await request(`/api/v1/jobs/${successful.payload.job.id}`, { headers: { Cookie: cookie } }));
    assert.equal(completed.payload.job.status, "completed", JSON.stringify(completed.payload));
    assert.match(completed.payload.job.result_url, /\/api\/v1\/assets\//);

    const media = await request(completed.payload.job.result_url, { headers: { Cookie: cookie } });
    assert.equal(media.status, 200);
    assert.match(media.headers.get("content-type"), /^image\//);
    assert.equal((await media.arrayBuffer()).byteLength, 2048);

    const charged = await read(await request("/api/v1/credits?limit=100", { headers: { Cookie: cookie } }));
    assert.deepEqual(
      { available: charged.payload.wallet.available, reserved: charged.payload.wallet.reserved, spent: charged.payload.wallet.spent },
      { available: 384, reserved: 0, spent: 16 },
    );
    assert.equal(charged.payload.ledger.filter((entry) => entry.entry_type === "charge" && entry.job_id === successful.payload.job.id).length, 1);
  } finally {
    await runtime.dispose();
  }
});
