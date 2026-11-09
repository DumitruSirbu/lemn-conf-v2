// @vitest-environment happy-dom
//
// The opened settings sheet with no active price book: the unavailable line where a figure would stand (both tier
// groups and the depth note, three times), the handle row present, no zero and no price in any text or label, and the
// controls that still apply (depth, colour, handle). Its sibling `q3b-editor-surfaces-without-a-book.dom.test.ts` pins
// what mounts; this one applies real changes on kitchens that carry tiers, where the commands now take an empty offer,
// and scans every accessibility attribute for a zero.
import { KITCHEN_L_DESIGN, type Design } from "@lemnaria/configurator-domain";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NO_PRICE_BOOK } from "@/price/price-book-root";
import { useConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";
import {
  A_BARE_ZERO,
  AN_AMOUNT,
  everythingSaidIn,
  occurrencesOf,
} from "../support/figures-in-text";
import {
  all,
  mountSettings,
  one,
  openSheet,
  press,
  unmountScreen,
  within,
} from "../support/mounted-screen";
import { ro } from "../support/romanian-content";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";
import { switchedOffTiers } from "../support/tier-offer-world";

const DEEP_DEPTH_MM = 700;
const A_NON_STEEL_HANDLE = "push";
const EVERY_HANDLE_COUNT = 3;

// `hydrate` keeps what it holds for a design id it already has, so each test mounts a design of its own.
let hydrations = 0;

beforeEach(() => {
  vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
});

afterEach(() => {
  unmountScreen();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function hydrateCarrying(settings: NonNullable<Design["settings"]>): void {
  const store = useConfiguratorStore.getState();
  store.attachBodyProbe(createFakeProbeFactory());
  store.hydrate({
    design: { ...KITCHEN_L_DESIGN, settings },
    designId: `qa-q3b-no-book-${String((hydrations += 1))}`,
    revision: "1",
    canWrite: true,
  });
}

function storedSettings(): Design["settings"] {
  return useConfiguratorStore.getState().design.settings;
}

function radioValued(testId: string, value: string): HTMLInputElement {
  const radio = all(testId)
    .map((option) => option.querySelector("input"))
    .find((input) => input?.value === value);
  if (!radio) throw new Error(`no ${testId} option valued ${value}`);
  return radio;
}

function choose(testId: string, value: string): void {
  const radio = radioValued(testId, value);
  act(() => {
    radio.click();
  });
}

function handleLabels(): readonly (string | null)[] {
  return all("global-settings-handle-option").map(
    (option) => option.textContent,
  );
}

describe("the zero scan itself", () => {
  it.each(["+0", "0", "Adaos 0 %", "NaN lei", "undefined", "x | 0 | y"])(
    "flags %j, so a clean sheet below is not a blind scan",
    (said) => {
      expect(said).toMatch(A_BARE_ZERO);
    },
  );

  it.each(["600", "700 mm", "#E0E0E0", "Depth 600", "+1", "10 %"])(
    "lets %j through, so the scan is not tripped by a number that is not a zero",
    (said) => {
      expect(said).not.toMatch(A_BARE_ZERO);
    },
  );
});

describe("the opened sheet with no price book", () => {
  beforeEach(() => {
    hydrateCarrying({ cabinetDepthMm: 600 });
    mountSettings(NO_PRICE_BOOK);
    openSheet();
  });

  it("says prices are unavailable exactly three times", () => {
    expect(
      occurrencesOf(
        ro.globalSettings.pricesUnavailable,
        one("global-settings-surface").textContent,
      ),
    ).toBe(3);
  });

  it("says it once in each tier group", () => {
    expect(all("global-settings-prices-unavailable")).toHaveLength(2);
    for (const group of all("global-settings-group"))
      expect(group.textContent).toContain(ro.globalSettings.pricesUnavailable);
  });

  it("says it as the depth note, in place of a percentage", () => {
    expect(one("global-settings-depth-note").textContent).toBe(
      ro.globalSettings.pricesUnavailable,
    );
  });

  it("shows no price, no figure and no zero in its text or in any label", () => {
    const said = everythingSaidIn(within());

    expect(said).not.toMatch(AN_AMOUNT);
    expect(said).not.toMatch(A_BARE_ZERO);
    expect(all("global-settings-figure")).toHaveLength(0);
    expect(all("global-settings-delta")).toHaveLength(0);
  });

  it("offers no tier to choose and shows no anchor", () => {
    expect(all("global-settings-option")).toHaveLength(0);
    expect(all("global-settings-anchor")).toHaveLength(0);
  });

  it("checks no radio in either tier group", () => {
    for (const group of all("global-settings-group"))
      expect(group.querySelectorAll("input:checked")).toHaveLength(0);
  });
});

describe("the kitchen handle row with no price book", () => {
  it("is shown with every handle, as the same sheet under a book shows it", () => {
    hydrateCarrying({ cabinetDepthMm: 600 });
    mountSettings(SAMPLE_PRICE_ROOT);
    openSheet();
    const underABook = handleLabels();
    unmountScreen();

    mountSettings(NO_PRICE_BOOK);
    openSheet();

    expect(all("global-settings-handle-group")).toHaveLength(1);
    expect(handleLabels()).toHaveLength(EVERY_HANDLE_COUNT);
    expect(handleLabels()).toEqual(underABook);
  });

  it("applies a handle chosen on the sheet, and refuses nothing", () => {
    hydrateCarrying({ cabinetDepthMm: 600 });
    mountSettings(NO_PRICE_BOOK);
    openSheet();

    choose("global-settings-handle-option", A_NON_STEEL_HANDLE);
    press("global-settings-apply");

    expect(all("global-settings-refusal")).toHaveLength(0);
    expect(storedSettings()?.handle).toBe(A_NON_STEEL_HANDLE);
  });
});

describe("the pill with no price book", () => {
  it("names no tier that the same kitchen's pill names under a book", () => {
    hydrateCarrying({ cabinetDepthMm: 600 });
    mountSettings(SAMPLE_PRICE_ROOT);
    const underABook = `${one("global-settings-trigger").getAttribute("aria-label") ?? ""} ${one("global-settings-trigger").textContent}`;
    unmountScreen();

    mountSettings(NO_PRICE_BOOK);
    const withoutABook = `${one("global-settings-trigger").getAttribute("aria-label") ?? ""} ${one("global-settings-trigger").textContent}`;

    expect(underABook).toMatch(/melamin|Standard/iu);
    for (const tierName of ["melamin", "standard", "feronerie"])
      if (underABook.toLowerCase().includes(tierName))
        expect(
          withoutABook.toLowerCase().includes(tierName),
          `the pill without a book still names "${tierName}"`,
        ).toBe(false);
  });

  it("says no zero in its text or labels", () => {
    hydrateCarrying({ cabinetDepthMm: 600 });
    mountSettings(NO_PRICE_BOOK);

    expect(everythingSaidIn(within())).not.toMatch(A_BARE_ZERO);
  });

  it.each([1, 2, 3, 4])(
    "draws a whole pill at visible count %i with no zero, NaN or undefined",
    (visibleCount) => {
      hydrateCarrying({ cabinetDepthMm: 600 });
      mountSettings(NO_PRICE_BOOK, visibleCount);

      expect(everythingSaidIn(within())).not.toMatch(A_BARE_ZERO);
      expect(all("global-settings-trigger")).toHaveLength(1);
    },
  );
});

describe("Aplica with no price book, on a kitchen that carries tiers", () => {
  const CARRYING = {
    cabinetDepthMm: 600,
    materialTierId: "material.veneer",
    hardwareTierId: "hardware.soft-close",
  };
  const TIERS_THE_BOOK_NEVER_HELD = {
    cabinetDepthMm: 600,
    materialTierId: "material.gone",
    hardwareTierId: "hardware.gone",
  };

  it.each([
    ["the book would hold", CARRYING],
    ["the book never held", TIERS_THE_BOOK_NEVER_HELD],
  ] as const)(
    "applies a depth change on a kitchen carrying tiers %s, and leaves them exactly as stored",
    (_name, carried) => {
      hydrateCarrying(carried);
      mountSettings(NO_PRICE_BOOK);
      openSheet();

      choose("global-settings-depth-option", String(DEEP_DEPTH_MM));
      press("global-settings-apply");

      expect(all("global-settings-refusal")).toHaveLength(0);
      expect(storedSettings()).toEqual({
        ...carried,
        cabinetDepthMm: DEEP_DEPTH_MM,
      });
    },
  );

  it("closes the sheet after a depth change", () => {
    hydrateCarrying(CARRYING);
    mountSettings(NO_PRICE_BOOK);
    openSheet();

    choose("global-settings-depth-option", String(DEEP_DEPTH_MM));
    press("global-settings-apply");

    expect(all("global-settings-surface")).toHaveLength(0);
  });

  it("writes nothing when the sheet is cancelled after a depth choice", () => {
    hydrateCarrying(CARRYING);
    mountSettings(NO_PRICE_BOOK);
    openSheet();
    const before = useConfiguratorStore.getState().design;

    choose("global-settings-depth-option", String(DEEP_DEPTH_MM));
    press("global-settings-cancel");

    expect(useConfiguratorStore.getState().design).toBe(before);
  });
});

describe("a colour chosen with no price book", () => {
  /** A palette chip of the sheet's colour group that is not pressed now. */
  function anotherColourChip(): HTMLButtonElement {
    const chip = [
      ...one(
        "global-settings-colour-group",
      ).querySelectorAll<HTMLButtonElement>('[data-testid^="finish-"]'),
    ].find((candidate) => candidate.getAttribute("aria-pressed") === "false");
    if (chip === undefined)
      throw new Error("the colour group has no other chip");
    return chip;
  }

  const KITCHENS: readonly (readonly [
    string,
    NonNullable<Design["settings"]>,
  ])[] = [
    [
      "a kitchen that carries tiers",
      {
        cabinetDepthMm: 600,
        materialTierId: "material.melamine",
        hardwareTierId: "hardware.soft-close",
      },
    ],
    ["a kitchen that carries no tier", { cabinetDepthMm: 600 }],
  ];

  it.each(KITCHENS)(
    "applies the chosen colour on %s, refuses nothing, and leaves the tier ids exactly as stored",
    (_name, carried) => {
      hydrateCarrying(carried);
      mountSettings(NO_PRICE_BOOK);
      openSheet();
      const chosen = anotherColourChip();
      const chosenValue = chosen
        .getAttribute("data-testid")
        ?.slice("finish-".length);

      act(() => {
        chosen.click();
      });
      press("global-settings-apply");

      expect(all("global-settings-refusal")).toHaveLength(0);
      const stored = storedSettings();
      expect(stored?.finish).toBeDefined();
      expect(JSON.stringify(stored?.finish)).toContain(
        chosenValue ?? "unreachable",
      );
      expect(stored?.materialTierId).toBe(carried.materialTierId);
      expect(stored?.hardwareTierId).toBe(carried.hardwareTierId);
      expect(stored?.cabinetDepthMm).toBe(carried.cabinetDepthMm);
    },
  );
});

describe("the same sheet under a book with a tier switched off", () => {
  const SWITCHED_OFF = "material.veneer";
  const veneerOff = switchedOffTiers({ material: [SWITCHED_OFF] });

  it("writes nothing on an untouched Aplica when the kitchen carries the switched-off tier", () => {
    hydrateCarrying({ cabinetDepthMm: 600, materialTierId: SWITCHED_OFF });
    mountSettings({ ...SAMPLE_PRICE_ROOT, availability: veneerOff });
    openSheet();
    const before = useConfiguratorStore.getState().design;

    press("global-settings-apply");

    expect(all("global-settings-refusal")).toHaveLength(0);
    expect(useConfiguratorStore.getState().design).toBe(before);
    expect(storedSettings()?.materialTierId).toBe(SWITCHED_OFF);
    expect(all("global-settings-surface")).toHaveLength(0);
  });

  it("checks no material radio for the carried switched-off tier", () => {
    hydrateCarrying({ cabinetDepthMm: 600, materialTierId: SWITCHED_OFF });
    mountSettings({ ...SAMPLE_PRICE_ROOT, availability: veneerOff });

    openSheet();

    const materialGroup = all("global-settings-group")[0];
    expect(materialGroup?.querySelectorAll("input:checked")).toHaveLength(0);
  });

  it("says prices are unavailable nowhere: the line belongs to a missing book, not to a switched-off tier", () => {
    hydrateCarrying({ cabinetDepthMm: 600 });
    mountSettings({ ...SAMPLE_PRICE_ROOT, availability: veneerOff });

    openSheet();

    expect(
      occurrencesOf(
        ro.globalSettings.pricesUnavailable,
        one("global-settings-surface").textContent,
      ),
    ).toBe(0);
  });

  it("shows the handle row, as it does with no book", () => {
    hydrateCarrying({ cabinetDepthMm: 600 });
    mountSettings({ ...SAMPLE_PRICE_ROOT, availability: veneerOff });

    openSheet();

    expect(all("global-settings-handle-group")).toHaveLength(1);
  });
});
