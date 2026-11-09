// @vitest-environment happy-dom
//
// M10 Q5d: an owed row in the replacement sheet is read to a screen-reader user once, and the same way for every kind.
// It used to be a `group` labelled with the row's own announcement, whose children then said the same thing again, and the
// label named the kind only where an item's name happens to contain it (a tier does, a colour and a handle do not).
//
// What this cannot see: how a screen reader actually speaks the rows. The accessible name of the choose control is computed
// here from its `aria-labelledby`, which is what the accessibility tree does with it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => "supported",
}));
vi.mock("@/scene/kitchen-canvas", () => ({ default: () => null }));
vi.mock("@/panel/editor-panel", () => ({ EditorPanel: () => null }));
vi.mock("@/settings/global-settings", () => ({ GlobalSettings: () => null }));
vi.mock("@/app/configurator/configure/selection-debug", () => ({
  SelectionDebug: () => null,
}));
vi.mock("@/panel/use-panel-view", () => ({
  usePanelView: () => ({ kind: "closed" }),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/ro/d/abcdefghijklmnopqrstu",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import roMessages from "../../src/messages/ro.json";
import { ro } from "../support/romanian-content";
import {
  BLACK_OFF,
  kitchenWith,
  rootSwitchingOff,
  WHITE,
  WHITE_OFF,
} from "../support/replacement-kitchens";
import { rowsOf } from "../support/replacement-sheet-flow";
import {
  beginTest,
  carryingMdfAndPremium,
  endTest,
  hydrate,
  mountEditor,
  notice,
  ROOT_NOTHING_OFF_AT_PAIR,
  ROOT_WITH_MDF_AND_PREMIUM_OFF,
  serveWorld,
  VANISHED_MATERIAL,
} from "../support/replacement-sheet-world";
import { kitchenCarrying } from "../support/tier-offer-world";

const TEXT = roMessages.replacementSheet;

beforeEach(() => {
  beginTest();
});

afterEach(async () => {
  await endTest();
});

/** What the accessibility tree names an element by when it carries `aria-labelledby`: the referenced texts, in order. */
function accessibleNameOf(element: HTMLElement): string {
  const ids = (element.getAttribute("aria-labelledby") ?? "").split(" ");
  return ids
    .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? "")
    .join(" ");
}

function occurrencesOf(text: string, part: string): number {
  return text.split(part).length - 1;
}

function chooseControlOf(row: HTMLElement): HTMLElement {
  const control = row.querySelector<HTMLElement>(
    '[data-testid="replacement-choose"]',
  );
  if (control === null) throw new Error("the row has no choose control");
  return control;
}

/** Nothing in an owed row may name the row for a second time: no labelled group, and no labelled element at all. */
function expectNoSecondNameInRows(rows: readonly HTMLElement[]): void {
  for (const row of rows) {
    expect(row.querySelector('[role="group"]')).toBeNull();
    expect(row.querySelector(":not(button)[aria-label]")).toBeNull();
  }
}

describe("a material and a hardware tier owed together", () => {
  it("reads each row once, and names each choose control by the same shape: the verb and the row's kind", async () => {
    hydrate(carryingMdfAndPremium());
    serveWorld({ notices: [notice()] });
    const editor = await mountEditor({
      priceRoot: ROOT_WITH_MDF_AND_PREMIUM_OFF,
    });

    const rows = rowsOf(editor);
    expect(rows).toHaveLength(2);
    expectNoSecondNameInRows(rows);
    expect(rows.map((row) => accessibleNameOf(chooseControlOf(row)))).toEqual([
      `${TEXT.choose} ${ro.priceBreakdown.wholeKitchenCategories.material}`,
      `${TEXT.choose} ${ro.priceBreakdown.wholeKitchenCategories.hardware}`,
    ]);
    for (const row of rows) {
      expect(occurrencesOf(row.textContent, TEXT.unavailable)).toBe(1);
    }
  });
});

describe("a colour and a handle owed, whose names do not carry their kind", () => {
  it("are announced with the same shape as a tier: the kind, the item, and that it is gone, each said once", async () => {
    hydrate(kitchenWith({ finish: WHITE, handle: "black" }));
    serveWorld({ notices: [notice()] });
    const editor = await mountEditor({
      priceRoot: rootSwitchingOff(WHITE_OFF, BLACK_OFF),
    });

    const rows = rowsOf(editor);
    expect(rows).toHaveLength(2);
    expectNoSecondNameInRows(rows);
    expect(rows.map((row) => accessibleNameOf(chooseControlOf(row)))).toEqual(
      expect.arrayContaining([
        `${TEXT.choose} ${ro.globalSettings.colourHeading}`,
        `${TEXT.choose} ${ro.globalSettings.kitchenHandleHeading}`,
      ]),
    );
    for (const row of rows) {
      expect(occurrencesOf(row.textContent, TEXT.unavailable)).toBe(1);
      expect(row.textContent).toContain(
        row.textContent.includes(ro.globalSettings.colourHeading)
          ? ro.finishName("pal.alb")
          : ro.panel.handleLabels.black,
      );
    }
  });
});

describe("a tier the book no longer holds", () => {
  it("says its kind and the generic line once each, and is named by its kind like every other row", async () => {
    hydrate(kitchenCarrying({ materialTierId: VANISHED_MATERIAL }));
    serveWorld({ notices: [notice()] });
    const editor = await mountEditor({ priceRoot: ROOT_NOTHING_OFF_AT_PAIR });

    const [row] = rowsOf(editor);
    if (row === undefined) throw new Error("the vanished tier has no row");
    expectNoSecondNameInRows([row]);
    expect(occurrencesOf(row.textContent, TEXT.unnamedOptionUnavailable)).toBe(
      1,
    );
    expect(
      occurrencesOf(
        row.textContent,
        ro.priceBreakdown.wholeKitchenCategories.material,
      ),
    ).toBe(1);
    expect(accessibleNameOf(chooseControlOf(row))).toBe(
      `${TEXT.choose} ${ro.priceBreakdown.wholeKitchenCategories.material}`,
    );
  });
});
