// The whole-kitchen handle row (frame C2) as a value and as markup: which handles it offers, what it marks, where it
// sits on the sheet, and that choosing one changes pending state only.
import {
  HandleSchema,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  priceDesign,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  type Design,
  type Handle,
} from "@lemnaria/configurator-domain";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/use-content", async () => {
  const { ro } = await import("../support/romanian-content");
  return { useContent: () => ro };
});

import { offerWholeKitchenTiers } from "@/price/whole-kitchen-tiers";
import { GlobalSettingsSurface } from "@/settings/global-settings";
import {
  chooseHandleIn,
  describeGlobalSettings,
  resolveOpeningChoice,
  type GlobalSettingsView,
  type WholeKitchenChoice,
} from "@/settings/global-settings-model";
import { describeEditability, type Editability } from "@/store/editability";

import { NOTHING_DISABLED } from "../support/availability";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows";
import { ro as content } from "../support/romanian-content";
import { SAMPLE_DEEP_CABINET_PERCENT } from "../support/sample-deep-cabinet-percent";

const EVERY_HANDLE: readonly Handle[] = HandleSchema.options;

const WRITABLE = describeEditability(
  { canWrite: true, saveStatus: "idle" },
  content.panel,
);
const LOCKED = describeEditability(
  { canWrite: false, saveStatus: "idle" },
  content.panel,
);

function tierOffer() {
  return offerWholeKitchenTiers({
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
    design: KITCHEN_L_DESIGN,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    selections: KITCHEN_L_DESIGN.settings,
  });
}

function viewOf(
  options: {
    readonly offeredHandles?: readonly Handle[] | undefined;
    readonly pending?: WholeKitchenChoice;
    readonly design?: Design;
  } = {},
): GlobalSettingsView {
  const design = options.design ?? KITCHEN_L_DESIGN;
  const request = {
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    selections: design.settings,
  };
  return describeGlobalSettings({
    content,
    pricing: priceDesign(request),
    offer: offerWholeKitchenTiers(request),
    deepCabinetPercent: SAMPLE_DEEP_CABINET_PERCENT,
    groups: projectDesignForDisplay(design, KITCHEN_L_BODY_CATALOG),
    applied: design.settings ?? {},
    pending: options.pending ?? {},
    chosenColourCount: 0,
    ...("offeredHandles" in options
      ? { offeredHandles: options.offeredHandles }
      : {}),
  });
}

function markupOf(
  view: GlobalSettingsView,
  editability: Editability,
  isHandleChoosable = true,
): string {
  return renderToStaticMarkup(
    createElement(GlobalSettingsSurface, {
      id: "settings",
      view,
      editability,
      onChoose: () => undefined,
      onChooseDepth: () => undefined,
      onChooseFinish: () => undefined,
      ...(isHandleChoosable ? { onChooseHandle: () => undefined } : {}),
      onCancel: () => undefined,
      onApply: () => undefined,
    }),
  );
}

function selectedHandles(view: GlobalSettingsView): readonly Handle[] {
  return (view.handleGroup?.options ?? [])
    .filter((option) => option.isSelected)
    .map((option) => option.handle);
}

describe("the handle row's offer", () => {
  it("lists the handles it was given, in that order, each worded as the panel words it", () => {
    const view = viewOf({ offeredHandles: EVERY_HANDLE });

    expect(view.handleGroup?.options.map((option) => option.handle)).toEqual(
      EVERY_HANDLE,
    );
    // The same-source comparison is the design: the row reuses `panel.handleLabels` so a handle is spelled one way.
    expect(view.handleGroup?.options.map((option) => option.label)).toEqual(
      EVERY_HANDLE.map((handle) => content.panel.handleLabels[handle]),
    );
  });

  it("offers no handle that was left out of the offer", () => {
    const view = viewOf({ offeredHandles: ["steel", "push"] });

    expect(view.handleGroup?.options.map((option) => option.handle)).toEqual([
      "steel",
      "push",
    ]);
  });

  it.each([
    ["an empty offer", []],
    ["no offer given", undefined],
  ] as const)("shows no row for %s, never an empty one", (_case, offered) => {
    const view = viewOf({ offeredHandles: offered });

    expect(view).not.toHaveProperty("handleGroup");
  });
});

