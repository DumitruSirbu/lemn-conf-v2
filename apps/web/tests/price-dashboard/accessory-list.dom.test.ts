// @vitest-environment happy-dom
//
// The accessory list (frames D6A and D6C's list): the two accessories the catalogue declares and the linked ones, each with
// the rule that adds it, its price per unit, its state and the actions "⋯" offers. A built-in is never offered a deletion;
// an action that cannot be taken stays in the list, off, with its reason under it, and a price is never edited in a card.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import { formatLei } from "@/price-dashboard/format-lei";
import { UNAVAILABLE_ITEM_LIFECYCLE_CLIENT } from "@/price-dashboard/item-lifecycle-client";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { allIn, requireIn } from "../support/render-with-intl";
import {
  accessoryItem,
  accessoryPageOf,
  chipsOf,
  COVER_NAME,
  CREATED,
  CREATED_ACCESSORY,
  DRYING_RACK,
  LINKED_BUILD_ID,
  menuEntry,
  mountAccessoryList,
  openMenuOf,
  PUBLISHED,
  PUBLISHED_RULE,
  RACK_NAME,
  rowOf,
  SINK_COVER,
  type MountedAccessories,
} from "./accessory-harness";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const COVER = SAMPLE_PRICE_BOOK.accessories.sinkProtectiveCover;
const RACK = SAMPLE_PRICE_BOOK.accessories.dishDryingRack;
const lei = (minor: number) =>
  formatLei(minor, roCopy("priceDashboard.units.currency"));
const DEACTIVATE = roCopy("priceDashboard.common.deactivate");
const DELETE = roCopy("priceDashboard.common.delete");
const linked = [PUBLISHED_RULE];

let mounted: MountedAccessories | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  resetStaffSessionExpiryForTests();
  leaveTheStaffServer();
});

const reasonUnder = (entry: HTMLElement) =>
  document.getElementById(entry.getAttribute("aria-describedby") ?? "")
    ?.textContent;

