import { describe, expect, it } from "vitest";
import { defaultFolderName, evidenceDone, hashHelperKey, helperJobs, HelperReport, looksLikeHelperKey, newHelperKey } from "@/lib/helper/evidence";

describe("helper keys", () => {
  it("makes a key that only its hash identifies", () => {
    const { key, hash } = newHelperKey();
    expect(looksLikeHelperKey(key)).toBe(true);
    expect(hash).toBe(hashHelperKey(key));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(looksLikeHelperKey("snaph_short")).toBe(false);
  });
});

describe("folder names", () => {
  it("uses the first photo day's year and a safe job name", () => {
    expect(defaultFolderName("Delco Phantoms Ice Hockey", "2026-11-21", "2026-11-27")).toBe("26 Delco Phantoms Ice Hockey");
    expect(defaultFolderName("A/B: League ", null, "2027-01-03")).toBe("27 A-B- League");
  });
});

describe("which jobs the helper looks at", () => {
  const base = { nas_folder: null, days: ["2026-11-14"] };
  const opts = { connectedAt: "2026-11-20T00:00:00Z", today: "2026-11-27" };

  it("makes folders only for jobs that started production after the helper was connected", () => {
    const jobs = helperJobs(
      [
        { ...base, id: "new", name: "New", status: "in_production", production_started_at: "2026-11-25T10:00:00Z" },
        { ...base, id: "old", name: "Old", status: "in_production", production_started_at: "2026-11-01T10:00:00Z" },
      ],
      new Map(),
      opts,
    );
    expect(jobs.map((j) => [j.id, j.create, j.import, j.upload])).toEqual([
      ["new", true, true, true],
      ["old", false, true, true],
    ]);
  });

  it("stops watching once the evidence is in, and after 60 days", () => {
    const jobs = helperJobs(
      [
        { ...base, id: "lab", name: "Lab", status: "at_lab", production_started_at: null },
        { ...base, id: "done", name: "Done", status: "delivered", production_started_at: null },
        { ...base, id: "stale", name: "Stale", status: "at_lab", production_started_at: null, days: ["2026-08-01"] },
      ],
      new Map([["done", { import_done_at: "x", upload_done_at: "y" }]]),
      opts,
    );
    expect(jobs.map((j) => [j.id, j.import, j.upload])).toEqual([["lab", false, true]]);
  });

  it("uses the folder name the office set", () => {
    const [j] = helperJobs([{ id: "a", name: "Long League Name", status: "in_production", nas_folder: "26 Short", production_started_at: null, days: [] }], new Map(), opts);
    expect(j.folder).toBe("26 Short");
  });
});

describe("when the evidence says done", () => {
  const e = { import_parts: [{ name: "Photographer 1", images: 300 }, { name: "Photographer 2", images: 0 }], import_images: 300, import_images_max: 300, session_images: 0, upload_exists: null, upload_images: null };

  it("needs a filled part for every photographer booked", () => {
    expect(evidenceDone(e, 1).importDone).toBe(true);
    expect(evidenceDone(e, 2).importDone).toBe(false);
    expect(evidenceDone(e, 0).importDone).toBe(true);
  });

  it("falls back to the session when there are no part folders", () => {
    expect(evidenceDone({ ...e, import_parts: [], session_images: 10 }, 2).importDone).toBe(true);
  });

  it("needs the NAS to hold at least the most images seen in PHOTO IMPORT", () => {
    expect(evidenceDone({ ...e, upload_exists: true, upload_images: 299 }, 1).uploadDone).toBe(false);
    expect(evidenceDone({ ...e, import_images: 0, upload_exists: true, upload_images: 300 }, 1).uploadDone).toBe(true);
    expect(evidenceDone({ ...e, upload_exists: null, upload_images: null }, 1).uploadDone).toBe(false);
  });
});

describe("reports", () => {
  it("refuses paths and file names dressed as folder names", () => {
    const job = { id: "e2e00000-0000-4000-8000-0000000000b6", folder: "../etc" };
    expect(HelperReport.safeParse({ version: "1", photo_import_found: true, nas_mounted: false, jobs: [job] }).success).toBe(false);
    expect(HelperReport.safeParse({ version: "1", photo_import_found: true, nas_mounted: false, jobs: [{ ...job, folder: "26 Good" }] }).success).toBe(true);
  });
});
