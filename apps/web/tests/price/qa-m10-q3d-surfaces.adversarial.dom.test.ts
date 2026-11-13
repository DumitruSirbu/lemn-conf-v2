// @vitest-environment happy-dom
//
// No figure anywhere while a replacement is owed, and availability flipping under a mounted editor with no new book version.
// The REAL settings pill, breakdown and bar are mounted, everything a person or a screen reader is told (text, aria-label,
// title, alt) is scanned, and the figure-bearing hooks of the panel's footer, the review and the account card's floor are
// probed under the same refusal, each beside a control that DOES show a figure so that a probe that finds none because it is
// broken cannot pass for one that finds none by design.
import { KITCHEN_L_DESIGN, tierRef } from "@lemnaria/configurator-domain";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => "supported",
}));
vi.mock("@/scene/kitchen-canvas", () => ({ default: () => null }));
vi.mock("@/panel/editor-panel", () => ({ EditorPanel: () => null }));
vi.mock("@/app/configurator/configure/selection-debug", () => ({
  SelectionDebug: () => null,
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

import { usePanelView } from "@/panel/use-panel-view";
import { priceFloorOf } from "@/price/price-book-root";
import { useReview } from "@/review/use-review";
import { useConfiguratorStore } from "@/store/configurator-store";

import roMessages from "../../src/messages/ro.json";
import {
  A_ZERO_WITH_A_UNIT,
  AN_AMOUNT,
  everythingSaidIn,
} from "../support/figures-in-text";
import { mountInCatalogue } from "../support/render-with-intl";
import {
  beginTest,
  byTestId,
  endTest,
  hydrate,
  mountEditor,
  notice,
  present,
  press,
  required,
  requestsOf,
  rerenderUnder,
  ROOT_NOTHING_OFF_AT_PAIR,
  ROOT_WITH_MDF_AND_PREMIUM_OFF,
  ROOT_WITH_MDF_OFF,
  serveWorld,
  settle,
  SWITCHED_OFF_HARDWARE,
  SWITCHED_OFF_MATERIAL,
  VANISHED_MATERIAL,
  carryingMdf,
} from "../support/replacement-sheet-world";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";
import { kitchenCarrying } from "../support/tier-offer-world";

const TEXT = roMessages.replacementSheet;

beforeEach(() => {
  beginTest();
});

afterEach(async () => {
  await endTest();
});

describe("no figure anywhere while a replacement is owed", () => {
  const owed = [
    {
      name: "a tier availability has switched off",
      design: carryingMdf(),
      root: ROOT_WITH_MDF_OFF,
    },
    {
      name: "a tier the book no longer holds",
      design: kitchenCarrying({ materialTierId: VANISHED_MATERIAL }),
      root: ROOT_NOTHING_OFF_AT_PAIR,
    },
    {
      name: "two tiers, one in each group",
      design: kitchenCarrying({
        materialTierId: SWITCHED_OFF_MATERIAL,
        hardwareTierId: SWITCHED_OFF_HARDWARE,
      }),
      root: ROOT_WITH_MDF_AND_PREMIUM_OFF,
    },
  ] as const;

  it.each(owed)(
    "$name: the whole editor, with the real settings pill and breakdown, offers no breakdown to open and says no amount, no priced zero and no old price",
    async ({ design, root }) => {
      serveWorld({ notices: [notice()] });
      hydrate(design);
      const editor = await mountEditor({ priceRoot: root });

      expect(byTestId(editor, "replacement-sheet")).not.toBeNull();
      expect(byTestId(editor, "price-breakdown-trigger")).toBeNull();
      // The real pill is in the scan: without this a pill that rendered nothing would let the scan pass for the wrong reason.
      const pillLabel = present(
        byTestId(editor, "global-settings-pill-label"),
        "the settings pill's label",
      );
      expect(pillLabel.textContent.trim()).not.toBe("");
      const said = everythingSaidIn(editor.container);
      expect(said).toContain(pillLabel.textContent);
      expect(said).not.toMatch(AN_AMOUNT);
      expect(said).not.toMatch(/\d[\d\s.,]*\s?(MDL|lei|EUR|€|%)/u);
      expect(said).not.toMatch(A_ZERO_WITH_A_UNIT);
      expect(said).not.toMatch(/NaN|undefined|null/u);
    },
  );

  it.each(owed)(
    "$name: the bar and the breakdown hold no digit at all, and the bar says only when the price comes",
    async ({ design, root }) => {
      serveWorld({ notices: [notice()] });
      hydrate(design);
      const editor = await mountEditor({ priceRoot: root });

      expect(required(editor, "price-bar").textContent).toBe(
        TEXT.priceAfterChoosing,
      );
      expect(everythingSaidIn(required(editor, "price-bar"))).not.toMatch(
        /\d/u,
      );
      const breakdown = byTestId(editor, "price-breakdown");
      expect(breakdown === null ? "" : everythingSaidIn(breakdown)).not.toMatch(
        /\d/u,
      );
    },
  );

  it("CONTROL: the same kitchen with nothing switched off says an amount in the same scan", async () => {
    serveWorld({ notices: [notice()] });
    hydrate(carryingMdf());
    const editor = await mountEditor({ priceRoot: ROOT_NOTHING_OFF_AT_PAIR });
    press(required(editor, "price-breakdown-trigger"));
    await settle();

    expect(byTestId(editor, "replacement-sheet")).toBeNull();
    expect(everythingSaidIn(editor.container)).toMatch(AN_AMOUNT);
  });
});

describe("the other figure-bearing surfaces under the same refusal", () => {
  function figureOf(
    useHook: () => unknown,
    root: typeof ROOT_WITH_MDF_OFF,
  ): string {
    let seen: unknown;
    function Probe() {
      seen = useHook();
      return null;
    }
    const mounted = mountInCatalogue(createElement(Probe), "ro", root);
    mounted.unmount();
    return JSON.stringify(seen);
  }

  beforeEach(() => {
    hydrate(carryingMdf());
    const [first] = KITCHEN_L_DESIGN.placements;
    if (first === undefined) throw new Error("the design has no body");
    useConfiguratorStore.getState().select({ kind: "placement", id: first.id });
  });

  it.each([
    ["the panel's footer", usePanelView],
    ["the review", useReview],
  ] as const)(
    "%s shows an amount when nothing is owed and none while a tier is switched off",
    (_name, useHook) => {
      const withNothingOff = figureOf(useHook, ROOT_NOTHING_OFF_AT_PAIR);
      const whileOwed = figureOf(useHook, ROOT_WITH_MDF_OFF);

      expect(withNothingOff).toMatch(AN_AMOUNT);
      expect(whileOwed).not.toMatch(AN_AMOUNT);
      expect(whileOwed).not.toMatch(/\bNaN\b/u);
    },
  );

  it("the account card's price floor is nothing for a kitchen that names a switched-off tier and for one that names a vanished tier", () => {
    const switchedOff = carryingMdf();
    const vanished = kitchenCarrying({ materialTierId: VANISHED_MATERIAL });

    expect(priceFloorOf(ROOT_WITH_MDF_OFF, switchedOff)).toBeUndefined();
    expect(priceFloorOf(SAMPLE_PRICE_ROOT, vanished)).toBeUndefined();
    expect(priceFloorOf(SAMPLE_PRICE_ROOT, switchedOff)).toBeDefined();
    expect(
      priceFloorOf(
        {
          ...SAMPLE_PRICE_ROOT,
          availability: {
            revision: "1",
            disabled: [tierRef("hardware", SWITCHED_OFF_HARDWARE)],
          },
        },
        kitchenCarrying({ hardwareTierId: SWITCHED_OFF_HARDWARE }),
      ),
    ).toBeUndefined();
  });
});

describe("availability flipping under a mounted editor, with no new book version", () => {
  it("opens the sheet when a tier is switched off, closes it when it is switched back on, and the price returns to exactly what it was", async () => {
    const world = serveWorld({ notices: [notice()] });
    hydrate(carryingMdf());
    const editor = await mountEditor({ priceRoot: ROOT_NOTHING_OFF_AT_PAIR });
    const priceBefore = required(editor, "price-bar-total").textContent;
    expect(byTestId(editor, "replacement-sheet")).toBeNull();

    await rerenderUnder(ROOT_WITH_MDF_OFF);
    expect(byTestId(editor, "replacement-sheet")).not.toBeNull();
    expect(byTestId(editor, "price-bar-total")).toBeNull();

    await rerenderUnder(ROOT_NOTHING_OFF_AT_PAIR);

    expect(byTestId(editor, "replacement-sheet")).toBeNull();
    expect(required(editor, "price-bar-total").textContent).toBe(priceBefore);
    expect(required(editor, "review-cta").tagName).toBe("A");
    for (const band of editor.container.querySelectorAll("main > *")) {
      expect(band.hasAttribute("inert")).toBe(false);
    }
    expect(requestsOf(world, "PUT")).toEqual([]);
    expect(requestsOf(world, "GET")).toHaveLength(1);
  });

  it("closes a sheet whose chooser is open with a pick made, writes nothing, and reopens on the list with nothing preselected", async () => {
    const world = serveWorld({ notices: [notice()] });
    hydrate(carryingMdf());
    const editor = await mountEditor({ priceRoot: ROOT_WITH_MDF_OFF });
    press(required(editor, "replacement-choose"));
    const [first] =
      editor.container.querySelectorAll<HTMLElement>("[data-option]");
    press(first);
    expect(
      editor.container.querySelector('[aria-pressed="true"][data-option]'),
    ).not.toBeNull();

    await rerenderUnder(ROOT_NOTHING_OFF_AT_PAIR);
    expect(byTestId(editor, "replacement-sheet")).toBeNull();
    await rerenderUnder(ROOT_WITH_MDF_OFF);

    expect(byTestId(editor, "replacement-sheet")).not.toBeNull();
    expect(byTestId(editor, "replacement-choose")).not.toBeNull();
    expect(editor.container.querySelector("[data-option]")).toBeNull();
    expect(requestsOf(world, "PUT")).toEqual([]);
    expect(
      useConfiguratorStore.getState().design.settings?.materialTierId,
    ).toBe(SWITCHED_OFF_MATERIAL);
  });

  it("drops a row availability brings back while another stays owed, so the sheet follows the live set", async () => {
    serveWorld({ notices: [notice()] });
    hydrate(
      kitchenCarrying({
        materialTierId: SWITCHED_OFF_MATERIAL,
        hardwareTierId: SWITCHED_OFF_HARDWARE,
      }),
    );
    const editor = await mountEditor({
      priceRoot: ROOT_WITH_MDF_AND_PREMIUM_OFF,
    });
    expect(
      editor.container.querySelectorAll(
        '[data-testid="replacement-row"][data-resolved="false"]',
      ),
    ).toHaveLength(2);

    await rerenderUnder(ROOT_WITH_MDF_OFF);

    const rows = [
      ...editor.container.querySelectorAll<HTMLElement>(
        '[data-testid="replacement-row"]',
      ),
    ];
    expect(rows.filter((row) => row.dataset.resolved === "false")).toHaveLength(
      1,
    );
    expect(byTestId(editor, "price-bar-total")).toBeNull();
  });
});
