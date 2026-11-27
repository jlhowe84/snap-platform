import { expect, test } from "@playwright/test";

test.describe("signed out", () => {
  test("staff pages send a visitor to sign in", async ({ page }) => {
    await page.goto("/jobs");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("owner", () => {
  test.use({ storageState: "e2e/.auth/owner.json" });
  test("opens home and the main pages without an error", async ({ page }) => {
    for (const path of ["/", "/jobs", "/leagues", "/season", "/staffing", "/support", "/production", "/orders", "/obligations", "/queue", "/settings"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBeLessThan(400);
      await expect(page, path).not.toHaveURL(/\/(login|waiting)/);
      await expect(page.getByText("Something went wrong"), path).toHaveCount(0);
    }
  });
});
