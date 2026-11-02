// @vitest-environment happy-dom
//
// The hardware list (frames D4A and D4F): each class with its four rates, the state it is in, and the actions "⋯" offers. An
// action that cannot be taken stays in the list, off, with its reason under it, and a rate is never edited in a card.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SAMPLE_PRICE_BOOK } from "@lemnaria/configurator-domain";

import { staffNavigationOf } from "@/lib/server/staff/staff-page";
import { BUILT_CATALOG_PAGES } from "@/price-dashboard/catalog-pages";
import { formatLei } from "@/price-dashboard/format-lei";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { allIn, requireIn } from "../support/render-with-intl";
import {
  BLUM,
  CREATED,
  CREATED_CLASS,
  HETTICH,
  STANDARD,
  hardwareItem,
  hardwarePageOf,
  menuEntry,
  mountHardwareList,
  openMenuOf,
  rowOf,
  type MountedHardware,
} from "./hardware-harness";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const STANDARD_NAME = roCopy("priceBook.hardware.standard.name");
const HETTICH_NAME = "Hettich";
const BLUM_NAME = "Blum";
const lei = (minor: number) =>
  formatLei(minor, roCopy("priceDashboard.units.currency"));
const tierOf = (tierId: string) => {
  const tier = SAMPLE_PRICE_BOOK.hardware.tiers.find(
    (t) => t.tierId === tierId,
  );
  if (tier === undefined) throw new Error(tierId);
  return tier;
};

let mounted: MountedHardware | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  resetStaffSessionExpiryForTests();
  leaveTheStaffServer();
});

describe("a class's row", () => {
  it("shows the four rates of the book, the lift beside the hinge, slide and push-to-open, each under its own words", async () => {
    mounted = await mountHardwareList(hardwarePageOf());

    const cells = allIn(
      rowOf(mounted.container, HETTICH),
      '[data-testid="hardware-rate"]',
    );

    expect(cells.map((cell) => cell.firstElementChild?.textContent)).toEqual([
      roCopy("priceDashboard.hardware.columnHinge"),
      roCopy("priceDashboard.hardware.columnSlide"),
      roCopy("priceDashboard.hardware.columnPush"),
      roCopy("priceDashboard.hardware.columnLift"),
    ]);
    const hettich = tierOf(HETTICH);
    expect(cells.map((cell) => cell.children[1]?.textContent)).toEqual([
      lei(hettich.perHingeMinor),
      lei(hettich.perDrawerMinor),
      lei(hettich.perPushToOpenMinor),
      lei(hettich.perLiftMinor),
    ]);
  });

  it("lists every class of the book once, in the book's order", async () => {
    mounted = await mountHardwareList(hardwarePageOf());

    const names = allIn(mounted.container, '[data-testid="hardware-link"]');

    expect(names.map((link) => link.textContent)).toEqual([
      STANDARD_NAME,
      HETTICH_NAME,
      BLUM_NAME,
    ]);
  });

  it("marks only a rate the draft changes, and says what is active beside it", async () => {
    mounted = await mountHardwareList(
      hardwarePageOf({
        changes: [
          {
            address: {
              kind: "hardware",
              tierId: HETTICH,
              field: "perLiftMinor",
            },
            value: 70_000,
          },
        ],
      }),
    );

    const [hinge, , , lift] = allIn(
      rowOf(mounted.container, HETTICH),
      '[data-testid="hardware-rate"]',
    );

    expect(lift?.textContent).toContain(lei(70_000));
    expect(lift?.textContent).toContain(
      roCopy("priceDashboard.common.activeThenPending", {
        active: formatLei(tierOf(HETTICH).perLiftMinor, "").trim(),
      }),
    );
    expect(hinge?.textContent).toBe(
      `${roCopy("priceDashboard.hardware.columnHinge")}${lei(tierOf(HETTICH).perHingeMinor)}`,
    );
    expect(rowOf(mounted.container, HETTICH).dataset.modified).toBe("true");
    expect(rowOf(mounted.container, BLUM).dataset.modified).toBe("false");
  });

  it("calls a switched-off class inactive and the others active, and the book's fallback the default", async () => {
    mounted = await mountHardwareList(
      hardwarePageOf({ disabled: [hardwareItem(BLUM)] }),
    );

    const chips = (tierId: string) =>
      allIn(
        rowOf(mounted?.container ?? document.body, tierId),
        '[data-testid="hardware-chip"]',
      ).map((chip) => chip.textContent);

    expect(chips(STANDARD)).toEqual([
      roCopy("priceDashboard.chips.defaultChoice"),
      roCopy("priceDashboard.chips.active"),
    ]);
    expect(chips(HETTICH)).toEqual([roCopy("priceDashboard.chips.active")]);
    expect(chips(BLUM)).toEqual([roCopy("priceDashboard.chips.inactive")]);
  });

  it("offers adding a class, as a link of a touch target's size to the creation form", async () => {
    mounted = await mountHardwareList(hardwarePageOf());

    const link = allIn<HTMLAnchorElement>(mounted.container, "a").find(
      (candidate) =>
        candidate.textContent === roCopy("priceDashboard.hardware.addAction"),
    );

    expect(link?.getAttribute("href")).toBe("/ro/staff/catalog/hardware/new");
  });

  it("holds no field: a price is changed on the class's own page", async () => {
    mounted = await mountHardwareList(hardwarePageOf());

    expect(allIn(mounted.container, "input")).toEqual([]);
    const link = requireIn<HTMLAnchorElement>(
      rowOf(mounted.container, HETTICH),
      '[data-testid="hardware-link"]',
    );
    expect(link.getAttribute("href")).toBe(
      `/ro/staff/catalog/hardware/${encodeURIComponent(HETTICH)}`,
    );
  });
});

