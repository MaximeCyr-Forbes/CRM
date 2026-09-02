/**
 * Port of parser.py::add_acceptance_deadline / acceptance_relative_text.
 * SOURCE_COMMIT=ded09b6992554e7c9f2e51fd4975c0fdb75dbc1a
 * Python date + timedelta(days=N) means civil calendar days (not business days
 * or elapsed 24-hour periods). The acceptance day is day zero.
 *
 * Only adaptation: return the emitted deadline instead of appending it to a
 * Python list, and retain the ISO date / offset at calculation time. Never
 * reconstruct an ISO date from the source's abbreviated display text.
 */
import { addDays, formatDay, timeToIso } from "./dates";
import type { OaciqDeadline } from "./types";

export const SOURCE_COMMIT = "ded09b6992554e7c9f2e51fd4975c0fdb75dbc1a";
export const SOURCE_PARSER_SHA256 = "29a1385aea7e071c4f9ab3d23992cc12f1d32193268805d5f3451f25fbc5235c";

export function acceptanceRelativeText(days: number, relativeTo = "l'acceptation") {
  return `${days} ${days === 1 ? "jour" : "jours"} après ${relativeTo}`;
}

export function addAcceptanceDeadline(
  acceptedDay: string | null,
  days: number,
  label: string,
  details = "",
  suffix = "",
  relativeTo = "l'acceptation",
): Pick<OaciqDeadline, "title" | "dateText" | "details" | "dueDate" | "dueTime" | "baseDate" | "days"> {
  const dueDate = acceptedDay ? addDays(acceptedDay, days) : null;
  return {
    title: label,
    dateText: `${dueDate ? formatDay(dueDate) : acceptanceRelativeText(days, relativeTo)}${suffix}`,
    details,
    dueDate,
    dueTime: timeToIso(suffix),
    baseDate: acceptedDay,
    days,
  };
}
