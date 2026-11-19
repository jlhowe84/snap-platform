import { formatDate, formatTime } from "@/lib/dates";

// The Captura setup list on a job: the planning playbook's steps tagged
// "captura", each a checkbox, plus the values the office pastes into Captura.
// Nothing here calls Captura. The office does the setup by hand and ticks it.

export const CAPTURA_TAG = "captura";
export const WELCOME_TEMPLATES_KEY = "captura.welcome_templates";
export const COUPON_SLOT = "{{coupon}}";

export type WelcomeTemplates = Record<string, string>;

export function readTemplates(value: unknown): WelcomeTemplates {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: WelcomeTemplates = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k.toLowerCase()] = v;
  }
  return out;
}

// A template keyed by a sport the job has wins ("swim" for a swim team);
// otherwise the one keyed "default".
export function pickTemplate(sports: string[], templates: WelcomeTemplates): { key: string; html: string } | null {
  const keys = Object.keys(templates).filter((k) => k !== "default");
  for (const s of sports.map((x) => x.toLowerCase())) {
    const hit = keys.find((k) => s.includes(k));
    if (hit) return { key: hit, html: templates[hit] };
  }
  return templates.default ? { key: "default", html: templates.default } : null;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function fillWelcome(html: string, coupon: string | null): string | null {
  if (!html.includes(COUPON_SLOT)) return html;
  if (!coupon) return null;
  return html.split(COUPON_SLOT).join(escapeHtml(coupon));
}

export type SetupDay = {
  date: string;
  start_time: string | null;
  label: string | null;
  location_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
};

export type SetupValue = { label: string; hint: string; value: string | null; missing?: string };

// The pasted values, in the order Captura asks for them. Days are the job's
// scheduled photo days, earliest first.
export function buildSetupValues(f: {
  coupon: string | null;
  promo: string | null;
  sports: string[];
  days: SetupDay[];
  templates: WelcomeTemplates;
}): SetupValue[] {
  const [first, ...rest] = f.days;
  const place = first ? [first.location_name, first.address, first.city, first.state].filter(Boolean).join(", ") : "";
  const more = rest
    .map((d) => [formatDate(d.date, { weekday: true }), formatTime(d.start_time), d.label].filter(Boolean).join(" · "))
    .join("; ");
  const template = pickTemplate(f.sports, f.templates);
  const welcome = template ? fillWelcome(template.html, f.coupon) : null;

  return [
    { label: "Custom Marketing 1", hint: "Prepay coupon code", value: f.coupon || null, missing: "Add the coupon code above." },
    { label: "Custom Marketing 2", hint: "Job location details", value: place || null, missing: "The first photo day has no location yet." },
    { label: "Custom Marketing 3", hint: "Additional job dates", value: more || null, missing: "Only one photo day, so leave this blank." },
    { label: "Custom Marketing 4", hint: "Special job details (promo, reminders)", value: f.promo || null, missing: "No promo on this job, so leave this blank." },
    {
      label: "Job welcome message",
      hint: template ? (template.key === "default" ? "Standard template" : `Template: ${template.key}`) : "Welcome message",
      value: welcome,
      missing: template ? "Add the coupon code above to fill the template." : "No welcome message template is saved in Settings yet.",
    },
  ];
}

export type SetupStep = { id: string; name: string; stage: string | null; offset_days: number | null };
export type SetupTask = { id: string; playbook_step_id: string | null; status: string; completed_at: string | null };

// When a step is due: its offset from the first photo day.
export function stepDueOn(firstDate: string | null | undefined, offsetDays: number | null): string | null {
  if (!firstDate || offsetDays == null) return null;
  const d = new Date(`${firstDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export function setupProgress(steps: SetupStep[], tasks: SetupTask[]) {
  const done = new Set(tasks.filter((t) => t.status === "done" && t.playbook_step_id).map((t) => t.playbook_step_id!));
  return { done: steps.filter((s) => done.has(s.id)).length, total: steps.length, doneIds: done };
}
