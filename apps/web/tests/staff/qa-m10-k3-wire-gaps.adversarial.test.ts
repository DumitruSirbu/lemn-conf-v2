// Adversarial QA of the changed-kitchen readers: an estimate in a currency the shop does not price in, a mark or a seen
// instant that is only inherited, an answer the server writes read back by the client over every instant a Date holds, and
// the copy leaves of the staff-changes namespace.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import type { StaffKitchenPage } from "@lemnaria/persistence";
import { describe, expect, it } from "vitest";

import { staffKitchenListResponse } from "@/lib/server/staff/staff-responses";
import {
  withMarksOfKitchen,
  withMarksOfList,
} from "@/staff/staff-kitchens-marks-reading";
import { staffKitchenListFrom } from "@/staff/staff-kitchens-wire-reading";
import { staffKitchenFrom } from "@/staff/use-staff-kitchen";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import { wireKitchen } from "../support/staff-kitchen-wire";
import { wireList, wireRow } from "../support/staff-kitchens-wire";

function kitchenFrom(body: Record<string, unknown>) {
  const base = staffKitchenFrom(body);
  if (base === undefined) throw new Error("the older reader refused the body");
  return withMarksOfKitchen(base, body);
}

function listFrom(body: unknown) {
  const base = staffKitchenListFrom(body);
  if (base === undefined) throw new Error("the older reader refused the body");
  return withMarksOfList(base, body);
}

describe("an estimate in a currency the shop does not price in", () => {
  const FOREIGN_CURRENCIES = ["EUR", "USD", "mdl", "MDL ", " MDL", "MDL\n"];

  it.each(FOREIGN_CURRENCIES)(
    "is not read as the sent estimate when its currency is %j",
    (currency) => {
      const opened = kitchenFrom(
        wireKitchen({ sentEstimate: { totalMinor: 5_820_000, currency } }),
      );

      expect(opened).toBeUndefined();
    },
  );

  it.each(FOREIGN_CURRENCIES)(
    "is not read as the current estimate when its currency is %j",
    (currency) => {
      const opened = kitchenFrom(
        wireKitchen({ currentEstimate: { totalMinor: 6_140_000, currency } }),
      );

      expect(opened).toBeUndefined();
    },
  );
});

