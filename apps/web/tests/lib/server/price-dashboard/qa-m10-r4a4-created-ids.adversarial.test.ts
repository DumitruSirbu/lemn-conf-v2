import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  ACCESSORY_IDS,
  HandleSchema,
  PALETTE_ENTRY_IDS,
  SAMPLE_PRICE_BOOK,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import {
  mintCreatedId,
  takenIdsOf,
  type RandomSource,
} from "@/lib/server/price-dashboard/created-ids";

// The ids the dashboard mints, swept over the sources a hostile or broken machine could offer and the sets of ids that
// are already spoken for. A mint answers an id that is free and of the right shape, or fails; it never answers a taken id.

const ID_LENGTH = 21;
const NOTHING_TAKEN: ReadonlySet<string> = new Set();
const MANY_MINTS = 3_000;

const someBytes = fc.uint8Array({ minLength: 0, maxLength: 64 });
const sourceOfAnyBytes = fc
  .array(someBytes, { minLength: 1, maxLength: 12 })
  .map<RandomSource>((answers) => {
    let next = 0;
    return () =>
      answers[Math.min(next++, answers.length - 1)] ?? new Uint8Array();
  });

function mintOrFail(
  taken: ReadonlySet<string>,
  source: RandomSource,
): string | undefined {
  try {
    return mintCreatedId(taken, source);
  } catch (failure) {
    expect(failure).toBeInstanceOf(Error);
    return undefined;
  }
}

describe("an id minted from any source", () => {
  propertyTest.prop([sourceOfAnyBytes], { numRuns: 500 })(
    "is of letters and digits, 21 long, in the shape the pages accept, or the mint fails",
    (source) => {
      const id = mintOrFail(NOTHING_TAKEN, source);

      if (id === undefined) return;
      expect(id).toMatch(/^[A-Za-z0-9]{21}$/);
      expect(id).toHaveLength(ID_LENGTH);
      expect(id).not.toBe("new");
    },
  );

  propertyTest.prop(
    [
      sourceOfAnyBytes,
      fc.subarray(
        [...ACCESSORY_IDS, ...PALETTE_ENTRY_IDS, ...HandleSchema.options],
        { minLength: 0 },
      ),
    ],
    { numRuns: 300 },
  )("is never an id of the set it is asked to avoid", (source, builtIns) => {
    const taken = takenIdsOf(SAMPLE_PRICE_BOOK, []);
    const id = mintOrFail(new Set([...taken, ...builtIns]), source);

    if (id === undefined) return;
    expect(taken.has(id)).toBe(false);
    expect(builtIns).not.toContain(id);
  });

  it("is drawn again, and differs, when the first draw is an id already taken", () => {
    const draw = Uint8Array.from({ length: ID_LENGTH }, (_, at) => at);
    const first = mintCreatedId(NOTHING_TAKEN, () => draw);

    const second = mintCreatedId(
      new Set([first]),
      (() => {
        let calls = 0;
        return () =>
          calls++ === 0
            ? draw
            : Uint8Array.from({ length: ID_LENGTH }, (_, at) => at + 9);
      })(),
    );

    expect(second).not.toBe(first);
  });
});

describe("the ids a mint must avoid", () => {
  const tierIds = fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9._-]{0,40}$/);

  const changeNamingAnId: fc.Arbitrary<DraftChange> = fc.oneof(
    tierIds.map(
      (tierId) =>
        ({
          address: { kind: "hardware-tier-created", tierId },
          value: {},
        }) as DraftChange,
    ),
    tierIds.map(
      (accessoryId) =>
        ({
          address: { kind: "accessory-created", accessoryId },
          value: {},
        }) as DraftChange,
    ),
    tierIds.map(
      (tierId) =>
        ({
          address: { kind: "hardware", tierId, field: "perHingeMinor" },
          value: 1,
        }) as DraftChange,
    ),
    tierIds.map(
      (tierId) =>
        ({
          address: { kind: "item-deleted", item: { kind: "hardware", tierId } },
          value: true,
        }) as DraftChange,
    ),
    tierIds.map(
      (accessoryId) =>
        ({
          address: {
            kind: "item-deleted",
            item: { kind: "accessory", accessoryId },
          },
          value: true,
        }) as DraftChange,
    ),
    tierIds.map(
      (accessoryId) =>
        ({
          address: {
            kind: "created-row-text",
            item: { kind: "accessory", accessoryId },
            field: "name",
          },
          value: "x",
        }) as DraftChange,
    ),
  );

  const idOf = (change: DraftChange): string => {
    const { address } = change;
    if ("tierId" in address) return address.tierId;
    if ("accessoryId" in address) return address.accessoryId;
    const { item } = address as {
      item: { tierId?: string; accessoryId?: string };
    };
    return item.tierId ?? item.accessoryId ?? "";
  };

  propertyTest.prop([fc.array(changeNamingAnId, { maxLength: 30 })], {
    numRuns: 300,
  })(
    "holds every id any change of the draft names, whatever kind of change it is",
    (changes) => {
      const taken = takenIdsOf(SAMPLE_PRICE_BOOK, changes);

      for (const change of changes) {
        expect(taken.has(idOf(change))).toBe(true);
      }
    },
  );

  it("holds every id the active book states for a class, a material tier, a rule and a linked accessory", () => {
    const taken = takenIdsOf(SAMPLE_PRICE_BOOK, []);
    const stated = [
      ...SAMPLE_PRICE_BOOK.hardware.tiers.flatMap(({ tierId, ruleId }) => [
        tierId,
        ruleId,
      ]),
      ...SAMPLE_PRICE_BOOK.material.tiers.flatMap(({ tierId, ruleId }) => [
        tierId,
        ruleId,
      ]),
      ...SAMPLE_PRICE_BOOK.cabinetRules.map(({ ruleId }) => ruleId),
      ...SAMPLE_PRICE_BOOK.linkedAccessories.flatMap(
        ({ accessoryId, ruleId }) => [accessoryId, ruleId],
      ),
      ...ACCESSORY_IDS,
      ...PALETTE_ENTRY_IDS,
      ...HandleSchema.options,
      "new",
    ];

    expect(stated.filter((id) => !taken.has(id))).toEqual([]);
  });
});

describe("many mints from the real source", () => {
  it("never repeat across a growing set of taken ids", () => {
    const taken = new Set(takenIdsOf(SAMPLE_PRICE_BOOK, []));
    const minted: string[] = [];

    for (let made = 0; made < MANY_MINTS; made += 1) {
      const id = mintCreatedId(taken);
      expect(taken.has(id)).toBe(false);
      taken.add(id);
      minted.push(id);
    }

    expect(new Set(minted).size).toBe(MANY_MINTS);
    expect(minted.every((id) => /^[A-Za-z0-9]{21}$/.test(id))).toBe(true);
  });

  it("does not reuse an id a book of an earlier version held, over the ids of a thousand earlier books", () => {
    const earlier = new Set(
      Array.from({ length: 1_000 }, () => mintCreatedId(NOTHING_TAKEN)),
    );

    const fresh = Array.from({ length: 1_000 }, () =>
      mintCreatedId(takenIdsOf(SAMPLE_PRICE_BOOK, [])),
    );

    expect(fresh.filter((id) => earlier.has(id))).toEqual([]);
  });
});