describe("an accessory's row", () => {
  it("lists the two built-ins and then the linked ones, in the book's order", async () => {
    mounted = await mountAccessoryList(
      accessoryPageOf({ linked, changes: CREATED_ACCESSORY }),
    );

    const names = allIn(mounted.container, '[data-testid="accessory-link"]');

    expect(names.map((link) => link.textContent)).toEqual([
      COVER_NAME,
      RACK_NAME,
      PUBLISHED_RULE.name,
      "Suport pentru farfurii",
    ]);
  });

  it("says each built-in's true earning rule, read-only, in the words of the rule", async () => {
    mounted = await mountAccessoryList(accessoryPageOf());

    const ruleOf = (id: string) =>
      requireIn(
        rowOf(mounted?.container ?? document.body, id),
        '[data-testid="accessory-earning"]',
      ).textContent;

    expect(ruleOf(SINK_COVER)).toContain(
      roCopy("priceDashboard.accessories.ruleSinkCover"),
    );
    expect(ruleOf(DRYING_RACK)).toContain(
      roCopy("priceDashboard.accessories.ruleDryingRack"),
    );
  });

  it("names the cabinet type a linked accessory follows, by the cabinet list's own name for it", async () => {
    mounted = await mountAccessoryList(accessoryPageOf({ linked }));

    const rule = requireIn(
      rowOf(mounted.container, PUBLISHED),
      '[data-testid="accessory-earning"]',
    ).textContent;
    const cabinetName = accessoryPageOf({ linked }).cabinetNames[
      LINKED_BUILD_ID
    ];

    expect(cabinetName).toBeDefined();
    expect(rule).toContain(
      roCopy("priceDashboard.accessories.ruleLinked", {
        cabinetName: cabinetName ?? "",
      }),
    );
  });

  it("shows the price per unit, and what is active beside it only where the draft changes it", async () => {
    const change: DraftChange = {
      address: {
        kind: "accessory",
        accessoryId: DRYING_RACK,
        field: "perUnitMinor",
      },
      value: 70_000,
    };
    mounted = await mountAccessoryList(accessoryPageOf({ changes: [change] }));

    const priceOf = (id: string) =>
      requireIn(
        rowOf(mounted?.container ?? document.body, id),
        '[data-testid="accessory-price"]',
      ).textContent;

    expect(priceOf(DRYING_RACK)).toContain(lei(70_000));
    expect(priceOf(DRYING_RACK)).toContain(
      roCopy("priceDashboard.common.activeThenPending", {
        active: formatLei(RACK.perUnitMinor, "").trim(),
      }),
    );
    expect(priceOf(SINK_COVER)).toBe(
      `${roCopy("priceDashboard.accessories.columnPrice")}${lei(COVER.perUnitMinor)}`,
    );
    expect(rowOf(mounted.container, DRYING_RACK).dataset.modified).toBe("true");
    expect(rowOf(mounted.container, SINK_COVER).dataset.modified).toBe("false");
  });

  it("calls a created accessory inactive and pending, since only publishing and then switching it on makes it live", async () => {
    mounted = await mountAccessoryList(
      accessoryPageOf({ changes: CREATED_ACCESSORY }),
    );

    expect(chipsOf(mounted.container, CREATED)).toEqual([
      roCopy("priceDashboard.chips.inactive"),
      roCopy("priceDashboard.chips.pending"),
    ]);
    expect(chipsOf(mounted.container, SINK_COVER)).toEqual([
      roCopy("priceDashboard.chips.active"),
    ]);
  });

  it("calls a switched-off accessory inactive", async () => {
    mounted = await mountAccessoryList(
      accessoryPageOf({ disabled: [accessoryItem(DRYING_RACK)] }),
    );

    expect(chipsOf(mounted.container, DRYING_RACK)).toEqual([
      roCopy("priceDashboard.chips.inactive"),
    ]);
  });

  it("holds no field and links each row to its own page, in one path segment whatever the id holds", async () => {
    mounted = await mountAccessoryList(accessoryPageOf({ linked }));

    expect(allIn(mounted.container, "input")).toEqual([]);
    expect(
      requireIn<HTMLAnchorElement>(
        rowOf(mounted.container, PUBLISHED),
        '[data-testid="accessory-link"]',
      ).getAttribute("href"),
    ).toBe(`/ro/staff/catalog/accessories/${PUBLISHED}`);
  });

  it("offers adding an accessory, as a link to the creation form", async () => {
    mounted = await mountAccessoryList(accessoryPageOf());

    const link = allIn<HTMLAnchorElement>(mounted.container, "a").find(
      (candidate) =>
        candidate.textContent ===
        roCopy("priceDashboard.accessories.addAction"),
    );

    expect(link?.getAttribute("href")).toBe(
      "/ro/staff/catalog/accessories/new",
    );
  });

  it("says a deletion the draft holds, and offers nothing more of that accessory", async () => {
    const deletion: DraftChange = {
      address: {
        kind: "item-deleted",
        item: accessoryItem(PUBLISHED) as never,
      },
      value: true,
    };
    mounted = await mountAccessoryList(
      accessoryPageOf({ linked, changes: [deletion] }),
    );

    await openMenuOf(mounted.container, PUBLISHED, PUBLISHED_RULE.name);

    expect(rowOf(mounted.container, PUBLISHED).textContent).toContain(
      roCopy("priceDashboard.accessories.deleteNotice"),
    );
    for (const words of [DEACTIVATE, DELETE]) {
      const entry = menuEntry(mounted.container, PUBLISHED, words);
      expect(entry.getAttribute("aria-disabled")).toBe("true");
      expect(reasonUnder(entry)).toBe(
        roCopy("priceDashboard.accessories.deleteNotice"),
      );
    }
  });
});

