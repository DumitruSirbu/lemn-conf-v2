// @vitest-environment happy-dom
//
// One material's page (frame D5B and D5F): its words, a surcharge field that reads what is typed before anything is sent, a
// Save that sends one change of "De publicat" and shows only what the server stored, the example that follows what is
// typed, and the switch, which is the dialogs' and not the draft's.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applyChanges,
  DEEP_CABINET_DEPTH_MM,
  DEFAULT_CABINET_DEPTH_MM,
  SAMPLE_PRICE_BOOK,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { formatLei, formatLeiAmount } from "@/price-dashboard/format-lei";
import { surchargeAddressOf } from "@/price-dashboard/material-model";
import { resetStaffSessionExpiryForTests } from "@/staff/staff-session-expiry";

import { allIn, click, requireIn } from "../support/render-with-intl";
import {
  buttonNamed,
  fieldNamed,
  settle,
  typeInField,
} from "./cabinet-detail-harness";
import {
  MDF,
  MDF_NAME,
  PAL,
  PAL_NAME,
  VENEER,
  materialItem,
  materialPageOf,
  mountMaterialEdit,
  pendingChipText,
  press,
  previewedPrice,
  SAMPLE_MATERIALS,
  type MountedMaterials,
} from "./material-harness";
import { roCopy } from "./romanian-copy";
import { leaveTheStaffServer, stubTheStaffServer } from "./staff-frame-harness";

const SURCHARGE = roCopy("priceDashboard.materials.columnSurcharge");
const SAVE = roCopy("priceDashboard.common.save");
const CANCEL = roCopy("priceDashboard.common.cancel");
const ACTIVE_MDF = String(
  SAMPLE_MATERIALS.find((tier) => tier.tierId === MDF)?.percentOfCabinets,
);

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

async function mountMdf(options: Parameters<typeof materialPageOf>[0] = {}) {
  mounted = await mountMaterialEdit(MDF, materialPageOf(options));
  return mounted.container;
}

const alertsOf = (container: HTMLElement) =>
  allIn(container, '[role="alert"]').map((alert) => alert.textContent);

describe("the page's words", () => {
  it("names the material and shows its description, which this page does not edit", async () => {
    const container = await mountMdf();

    expect(requireIn(container, "h1").textContent).toBe(MDF_NAME);
    expect(container.textContent).toContain(
      roCopy("priceBook.material.painted-mdf.description"),
    );
    expect(container.textContent).toContain(
      roCopy("priceDashboard.common.keyedTextNote"),
    );
    expect(allIn(container, "input").map((input) => input.id)).toHaveLength(1);
  });

  it("links back to the list", async () => {
    const container = await mountMdf();

    const back = allIn<HTMLAnchorElement>(container, "a").find(
      (link) => link.textContent === roCopy("priceDashboard.materials.title"),
    );

    expect(back?.getAttribute("href")).toBe("/ro/staff/catalog/materials");
  });
});