describe("the actions of a class", () => {
  it("offers the disable action and the delete action on a class that is neither a default nor the last, and says nothing under them", async () => {
    mounted = await mountHardwareList(hardwarePageOf());

    await openMenuOf(mounted.container, BLUM, BLUM_NAME);

    const disable = menuEntry(
      mounted.container,
      BLUM,
      roCopy("priceDashboard.common.deactivate"),
    );
    const remove = menuEntry(
      mounted.container,
      BLUM,
      roCopy("priceDashboard.common.delete"),
    );
    expect(disable.getAttribute("aria-disabled")).toBeNull();
    expect(remove.getAttribute("aria-disabled")).toBeNull();
    expect(
      allIn(rowOf(mounted.container, BLUM), '[data-testid="menu-reason"]'),
    ).toEqual([]);
  });

  it("turns both off, with the fixed-default reason under each, for the book's fallback class", async () => {
    mounted = await mountHardwareList(hardwarePageOf());

    await openMenuOf(mounted.container, STANDARD, STANDARD_NAME);

    for (const words of [
      roCopy("priceDashboard.common.deactivate"),
      roCopy("priceDashboard.common.delete"),
    ]) {
      const entry = menuEntry(mounted.container, STANDARD, words);
      expect(entry.getAttribute("aria-disabled")).toBe("true");
      const reason = document.getElementById(
        entry.getAttribute("aria-describedby") ?? "",
      );
      expect(reason?.textContent).toBe(
        roCopy("priceDashboard.lifecycle.fixedDefaultCannotChange"),
      );
    }
  });

  it("says 'choose another default' only of a default the saved defaults name, never of the fixed one", async () => {
    mounted = await mountHardwareList(
      hardwarePageOf({ defaults: { hardwareTierId: HETTICH } }),
    );

    await openMenuOf(mounted.container, HETTICH, HETTICH_NAME);

    const entry = menuEntry(
      mounted.container,
      HETTICH,
      roCopy("priceDashboard.common.deactivate"),
    );
    expect(entry.getAttribute("aria-disabled")).toBe("true");
    expect(
      document.getElementById(entry.getAttribute("aria-describedby") ?? "")
        ?.textContent,
    ).toBe(roCopy("priceDashboard.lifecycle.defaultCannotChange"));
  });

  it("judges nothing where the saved defaults could not be read: each is off with the reason that it cannot be checked", async () => {
    mounted = await mountHardwareList(hardwarePageOf({ defaults: undefined }));

    await openMenuOf(mounted.container, BLUM, BLUM_NAME);

    const entry = menuEntry(
      mounted.container,
      BLUM,
      roCopy("priceDashboard.common.deactivate"),
    );
    expect(entry.getAttribute("aria-disabled")).toBe("true");
    expect(
      document.getElementById(entry.getAttribute("aria-describedby") ?? "")
        ?.textContent,
    ).toBe(roCopy("priceDashboard.lifecycle.cannotJudge"));
  });

  it("offers the enable action, not the disable action, on a switched-off class", async () => {
    mounted = await mountHardwareList(
      hardwarePageOf({ disabled: [hardwareItem(BLUM)] }),
    );

    await openMenuOf(mounted.container, BLUM, BLUM_NAME);

    const enable = menuEntry(
      mounted.container,
      BLUM,
      roCopy("priceDashboard.common.activate"),
    );
    expect(enable.getAttribute("aria-disabled")).toBeNull();
    expect(() =>
      menuEntry(
        mounted?.container ?? document.body,
        BLUM,
        roCopy("priceDashboard.common.deactivate"),
      ),
    ).toThrow();
  });

  it("draws a class only the draft holds inactive and pending, and keeps the enable action off with the unpublished reason", async () => {
    mounted = await mountHardwareList(
      hardwarePageOf({ changes: CREATED_CLASS }),
    );

    const chips = allIn(
      rowOf(mounted.container, CREATED),
      '[data-testid="hardware-chip"]',
    );
    await openMenuOf(mounted.container, CREATED, "GTV Economic");

    expect(chips.map((chip) => chip.textContent)).toEqual([
      roCopy("priceDashboard.chips.inactive"),
      roCopy("priceDashboard.chips.pending"),
    ]);
    const enable = menuEntry(
      mounted.container,
      CREATED,
      roCopy("priceDashboard.common.activate"),
    );
    expect(enable.getAttribute("aria-disabled")).toBe("true");
    expect(
      document.getElementById(enable.getAttribute("aria-describedby") ?? "")
        ?.textContent,
    ).toBe(roCopy("priceDashboard.lifecycle.activateNotPublished"));
  });

  it("closes the list of actions on Escape and puts focus back on the button that opened it", async () => {
    mounted = await mountHardwareList(hardwarePageOf());
    await openMenuOf(mounted.container, BLUM, BLUM_NAME);
    const entry = menuEntry(
      mounted.container,
      BLUM,
      roCopy("priceDashboard.common.delete"),
    );
    entry.focus();

    act(() => {
      entry.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    expect(allIn(rowOf(mounted.container, BLUM), "ul button")).toEqual([]);
    expect(document.activeElement).toBe(
      requireIn(rowOf(mounted.container, BLUM), "button[aria-expanded]"),
    );
  });
});

describe("the menu entry", () => {
  it("is offered once the page is built, after Dulapuri and before the pages that follow it, and to an administrator only", () => {
    expect(BUILT_CATALOG_PAGES).toContain("hardware");
    expect(
      staffNavigationOf(
        { role: "administrator", isEmailVerified: true },
        BUILT_CATALOG_PAGES,
      ).filter((page) => ["cabinets", "hardware", "defaults"].includes(page)),
    ).toEqual(["cabinets", "hardware", "defaults"]);
    expect(
      staffNavigationOf(
        { role: "operator", isEmailVerified: true },
        BUILT_CATALOG_PAGES,
      ),
    ).not.toContain("hardware");
  });
});
