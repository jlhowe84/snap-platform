import { expect, test } from "@playwright/test";
import { admin } from "./helpers";

// Spec path 3: a shift goes from published to accepted to paid. The office
// adds and publishes shifts, the crew member takes one on their phone, and
// the owner turns it into pay, approves it and marks it paid.
const DAY = "e2e00000-0000-4000-8000-0000000000d3";
const CREW = "e2e00000-0000-4000-8000-0000000000e1";

test("shift published, accepted on a phone, then paid", async ({ browser }) => {
  const db = admin();
  const office = await browser.newContext({ storageState: "e2e/.auth/owner.json" });
  const page = await office.newPage();

  // Office: one photographer shift, published to Level 1.
  await page.goto(`/staffing/${DAY}`);
  for (const pos of ["poser", "coordinator", "photo_attendant"]) await page.locator(`input[name="${pos}"]`).fill("0");
  await page.locator('input[name="photographer"]').fill("1");
  await page.getByRole("button", { name: "Add shifts" }).click();
  await page.getByRole("button", { name: "Publish 1 to Level 1" }).click();
  await expect
    .poll(async () => (await db.from("shifts").select("status").eq("photo_day_id", DAY).single()).data?.status)
    .toBe("open");

  // Crew: takes it on a phone.
  const crew = await browser.newContext({ storageState: "e2e/.auth/crew.json", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await crew.newPage();
  await phone.goto("/shifts");
  await phone.getByRole("button", { name: "I'll take it" }).first().click();
  await expect
    .poll(async () => (await db.from("shifts").select("status, crew_member_id").eq("photo_day_id", DAY).single()).data)
    .toEqual({ status: "filled", crew_member_id: CREW });

  // Owner: pay for the dates, approve, mark paid. 4 hours at $25.
  await page.goto("/crew/pay?from=2027-04-26&to=2027-05-09");
  await page.getByRole("button", { name: "Add pay for shifts worked in these dates" }).click();
  await page.getByRole("button", { name: "Approve 1 pending" }).click();
  await page.getByRole("button", { name: "Mark 1 approved as paid" }).click();
  await expect
    .poll(async () => (await db.from("pay_lines").select("status, hours, total").eq("crew_member_id", CREW).single()).data)
    .toMatchObject({ status: "paid", hours: 4 });
  const { data: line } = await db.from("pay_lines").select("base").eq("crew_member_id", CREW).single();
  expect(Number(line?.base)).toBe(100);

  // Crew: sees it as paid.
  await phone.goto("/pay");
  await expect(phone.getByText("Paid").first()).toBeVisible();
  await crew.close();
  await office.close();
});