describe("the surcharge field", () => {
  it("holds the surcharge the draft would leave, and names the one that is active", async () => {
    const container = await mountMdf({
      changes: [{ address: surchargeAddressOf(MDF), value: 35 }],
    });

    expect(fieldNamed(container, SURCHARGE).value).toBe("35");
    expect(container.textContent).toContain(
      roCopy("priceDashboard.common.activeValue", {
        amount: roCopy("priceDashboard.common.percentPlus", {
          percent: ACTIVE_MDF,
        }),
      }),
    );
  });

  it("is refused on its own field, with Save off and nothing sent, when empty, not whole, negative or past the book's greatest", async () => {
    const container = await mountMdf();
    const refused = [
      ["", roCopy("priceDashboard.materials.surchargeEmpty")],
      [
        "1,5",
        roCopy("priceDashboard.errors.percentNotWhole", { example: "15" }),
      ],
      ["-5", roCopy("priceDashboard.errors.percentNegative")],
      ["201", roCopy("priceDashboard.errors.percentTooBig", { max: "200" })],
    ] as const;

    for (const [typed, words] of refused) {
      typeInField(container, SURCHARGE, typed);

      expect(
        fieldNamed(container, SURCHARGE).getAttribute("aria-invalid"),
        typed,
      ).toBe("true");
      expect(alertsOf(container), typed).toContain(words);
      expect(buttonNamed(container, SAVE), typed).toHaveProperty(
        "disabled",
        true,
      );
    }
    expect(mounted?.draftServer.calls).toEqual([]);
  });

  it("accepts the book's greatest surcharge and nothing sent until Save", async () => {
    const container = await mountMdf();

    typeInField(container, SURCHARGE, "200");

    expect(
      fieldNamed(container, SURCHARGE).getAttribute("aria-invalid"),
    ).toBeNull();
    expect(buttonNamed(container, SAVE)).toHaveProperty("disabled", false);
    expect(mounted?.draftServer.calls).toEqual([]);
  });

  it("offers neither Save nor Cancel while nothing is typed", async () => {
    const container = await mountMdf();

    expect(buttonNamed(container, SAVE)).toHaveProperty("disabled", true);
    expect(() => buttonNamed(container, CANCEL)).toThrow();
  });
});

describe("Save", () => {
  it("sends one change of the surcharge, and says it went to De publicat", async () => {
    const container = await mountMdf();
    typeInField(container, SURCHARGE, "35");

    await press(buttonNamed(container, SAVE));

    expect(mounted?.draftServer.calls).toEqual([
      {
        kind: "change",
        request: {
          expectedDraftRevision: "1",
          change: { address: surchargeAddressOf(MDF), value: 35 },
        },
      },
    ]);
    expect(container.textContent).toContain(
      roCopy("priceDashboard.common.priceSavedNotice"),
    );
    expect(pendingChipText(container)).toBeDefined();
    expect(
      allIn(container, '[data-testid="material-chip"]').map(
        (chip) => chip.textContent,
      ),
    ).toContain(roCopy("priceDashboard.chips.pending"));
  });

  it("takes the change back out of the draft when the surcharge is typed back to the active one, instead of adding a change", async () => {
    const container = await mountMdf({
      changes: [{ address: surchargeAddressOf(MDF), value: 35 }],
    });
    typeInField(container, SURCHARGE, ACTIVE_MDF);

    await press(buttonNamed(container, SAVE));

    expect(mounted?.draftServer.calls.map((call) => call.kind)).toEqual([
      "revert",
    ]);
    expect(mounted?.draftServer.state().draft.changes).toEqual([]);
    expect(container.textContent).not.toContain(
      roCopy("priceDashboard.common.priceSavedNotice"),
    );
  });

  it("says why under the field the server refused, and does not say it was saved", async () => {
    const container = await mountMdf();
    typeInField(container, SURCHARGE, "35");
    mounted?.draftServer.answerNextWriteWith({
      kind: "refused",
      code: "TOO_LARGE",
    });

    await press(buttonNamed(container, SAVE));

    expect(container.textContent).not.toContain(
      roCopy("priceDashboard.common.priceSavedNotice"),
    );
    expect(alertsOf(container)).toContain(
      roCopy("priceDashboard.errors.percentTooBig", { max: "200" }),
    );
  });

  it("says the data changed after a conflict, and keeps what was typed", async () => {
    const container = await mountMdf();
    typeInField(container, SURCHARGE, "35");
    mounted?.draftServer.moveDraftBehindTheScreen();

    await press(buttonNamed(container, SAVE));

    expect(alertsOf(container)).toContain(
      roCopy("priceDashboard.errors.changedMeanwhile"),
    );
    expect(fieldNamed(container, SURCHARGE).value).toBe("35");
  });

  it("says nothing was saved when the write failed, in the words of a failed save", async () => {
    const container = await mountMdf();
    typeInField(container, SURCHARGE, "35");
    mounted?.draftServer.answerNextWriteWith({ kind: "failed" });

    await press(buttonNamed(container, SAVE));

    expect(alertsOf(container)).toEqual([
      roCopy("priceDashboard.errors.saveFailed"),
    ]);
  });

  it("drops the answer of a write the person has typed over, so no notice is shown for what is no longer on screen", async () => {
    const container = await mountMdf();
    typeInField(container, SURCHARGE, "35");
    const release = mounted?.draftServer.holdNextWrite();
    click(buttonNamed(container, SAVE));
    typeInField(container, SURCHARGE, "36");

    release?.();
    await settle();

    expect(container.textContent).not.toContain(
      roCopy("priceDashboard.common.priceSavedNotice"),
    );
    expect(fieldNamed(container, SURCHARGE).value).toBe("36");
  });

  it("restores what the draft holds on Cancel", async () => {
    const container = await mountMdf();
    typeInField(container, SURCHARGE, "9x");

    await press(buttonNamed(container, CANCEL));

    expect(fieldNamed(container, SURCHARGE).value).toBe(ACTIVE_MDF);
    expect(() => buttonNamed(container, CANCEL)).toThrow();
  });
});

