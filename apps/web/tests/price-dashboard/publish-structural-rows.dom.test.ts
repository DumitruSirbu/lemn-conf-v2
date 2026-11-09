// @vitest-environment happy-dom
//
// Frames D7A and D8B: the rows for an item the draft creates, deletes, rewords or relinks, drawn in the table with the words
// the dashboard already has, an arrow that takes each back at its own address, and none on an archived version's diff.
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { PriceBook } from "@lemnaria/configurator-domain";

import { describeVersionDiff } from "@/price-dashboard/publish-model";
import { DiffSections } from "@/price-dashboard/publish-rows";
import { isolated } from "@/staff/bidi-isolate";
import { SAMPLE_PUBLISH_PAGE } from "../support/publish-sample";
import type { PublishPageInput } from "@/price-dashboard/publish-model";

import {
  allIn,
  click,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
} from "../support/render-with-intl";
import {
  inputWithDraft,
  mountDesk,
  settle,
  type MountedDesk,
} from "./publish-desk-harness";
import { roCopy } from "./romanian-copy";
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
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

let mounted: MountedDesk | undefined;
let bare: MountedScreen | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  mounted?.unmount();
  bare?.unmount();
  mounted = undefined;
  bare = undefined;
  leaveTheStaffServer();
});

function inputOver(
  active: PriceBook,
  changes: PublishPageInput["state"]["draft"]["changes"],
): PublishPageInput {
  const base = inputWithDraft(changes);
  return {
    ...base,
    state: { ...base.state, active: { ...base.state.active, book: active } },
    cabinetNames: SAMPLE_PUBLISH_PAGE.cabinetNames,
  };
}

async function mountOver(
  active: PriceBook,
  changes: PublishPageInput["state"]["draft"]["changes"],
): Promise<MountedDesk> {
  mounted = await mountDesk({ input: inputOver(active, changes) });
  return mounted;
}

const rowsOfKind = (container: HTMLElement, kind: string): HTMLElement[] =>
  allIn(container, `[data-testid="diff-row"][data-row-kind="${kind}"]`);

/** The only row of a kind the page draws, or a failure that names the kind. */
function onlyRowOfKind(container: HTMLElement, kind: string): HTMLElement {
  const rows = rowsOfKind(container, kind);
  const [row] = rows;
  if (row === undefined || rows.length !== 1) {
    throw new Error(`expected one ${kind} row, found ${String(rows.length)}`);
  }
  return row;
}

const nameOf = (row: HTMLElement): string | undefined =>
  row.querySelector('[class*="rowName"] [class*="name"]')?.textContent;

const noteOf = (row: HTMLElement): string | undefined =>
  row.querySelector('[class*="field"]')?.textContent;

describe("a class the draft creates", () => {
  it("is a row naming it, saying it is new, with no value in the value columns", async () => {
    const { container } = await mountOver(ACTIVE, createTierChanges());

    const row = onlyRowOfKind(container, "hardware-created");

    expect(row).toBeDefined();
    expect(nameOf(row)).toBe(NEW_TIER_NAME);
    expect(noteOf(row)).toBe(roCopy("priceDashboard.hardware.newTitle"));
    for (const cell of allIn(row, '[class*="cellValue"]')) {
      expect(cell.textContent).toBe("");
    }
  });

  it("is taken back with its arrow, by the address of its creation", async () => {
    const { container, client } = await mountOver(ACTIVE, createTierChanges());
    const row = onlyRowOfKind(container, "hardware-created");

    click(requireIn(row, '[data-testid="diff-revert"]'));
    await settle();

    expect(client.revert.mock.calls[0]?.[0].target).toEqual({
      kind: "change",
      address: { kind: "hardware-tier-created", tierId: NEW_TIER },
    });
  });

  it("names its arrow for a reader by the class, and says new for an accessory too", async () => {
    const { container } = await mountOver(ACTIVE, [
      createAccessoryChange(firstNamedBuildId()),
    ]);

    const row = onlyRowOfKind(container, "accessory-created");

    expect(noteOf(row)).toBe(roCopy("priceDashboard.accessories.newTitle"));
    expect(
      requireIn(row, '[data-testid="diff-revert"]').getAttribute("aria-label"),
    ).toBe(
      roCopy("priceDashboard.publish.revertAria", { name: NEW_ACCESSORY_NAME }),
    );
  });

  it("can be published, since it changes the book", async () => {
    const { container } = await mountOver(ACTIVE, createTierChanges());

    expect(
      requireIn(container, '[class*="primary"]').getAttribute("aria-disabled"),
    ).toBeNull();
  });
});

describe("the lines of a created row's rates and price", () => {
  const FIELD_LINES = '[data-testid="diff-row"][data-unchanged]';
  const REVERT = '[data-testid="diff-revert"]';

  it("have no arrow for the rates of a created class, whose own row's arrow takes the class whole", async () => {
    const { container } = await mountOver(ACTIVE, createTierChanges());

    const rates = allIn(container, FIELD_LINES);

    expect(rates.length).toBeGreaterThan(0);
    expect(rates.map((line) => allIn(line, REVERT).length)).toEqual(
      rates.map(() => 0),
    );
    expect(
      allIn(onlyRowOfKind(container, "hardware-created"), REVERT),
    ).toHaveLength(1);
  });

  it("have no arrow for the price of a created accessory", async () => {
    const { container } = await mountOver(ACTIVE, [
      createAccessoryChange(firstNamedBuildId()),
    ]);

    const prices = allIn(container, FIELD_LINES);

    expect(prices.length).toBeGreaterThan(0);
    expect(prices.map((line) => allIn(line, REVERT).length)).toEqual(
      prices.map(() => 0),
    );
  });

  it("leave a cabinet price its arrow, beside a created class", async () => {
    const { container } = await mountOver(ACTIVE, [
      ...createTierChanges(),
      change(
        {
          kind: "cabinet",
          ruleId: "cabinet.base-cabinet",
          field: "anchorMinor",
        },
        400_000,
      ),
    ]);

    const withArrow = allIn(container, FIELD_LINES).filter(
      (line) => allIn(line, REVERT).length > 0,
    );

    expect(withArrow).toHaveLength(1);
  });
});

