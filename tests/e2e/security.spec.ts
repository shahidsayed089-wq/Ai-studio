import { test, expect } from "@playwright/test";
import { call, createProject, newApi, payload, register } from "./helpers";

test("admin routes reject users and accept only a verified configured admin", async () => {
  const userApi = await newApi("ordinary-user");
  const adminApi = await newApi("configured-admin");
  const user = await register(userApi);
  const admin = await register(adminApi, "e2e-admin@example.com");
  expect((await call(userApi, "/api/v1/admin/metrics", { cookie: user.cookie })).status()).toBe(403);
  expect((await call(adminApi, "/api/v1/admin/metrics", { cookie: admin.cookie })).status()).toBe(403);
  const verification = await payload<{ debug_token: string }>(await call(adminApi, "/api/auth/verification/send", { method: "POST", cookie: admin.cookie, data: {} }));
  expect((await call(adminApi, `/api/auth/verification/confirm?token=${verification.body.debug_token}`)).status()).toBe(200);
  expect((await call(adminApi, "/api/v1/admin/metrics", { cookie: admin.cookie })).status()).toBe(200);
  await userApi.dispose(); await adminApi.dispose();
});

test("cross-user project access is rejected with non-enumerating 404", async () => {
  const ownerApi = await newApi("project-owner"); const strangerApi = await newApi("project-stranger");
  const owner = await register(ownerApi); const stranger = await register(strangerApi);
  const projectId = await createProject(ownerApi, owner.cookie);
  expect((await call(strangerApi, `/api/v1/projects/${projectId}`, { cookie: stranger.cookie })).status()).toBe(404);
  expect((await call(strangerApi, `/api/v1/projects/${projectId}`, { method: "DELETE", cookie: stranger.cookie })).status()).toBe(404);
  await ownerApi.dispose(); await strangerApi.dispose();
});

test("server-disabled paid provider rejects a direct API submission", async () => {
  const api = await newApi("disabled-provider"); const account = await register(api); const projectId = await createProject(api, account.cookie);
  const response = await call(api, `/api/v1/projects/${projectId}/runs`, { method: "POST", cookie: account.cookie, headers: { "Idempotency-Key": `fal:${crypto.randomUUID()}` }, data: { provider: "fal" } });
  expect(response.status()).toBe(503);
  expect((await response.json()).error).toMatch(/disabled/i);
  await api.dispose();
});

test("share links expire and stop disclosing the project", async () => {
  const api = await newApi("share-expiry"); const account = await register(api); const projectId = await createProject(api, account.cookie);
  const share = await payload<{ share: { token: string } }>(await call(api, `/api/v1/projects/${projectId}/share`, { method: "POST", cookie: account.cookie, data: { days: 1, expires_in_seconds: 1 } }));
  expect((await call(api, `/api/v1/share/${share.body.share.token}`)).status()).toBe(200);
  await new Promise((resolve) => setTimeout(resolve, 2100));
  expect((await call(api, `/api/v1/share/${share.body.share.token}`)).status()).toBe(404);
  await api.dispose();
});
