import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/database.types";
import { EDITABLE_KEYS } from "@/lib/settings/editable";

// The lookups Ask SNAP may make. Every one is a read through the asker's own
// Supabase client, so Postgres RLS decides what comes back: Ask SNAP can never
// show a person something they could not open themselves. There are no write
// tools here on purpose.

type Db = SupabaseClient<Database>;
export type AskContext = { supabase: Db; viewerId: string };

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const limit = z.number().int().min(1).max(50).optional();
const JOB_STATUS = ["held", "planning", "in_production", "at_lab", "delivered", "complete", "archived", "cancelled", "released"] as const;

/** Text typed by the model goes inside a PostgREST filter: keep only plain characters. */
export function safeSearch(text: string) {
  return text.replace(/[^\p{L}\p{N} '&.-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

const MAX_RESULT = 12_000;
function pack(value: unknown) {
  const text = JSON.stringify(value);
  return text.length > MAX_RESULT ? `${text.slice(0, MAX_RESULT)}… (cut off: ask for less at once)` : text;
}

type ToolDef<S extends z.ZodType> = {
  description: string;
  input: S;
  schema: Anthropic.Tool["input_schema"];
  run: (input: z.infer<S>, ctx: AskContext) => Promise<unknown>;
};
const tool = <S extends z.ZodType>(def: ToolDef<S>) => def;
const obj = (properties: Record<string, unknown>, required: string[] = []): Anthropic.Tool["input_schema"] => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const TOOLS = {
  find_jobs: tool({
    description:
      "Search jobs (one league's photo day job in one season). Filter by words in the job or league name, status, season label like \"Spring 2027\", or the dates of its photo days. Returns id, name, league, status, season, first and last photo day.",
    input: z.object({
      search: z.string().max(100).optional(),
      status: z.enum(JOB_STATUS).optional(),
      season: z.string().max(40).optional(),
      date_from: date.optional(),
      date_to: date.optional(),
      limit,
    }),
    schema: obj({
      search: { type: "string", description: "Words from the job or league name" },
      status: { type: "string", enum: [...JOB_STATUS] },
      season: { type: "string", description: "Season label, for example Spring 2027" },
      date_from: { type: "string", description: "YYYY-MM-DD: photo days on or after" },
      date_to: { type: "string", description: "YYYY-MM-DD: photo days on or before" },
      limit: { type: "integer", description: "At most 50, default 25" },
    }),
    run: async (i, { supabase }) => {
      let q = supabase
        .from("job_overview")
        .select("id, name, org_id, org_name, status, production_stage, season, first_date, last_date, photo_day_count, expected_teams, sports")
        .order("first_date", { ascending: true, nullsFirst: false })
        .limit(i.limit ?? 25);
      const s = i.search ? safeSearch(i.search) : "";
      if (s) q = q.or(`name.ilike.%${s}%,org_name.ilike.%${s}%`);
      if (i.status) q = q.eq("status", i.status);
      if (i.season) q = q.eq("season", safeSearch(i.season));
      if (i.date_from) q = q.gte("last_date", i.date_from);
      if (i.date_to) q = q.lte("first_date", i.date_to);
      const { data, error } = await q;
      if (error) throw error;
      return { jobs: data };
    },
  }),

  get_job: tool({
    description:
      "Everything about one job: details, photo days and how ready each one is (agreement, planning form, roster, schedule), date holds, teams, the current roster version, open tasks and links. Use the id from find_jobs.",
    input: z.object({ job_id: z.uuid() }),
    schema: obj({ job_id: { type: "string", description: "The job's id (uuid)" } }, ["job_id"]),
    run: async ({ job_id }, { supabase }) => {
      const [job, days, ready, holds, schedules, roster, teams, tasks, form, signed, links] = await Promise.all([
        supabase.from("jobs").select("id, name, status, production_stage, program, job_type, sports, venue, sale_mode, delivery_method, lab, expected_teams, expected_subjects, team_photo_type, notes, org_id, organizations(name)").eq("id", job_id).maybeSingle(),
        supabase.from("photo_days").select("id, date, original_date, status, start_time, end_time, label, location_name, city, state, indoor, stations, notes").eq("job_id", job_id).order("date"),
        supabase.from("photo_day_readiness").select("photo_day_id, date, agreement_signed, planning_form, roster, schedule, captura_gallery").eq("job_id", job_id),
        supabase.from("date_holds").select("photo_day_id, status, held_on, expires_on, confirmed_at, released_at, released_reason").eq("job_id", job_id),
        supabase.from("schedules").select("photo_day_id, status, stations, submitted_at").eq("job_id", job_id),
        supabase.from("roster_versions").select("version, status, subject_count, team_count, created_at, uploaded_to_captura_at").eq("job_id", job_id).order("version", { ascending: false }).limit(1),
        supabase.from("teams").select("name, division, coach_name, player_count").eq("job_id", job_id).order("division").order("name").limit(150),
        supabase.from("tasks").select("title, status, due_on, assignee_id").eq("job_id", job_id).in("status", ["todo", "in_progress", "waiting"]).order("due_on", { nullsFirst: false }).limit(40),
        supabase.from("planning_forms").select("sent_at, submitted_at").eq("job_id", job_id).maybeSingle(),
        supabase.from("agreement_signatures").select("signed_at, signer_name").eq("job_id", job_id).order("signed_at", { ascending: false }).limit(1),
        supabase.from("job_links").select("captura_gallery_id, online_shop_url, drive_folder_url").eq("job_id", job_id).maybeSingle(),
      ]);
      if (job.error) throw job.error;
      if (!job.data) return { found: false };
      return {
        job: job.data,
        photo_days: days.data,
        readiness: ready.data,
        date_holds: holds.data,
        schedules: schedules.data,
        current_roster: roster.data?.[0] ?? null,
        teams: teams.data,
        open_tasks: tasks.data,
        planning_form: form.data,
        agreement: signed.data?.[0] ?? null,
        links: links.data,
      };
    },
  }),

  find_leagues: tool({
    description: "Search leagues and other organizations SNAP works with by name. Returns id, name, type, sports, seasons and whether it is active.",
    input: z.object({ search: z.string().max(100).optional(), active_only: z.boolean().optional(), limit }),
    schema: obj({
      search: { type: "string", description: "Words from the league's name" },
      active_only: { type: "boolean" },
      limit: { type: "integer", description: "At most 50, default 25" },
    }),
    run: async (i, { supabase }) => {
      let q = supabase.from("organizations").select("id, name, short_name, org_type, active, sports, seasons, size_note").order("name").limit(i.limit ?? 25);
      const s = i.search ? safeSearch(i.search) : "";
      if (s) q = q.or(`name.ilike.%${s}%,short_name.ilike.%${s}%`);
      if (i.active_only) q = q.eq("active", true);
      const { data, error } = await q;
      if (error) throw error;
      return { leagues: data };
    },
  }),

  get_league: tool({
    description:
      "Everything about one league: details, money terms (rebate, sponsorship, parent discount), its contacts, its jobs, season offers and the latest notes. Use the id from find_leagues.",
    input: z.object({ org_id: z.uuid() }),
    schema: obj({ org_id: { type: "string", description: "The league's id (uuid)" } }, ["org_id"]),
    run: async ({ org_id }, { supabase }) => {
      const [org, terms, contacts, jobs, offers, notes] = await Promise.all([
        supabase.from("organizations").select("id, name, short_name, org_type, active, sports, seasons, relationship, size_note, history, website, phone, email, address").eq("id", org_id).maybeSingle(),
        supabase.from("organization_terms").select("rebate, sponsorship, parent_discount, delivery_method, services, team_photo_types, other_terms").eq("org_id", org_id).maybeSingle(),
        supabase.from("organization_contacts").select("role, is_primary, ended_on, contacts(full_name, role_title, email, phone, preferred_channel)").eq("org_id", org_id).limit(30),
        supabase.from("job_overview").select("id, name, status, season, first_date, last_date").eq("org_id", org_id).order("first_date", { ascending: false, nullsFirst: false }).limit(20),
        supabase.from("season_offers").select("season, stage, tier, priority_rank, offered_at, responded_at, declined_reason, notes").eq("org_id", org_id).order("season", { ascending: false }).limit(10),
        supabase.from("league_notes").select("kind, body, created_at").eq("org_id", org_id).order("created_at", { ascending: false }).limit(8),
      ]);
      if (org.error) throw org.error;
      if (!org.data) return { found: false };
      return { league: org.data, terms: terms.data, contacts: contacts.data, jobs: jobs.data, season_offers: offers.data, latest_notes: notes.data };
    },
  }),

  photo_days_between: tool({
    description:
      "Photo days in a date range across all jobs, with the job, location, stations and readiness of each, plus how many stations each date uses. Use for \"what is coming up\", \"what is on Saturday\" and \"what is not ready\".",
    input: z.object({ date_from: date, date_to: date }),
    schema: obj(
      { date_from: { type: "string", description: "YYYY-MM-DD" }, date_to: { type: "string", description: "YYYY-MM-DD" } },
      ["date_from", "date_to"],
    ),
    run: async (i, { supabase }) => {
      const [days, ready, capacity] = await Promise.all([
        supabase.from("photo_days").select("id, date, status, start_time, end_time, label, location_name, city, stations, job_id, jobs(name, status, organizations(name))").gte("date", i.date_from).lte("date", i.date_to).order("date").limit(120),
        supabase.from("photo_day_readiness").select("photo_day_id, agreement_signed, planning_form, roster, schedule, captura_gallery").gte("date", i.date_from).lte("date", i.date_to).limit(120),
        supabase.from("date_capacity").select("date, jobs, stations_used, stations_held").gte("date", i.date_from).lte("date", i.date_to).order("date").limit(120),
      ]);
      if (days.error) throw days.error;
      const byDay = new Map((ready.data ?? []).map((r) => [r.photo_day_id, r]));
      return {
        photo_days: (days.data ?? []).map((d) => ({ ...d, readiness: byDay.get(d.id) ?? null })),
        capacity_by_date: capacity.data,
      };
    },
  }),

  list_tasks: tool({
    description: "Tasks on the team's list. Choose whose (the asker's own, unassigned, or everyone's) and open or done. Can be narrowed to one job or to tasks due on or before a date.",
    input: z.object({
      whose: z.enum(["mine", "unassigned", "everyone"]),
      state: z.enum(["open", "done"]).optional(),
      job_id: z.uuid().optional(),
      due_by: date.optional(),
      limit,
    }),
    schema: obj(
      {
        whose: { type: "string", enum: ["mine", "unassigned", "everyone"] },
        state: { type: "string", enum: ["open", "done"], description: "Default open" },
        job_id: { type: "string" },
        due_by: { type: "string", description: "YYYY-MM-DD" },
        limit: { type: "integer", description: "At most 50, default 30" },
      },
      ["whose"],
    ),
    run: async (i, { supabase, viewerId }) => {
      let q = supabase.from("tasks").select("id, title, status, due_on, completed_at, notes, job_id, jobs(name), assignee:profiles!tasks_assignee_id_fkey(full_name)").limit(i.limit ?? 30);
      q = i.state === "done"
        ? q.eq("status", "done").order("completed_at", { ascending: false })
        : q.in("status", ["todo", "in_progress", "waiting"]).order("due_on", { nullsFirst: false });
      if (i.whose === "mine") q = q.eq("assignee_id", viewerId);
      if (i.whose === "unassigned") q = q.is("assignee_id", null);
      if (i.job_id) q = q.eq("job_id", i.job_id);
      if (i.due_by) q = q.lte("due_on", i.due_by);
      const { data, error } = await q;
      if (error) throw error;
      return { tasks: data };
    },
  }),

  queue_summary: tool({
    description: "What is waiting in the approval queue: drafts and proposals a person has not decided yet, counted by kind, with the oldest one's date.",
    input: z.object({}),
    schema: obj({}),
    run: async (_i, { supabase }) => {
      const { data, error } = await supabase.from("agent_actions").select("action_type_key, created_at").eq("status", "proposed").order("created_at").limit(500);
      if (error) throw error;
      const kinds = new Map<string, { waiting: number; oldest: string }>();
      for (const a of data ?? []) {
        const k = kinds.get(a.action_type_key);
        if (k) k.waiting++;
        else kinds.set(a.action_type_key, { waiting: 1, oldest: a.created_at });
      }
      return { waiting_total: data?.length ?? 0, by_kind: Object.fromEntries(kinds) };
    },
  }),

  planning_numbers: tool({
    description: "The company's planning numbers from Settings: stations per date, hold lengths, minimum photo day size, the chase schedule and deadlines, and the facility fee cap.",
    input: z.object({}),
    schema: obj({}),
    run: async (_i, { supabase }) => {
      const { data, error } = await supabase.from("settings").select("key, value").in("key", [...EDITABLE_KEYS.keys()]);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((s) => [s.key, { value: s.value, means: EDITABLE_KEYS.get(s.key)?.hint, unit: EDITABLE_KEYS.get(s.key)?.unit }]));
    },
  }),
};

export type AskToolName = keyof typeof TOOLS;

export const ASK_TOOLS: Anthropic.Tool[] = Object.entries(TOOLS).map(([name, t]) => ({
  name,
  description: t.description,
  input_schema: t.schema,
}));

/** Runs one lookup. Bad input and failed reads come back as an error result, never a throw. */
export async function runAskTool(name: string, rawInput: unknown, ctx: AskContext): Promise<{ content: string; isError: boolean }> {
  if (!Object.hasOwn(TOOLS, name)) return { content: `There is no lookup called ${name}.`, isError: true };
  const def = TOOLS[name as AskToolName] as ToolDef<z.ZodType>;
  const parsed = def.input.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return { content: `That lookup was not asked for correctly: ${parsed.error.issues.map((x) => `${x.path.join(".")} ${x.message}`).join("; ")}`, isError: true };
  }
  try {
    return { content: pack(await def.run(parsed.data, ctx)), isError: false };
  } catch {
    return { content: "That lookup failed. The records could not be read just now.", isError: true };
  }
}
