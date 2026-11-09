// @vitest-environment happy-dom
//
// M10 Q5c on the real screens: the settings pill in the top bar (the owner screen and the read-only share view) while a
// material row is owed. The pure model is attacked in `tests/settings/qa-m10-q5c-pill-material-owed.adversarial.test.ts`;
// this file mounts `ConfigureScreen`, whose `useTopBarFit` measures the pill and chooses the rung, and asks the three
// questions a model test cannot:
//
// - the fit model measures the label that is DRAWN: the hidden probe holds the leaf, not the tier it replaced, and the
//   rung chosen at each track width is the one those measured widths buy (so the longer leaf never overflows the row);
// - the pill is the same on the share view, in Russian, and with no book (where the leaf must be nowhere);
// - the pill clears when the row is resolved through the real sheet, and survives a kitchen that suddenly has fewer
//   settings than the rung it was last drawn at.
//
// Happy-dom has no layout, so it is stubbed as `qa-m10-q3b-configure-screen-no-book.adversarial.dom.test.ts` stubs it:
// a label is 7 px a character and the settings track is the width under test.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/ro/d/q5c-qa-design",
}));
vi.mock("@/scene/webgl-support", () => ({
  useWebGLSupport: () => "supported",
}));
vi.mock("@/scene/kitchen-canvas", () => ({ default: () => null }));

import {
  ConfigureScreen,
  type ConfigureScreenVariant,
} from "@/app/configurator/configure/configure-screen";
import { NO_PRICE_BOOK, type PriceBookRoot } from "@/price/price-book-root";
import {
  visibleCountThatFitsWithin,
  widthNeededForVisibleLabels,
  type SettingsPillFixedWidths,
} from "@/settings/settings-pill-fit";
import { useConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";
import { A_BARE_ZERO, everythingSaidIn } from "../support/figures-in-text";
import {
  all,
  mountScreen,
  mountSettings,
  one,
  openSheet,
  press,
  unmountScreen,
  within,
} from "../support/mounted-screen";
import { allIn, mountInCatalogue } from "../support/render-with-intl";
import { ro } from "../support/romanian-content";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";
import { switchedOffTiers, tierName } from "../support/tier-offer-world";
import ruMessages from "../../src/messages/ru.json";

const CHARACTER_PX = 7;
const NARROW_TRACK_PX = 70;
const WIDE_TRACK_PX = 1400;
const FIXED_PART_PX: Readonly<Record<string, number>> = {
  swatch: 16,
  separator: 1,
  counter: 14,
  caret: 7,
};
/** What the stub's pill spends whatever it names: the row's padding and border are stubbed to zero. */
const FIXED_WIDTHS: SettingsPillFixedWidths = {
  framePx: 0,
  swatchPx: FIXED_PART_PX.swatch ?? 0,
  separatorPx: FIXED_PART_PX.separator ?? 0,
  counterPx: FIXED_PART_PX.counter ?? 0,
  caretPx: FIXED_PART_PX.caret ?? 0,
  gapPx: 10,
};
const LEAF = ro.replacementSheet.headerMaterialToChoose;
const SWITCHED_OFF_MATERIAL = "material.veneer";
const WITHDRAWN = "material.withdrawn-from-the-book";
const veneerOffRoot: PriceBookRoot = {
  ...SAMPLE_PRICE_ROOT,
  availability: switchedOffTiers({ material: [SWITCHED_OFF_MATERIAL] }),
};

let trackWidthPx = WIDE_TRACK_PX;
let hydrations = 0;

class ImmediateResizeObserver {
  constructor(private readonly callback: () => void) {}
  observe(): void {
    this.callback();
  }
  unobserve(): void {
    return undefined;
  }
  disconnect(): void {
    return undefined;
  }
}

function widthOf(element: Element): number {
  const part = element.getAttribute("data-probe");
  if (part === "label") return element.textContent.length * CHARACTER_PX;
  if (part !== null) return FIXED_PART_PX[part] ?? 0;
  const isSettingsTrack =
    element.querySelector(':scope > [data-testid="global-settings"]') !== null;
  return isSettingsTrack ? trackWidthPx : 0;
}

function stubLayout(trackPx: number): void {
  trackWidthPx = trackPx;
  vi.stubGlobal("ResizeObserver", ImmediateResizeObserver);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      return { width: widthOf(this) } as DOMRect;
    },
  );
  vi.spyOn(window, "getComputedStyle").mockImplementation(
    () =>
      ({
        paddingLeft: "0px",
        paddingRight: "0px",
        borderLeftWidth: "0px",
        borderRightWidth: "0px",
        columnGap: `${String(FIXED_WIDTHS.gapPx)}px`,
      }) as CSSStyleDeclaration,
  );
}

