import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { admin, COMPANY_ID } from "./helpers";
import { hashHelperKey } from "../lib/helper/evidence";

// Wave C: the production iMac helper makes a job's folders when it starts
// production and reports image counts, and the job page shows the import and
// the NAS copy as done. The real script runs against temporary folders
// standing in for PHOTO IMPORT and the NAS.
test.use({ storageState: "e2e/.auth/owner.json" });

const JOB = "e2e00000-0000-4000-8000-0000000000b6";
const KEY = `snaph_${"A".repeat(43)}`;

test("helper makes the job folder, counts images, and the job shows import and NAS done", async ({ page }) => {
  const root = mkdtempSync(join(tmpdir(), "snap-helper-"));
  const photoImport = join(root, "PHOTO IMPORT");
  const nas = join(root, "NAS", "PHOTOS");
  mkdirSync(join(photoImport, "~Job_Folder_Template", "Photographer 1"), { recursive: true });
  mkdirSync(join(photoImport, "~Session Template", "Capture"), { recursive: true });
  writeFileSync(join(photoImport, "~Session Template", "~Session Template.cosessiondb"), "");
  mkdirSync(nas, { recursive: true });

  const { error } = await admin()
    .from("helper_devices")
    .insert({ company_id: COMPANY_ID, name: "Test iMac", token_hash: hashHelperKey(KEY), created_at: new Date(Date.now() - 60_000).toISOString() });
  expect(error).toBeNull();
  await admin().from("jobs").update({ production_started_at: new Date().toISOString() }).eq("id", JOB);

  const env = {
    ...process.env,
    HOME: root,
    SNAP_PLATFORM_URL: "http://localhost:3100",
    SNAP_HELPER_KEY: KEY,
    SNAP_PHOTO_IMPORT: photoImport,
    SNAP_NAS_PHOTOS: nas,
  };
  const helper = (...args: string[]) => execFileSync("python3", ["helper/snap-helper.py", ...args], { env, encoding: "utf8" });

  // 1. First run makes the folder and session from the templates.
  expect(helper("run")).toContain("made: 26 Test Creek Softball Fall (with session)");
  const folder = join(photoImport, "26 Test Creek Softball Fall");
  expect(readdirSync(folder).sort()).toEqual(["Photographer 1", "Session Test Creek Softball Fall"]);
  expect(readdirSync(join(folder, "Session Test Creek Softball Fall"))).toContain("Session Test Creek Softball Fall.cosessiondb");
  const { data: job } = await admin().from("jobs").select("nas_folder").eq("id", JOB).single();
  expect(job?.nas_folder).toBe("26 Test Creek Softball Fall");

  // 2. Images are imported, then copied to the NAS with a receipt.
  for (let i = 0; i < 3; i++) writeFileSync(join(folder, "Photographer 1", `DSC_000${i}.NEF`), "x");
  writeFileSync(join(folder, "Photographer 1", "notes.txt"), "not an image");
  expect(helper("run")).toContain("reported 1 jobs");
  const nasJob = join(nas, "26 Test Creek Softball Fall", "Photographer 1");
  mkdirSync(nasJob, { recursive: true });
  for (let i = 0; i < 3; i++) writeFileSync(join(nasJob, `DSC_000${i}.NEF`), "x");
  writeFileSync(join(nas, "26 Test Creek Softball Fall", "verify-receipt.txt"), "VERIFIED");
  helper("run");

  const { data: e } = await admin().from("job_folder_evidence").select("*").eq("job_id", JOB).single();
  expect(e).toMatchObject({ import_images: 3, import_images_max: 3, upload_images: 3, upload_receipt: true, session_exists: true });
  expect(e?.import_done_at).not.toBeNull();
  expect(e?.upload_done_at).not.toBeNull();

  // 3. The job page shows it; the report held counts and folder names only.
  await page.goto(`/jobs/${JOB}`);
  const card = page.locator("#folders");
  await expect(card.getByText(/Import done/)).toBeVisible();
  await expect(card.getByText(/On the NAS/)).toBeVisible();
  await expect(card.getByText("3 images, receipt")).toBeVisible();
  expect(JSON.stringify(e)).not.toContain("DSC_");

  // 4. A wrong key is refused.
  let refused = "";
  try {
    execFileSync("python3", ["helper/snap-helper.py", "run"], { env: { ...env, SNAP_HELPER_KEY: `snaph_${"B".repeat(43)}` }, encoding: "utf8" });
  } catch (err) {
    refused = String((err as { stdout?: string }).stdout ?? "");
  }
  expect(refused).toContain("the platform refused the helper (401)");
});
