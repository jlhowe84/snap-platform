import { expect, test } from "@playwright/test";
import { admin } from "./helpers";

// The agent test set: a finished support conversation is added as a case,
// and the run refuses cleanly when no Claude API key is set (as here).
test.use({ storageState: "e2e/.auth/owner.json" });

test("a support conversation becomes a test case", async ({ page }) => {
  await page.goto("/support/e2e00000-0000-4000-8000-0000000000f1");
  await page.getByRole("button", { name: "Add to the test set" }).click();
  await expect(page.getByRole("button", { name: "Refresh in the test set" })).toBeVisible();

  const { data: c } = await admin().from("eval_cases").select("title, expected, input").single();
  expect(c?.title).toBe("Access code for the gallery");
  expect((c?.expected as { approved_reply: string }).approved_reply).toContain("on its way to the email on file");
  expect(JSON.stringify(c?.input)).not.toContain("on its way to the email on file");

  await page.goto("/settings/test-set");
  await expect(page.getByText("Access code for the gallery")).toBeVisible();
  await page.getByRole("button", { name: "Run the test set (1)" }).click();
  await expect(page.getByRole("status").filter({ hasText: "needs the Claude API key" })).toBeVisible();
});
