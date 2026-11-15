// Adversarial QA of M12 wave W6d, the sent copy's stored row amounts as the staff cabinet list draws them (ADR 0185
// decision 4; plan W6d-1, W6d-1b). The implementer's tests rename two placements to `__proto__` and `constructor` and
// give each a stored line; they cannot tell a `Map` from a plain object, because a plain object keyed by an id the lines
// name works for those ids too. The probes here are the ones a plain-object lookup fails: a placement whose id is an
// `Object.prototype` member and for which NO line is stored. The oracle for every amount is `describeLineAmount` of the
// stored line, never the model's own output read back.
import { fc, test } from "@fast-check/vitest";
import { KITCHEN_L_DESIGN, type Design } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { describeLineAmount } from "@/price/starting-price";
import { NO_PRICE_BOOK } from "@/price/price-book-root";
import {
  describeCabinetList,
  type AvailableCabinetList,
  type CabinetList,
} from "@/staff/staff-cabinet-list-model";
import type { KitchenVersion } from "@/staff/kitchen-version-rows";
import type { StaffSentCabinetLineWire } from "@/staff/staff-kitchens-wire-contract";

import roMessages from "../../src/messages/ro.json";
import { contentFor } from "../support/catalogues";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";

const content = contentFor("ro", roMessages);
const SENT = KITCHEN_L_DESIGN;
const PLACEMENT_IDS = SENT.placements.map(({ id }) => id);
const FIRST_ID = PLACEMENT_IDS[0] ?? "";
const PROTOTYPE_MEMBER_NAMES = [
  "__proto__",
  "constructor",
  "toString",
  "valueOf",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toLocaleString",
  "__defineGetter__",
  "__lookupGetter__",
] as const;

function listOf(input: {
  readonly design: Design;
  readonly version: KitchenVersion;
  readonly other?: Design;
  readonly priceBook?: Parameters<typeof describeCabinetList>[0]["priceBook"];
  readonly sentLines: readonly StaffSentCabinetLineWire[];
}): AvailableCabinetList {
  const list: CabinetList = describeCabinetList({
    shown: { design: input.design, version: input.version },
    other: input.other,
    content,
    priceBook: input.priceBook ?? SAMPLE_PRICE_ROOT,
    sentLines: input.sentLines,
  });
  if (list.kind !== "available") throw new Error("the copy was not listed");
  return list;
}

function rowsOf(list: AvailableCabinetList) {
  return list.groups.flatMap((group) => group.rows);
}

function amountTextsOf(list: AvailableCabinetList): Map<string, string> {
  return new Map(
    rowsOf(list).flatMap((row): [string, string][] =>
      row.amountText === undefined ? [] : [[row.placementId, row.amountText]],
    ),
  );
}

function renamedAfter(design: Design, names: readonly string[]): Design {
  return {
    ...design,
    placements: design.placements.map((placement, index) => {
      const name = names[index];
      return name === undefined ? placement : { ...placement, id: name };
    }),
  };
}

