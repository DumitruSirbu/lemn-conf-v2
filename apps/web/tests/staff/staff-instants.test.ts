// An instant on the staff wire is read by one rule wherever it stands: the list's rows and the kitchen read it alike. The
// server writes every instant with `toISOString()`, so one that does not read back as itself is not the server's and is
// refused, never read as some other moment (`2026-02-30` is not the first of March).
import { describe, expect, it } from "vitest";

import {
  isInstant,
  staffKitchenListFrom,
} from "@/staff/staff-kitchens-wire-reading";
import { staffKitchenFrom } from "@/staff/use-staff-kitchen";

import { wireKitchen } from "../support/staff-kitchen-wire";
import { wireList, wireRow } from "../support/staff-kitchens-wire";

const SERVER_WRITES = [
  "1970-01-01T00:00:00.000Z",
  "2026-10-21T12:00:00.000Z",
  "2024-02-29T23:59:59.999Z",
  "+275760-09-13T00:00:00.000Z",
];
const SERVER_DOES_NOT_WRITE = [
  "1",
  "",
  "2026-02-30T00:00:00.000Z",
  "2026-13-01T00:00:00.000Z",
  "2026-10-21T12:00:00Z",
  "2026-10-21T12:00:00+03:00",
  "2026-10-21 12:00:00.000Z",
  "2026-10-21T12:00:00.000Z ",
  "Oct 21 2026",
];

function listWithSentDay(instant: string) {
  return staffKitchenListFrom(wireList([wireRow(1, { sentAt: instant })]));
}

function listWithModifiedDay(instant: string) {
  return staffKitchenListFrom(wireList([wireRow(1, { updatedAt: instant })]));
}

function kitchenWithModifiedDay(instant: string) {
  return staffKitchenFrom(wireKitchen({ kitchen: { updatedAt: instant } }));
}

describe.each([
  ["the list's sent day", listWithSentDay],
  ["the list's modified day", listWithModifiedDay],
  ["the kitchen's modified day", kitchenWithModifiedDay],
])("%s", (_, read) => {
  it.each(SERVER_WRITES)("reads %s", (instant) => {
    expect(read(instant)).toBeDefined();
  });

  it.each(SERVER_DOES_NOT_WRITE)("refuses %j", (instant) => {
    expect(read(instant)).toBeUndefined();
  });
});

describe("isInstant", () => {
  it("is the one rule, for what the server writes and what it does not", () => {
    expect(SERVER_WRITES.every(isInstant)).toBe(true);
    expect(SERVER_DOES_NOT_WRITE.some(isInstant)).toBe(false);
    expect(isInstant(0)).toBe(false);
    expect(isInstant(null)).toBe(false);
  });
});
