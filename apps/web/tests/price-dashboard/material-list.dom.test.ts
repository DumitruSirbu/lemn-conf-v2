// @vitest-environment happy-dom
//
// The materials list (frames D5A, D5D and D5E): each material with its surcharge over PAL, its colours, the state it is in
// and the actions "⋯" offers. An action that cannot be taken stays in the list, off, with its reason under it, a surcharge
// is never edited in a card, and a count of saved kitchens is said only where it was had.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { staffNavigationOf } from "@/lib/server/staff/staff-page";
import { BUILT_CATALOG_PAGES } from "@/price-dashboard/catalog-pages";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { allIn, requireIn } from "../support/render-with-intl";
import {
  chipsOf,
  MDF,
  MDF_NAME,
  PAL,
  PAL_NAME,
  VENEER,
  VENEER_NAME,
  materialItem,
  materialPageOf,
  USAGE,
  menuEntry,
  mountMaterialList,
  openMenuOf,
  reasonOf,
  rowOf,
  SAMPLE_MATERIALS,
  type MountedMaterials,
} from "./material-harness";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const ACTIVE = roCopy("priceDashboard.chips.active");
const INACTIVE = roCopy("priceDashboard.chips.inactive");
const DEACTIVATE = roCopy("priceDashboard.common.deactivate");
const ACTIVATE = roCopy("priceDashboard.common.activate");
const DELETE = roCopy("priceDashboard.common.delete");
const percentOf = (tierId: string) =>
  SAMPLE_MATERIALS.find((tier) => tier.tierId === tierId)?.percentOfCabinets ??
  Number.NaN;

let mounted: MountedMaterials | undefined;

beforeEach(() => {
  stubTheStaffServer();
});

afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  resetStaffSessionExpiryForTests();
  leaveTheStaffServer();
});

const cellsOf = (container: HTMLElement, tierId: string, testId: string) =>
  requireIn(rowOf(container, tierId), `[data-testid="${testId}"]`);

describe("a material's row", () => {
  it("lists every material of the book once, in the book's order, each a link to its own page", async () => {
    mounted = await mountMaterialList(materialPageOf());

    const links = allIn<HTMLAnchorElement>(
      mounted.container,
      '[data-testid="material-link"]',
    );

    expect(links.map((link) => link.textContent)).toEqual([
      PAL_NAME,
      MDF_NAME,
      VENEER_NAME,
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      `/ro/staff/catalog/materials/${PAL}`,
      `/ro/staff/catalog/materials/${MDF}`,
      `/ro/staff/catalog/materials/${VENEER}`,
    ]);
  });

  it("shows PAL as the reference at nothing, and each other material by the surcharge the book states", async () => {
    mounted = await mountMaterialList(materialPageOf());

    expect(
      cellsOf(mounted.container, PAL, "material-surcharge").textContent,
    ).toBe(
      `${roCopy("priceDashboard.materials.columnSurcharge")}${roCopy("priceDashboard.common.percent", { percent: "0" })}${roCopy("priceDashboard.materials.referenceRow")}`,
    );
    expect(
      cellsOf(mounted.container, MDF, "material-surcharge").textContent,
    ).toBe(
      `${roCopy("priceDashboard.materials.columnSurcharge")}${roCopy("priceDashboard.common.percentPlus", { percent: String(percentOf(MDF)) })}`,
    );
  });

  it("says what is active beside a surcharge the draft changes, and marks only that row", async () => {
    mounted = await mountMaterialList(
      materialPageOf({
        changes: [
          {
            address: {
              kind: "material",
              tierId: MDF,
              field: "percentOfCabinets",
            },
            value: 35,
          },
        ],
      }),
    );

    const cell = cellsOf(mounted.container, MDF, "material-surcharge");

    expect(cell.textContent).toContain(
      roCopy("priceDashboard.common.percentPlus", { percent: "35" }),
    );
    expect(cell.textContent).toContain(
      roCopy("priceDashboard.common.activeThenPending", {
        active: roCopy("priceDashboard.common.percentPlus", {
          percent: String(percentOf(MDF)),
        }),
      }),
    );
    expect(rowOf(mounted.container, MDF).dataset.modified).toBe("true");
    expect(rowOf(mounted.container, VENEER).dataset.modified).toBe("false");
    expect(chipsOf(mounted.container, MDF)).toContain(
      roCopy("priceDashboard.chips.pending"),
    );
  });

  it("counts the colours of a list and calls MDF's a picker, since painted MDF has no list", async () => {
    mounted = await mountMaterialList(materialPageOf());

    const wordsOf = (tierId: string) =>
      cellsOf(mounted?.container ?? document.body, tierId, "material-colours")
        .textContent;

    expect(wordsOf(PAL)).toContain(
      roCopy("priceDashboard.materials.colourCount", { count: 6 }),
    );
    expect(wordsOf(MDF)).toContain(
      roCopy("priceDashboard.materials.colourPicker"),
    );
    expect(wordsOf(VENEER)).toContain(
      roCopy("priceDashboard.materials.colourCount", { count: 2 }),
    );
  });

  it("holds no field: a surcharge is changed on the material's own page", async () => {
    mounted = await mountMaterialList(materialPageOf());

    expect(allIn(mounted.container, "input")).toEqual([]);
  });

  it("calls the reference the default and each material active, and a switched-off one inactive", async () => {
    mounted = await mountMaterialList(
      materialPageOf({ disabled: [materialItem(VENEER)] }),
    );

    expect(chipsOf(mounted.container, PAL)).toEqual([
      roCopy("priceDashboard.chips.defaultChoice"),
      ACTIVE,
    ]);
    expect(chipsOf(mounted.container, MDF)).toEqual([ACTIVE]);
    expect(chipsOf(mounted.container, VENEER)).toEqual([INACTIVE]);
  });
});