function hydrateAs(
  variant: ConfigureScreenVariant,
  settings: NonNullable<typeof KITCHEN_L_DESIGN.settings>,
): void {
  const store = useConfiguratorStore.getState();
  store.attachBodyProbe(createFakeProbeFactory());
  store.hydrate({
    design: { ...KITCHEN_L_DESIGN, settings },
    designId: `q5c-qa-design-${String((hydrations += 1))}`,
    revision: "1",
    // A share link opens read-only: its viewer holds no write credential.
    canWrite: variant === "owner",
  });
}

function mount(
  variant: ConfigureScreenVariant,
  root: PriceBookRoot,
  settings: NonNullable<typeof KITCHEN_L_DESIGN.settings>,
): void {
  hydrateAs(variant, settings);
  mountScreen(createElement(ConfigureScreen, { variant }), root);
}

beforeEach(() => {
  vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
  window.history.replaceState(null, "", "/ro/d/q5c-qa-design");
});

afterEach(() => {
  unmountScreen();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const drawnLabels = (): string[] =>
  all("global-settings-pill-label").map((label) => label.textContent);

/** What the fit model was handed: the hidden probe's labels, which `SettingsPillMeasurement` draws from the hook's pill. */
const measuredLabels = (): string[] =>
  [...within().querySelectorAll('[data-probe="label"]')].map(
    (probe) => probe.textContent,
  );

const counterText = (): string | undefined =>
  all("global-settings-pill-count")[0]?.textContent;

const OWNED_BY_NAMED_TIER = {
  cabinetDepthMm: 600,
  materialTierId: SWITCHED_OFF_MATERIAL,
};
const OWNED_BY_WITHDRAWN_TIER = {
  cabinetDepthMm: 600,
  materialTierId: WITHDRAWN,
};

describe.each<ConfigureScreenVariant>(["owner", "shared"])(
  "the %s screen's pill while the material is switched off",
  (variant) => {
    it("names every setting at a wide track, the leaf first, and says nothing of the tier it replaced", () => {
      stubLayout(WIDE_TRACK_PX);

      mount(variant, veneerOffRoot, OWNED_BY_NAMED_TIER);

      const pill = one("global-settings-trigger");
      expect(drawnLabels()[0]).toBe(LEAF);
      expect(drawnLabels()).toHaveLength(4);
      expect(counterText()).toBeUndefined();
      expect(pill.getAttribute("aria-label")).toContain(LEAF);
      expect(pill.getAttribute("aria-label")).not.toContain(
        tierName(SWITCHED_OFF_MATERIAL),
      );
      expect(pill.hasAttribute("disabled")).toBe(variant === "shared");
    });

    it("keeps the leaf as a named label at the narrowest track, and counts exactly what it hides", () => {
      stubLayout(NARROW_TRACK_PX);

      mount(variant, veneerOffRoot, OWNED_BY_NAMED_TIER);

      const named = drawnLabels();
      expect(named[0]).toBe(LEAF);
      expect(named.length).toBeGreaterThanOrEqual(1);
      expect(named.length).toBeLessThan(measuredLabels().length);
      expect(counterText()).toBe(
        `+${String(measuredLabels().length - named.length)}`,
      );
      expect(one("global-settings-trigger").textContent).not.toMatch(
        A_BARE_ZERO,
      );
    });

    it("draws the leaf even where the material the kitchen chose has left the book, and then has no colour to draw", () => {
      stubLayout(WIDE_TRACK_PX);

      mount(variant, SAMPLE_PRICE_ROOT, OWNED_BY_WITHDRAWN_TIER);

      expect(drawnLabels()[0]).toBe(LEAF);
      expect(measuredLabels()).toHaveLength(3);
      expect(
        one("global-settings-trigger").getAttribute("aria-label"),
      ).toContain(LEAF);
    });

    it("draws the leaf where the kitchen chose no material and the book's default is the one switched off", () => {
      stubLayout(WIDE_TRACK_PX);
      const defaultOffRoot: PriceBookRoot = {
        ...SAMPLE_PRICE_ROOT,
        availability: switchedOffTiers({
          material: [SAMPLE_PRICE_ROOT.book.material.defaultTierId],
        }),
      };

      mount(variant, defaultOffRoot, { cabinetDepthMm: 600 });

      expect(drawnLabels()[0]).toBe(LEAF);
      expect(drawnLabels()).not.toContain(
        ro.globalSettings.pillMaterial(
          tierName(SAMPLE_PRICE_ROOT.book.material.defaultTierId),
        ),
      );
    });

    it("draws what the pill names with nothing owed, as before, and the leaf nowhere", () => {
      stubLayout(WIDE_TRACK_PX);

      mount(variant, SAMPLE_PRICE_ROOT, { cabinetDepthMm: 600 });

      expect(drawnLabels()).not.toContain(LEAF);
      expect(everythingSaidIn(within())).not.toContain(LEAF);
    });
  },
);

describe.each<ConfigureScreenVariant>(["owner", "shared"])(
  "the %s screen's fit model measures the label that is drawn",
  (variant) => {
    const TRACKS_PX = Array.from(
      { length: 90 },
      (_unused, step) => 1 + step * 7,
    );

    it("hands the ladder the leaf, not the tier name it replaced, so the probe and the pill agree word for word", () => {
      stubLayout(WIDE_TRACK_PX);

      mount(variant, veneerOffRoot, OWNED_BY_NAMED_TIER);

      const measured = measuredLabels();
      expect(measured[0]).toBe(LEAF);
      expect(measured).not.toContain(
        ro.globalSettings.pillMaterial(tierName(SWITCHED_OFF_MATERIAL)),
      );
      expect(drawnLabels()).toEqual(measured);
    });

    it("draws, at every track width, exactly the rung the measured leaf buys, and a pill that fits its track above one label", () => {
      const rungsDrawn = new Set<number>();
      for (const trackPx of TRACKS_PX) {
        stubLayout(trackPx);
        mount(variant, veneerOffRoot, OWNED_BY_NAMED_TIER);

        const measured = measuredLabels();
        const widths = measured.map((label) => label.length * CHARACTER_PX);
        const expectedCount = visibleCountThatFitsWithin({
          availableWidthPx: trackPx,
          labelWidthsPx: widths,
          fixedWidthsPx: FIXED_WIDTHS,
        });
        const named = drawnLabels();
        const at = `at a ${String(trackPx)} px track`;

        expect(named, at).toEqual(measured.slice(0, expectedCount));
        if (named.length > 1)
          expect(
            widthNeededForVisibleLabels(named.length, widths, FIXED_WIDTHS),
            `${at}: the pill the fit model drew must fit the track it measured`,
          ).toBeLessThanOrEqual(trackPx);
        expect(counterText(), at).toBe(
          named.length === measured.length
            ? undefined
            : `+${String(measured.length - named.length)}`,
        );
        rungsDrawn.add(named.length);
        unmountScreen();
      }

      expect([...rungsDrawn].sort()).toEqual([1, 2, 3, 4]);
    });

    it("would have drawn a different rung somewhere had the tier's own, shorter name been measured: the sweep sees the leaf's width", () => {
      const tierLabel = ro.globalSettings.pillMaterial(
        tierName(SWITCHED_OFF_MATERIAL),
      );
      stubLayout(WIDE_TRACK_PX);
      mount(variant, veneerOffRoot, OWNED_BY_NAMED_TIER);
      const withLeaf = measuredLabels().map(
        (label) => label.length * CHARACTER_PX,
      );
      unmountScreen();
      const withTierName = [
        tierLabel.length * CHARACTER_PX,
        ...withLeaf.slice(1),
      ];

      const countsDiffer = TRACKS_PX.some(
        (trackPx) =>
          visibleCountThatFitsWithin({
            availableWidthPx: trackPx,
            labelWidthsPx: withLeaf,
            fixedWidthsPx: FIXED_WIDTHS,
          }) !==
          visibleCountThatFitsWithin({
            availableWidthPx: trackPx,
            labelWidthsPx: withTierName,
            fixedWidthsPx: FIXED_WIDTHS,
          }),
      );

      expect(tierLabel.length).not.toBe(LEAF.length);
      expect(countsDiffer).toBe(true);
    });
  },
);

describe("the pill in Russian", () => {
  const RUSSIAN_LEAF = ruMessages.replacementSheet.headerMaterialToChoose;

  it.each<ConfigureScreenVariant>(["owner", "shared"])(
    "reads the Russian leaf on the %s screen, with the Romanian words nowhere",
    (variant) => {
      stubLayout(WIDE_TRACK_PX);
      hydrateAs(variant, OWNED_BY_NAMED_TIER);
      const mounted = mountInCatalogue(
        createElement(ConfigureScreen, { variant }),
        "ru",
        veneerOffRoot,
      );

      try {
        const drawn = allIn(
          mounted.container,
          '[data-testid="global-settings-pill-label"]',
        ).map((label) => label.textContent);
        expect(drawn[0]).toBe(RUSSIAN_LEAF);
        expect(
          mounted.container.querySelector('[data-probe="label"]')?.textContent,
        ).toBe(RUSSIAN_LEAF);
        const said = everythingSaidIn(mounted.container);
        expect(said).toContain(RUSSIAN_LEAF);
        expect(said).not.toContain(LEAF);
      } finally {
        mounted.unmount();
      }
    },
  );
});

describe.each<ConfigureScreenVariant>(["owner", "shared"])(
  "the %s screen with no price book",
  (variant) => {
    it.each([
      ["a material withdrawn from the book", OWNED_BY_WITHDRAWN_TIER],
      ["a material that would be switched off", OWNED_BY_NAMED_TIER],
    ])(
      "says the leaf nowhere with %s: no book owes no row",
      (_name, settings) => {
        stubLayout(WIDE_TRACK_PX);

        mount(variant, NO_PRICE_BOOK, settings);

        expect(everythingSaidIn(within())).not.toContain(LEAF);
        expect(drawnLabels().length).toBeGreaterThanOrEqual(1);
      },
    );
  },
);

describe("the pill clears the moment the row is resolved, through the real sheet", () => {
  function chooseMaterial(tierId: string): void {
    const radio = all("global-settings-option")
      .map((option) => option.querySelector("input"))
      .find((input) => input?.value === tierId);
    if (!radio) throw new Error(`the sheet offers no ${tierId}`);
    act(() => {
      radio.click();
    });
  }

  it("reads the leaf, keeps reading it while a replacement is chosen but not applied, and names the replacement on Aplica", () => {
    hydrateAs("owner", OWNED_BY_NAMED_TIER);
    mountSettings(veneerOffRoot, 4);
    expect(drawnLabels()[0]).toBe(LEAF);

    openSheet();
    chooseMaterial(SAMPLE_PRICE_ROOT.book.material.defaultTierId);
    expect(
      drawnLabels()[0],
      "the pill describes what the kitchen carries, not what is pending",
    ).toBe(LEAF);
    press("global-settings-apply");

    expect(
      useConfiguratorStore.getState().design.settings?.materialTierId,
    ).toBe(SAMPLE_PRICE_ROOT.book.material.defaultTierId);
    expect(drawnLabels()[0]).toBe(
      ro.globalSettings.pillMaterial(
        tierName(SAMPLE_PRICE_ROOT.book.material.defaultTierId),
      ),
    );
    expect(drawnLabels()).not.toContain(LEAF);
  });

  it("brings the hardware entry back once the hardware row is resolved, though the leaf was never about hardware", () => {
    const hardwareOffRoot: PriceBookRoot = {
      ...SAMPLE_PRICE_ROOT,
      availability: switchedOffTiers({ hardware: ["hardware.premium"] }),
    };
    hydrateAs("owner", {
      cabinetDepthMm: 600,
      hardwareTierId: "hardware.premium",
    });
    mountSettings(hardwareOffRoot, 4);
    const hardwareWord = ro.priceBreakdown.wholeKitchenCategories.hardware;
    expect(
      drawnLabels().filter((label) => label.includes(hardwareWord)),
    ).toEqual([]);

    openSheet();
    const radio = all("global-settings-option")
      .map((option) => option.querySelector("input"))
      .find((input) => input?.value === "hardware.soft-close");
    act(() => {
      radio?.click();
    });
    press("global-settings-apply");

    expect(
      drawnLabels().filter((label) => label.includes(hardwareWord)),
    ).toHaveLength(1);
  });
});

describe("a kitchen that suddenly has fewer settings than the rung the pill last drew", () => {
  it.each<ConfigureScreenVariant>(["owner", "shared"])(
    "on the %s screen redraws a named leaf and a counter that counts hidden settings, never zero or negative",
    (variant) => {
      stubLayout(WIDE_TRACK_PX);
      mount(variant, SAMPLE_PRICE_ROOT, { cabinetDepthMm: 600 });
      expect(drawnLabels()).toHaveLength(4);
      expect(counterText()).toBeUndefined();

      act(() => {
        useConfiguratorStore.getState().hydrate({
          design: {
            ...KITCHEN_L_DESIGN,
            settings: {
              cabinetDepthMm: 600,
              materialTierId: WITHDRAWN,
              hardwareTierId: "hardware.withdrawn-from-the-book",
            },
          },
          designId: `q5c-qa-design-${String((hydrations += 1))}`,
          revision: "1",
          canWrite: variant === "owner",
        });
      });

      expect(drawnLabels()[0]).toBe(LEAF);
      expect(drawnLabels().length).toBeLessThanOrEqual(measuredLabels().length);
      expect(measuredLabels()).toHaveLength(2);
      expect(drawnLabels()).toEqual(measuredLabels());
      expect(counterText()).toBeUndefined();
      expect(one("global-settings-trigger").textContent).not.toMatch(
        A_BARE_ZERO,
      );
    },
  );
});