describe("an estimate whose total is not an amount a figure can be drawn from", () => {
  it.each([
    ["past the largest safe integer", 2 ** 53],
    ["fractional", 12.5],
    ["negative", -100],
    ["not a number", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
    ["text", "5820000"],
    ["null", null],
  ])("is refused when the sent total is %s", (_name, totalMinor) => {
    const opened = kitchenFrom(
      wireKitchen({ sentEstimate: { totalMinor, currency: "MDL" } }),
    );

    expect(opened).toBeUndefined();
  });
});

describe("a kitchen or a row with no change date", () => {
  it("refuses a list whose row has no update instant, whatever its mark says", () => {
    const body = wireList([
      wireRow(1, { changedAfterSeen: true, updatedAt: null }),
    ]);

    expect(staffKitchenListFrom(body)).toBeUndefined();
  });

  it.each([null, undefined, "yesterday", 0])(
    "refuses a kitchen whose update instant is %j",
    (updatedAt) => {
      const body = wireKitchen({
        changedAfterSeen: true,
        kitchen: { updatedAt },
      });

      expect(staffKitchenFrom(body)).toBeUndefined();
    },
  );
});

describe("a mark or a seen instant the row only inherits", () => {
  function inheritingRow(inherited: Record<string, unknown>) {
    const own = wireRow(1);
    delete own.changedAfterSeen;
    delete own.seenAt;
    return Object.assign(Object.create(inherited) as object, own);
  }

  it("refuses a row whose mark is on its prototype", () => {
    const list = listFrom(
      wireList([inheritingRow({ changedAfterSeen: true, seenAt: null })]),
    );

    expect(list).toBeUndefined();
  });

  it("refuses a row whose seen instant is on its prototype", () => {
    const own = wireRow(1);
    delete own.seenAt;
    const row = Object.assign(
      Object.create({ seenAt: "2026-10-20T07:05:00.000Z" }) as object,
      own,
    );

    expect(listFrom(wireList([row]))).toBeUndefined();
  });
});

describe("a seen instant that is almost an instant", () => {
  it.each([
    ["with no milliseconds", "2026-10-20T07:05:00Z"],
    ["in lower case", "2026-10-20t07:05:00.000z"],
    ["with a space before the time", "2026-10-20 07:05:00.000Z"],
    ["with a trailing space", "2026-10-20T07:05:00.000Z "],
    ["on a day that does not exist", "2026-02-30T07:05:00.000Z"],
    ["with an hour of 24", "2026-10-20T24:00:00.000Z"],
    ["with a date alone", "2026-10-20"],
    ["empty", ""],
    ["a Date object", new Date("2026-10-20T07:05:00.000Z")],
    ["an array", ["2026-10-20T07:05:00.000Z"]],
    ["undefined written as text", "undefined"],
  ])("refuses a seen instant %s", (_name, seenAt) => {
    expect(listFrom(wireList([wireRow(1, { seenAt })]))).toBeUndefined();
  });
});

describe("the list the server writes, read back by the client", () => {
  const LISTED = {
    id: "kitchenid000000000001",
    name: "Bucataria",
    design: KITCHEN_L_DESIGN,
    client: null,
    isSent: true,
    isHidden: false,
    sentAt: new Date("2026-10-18T09:00:00.000Z"),
    updatedAt: new Date("2026-10-19T09:00:00.000Z"),
    requestStatus: "new" as const,
    isChangedSinceSeen: true,
    seenAt: null as Date | null,
  };

  async function roundTrip(
    seenAt: Date | null,
    isChangedSinceSeen: boolean,
  ): Promise<ReturnType<typeof listFrom>> {
    const page = {
      total: 1,
      page: 1,
      pageSize: 20,
      changedCount: 1,
      kitchens: [{ ...LISTED, seenAt, isChangedSinceSeen }],
    } as unknown as StaffKitchenPage;
    const response = staffKitchenListResponse(page);
    return listFrom(await response.json());
  }

  const anyInstant = fc
    .date({ min: new Date(-8.64e15), max: new Date(8.64e15) })
    .filter((date) => !Number.isNaN(date.getTime()));

  propertyTest.prop([anyInstant, fc.boolean()], { numRuns: 300 })(
    "reads back the instant it was written as, whatever the mark says",
    async (seenAt, isChangedSinceSeen) => {
      const list = await roundTrip(seenAt, isChangedSinceSeen);

      expect(list?.kitchens[0]?.seenAt).toBe(seenAt.toISOString());
      expect(list?.kitchens[0]?.changedAfterSeen).toBe(isChangedSinceSeen);
    },
  );

  it("reads back a kitchen no mark counts for as null", async () => {
    const list = await roundTrip(null, true);

    expect(list?.kitchens[0]?.seenAt).toBeNull();
  });
});

describe("the words of the changed kitchens", () => {
  const CATALOGUES = { ro: roMessages, ru: ruMessages } as const;

  function leavesOf(
    node: unknown,
    path: string,
  ): readonly (readonly [string, string])[] {
    if (typeof node === "string") return [[path, node]];
    if (typeof node !== "object" || node === null) return [];
    return Object.entries(node).flatMap(([key, child]) =>
      leavesOf(child, path === "" ? key : `${path}.${key}`),
    );
  }

  it.each(Object.entries(CATALOGUES))(
    "holds no digit in any leaf of %s, so a figure is always the server's and never the copy's",
    (_locale, messages) => {
      const leaves = leavesOf(messages.staffChanges, "");
      const withDigits = leaves.filter(([, text]) => /\d/u.test(text));

      expect(leaves.length).toBeGreaterThan(30);
      expect(withDigits).toEqual([]);
    },
  );

  it("words every leaf in both languages", () => {
    const paths = (messages: unknown) =>
      leavesOf(messages, "")
        .map(([path]) => path)
        .sort();

    expect(paths(ruMessages.staffChanges)).toEqual(
      paths(roMessages.staffChanges),
    );
  });
});
