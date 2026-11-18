import "server-only";

import readXlsxFile from "read-excel-file/node";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROSTER_BUCKET } from "./files";
import { parseCsv, readRoster, type Cell, type RosterRead, type Table } from "./read";

// The roster worker, first part: a spreadsheet upload becomes teams with
// head counts. A server job (service role), started only after the caller
// has passed an RLS check on the job. It stores no child's name: the raw
// file stays in the private bucket and only team rows are written.
//
// PDFs, photos and old .xls files are left for a person (and, later, the
// agent's reader); they get a version row that says so.

const CSV = "text/csv";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_READ_BYTES = 10 * 1024 * 1024;

export type ProcessResult = { status: "processing" | "needs_answers" | "failed"; teams: number; added: number; questions: string[] };

async function tablesFrom(mime: string, bytes: Buffer): Promise<Table[] | null> {
  if (mime === CSV) return [{ name: "roster", rows: parseCsv(new TextDecoder("utf-8").decode(bytes)) }];
  if (mime === XLSX) return (await readXlsxFile(bytes)).map((s) => ({ name: s.sheet, rows: s.data as unknown as Cell[][] }));
  return null;
}

const key = (name: string, division: string | null) =>
  `${name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}|${(division ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;

export async function processRosterFile(fileId: string): Promise<ProcessResult> {
  const admin = createAdminClient();
  const { data: file } = await admin
    .from("roster_files")
    .select("id, company_id, job_id, storage_path, file_name, mime_type, size_bytes")
    .eq("id", fileId)
    .single();
  if (!file) throw new Error("roster file not found");

  let read: RosterRead;
  let failed: string | null = null;
  try {
    if (file.mime_type !== CSV && file.mime_type !== XLSX) {
      read = { teams: [], players: 0, questions: [`${file.file_name} is not a spreadsheet we can read yet, so a person needs to read it and add the teams.`] };
    } else if (file.size_bytes > MAX_READ_BYTES) {
      read = { teams: [], players: 0, questions: [`${file.file_name} is too large to read automatically.`] };
    } else {
      const { data: blob, error } = await admin.storage.from(ROSTER_BUCKET).download(file.storage_path);
      if (error || !blob) throw new Error("could not open the file");
      const tables = await tablesFrom(file.mime_type, Buffer.from(await blob.arrayBuffer()));
      read = readRoster(tables ?? []);
    }
  } catch {
    failed = "The file could not be opened as a spreadsheet.";
    read = { teams: [], players: 0, questions: [failed] };
  }

  // Match against the teams already on the job. A roster team fills in what
  // is empty and refreshes its own count; it never overwrites what a person typed.
  const { data: existing } = await admin
    .from("teams")
    .select("id, name, division, coach_name, player_count, source")
    .eq("job_id", file.job_id);
  const byKey = new Map((existing ?? []).map((t) => [key(t.name, t.division), t]));
  let added = 0;
  for (const t of read.teams) {
    const have = byKey.get(key(t.name, t.division));
    if (!have) {
      const { error } = await admin.from("teams").insert({
        company_id: file.company_id,
        job_id: file.job_id,
        name: t.name,
        division: t.division,
        coach_name: t.coach,
        player_count: t.players || null,
        source: "roster",
      });
      if (!error) added++;
    } else {
      const patch: { player_count?: number; coach_name?: string } = {};
      if (t.players && (have.source === "roster" || have.player_count === null)) patch.player_count = t.players;
      if (t.coach && !have.coach_name) patch.coach_name = t.coach;
      if (Object.keys(patch).length) await admin.from("teams").update(patch).eq("id", have.id);
    }
  }

  const { data: last } = await admin
    .from("roster_versions")
    .select("version")
    .eq("job_id", file.job_id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  // "ready" is kept for a version with its standardized Captura file, which
  // this step does not make yet; a clean read stays "processing" until then.
  const status = failed ? "failed" : read.questions.length ? "needs_answers" : "processing";
  const { error: versionError } = await admin.from("roster_versions").insert({
    company_id: file.company_id,
    job_id: file.job_id,
    version: (last?.version ?? 0) + 1,
    file_ids: [file.id],
    status,
    subject_count: read.players || null,
    team_count: read.teams.length || null,
    questions: read.questions.length ? read.questions : null,
    diff: { added },
    error: failed,
  });
  if (versionError) throw new Error(`could not record the roster read: ${versionError.message}`);

  return { status, teams: read.teams.length, added, questions: read.questions };
}
