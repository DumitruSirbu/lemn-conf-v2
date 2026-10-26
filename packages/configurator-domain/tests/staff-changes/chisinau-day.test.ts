// The Europe/Chisinau day key's refusals on the high side; the day boundaries are swept in qa-k1-adversarial.test.ts.
import { describe, expect, it } from "vitest";

import { chisinauDayKey } from "../../src/staff-changes/chisinau-day.js";

describe("the day key refuses an instant that is not one", () => {
  it.each([
    ["positive infinity", Number.POSITIVE_INFINITY],
    ["one millisecond beyond the maximum date", 8.64e15 + 1],
  ])("naming the function, for %s", (_label, value) => {
    expect(() => chisinauDayKey(value)).toThrow(
      /chisinauDayKey.*not an instant/,
    );
  });
});
