/** Roster and schedule dates for a photo day: the date we ask for, and the last day. */
export function planningDates(firstPhotoDay: string | null, weeksDue = 3, deadlineDays = 10) {
  if (!firstPhotoDay) return { askBy: null, deadline: null };
  const shift = (days: number) => {
    const d = new Date(`${firstPhotoDay}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
  };
  return { askBy: shift(weeksDue * 7), deadline: shift(deadlineDays) };
}
