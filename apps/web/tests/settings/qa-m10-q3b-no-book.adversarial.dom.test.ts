// @vitest-environment happy-dom
//
// M10 Q3b adversarial QA, R-b's editor clause: with no active price book the settings sheet opens, says "prices
// unavailable" where a figure would stand (both tier groups and the depth note, three times), hides the handle row,
// draws no zero and no price anywhere, and still applies what the customer CAN change.
//
// The implementer's "applies nothing when nothing was chosen" cannot tell a working Aplica from a dead one, and the
// zero scan it uses only matches a 0 followed by a unit. Here a real change is applied on a kitchen that carries tiers
// (the commands now take `availableTierIds = []`), and the scan is `\b0\b`, `+0` and `NaN` across the text and every
// accessibility attribute.
import {
  KITCHEN_L_DESIGN,
  SAMPLE_PRICE_BOOK,
  tierRef,
  type CatalogueAvailability,
  type Design,
} from "@lemnaria/configurator-domain";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NO_PRICE_BOOK } from "@/price/price-book-root";
import { GlobalSettings } from "@/settings/global-settings";
import { useConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";
import {
  mountInCatalogue,
  type MountedScreen,
} from "../support/render-with-intl";
import { ro } from "../support/romanian-content";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";

const VISIBLE_SETTING_COUNT = 3;
const A_PRICE = /\d[\d\s]*(MDL|lei)/u;
const A_BARE_ZERO = /(^|[^\d.,#\w])[+-]?0([^\d.,]|$)|NaN|undefined/u;
const DEEP_DEPTH_MM = 700;

let screen: MountedScreen | undefined;
// `hydrate` keeps what it holds for a design id it already has, so each test mounts a design of its own.
let hydrations = 0;

beforeEach(() => {
  vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
});

afterEach(() => {
  screen?.unmount();
  screen = undefined;
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

function mountSettings(root: Parameters<typeof mountInCatalogue>[2]): void {
  screen = mountInCatalogue(
    createElement(
      "main",
      null,
      createElement(GlobalSettings, { visibleCount: VISIBLE_SETTING_COUNT }),
    ),
    "ro",
    root,
  );
}

function within(): HTMLElement {
  if (screen === undefined) throw new Error("nothing is mounted");
  return screen.container;
}

function all(testId: string): HTMLElement[] {
  return [
    ...within().querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`),
  ];
}

function one(testId: string): HTMLElement {
  const found = all(testId)[0];
  if (found === undefined) throw new Error(`no element has test id ${testId}`);
  return found;
}

function openSheet(): void {
  act(() => {
    one("global-settings-trigger").click();
  });
}

function press(testId: string): void {
  act(() => {
    one(testId).click();
  });
}

function chooseDepth(cabinetDepthMm: number): void {
  const input = all("global-settings-depth-option")
    .map((option) => option.querySelector("input"))
    .find((radio) => radio?.value === String(cabinetDepthMm));
  if (!input) throw new Error(`no depth option ${String(cabinetDepthMm)}`);
  act(() => {
    input.click();
  });
}

/** Everything a person or a screen reader could be told: text and the attributes that carry words. */
function everythingSaid(): string {
  const elements = [within(), ...within().querySelectorAll<HTMLElement>("*")];
  return elements
    .flatMap((element) => [
      ...[...element.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent),
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("alt"),
    ])
    .filter((said): said is string => said !== null && said.trim() !== "")
    .join(" | ");
}

function occurrencesOf(needle: string, haystack: string): number {
  return haystack.split(needle).length - 1;
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

  it("says prices are unavailable exactly three times: once in each tier group and once in the depth note", () => {
    const line = ro.globalSettings.pricesUnavailable;

    expect(
      occurrencesOf(line, one("global-settings-surface").textContent),
    ).toBe(3);
    expect(all("global-settings-prices-unavailable")).toHaveLength(2);
    expect(one("global-settings-depth-note").textContent).toBe(line);
    for (const group of all("global-settings-group"))
      expect(group.textContent).toContain(line);
  });

  it("hides the handle row, where under a book the same sheet draws it", () => {
    expect(all("global-settings-handle-group")).toHaveLength(0);
    expect(all("global-settings-handle-option")).toHaveLength(0);

    screen?.unmount();
    mountSettings(SAMPLE_PRICE_ROOT);
    openSheet();

    expect(all("global-settings-handle-group")).toHaveLength(1);
  });

  it("shows no price, no figure and no zero in its text or in any label", () => {
    const said = everythingSaid();

    expect(said).not.toMatch(A_PRICE);
    expect(said).not.toMatch(A_BARE_ZERO);
    expect(all("global-settings-figure")).toHaveLength(0);
    expect(all("global-settings-delta")).toHaveLength(0);
  });

  it("offers no tier to choose and marks no default", () => {
    expect(all("global-settings-option")).toHaveLength(0);
    expect(all("global-settings-anchor")).toHaveLength(0);
    expect(
      within().querySelectorAll('input[type="radio"]:checked').length,
    ).toBe(1);
  });
});

describe("the pill with no price book", () => {
  it("names no tier that the same kitchen's pill names under a book, and says no zero", () => {
    hydrateCarrying({ cabinetDepthMm: 600 });
    mountSettings(SAMPLE_PRICE_ROOT);
    const withBook = one("global-settings-trigger").getAttribute("aria-label");
    const withBookText = one("global-settings-trigger").textContent;
    screen?.unmount();

    mountSettings(NO_PRICE_BOOK);
    const without = one("global-settings-trigger");

    expect(withBook).toMatch(/melamin|Standard/iu);
    for (const named of [withBook, withBookText]) {
      for (const tierName of ["melamin", "Standard", "Feronerie"])
        if (named?.toLowerCase().includes(tierName.toLowerCase()))
          expect(
            `${without.getAttribute("aria-label") ?? ""} ${without.textContent}`
              .toLowerCase()
              .includes(tierName.toLowerCase()),
            `the pill without a book still names "${tierName}"`,
          ).toBe(false);
    }
    expect(everythingSaid()).not.toMatch(A_BARE_ZERO);
  });

  it.each([1, 2, 3, 4])(
    "draws a whole pill at visible count %i with no zero, NaN or undefined",
    (visibleCount) => {
      hydrateCarrying({ cabinetDepthMm: 600 });
      screen = mountInCatalogue(
        createElement(
          "main",
          null,
          createElement(GlobalSettings, { visibleCount }),
        ),
        "ro",
        NO_PRICE_BOOK,
      );

      expect(everythingSaid()).not.toMatch(A_BARE_ZERO);
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

  it("applies a depth change and leaves the carried tiers exactly as stored", () => {
    hydrateCarrying(CARRYING);
    mountSettings(NO_PRICE_BOOK);
    openSheet();

    chooseDepth(DEEP_DEPTH_MM);
    press("global-settings-apply");

    expect(all("global-settings-refusal")).toHaveLength(0);
    expect(useConfiguratorStore.getState().design.settings).toEqual({
      ...CARRYING,
      cabinetDepthMm: DEEP_DEPTH_MM,
    });
    expect(all("global-settings-surface")).toHaveLength(0);
  });

  it("applies a depth change on a kitchen that carries tiers the book never held, and does not replace or drop them", () => {
    const gone = {
      cabinetDepthMm: 600,
      materialTierId: "material.gone",
      hardwareTierId: "hardware.gone",
    };
    hydrateCarrying(gone);
    mountSettings(NO_PRICE_BOOK);
    openSheet();

    chooseDepth(DEEP_DEPTH_MM);
    press("global-settings-apply");

    expect(all("global-settings-refusal")).toHaveLength(0);
    expect(useConfiguratorStore.getState().design.settings).toEqual({
      ...gone,
      cabinetDepthMm: DEEP_DEPTH_MM,
    });
  });

  it("writes nothing when the sheet is cancelled after a depth choice", () => {
    hydrateCarrying(CARRYING);
    mountSettings(NO_PRICE_BOOK);
    openSheet();
    const before = useConfiguratorStore.getState().design;

    chooseDepth(DEEP_DEPTH_MM);
    press("global-settings-cancel");

    expect(useConfiguratorStore.getState().design).toBe(before);
  });
});

describe("a colour chosen with no price book (R-b: colour still applies)", () => {
  /** A palette chip of the sheet's colour group that is not the one pressed now, with its rendered id. */
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
      const stored = useConfiguratorStore.getState().design.settings;
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
  const veneerOff: CatalogueAvailability = {
    revision: "1",
    disabled: [tierRef("material", "material.veneer")],
  };

  it("commits one untouched Aplica through the component itself, on a kitchen that carries the switched-off tier, and stores the default", () => {
    hydrateCarrying({ cabinetDepthMm: 600, materialTierId: "material.veneer" });
    mountSettings({ ...SAMPLE_PRICE_ROOT, availability: veneerOff });
    openSheet();

    press("global-settings-apply");

    expect(all("global-settings-refusal")).toHaveLength(0);
    expect(
      useConfiguratorStore.getState().design.settings?.materialTierId,
    ).toBe(SAMPLE_PRICE_BOOK.material.defaultTierId);
    expect(all("global-settings-surface")).toHaveLength(0);
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
    expect(all("global-settings-handle-group")).toHaveLength(1);
  });
});
