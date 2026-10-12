const MINUTE_DIGITS = 2;
const HOUR_DIGITS = 2;
const MS_PER_MINUTE = 60_000;

/** The instant as `clockTimeOf` tells it: the next whole minute that is not before it. */
function roundedUpToMinute(epochMs: number): Date {
  return new Date(Math.ceil(epochMs / MS_PER_MINUTE) * MS_PER_MINUTE);
}

/**
 * An instant as the hour and minute on this browser's clock, `14:05`: the one form both locales read, a 24-hour clock.
 * The minute is rounded up, so a time told to the customer is never before the one the write is sent at.
 */
export function clockTimeOf(epochMs: number): string {
  const instant = roundedUpToMinute(epochMs);
  const hours = String(instant.getHours()).padStart(HOUR_DIGITS, "0");
  const minutes = String(instant.getMinutes()).padStart(MINUTE_DIGITS, "0");
  return `${hours}:${minutes}`;
}

/** Whether the time `clockTimeOf` tells for the instant falls on a later calendar day on this browser's clock than
 *  `nowMs` does, so that a clock time can be told with its day. */
export function isToldOnALaterDay(epochMs: number, nowMs: number): boolean {
  return (
    startOfLocalDay(roundedUpToMinute(epochMs)) >
    startOfLocalDay(new Date(nowMs))
  );
}

function startOfLocalDay(instant: Date): number {
  return new Date(
    instant.getFullYear(),
    instant.getMonth(),
    instant.getDate(),
  ).getTime();
}
