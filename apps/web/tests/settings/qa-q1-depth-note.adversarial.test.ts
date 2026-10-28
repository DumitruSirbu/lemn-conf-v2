// @vitest-environment happy-dom
//
// Adversarial QA for M10 wave Q1, the settings sheet's depth note and the customer copy it shares with the breakdown
// (Q1-b, ADR 0100 decision 5, T3's accessors, Q1-a's "never the old `depthNote`").
//
// What this file takes beyond `q1-depth-note.dom.test.ts` (two sampled percentages, Romanian only):
//   1. the note names the DEEP depth (700) for every pending depth, selected or not, across the rule's whole range, and
//      never says "600 mm scumpește…" or any figure of its own;
//   2. no figure is authored into any of the three Q1 leaves, in Romanian or in Russian (ICU literals stripped of
//      arguments and plural options carry no digit);
//   3. the retired `globalSettings.depthNote` is rendered by nothing under `apps/web/src`;
//   4. the Russian leaves render on the real sheets, without a missing-key fallback, at the plural-category boundaries.
import { fc } from "@fast-check/vitest";
import {
  buildKitchenLBodyCatalog,
  countCabinetsWearingAChosenFinish,
  DEEP_CABINET_DEPTH_MM,
  DEFAULT_CABINET_DEPTH_MM,
  KITCHEN_L_DESIGN,
  MAX_DEEP_CABINET_PERCENT,
  priceDesign,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  type Design,
} from "@lemnaria/configurator-domain";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PriceBreakdown } from "@/price/price-breakdown";
import { offerWholeKitchenTiers } from "@/price/whole-kitchen-tiers";
import {
  describeGlobalSettings,
  type GlobalSettingsView,
} from "@/settings/global-settings-model";
import { GlobalSettings } from "@/settings/global-settings";
import { useConfiguratorStore } from "@/store/configurator-store";

import { CATALOGUES, contentFor, requireLeafAt } from "../support/catalogues";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows";
import { filesUnder } from "../support/files-under";
import { authoredLiterals } from "../support/icu-authored-literals";
import {
  mountInCatalogue,
  type MountedScreen,
} from "../support/render-with-intl";
import { rootPublishingDeepCabinetPercent } from "../support/book-with-deep-cabinet-percent";
import { ro } from "../support/romanian-content";

const SWEEP_SEED = 20_261_028;
const WEB_SOURCE = join(import.meta.dirname, "..", "..", "src");
const VISIBLE_SETTING_COUNT = 3;
const CYRILLIC = /\p{Script=Cyrillic}/u;

/** Plural-category boundaries for Russian (one, few, many) and the zero branch, plus the rule's ceiling. */
const RUSSIAN_PERCENTS = [0, 1, 2, 5, 11, 21, 22, 100] as const;

const Q1_LEAVES = [
  "priceBreakdown.depthLine",
  "priceBreakdown.depthLineScope",
  "globalSettings.depthNotePriced",
] as const;

let screen: MountedScreen | undefined;

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function settingsViewFor(
  pendingDepthMm: number | undefined,
  deepCabinetPercent: number,
): GlobalSettingsView {
  const design: Design = KITCHEN_L_DESIGN;
  const catalog = buildKitchenLBodyCatalog(DEFAULT_CABINET_DEPTH_MM);
  const book = {
    ...SAMPLE_PRICE_BOOK,
    depthRule: { deepCabinetPercent },
  };
  const pricingInput = {
    deepeningRows: MEASURED_DEEPENING_ROWS,
    design,
    catalog,
    book,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    selections: design.settings,
  };
  return describeGlobalSettings({
    deepCabinetPercent,
    content: ro,
    pricing: priceDesign(pricingInput),
    offer: offerWholeKitchenTiers(pricingInput),
    groups: projectDesignForDisplay(design, catalog),
    applied: {},
    pending:
      pendingDepthMm === undefined ? {} : { cabinetDepthMm: pendingDepthMm },
    chosenColourCount: countCabinetsWearingAChosenFinish(design),
  });
}

describe("the settings depth note names the deep depth and the published percent (Q1-b)", () => {
  it("for every pending depth and every percent, states 700 mm and that percent, and never 600 mm", () => {
    const pendingDepths = [
      undefined,
      DEFAULT_CABINET_DEPTH_MM,
      DEEP_CABINET_DEPTH_MM,
      650,
    ];
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_DEEP_CABINET_PERCENT }),
        fc.constantFrom(...pendingDepths),
        (percent, pendingDepthMm) => {
          const note = settingsViewFor(pendingDepthMm, percent).depthGroup.note;

          expect(note).toBe(
            ro.globalSettings.depthNotePriced(DEEP_CABINET_DEPTH_MM, percent),
          );
          expect(note).toContain(String(DEEP_CABINET_DEPTH_MM));
          expect(note).not.toContain(String(DEFAULT_CABINET_DEPTH_MM));
          expect(note.match(/\d+/gu)).toEqual(
            percent === 0
              ? [String(DEEP_CABINET_DEPTH_MM)]
              : [String(DEEP_CABINET_DEPTH_MM), String(percent)],
          );
        },
      ),
      { seed: SWEEP_SEED, numRuns: 150 },
    );
  });

  it("at 0 % says the deep depth does not change the price, and states no surcharge", () => {
    const note = settingsViewFor(DEEP_CABINET_DEPTH_MM, 0).depthGroup.note;

    expect(note).not.toContain("%");
  });

  it("is the same sentence whichever depth is selected, so choosing 600 does not hide what 700 costs", () => {
    const notes = new Set(
      [undefined, DEFAULT_CABINET_DEPTH_MM, DEEP_CABINET_DEPTH_MM].map(
        (pending) => settingsViewFor(pending, 17).depthGroup.note,
      ),
    );

    expect(notes.size).toBe(1);
  });
});

