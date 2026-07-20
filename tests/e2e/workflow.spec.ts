import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("account to durable Prompt → Image → Video → Upscaler → Export workflow", async ({ page }) => {
  const email = `playwright-${Date.now()}@example.com`;
  await page.goto("/?auth=register&next=/studio");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Full name").fill("Playwright Creator");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("LaunchReady!2026");
  await page.getByLabel("Confirm password").fill("LaunchReady!2026");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/studio$/);
  await expect(page.getByText("Node library")).toBeVisible();
  await page.getByRole("button", { name: /New project/i }).click();
  await expect(page.locator(".canvas-node")).toHaveCount(4);
  await page.getByRole("button", { name: /Video Upscaler/i }).click();
  await expect(page.locator(".canvas-node")).toHaveCount(5);
  await expect(page.locator(".edge-layer path")).toHaveCount(4);
  await expect(page.locator(".save-indicator")).toHaveText("Saved");

  await page.getByRole("button", { name: /Run workflow/i }).click();
  await expect(page.locator(".job-status").first()).toHaveText(/queued|processing/);
  await page.reload();
  await expect(page.getByText("Node library")).toBeVisible();
  await expect(page.locator(".job-status").first()).toHaveText("completed", { timeout: 25_000 });

  const creditState = await page.evaluate(async () => {
    const response = await fetch("/api/v1/credits?limit=100", { cache: "no-store" });
    return response.json();
  });
  expect(creditState.wallet).toMatchObject({ available: 430, reserved: 0, spent: 70 });
  expect(creditState.ledger.filter((entry: { entry_type: string }) => entry.entry_type === "charge")).toHaveLength(1);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download" }).first().click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  expect(await readFile(downloadPath!, "utf8")).toContain("SHAZAN AI Workflow Studio");
});

test("mobile navigation exposes node library and inspector", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const email = `mobile-${Date.now()}@example.com`;
  await page.goto("/?auth=register&next=/studio");
  await page.getByLabel("Full name").fill("Mobile Creator");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("MobileReady!2026");
  await page.getByLabel("Confirm password").fill("MobileReady!2026");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/studio$/);
  await page.locator(".studio-topbar .mobile-panel-button").first().click();
  await expect(page.locator(".node-library")).toHaveClass(/open/);
  await expect(page.locator(".node-library .library-node").filter({ hasText: "Text Prompt" })).toBeVisible();
  await page.locator(".panel-heading button").first().click();
  await page.locator(".canvas-node").first().click();
  await expect(page.locator(".inspector-panel")).toHaveClass(/open/);
});
