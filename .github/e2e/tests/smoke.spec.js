const { test, expect } = require("@playwright/test");

test.describe("Quran Quest web smoke checks", () => {
  test("home page loads core navigation", async ({ page }) => {
    await page.goto("/index.html", { waitUntil: "domcontentloaded" });

    await expect(page).toHaveTitle(/Quran Quest/i);
    await expect(page.locator("#mainNavbar")).toBeVisible();
    await expect(page.locator("h1").first()).toContainText(/Quran Quest/i);
  });

  test("memorization page loads primary controls", async ({ page }) => {
    await page.goto("/memorization.html", { waitUntil: "domcontentloaded" });

    await expect(page).toHaveTitle(/Memorization/i);
    await expect(page.locator("#memoNavBar")).toBeVisible();
    await expect(page.locator("#memoWelcomeStartBtn")).toBeVisible();
  });

  test("dua page renders list layout", async ({ page }) => {
    await page.goto("/duas/duas.html", { waitUntil: "domcontentloaded" });

    await expect(page).toHaveTitle(/Duas/i);
    await expect(page.locator(".app-header")).toBeVisible();
    await expect(page.locator(".dua-list")).toBeVisible();
  });
});
