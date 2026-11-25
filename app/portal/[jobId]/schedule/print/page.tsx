import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate, formatTime } from "@/lib/dates";
import { portalJob } from "@/lib/portal/job";
import { scheduleRows, type Slot } from "@/lib/schedule/layout";
import { PrintButton } from "./print-button";

// The day's schedule laid out for paper: one table in running order with each
// team's start time, station and team card number. Players and a tick column
// were dropped (Josh, 11/25) so long team names have room. Read as the
// signed-in person, so RLS decides who may see it.
export default async function SchedulePrintPage({ params, searchParams }: PageProps<"/portal/[jobId]/schedule/print">) {
  const { jobId } = await params;
  const query = await searchParams;
  const ctx = await portalJob(jobId);
  if (!ctx) notFound();
  const { supabase } = ctx;
  const dayId = typeof query.day === "string" ? query.day : "";

  const { data: day } = await supabase
    .from("photo_days")
    .select("id, date, start_time, label, location_name")
    .eq("id", dayId)
    .eq("job_id", jobId)
    .maybeSingle();
  if (!day) notFound();

  const { data: schedule } = await supabase.from("schedules").select("id, status, stations").eq("photo_day_id", day.id).maybeSingle();
  const [{ data: slots }, { data: teams }] = await Promise.all([
    schedule
      ? supabase.from("schedule_slots").select("station, starts_at, minutes, kind, team_id, label").eq("schedule_id", schedule.id)
      : Promise.resolve({ data: [] }),
    supabase.from("teams").select("id, name, division, coach_name, tc_number").eq("job_id", jobId),
  ]);
  const rows = scheduleRows((slots ?? []) as Slot[], teams ?? []);
  const draft = schedule && schedule.status !== "submitted" && schedule.status !== "complete";
  const cell = "border border-black/40 px-2 py-1.5 align-top";

  return (
    <div className="bg-white text-black">
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <Link href={`/portal/${jobId}/schedule?day=${day.id}`} className="text-sm underline-offset-2 hover:underline">
          Back to the schedule
        </Link>
        <PrintButton />
      </div>

      <header className="mb-3 border-b-2 border-black pb-2">
        <p className="text-xs uppercase tracking-widest">Picture day schedule{draft ? " · draft, not yet submitted" : ""}</p>
        <h1 className="font-display text-2xl font-bold uppercase">{ctx.job.name}</h1>
        <p className="text-sm">
          {formatDate(day.date, { weekday: true })}
          {day.label ? ` · ${day.label}` : ""}
          {day.location_name ? ` · ${day.location_name}` : ""}
          {schedule ? ` · ${schedule.stations} ${schedule.stations === 1 ? "station" : "stations"}` : ""}
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="text-sm">Nothing is on the schedule yet.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider">
              <th className={`${cell} w-px whitespace-nowrap`}>Time</th>
              <th className={`${cell} w-px whitespace-nowrap`}>Station</th>
              <th className={`${cell} w-px whitespace-nowrap`}>TC</th>
              <th className={cell}>Team</th>
              <th className={cell}>Division</th>
              <th className={cell}>Coach</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="break-inside-avoid">
                <td className={`${cell} whitespace-nowrap`}>{formatTime(r.start)}</td>
                <td className={cell}>{r.station}</td>
                {r.isBreak ? (
                  <td className={`${cell} italic`} colSpan={4}>
                    {r.team}
                  </td>
                ) : (
                  <>
                    <td className={`${cell} text-base font-bold`}>{r.tc ?? ""}</td>
                    <td className={`${cell} font-semibold`}>{r.team}</td>
                    <td className={cell}>{r.division ?? ""}</td>
                    <td className={cell}>{r.coach ?? ""}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
