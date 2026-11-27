import { expect, test } from "@playwright/test";
import { admin } from "./helpers";
import { deliverEmail, sentMail } from "./fake-gmail";

// Spec path 2: an inbound email becomes a reply a person approves and sends.
// The email arrives in the fake Gmail, the desk reads it in, a person writes
// and sends the reply, and test mode delivers it only to the test address.
test.use({ storageState: "e2e/.auth/owner.json" });

test("inbound email to a sent reply, held to the test address", async ({ page }) => {
  await deliverEmail({
    mailbox: "support@e2e.test",
    threadId: "e2e-thread-1",
    from: "Parent Person <parent@family.e2e.test>",
    subject: "Where is my order?",
    body: "Hi, I ordered photos for my son two weeks ago. When will they arrive?",
  });

  await page.goto("/support");
  await page.getByRole("button", { name: "Check for new mail" }).click();
  await expect(page.getByRole("main").getByText("1 new message.")).toBeVisible();
  await page.getByRole("link", { name: /Where is my order\?/ }).first().click();
  await expect(page.getByText("When will they arrive?")).toBeVisible();

  const { data: convo } = await admin().from("support_conversations").select("id, customer_email, status").eq("gmail_thread_id", "e2e-thread-1").single();
  expect(convo?.customer_email).toBe("parent@family.e2e.test");

  const before = (await sentMail()).length;
  await page.getByRole("textbox", { name: "Reply", exact: true }).fill("Hi, thanks for writing. Your order shipped yesterday and should arrive this week.");
  await page.getByRole("button", { name: "Send test" }).click();
  await expect(page.getByRole("main").getByText(/Test mode is on, so this went only to josh-test@e2e.test/)).toBeVisible();

  const sent = (await sentMail()).slice(before);
  expect(sent).toHaveLength(1);
  expect(sent[0].mailbox).toBe("support@e2e.test");
  expect(sent[0].to).toBe("josh-test@e2e.test");
  expect(sent[0].raw).not.toContain("To: parent@family.e2e.test");
  expect(sent[0].body).toContain("Your order shipped yesterday");
});

test("a drafted offer is approved in the queue and sent to the test address", async ({ page }) => {
  await page.goto("/season?season=Spring%202027");
  await page.getByRole("button", { name: "Add returning leagues" }).click();
  const league = page.locator("article").filter({ hasText: "Test Ridge Baseball" });
  await league.getByRole("button", { name: "Draft the offer email" }).click();
  await expect.poll(async () => (await admin().from("agent_actions").select("id").eq("action_type_key", "offers.send").eq("status", "proposed")).data?.length).toBe(1);

  const before = (await sentMail()).length;
  await page.goto("/queue");
  // Each draft folds open from its one-line summary.
  await page.getByRole("group").filter({ hasText: "Season offer" }).locator("summary").first().click();
  const card = page.locator("form").filter({ has: page.locator('input[name="to"][value="robin@ridge.e2e.test"]') }).first();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Approve" }).click();
  await expect.poll(async () => (await sentMail()).length - before).toBe(1);

  const [mail] = (await sentMail()).slice(before);
  expect(mail.to).toBe("josh-test@e2e.test");
  expect(mail.subject).toContain("robin@ridge.e2e.test");
  const { data: action } = await admin().from("agent_actions").select("status").eq("action_type_key", "offers.send").single();
  expect(action?.status).toBe("sent");
});
