import type { RateLimitWindow } from "@lemnaria/persistence";

const MS_PER_MINUTE = 60_000;

/** A window must tile the UTC day, so that its edges are clock times and not a drift from midnight. */
export const MINUTES_PER_DAY = 24 * 60;

/**
 * The window of whole minutes on the UTC clock that holds `instant`, as the half-open `[start, end)` the counter
 * store keys a row by: sixty minutes is the clock hour, ten is a ten-minute mark. Pure: the instant is handed in.
 * Time here is the epoch's, in which every day has 86,400 seconds, so a leap second is not a minute of its own.
 * Throws a `RangeError` for an instant that is no date or a length that does not divide the day.
 */
export function utcWindowOf(instant: Date, minutes: number): RateLimitWindow {
  requireMinutesThatTileTheDay(minutes);
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError("The instant is not a valid date");
  }
  const lengthMs = minutes * MS_PER_MINUTE;
  const startMs = Math.floor(instant.getTime() / lengthMs) * lengthMs;
  return { startsAt: new Date(startMs), endsAt: new Date(startMs + lengthMs) };
}

function requireMinutesThatTileTheDay(minutes: number): void {
  const isWholeAndPositive = Number.isInteger(minutes) && minutes >= 1;
  if (!isWholeAndPositive || MINUTES_PER_DAY % minutes !== 0) {
    throw new RangeError("A window's minutes must divide a day");
  }
}
