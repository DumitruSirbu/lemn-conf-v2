// Adversarial QA of the accessory wave's domain edges: the sink cover is never switched off however the state is arranged,
// the cabinet types a select offers are exactly those a creation accepts (for any string, not only the book's own ids), and
// taking a creation back out of the draft takes only that accessory's changes with it.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  applyChanges,
  revertChange,
} from "../../src/price-dashboard/apply-changes.js";
import type { DraftChange } from "../../src/price-dashboard/book-field-address.js";
import { judgeAvailabilityChange } from "../../src/price-dashboard/item-lifecycle.js";
import { PALETTE_ENTRY_IDS } from "../../src/materials.js";
import { linkTargetBuildIdsOf } from "../../src/price-dashboard/link-target.js";
import type { ItemRef } from "../../src/pricing/catalogue-availability.js";
import { ALWAYS_PRESENT_ACCESSORY_ID } from "../../src/pricing/price-book.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import {
  accessory,
  availabilityOf,
  colour,
  handle,
  hardware,
  material,
} from "../support/availability-kitchens.js";
import {
  CUSTOMER_ROW_IDS,
  SUPPLIED_ROW_IDS,
} from "../support/linked-accessory-books.js";

const BOOK = SAMPLE_PRICE_BOOK;
const COVER = accessory(ALWAYS_PRESENT_ACCESSORY_ID);
const RACK = accessory("dishDryingRack");
const SUPPLIED = SUPPLIED_ROW_IDS[0] ?? "";

const SWITCHABLE: readonly ItemRef[] = [
  ...BOOK.material.tiers.map((tier) => material(tier.tierId)),
  ...BOOK.hardware.tiers.map((tier) => hardware(tier.tierId)),
  handle("steel"),
  handle("black"),
  handle("push"),
  ...PALETTE_ENTRY_IDS.map(colour),
  COVER,
  RACK,
];

const disabledArbitrary = fc.subarray([...SWITCHABLE]);
const defaultsArbitrary = fc.oneof(
  fc.constant({}),
  fc.record({
    materialTierId: fc.constantFrom(
      ...BOOK.material.tiers.map((tier) => tier.tierId),
    ),
  }),
  fc.record({
    hardwareTierId: fc.constantFrom(
      ...BOOK.hardware.tiers.map((tier) => tier.tierId),
    ),
  }),
);

describe("the sink cover is never switched off, whatever state the write is judged against", () => {
  it("is refused as always present over any set of items already off and any saved defaults", () => {
    fc.assert(
      fc.property(
        disabledArbitrary,
        defaultsArbitrary,
        (disabled, defaults) => {
          const verdict = judgeAvailabilityChange(
            { item: COVER, active: false },
            { book: BOOK, availability: availabilityOf(disabled), defaults },
          );

          expect(verdict).toEqual({
            kind: "refused",
            code: "item-always-present",
          });
        },
      ),
      { numRuns: 300 },
    );
  });

  it("is switched on whenever it is off, and the refusal is never given to any other item", () => {
    fc.assert(
      fc.property(
        disabledArbitrary,
        defaultsArbitrary,
        fc.constantFrom(...SWITCHABLE),
        (disabled, defaults, item) => {
          const state = {
            book: BOOK,
            availability: availabilityOf(disabled),
            defaults,
          };
          const off = judgeAvailabilityChange({ item, active: false }, state);
          const on = judgeAvailabilityChange({ item, active: true }, state);

          const isCover =
            item.kind === "accessory" &&
            item.accessoryId === ALWAYS_PRESENT_ACCESSORY_ID;
          expect(
            off.kind === "refused" && off.code === "item-always-present",
          ).toBe(isCover);
          expect(on).toEqual({ kind: "allowed" });
        },
      ),
      { numRuns: 300 },
    );
  });

  it("does not follow the rack's state: the rack switches off while the cover stays refused, and back", () => {
    const rackOff = {
      book: BOOK,
      availability: availabilityOf([RACK]),
      defaults: {},
    };
    const bothStated = { ...rackOff, availability: availabilityOf([]) };

    expect(
      judgeAvailabilityChange({ item: RACK, active: false }, bothStated),
    ).toEqual({ kind: "allowed" });
    expect(
      judgeAvailabilityChange({ item: COVER, active: false }, rackOff),
    ).toEqual({ kind: "refused", code: "item-always-present" });
  });

  it("is refused as always present even when the sink cover's accessory id is read from a copy of the item", () => {
    const copy: ItemRef = JSON.parse(JSON.stringify(COVER)) as ItemRef;

    expect(
      judgeAvailabilityChange(
        { item: copy, active: false },
        { book: BOOK, availability: availabilityOf([]), defaults: {} },
      ),
    ).toEqual({ kind: "refused", code: "item-always-present" });
  });
});

