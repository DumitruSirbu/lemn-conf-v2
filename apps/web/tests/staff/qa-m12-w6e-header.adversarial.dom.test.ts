// @vitest-environment happy-dom
//
// Adversarial QA of M12 wave W6e on the cabinet list's header (ADR 0185 decision 6; plan W6e-1, W6e-3): the header's
// facts against `describeStaffSummaryRows` for the copy on screen and for the other copy, over generated kitchens in both
// locales; the marks of the whole-kitchen facts that differ; the price that must not stand beside the sent copy; the
// count the header states against the rows the list draws; and the state in which the list cannot be listed.
import { fc } from "@fast-check/vitest";
import { KITCHEN_L_DESIGN, type Design } from "@lemnaria/configurator-domain";
import { createTranslator } from "next-intl";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { resolveContent, resolveStaffKitchenCopy } from "@/i18n/content";
import { StaffCabinetList } from "@/staff/staff-cabinet-list";
import { KitchenSettings } from "@/staff/staff-cabinet-settings";
import {
  describeStaffSummaryRows,
  type StaffSummaryRow,
} from "@/staff/staff-kitchen-view";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import {
  allIn,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";
import { SAMPLE_PRICE_ROOT } from "../support/sample-price-root";
import { ARMS, composedKitchensOf } from "../support/swept-kitchens";

const SEED = 20_261_115;
const RUNS = 40;
const NO_VALUE = "—";
const CATALOGUES = { ro: roMessages, ru: ruMessages } as const;
const LOCALES: readonly TestLocale[] = ["ro", "ru"];
const COMPARED: readonly StaffSummaryRow["key"][] = [
  "shape",
  "walls",
  "material",
  "hardware",
  "finish",
];
const MATERIALS = [undefined, "material.melamine", "material.veneer"] as const;
const HARDWARES = [undefined, "hardware.standard", "hardware.premium"] as const;
const FINISHES = [
  undefined,
  { kind: "palette-entry", entryId: "pal.alb" },
  { kind: "palette-entry", entryId: "pal.antracit" },
] as const;

let screen: MountedScreen | undefined;

afterEach(() => {
  screen?.unmount();
  screen = undefined;
  document.body.replaceChildren();
});

function rowsOf(design: Design, locale: TestLocale): StaffSummaryRow[] {
  const translate = createTranslator({
    locale,
    messages: CATALOGUES[locale] as typeof roMessages,
  });
  return [
    ...describeStaffSummaryRows({
      design,
      priceBook: SAMPLE_PRICE_ROOT,
      copy: resolveStaffKitchenCopy(translate),
      content: resolveContent(translate),
      noValue: NO_VALUE,
    }),
  ];
}

function wordsOf(locale: TestLocale) {
  const messages = CATALOGUES[locale];
  return {
    differs: messages.staffChanges.rowDiffers,
    wasInSent: (value: string) =>
      messages.staffChanges.rowWasInSent.replace("{value}", value),
    priceNote: messages.staffKitchen.summaryPriceNote,
  };
}

interface SettingsVariation {
  readonly material: (typeof MATERIALS)[number];
  readonly hardware: (typeof HARDWARES)[number];
  readonly finish: (typeof FINISHES)[number];
}

function withSettings(design: Design, variation: SettingsVariation): Design {
  const settings = {
    ...design.settings,
    ...(variation.material === undefined
      ? {}
      : { materialTierId: variation.material }),
    ...(variation.hardware === undefined
      ? {}
      : { hardwareTierId: variation.hardware }),
    ...(variation.finish === undefined ? {} : { finish: variation.finish }),
  };
  return { ...design, settings } as Design;
}

const POOL: readonly Design[] = [
  KITCHEN_L_DESIGN,
  ...ARMS.flatMap((arm) =>
    composedKitchensOf(arm)
      .slice(0, 10)
      .map(({ design }) => design),
  ),
];

const variation = fc.record({
  material: fc.constantFrom(...MATERIALS),
  hardware: fc.constantFrom(...HARDWARES),
  finish: fc.constantFrom(...FINISHES),
});
const someDesign = fc
  .tuple(fc.constantFrom(...POOL), variation)
  .map(([design, settings]) => withSettings(design, settings));

function mountSettings(props: {
  locale: TestLocale;
  design: Design;
  other: Design | undefined;
  isShownCurrent: boolean;
  omitsStartingPrice: boolean;
}): HTMLElement {
  const { locale, ...rest } = props;
  screen?.unmount();
  screen = mountInCatalogue(createElement(KitchenSettings, rest), locale);
  return screen.container;
}

function drawnFacts(container: HTMLElement) {
  return allIn(container, "[data-fact]").map((fact) => ({
    key: fact.getAttribute("data-fact"),
    text: requireIn(fact, "dd").textContent,
    isDiffering: fact.getAttribute("data-differs") === "true",
  }));
}

describe("the pool of generated kitchens", () => {
  it("holds kitchens of every arm to probe with, so the properties below are not vacuous", () => {
    expect(POOL.length).toBeGreaterThan(20);
    expect(new Set(POOL.map((design) => design.room.shape)).size).toBe(3);
  });
});

describe.each(LOCALES)("the header's facts in %s (W6e-1)", (locale) => {
  it("draws, for any generated kitchen, exactly the rows describeStaffSummaryRows words, in its order, price included unless omitted", () => {
    fc.assert(
      fc.property(someDesign, fc.boolean(), (design, omitsStartingPrice) => {
        const container = mountSettings({
          locale,
          design,
          other: undefined,
          isShownCurrent: false,
          omitsStartingPrice,
        });

        const expected = rowsOf(design, locale)
          .filter((row) => !(omitsStartingPrice && row.key === "price"))
          .map((row) => ({
            key: row.key,
            text: `${row.value}${row.sub ?? ""}`,
            isDiffering: false,
          }));
        expect(drawnFacts(container)).toEqual(expected);
      }),
      { numRuns: RUNS, seed: SEED },
    );
  });

  it("marks, for any two generated copies, exactly the compared whole-kitchen facts that read differently and neither copy cannot tell", () => {
    const markedFacts = new Set<string>();
    fc.assert(
      fc.property(
        someDesign,
        someDesign,
        fc.boolean(),
        (design, other, isShownCurrent) => {
          const container = mountSettings({
            locale,
            design,
            other,
            isShownCurrent,
            omitsStartingPrice: true,
          });

          const shown = rowsOf(design, locale);
          const elsewhere = rowsOf(other, locale);
          const expectedDiffering = shown
            .filter(({ key, value }) => {
              const otherValue = elsewhere.find(
                (row) => row.key === key,
              )?.value;
              return (
                COMPARED.includes(key) &&
                value !== NO_VALUE &&
                otherValue !== NO_VALUE &&
                otherValue !== value
              );
            })
            .map(({ key }) => key);
          const words = wordsOf(locale);
          const drawn = drawnFacts(container);

          expect(
            drawn
              .filter(({ isDiffering }) => isDiffering)
              .map(({ key }) => key),
          ).toEqual(expectedDiffering);
          for (const key of expectedDiffering) markedFacts.add(key);
          for (const fact of drawn) {
            const shouldMark = expectedDiffering.includes(
              fact.key as StaffSummaryRow["key"],
            );
            expect(fact.text.includes(words.differs)).toBe(shouldMark);
            const sentValue = elsewhere.find(
              (row) => row.key === fact.key,
            )?.value;
            expect(fact.text.includes(words.wasInSent(sentValue ?? ""))).toBe(
              shouldMark && isShownCurrent,
            );
          }
        },
      ),
      { numRuns: RUNS, seed: SEED },
    );
    // Not vacuous: the sweep reaches the room's facts and at least one tier fact.
    expect(markedFacts.has("walls")).toBe(true);
    expect(markedFacts.size).toBeGreaterThanOrEqual(3);
  });

  it("marks nothing, and says nothing of the sent copy, against an identical copy", () => {
    fc.assert(
      fc.property(someDesign, fc.boolean(), (design, isShownCurrent) => {
        const container = mountSettings({
          locale,
          design,
          other: design,
          isShownCurrent,
          omitsStartingPrice: true,
        });

        expect(container.querySelector("[data-differs]")).toBeNull();
        expect(container.textContent).not.toContain(wordsOf(locale).differs);
      }),
      { numRuns: RUNS, seed: SEED },
    );
  });

  it("is symmetric: the facts that differ are the same whichever copy is on screen", () => {
    fc.assert(
      fc.property(someDesign, someDesign, (first, second) => {
        const marked = (design: Design, other: Design) =>
          drawnFacts(
            mountSettings({
              locale,
              design,
              other,
              isShownCurrent: false,
              omitsStartingPrice: true,
            }),
          )
            .filter(({ isDiffering }) => isDiffering)
            .map(({ key }) => key);

        expect(marked(first, second)).toEqual(marked(second, first));
      }),
      { numRuns: RUNS, seed: SEED },
    );
  });

  it("never marks the cabinet count or the price, even when they differ between the copies", () => {
    const fewer: Design = {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.slice(1),
    };
    const container = mountSettings({
      locale,
      design: KITCHEN_L_DESIGN,
      other: fewer,
      isShownCurrent: true,
      omitsStartingPrice: false,
    });

    const bodies = requireIn(container, '[data-fact="bodies"]');
    const price = requireIn(container, '[data-fact="price"]');

    expect(bodies.getAttribute("data-differs")).toBeNull();
    expect(price.getAttribute("data-differs")).toBeNull();
    expect(bodies.textContent).not.toContain(wordsOf(locale).wasInSent(""));
  });
});

describe.each(LOCALES)("the price in the header in %s (W6e-3)", (locale) => {
  it("is stated, with the note that it is not an offer, only when the header is not told to omit it", () => {
    fc.assert(
      fc.property(someDesign, (design) => {
        const price = rowsOf(design, locale).find(({ key }) => key === "price");
        if (price === undefined) throw new Error("the rows hold no price");

        const stated = mountSettings({
          locale,
          design,
          other: undefined,
          isShownCurrent: true,
          omitsStartingPrice: false,
        });
        expect(stated.querySelector('[data-fact="price"]')).not.toBeNull();
        expect(stated.textContent).toContain(wordsOf(locale).priceNote);

        const omitted = mountSettings({
          locale,
          design,
          other: undefined,
          isShownCurrent: true,
          omitsStartingPrice: true,
        });
        expect(omitted.querySelector('[data-fact="price"]')).toBeNull();
        expect(omitted.textContent).not.toContain(wordsOf(locale).priceNote);
        expect(omitted.textContent).not.toContain(price.value);
      }),
      { numRuns: RUNS, seed: SEED },
    );
  });
});

describe.each(LOCALES)("the header against the list in %s", (locale) => {
  it("states the cabinet count the list draws, for any generated kitchen", () => {
    fc.assert(
      fc.property(someDesign, (design) => {
        screen?.unmount();
        screen = mountInCatalogue(
          createElement(StaffCabinetList, {
            design,
            shownVersion: "current",
            other: undefined,
            sentLines: [],
            omitsStartingPrice: true,
          }),
          locale,
        );
        const container = screen.container;

        const stated = requireIn(
          container,
          '[data-fact="bodies"] dd',
        ).textContent;
        const drawn = allIn(
          container,
          '[data-testid="staff-kitchen-cabinet"]',
        ).length;

        expect(stated).toBe(String(drawn));
      }),
      { numRuns: RUNS, seed: SEED },
    );
  });
});

describe.each(LOCALES)("a list that cannot be listed, in %s", (locale) => {
  const [first, ...rest] = KITCHEN_L_DESIGN.placements;
  if (first === undefined) throw new Error("the sample kitchen is empty");
  const unlistable: Design = {
    ...KITCHEN_L_DESIGN,
    placements: [
      {
        ...first,
        body: { ...first.body, buildId: "a-body-no-catalogue-holds" },
      },
      ...rest,
    ],
  };

  function mountList(omitsStartingPrice: boolean, other?: Design): HTMLElement {
    screen = mountInCatalogue(
      createElement(StaffCabinetList, {
        design: unlistable,
        shownVersion: "current",
        other,
        sentLines: [],
        omitsStartingPrice,
      }),
      locale,
    );
    return screen.container;
  }

  it("still says what the kitchen is made of, beside the sentence that it cannot be listed", () => {
    const container = mountList(true);

    expect(drawnFacts(container).map(({ key }) => key)).toEqual(
      rowsOf(unlistable, locale)
        .filter(({ key }) => key !== "price")
        .map(({ key }) => key),
    );
    expect(
      requireIn(container, '[data-testid="staff-kitchen-cabinets"]')
        .textContent,
    ).toContain(CATALOGUES[locale].staffChanges.cabinetsUnavailable);
    expect(allIn(container, "h2")).toHaveLength(1);
    expect(allIn(container, "button")).toHaveLength(0);
  });

  it("keeps the marks of a setting that differs from the other copy, and leaves a fact it cannot tell unmarked", () => {
    const narrower: Design = {
      ...KITCHEN_L_DESIGN,
      room: {
        ...KITCHEN_L_DESIGN.room,
        widthMm: KITCHEN_L_DESIGN.room.widthMm - 400,
      },
    };
    const container = mountList(true, narrower);

    expect(
      requireIn(container, '[data-fact="walls"]').getAttribute("data-differs"),
    ).toBe("true");
    for (const row of rowsOf(unlistable, locale)) {
      if (row.value !== NO_VALUE || row.key === "price") continue;
      expect(
        requireIn(container, `[data-fact="${row.key}"]`).getAttribute(
          "data-differs",
        ),
      ).toBeNull();
    }
  });
});
