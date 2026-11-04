import { describe, expect, it } from "vitest";

import {
  seenMarkFrom,
  withMarksOfKitchen,
  withMarksOfList,
} from "@/staff/staff-kitchens-marks-reading";
import { staffKitchenListFrom } from "@/staff/staff-kitchens-wire-reading";
import { staffKitchenFrom } from "@/staff/use-staff-kitchen";

import { wireKitchen } from "../support/staff-kitchen-wire";
import { wireList, wireRow } from "../support/staff-kitchens-wire";

// What the list and the kitchen page carry beyond their older shapes is read member by member, and an answer that lacks
// one is refused whole: a badge is never hidden, and an estimate never invented, by a body that forgot to say.

function listFrom(body: Record<string, unknown>) {
  const base = staffKitchenListFrom(body);
  if (base === undefined) throw new Error("the older reader refused the body");
  return withMarksOfList(base, body);
}

function kitchenFrom(body: Record<string, unknown>) {
  const base = staffKitchenFrom(body);
  if (base === undefined) throw new Error("the older reader refused the body");
  return withMarksOfKitchen(base, body);
}

describe("the list's marks and count", () => {
  it("gives every row its mark and the list its count of changed kitchens", () => {
    const list = listFrom(
      wireList(
        [
          wireRow(1, { changedAfterSeen: true }),
          wireRow(2, { changedAfterSeen: false }),
        ],
        { changedCount: 7 },
      ),
    );

    expect(list?.changedCount).toBe(7);
    expect(list?.kitchens.map((row) => row.changedAfterSeen)).toEqual([
      true,
      false,
    ]);
    expect(list?.kitchens.map((row) => row.id)).toEqual([
      wireRow(1).id,
      wireRow(2).id,
    ]);
  });

  it("gives every row the instant staff last saw it, or null", () => {
    const list = listFrom(
      wireList([
        wireRow(1, { seenAt: "2026-10-20T07:05:00.000Z" }),
        wireRow(2, { seenAt: null }),
      ]),
    );

    expect(list?.kitchens.map((row) => row.seenAt)).toEqual([
      "2026-10-20T07:05:00.000Z",
      null,
    ]);
  });

  it.each([
    [
      "a row without a seen instant",
      wireList([wireRow(1, { seenAt: undefined })]),
    ],
    [
      "a seen instant that is not an instant",
      wireList([wireRow(1, { seenAt: "yesterday" })]),
    ],
    [
      "a seen instant with an offset",
      wireList([wireRow(1, { seenAt: "2026-10-20T07:05:00+03:00" })]),
    ],
    [
      "a seen instant that is a number",
      wireList([wireRow(1, { seenAt: 1790000000000 })]),
    ],
  ])("refuses %s", (_name, body) => {
    expect(listFrom(body)).toBeUndefined();
  });

  it("reads an empty list with its count", () => {
    expect(listFrom(wireList([], { changedCount: 3 }))).toMatchObject({
      total: 0,
      changedCount: 3,
      kitchens: [],
    });
  });

  it.each([
    [
      "a row without a mark",
      wireList([wireRow(1, { changedAfterSeen: undefined })]),
    ],
    [
      "a mark that is not a boolean",
      wireList([wireRow(1, { changedAfterSeen: "true" })]),
    ],
    [
      "a list without a count",
      wireList([wireRow(1)], { changedCount: undefined }),
    ],
    ["a count below zero", wireList([wireRow(1)], { changedCount: -1 })],
    [
      "a count that is not whole",
      wireList([wireRow(1)], { changedCount: 1.5 }),
    ],
    ["a count of text", wireList([wireRow(1)], { changedCount: "3" })],
  ])("refuses %s", (_name, body) => {
    expect(listFrom(body)).toBeUndefined();
  });

  it("marks a row once when the page names a kitchen twice, where the older reader drew it once", () => {
    const list = listFrom(
      wireList([
        wireRow(1, { changedAfterSeen: true }),
        wireRow(1, { changedAfterSeen: false }),
      ]),
    );

    expect(list?.kitchens).toHaveLength(1);
    expect(list?.kitchens[0]?.changedAfterSeen).toBe(true);
  });
});

