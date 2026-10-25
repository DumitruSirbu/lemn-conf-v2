import { describe, expect, it } from "vitest";

import {
  MAX_DATE_EPOCH_MS,
  instantFromEpochMilliseconds,
} from "../src/neon-row-guards.js";

describe("instantFromEpochMilliseconds", () => {
  it.each([
    ["0", 0],
    ["1790000000000", 1_790_000_000_000],
    ["-1", -1],
    ["-2208988800000", -2_208_988_800_000],
    ["8640000000000000", MAX_DATE_EPOCH_MS],
    ["-8640000000000000", -MAX_DATE_EPOCH_MS],
  ])("reads %s as that instant", (text, milliseconds) => {
    expect(instantFromEpochMilliseconds(text)?.getTime()).toBe(milliseconds);
  });

  it.each(["9999999999999999", "-9999999999999999"])(
    "holds %s inside what a Date holds",
    (text) => {
      const instant = instantFromEpochMilliseconds(text);

      expect(Math.abs(instant?.getTime() ?? Number.NaN)).toBe(
        MAX_DATE_EPOCH_MS,
      );
    },
  );

  it.each([
    "",
    "1.5",
    "+1",
    "--1",
    "1e3",
    " 1",
    "12345678901234567",
    "-12345678901234567",
    "Infinity",
    7,
    null,
    undefined,
  ])("reads %j as no instant", (value) => {
    expect(instantFromEpochMilliseconds(value)).toBeUndefined();
  });
});
