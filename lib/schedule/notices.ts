// Every message the scheduler can show after an action. The page shows a
// notice from the address bar only if it is one of these.
export const NOTICES = [
  "A slot needs a station, a start time and a length from 5 to 60 minutes.",
  "A team needs a name.",
  "Another team already has that name.",
  "Every team already has a slot.",
  "Pick a team, a station, a start time and a length.",
  "Stations are 1 to 20 and blocks are 5 to 60 minutes.",
  "Submitted. Thank you.",
  "That break would push the last team past the end of the day.",
  "That schedule was not found.",
  "That slot could not be added.",
  "That slot could not be changed.",
  "That team came from your roster, so only our office can remove it. Send us a message and we will.",
  "That team is already on the list.",
  "The schedule could not be reopened.",
  "The schedule is not complete yet. Fix the items listed and submit again.",
  "The schedule is not open for changes.",
  "The schedule still has open items.",
  "The setup could not be saved.",
  "The team could not be added.",
  "The team could not be saved.",
  "The teams after the break could not be moved. Check the times and try again.",
  "The teams could not be placed.",
  "Those two slots could not be swapped.",
] as const;

export type Notice = (typeof NOTICES)[number];

export function knownNotice(value: unknown): Notice | null {
  return (NOTICES as readonly unknown[]).includes(value) ? (value as Notice) : null;
}
