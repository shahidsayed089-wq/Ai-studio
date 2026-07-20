import { test, expect } from "@playwright/test";

test("official cinematic homepage remains the default route", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("SHAZAN AI", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /Imagine it.*Direct it.*Bring it to life/i })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Image" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Video" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Audio" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Voice" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Character" })).toBeVisible();
  await expect(page.getByText("Node library")).toHaveCount(0);
});

test("default registration lands in simple Studio and Pro Canvas stays isolated", async ({ page }) => {
  const email = `routing-${Date.now()}@example.com`;
  await page.goto("/?auth=register");
  await page.getByLabel("Full name").fill("Routing Creator");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("RoutingReady!2026");
  await page.getByLabel("Confirm password").fill("RoutingReady!2026");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/studio$/);
  await expect(page.getByRole("heading", { name: /Imagine it.*Direct it.*Bring it to life/i })).toBeVisible();
  await expect(page.locator(".canvas-node")).toHaveCount(0);
  await expect(page.getByText("Persistent Queue", { exact: false })).toHaveCount(0);

  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Projects." })).toBeVisible();
  await page.goto("/assets");
  await expect(page.getByRole("heading", { name: "My Creations." })).toBeVisible();

  await page.goto("/advanced/canvas");
  await expect(page.getByText("PRO CANVAS — ADVANCED")).toBeVisible();
  await expect(page.getByText("Node library")).toBeVisible();
  await expect(page.locator(".canvas-node")).toHaveCount(4);
  const projectName = await page.locator(".project-switcher select option").first().textContent();
  await page.reload();
  await expect(page.getByText("Node library")).toBeVisible();
  await expect(page.locator(".project-switcher select option").first()).toHaveText(projectName || "My first AI workflow");
});

test("simple Studio automatically executes a durable Demo creation", async ({ page }) => {
  const email = `quick-${Date.now()}@example.com`;
  await page.goto("/?auth=register&next=/studio");
  await page.getByLabel("Full name").fill("Quick Creator");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("QuickReady!2026");
  await page.getByLabel("Confirm password").fill("QuickReady!2026");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Image prompt").fill("A golden cinematic city at dawn");
  await page.locator(".generate-button").click();
  await expect(page.getByRole("dialog", { name: /GPT Image 2/i })).toBeVisible();
  await page.getByRole("button", { name: "Generate image" }).click();
  await expect(page.getByRole("status").getByText("Creation Ready", { exact: true })).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText("DEMO OUTPUT", { exact: true })).toBeVisible();

  const credits = await page.evaluate(async () => (await fetch("/api/v1/credits?limit=100", { cache: "no-store" })).json());
  expect(credits.wallet).toMatchObject({ available: 488, reserved: 0, spent: 12 });
  expect(credits.ledger.filter((entry: { entry_type: string }) => entry.entry_type === "charge")).toHaveLength(1);
  const creations = await page.evaluate(async () => (await fetch("/api/v1/assets?limit=100", { cache: "no-store" })).json());
  expect(creations.assets.some((asset: { source: string; metadata?: { demo_label?: string } }) => asset.source === "mock" && /Demo Output/.test(asset.metadata?.demo_label || ""))).toBe(true);
});
