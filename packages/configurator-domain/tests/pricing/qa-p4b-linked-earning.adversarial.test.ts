// M10 P4b-a and P4b-b, adversarial: what a linked accessory earns and bills (ADR 0177 A-1, A-19), checked against an
// oracle written from the design and the catalogue alone, and over kitchens the seeded one never is: the same row
// placed many times, a seeded body and its equivalent together, two accessories linked to one row.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { resolveCatalogEquivalent } from "../../src/catalog.js";
import type { Design } from "../../src/design.js";
import { KITCHEN_L_DESIGN } from "../../src/fixtures/kitchen-l-design.js";
import { MAX_PRICE_COEFFICIENT_MINOR } from "../../src/pricing/book-reading.js";
import type { LinkedAccessoryRule } from "../../src/pricing/price-book.js";
import type {
  AccessoryPriceLine,
  PricedDesign,
} from "../../src/pricing/price-lines.js";
import {
  accessory,
  availabilityOf,
  CATALOG,
  hardware,
  kitchenNamingEverything,
  material,
  priceUnder,
} from "../support/availability-kitchens.js";
import { NOTHING_DISABLED } from "../support/availability.js";
import {
  bookWithLinked,
  linkedRule,
  SUPPLIED_ROW_IDS,
} from "../support/linked-accessory-books.js";

const TEN_LEI_MINOR = 1_000;
const BUILT_IN_ACCESSORY_IDS = ["sinkProtectiveCover", "dishDryingRack"];

/** Half-up to a multiple of 1 000 in integer arithmetic, written here so the seam does not vouch for itself. */
function r10(exactMinor: number): number {
  return (
    Math.floor((exactMinor + TEN_LEI_MINOR / 2) / TEN_LEI_MINOR) * TEN_LEI_MINOR
  );
}

function pricedOrThrow(result: ReturnType<typeof priceUnder>): PricedDesign {
  if (!result.ok)
    throw new Error(`refused: ${result.failure.code} ${result.failure.detail}`);
  return result.priced;
}

function accessoryLinesOf(priced: PricedDesign): readonly AccessoryPriceLine[] {
  return priced.lines.filter(
    (line): line is AccessoryPriceLine => line.kind === "accessory",
  );
}

function linkedLinesOf(priced: PricedDesign): readonly AccessoryPriceLine[] {
  return accessoryLinesOf(priced).filter(
    (line) => !BUILT_IN_ACCESSORY_IDS.includes(line.accessoryId),
  );
}

/** The row a placement is priced as, from the catalogue's own declarations and nothing in the pricing package's
 *  accessory code: the equivalent where the body is insertable or points at an insertable row, its own id otherwise. */
function pricedAsRow(buildId: string): string {
  const definition = CATALOG.get(buildId);
  if (definition === undefined) throw new Error(`unknown body ${buildId}`);
  const equivalentId =
    definition.insertable === true ? buildId : definition.catalogEquivalentId;
  if (
    equivalentId !== undefined &&
    CATALOG.get(equivalentId)?.insertable === true
  )
    return equivalentId;
  return buildId;
}

function expectedQuantity(design: Design, linkedBuildId: string): number {
  return design.placements.filter(
    (placement) => pricedAsRow(placement.body.buildId) === linkedBuildId,
  ).length;
}

/** The seeded kitchen's placements, each repeated up to four times under a fresh id and moved along its wall so no two
 *  are the same placement: a kitchen with several of one row, which the seeded one has few of. */
const aCrowdedKitchen = fc
  .array(
    fc.tuple(
      fc.constantFrom(...KITCHEN_L_DESIGN.placements),
      fc.integer({ min: 1, max: 4 }),
    ),
    { maxLength: 12 },
  )
  .map(
    (picks): Design => ({
      ...KITCHEN_L_DESIGN,
      placements: picks.flatMap(([placement, copies], pickIndex) =>
        Array.from({ length: copies }, (_, copy) => ({
          ...placement,
          id: `${placement.id}#${String(pickIndex)}.${String(copy)}`,
        })),
      ),
    }),
  );

