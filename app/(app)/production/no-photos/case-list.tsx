import { Pill } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { CASE_STATUS_LABEL, NO_PHOTO_REASON, type CaseStatus, type NoPhotoReason } from "@/lib/production/no-photos";
import type { Database } from "@/lib/database.types";
import { CaseForm } from "./forms";

export type CaseRow = Pick<
  Database["public"]["Tables"]["prepay_photo_cases"]["Row"],
  "id" | "order_id" | "reason" | "player" | "team" | "order_date" | "total" | "status" | "note" | "cleared_at"
>;

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const TONE = { open: "warn", offered: "info", makeup_booked: "info", refunded: "muted", closed: "muted" } as const;

/** The orders of one job, each with its status and note to keep up to date. */
export function CaseList({ cases }: { cases: CaseRow[] }) {
  return (
    <ul className="divide-y divide-line">
      {cases.map((c) => {
        const status = c.status as CaseStatus;
        return (
          <li key={c.id} className="py-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="min-w-0 font-medium [overflow-wrap:anywhere]">
                {c.player ?? NO_PHOTO_REASON[c.reason as NoPhotoReason]}
                {c.team ? <span className="font-normal text-muted"> · {c.team}</span> : null}
              </p>
              <Pill tone={c.cleared_at ? "ok" : TONE[status]}>{c.cleared_at ? "Has photos now" : CASE_STATUS_LABEL[status]}</Pill>
            </div>
            <p className="text-muted">
              Order {c.order_id}
              {c.order_date ? ` · ${formatDate(c.order_date)}` : ""}
              {c.total != null ? ` · ${money.format(Number(c.total))}` : ""}
              {c.player && c.reason !== "no_images" ? ` · ${NO_PHOTO_REASON[c.reason as NoPhotoReason]}` : ""}
            </p>
            <CaseForm caseId={c.id} status={status} note={c.note} />
          </li>
        );
      })}
    </ul>
  );
}
