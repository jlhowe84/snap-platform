import { expect, test } from "@playwright/test";
import { admin } from "./helpers";
import { sentMail } from "./fake-gmail";

// The parent side of the help center (module 13): a parent with no account
// books a makeup on a phone, gets the confirmation (held to the test
// address), and cancels from the link in it. The spec's "parent gets a
// gallery link" path waits until the help center can send links.
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("parent books a makeup on a phone and cancels it", async ({ page }) => {
  const before = (await sentMail()).length;
  await page.goto("/help/e2e-photo/makeup");
  // Tomorrow, so every time of day is still open whenever the test runs.
  await page.getByRole("link", { name: /times open/ }).nth(1).click();
  await page.waitForURL(/\?d=/);
  await page.waitForLoadState("networkidle");
  await page.getByRole("radio", { name: "9:00 AM" }).check({ force: true });
  await page.locator('input[name="player"]').fill("Sam Player");
  await page.locator('input[name="league"]').fill("Test Valley Soccer");
  await page.locator('input[name="parent_name"]').fill("Parent Person");
  await page.locator('input[name="email"]').fill("parent@family.e2e.test");
  await page.getByRole("button", { name: "Book this time" }).click();
  await expect(page.getByRole("heading", { name: "You are booked" })).toBeVisible({ timeout: 20_000 });

  const { data: booking } = await admin().from("makeup_bookings").select("status, player, email").eq("email", "parent@family.e2e.test").single();
  expect(booking).toMatchObject({ status: "booked", player: "Sam Player" });

  // The parent's confirmation and the office alert, both to the test address.
  await expect.poll(async () => (await sentMail()).length - before).toBeGreaterThanOrEqual(1);
  const sent = (await sentMail()).slice(before);
  expect(sent.every((m) => m.to === "josh-test@e2e.test")).toBe(true);
  expect(sent.some((m) => m.subject.includes("parent@family.e2e.test"))).toBe(true);

  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Cancel this session" }).click();
  await page.getByRole("button", { name: "Yes, cancel it" }).click();
  await expect(page.getByRole("heading", { name: "Session cancelled" })).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(async () => (await admin().from("makeup_bookings").select("status").eq("email", "parent@family.e2e.test").single()).data?.status)
    .toBe("cancelled");
});
