// A value a test needs and the type does not promise: its absence is the test's failure, said in words.
export function required<Value>(value: Value | null | undefined): Value {
  if (value === undefined || value === null) {
    throw new Error("a value the test needs is not there");
  }
  return value;
}