describe("the kitchen's mark, revision and estimates", () => {
  const SENT = { totalMinor: 5_820_000, currency: "MDL" };
  const CURRENT = { totalMinor: 6_140_000, currency: "MDL" };

  it("reads the mark, the displayed revision and both estimates as they came", () => {
    const opened = kitchenFrom(
      wireKitchen({
        changedAfterSeen: true,
        displayedRevision: "9223372036854775807",
        sentEstimate: SENT,
        currentEstimate: CURRENT,
      }),
    );

    expect(opened).toMatchObject({
      changedAfterSeen: true,
      displayedRevision: "9223372036854775807",
      sentEstimate: SENT,
      currentEstimate: CURRENT,
    });
  });

  it("reads a current estimate of a kitchen with no cabinets as empty, and nothing else as empty", () => {
    expect(
      kitchenFrom(wireKitchen({ currentEstimate: { empty: true } }))
        ?.currentEstimate,
    ).toEqual({ empty: true });
    for (const empty of [false, "true", 1, null]) {
      expect(
        kitchenFrom(wireKitchen({ currentEstimate: { empty } })),
      ).toBeUndefined();
    }
  });

  it("keeps the kitchen the older reader judged, untouched", () => {
    const body = wireKitchen();
    const base = staffKitchenFrom(body);

    expect(kitchenFrom(body)).toMatchObject(base ?? {});
  });

  it("reads no sent estimate as null and a refused current estimate as its code", () => {
    const opened = kitchenFrom(
      wireKitchen({
        sentEstimate: null,
        currentEstimate: { refused: "REPLACEMENT_REQUIRED" },
      }),
    );

    expect(opened?.sentEstimate).toBeNull();
    expect(opened?.currentEstimate).toEqual({
      refused: "REPLACEMENT_REQUIRED",
    });
  });

  it.each([
    ["a missing mark", { changedAfterSeen: undefined }],
    ["a mark of text", { changedAfterSeen: "false" }],
    ["a missing revision", { displayedRevision: undefined }],
    ["a revision that is a number", { displayedRevision: 5 }],
    ["a revision with a leading zero", { displayedRevision: "05" }],
    ["a revision of zero", { displayedRevision: "0" }],
    [
      "a revision wider than a bigint",
      { displayedRevision: "9223372036854775808" },
    ],
    ["a revision with a line feed", { displayedRevision: "5\n" }],
    ["a missing sent estimate", { sentEstimate: undefined }],
    ["a missing current estimate", { currentEstimate: undefined }],
    ["a current estimate that is null", { currentEstimate: null }],
    [
      "a total that is not whole",
      { currentEstimate: { totalMinor: 1.5, currency: "MDL" } },
    ],
    [
      "a negative total",
      { currentEstimate: { totalMinor: -1, currency: "MDL" } },
    ],
    [
      "a total of text",
      { sentEstimate: { totalMinor: "100", currency: "MDL" } },
    ],
    [
      "a currency that is not text",
      { currentEstimate: { totalMinor: 100, currency: 1 } },
    ],
    [
      "a currency that is empty",
      { currentEstimate: { totalMinor: 100, currency: "" } },
    ],
    [
      "a refusal code this build does not word",
      { currentEstimate: { refused: "A_FUTURE_CODE" } },
    ],
    [
      "a refusal that is a prototype name",
      { currentEstimate: { refused: "constructor" } },
    ],
  ])("refuses %s", (_name, members) => {
    expect(kitchenFrom(wireKitchen(members))).toBeUndefined();
  });
});

describe("the mark a seen request answers", () => {
  it("reads the kitchen's mark afterwards", () => {
    expect(seenMarkFrom({ changedAfterSeen: false })).toEqual({
      changedAfterSeen: false,
    });
    expect(seenMarkFrom({ changedAfterSeen: true })).toEqual({
      changedAfterSeen: true,
    });
  });

  it.each([[{}], [{ changedAfterSeen: "no" }], [null], ["true"]])(
    "refuses %j",
    (body) => {
      expect(seenMarkFrom(body)).toBeUndefined();
    },
  );
});