describe("a material that is switched off", () => {
  it("says how many saved kitchens still use it, on the chip and with the line that the number moves, where that was counted", async () => {
    mounted = await mountMaterialList(
      materialPageOf({ disabled: [materialItem(MDF)] }),
    );

    expect(chipsOf(mounted.container, MDF)).toEqual([
      roCopy("priceDashboard.chips.inactiveInUse", { count: 23 }),
    ]);
    expect(rowOf(mounted.container, MDF).textContent).toContain(
      roCopy("priceDashboard.materials.usageDrift"),
    );
  });

  it("says plainly inactive, and nothing of a number, for one no saved kitchen uses", async () => {
    mounted = await mountMaterialList(
      materialPageOf({ disabled: [materialItem(VENEER)] }),
    );

    expect(chipsOf(mounted.container, VENEER)).toEqual([INACTIVE]);
    expect(rowOf(mounted.container, VENEER).textContent).not.toContain(
      roCopy("priceDashboard.materials.usageDrift"),
    );
  });

  it("states no count at all where nothing could be counted, as a production build has none: no number is made up", async () => {
    mounted = await mountMaterialList(
      materialPageOf({ disabled: [materialItem(MDF)], usage: undefined }),
    );

    expect(chipsOf(mounted.container, MDF)).toEqual([INACTIVE]);
    for (const { designCount } of USAGE) {
      expect(mounted.container.textContent).not.toContain(
        roCopy("priceDashboard.chips.inactiveInUse", { count: designCount }),
      );
    }
    expect(rowOf(mounted.container, MDF).textContent).not.toContain(
      roCopy("priceDashboard.materials.usageDrift"),
    );
  });
});