describe("no figure is authored into the Q1 leaves (ADR 0100 decision 5: the copy states no number of its own)", () => {
  it.each(CATALOGUES)(
    "%s: the literals of depthLine, depthLineScope and depthNotePriced hold no digit",
    (_locale, messages) => {
      for (const key of Q1_LEAVES) {
        const literals = authoredLiterals(requireLeafAt(messages, key));
        expect(literals.join(""), key).not.toMatch(/\d/u);
      }
    },
  );

  it.each(CATALOGUES)(
    "%s: the figure words are arguments: depthLine takes both the depth and the percent",
    (_locale, messages) => {
      const leaf = requireLeafAt(messages, "priceBreakdown.depthLine");

      expect(leaf).toContain("{cabinetDepthMm");
      expect(leaf).toContain("{percent}");
    },
  );
});

describe("the retired depthNote is rendered nowhere (Q1-a)", () => {
  const RETIRED = /\bdepthNote\b(?!Priced)/u;
  const OWNED_BY_T2 = [
    join(WEB_SOURCE, "messages"),
    join(WEB_SOURCE, "i18n", "content.ts"),
  ];

  it("no source under apps/web/src outside the message catalogue and its accessor names it", () => {
    const readers = filesUnder(WEB_SOURCE)
      .filter((file) => !OWNED_BY_T2.some((owned) => file.startsWith(owned)))
      .filter((file) => RETIRED.test(readFileSync(file, "utf8")));

    expect(readers).toEqual([]);
  });

  it("the shipped depth group's note is never the retired leaf, in either locale", () => {
    for (const [locale, messages] of CATALOGUES) {
      const retired = requireLeafAt(messages, "globalSettings.depthNote");
      const content = contentFor(locale, messages);
      for (const percent of [0, 1, 12, 100])
        expect(
          content.globalSettings.depthNotePriced(
            DEEP_CABINET_DEPTH_MM,
            percent,
          ),
        ).not.toBe(retired);
    }
  });
});

/** What next-intl logs for a missing or unformattable message. The sheet logs other, unrelated lines in a bare mount. */
function translationErrorsIn(logged: {
  readonly mock: { readonly calls: readonly (readonly unknown[])[] };
}): readonly string[] {
  return logged.mock.calls
    .map((call) => call.map(String).join(" "))
    .filter((line) =>
      /MISSING_MESSAGE|INVALID_MESSAGE|FORMATTING_ERROR/u.test(line),
    );
}

describe("the Russian leaves render on the real sheets, with no missing-key fallback", () => {
  function hydrateAt(cabinetDepthMm: number): void {
    vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
    useConfiguratorStore.getState().hydrate({
      design: {
        ...KITCHEN_L_DESIGN,
        settings: { ...KITCHEN_L_DESIGN.settings, cabinetDepthMm },
      },
      designId: "qa-q1-ru",
      revision: "1",
      canWrite: true,
    });
  }

  function openOn(
    element: ReturnType<typeof createElement>,
    triggerTestId: string,
    percent: number,
  ): HTMLElement {
    screen = mountInCatalogue(
      createElement("main", null, element),
      "ru",
      rootPublishingDeepCabinetPercent(percent),
    );
    act(() => {
      screen?.container
        .querySelector<HTMLButtonElement>(`[data-testid="${triggerTestId}"]`)
        ?.click();
    });
    return screen.container;
  }

  it.each(RUSSIAN_PERCENTS)(
    "settings note at %i %%: Cyrillic, the percent, the deep depth, no key text",
    (percent) => {
      const logged = vi.spyOn(console, "error");
      hydrateAt(DEFAULT_CABINET_DEPTH_MM);

      const dom = openOn(
        createElement(GlobalSettings, { visibleCount: VISIBLE_SETTING_COUNT }),
        "global-settings-trigger",
        percent,
      );
      const note =
        dom.querySelector('[data-testid="global-settings-depth-note"]')
          ?.textContent ?? "";

      expect(note).toBe(
        contentFor("ru", CATALOGUES[1][1]).globalSettings.depthNotePriced(
          DEEP_CABINET_DEPTH_MM,
          percent,
        ),
      );
      expect(note).toMatch(CYRILLIC);
      expect(note).toContain(String(DEEP_CABINET_DEPTH_MM));
      expect(note).not.toContain("globalSettings");
      if (percent > 0) expect(note).toContain(String(percent));
      expect(translationErrorsIn(logged)).toEqual([]);
    },
  );

  it.each(RUSSIAN_PERCENTS)(
    "breakdown depth line at %i %%: Cyrillic label and scope, the percent, the priced amount, no key text",
    (percent) => {
      const logged = vi.spyOn(console, "error");
      hydrateAt(DEEP_CABINET_DEPTH_MM);

      const dom = openOn(
        createElement(PriceBreakdown),
        "price-breakdown-trigger",
        percent,
      );
      const label =
        dom.querySelector('[data-testid="breakdown-depth-label"]')
          ?.textContent ?? "";
      const scope =
        dom.querySelector('[data-testid="breakdown-depth-scope"]')
          ?.textContent ?? "";

      expect(label).toBe(
        contentFor("ru", CATALOGUES[1][1]).priceBreakdown.depthLine(
          DEEP_CABINET_DEPTH_MM,
          percent,
        ),
      );
      expect(label).toMatch(CYRILLIC);
      expect(label).toContain(`${String(percent)} %`);
      expect(scope).toMatch(CYRILLIC);
      expect(label + scope).not.toContain("priceBreakdown");
      expect(translationErrorsIn(logged)).toEqual([]);
    },
  );
});
