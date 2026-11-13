// @vitest-environment happy-dom
//
// A colour or a handle is the ONLY row owed, and the modal must have a control to resolve it: the back link is not the only way
// out. This is reachable: the availability route can switch off a handle or a palette colour
// (`tests/support/availability-route-items.ts`), customers store both, and `disabledItemsNamedBy` lists a stored one that is
// switched off. The tests below pin what the customer is shown, that the row can be resolved, and what a resolved colour row
// says.
import { paletteFinish } from "@lemnaria/configurator-domain";
import { act } from "react";
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

import { useConfiguratorStore } from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";
import { ro } from "../support/romanian-content";
import {
  BLACK_OFF,
  kitchenWith,
  rootSwitchingOff,
  WHITE_OFF,
} from "../support/replacement-kitchens";
import {
  beginTest,
  byTestId,
  chooseTier,
  endTest,
  hydrate,
  mountEditor,
  notice,
  present,
  press,
  required,
  requestsOf,
  SWITCHED_OFF_MATERIAL,
  serveWorld,
  settle,
  type Editor,
  type World,
} from "../support/replacement-sheet-world";
import { tierName } from "../support/tier-offer-world";

const TEXT = roMessages.replacementSheet;
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
    root: rootSwitchingOff(BLACK_OFF),
    kindLabel: ro.globalSettings.kitchenHandleHeading,
    valueText: ro.panel.handleLabels.black,
    itemId: '"handle":"black"',
  },
  {
    name: "a palette colour the kitchen stores and availability has switched off",
    design: WITH_WHITE_COLOUR,
    root: rootSwitchingOff(WHITE_OFF),
    kindLabel: ro.globalSettings.colourHeading,
    valueText: ro.finishName("pal.alb"),
    itemId: "pal.alb",
  },
])(
  "$name is the only row owed",
  ({ design, root, kindLabel, valueText, itemId }) => {
    let editor: Editor;
    let world: World;
    beforeEach(async () => {
      world = serveWorld({ notices: [notice()] });
      hydrate(design);
      editor = await mountEditor({ priceRoot: root });
    });

    it("the customer is shown the modal with the one row, named, and no price", () => {
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

    it("offers a chooser for a lone colour or handle row, a commit and a price, so the back link is not the only way on", async () => {
      const sheet = required(editor, "replacement-sheet");
      expect(byTestId(editor, "replacement-choose")).not.toBeNull();
      expect(tabStopsIn(sheet)).toEqual([
        required(editor, "replacement-sheet-leave"),
        required(editor, "replacement-choose"),
      ]);
      expect(document.activeElement).toBe(
        required(editor, "replacement-choose"),
      );

      press(required(editor, "replacement-choose"));
      const chosen = present(
        editor.container.querySelector<HTMLButtonElement>(
          "[data-option]:not([disabled])",
        ),
        "an option to pick",
      );
      press(chosen);
      press(required(editor, "replacement-apply"));
      await settle();

      expect(
        JSON.stringify(useConfiguratorStore.getState().design),
      ).not.toContain(itemId);
      expect(requestsOf(world, "PUT")).toHaveLength(1);
      expect(byTestId(editor, "price-bar-total")).not.toBeNull();
    });

    it("the one way out asks before leaving, and Stay returns to the same sheet", () => {
      press(required(editor, "replacement-sheet-leave"));
      expect(byTestId(editor, "back-confirm-dialog")).not.toBeNull();

      press(required(editor, "back-confirm-confirm-back"));

      expect(byTestId(editor, "replacement-sheet")).not.toBeNull();
    });

    it("has a control to resolve the row, so the modal has a way forward other than leaving", () => {
      expect(byTestId(editor, "replacement-choose")).not.toBeNull();
    });
  },
);

describe("a colour row the material change resolves while another row is still owed", () => {
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

    await chooseTier(editor, tierName("material.melamine"));

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

describe("a resolved row with nothing to say", () => {
  it("draws no value node at all, so no empty text is announced, while its kind is still named", async () => {
    serveWorld({ notices: [notice(), notice()] });
    hydrate(
      kitchenWith({
        materialTierId: SWITCHED_OFF_MATERIAL,
        hardwareTierId: "hardware.premium",
        handle: "black",
      }),
    );
    const editor = await mountEditor({
      priceRoot: rootSwitchingOff(
        { kind: "material", tierId: SWITCHED_OFF_MATERIAL },
        { kind: "hardware", tierId: "hardware.premium" },
        BLACK_OFF,
      ),
    });
    await chooseTier(editor, tierName("material.melamine"));

    // SIMULATED: the kitchen's handle is cleared behind the sheet's back, which the sheet cannot do itself.
    act(() => {
      const { design } = useConfiguratorStore.getState();
      useConfiguratorStore.setState({
        design: {
          ...design,
          settings: { ...design.settings, handle: undefined },
        },
      });
    });
    await settle();

    const handleRow = [
      ...editor.container.querySelectorAll<HTMLElement>(
        '[data-testid="replacement-row"][data-resolved="true"]',
      ),
    ].find((row) =>
      row.textContent.includes(ro.globalSettings.kitchenHandleHeading),
    );
    expect(present(handleRow, "the resolved handle row").textContent).toContain(
      ro.globalSettings.kitchenHandleHeading,
    );
    expect(
      handleRow?.querySelector('[data-testid="replacement-row-value"]'),
    ).toBeNull();
  });
});

describe("a colour or a handle owed beside a material", () => {
  it("lets the customer resolve the material, then the handle, which never waits behind it, and the sheet closes", async () => {
    const world = serveWorld({ notices: [notice(), notice()] });
    hydrate(
      kitchenWith({
        materialTierId: SWITCHED_OFF_MATERIAL,
        handle: "black",
      }),
    );
    const editor = await mountEditor({
      priceRoot: rootSwitchingOff(
        { kind: "material", tierId: SWITCHED_OFF_MATERIAL },
        BLACK_OFF,
      ),
    });
    const owedChoosers = (): number =>
      editor.container.querySelectorAll(
        '[data-testid="replacement-row"][data-resolved="false"] [data-testid="replacement-choose"]',
      ).length;
    // A handle row never waits behind a material: a material's change touches no handle.
    expect(owedChoosers()).toBe(2);

    await chooseTier(editor, tierName("material.melamine"));

    const rows = [
      ...editor.container.querySelectorAll<HTMLElement>(
        '[data-testid="replacement-row"]',
      ),
    ];
    expect(rows.map((row) => row.dataset.resolved)).toEqual(["true", "false"]);
    expect(owedChoosers()).toBe(1);
    expect(byTestId(editor, "price-bar-total")).toBeNull();
    expect(requestsOf(world, "GET")).toHaveLength(1);

    await chooseTier(editor, ro.panel.handleLabels.push);

    expect(owedChoosers()).toBe(0);
    expect(byTestId(editor, "replacement-sheet")).toBeNull();
    expect(byTestId(editor, "price-bar-total")).not.toBeNull();
  });
});
