import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("account to durable Prompt → Image → Video → Upscaler → Export workflow", async ({ page }) => {
  const email = `playwright-${Date.now()}@example.com`;
  await page.goto("/?auth=register&next=/advanced/canvas");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Full name").fill("Playwright Creator");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("LaunchReady!2026");
  await page.getByLabel("Confirm password").fill("LaunchReady!2026");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/advanced\/canvas$/);
  await expect(page.getByText("PRO CANVAS — ADVANCED")).toBeVisible();
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

test("mobile users receive the simple Studio without engineering controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const email = `mobile-${Date.now()}@example.com`;
  await page.goto("/?auth=register&next=/studio");
  await page.getByLabel("Full name").fill("Mobile Creator");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("MobileReady!2026");
  await page.getByLabel("Confirm password").fill("MobileReady!2026");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/studio$/);
  await expect(page.getByRole("heading", { name: /Imagine it.*Direct it.*Bring it to life/i })).toBeVisible();
  await expect(page.getByText("Node library")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Run workflow/i })).toHaveCount(0);
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toHaveClass(/open/);
});
