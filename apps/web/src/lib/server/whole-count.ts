/** Whether a value is a number of things: a whole number from 0 up to the largest a double holds exactly. */
export function isWholeCount(declared: unknown): declared is number {
  return (
    typeof declared === "number" &&
    Number.isSafeInteger(declared) &&
    declared >= 0
  );
}