describe("an item the draft deletes", () => {
  const withTier = applied(ACTIVE, createTierChanges());
  const deletion = change(
    { kind: "item-deleted", item: { kind: "hardware", tierId: NEW_TIER } },
    true,
  );

  it("is a row naming it and saying it is deleted, in words true of a pending deletion and of a published one", async () => {
    const { container } = await mountOver(withTier, [deletion]);

    const row = onlyRowOfKind(container, "hardware-deleted");

    expect(nameOf(row)).toBe(NEW_TIER_NAME);
    expect(noteOf(row)).toBe(roCopy("priceDashboard.publish.rowDeleted"));
  });

  it("offers no ↺ while the revert route takes no address of a deletion", async () => {
    const { container } = await mountOver(withTier, [deletion]);
    const row = onlyRowOfKind(container, "hardware-deleted");

    expect(allIn(row, '[data-testid="diff-revert"]')).toHaveLength(0);
  });
});

describe("the words of a created row, reworded", () => {
  const withTier = applied(ACTIVE, createTierChanges());
  const rewording = change(
    {
      kind: "created-row-text",
      item: { kind: "hardware", tierId: NEW_TIER },
      field: "name",
    },
    "Economic plus",
  );

  it("is a row giving the field and each book's words", async () => {
    const { container } = await mountOver(withTier, [rewording]);

    const row = onlyRowOfKind(container, "text");

    expect(noteOf(row)).toBe(roCopy("priceDashboard.hardware.nameLabel"));
    const [before, after] = allIn(row, '[class*="cellValue"]');
    expect(before?.textContent).toBe(isolated(NEW_TIER_NAME));
    expect(after?.textContent).toBe(isolated("Economic plus"));
  });

  it("shows a side the book does not state with the dash the other tables use, not as a blank", async () => {
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
    const { container } = await mountOver(withoutDescription, [
      change(
        {
          kind: "created-row-text",
          item: { kind: "accessory", accessoryId: NEW_ACCESSORY },
          field: "description",
        },
        NEW_TIER_DESCRIPTION,
      ),
    ]);

    const row = onlyRowOfKind(container, "text");
    const [before, after] = allIn(row, '[class*="cellValue"]');

    expect(noteOf(row)).toBe(
      roCopy("priceDashboard.accessories.descriptionLabel"),
    );
    expect(before?.textContent).not.toBe("");
    expect(before?.textContent).not.toContain(NEW_TIER_DESCRIPTION);
    expect(after?.textContent).toContain(NEW_TIER_DESCRIPTION);
  });
});

describe("a version's diff, which takes nothing back", () => {
  function drawDiff(before: PriceBook, after: PriceBook): HTMLElement {
    const sections = describeVersionDiff({
      before,
      after,
      changes: [],
      cabinetNames: CABINET_NAMES,
    });
    bare = mountInCatalogue(
      createElement(DiffSections, {
        sections,
        columns: {
          before: roCopy("priceDashboard.publish.columnActive"),
          after: roCopy("priceDashboard.publish.columnNew"),
        },
        onRevert: undefined,
        onSaveAmount: undefined,
        isBusy: false,
      }),
      "ro",
    );
    return bare.container;
  }

  it("draws a created class and a created accessory with no arrow and no field", () => {
    const [firstBuildId] = Object.keys(CABINET_NAMES);
    const after = applied(applied(ACTIVE, createTierChanges()), [
      createAccessoryChange(firstBuildId ?? ""),
    ]);

    const container = drawDiff(ACTIVE, after);

    expect(rowsOfKind(container, "hardware-created")).toHaveLength(1);
    expect(rowsOfKind(container, "accessory-created")).toHaveLength(1);
    expect(allIn(container, '[data-testid="diff-revert"]')).toEqual([]);
    expect(allIn(container, 'button[class*="priceButton"]')).toEqual([]);
  });

  it("draws a deleted class in the same words as the pending list, with no arrow", () => {
    const withTier = applied(ACTIVE, createTierChanges());

    const container = drawDiff(withTier, ACTIVE);
    const row = onlyRowOfKind(container, "hardware-deleted");

    expect(noteOf(row)).toBe(roCopy("priceDashboard.publish.rowDeleted"));
    expect(nameOf(row)).toBe(NEW_TIER_NAME);
    expect(row.querySelector('[data-testid="diff-revert"]')).toBeNull();
  });

  it("draws a relinked accessory with the cabinet each version follows", () => {
    const [firstBuildId, secondBuildId] = Object.keys(CABINET_NAMES);
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

    const row = onlyRowOfKind(drawDiff(before, after), "link");

    expect(noteOf(row)).toBe(roCopy("priceDashboard.accessories.linkLabel"));
    const [was, now] = allIn(row, '[class*="cellValue"]');
    expect(was?.textContent).toBe(CABINET_NAMES[firstBuildId]);
    expect(now?.textContent).toBe(CABINET_NAMES[secondBuildId]);
    expect(row.querySelector('[data-testid="diff-revert"]')).toBeNull();
  });
});