describe("the handle row's marked option", () => {
  it("marks the slot's default for a kitchen that chose none, without seeding a choice", () => {
    const view = viewOf({ offeredHandles: EVERY_HANDLE });

    expect(selectedHandles(view)).toEqual(["steel"]);
    expect(resolveOpeningChoice({}, tierOffer()).handle).toBeUndefined();
    expect(resolveOpeningChoice({}, tierOffer())).not.toHaveProperty("handle");
  });

  it.each(EVERY_HANDLE)(
    "marks %s, and only it, once it is the pending choice",
    (handle) => {
      const pending = chooseHandleIn({}, handle);

      expect(
        selectedHandles(viewOf({ offeredHandles: EVERY_HANDLE, pending })),
      ).toEqual([handle]);
    },
  );

  it("opens on the handle the kitchen already carries", () => {
    const carrying: Design = {
      ...KITCHEN_L_DESIGN,
      settings: { ...KITCHEN_L_DESIGN.settings, handle: "push" },
    };

    const opening = resolveOpeningChoice(carrying.settings ?? {}, tierOffer());
    const view = viewOf({
      offeredHandles: EVERY_HANDLE,
      design: carrying,
      pending: opening,
    });

    expect(selectedHandles(view)).toEqual(["push"]);
  });

  it("marks nothing when the kitchen's own handle is not on offer", () => {
    const view = viewOf({
      offeredHandles: ["steel", "push"],
      pending: chooseHandleIn({}, "black"),
    });

    expect(selectedHandles(view)).toEqual([]);
  });
});

describe("choosing a handle in the sheet", () => {
  it("changes only the pending handle", () => {
    const before: WholeKitchenChoice = { materialTierId: "material.melamine" };

    expect(chooseHandleIn(before, "black")).toEqual({
      materialTierId: "material.melamine",
      handle: "black",
    });
    expect(before).not.toHaveProperty("handle");
  });
});

describe("the handle row on the sheet", () => {
  const view = viewOf({ offeredHandles: EVERY_HANDLE });

  it("sits after the colour and before the hardware (frame C2)", () => {
    const markup = markupOf(view, WRITABLE);

    const colour = markup.indexOf(content.globalSettings.colourHeading);
    const handle = markup.indexOf(content.globalSettings.kitchenHandleHeading);
    const hardware = markup.indexOf(
      content.globalSettings.groupHeadings.hardware,
    );

    expect(colour).toBeGreaterThan(-1);
    expect(handle).toBeGreaterThan(colour);
    expect(hardware).toBeGreaterThan(handle);
  });

  it("states its hint, and one radio for each offered handle", () => {
    const markup = markupOf(view, WRITABLE);

    expect(markup).toContain(content.globalSettings.kitchenHandleHint);
    expect(
      markup.match(/data-testid="global-settings-handle-option"/g),
    ).toHaveLength(EVERY_HANDLE.length);
  });

  it("is greyed and unclickable on a locked sheet", () => {
    const markup = markupOf(view, LOCKED);
    const row = markup.slice(
      markup.indexOf('data-testid="global-settings-handle-group"'),
      markup.indexOf('data-testid="global-settings-handle-hint"'),
    );

    expect(row.match(/disabled=""/g)).toHaveLength(EVERY_HANDLE.length);
  });

  it("is not drawn by a surface that was given no way to choose a handle", () => {
    const markup = markupOf(view, WRITABLE, false);

    expect(markup).not.toContain(content.globalSettings.kitchenHandleHeading);
  });
});