describe("a placement whose id is a member of Object.prototype, and for which no line was stored", () => {
  const withProtoNames = renamedAfter(SENT, PROTOTYPE_MEMBER_NAMES);

  it("keeps ten distinct rows named by the prototype's members, so the probe is real", () => {
    const list = listOf({
      design: withProtoNames,
      version: "sent",
      sentLines: [],
    });

    expect(
      rowsOf(list)
        .map((row) => row.placementId)
        .filter((id) => PROTOTYPE_MEMBER_NAMES.includes(id as never)),
    ).toHaveLength(PROTOTYPE_MEMBER_NAMES.length);
  });

  it("draws no amount on any row when no line is stored (a plain-object lookup would find an inherited function)", () => {
    const list = listOf({
      design: withProtoNames,
      version: "sent",
      sentLines: [],
    });

    for (const row of rowsOf(list)) {
      expect(row, row.placementId).not.toHaveProperty("amountText");
    }
  });

  it("draws no amount on those rows when the lines name only other placements", () => {
    const others: StaffSentCabinetLineWire[] = PLACEMENT_IDS.slice(
      PROTOTYPE_MEMBER_NAMES.length,
    ).map((placementId) => ({ placementId, amountMinor: 123_450 }));

    const list = listOf({
      design: withProtoNames,
      version: "sent",
      sentLines: others,
    });

    const drawn = amountTextsOf(list);
    for (const name of PROTOTYPE_MEMBER_NAMES) {
      expect(drawn.has(name), name).toBe(false);
    }
    expect(drawn.size).toBe(others.length);
  });

  it("gives a stored amount to the row it names alone, whatever the other prototype-named rows hold", () => {
    for (const name of PROTOTYPE_MEMBER_NAMES) {
      const list = listOf({
        design: withProtoNames,
        version: "sent",
        sentLines: [{ placementId: name, amountMinor: 77_770 }],
      });

      expect([...amountTextsOf(list).entries()], name).toEqual([
        [name, describeLineAmount(77_770)],
      ]);
    }
  });

  it("leaves Object.prototype untouched by any of it", () => {
    listOf({
      design: withProtoNames,
      version: "sent",
      sentLines: PROTOTYPE_MEMBER_NAMES.map((placementId, index) => ({
        placementId,
        amountMinor: (index + 1) * 1_000,
      })),
    });

    expect(Object.keys(Object.prototype)).toEqual([]);
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
    expect(({} as { amountText?: unknown }).amountText).toBeUndefined();
  });
});

describe("a placement the stored lines name twice (the model's own comment says the later line wins)", () => {
  const oneLine = (amountMinor: number) => ({
    placementId: FIRST_ID,
    amountMinor,
  });
  const drawnFor = (lines: readonly StaffSentCabinetLineWire[]) =>
    amountTextsOf(listOf({ design: SENT, version: "sent", sentLines: lines }));

  it("takes the later of two positive amounts", () => {
    expect(drawnFor([oneLine(100_000), oneLine(200_000)]).get(FIRST_ID)).toBe(
      describeLineAmount(200_000),
    );
  });

  it("takes a later positive amount over an earlier zero", () => {
    expect(drawnFor([oneLine(0), oneLine(200_000)]).get(FIRST_ID)).toBe(
      describeLineAmount(200_000),
    );
  });

  it("takes a later zero over an earlier positive amount, which then draws no amount (never the superseded one)", () => {
    expect(drawnFor([oneLine(100_000), oneLine(0)]).get(FIRST_ID)).toBe(
      undefined,
    );
  });
});

