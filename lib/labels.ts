import type { Database } from "@/lib/database.types";
import type { Tone } from "@/components/ui";

type Enums = Database["public"]["Enums"];

export const STATUS_LABEL: Record<Enums["job_status"], string> = {
  held: "Held",
  planning: "Planning",
  in_production: "In production",
  at_lab: "At lab",
  delivered: "Delivered",
  complete: "Complete",
  archived: "Archived",
  cancelled: "Cancelled",
  released: "Released",
};

export const STATUS_TONE: Record<Enums["job_status"], Tone> = {
  held: "warn",
  planning: "info",
  in_production: "accent",
  at_lab: "warn",
  delivered: "ok",
  complete: "ok",
  archived: "muted",
  cancelled: "risk",
  released: "muted",
};

export const STAGES: Enums["production_stage"][] = [
  "import",
  "editing",
  "upload",
  "composites",
  "gallery_prep",
  "qa_marketing",
  "complete",
];

export const STAGE_LABEL: Record<Enums["production_stage"], string> = {
  import: "Import",
  editing: "Editing",
  upload: "Upload",
  composites: "Composites",
  gallery_prep: "Gallery prep",
  qa_marketing: "QA and marketing",
  complete: "Complete",
};

export const ROLE_LABEL: Record<Enums["app_role"], string> = {
  owner: "Owner",
  admin: "Admin",
  office: "Office",
  support: "Support",
  crew: "Crew",
  coordinator: "League coordinator",
};

export const DELIVERY_LABEL: Record<Enums["delivery_method"], string> = {
  league_delivery: "League delivery",
  mailer: "Mailer",
};

export const OFFER_STAGE_LABEL: Record<Enums["offer_stage"], string> = {
  not_offered: "To offer",
  offered: "Offered",
  held: "Held",
  confirmed: "Confirmed",
  declined: "Declined",
  no_reply: "No reply",
};
