// The publish model's rows for an item the draft creates, deletes, rewords or relinks (frames D7A, D8B): which view each of
// the domain's structural rows becomes, what ↺ takes back for it, and that a class created and deleted in one draft
// leaves no row at all.
import { describe, expect, it } from "vitest";

import type { PriceBook } from "@lemnaria/configurator-domain";

import {
  describeVersionDiff,
  readPendingDraft,
  type ItemRowView,
  type LinkRowView,
  type RowView,
  type TextRowView,
} from "@/price-dashboard/publish-model";

import {
  ACTIVE,
  applied,
  CABINET_NAMES,
  change,
  createAccessoryChange,
  createTierChanges,
  firstNamedBuildId,
  NEW_ACCESSORY,
  NEW_ACCESSORY_NAME,
  NEW_TIER,
  NEW_TIER_DESCRIPTION,
  NEW_TIER_NAME,
} from "./publish-structural-rows.support";

function readyRows(
  active: PriceBook,
  changes: Parameters<typeof readPendingDraft>[0]["changes"],
): readonly RowView[] {
  const reading = readPendingDraft({
    active,
    changes,
    cabinetNames: CABINET_NAMES,
  });
  if (reading.kind !== "ready") throw new Error(`read as ${reading.kind}`);
  return reading.view.sections.flatMap((section) => section.rows);
}

function rowsOfKind<Kind extends RowView["kind"]>(
  rows: readonly RowView[],
  kind: Kind,
): readonly Extract<RowView, { kind: Kind }>[] {
  return rows.filter(
    (row): row is Extract<RowView, { kind: Kind }> => row.kind === kind,
  );
}

const HARDWARE_TIER_CREATED = {
  kind: "hardware-tier-created",
  tierId: NEW_TIER,
} as const;

describe("a class the draft creates", () => {
  const rows = readyRows(ACTIVE, createTierChanges());

  it("is a row of its own with its authored name, the address that takes it back, and no catalogue key", () => {
    const [created] = rowsOfKind(rows, "row");

    expect(created).toEqual<ItemRowView>({
      kind: "row",
      key: JSON.stringify(HARDWARE_TIER_CREATED),
      section: "hardware",
      change: "created",
      itemKind: "hardware",
      subject: { kind: "book-text", authored: NEW_TIER_NAME, key: undefined },
      revert: { kind: "change", address: HARDWARE_TIER_CREATED },
    });
  });

  it("heads its section, ahead of the rates it states, which are named for it and not by its id", () => {
    const section = readyRows(ACTIVE, createTierChanges()).filter(
      (row) => row.kind === "row" || row.kind === "field",
    );

    expect(section[0]?.kind).toBe("row");
    const rates = rowsOfKind(rows, "field").filter(
      (row) => row.address.kind === "hardware",
    );
    expect(rates.length).toBeGreaterThan(0);
    for (const rate of rates) {
      expect(rate.subject).toEqual({
        kind: "book-text",
        authored: NEW_TIER_NAME,
        key: undefined,
      });
    }
  });

  it("is drawn by a version's diff with no arrow, since an archived version takes nothing back", () => {
    const after = applied(ACTIVE, createTierChanges());

    const sections = describeVersionDiff({
      before: ACTIVE,
      after,
      changes: createTierChanges(),
      cabinetNames: CABINET_NAMES,
    });
    const created = rowsOfKind(
      sections.flatMap((section) => section.rows),
      "row",
    );

    expect(created).toHaveLength(1);
    expect(created[0]?.revert).toBeUndefined();
  });
});

describe("an accessory the draft creates", () => {
  const creation = createAccessoryChange(firstNamedBuildId());
  const rows = readyRows(ACTIVE, [creation]);

  it("is a row in the accessories section, and its price is a row named by its authored name", () => {
    const [created] = rowsOfKind(rows, "row");

    expect(created).toMatchObject({
      change: "created",
      section: "accessories",
      itemKind: "accessory",
      subject: {
        kind: "book-text",
        authored: NEW_ACCESSORY_NAME,
        key: undefined,
      },
      revert: {
        kind: "change",
        address: { kind: "accessory-created", accessoryId: NEW_ACCESSORY },
      },
    });
    const price = rowsOfKind(rows, "field").find(
      (row) => row.address.kind === "accessory",
    );
    expect(price?.subject).toEqual({
      kind: "book-text",
      authored: NEW_ACCESSORY_NAME,
      key: undefined,
    });
  });
});

