import { toBlocks, type Inline } from "@/lib/kb/blocks";

function Parts({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) => {
        let el: React.ReactNode = p.text;
        if (p.href) el = <a href={p.href} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">{p.text}</a>;
        if (p.bold) el = <strong className="font-semibold">{el}</strong>;
        if (p.italic) el = <em>{el}</em>;
        return <span key={i}>{el}</span>;
      })}
    </>
  );
}

/** An article's text, read from its Markdown without trusting any HTML in it. */
export function KbText({ body, className }: { body: string; className?: string }) {
  return (
    <div className={className ?? "space-y-3 text-sm leading-relaxed"}>
      {toBlocks(body).map((b, i) => {
        if (b.kind === "p") return <p key={i}><Parts parts={b.parts} /></p>;
        if (b.kind === "quote")
          return (
            <blockquote key={i} className="border-l-2 border-accent/60 pl-3 text-muted">
              {b.parts.map((line, k) => <p key={k}><Parts parts={line} /></p>)}
            </blockquote>
          );
        if (b.kind === "list") {
          const List = b.ordered ? "ol" : "ul";
          return (
            <List key={i} className={b.ordered ? "list-decimal space-y-1 pl-5" : "list-disc space-y-1 pl-5"}>
              {b.items.map((item, k) => <li key={k}><Parts parts={item} /></li>)}
            </List>
          );
        }
        return (
          <div key={i} className="overflow-x-auto">
            <table className="text-sm">
              <tbody>
                {b.rows.map((row, r) => (
                  <tr key={r} className="border-b border-line last:border-0">
                    {row.map((cell, c) => <td key={c} className="px-2 py-1 align-top"><Parts parts={cell} /></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
