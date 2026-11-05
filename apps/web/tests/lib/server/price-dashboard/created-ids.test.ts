import { describe, expect, it } from "vitest";

import {
  ACCESSORY_IDS,
  HandleSchema,
  PALETTE_ENTRY_IDS,
  SAMPLE_PRICE_BOOK,
  readDashboardAuditEntry,
  type DraftChange,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { draftChangedEntry } from "@/lib/server/price-dashboard/dashboard-audit-entries";
import {
  mintCreatedId,
  takenIdsOf,
  type RandomSource,
} from "@/lib/server/price-dashboard/created-ids";

const MINTED_ID = /^[A-Za-z0-9]{21}$/;
const NOTHING_TAKEN: ReadonlySet<string> = new Set();
const ID_LENGTH = 21;
const ALPHABET_SIZE = 62;
const FIRST_BYTE_BIASING_THE_DRAW = 248;
const ANY_BYTE_COUNT = 256;
const MANY_MINTS = 5_000;

function bytesFrom(start: number): Uint8Array {
  return Uint8Array.from({ length: ID_LENGTH }, (_, offset) => start + offset);
}

function sourceAnswering(...answers: readonly Uint8Array[]): RandomSource {
  let next = 0;
  return () => {
    const answer = answers[Math.min(next, answers.length - 1)];
    next += 1;
    if (answer === undefined) throw new Error("the source has no answer");
    return answer;
  };
}

const bookWith = (changes: Partial<PriceBook>): PriceBook => ({
  ...SAMPLE_PRICE_BOOK,
  ...changes,
});

describe("a minted id", () => {
  it("has the shape every minted id has, whatever the source draws", () => {
    for (let start = 0; start < 256; start += 7) {
      expect(
        mintCreatedId(NOTHING_TAKEN, sourceAnswering(bytesFrom(start))),
      ).toMatch(MINTED_ID);
    }
  });

  it("is drawn from 62 distinct letters and digits, one for each byte below the limit that keeps the draw unbiased", () => {
    const characters = new Set<string>();
    for (
      let start = 0;
      start < FIRST_BYTE_BIASING_THE_DRAW;
      start += ID_LENGTH
    ) {
      const bytes = Uint8Array.from(
        { length: ID_LENGTH },
        (_, offset) => (start + offset) % FIRST_BYTE_BIASING_THE_DRAW,
      );
      mintCreatedId(NOTHING_TAKEN, sourceAnswering(bytes))
        .split("")
        .forEach((character) => characters.add(character));
    }

    expect(characters.size).toBe(ALPHABET_SIZE);
    expect(
      [...characters].every((character) => /^[A-Za-z0-9]$/.test(character)),
    ).toBe(true);
  });

  it("never uses a byte that would favour the first characters, and draws on for the rest", () => {
    const unusable = new Uint8Array(ID_LENGTH).fill(ANY_BYTE_COUNT - 1);
    const usable = bytesFrom(0);

    const id = mintCreatedId(NOTHING_TAKEN, sourceAnswering(unusable, usable));

    expect(id).toBe(mintCreatedId(NOTHING_TAKEN, sourceAnswering(usable)));
  });

  it("is a failure when the source never gives enough usable bytes", () => {
    const unusable = new Uint8Array(ID_LENGTH).fill(ANY_BYTE_COUNT - 1);

    expect(() =>
      mintCreatedId(NOTHING_TAKEN, sourceAnswering(unusable)),
    ).toThrow();
  });

  it("is as long as a version's id, which the stores' own ids are", () => {
    expect(mintCreatedId(NOTHING_TAKEN)).toHaveLength(ID_LENGTH);
  });

  it("is never derived from what was typed or counted: the same draw gives the same id whatever is taken elsewhere", () => {
    const draw = bytesFrom(3);

    const alone = mintCreatedId(NOTHING_TAKEN, sourceAnswering(draw));
    const amongOthers = mintCreatedId(
      new Set(["a", "b", "c"]),
      sourceAnswering(draw),
    );

    expect(amongOthers).toBe(alone);
  });

  it("is drawn again when the draw is taken, and the second draw is the one answered", () => {
    const first = mintCreatedId(NOTHING_TAKEN, sourceAnswering(bytesFrom(0)));
    const second = mintCreatedId(NOTHING_TAKEN, sourceAnswering(bytesFrom(9)));

    const minted = mintCreatedId(
      new Set([first]),
      sourceAnswering(bytesFrom(0), bytesFrom(9)),
    );

    expect(minted).toBe(second);
  });

  it("is a failure, not a reused id, when the source keeps answering taken ids", () => {
    const only = mintCreatedId(NOTHING_TAKEN, sourceAnswering(bytesFrom(0)));

    expect(() =>
      mintCreatedId(new Set([only]), sourceAnswering(bytesFrom(0))),
    ).toThrow();
  });

  it("begins with a letter or a digit, so the audit row that names it is accepted, whatever is drawn", () => {
    for (let mint = 0; mint < MANY_MINTS; mint += 1) {
      const entry = draftChangedEntry({
        kind: "hardware-tier-created",
        tierId: mintCreatedId(NOTHING_TAKEN),
      });

      expect(readDashboardAuditEntry(entry.action, entry.detail).ok).toBe(true);
    }
  });

  it("shows no repeat over many mints, each unique against every id minted before it", () => {
    const taken = new Set<string>();

    for (let mint = 0; mint < MANY_MINTS; mint += 1) {
      const id = mintCreatedId(taken);
      expect(taken.has(id)).toBe(false);
      expect(id).not.toBe("new");
      taken.add(id);
    }

    expect(taken.size).toBe(MANY_MINTS);
  });
});

describe("the ids taken", () => {
  const taken = (book: PriceBook, changes: readonly DraftChange[] = []) =>
    takenIdsOf(book, changes);

  it("hold the page that opens a new row, so no row can be reached only as that page", () => {
    expect(taken(SAMPLE_PRICE_BOOK).has("new")).toBe(true);
  });

  it.each([
    ["a built-in accessory", ACCESSORY_IDS],
    ["a palette colour", PALETTE_ENTRY_IDS],
    ["a handle", HandleSchema.options],
  ])("hold every id of %s", (_, ids) => {
    const held = taken(SAMPLE_PRICE_BOOK);

    expect(ids.filter((id) => !held.has(id))).toEqual([]);
  });

  it("hold every tier of both groups, keyed or not, and the rule each is priced by", () => {
    const held = taken(SAMPLE_PRICE_BOOK);
    const tiers = [
      ...SAMPLE_PRICE_BOOK.hardware.tiers,
      ...SAMPLE_PRICE_BOOK.material.tiers,
    ];

    expect(
      tiers
        .flatMap(({ tierId, ruleId }) => [tierId, ruleId])
        .filter((id) => !held.has(id)),
    ).toEqual([]);
  });

  it("hold every cabinet rule, since a class is priced by a rule named as it is", () => {
    const held = taken(SAMPLE_PRICE_BOOK);

    expect(
      SAMPLE_PRICE_BOOK.cabinetRules
        .map(({ ruleId }) => ruleId)
        .filter((id) => !held.has(id)),
    ).toEqual([]);
  });

  it("hold a linked accessory the book states, and its rule", () => {
    const book = bookWith({
      linkedAccessories: [
        {
          accessoryId: "stated-accessory",
          ruleId: "accessory.stated-accessory",
          linkedBuildId: "base-3drawer",
          perUnitMinor: 1_000,
          name: "Soclu",
        },
      ],
    });

    const held = taken(book);

    expect(held.has("stated-accessory")).toBe(true);
    expect(held.has("accessory.stated-accessory")).toBe(true);
  });

  it("hold the id of a class the draft creates, and of an accessory the draft creates, and not of a kind that is the other's", () => {
    const held = taken(SAMPLE_PRICE_BOOK, [
      {
        address: { kind: "hardware-tier-created", tierId: "drafted-class" },
        value: { name: "A", description: "" },
      },
      {
        address: {
          kind: "accessory-created",
          accessoryId: "drafted-accessory",
        },
        value: { linkedBuildId: "base-3drawer", perUnitMinor: 1, name: "B" },
      },
    ]);

    expect(held.has("drafted-class")).toBe(true);
    expect(held.has("drafted-accessory")).toBe(true);
  });

  it("hold the id a draft names for a rate, a price, a rename or a deletion, so a creation that was removed is not given again", () => {
    const held = taken(SAMPLE_PRICE_BOOK, [
      {
        address: {
          kind: "hardware",
          tierId: "rated-class",
          field: "perHingeMinor",
        },
        value: 1,
      },
      {
        address: {
          kind: "accessory",
          accessoryId: "priced-accessory",
          field: "perUnitMinor",
        },
        value: 1,
      },
      {
        address: {
          kind: "created-row-text",
          item: { kind: "hardware", tierId: "renamed-class" },
          field: "name",
        },
        value: "Nou",
      },
      {
        address: {
          kind: "item-deleted",
          item: { kind: "accessory", accessoryId: "deleted-accessory" },
        },
        value: true,
      },
    ] as unknown as readonly DraftChange[]);

    expect(
      [
        "rated-class",
        "priced-accessory",
        "renamed-class",
        "deleted-accessory",
      ].filter((id) => !held.has(id)),
    ).toEqual([]);
  });

  it("hold what a draft change names however malformed it is, and fail on none", () => {
    expect(() =>
      taken(SAMPLE_PRICE_BOOK, [
        { address: { kind: "hardware", tierId: 7 }, value: 1 },
        { address: { kind: "created-row-text", item: null }, value: "x" },
      ] as unknown as readonly DraftChange[]),
    ).not.toThrow();
  });
});
