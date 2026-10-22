// The two days an audit filter may name, and what the server would say of them, found out before anything is sent.

/** The first and last year a day filter may name: the server refuses any other (`DATE_OUT_OF_RANGE`), so the page does
 *  not send one. Kept equal to `lib/server/staff/staff-audit-query.ts` by a test. */
export const EARLIEST_FILTER_YEAR = 2000;
export const LATEST_FILTER_YEAR = 9998;

/** `YYYY-MM-DD`: what a date field holds, and what the server takes for a Chișinău day. */
const DAY_TEXT = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;

/** Both ends of a range; a day is `""` for none. */
export interface DayRange {
  readonly from: string;
  readonly to: string;
}

/** Why the days were not asked for. Nothing is sent for them. */
export type DateProblem =
  | { readonly kind: "invalid-day"; readonly field: "from" | "to" }
  | { readonly kind: "inverted" };

/**
 * What the server would say of these days: a day that is not a day of the calendar or lies outside the years the log
 * keeps, and a range that ends before it begins. The first problem found is the one told. A day left empty is no filter.
 */
export function problemOfDays({ from, to }: DayRange): DateProblem | undefined {
  if (!isAskableDay(from)) return { kind: "invalid-day", field: "from" };
  if (!isAskableDay(to)) return { kind: "invalid-day", field: "to" };
  const isInverted = from !== "" && to !== "" && from > to;
  return isInverted ? { kind: "inverted" } : undefined;
}

/** Whether the problem is told on the field: a range that ends before it begins is told on both. */
export function isProblemOnField(
  problem: DateProblem | undefined,
  field: "from" | "to",
): boolean {
  if (problem === undefined) return false;
  return problem.kind === "inverted" || problem.field === field;
}

function isAskableDay(text: string): boolean {
  if (text === "") return true;
  const parts = DAY_TEXT.exec(text);
  if (parts === null) return false;
  const [year, month, day] = parts.slice(1).map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    return false;
  }
  if (year < EARLIEST_FILTER_YEAR || year > LATEST_FILTER_YEAR) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
