// What the accessory screens are drawn from: the two accessories the catalogue declares, the linked ones the active book
// holds and the draft's creations beside them, with each price as it is and as the draft would leave it.
import { describe, expect, it } from "vitest";

import {
  ACCESSORY_IDS,
  SAMPLE_PRICE_BOOK,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import {
  accessoryOf,
  deriveAccessories,
  isAccessoryCreatedInDraft,
  type AccessoryDerivation,
  type ReadyAccessories,
} from "@/price-dashboard/accessory-model";

import {
  accessoryItem,
  accessoryPageOf,
  CREATED,
  CREATED_ACCESSORY,
  DRYING_RACK,
  LINKED_BUILD_ID,
  PUBLISHED,
  PUBLISHED_RULE,
  SINK_COVER,
} from "./accessory-harness";

function readyOf(
  changes: readonly DraftChange[] = [],
  linked = [PUBLISHED_RULE],
): ReadyAccessories {
  const { state } = accessoryPageOf({ changes, linked });
  const derivation: AccessoryDerivation = deriveAccessories(state);
  if (derivation.kind !== "ready") throw new Error("the draft did not apply");
  return derivation;
}

const priceChange = (
  accessoryId: string,
  value: number,
): readonly DraftChange[] => [
  {
    address: { kind: "accessory", accessoryId, field: "perUnitMinor" },
    value,
  },
];

describe("the accessories", () => {
  it("are the two the catalogue declares, then the book's linked ones, then the draft's creations", () => {
    const { accessories } = readyOf(CREATED_ACCESSORY);

    expect(accessories.map((held) => held.accessoryId)).toEqual([
      ...ACCESSORY_IDS,
      PUBLISHED,
      CREATED,
    ]);
  });

  it("are only the two built-ins where the book holds no linked accessory", () => {
    const { accessories } = readyOf([], []);

    expect(accessories.map((held) => held.accessoryId)).toEqual([
      SINK_COVER,
      DRYING_RACK,
    ]);
  });

  it("says of a built-in that its words come from the catalogue and its rule is code", () => {
    const cover = accessoryOf(readyOf(), SINK_COVER);

    expect(cover).toMatchObject({
      isBuiltIn: true,
      isCreated: false,
      earning: { kind: "built-in", accessoryId: SINK_COVER },
      activePerUnitMinor:
        SAMPLE_PRICE_BOOK.accessories.sinkProtectiveCover.perUnitMinor,
    });
    expect(cover?.name.key).toBe(
      SAMPLE_PRICE_BOOK.accessories.sinkProtectiveCover.nameKey,
    );
  });

  it("says of a linked accessory that its words are authored and its rule follows the cabinet type it names", () => {
    const organiser = accessoryOf(readyOf(), PUBLISHED);

    expect(organiser).toMatchObject({
      isBuiltIn: false,
      isCreated: false,
      earning: { kind: "linked", linkedBuildId: LINKED_BUILD_ID },
      name: { authored: PUBLISHED_RULE.name, key: undefined },
      description: { authored: PUBLISHED_RULE.description, key: undefined },
      activeName: PUBLISHED_RULE.name,
    });
  });

  it("marks an accessory only the draft knows as created, with no active price and no active name", () => {
    const created = accessoryOf(readyOf(CREATED_ACCESSORY), CREATED);

    expect(created).toMatchObject({
      isCreated: true,
      isModified: true,
      activePerUnitMinor: undefined,
      activeName: undefined,
      pendingPerUnitMinor: 8_000,
    });
  });

  it("reads a created accessory with no description as an empty one", () => {
    const [creation] = CREATED_ACCESSORY;
    if (creation?.address.kind !== "accessory-created") throw new Error("seed");
    const bare: DraftChange = {
      address: creation.address,
      value: {
        linkedBuildId: LINKED_BUILD_ID,
        perUnitMinor: 8_000,
        name: "Fara descriere",
      },
    };

    expect(accessoryOf(readyOf([bare]), CREATED)?.description.authored).toBe(
      "",
    );
  });

  it("shows a price the draft changes beside the active one, and marks only that accessory as modified", () => {
    const derivation = readyOf(priceChange(DRYING_RACK, 70_000));

    expect(accessoryOf(derivation, DRYING_RACK)).toMatchObject({
      pendingPerUnitMinor: 70_000,
      activePerUnitMinor:
        SAMPLE_PRICE_BOOK.accessories.dishDryingRack.perUnitMinor,
      isModified: true,
    });
    expect(accessoryOf(derivation, SINK_COVER)?.isModified).toBe(false);
  });

  it("counts the words of a created accessory, its deletion and its price as changes to that accessory alone", () => {
    const rename: DraftChange = {
      address: {
        kind: "created-row-text",
        item: accessoryItem(PUBLISHED) as never,
        field: "name",
      },
      value: "Alt nume",
    };
    const deletion: DraftChange = {
      address: {
        kind: "item-deleted",
        item: accessoryItem(PUBLISHED) as never,
      },
      value: true,
    };

    expect(accessoryOf(readyOf([rename]), PUBLISHED)?.isModified).toBe(true);
    expect(accessoryOf(readyOf([rename]), PUBLISHED)?.name.authored).toBe(
      "Alt nume",
    );
    expect(accessoryOf(readyOf([rename]), PUBLISHED)?.activeName).toBe(
      PUBLISHED_RULE.name,
    );
    expect(accessoryOf(readyOf([deletion]), PUBLISHED)).toMatchObject({
      isDeletionPending: true,
      isCreated: false,
    });
    expect(accessoryOf(readyOf([deletion]), SINK_COVER)?.isModified).toBe(
      false,
    );
  });
});

describe("the cabinet types a linked accessory may follow", () => {
  it("are the rows the manufacturer supplies and no row the customer does", () => {
    const { linkTargetBuildIds, candidate } = readyOf();
    const customerRows = candidate.cabinetRules
      .filter((rule) => rule.suppliedBy === "customer")
      .map((rule) => rule.buildId);

    expect(customerRows.length).toBeGreaterThan(0);
    expect(linkTargetBuildIds).toContain(LINKED_BUILD_ID);
    for (const row of customerRows) {
      expect(linkTargetBuildIds).not.toContain(row);
    }
  });
});

describe("a draft that does not apply", () => {
  it("is unreadable, so no screen is drawn from it", () => {
    const wrong: DraftChange = {
      address: {
        kind: "accessory",
        accessoryId: "no-such",
        field: "perUnitMinor",
      },
      value: 1_000,
    };

    expect(
      deriveAccessories(accessoryPageOf({ changes: [wrong] }).state),
    ).toEqual({ kind: "unreadable" });
  });
});

describe("whether only the draft holds an accessory", () => {
  it("is true of a creation and false of a built-in, a published accessory and anything of another kind", () => {
    const derivation = readyOf(CREATED_ACCESSORY);

    expect(isAccessoryCreatedInDraft(derivation, accessoryItem(CREATED))).toBe(
      true,
    );
    expect(
      isAccessoryCreatedInDraft(derivation, accessoryItem(SINK_COVER)),
    ).toBe(false);
    expect(
      isAccessoryCreatedInDraft(derivation, accessoryItem(PUBLISHED)),
    ).toBe(false);
    expect(
      isAccessoryCreatedInDraft(derivation, {
        kind: "hardware",
        tierId: CREATED,
      }),
    ).toBe(false);
    expect(
      isAccessoryCreatedInDraft({ kind: "unreadable" }, accessoryItem(CREATED)),
    ).toBe(false);
  });
});
