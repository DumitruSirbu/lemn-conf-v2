// @vitest-environment happy-dom
//
// Adversarial QA of M10 wave Q3d, the owner-input case: a colour or a handle is the ONLY row owed, so the modal has no way
// forward except the back link. The wave records this as an interim ("a colour row is drawn but not choosable until Q5"). These
// tests establish whether a stored kitchen reaches it TODAY and what the customer is then given.
//
// **Reachable today, yes.** The availability route accepts a handle and a palette colour as items it can switch off
// (`tests/support/availability-route-items.ts` STATED_ITEMS), a customer stores both (`settings.handle`, `settings.finish`), and
// `disabledItemsNamedBy` lists a stored one that is switched off. Nothing in the sheet resolves it (`isChoosableKind`).
//
// Shape of the deferral (`docs/best-practices/engineering-conventions.md`, *A deferred test has two shapes*): Q5 is the named
// wave that changes this, so the way-forward assertions are `it.fails` and go red the moment Q5 gives the row a control, which
// is the instruction to flip them. The CHARACTERISATION tests pin what the customer sees now and are expected to move with Q5.
import {
  KITCHEN_L_DESIGN,
  paletteFinish,
  type Design,
  type ItemRef,
} from "@lemnaria/configurator-domain";
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

import type { PriceBookRoot } from "@/price/price-book-root";

import roMessages from "../../src/messages/ro.json";
import { ro } from "../support/romanian-content";
import {
  beginTest,
  byTestId,
  chooseTier,
  endTest,
  hydrate,
  mountEditor,
  notice,
  press,
  required,
  requestsOf,
  SWITCHED_OFF_MATERIAL,
  serveWorld,
  type Editor,
} from "../support/replacement-sheet-world";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";

const TEXT = roMessages.replacementSheet;
const SWITCHED_OFF_HANDLE_REF: ItemRef = { kind: "handle", handle: "black" };
const SWITCHED_OFF_COLOUR_REF: ItemRef = {
  kind: "finish",
  finishId: "pal.alb",
};

function rootSwitchingOff(...items: readonly ItemRef[]): PriceBookRoot {
  return {
    ...SAMPLE_PRICE_ROOT,
    availability: { revision: "1", disabled: items },
  };
}

function kitchenWith(settings: NonNullable<Design["settings"]>): Design {
  return {
    ...KITCHEN_L_DESIGN,
    settings: { ...KITCHEN_L_DESIGN.settings, ...settings },
  };
}

const WITH_BLACK_HANDLE = kitchenWith({ handle: "black" });
const WITH_WHITE_COLOUR = kitchenWith({ finish: paletteFinish("pal.alb") });

beforeEach(() => {
  beginTest();
});

afterEach(async () => {
  await endTest();
});

function tabStopsIn(sheet: HTMLElement): Element[] {
  return [...sheet.querySelectorAll("button:not([disabled]), a[href], input")];
}

describe.each([
  {
    name: "a handle the kitchen stores and availability has switched off",
    design: WITH_BLACK_HANDLE,
    root: rootSwitchingOff(SWITCHED_OFF_HANDLE_REF),
    kindLabel: ro.globalSettings.kitchenHandleHeading,
    valueText: ro.panel.handleLabels.black,
  },
  {
    name: "a palette colour the kitchen stores and availability has switched off",
    design: WITH_WHITE_COLOUR,
    root: rootSwitchingOff(SWITCHED_OFF_COLOUR_REF),
    kindLabel: ro.globalSettings.colourHeading,
    valueText: ro.finishName("pal.alb"),
  },
])("$name is the only row owed", ({ design, root, kindLabel, valueText }) => {
  let editor: Editor;
  beforeEach(async () => {
    serveWorld({ notices: [notice()] });
    hydrate(design);
    editor = await mountEditor({ priceRoot: root });
  });

  it("CHARACTERISATION: the customer is shown the modal with the one row, named, and no price", () => {
    const sheet = required(editor, "replacement-sheet");
    const rows = sheet.querySelectorAll('[data-testid="replacement-row"]');

    expect(sheet.getAttribute("role")).toBe("dialog");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain(kindLabel);
    expect(rows[0]?.textContent).toContain(valueText);
    expect(rows[0]?.textContent).toContain(TEXT.unavailable);
    expect(byTestId(editor, "price-bar-total")).toBeNull();
    expect(required(editor, "price-bar").textContent).toBe(
      TEXT.priceAfterChoosing,
    );
    expect(required(editor, "review-cta").getAttribute("aria-disabled")).toBe(
      "true",
    );
  });

  it("CHARACTERISATION: the only control in the sheet is the back link, focus is on the surface, and nothing can be applied", () => {
    const sheet = required(editor, "replacement-sheet");

    expect(byTestId(editor, "replacement-choose")).toBeNull();
    expect(byTestId(editor, "replacement-apply")).toBeNull();
    expect(tabStopsIn(sheet)).toEqual([
      required(editor, "replacement-sheet-leave"),
    ]);
    expect(document.activeElement).toBe(sheet);
  });

  it("CHARACTERISATION: the one way out asks before leaving, and Stay returns to the same dead end", () => {
    press(required(editor, "replacement-sheet-leave"));
    expect(byTestId(editor, "back-confirm-dialog")).not.toBeNull();

    press(required(editor, "back-confirm-confirm-back"));

    expect(byTestId(editor, "replacement-sheet")).not.toBeNull();
  });

  // Q5 owes the flip: when the row gains a control these go red.
  it.fails(
    "Q5 FLIP: offers a control to resolve the row, so the modal has a way forward other than leaving",
    () => {
      expect(byTestId(editor, "replacement-choose")).not.toBeNull();
    },
  );
});

