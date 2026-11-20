// The one thing a job is waiting on, worked out from what the job page
// already loads. It reads top to bottom in the order the office works a job:
// agreement, planning form, roster, schedule, crew, Captura setup.

export type NextStepInput = {
  /** jobs.status */
  status: string;
  /** Readiness of the next coming photo day, or null when there is none. */
  day: {
    id: string;
    date: string;
    agreement_signed: boolean | null;
    planning_form: string | null;
    roster: string | null;
    schedule: string | null;
  } | null;
  /** True once the finished roster in the standard format is on the job. */
  hasFinishedRoster: boolean;
  /** Statuses of that day's shifts, cancelled ones left out. */
  shifts: string[];
  /** Captura setup steps: done and total. */
  setup: { done: number; total: number };
  /** The job came from Notion and nothing has been planned here yet. */
  plannedElsewhere: boolean;
};

export type NextStep = {
  text: string;
  /** Where to go to do it: a section of the job page (#id) or another page. */
  href: string | null;
  /** Who it waits on. */
  waitsOn: "office" | "league" | "nobody";
};

const CLOSED = new Set(["cancelled", "released", "archived", "complete"]);

export function nextStep(i: NextStepInput): NextStep | null {
  if (CLOSED.has(i.status)) return null;
  const d = i.day;
  if (!d) return null;

  if (!i.plannedElsewhere) {
    if (!d.agreement_signed) {
      return { text: "The league has not signed the agreement. Send the coordinator a portal link.", href: "#portal", waitsOn: "league" };
    }
    if (d.planning_form !== "submitted") {
      return { text: "Waiting on the league's planning form.", href: "#readiness", waitsOn: "league" };
    }
    if (!d.roster || d.roster === "not_received") {
      return { text: "Waiting on the league's rosters.", href: "#readiness", waitsOn: "league" };
    }
    if (!i.hasFinishedRoster) {
      return { text: "Rosters are in. Process them and upload the finished roster.", href: "#planning", waitsOn: "office" };
    }
    if (d.schedule === "submitted") {
      return { text: "The league submitted its schedule. Review and approve it.", href: "#schedule", waitsOn: "office" };
    }
    if (d.schedule !== "complete") {
      return { text: "Waiting on the league's picture day schedule.", href: "#schedule", waitsOn: "league" };
    }
  }

  const staffing = `/staffing/${d.id}`;
  if (!i.shifts.length) return { text: "No crew shifts yet. Add shifts for this photo day.", href: staffing, waitsOn: "office" };
  const drafts = i.shifts.filter((s) => s === "draft").length;
  if (drafts) {
    return { text: `${drafts} shift${drafts === 1 ? " is" : "s are"} not published. Publish so crew can take ${drafts === 1 ? "it" : "them"}.`, href: staffing, waitsOn: "office" };
  }
  const open = i.shifts.filter((s) => s === "open").length;
  if (open) return { text: `${open} shift${open === 1 ? " is" : "s are"} still open. Fill or widen the offer.`, href: staffing, waitsOn: "office" };

  const left = i.setup.total - i.setup.done;
  if (left > 0) return { text: `Captura setup has ${left} step${left === 1 ? "" : "s"} left.`, href: "#captura", waitsOn: "office" };

  return { text: "Everything is in for this photo day.", href: null, waitsOn: "nobody" };
}