describe("a built-in accessory has no way into the draft's deletions", () => {
  it.each([COVER, RACK])(
    "refuses a deletion of %j as a change of the draft",
    (item) => {
      const applied = applyChanges(BOOK, [
        { address: { kind: "item-deleted", item }, value: true },
      ]);

      expect(applied.ok).toBe(false);
    },
  );
});

describe("the cabinet types a select offers are exactly those a creation accepts", () => {
  const createdWith = (linkedBuildId: string): DraftChange => ({
    address: { kind: "accessory-created", accessoryId: "created-1" },
    value: { linkedBuildId, perUnitMinor: 1_000, name: "Organizator" },
  });
  const isAccepted = (linkedBuildId: string) =>
    applyChanges(BOOK, [createdWith(linkedBuildId)]).ok;

  it("holds for every string, including near misses and names an object inherits", () => {
    const offered = new Set(linkTargetBuildIdsOf(BOOK));
    const realIds = BOOK.cabinetRules.map((rule) => rule.buildId);
    const hostile = fc.oneof(
      fc.string(),
      fc.constantFrom(
        "",
        " ",
        "__proto__",
        "constructor",
        "toString",
        "hasOwnProperty",
        ...realIds.map((id) => `${id} `),
        ...realIds.map((id) => ` ${id}`),
        ...realIds.map((id) => id.toUpperCase()),
        ...realIds.map((id) => `${id}\u0000`),
      ),
      fc.constantFrom(...realIds),
    );

    fc.assert(
      fc.property(hostile, (buildId) => {
        expect(isAccepted(buildId)).toBe(offered.has(buildId));
      }),
      { numRuns: 500 },
    );
  });

  it("offers each supplied row once, in the book's order, and no customer row", () => {
    const offered = linkTargetBuildIdsOf(BOOK);

    expect(new Set(offered).size).toBe(offered.length);
    expect(offered).toEqual(
      BOOK.cabinetRules
        .map((rule) => rule.buildId)
        .filter((id) => SUPPLIED_ROW_IDS.includes(id)),
    );
    for (const row of CUSTOMER_ROW_IDS) {
      expect(offered).not.toContain(row);
      expect(isAccepted(row)).toBe(false);
    }
  });

  it("follows the book it is given: a row made customer-supplied leaves the offer, and one the book lacks never enters it", () => {
    const rule = BOOK.cabinetRules.find((held) => held.buildId === SUPPLIED);
    if (rule === undefined) throw new Error("the sample book has no such row");
    const changed = {
      ...BOOK,
      cabinetRules: BOOK.cabinetRules.map((held) =>
        held.buildId === SUPPLIED
          ? { ...held, suppliedBy: "customer" as const }
          : held,
      ),
    };

    expect(linkTargetBuildIdsOf(changed)).not.toContain(SUPPLIED);
    expect(linkTargetBuildIdsOf({ ...BOOK, cabinetRules: [] })).toEqual([]);
  });
});

describe("taking a creation back out of the draft", () => {
  const created = (accessoryId: string): DraftChange => ({
    address: { kind: "accessory-created", accessoryId },
    value: { linkedBuildId: SUPPLIED, perUnitMinor: 8_000, name: "Suport" },
  });
  const priceOf = (accessoryId: string, value: number): DraftChange => ({
    address: { kind: "accessory", accessoryId, field: "perUnitMinor" },
    value,
  });
  const renamed = (accessoryId: string): DraftChange => ({
    address: {
      kind: "created-row-text",
      item: { kind: "accessory", accessoryId },
      field: "name",
    },
    value: "Alt nume",
  });
  const rackPrice = priceOf("dishDryingRack", 12_000);

  it.each([
    ["alone", []],
    ["with a price on top", [priceOf("a", 9_000)]],
    ["with a new name on top", [renamed("a")]],
    ["with a price and a new name on top", [priceOf("a", 9_000), renamed("a")]],
  ] as const)("leaves the draft empty for a creation %s", (_label, extras) => {
    const changes = [created("a"), ...extras];
    expect(applyChanges(BOOK, changes).ok).toBe(true);

    const left = revertChange(changes, {
      kind: "accessory-created",
      accessoryId: "a",
    });

    expect(left).toEqual([]);
    expect(applyChanges(BOOK, left).ok).toBe(true);
  });

  it("leaves every change that is not the accessory's, in the order they were made", () => {
    const changes = [
      rackPrice,
      created("a"),
      created("b"),
      priceOf("a", 9_000),
      renamed("b"),
      renamed("a"),
    ];

    const left = revertChange(changes, {
      kind: "accessory-created",
      accessoryId: "a",
    });

    expect(left).toEqual([rackPrice, created("b"), renamed("b")]);
    expect(applyChanges(BOOK, left).ok).toBe(true);
  });

  it("does nothing to a draft that never created the accessory", () => {
    const changes = [rackPrice, created("b")];

    expect(
      revertChange(changes, { kind: "accessory-created", accessoryId: "zzz" }),
    ).toEqual(changes);
  });
});