describe("the actions of a material", () => {
  it("offers the disable action and the delete action on a material that is neither the default nor the last, and says nothing under them", async () => {
    mounted = await mountMaterialList(materialPageOf());

    await openMenuOf(mounted.container, VENEER, VENEER_NAME);

    expect(
      menuEntry(mounted.container, VENEER, DEACTIVATE).getAttribute(
        "aria-disabled",
      ),
    ).toBeNull();
    expect(
      menuEntry(mounted.container, VENEER, DELETE).getAttribute(
        "aria-disabled",
      ),
    ).toBeNull();
    expect(
      allIn(rowOf(mounted.container, VENEER), '[data-testid="menu-reason"]'),
    ).toEqual([]);
  });

  it("turns both off, with the fixed-default reason under each, for PAL, which no kitchen is ever without", async () => {
    mounted = await mountMaterialList(materialPageOf());

    await openMenuOf(mounted.container, PAL, PAL_NAME);

    for (const words of [DEACTIVATE, DELETE]) {
      const entry = menuEntry(mounted.container, PAL, words);
      expect(entry.getAttribute("aria-disabled")).toBe("true");
      expect(reasonOf(entry)).toBe(
        roCopy("priceDashboard.lifecycle.fixedDefaultCannotChange"),
      );
    }
  });

  it("says 'choose another default' only of a default the saved defaults name", async () => {
    mounted = await mountMaterialList(
      materialPageOf({ defaults: { materialTierId: MDF } }),
    );

    await openMenuOf(mounted.container, MDF, MDF_NAME);

    const entry = menuEntry(mounted.container, MDF, DEACTIVATE);
    expect(entry.getAttribute("aria-disabled")).toBe("true");
    expect(reasonOf(entry)).toBe(
      roCopy("priceDashboard.lifecycle.defaultCannotChange"),
    );
  });

  it("judges nothing where the saved defaults could not be read: each is off with the reason that it cannot be checked", async () => {
    mounted = await mountMaterialList(materialPageOf({ defaults: undefined }));

    await openMenuOf(mounted.container, MDF, MDF_NAME);

    for (const words of [DEACTIVATE, DELETE]) {
      const entry = menuEntry(mounted.container, MDF, words);
      expect(entry.getAttribute("aria-disabled")).toBe("true");
      expect(reasonOf(entry)).toBe(
        roCopy("priceDashboard.lifecycle.cannotJudge"),
      );
    }
  });

  it("offers the enable action, not the disable action, on a switched-off material", async () => {
    mounted = await mountMaterialList(
      materialPageOf({ disabled: [materialItem(VENEER)] }),
    );

    await openMenuOf(mounted.container, VENEER, VENEER_NAME);

    expect(
      menuEntry(mounted.container, VENEER, ACTIVATE).getAttribute(
        "aria-disabled",
      ),
    ).toBeNull();
    expect(() =>
      menuEntry(mounted?.container ?? document.body, VENEER, DEACTIVATE),
    ).toThrow();
  });

  it("keeps both off, with the draft's notice, for a material the draft deletes", async () => {
    mounted = await mountMaterialList(
      materialPageOf({
        changes: [
          {
            address: {
              kind: "item-deleted",
              item: { kind: "material", tierId: VENEER },
            },
            value: true,
          },
        ],
      }),
    );

    await openMenuOf(mounted.container, VENEER, VENEER_NAME);

    expect(rowOf(mounted.container, VENEER).textContent).toContain(
      roCopy("priceDashboard.materials.deleteNotice"),
    );
    for (const words of [DEACTIVATE, DELETE]) {
      expect(reasonOf(menuEntry(mounted.container, VENEER, words))).toBe(
        roCopy("priceDashboard.materials.deleteNotice"),
      );
    }
  });
});

describe("closing the menu by a press outside it", () => {
  const pressOutside = (type: "pointerdown" | "click") => {
    act(() => {
      document.body.dispatchEvent(
        new MouseEvent(type, { bubbles: true, cancelable: true }),
      );
    });
  };
  const isOpen = (container: HTMLElement, tierId: string) =>
    allIn(rowOf(container, tierId), "ul button").length > 0;

  it("waits for the click, so nothing below the menu moves up under a finger that has not lifted", async () => {
    mounted = await mountMaterialList(materialPageOf());
    await openMenuOf(mounted.container, VENEER, VENEER_NAME);

    pressOutside("pointerdown");
    expect(isOpen(mounted.container, VENEER)).toBe(true);

    pressOutside("click");
    expect(isOpen(mounted.container, VENEER)).toBe(false);
  });

  it("leaves it open for a click inside it", async () => {
    mounted = await mountMaterialList(materialPageOf());
    await openMenuOf(mounted.container, VENEER, VENEER_NAME);

    act(() => {
      menuEntry(
        mounted?.container ?? document.body,
        VENEER,
        DELETE,
      ).dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(isOpen(mounted.container, VENEER)).toBe(true);
  });

  it("closes the menu that was open when another's three dots are clicked, and opens the other", async () => {
    mounted = await mountMaterialList(materialPageOf());
    await openMenuOf(mounted.container, MDF, MDF_NAME);

    await openMenuOf(mounted.container, VENEER, VENEER_NAME);

    expect(isOpen(mounted.container, MDF)).toBe(false);
    expect(isOpen(mounted.container, VENEER)).toBe(true);
  });
});

describe("the menu entry", () => {
  it("is offered once the page is built, after Dulapuri and before the pages that follow it, and to an administrator only", () => {
    expect(BUILT_CATALOG_PAGES).toContain("materials");
    expect(
      staffNavigationOf(
        { role: "administrator", isEmailVerified: true },
        BUILT_CATALOG_PAGES,
      ).filter((page) =>
        ["cabinets", "hardware", "materials", "defaults"].includes(page),
      ),
    ).toEqual(["cabinets", "hardware", "materials", "defaults"]);
    expect(
      staffNavigationOf(
        { role: "operator", isEmailVerified: true },
        BUILT_CATALOG_PAGES,
      ),
    ).not.toContain("materials");
  });
});