describe("the example", () => {
  const lineOf = (container: HTMLElement, testId: string) =>
    container.querySelector(`[data-testid="${testId}"]`)?.textContent;
  const lei = (minor: number) =>
    formatLei(minor, roCopy("priceDashboard.units.currency"));
  const standardLine = (book: PriceBook, material: string) =>
    roCopy("priceDashboard.materials.exampleNew", {
      before: formatLeiAmount(
        previewedPrice(book, PAL, DEFAULT_CABINET_DEPTH_MM),
      ),
      after: lei(previewedPrice(book, material, DEFAULT_CABINET_DEPTH_MM)),
    });
  const withSurcharge = (percent: number): PriceBook => {
    const applied = applyChanges(SAMPLE_PRICE_BOOK, [
      { address: surchargeAddressOf(MDF), value: percent },
    ]);
    if (!applied.ok) throw new Error("the surcharge did not apply");
    return applied.book;
  };

  it("is the preview's own figures for the cabinet in PAL and in the material, at both depths", async () => {
    const container = await mountMdf();

    expect(lineOf(container, "material-example-next")).toBe(
      standardLine(SAMPLE_PRICE_BOOK, MDF),
    );
    expect(lineOf(container, "material-example-deep")).toBe(
      roCopy("priceDashboard.materials.exampleDeep", {
        deepMm: DEEP_CABINET_DEPTH_MM,
        before: formatLeiAmount(
          previewedPrice(SAMPLE_PRICE_BOOK, PAL, DEEP_CABINET_DEPTH_MM),
        ),
        after: lei(
          previewedPrice(SAMPLE_PRICE_BOOK, MDF, DEEP_CABINET_DEPTH_MM),
        ),
      }),
    );
  });

  it("draws no line of the active version while the surcharge is the active one", async () => {
    const container = await mountMdf();

    expect(lineOf(container, "material-example-active")).toBeUndefined();
  });

  it("follows what is typed before anything is sent, with the active version's line beside it", async () => {
    const container = await mountMdf();

    typeInField(container, SURCHARGE, "90");

    expect(lineOf(container, "material-example-next")).toBe(
      standardLine(withSurcharge(90), MDF),
    );
    expect(lineOf(container, "material-example-active")).toBe(
      roCopy("priceDashboard.materials.exampleActive", {
        before: formatLeiAmount(
          previewedPrice(SAMPLE_PRICE_BOOK, PAL, DEFAULT_CABINET_DEPTH_MM),
        ),
        after: lei(
          previewedPrice(SAMPLE_PRICE_BOOK, MDF, DEFAULT_CABINET_DEPTH_MM),
        ),
      }),
    );
    expect(mounted?.draftServer.calls).toEqual([]);
  });

  it("keeps the last figures while what is typed is refused, and names the customer's one line", async () => {
    const container = await mountMdf();
    const before = lineOf(container, "material-example-next");

    typeInField(container, SURCHARGE, "abc");

    expect(lineOf(container, "material-example-next")).toBe(before);
    expect(container.textContent).toContain(
      roCopy("priceBreakdown.wholeKitchenLabel", {
        categoryWord: roCopy("priceBreakdown.wholeKitchenCategories.material"),
        tierName: MDF_NAME,
      }),
    );
  });
});

