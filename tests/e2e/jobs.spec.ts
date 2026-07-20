import { test, expect } from "@playwright/test";
import { call, createProject, newApi, payload, register, runJob, waitForJob } from "./helpers";

test("job cancellation refunds its reserved credits", async () => {
  const api = await newApi("job-cancel"); const account = await register(api); const projectId = await createProject(api, account.cookie);
  const job = await runJob(api, account.cookie, projectId);
  const cancelled = await payload<{ job: { status: string } }>(await call(api, `/api/v1/jobs/${job.id}/cancel`, { method: "POST", cookie: account.cookie, data: {} }));
  expect(cancelled.body.job.status).toBe("cancelled");
  const credits = await (await call(api, "/api/v1/credits?limit=100", { cookie: account.cookie })).json();
  expect(credits.wallet).toMatchObject({ available: 500, reserved: 0, spent: 0 });
  expect(credits.ledger.filter((entry: { entry_type: string; job_id: string }) => entry.entry_type === "refund" && entry.job_id === job.id)).toHaveLength(1);
  await api.dispose();
});

test("cancelled job can be retried without double charging", async () => {
  const api = await newApi("job-retry"); const account = await register(api); const projectId = await createProject(api, account.cookie);
  const original = await runJob(api, account.cookie, projectId);
  expect((await call(api, `/api/v1/jobs/${original.id}/cancel`, { method: "POST", cookie: account.cookie, data: {} })).status()).toBe(200);
  const retry = await payload<{ job: { id: string; retry_of: string } }>(await call(api, `/api/v1/jobs/${original.id}/retry`, { method: "POST", cookie: account.cookie, headers: { "Idempotency-Key": `retry:${crypto.randomUUID()}` }, data: {} }));
  expect(retry.response.status()).toBe(202);
  expect(retry.body.job.retry_of).toBe(original.id);
  expect((await call(api, `/api/v1/jobs/${retry.body.job.id}/cancel`, { method: "POST", cookie: account.cookie, data: {} })).status()).toBe(200);
  const credits = await (await call(api, "/api/v1/credits?limit=100", { cookie: account.cookie })).json();
  expect(credits.wallet).toMatchObject({ available: 500, reserved: 0, spent: 0 });
  expect(credits.ledger.filter((entry: { entry_type: string }) => entry.entry_type === "charge")).toHaveLength(0);
  await api.dispose();
});

test("two browser tabs submitting one idempotency key reserve credits once", async () => {
  const api = await newApi("credit-concurrency"); const account = await register(api); const projectId = await createProject(api, account.cookie);
  const key = `two-tabs:${crypto.randomUUID()}`;
  const options = { method: "POST", cookie: account.cookie, headers: { "Idempotency-Key": key }, data: { provider: "mock" } };
  const responses = await Promise.all([
    call(api, `/api/v1/projects/${projectId}/runs`, options),
    call(api, `/api/v1/projects/${projectId}/runs`, options),
  ]);
  const [first, second] = await Promise.all(responses.map((response) => payload<{ job: { id: string } }>(response)));
  expect(first.body.job.id).toBe(second.body.job.id);
  const during = await (await call(api, "/api/v1/credits?limit=100", { cookie: account.cookie })).json();
  expect(during.wallet).toMatchObject({ available: 430, reserved: 70, spent: 0 });
  expect(during.ledger.filter((entry: { entry_type: string }) => entry.entry_type === "reserve")).toHaveLength(1);
  expect((await call(api, `/api/v1/jobs/${first.body.job.id}/cancel`, { method: "POST", cookie: account.cookie, data: {} })).status()).toBe(200);
  await api.dispose();
});

test("successful Demo job captures credits exactly once and labels its result Demo", async () => {
  const api = await newApi("credit-capture"); const account = await register(api); const projectId = await createProject(api, account.cookie);
  const job = await runJob(api, account.cookie, projectId); const completed = await waitForJob(api, account.cookie, job.id);
  expect(completed.status).toBe("completed");
  const credits = await (await call(api, "/api/v1/credits?limit=100", { cookie: account.cookie })).json();
  expect(credits.wallet).toMatchObject({ available: 430, reserved: 0, spent: 70 });
  expect(credits.ledger.filter((entry: { entry_type: string; job_id: string }) => entry.entry_type === "charge" && entry.job_id === job.id)).toHaveLength(1);
  const output = await (await call(api, completed.result_url!, { cookie: account.cookie })).text();
  expect(output).toContain("Demo Output — no paid AI model was called.");
  await api.dispose();
});

test("permanent Mock failure refunds reservation after retry policy is exhausted", async () => {
  test.setTimeout(55_000);
  const api = await newApi("failure-refund"); const account = await register(api); const projectId = await createProject(api, account.cookie, "[fail] force permanent failure");
  const job = await runJob(api, account.cookie, projectId); const failed = await waitForJob(api, account.cookie, job.id, ["failed"], 80);
  expect(failed.status).toBe("failed");
  const credits = await (await call(api, "/api/v1/credits?limit=100", { cookie: account.cookie })).json();
  expect(credits.wallet).toMatchObject({ available: 500, reserved: 0, spent: 0 });
  expect(credits.ledger.filter((entry: { entry_type: string; job_id: string }) => entry.entry_type === "refund" && entry.job_id === job.id)).toHaveLength(1);
  expect(credits.ledger.filter((entry: { entry_type: string; job_id: string }) => entry.entry_type === "charge" && entry.job_id === job.id)).toHaveLength(0);
  await api.dispose();
});

test("duplicate webhook is ignored and cannot charge twice", async () => {
  const api = await newApi("duplicate-webhook"); const account = await register(api); const projectId = await createProject(api, account.cookie);
  const job = await runJob(api, account.cookie, projectId);
  const headers = { "X-Webhook-Secret": "e2e-webhook-secret-0123456789abcdef0123" };
  const processing = { event_id: `provider-processing-${crypto.randomUUID()}`, job_id: job.id, status: "processing", message: "provider started" };
  expect((await call(api, "/api/v1/webhooks/mock", { method: "POST", headers, data: processing })).status()).toBe(200);
  const completed = { event_id: `provider-completed-${crypto.randomUUID()}`, job_id: job.id, status: "completed", message: "provider completion" };
  const first = await payload<{ duplicate: boolean }>(await call(api, "/api/v1/webhooks/mock", { method: "POST", headers, data: completed }));
  const duplicate = await payload<{ duplicate: boolean }>(await call(api, "/api/v1/webhooks/mock", { method: "POST", headers, data: completed }));
  expect(first.body.duplicate).toBe(false);
  expect(duplicate.body.duplicate).toBe(true);
  const credits = await (await call(api, "/api/v1/credits?limit=100", { cookie: account.cookie })).json();
  expect(credits.ledger.filter((entry: { entry_type: string; job_id: string }) => entry.entry_type === "charge" && entry.job_id === job.id)).toHaveLength(1);
  await api.dispose();
});
