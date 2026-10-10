const MINUTE_DIGITS = 2;
const HOUR_DIGITS = 2;

/**
 * An instant as the hour and minute on this browser's clock, `14:05`: the one form both locales read, a 24-hour clock.
 * The minute is rounded up, so a time told to the customer is never before the one the write is sent at.
 */
export function clockTimeOf(epochMs: number): string {
  const instant = new Date(Math.ceil(epochMs / MS_PER_MINUTE) * MS_PER_MINUTE);
  const hours = String(instant.getHours()).padStart(HOUR_DIGITS, "0");
  const minutes = String(instant.getMinutes()).padStart(MINUTE_DIGITS, "0");
  return `${hours}:${minutes}`;
}

const MS_PER_MINUTE = 60_000;
