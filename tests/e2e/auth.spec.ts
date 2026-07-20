import { test, expect } from "@playwright/test";
import { BASE_URL, PASSWORD, call, newApi, payload, register, uniqueEmail } from "./helpers";

test("registration, login and logout use durable server sessions", async () => {
  const api = await newApi("auth-lifecycle");
  const account = await register(api);
  expect((await call(api, "/api/auth/session", { cookie: account.cookie })).status()).toBe(200);
  const logout = await call(api, "/api/auth/logout", { method: "POST", cookie: account.cookie, data: {} });
  expect(logout.status()).toBe(200);
  expect((await (await call(api, "/api/auth/session", { cookie: account.cookie })).json()).authenticated).toBe(false);
  const login = await call(api, "/api/auth/login", { method: "POST", data: { email: account.email, password: account.password } });
  expect(login.status()).toBe(200);
  await api.dispose();
});

test("Google OAuth start sets state and callback rejects invalid state", async () => {
  const api = await newApi("google-oauth-contract");
  const start = await call(api, "/api/auth/google/start?returnTo=%2Fadvanced%2Fcanvas");
  expect(start.status()).toBe(302);
  const target = new URL(start.headers().location);
  expect(target.origin).toBe("https://accounts.google.com");
  expect(target.searchParams.get("redirect_uri")).toBe(`${BASE_URL}/api/auth/google/callback`);
  const cookies = start
    .headersArray()
    .filter(({ name }) => name.toLowerCase() === "set-cookie")
    .map(({ value }) => value)
    .join("\n");
  expect(cookies).toContain("shazan_oauth_state");
  expect(cookies).toContain("shazan_oauth_return");
  const invalid = await call(api, "/api/auth/google/callback?state=wrong&code=fake");
  expect(invalid.status()).toBe(400);
  await api.dispose();
});

test("password reset consumes a one-time token and revokes sessions", async () => {
  const api = await newApi("password-reset");
  const account = await register(api, uniqueEmail("reset"));
  const forgot = await payload<{ debug_token: string }>(await call(api, "/api/auth/password/forgot", { method: "POST", data: { email: account.email } }));
  expect(forgot.response.status()).toBe(200);
  expect(forgot.body.debug_token).toMatch(/^[A-Za-z0-9_-]{40,60}$/);
  const changed = await call(api, "/api/auth/password/reset", { method: "POST", data: { token: forgot.body.debug_token, password: "Replacement!2026" } });
  expect(changed.status()).toBe(200);
  expect((await call(api, "/api/auth/login", { method: "POST", data: { email: account.email, password: PASSWORD } })).status()).toBe(401);
  expect((await call(api, "/api/auth/login", { method: "POST", data: { email: account.email, password: "Replacement!2026" } })).status()).toBe(200);
  expect((await call(api, "/api/auth/password/reset", { method: "POST", data: { token: forgot.body.debug_token, password: "AnotherPass!2026" } })).status()).toBe(400);
  await api.dispose();
});
