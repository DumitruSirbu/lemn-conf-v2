import { fc } from "@fast-check/vitest";

import type {
  BookFieldAddressKind,
  DraftChange,
  ItemRef,
} from "@lemnaria/configurator-domain";

// A published change summary as the drafts the dashboard keeps can produce it: every address kind, drawn from small id
// pools so that a created row, the rates and words set on it, and a later deletion of it meet in one summary, with and
// without the entry that created the row. Every value is one a table stores (safe integers, no NUL).

const TIER_IDS = ["t1", "t2", "t3"] as const;
/** The accessory ids a drawn summary names. */
export const ACCESSORY_IDS = ["a1", "a2"] as const;

const tierId = fc.constantFrom(...TIER_IDS);
const accessoryId = fc.constantFrom(...ACCESSORY_IDS);
const amount = fc.integer({ min: 0, max: 1_000_000 });

const itemRef: fc.Arbitrary<ItemRef> = fc.oneof(
  tierId.map((id): ItemRef => ({ kind: "hardware", tierId: id })),
  tierId.map((id): ItemRef => ({ kind: "material", tierId: id })),
  accessoryId.map((id): ItemRef => ({ kind: "accessory", accessoryId: id })),
);

const createdRowRef: fc.Arbitrary<ItemRef> = fc.oneof(
  tierId.map((id): ItemRef => ({ kind: "hardware", tierId: id })),
  accessoryId.map((id): ItemRef => ({ kind: "accessory", accessoryId: id })),
);

const CREATION = { name: "Nume", description: "Descriere" };
const LINKED_CREATION = {
  linkedBuildId: "build",
  perUnitMinor: 1_000,
  name: "Nume",
};

interface Piece {
  readonly address: fc.Arbitrary<object>;
  readonly value: fc.Arbitrary<unknown>;
}

/** One arm per address kind, so a kind added to the domain does not compile until the property draws it. */
const PIECE_OF_KIND: Readonly<Record<BookFieldAddressKind, Piece>> = {
  cabinet: {
    address: fc.record({
      kind: fc.constant("cabinet"),
      ruleId: fc.constantFrom("cabinet.base", "cabinet.wall"),
      field: fc.constantFrom("anchorMinor", "perStepWiderMinor"),
    }),
    value: amount,
  },
  "cabinet-size": {
    address: fc.record({
      kind: fc.constant("cabinet-size"),
      ruleId: fc.constantFrom("cabinet.fixed"),
      widthMm: fc.constantFrom(300, 450, 600),
    }),
    value: amount,
  },
  hardware: {
    address: fc.record({
      kind: fc.constant("hardware"),
      tierId,
      field: fc.constantFrom("perHingeMinor", "perDrawerMinor", "perLiftMinor"),
    }),
    value: amount,
  },
  material: {
    address: fc.record({
      kind: fc.constant("material"),
      tierId,
      field: fc.constant("percentOfCabinets"),
    }),
    value: fc.integer({ min: 0, max: 100 }),
  },
  "depth-rule": {
    address: fc.record({ kind: fc.constant("depth-rule") }),
    value: fc.integer({ min: 10, max: 80 }),
  },
  accessory: {
    address: fc.record({
      kind: fc.constant("accessory"),
      accessoryId,
      field: fc.constant("perUnitMinor"),
    }),
    value: amount,
  },
  provisional: {
    address: fc.record({ kind: fc.constant("provisional") }),
    value: fc.boolean(),
  },
  "hardware-tier-created": {
    address: fc.record({ kind: fc.constant("hardware-tier-created"), tierId }),
    value: fc.constant(CREATION),
  },
  "accessory-created": {
    address: fc.record({
      kind: fc.constant("accessory-created"),
      accessoryId,
    }),
    value: fc.constant(LINKED_CREATION),
  },
  "created-row-text": {
    address: fc.record({
      kind: fc.constant("created-row-text"),
      item: createdRowRef,
      field: fc.constantFrom("name", "description"),
    }),
    value: fc.constant("words"),
  },
  "item-deleted": {
    address: fc.record({ kind: fc.constant("item-deleted"), item: itemRef }),
    value: fc.constant(true),
  },
};

const BULK = { percent: 5, scope: "all" } as const;

function changeOfKind(kind: BookFieldAddressKind): fc.Arbitrary<DraftChange> {
  const { address, value } = PIECE_OF_KIND[kind];
  return fc
    .tuple(address, value, fc.boolean(), fc.constantFrom("g1", "g2"))
    .map(([addressOfKind, valueOfKind, isBulk, groupId]) =>
      isBulk
        ? ({
            address: addressOfKind,
            value: valueOfKind,
            groupId,
            bulk: BULK,
          } as unknown as DraftChange)
        : ({ address: addressOfKind, value: valueOfKind } as DraftChange),
    );
}

const KINDS = Object.keys(PIECE_OF_KIND) as BookFieldAddressKind[];

const anyChange: fc.Arbitrary<DraftChange> = fc.oneof(
  ...KINDS.map(changeOfKind),
);

/** Between zero and sixteen changes of any address kind, in any order. */
export const changeSummaryArbitrary: fc.Arbitrary<readonly DraftChange[]> =
  fc.array(anyChange, { maxLength: 16 });
