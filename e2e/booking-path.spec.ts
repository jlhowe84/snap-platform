import { expect, test } from "@playwright/test";
import { admin } from "./helpers";

// Spec path 1: a league goes from offer to signed agreement to complete
// schedule. The office holds a date on the season board, makes a portal link,
// and the coordinator signs and builds the schedule from that link.
const ORG = "e2e00000-0000-4000-8000-0000000000a1";

test("offer to signed agreement to complete schedule", async ({ browser }) => {
  const db = admin();
  const office = await browser.newContext({ storageState: "e2e/.auth/owner.json" });
  const page = await office.newPage();

  // Office: build the spring board and hold a date for the returning league.
  await page.goto("/season?season=Spring%202027");
  await page.getByRole("button", { name: "Add returning leagues" }).click();
  await expect(page.getByText("Test Valley Soccer").first()).toBeVisible();
  await page.locator('input[name="date"]').first().fill("2027-04-17");
  await page.getByRole("button", { name: "Hold", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Held 1" })).toBeVisible();

  const { data: job } = await db.from("jobs").select("id, status").eq("org_id", ORG).eq("status", "held").single();
  expect(job, "the hold created a held job").toBeTruthy();

  // Office: make a portal link for the coordinator.
  await page.goto(`/jobs/${job!.id}`);
  await page.getByRole("button", { name: "Make portal link" }).click();
  const url = await page.locator('input[readonly]').first().inputValue();
  expect(url).toMatch(/\/p\//);

  // Coordinator: a fresh browser opens the link.
  const coord = await browser.newContext();
  const portal = await coord.newPage();
  await portal.goto(new URL(url).pathname);
  await expect(portal).toHaveURL(new RegExp(`/portal/${job!.id}`));

  // Coordinator: initial and sign; the hold becomes a confirmed job.
  await portal.getByRole("link", { name: "Read and sign" }).click();
  await portal.getByLabel("Initials for Weather policy").fill("PC");
  await portal.locator('input[name="signer_name"]').fill("Pat Coordinator");
  await portal.locator('input[name="agree"]').check();
  await portal.getByRole("button", { name: "Sign and confirm our date" }).click();
  await expect.poll(async () => (await db.from("jobs").select("status").eq("id", job!.id).single()).data?.status).toBe("planning");
  const { data: sig } = await db.from("agreement_signatures").select("signer_name, initials").eq("job_id", job!.id).single();
  expect(sig?.signer_name).toBe("Pat Coordinator");

  await portal.goto(`/portal/${job!.id}/schedule`);
  await expect(portal.getByText(/Teams \(/)).toBeVisible();

  // Coordinator: add two teams. Submit is blocked until both have a slot.
  for (const name of ["U10 Lions", "U12 Tigers"]) {
    await portal.getByLabel("New team name").fill(name);
    await portal.getByRole("button", { name: "Add team" }).click();
    await expect(portal.getByText(`Teams (${name === "U10 Lions" ? 1 : 2})`)).toBeVisible();
  }
  await expect(portal.getByText("U10 Lions has no time slot.")).toBeVisible();

  // Coordinator: place every team, then submit. The schedule is complete.
  await portal.getByRole("button", { name: /Place the 2 remaining teams/ }).click();
  await expect(portal.getByText("has no time slot")).toHaveCount(0);
  await portal.getByRole("button", { name: "Submit schedule" }).click();
  await expect
    .poll(async () => (await db.from("schedules").select("status").eq("job_id", job!.id).single()).data?.status)
    .toBe("submitted");
  const { count } = await db.from("schedule_slots").select("id", { count: "exact", head: true }).eq("job_id", job!.id).not("team_id", "is", null);
  expect(count).toBe(2);

  await coord.close();
  await office.close();
});
