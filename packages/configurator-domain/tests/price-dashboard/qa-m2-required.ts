/** A value a test knows is there, stated rather than asserted: a missing one fails with what was expected. */
export function required<Value>(
  value: Value | undefined,
  what = "a value the test relies on",
): Value {
  if (value === undefined) throw new Error(`Expected ${what} to be present`);
  return value;
}