describe("a colour row the material change resolves while another row is still owed (C4D)", () => {
  it("says what the kitchen wears now, instead of drawing the resolved row with nothing in it", async () => {
    serveWorld({ notices: [notice(), notice()] });
    hydrate(
      kitchenWith({
        materialTierId: "material.veneer",
        finish: paletteFinish("veneer.stejar"),
        hardwareTierId: "hardware.premium",
      }),
    );
    const editor = await mountEditor({
      priceRoot: rootSwitchingOff(
        { kind: "material", tierId: "material.veneer" },
        { kind: "finish", finishId: "veneer.stejar" },
        { kind: "hardware", tierId: "hardware.premium" },
      ),
    });
    expect(
      editor.container.querySelectorAll('[data-testid="replacement-row"]'),
    ).toHaveLength(3);

    await chooseTier(
      editor,
      ro.bookText(
        SAMPLE_PRICE_ROOT.book.material.tiers[0]?.name ?? "",
        SAMPLE_PRICE_ROOT.book.material.tiers[0]?.nameKey,
      ),
    );

    const resolved = [
      ...editor.container.querySelectorAll<HTMLElement>(
        '[data-testid="replacement-row"][data-resolved="true"]',
      ),
    ];
    expect(resolved).toHaveLength(2);
    for (const row of resolved) {
      const value = row.querySelector('[data-testid="replacement-row-value"]');
      expect(value?.textContent.trim()).not.toBe("");
    }
  });
});

describe("a colour or a handle owed beside a material", () => {
  it("lets the customer resolve the material, then leaves the modal open on the colour row with no way on", async () => {
    const world = serveWorld({ notices: [notice(), notice()] });
    hydrate(
      kitchenWith({
        materialTierId: SWITCHED_OFF_MATERIAL,
        handle: "black",
      }),
    );
    const editor = await mountEditor({
      priceRoot: {
        ...SAMPLE_PRICE_ROOT,
        availability: {
          revision: "1",
          disabled: [
            { kind: "material", tierId: SWITCHED_OFF_MATERIAL },
            SWITCHED_OFF_HANDLE_REF,
          ],
        },
      },
    });
    const owedChoosers = (): number =>
      editor.container.querySelectorAll(
        '[data-testid="replacement-row"][data-resolved="false"] [data-testid="replacement-choose"]',
      ).length;
    expect(owedChoosers()).toBe(1);

    await chooseTier(
      editor,
      ro.bookText(
        SAMPLE_PRICE_ROOT.book.material.tiers[0]?.name ?? "",
        SAMPLE_PRICE_ROOT.book.material.tiers[0]?.nameKey,
      ),
    );

    const rows = [
      ...editor.container.querySelectorAll<HTMLElement>(
        '[data-testid="replacement-row"]',
      ),
    ];
    expect(rows.map((row) => row.dataset.resolved)).toEqual(["true", "false"]);
    expect(owedChoosers()).toBe(0);
    expect(byTestId(editor, "price-bar-total")).toBeNull();
    expect(requestsOf(world, "GET")).toHaveLength(1);
  });
});
