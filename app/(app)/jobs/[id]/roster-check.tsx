import { COUNT_TOLERANCE, diffIsEmpty, offBy, type RosterDiff } from "@/lib/rosters/diff";

const label = (t: { name: string; division?: string | null }) => (t.division ? `${t.name} (${t.division})` : t.name);

// Under the finished roster: how its counts compare with what the league
// expected, and what changed since the roster before it.
export function RosterCheck({
  players,
  teams,
  expectedPlayers,
  expectedTeams,
  diff,
}: {
  players: number | null;
  teams: number | null;
  expectedPlayers: number | null;
  expectedTeams: number | null;
  diff: RosterDiff | null;
}) {
  const playersOff = offBy(expectedPlayers, players);
  const teamsOff = offBy(expectedTeams, teams);
  const flagged = (playersOff ?? 0) > COUNT_TOLERANCE || (teamsOff ?? 0) > COUNT_TOLERANCE;

  return (
    <div className="mb-3 space-y-2 text-sm">
      {(playersOff !== null || teamsOff !== null) && (
        <p className={flagged ? "rounded-lg border border-warn/40 bg-surface-2 p-2 text-warn" : "text-muted"}>
          {flagged ? "Check the count: " : "Count check: "}
          {[
            playersOff !== null ? `${players} players against ${expectedPlayers} expected` : null,
            teamsOff !== null ? `${teams} teams against ${expectedTeams} expected` : null,
          ]
            .filter(Boolean)
            .join(", ")}
          .
        </p>
      )}
      {diff &&
        (diffIsEmpty(diff) ? (
          <p className="text-muted">No team or head count changed from version {diff.from_version}.</p>
        ) : (
          <div className="rounded-lg border border-line p-3">
            <p className="font-medium">
              Changed from version {diff.from_version}
              {diff.players.from !== diff.players.to && (
                <span className="font-normal text-muted">
                  {" "}· players {diff.players.from ?? "?"} to {diff.players.to ?? "?"}
                </span>
              )}
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
              {diff.added.map((t, i) => (
                <li key={`a${i}`}>
                  New team: {label(t)}
                  {t.players != null ? `, ${t.players} players` : ""}. It needs a time on the schedule.
                </li>
              ))}
              {diff.removed.map((t, i) => (
                <li key={`r${i}`}>
                  No longer on the roster: {label(t)}.{" "}
                  {t.kept ? "It was kept because it holds a time on the schedule; remove it there if it is really gone." : "It was removed."}
                </li>
              ))}
              {diff.changed.map((t, i) => (
                <li key={`c${i}`}>
                  {label(t)}: {t.from ?? "?"} to {t.to ?? "?"} players.
                </li>
              ))}
            </ul>
          </div>
        ))}
    </div>
  );
}