describe("PAL, the reference", () => {
  it("has no field to change: it is the reference and is not edited", async () => {
    mounted = await mountMaterialEdit(PAL, materialPageOf());

    expect(requireIn(mounted.container, "h1").textContent).toBe(PAL_NAME);
    expect(allIn(mounted.container, "input")).toEqual([]);
    expect(mounted.container.textContent).toContain(
      roCopy("priceDashboard.materials.referenceRow"),
    );
    expect(
      mounted.container.querySelector('[data-testid="material-example"]'),
    ).toBeNull();
  });
});

describe("what the page says of use and colours", () => {
  it("says how many saved kitchens use the material and what colours it offers, where both are known", async () => {
    const container = await mountMdf();

    expect(container.textContent).toContain(
      `${roCopy("priceDashboard.materials.usedInKitchens")}23`,
    );
    expect(container.textContent).toContain(
      roCopy("priceDashboard.materials.colourPickerManaged"),
    );
  });

  it("says nothing of a count where none was had, as a production build has none", async () => {
    mounted = await mountMaterialEdit(
      VENEER,
      materialPageOf({ usage: undefined }),
    );

    expect(mounted.container.textContent).not.toContain(
      roCopy("priceDashboard.materials.usedInKitchens"),
    );
    expect(mounted.container.textContent).toContain(
      roCopy("priceDashboard.materials.coloursManaged", { count: 2 }),
    );
  });
});

describe("a material that is switched off (D5F)", () => {
  it("says it is inactive and used, with the count and the line that it moves, and offers to switch it on", async () => {
    const container = await mountMdf({ disabled: [materialItem(MDF)] });

    const banner = requireIn(container, '[data-testid="material-banner"]');

    expect(banner.textContent).toContain(
      roCopy("priceDashboard.chips.inactiveInUse", { count: 23 }),
    );
    expect(banner.textContent).toContain(
      roCopy("priceDashboard.materials.inactiveBanner"),
    );
    expect(
      buttonNamed(banner, roCopy("priceDashboard.common.activate")),
    ).toBeDefined();
  });

  it("says only that customers cannot choose it, with no number, where the count is not had", async () => {
    mounted = await mountMaterialEdit(
      MDF,
      materialPageOf({ disabled: [materialItem(MDF)], usage: undefined }),
    );

    const banner = requireIn(
      mounted.container,
      '[data-testid="material-banner"]',
    );

    expect(banner.textContent).toBe(
      `${roCopy("priceDashboard.materials.inactiveBannerPlain")}${roCopy("priceDashboard.common.activate")}`,
    );
  });

  it("draws no banner for a material customers can choose", async () => {
    const container = await mountMdf();

    expect(
      container.querySelector('[data-testid="material-banner"]'),
    ).toBeNull();
  });
});

describe("a material the draft deletes", () => {
  it("says the deletion waits for publication, and offers no switch and no field", async () => {
    mounted = await mountMaterialEdit(
      VENEER,
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

    expect(mounted.container.textContent).toContain(
      roCopy("priceDashboard.materials.deleteNotice"),
    );
    expect(allIn(mounted.container, "input")).toEqual([]);
    expect(allIn(mounted.container, '[role="switch"]')).toEqual([]);
  });
});