describe("the amounts over arbitrary stored lines", () => {
  const amountArb = fc.oneof(
    fc.constant(0),
    fc.integer({ min: 1, max: 1_000_000_000 }),
    fc.constantFrom(1, 9, 10, 99, 100, 999, 1_000, 99_999, 100_000),
    fc.constant(Number.MAX_SAFE_INTEGER),
  );
  const idArb = fc.oneof(
    fc.constantFrom(...PLACEMENT_IDS),
    fc.constantFrom(...PROTOTYPE_MEMBER_NAMES),
    fc.string({ maxLength: 70 }),
  );

  test.prop(
    [fc.uniqueArray(fc.tuple(idArb, amountArb), { selector: ([id]) => id })],
    { numRuns: 300 },
  )(
    "draws on each sent row exactly the stored positive amount of its id, none for a zero or for an id with no line",
    (pairs) => {
      const lines = pairs.map(([placementId, amountMinor]) => ({
        placementId,
        amountMinor,
      }));
      const expected = new Map(
        lines
          .filter(({ amountMinor }) => amountMinor > 0)
          .map(({ placementId, amountMinor }) => [
            placementId,
            describeLineAmount(amountMinor),
          ]),
      );

      const list = listOf({ design: SENT, version: "sent", sentLines: lines });

      for (const row of rowsOf(list)) {
        expect(row.amountText, row.placementId).toBe(
          expected.get(row.placementId),
        );
      }
    },
  );

  test.prop([fc.array(fc.tuple(idArb, amountArb), { maxLength: 40 })], {
    numRuns: 200,
  })(
    "never lets the lines change a row's name, facts, change mark or place, and never adds or removes a row",
    (pairs) => {
      const lines = pairs.map(([placementId, amountMinor]) => ({
        placementId,
        amountMinor,
      }));
      const bare = listOf({ design: SENT, version: "sent", sentLines: [] });

      const withLines = listOf({
        design: SENT,
        version: "sent",
        sentLines: lines,
      });

      const strip = (list: AvailableCabinetList) =>
        list.groups.map((group) => ({
          key: group.key,
          rows: group.rows.map((row) => ({ ...row, amountText: undefined })),
        }));
      expect(strip(withLines)).toEqual(strip(bare));
    },
  );

  test.prop([fc.array(fc.tuple(idArb, amountArb), { maxLength: 40 })], {
    numRuns: 100,
  })(
    "draws the same current list whatever lines were stored, and the same list from the sent lines whatever the book is",
    (pairs) => {
      const lines = pairs.map(([placementId, amountMinor]) => ({
        placementId,
        amountMinor,
      }));

      const currentBare = listOf({
        design: SENT,
        version: "current",
        sentLines: [],
      });
      const currentWithLines = listOf({
        design: SENT,
        version: "current",
        sentLines: lines,
      });
      const sentOnRefusedBook = listOf({
        design: SENT,
        version: "sent",
        priceBook: NO_PRICE_BOOK,
        sentLines: lines,
      });
      const sentOnSampleBook = listOf({
        design: SENT,
        version: "sent",
        sentLines: lines,
      });

      expect(currentWithLines).toEqual(currentBare);
      expect(sentOnRefusedBook).toEqual(sentOnSampleBook);
    },
  );
});

describe("the sent copy's amounts beside a current copy that differs", () => {
  const [, , ...rest] = SENT.placements;
  const current: Design = { ...SENT, placements: rest };

  it("draw on the sent copy's rows, including those the current copy no longer holds, at the stored amount and not today's", () => {
    const [first, second] = PLACEMENT_IDS;
    if (first === undefined || second === undefined) throw new Error("no body");
    const sentLines = [
      { placementId: first, amountMinor: 999_990_000 },
      { placementId: second, amountMinor: 888_880_000 },
    ];

    const sent = listOf({
      design: SENT,
      version: "sent",
      other: current,
      sentLines,
    });

    expect(amountTextsOf(sent).get(first)).toBe(
      describeLineAmount(999_990_000),
    );
    expect(amountTextsOf(sent).get(second)).toBe(
      describeLineAmount(888_880_000),
    );
  });

  it("are not drawn on a removed row of the current list, though a stored line names it", () => {
    const [first, second] = PLACEMENT_IDS;
    if (first === undefined || second === undefined) throw new Error("no body");

    const list = listOf({
      design: current,
      version: "current",
      other: SENT,
      sentLines: [
        { placementId: first, amountMinor: 999_990_000 },
        { placementId: second, amountMinor: 888_880_000 },
      ],
    });

    const removed = rowsOf(list).filter((row) => row.change === "removed");
    expect(removed.map((row) => row.placementId).sort()).toEqual(
      [first, second].sort(),
    );
    for (const row of removed) expect(row).not.toHaveProperty("amountText");
  });
});

describe("an amount at the edges of what the reader lets through", () => {
  it.each([
    ["one minor unit, which a line shows rounded up to ten lei", 1],
    ["ten lei exactly", 1_000],
    ["one minor unit past ten lei", 1_001],
    ["the largest safe integer", Number.MAX_SAFE_INTEGER],
  ])(
    "draws %s as describeLineAmount words it, without failing the list",
    (_label, amountMinor) => {
      const list = listOf({
        design: SENT,
        version: "sent",
        sentLines: [{ placementId: FIRST_ID, amountMinor }],
      });

      expect(amountTextsOf(list).get(FIRST_ID)).toBe(
        describeLineAmount(amountMinor),
      );
    },
  );
});
