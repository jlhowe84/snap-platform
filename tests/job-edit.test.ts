import { describe, expect, it } from "vitest";
import { parseDayEdit, parseJobEdit, parseLinksEdit } from "@/lib/jobs/edit";

const job = {
  name: " Spring Baseball ", org_id: "", status: "planning", production_stage: "", lab: "alkit", job_type: "photo_day",
  program: "sports", venue: "on_location", sale_mode: "prepay", sports: "Baseball, Softball,, ", expected_teams: "", expected_subjects: "120",
  delivery_method: "", team_photo_type: "composite", sponsors: "", promo: "", coupon: "spring26",
};

describe("job details form", () => {
  it("reads the form, turning blanks into nothing and tidying lists", () => {
    const r = parseJobEdit(job, "planning");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.values).toMatchObject({
      name: "Spring Baseball", org_id: null, lab: "alkit", sports: ["Baseball", "Softball"], expected_teams: null,
      expected_subjects: 120, delivery_method: null, sponsors: null, promo: null, coupon: "SPRING26", production_stage: null,
    });
  });
  it("reads sponsors as yes, no or unknown", () => {
    const yes = parseJobEdit({ ...job, sponsors: "yes" }, "planning");
    const no = parseJobEdit({ ...job, sponsors: "no" }, "planning");
    expect(yes.ok && yes.values.sponsors).toBe(true);
    expect(no.ok && no.values.sponsors).toBe(false);
  });
  it("lets the status move by hand between the working statuses", () => {
    expect(parseJobEdit({ ...job, status: "at_lab" }, "planning").ok).toBe(true);
    expect(parseJobEdit({ ...job, status: "cancelled" }, "delivered").ok).toBe(true);
  });
  it("keeps held and released with the Season board", () => {
    expect(parseJobEdit({ ...job, status: "planning" }, "held").ok).toBe(false);
    expect(parseJobEdit({ ...job, status: "held" }, "planning").ok).toBe(false);
    expect(parseJobEdit({ ...job, status: "released" }, "planning").ok).toBe(false);
    // Other details of a held job can still be saved.
    expect(parseJobEdit({ ...job, status: "held" }, "held").ok).toBe(true);
  });
  it("refuses a missing name, a bad lab and a bad count, in plain words", () => {
    const noName = parseJobEdit({ ...job, name: "  " }, "planning");
    expect(noName).toEqual({ ok: false, message: "The job needs a name, up to 200 characters." });
    expect(parseJobEdit({ ...job, lab: "walgreens" }, "planning").ok).toBe(false);
    expect(parseJobEdit({ ...job, expected_subjects: "-4" }, "planning").ok).toBe(false);
    expect(parseJobEdit({ ...job, coupon: "two words" }, "planning").ok).toBe(false);
  });
});

const day = {
  label: "", start_time: "09:00", end_time: "13:30:00", location_name: " Main Field ", address: "", city: "Pottstown", state: "PA", zip: "19464",
  location_details: "", indoor: "outdoor", alt_indoor_location: "High school gym", stations: "3", notes: "",
};

describe("photo day form", () => {
  it("reads times, place and stations", () => {
    const r = parseDayEdit(day);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.values).toMatchObject({
      label: null, start_time: "09:00", end_time: "13:30", location_name: "Main Field", address: null, indoor: false, stations: 3, notes: null,
    });
  });
  it("leaves times and indoor unknown when blank", () => {
    const r = parseDayEdit({ ...day, start_time: "", end_time: "", indoor: "" });
    expect(r.ok && r.values).toMatchObject({ start_time: null, end_time: null, indoor: null });
  });
  it("refuses an end before the start, and stations out of range", () => {
    expect(parseDayEdit({ ...day, end_time: "08:00" })).toEqual({ ok: false, message: "The end time has to be after the start time." });
    expect(parseDayEdit({ ...day, stations: "0" })).toEqual({ ok: false, message: "Stations are 1 to 20." });
    expect(parseDayEdit({ ...day, start_time: "25:00" }).ok).toBe(false);
  });
  it("never carries a date or a status", () => {
    const r = parseDayEdit({ ...day, date: "2027-01-01", status: "cancelled" });
    expect(r.ok && Object.keys(r.values)).not.toContain("date");
    expect(r.ok && Object.keys(r.values)).not.toContain("status");
  });
});

describe("job links form", () => {
  it("reads a gallery number and https links", () => {
    const r = parseLinksEdit({ captura_gallery_id: "123456", online_shop_url: "https://shop.example.com/a", drive_folder_url: "" });
    expect(r).toEqual({ ok: true, values: { captura_gallery_id: 123456, online_shop_url: "https://shop.example.com/a", drive_folder_url: null } });
  });
  it("refuses a link that is not https and a gallery that is not a number", () => {
    expect(parseLinksEdit({ captura_gallery_id: "", online_shop_url: "javascript:alert(1)", drive_folder_url: "" }).ok).toBe(false);
    expect(parseLinksEdit({ captura_gallery_id: "abc", online_shop_url: "", drive_folder_url: "" }).ok).toBe(false);
  });
});