describe("an item the draft deletes", () => {
  const withTier = applied(ACTIVE, createTierChanges());
  const deletion = change(
    { kind: "item-deleted", item: { kind: "hardware", tierId: NEW_TIER } },
    true,
  );

  it("is a row naming it from the book that states it, with the address that takes the deletion back", () => {
    const [deleted] = rowsOfKind(readyRows(withTier, [deletion]), "row");

    expect(deleted).toMatchObject({
      change: "deleted",
      section: "hardware",
      itemKind: "hardware",
      subject: { kind: "book-text", authored: NEW_TIER_NAME },
      revert: {
        kind: "change",
        address: {
          kind: "item-deleted",
          item: { kind: "hardware", tierId: NEW_TIER },
        },
      },
    });
  });

  it("names a class the catalogue words by its key, as the rows of its link and text changes do", () => {
    const keyed = ACTIVE.material.tiers.find(
      (tier) =>
        tier.nameKey !== undefined &&
        tier.tierId !== ACTIVE.material.defaultTierId,
    );
    if (keyed === undefined) throw new Error("the sample has no keyed class");

    const [deleted] = rowsOfKind(
      readyRows(ACTIVE, [
        change(
          {
            kind: "item-deleted",
            item: { kind: "material", tierId: keyed.tierId },
          },
          true,
        ),
      ]),
      "row",
    );

    expect(deleted?.subject).toEqual({
      kind: "book-text",
      authored: keyed.name,
      key: keyed.nameKey,
    });
  });

  it("leaves no row of any kind for a class created and deleted in the same draft", () => {
    const rows = readyRows(ACTIVE, [...createTierChanges(), deletion]);

    expect(rows).toEqual([]);
  });
});

describe("the words of a created row, reworded", () => {
  const withTier = applied(ACTIVE, createTierChanges());
  const REWORDED_ADDRESS = {
    kind: "created-row-text",
    item: { kind: "hardware", tierId: NEW_TIER },
    field: "name",
  } as const;
  const rewording = [change(REWORDED_ADDRESS, "Economic plus")];

  it("is a text row holding each book's words, ahead of nothing else, with the address that takes it back", () => {
    const rows = readyRows(withTier, rewording);

    expect(rowsOfKind(rows, "text")).toEqual<TextRowView[]>([
      {
        kind: "text",
        key: JSON.stringify(REWORDED_ADDRESS),
        section: "hardware",
        subject: {
          kind: "book-text",
          authored: "Economic plus",
          key: undefined,
        },
        field: "name",
        before: NEW_TIER_NAME,
        after: "Economic plus",
        revert: { kind: "change", address: REWORDED_ADDRESS },
      },
    ]);
  });

  it("holds a side the book does not state as nothing, not as an empty text", () => {
    const withoutDescription = applied(ACTIVE, [
      change(
        { kind: "accessory-created", accessoryId: NEW_ACCESSORY },
        {
          linkedBuildId: firstNamedBuildId(),
          perUnitMinor: 7_000,
          name: NEW_ACCESSORY_NAME,
        },
      ),
    ]);
    const describing = [
      change(
        {
          kind: "created-row-text",
          item: { kind: "accessory", accessoryId: NEW_ACCESSORY },
          field: "description",
        },
        NEW_TIER_DESCRIPTION,
      ),
    ];

    const [text] = rowsOfKind(
      readyRows(withoutDescription, describing),
      "text",
    );

    expect(text?.section).toBe("accessories");
    expect(text?.before).toBeUndefined();
    expect(text?.after).toBe(NEW_TIER_DESCRIPTION);
  });
});

describe("the catalogue row a linked accessory follows, where two versions differ", () => {
  const buildIds = Object.keys(CABINET_NAMES);
  const [firstBuildId, secondBuildId] = buildIds;

  it("is a link row naming each side as the cabinet list names it, with no arrow", () => {
    if (firstBuildId === undefined || secondBuildId === undefined) {
      throw new Error("the sample names fewer than two cabinets");
    }
    const before = applied(ACTIVE, [createAccessoryChange(firstBuildId)]);
    const after: PriceBook = {
      ...before,
      linkedAccessories: before.linkedAccessories.map((linked) => ({
        ...linked,
        linkedBuildId: secondBuildId,
      })),
    };

    const rows = describeVersionDiff({
      before,
      after,
      changes: [],
      cabinetNames: CABINET_NAMES,
    }).flatMap((section) => section.rows);

    expect(rowsOfKind(rows, "link")).toEqual<LinkRowView[]>([
      {
        kind: "link",
        key: expect.any(String) as string,
        section: "accessories",
        subject: {
          kind: "book-text",
          authored: NEW_ACCESSORY_NAME,
          key: undefined,
        },
        before: CABINET_NAMES[firstBuildId] ?? "",
        after: CABINET_NAMES[secondBuildId] ?? "",
        revert: undefined,
      },
    ]);
  });
});
