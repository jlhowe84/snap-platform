import { Empty } from "@/components/ui";

type Terms = {
  sponsorship: string | null;
  rebate: string | null;
  parent_discount: string | null;
  other_terms: string | null;
};

const ROWS: [keyof Terms, string][] = [
  ["sponsorship", "Sponsorship"],
  ["rebate", "Rebate"],
  ["parent_discount", "Parent discount"],
  ["other_terms", "Other"],
];

/** Read-only view of a league's money terms, for the league and job pages. */
export function MoneyTermsList({ terms }: { terms: Terms | null }) {
  const rows = ROWS.filter(([k]) => terms?.[k]);
  if (!rows.length) return <Empty>No league-specific money terms recorded.</Empty>;
  return (
    <dl className="space-y-2 text-sm">
      {rows.map(([k, label]) => (
        <div key={k}>
          <dt className="text-xs text-muted">{label}</dt>
          <dd className="whitespace-pre-wrap">{terms![k]}</dd>
        </div>
      ))}
    </dl>
  );
}