describe("the actions of an accessory", () => {
  it("offers a built-in a switch-off, and never a deletion: the delete entry is off and says it comes with the catalogue", async () => {
    mounted = await mountAccessoryList(accessoryPageOf());

    await openMenuOf(mounted.container, DRYING_RACK, RACK_NAME);

    const disable = menuEntry(mounted.container, DRYING_RACK, DEACTIVATE);
    const remove = menuEntry(mounted.container, DRYING_RACK, DELETE);
    expect(disable.getAttribute("aria-disabled")).toBeNull();
    expect(remove.getAttribute("aria-disabled")).toBe("true");
    expect(reasonUnder(remove)).toBe(
      roCopy("priceDashboard.lifecycle.builtInAccessoryCannotBeDeleted"),
    );
  });

  it("turns the sink cover's switch off with the reason that it is always added, and opens no dialog from it", async () => {
    mounted = await mountAccessoryList(accessoryPageOf());

    await openMenuOf(mounted.container, SINK_COVER, COVER_NAME);

    const entry = menuEntry(mounted.container, SINK_COVER, DEACTIVATE);
    expect(entry.getAttribute("aria-disabled")).toBe("true");
    expect(reasonUnder(entry)).toBe(
      roCopy("priceDashboard.lifecycle.alwaysPresentCannotChange"),
    );
    entry.click();
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(mounted.lifecycle.calls).toEqual([]);
  });

  it.each([
    [SINK_COVER, COVER_NAME, "saved defaults none"],
    [DRYING_RACK, RACK_NAME, "saved defaults none"],
    [SINK_COVER, COVER_NAME, "saved defaults unreadable"],
    [DRYING_RACK, RACK_NAME, "saved defaults unreadable"],
  ])(
    "keeps %s undeletable, %s with %s",
    async (accessoryId, name, defaultsCase) => {
      mounted = await mountAccessoryList(
        accessoryPageOf({
          defaults: defaultsCase === "saved defaults none" ? {} : undefined,
        }),
      );

      await openMenuOf(mounted.container, accessoryId, name);

      expect(
        reasonUnder(menuEntry(mounted.container, accessoryId, DELETE)),
      ).toBe(
        accessoryId === SINK_COVER
          ? roCopy("priceDashboard.lifecycle.alwaysPresentCannotBeDeleted")
          : roCopy("priceDashboard.lifecycle.builtInAccessoryCannotBeDeleted"),
      );
    },
  );

  it("offers a linked accessory both actions, with nothing said under them", async () => {
    mounted = await mountAccessoryList(accessoryPageOf({ linked }));

    await openMenuOf(mounted.container, PUBLISHED, PUBLISHED_RULE.name);

    expect(
      menuEntry(mounted.container, PUBLISHED, DEACTIVATE).getAttribute(
        "aria-disabled",
      ),
    ).toBeNull();
    expect(
      menuEntry(mounted.container, PUBLISHED, DELETE).getAttribute(
        "aria-disabled",
      ),
    ).toBeNull();
    expect(
      allIn(rowOf(mounted.container, PUBLISHED), '[data-testid="menu-reason"]'),
    ).toEqual([]);
  });

  it("does not let an accessory only the draft knows be switched on: it is activated after it is published", async () => {
    mounted = await mountAccessoryList(
      accessoryPageOf({ changes: CREATED_ACCESSORY }),
    );

    await openMenuOf(mounted.container, CREATED, "Suport pentru farfurii");

    const entry = menuEntry(
      mounted.container,
      CREATED,
      roCopy("priceDashboard.common.activate"),
    );
    expect(entry.getAttribute("aria-disabled")).toBe("true");
    expect(reasonUnder(entry)).toBe(
      roCopy("priceDashboard.lifecycle.activateNotPublished"),
    );
  });

  it("judges nothing where nothing can write: the switch is off with the reason that it cannot be checked, and no count is asked for", async () => {
    mounted = await mountAccessoryList(accessoryPageOf({ linked }), {
      lifecycleClient: UNAVAILABLE_ITEM_LIFECYCLE_CLIENT,
    });

    await openMenuOf(mounted.container, PUBLISHED, PUBLISHED_RULE.name);

    const entry = menuEntry(mounted.container, PUBLISHED, DEACTIVATE);
    expect(entry.getAttribute("aria-disabled")).toBe("true");
    expect(reasonUnder(entry)).toBe(
      roCopy("priceDashboard.lifecycle.cannotJudge"),
    );
    expect(mounted.lifecycle.calls).toEqual([]);
  });

  it("judges nothing of a linked accessory's deletion where the saved defaults could not be read", async () => {
    mounted = await mountAccessoryList(
      accessoryPageOf({ linked, defaults: undefined }),
    );

    await openMenuOf(mounted.container, PUBLISHED, PUBLISHED_RULE.name);

    expect(reasonUnder(menuEntry(mounted.container, PUBLISHED, DELETE))).toBe(
      roCopy("priceDashboard.lifecycle.cannotJudge"),
    );
  });
});

describe("on the Russian route", () => {
  it("keeps a created accessory's authored Romanian name, and says the built-ins in Russian", async () => {
    mounted = await mountAccessoryList(
      accessoryPageOf({ linked, changes: CREATED_ACCESSORY }),
      { locale: "ru" },
    );

    const names = allIn(
      mounted.container,
      '[data-testid="accessory-link"]',
    ).map((link) => link.textContent);

    expect(names.slice(2)).toEqual([
      PUBLISHED_RULE.name,
      "Suport pentru farfurii",
    ]);
    expect(names[0]).not.toBe(COVER_NAME);
  });
});