const KITCHEN_ROWS: readonly string[] = [
  ...new Set(
    KITCHEN_L_DESIGN.placements.map((placement) =>
      pricedAsRow(placement.body.buildId),
    ),
  ),
];

const aRowToLinkTo = fc.constantFrom(
  ...KITCHEN_ROWS.filter((row) => SUPPLIED_ROW_IDS.includes(row)),
  ...SUPPLIED_ROW_IDS,
);

/** Accessories that may share a row: no uniqueness on `linkedBuildId`, unique ids as the parser requires. */
const aListOfLinkedRules = fc
  .array(
    fc.record({
      row: aRowToLinkTo,
      perUnitMinor: fc.integer({ min: 0, max: 600_000 }),
    }),
    { maxLength: 8 },
  )
  .map((entries) =>
    entries.map(({ row, perUnitMinor }, index) =>
      linkedRule(`linked-${String(index)}`, {
        linkedBuildId: row,
        perUnitMinor,
      }),
    ),
  );

describe("the quantity a linked accessory earns, against an independent oracle (P4b-a)", () => {
  it("is the number of placements priced as the linked row, over crowded kitchens and lists that share rows", () => {
    fc.assert(
      fc.property(aCrowdedKitchen, aListOfLinkedRules, (design, rules) => {
        const priced = pricedOrThrow(
          priceUnder(NOTHING_DISABLED, design, bookWithLinked(rules)),
        );

        for (const rule of rules) {
          const line = linkedLinesOf(priced).find(
            (candidate) => candidate.accessoryId === rule.accessoryId,
          );
          const expected = expectedQuantity(design, rule.linkedBuildId);

          expect(line?.quantity ?? 0).toBe(expected);
          expect(line === undefined).toBe(expected === 0);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("bills r10(quantity x rate) of the whole line, never the rounded rate times the quantity", () => {
    // 12 345 per unit over two placements: r10(24 690) = 25 000, but 2 x r10(12 345) = 24 000.
    const drawers = KITCHEN_L_DESIGN.placements.filter(
      (placement) => pricedAsRow(placement.body.buildId) === "base-3drawer",
    );
    const twoSinks: Design = {
      ...KITCHEN_L_DESIGN,
      placements: [
        ...drawers,
        ...drawers.map((placement) => ({
          ...placement,
          id: `${placement.id}#2`,
        })),
      ],
    };
    const quantity = twoSinks.placements.length;
    expect(quantity).toBeGreaterThanOrEqual(2);

    const priced = pricedOrThrow(
      priceUnder(
        NOTHING_DISABLED,
        twoSinks,
        bookWithLinked([
          linkedRule("organiser", {
            linkedBuildId: "base-3drawer",
            perUnitMinor: 12_345,
          }),
        ]),
      ),
    );
    const line = linkedLinesOf(priced)[0];

    expect(line?.amountMinor).toBe(r10(quantity * 12_345));
    expect(line?.quantity).toBe(quantity);
    expect(line?.unitAmountMinor).toBe(12_345);
  });

  it("rounds every rate and quantity pair half up at the seam, over a sweep of rates and counts", () => {
    const row = "base-3drawer";
    const available = expectedQuantity(KITCHEN_L_DESIGN, row);
    expect(available).toBeGreaterThanOrEqual(1);

    for (let perUnitMinor = 0; perUnitMinor <= 6_000; perUnitMinor += 1) {
      const priced = pricedOrThrow(
        priceUnder(
          NOTHING_DISABLED,
          KITCHEN_L_DESIGN,
          bookWithLinked([
            linkedRule("sweep", { linkedBuildId: row, perUnitMinor }),
          ]),
        ),
      );
      const line = linkedLinesOf(priced)[0];
      const exact = available * perUnitMinor;

      expect(line?.amountMinor ?? 0, `rate ${String(perUnitMinor)}`).toBe(
        r10(exact),
      );
    }
  });

  it("holds every linked line to a whole number of ten lei and the total to the sum of the lines", () => {
    fc.assert(
      fc.property(aCrowdedKitchen, aListOfLinkedRules, (design, rules) => {
        const priced = pricedOrThrow(
          priceUnder(NOTHING_DISABLED, design, bookWithLinked(rules)),
        );

        for (const line of linkedLinesOf(priced)) {
          const rule = rules.find(
            (candidate) => candidate.accessoryId === line.accessoryId,
          );
          expect(line.amountMinor).toBe(
            r10(
              expectedQuantity(design, rule?.linkedBuildId ?? "") *
                (rule?.perUnitMinor ?? 0),
            ),
          );
          expect(line.amountMinor % TEN_LEI_MINOR).toBe(0);
          expect(Object.is(line.amountMinor, -0)).toBe(false);
        }
        expect(priced.totalMinor).toBe(
          priced.lines.reduce((sum, line) => sum + line.amountMinor, 0),
        );
      }),
      { numRuns: 200 },
    );
  });

  it("publishes a rate of negative zero as a zero-amount line whose amount and total are plain zeros", () => {
    // The parser admits -0 (a safe integer, not below zero), and the line's `unitAmountMinor` keeps it as -0: that
    // cannot survive a JSON round trip, so no stored book carries it. What a customer is billed must not be -0.
    const result = priceUnder(
      NOTHING_DISABLED,
      KITCHEN_L_DESIGN,
      bookWithLinked([
        linkedRule("free", { linkedBuildId: "base-3drawer", perUnitMinor: -0 }),
      ]),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const line of result.priced.lines) {
      expect(Object.is(line.amountMinor, -0), line.lineId).toBe(false);
    }
    expect(Object.is(result.priced.totalMinor, -0)).toBe(false);
  });

  it("never throws and never publishes an unsafe total when fifty accessories bill the largest rate over a crowded kitchen", () => {
    const rules = Array.from({ length: 50 }, (_, index) =>
      linkedRule(`big-${String(index)}`, {
        linkedBuildId: "base-3drawer",
        perUnitMinor: MAX_PRICE_COEFFICIENT_MINOR,
      }),
    );
    const crowded: Design = {
      ...KITCHEN_L_DESIGN,
      placements: Array.from({ length: 6 }, (_, copy) =>
        KITCHEN_L_DESIGN.placements.map((placement) => ({
          ...placement,
          id: `${placement.id}#${String(copy)}`,
        })),
      ).flat(),
    };

    const result = priceUnder(NOTHING_DISABLED, crowded, bookWithLinked(rules));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Number.isSafeInteger(result.priced.totalMinor)).toBe(true);
    for (const line of result.priced.lines) {
      expect(Number.isSafeInteger(line.amountMinor)).toBe(true);
    }
  });

  it("is independent of the order the placements are listed in", () => {
    fc.assert(
      fc.property(
        aCrowdedKitchen,
        aListOfLinkedRules,
        fc.integer({ min: 0, max: 1_000 }),
        (design, rules, seed) => {
          const reversed: Design = {
            ...design,
            placements: [...design.placements].reverse(),
          };
          const rotated: Design = {
            ...design,
            placements: design.placements.map(
              (_, index, all) => all[(index + seed) % all.length] as never,
            ),
          };
          const book = bookWithLinked(rules);
          const lines = (candidate: Design) =>
            linkedLinesOf(
              pricedOrThrow(priceUnder(NOTHING_DISABLED, candidate, book)),
            );

          expect(lines(reversed)).toEqual(lines(design));
          if (design.placements.length > 0) {
            expect(lines(rotated)).toEqual(lines(design));
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("gives the same lines for the same inputs on every call, and for a copy of the book", () => {
    const book = bookWithLinked([
      linkedRule("organiser", { linkedBuildId: "base-3drawer" }),
    ]);

    const first = priceUnder(NOTHING_DISABLED, KITCHEN_L_DESIGN, book);
    const again = priceUnder(NOTHING_DISABLED, KITCHEN_L_DESIGN, book);
    const copy = priceUnder(
      NOTHING_DISABLED,
      KITCHEN_L_DESIGN,
      JSON.parse(JSON.stringify(book)) as typeof book,
    );

    expect(again).toEqual(first);
    expect(copy).toEqual(first);
  });

  it("changes only the order of the linked lines when the book lists the accessories in another order", () => {
    fc.assert(
      fc.property(aListOfLinkedRules, (rules) => {
        const forward = pricedOrThrow(
          priceUnder(NOTHING_DISABLED, KITCHEN_L_DESIGN, bookWithLinked(rules)),
        );
        const backward = pricedOrThrow(
          priceUnder(
            NOTHING_DISABLED,
            KITCHEN_L_DESIGN,
            bookWithLinked([...rules].reverse()),
          ),
        );
        const byId = (priced: PricedDesign) =>
          new Map(
            linkedLinesOf(priced).map((line) => [line.accessoryId, line]),
          );

        expect(byId(backward)).toEqual(byId(forward));
        expect(backward.totalMinor).toBe(forward.totalMinor);
        expect(linkedLinesOf(backward).map((line) => line.accessoryId)).toEqual(
          [...linkedLinesOf(forward).map((line) => line.accessoryId)].reverse(),
        );
      }),
      { numRuns: 100 },
    );
  });
});

describe("a linked accessory leaves everything else as it was (P4b-b), over kitchens that name every setting and crowded ones", () => {
  const settingsKitchens = [KITCHEN_L_DESIGN, kitchenNamingEverything()];

  it("keeps every non-linked line, and the total less the linked lines, equal to the book with none", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constantFrom(...settingsKitchens), aCrowdedKitchen),
        aListOfLinkedRules,
        (design, rules) => {
          const without = pricedOrThrow(
            priceUnder(NOTHING_DISABLED, design, bookWithLinked([])),
          );
          const withLinked = pricedOrThrow(
            priceUnder(NOTHING_DISABLED, design, bookWithLinked(rules)),
          );
          const linkedIds = new Set(rules.map((rule) => rule.accessoryId));
          const otherLines = withLinked.lines.filter(
            (line) =>
              line.kind !== "accessory" || !linkedIds.has(line.accessoryId),
          );

          expect(JSON.stringify(otherLines)).toBe(
            JSON.stringify(without.lines),
          );
          expect(withLinked.totalMinor).toBe(
            without.totalMinor +
              linkedLinesOf(withLinked).reduce(
                (sum, line) => sum + line.amountMinor,
                0,
              ),
          );
          for (const key of Object.keys(without)) {
            if (key === "lines" || key === "totalMinor") continue;
            expect(
              (withLinked as unknown as Record<string, unknown>)[key],
            ).toEqual((without as unknown as Record<string, unknown>)[key]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("does not move a built-in's quantity when a linked accessory sits on the sink row, the rack's host or a wall cabinet", () => {
    const rows = ["base-sink", "wall-cabinet", "base-3drawer"];
    const book = bookWithLinked(
      rows.map((linkedBuildId, index) =>
        linkedRule(`probe-${String(index)}`, { linkedBuildId }),
      ),
    );
    const quantitiesOf = (priced: PricedDesign) =>
      accessoryLinesOf(priced)
        .filter((line) => BUILT_IN_ACCESSORY_IDS.includes(line.accessoryId))
        .map((line) => [line.accessoryId, line.quantity, line.amountMinor]);

    expect(
      quantitiesOf(
        pricedOrThrow(priceUnder(NOTHING_DISABLED, KITCHEN_L_DESIGN, book)),
      ),
    ).toEqual(
      quantitiesOf(
        pricedOrThrow(
          priceUnder(NOTHING_DISABLED, KITCHEN_L_DESIGN, bookWithLinked([])),
        ),
      ),
    );
  });
});

describe("a switched-off linked accessory (P4a-d, P4b)", () => {
  const book = bookWithLinked([
    linkedRule("organiser", { linkedBuildId: "base-3drawer" }),
    linkedRule("plinth-light", { linkedBuildId: "base-3drawer" }),
  ]);

  it("loses exactly its own line and amount, and nothing else, when it is the only one off", () => {
    const on = pricedOrThrow(
      priceUnder(NOTHING_DISABLED, KITCHEN_L_DESIGN, book),
    );
    const off = pricedOrThrow(
      priceUnder(
        availabilityOf([accessory("organiser")]),
        KITCHEN_L_DESIGN,
        book,
      ),
    );
    const organiser = on.lines.find(
      (line) => line.lineId === "accessory:organiser",
    );

    expect(organiser).toBeDefined();
    expect(off.lines).toEqual(
      on.lines.filter((line) => line.lineId !== "accessory:organiser"),
    );
    expect(off.totalMinor).toBe(on.totalMinor - (organiser?.amountMinor ?? 0));
  });

  it("is restored exactly, byte for byte, when switched on again, whatever else was switched off and on between", () => {
    const on = pricedOrThrow(
      priceUnder(NOTHING_DISABLED, KITCHEN_L_DESIGN, book),
    );
    const there = priceUnder(
      availabilityOf([accessory("organiser"), accessory("plinth-light")], "2"),
      KITCHEN_L_DESIGN,
      book,
    );
    const back = pricedOrThrow(
      priceUnder(availabilityOf([], "3"), KITCHEN_L_DESIGN, book),
    );

    expect(there.ok).toBe(true);
    expect(JSON.stringify(back)).toBe(JSON.stringify(on));
  });

  it("is not switched off by an item of another kind that spells its id", () => {
    const on = pricedOrThrow(
      priceUnder(NOTHING_DISABLED, KITCHEN_L_DESIGN, book),
    );
    const lookalikes = availabilityOf([
      material("organiser"),
      hardware("organiser"),
      { kind: "finish", finishId: "organiser" },
      material("plinth-light"),
    ]);

    const result = priceUnder(lookalikes, KITCHEN_L_DESIGN, book);

    expect(result.ok && result.priced.lines).toEqual(on.lines);
  });

  it("is not switched off by a lookalike id that differs in case or by a prefix", () => {
    const on = pricedOrThrow(
      priceUnder(NOTHING_DISABLED, KITCHEN_L_DESIGN, book),
    );
    const result = priceUnder(
      availabilityOf([
        accessory("Organiser"),
        accessory("organiser "),
        accessory("accessory:organiser"),
        accessory("organise"),
      ]),
      KITCHEN_L_DESIGN,
      book,
    );

    expect(result.ok && result.priced.lines).toEqual(on.lines);
  });

  it("agrees with an oracle for every subset of the two built-ins and two linked accessories switched off", () => {
    const everyone = [
      "sinkProtectiveCover",
      "dishDryingRack",
      "organiser",
      "plinth-light",
    ];
    for (let mask = 0; mask < 1 << everyone.length; mask += 1) {
      const off = everyone.filter((_, bit) => (mask & (1 << bit)) !== 0);
      const result = priceUnder(
        availabilityOf(off.map(accessory)),
        KITCHEN_L_DESIGN,
        book,
      );
      const onLinesOf = accessoryLinesOf(
        pricedOrThrow(priceUnder(NOTHING_DISABLED, KITCHEN_L_DESIGN, book)),
      ).map((line) => line.accessoryId);

      expect(
        result.ok &&
          accessoryLinesOf(result.priced).map((line) => line.accessoryId),
      ).toEqual(onLinesOf.filter((id) => !off.includes(id)));
    }
  });
});

describe("the linked rule type carries nothing the line is built from beyond its own fields", () => {
  it("copies the authored words onto the line and invents no key", () => {
    const rule: LinkedAccessoryRule = linkedRule("organiser", {
      linkedBuildId: "base-3drawer",
      description: "Pentru un sertar.",
    });

    const line = linkedLinesOf(
      pricedOrThrow(
        priceUnder(NOTHING_DISABLED, KITCHEN_L_DESIGN, bookWithLinked([rule])),
      ),
    )[0];

    expect(line).toMatchObject({
      name: rule.name,
      description: rule.description,
      ruleId: rule.ruleId,
    });
    expect(line).not.toHaveProperty("nameKey");
    expect(line).not.toHaveProperty("descriptionKey");
    expect(resolveCatalogEquivalent(CATALOG, "base-3drawer")?.buildId).toBe(
      "base-3drawer",
    );
  });
});
