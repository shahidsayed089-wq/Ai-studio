import { test, expect } from "@playwright/test";

test("health and readiness endpoints expose production gate state and security headers", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ core_ready: true, environment: "test", mock_provider: true, live_payments: "disabled" });
  expect(health.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(health.headers()["strict-transport-security"]).toContain("max-age=");
  const ready = await request.get("/api/health/ready");
  expect(ready.status()).toBe(200);
  expect((await ready.json()).ready).toBe(true);
});

test("all five legal policy routes are generated and accessible", async ({ request }) => {
  for (const route of ["/privacy", "/terms", "/acceptable-use", "/dmca", "/refund-policy"]) {
    const response = await request.get(route);
    expect(response.status(), route).toBe(200);
    expect(await response.text()).toContain("SHAZAN AI");
  }
});
