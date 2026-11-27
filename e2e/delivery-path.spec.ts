import { expect, test } from "@playwright/test";
import { admin } from "./helpers";
import { sentMail } from "./fake-gmail";

// Spec module 11, done-when: one job runs gallery-live notice to close-out
// with the amounts owed computed and listed as obligations. The league has a
// 20% rebate, a $250 sponsorship and league delivery; its gallery has two
// prepay orders worth $100 before tax and one refunded order.
test.use({ storageState: "e2e/.auth/owner.json" });

const JOB = "e2e00000-0000-4000-8000-0000000000b5";

test("gallery-live notice to close-out, with the amounts owed listed", async ({ page }) => {
  // 1. The office ticks Galleries live; the notice waits in the queue.
  await page.goto(`/jobs/${JOB}`);
  const card = page.locator("#delivery");
  await card.getByLabel("Order deadline (optional)").fill("2026-06-01");
  await card.getByRole("button", { name: "Galleries are live" }).click();
  await expect(card.getByText(/since/)).toBeVisible();

  const before = (await sentMail()).length;
  await page.goto("/queue");
  await page.getByRole("group").filter({ hasText: "Galleries are live" }).locator("summary").first().click();
  const draft = page.locator("form").filter({ has: page.locator('input[name="to"][value="sam@creek.e2e.test"]') }).first();
  await expect(draft).toBeVisible();
  await draft.getByRole("button", { name: "Approve" }).click();
  await expect.poll(async () => (await sentMail()).length - before).toBe(1);
  const [notice] = (await sentMail()).slice(before);
  expect(notice.to).toBe("josh-test@e2e.test");
  expect(notice.body).toContain("https://shop.e2e.test/creek");
  expect(notice.body).toContain("CREEK10");
  expect(notice.body).toContain("Mon, Jun 1, 2026");

  // 2. The lab delivers.
  await page.goto("/production");
  await page.locator("summary").filter({ hasText: "No lab set" }).click();
  const row = page.locator("li").filter({ hasText: "Test Creek Softball Spring 2026" }).last();
  await row.getByRole("button", { name: "Mark delivered" }).click();
  await row.getByRole("button", { name: "Yes" }).click();
  await expect.poll(async () => (await admin().from("jobs").select("delivered_at").eq("id", JOB).single()).data?.delivered_at).not.toBeNull();

  // 3. Two weeks pass, and the daily clock does the close-out.
  await admin().from("jobs").update({ delivered_at: new Date(Date.now() - 15 * 86_400_000).toISOString() }).eq("id", JOB);
  await page.goto("/queue");
  await page.getByRole("button", { name: "Check what is due today" }).click();
  await expect(page.getByRole("main").getByText(/Queued 1 draft/)).toBeVisible();
  const { data: closeout } = await admin().from("agent_actions").select("draft").eq("action_type_key", "delivery.closeout").single();
  expect((closeout?.draft as { subject: string }).subject).toBe("Test Creek Softball: thank you for Spring 2026");

  // 4. The amounts owed are listed on the job: 20% of $100, the sponsorship, the box.
  await page.goto(`/jobs/${JOB}`);
  await expect(card.getByText("20% of $100.00 prepay sales before tax (2 orders).")).toBeVisible();
  await expect(card.getByText("$20.00", { exact: true })).toBeVisible();
  await expect(card.getByText("$250.00", { exact: true })).toBeVisible();
  await expect(card.getByText("Drop off the league delivery box")).toBeVisible();
  await expect(card.getByText(/Close-out email drafted/)).toBeVisible();

  // 5. The rebate check goes out and is closed with a note.
  const rebate = card.locator("li").filter({ hasText: "20% Rebate" });
  await rebate.getByRole("button", { name: "Close" }).click();
  await rebate.getByLabel("Note").fill("Check 1041 mailed");
  await rebate.getByRole("button", { name: "Close it" }).click();
  await expect(rebate.getByText(/Closed .*Check 1041 mailed/)).toBeVisible();

  await page.goto("/obligations");
  await expect(page.getByRole("main").getByText("$250.00").first()).toBeVisible();
  const { data: rows } = await admin().from("job_obligations").select("kind, amount, status").eq("job_id", JOB).order("kind");
  expect(rows).toEqual([
    { kind: "delivery_box", amount: null, status: "open" },
    { kind: "rebate", amount: 20, status: "closed" },
    { kind: "sponsorship", amount: 250, status: "open" },
  ]);
});
