// Adversarial QA for wave 6D. What the shipped suites assert is right; these are the four places a
// real drift would walk past them, each one written after watching a mutation survive.
//
// **1. The criterion's teeth are on the model, and the projection call is on the component.**
// `price-breakdown-model.ts` refuses in both directions, and `price-breakdown-model.test.ts` proves
// both. But the refusal can only compare the `groups` it was handed against the lines it was handed
// — and `CabinetPriceLine` carries `placementId`, `label` **and** `widthMm`, and `priceDesign`
// builds its lines by walking `projectDesignForDisplay` itself. So a component that deleted the
// projection call and rebuilt `DisplayGroup`s out of `pricing.priced.lines` hands the model a group
// list that agrees with those lines *by construction*, never diverges, and renders a plausible
// breakdown. That mutation was written into `price-breakdown.tsx` during this pass and left all 187
// price tests green, and the mobile e2e green with it — its one fabricated heading is the one the
// spec looks for. The first block below is what fails on it: the component's `groups` argument is
// captured as it is handed over, over two designs with different group structures, so no fixed list
// stands in for the projection.
//
// **2. A price line carries a label and a width of its own.** The shipped tests compare the
// rendered words against `projectDesignForDisplay`'s entries, which is right — but the price line
// holds the same two values, so those assertions pass whichever of the two the model read. The
// second block makes the two disagree and requires the entry's to win.
//
// **3. Two examples of a refusal are two points on an edge.** The shipped file refuses an empty
// group list and a line list with no cabinets. The third block walks every single-group,
// single-entry and single-line deletion of the seeded design.
//
// **Not here, deliberately: a sweep of the rendered surface for an equality claim.** The same gap
// was found on this pass — `<p>Total: suma liniilor de mai sus</p>` written into
// `price-breakdown.tsx` passed every `ro.*` sweep, which reads the content module and cannot see
// JSX — and `price-breakdown-copy.test.ts` now closes it on three axes off the one word list in
// `tests/support/ruled-price-copy.ts`. Two guards over one rule is how the weaker one becomes the
// one somebody trusts.
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  priceDesign,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  type CabinetPriceLine,
  type Design,
  type DisplayEntry,
  type DisplayGroup,
  type PriceLine,
  type PricingResult,
} from "@lemnaria/configurator-domain";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ro } from "@/content/ro";
import {
  createConfiguratorStore,
  type ConfiguratorState,
} from "@/store/configurator-store";

import { createFakeBodyProbe } from "../support/fake-body-probe";

/** The store state the component under test reads, swapped between cases — the pattern
 *  `price-wiring.adversarial.test.ts` established, and for its reason: the real component runs
 *  against a real store's real fields rather than against a fixture shaped like one. */
const storeState = vi.hoisted(() => ({ current: undefined as unknown }));

/** Every `groups` argument `describePriceBreakdown` was handed, in call order. Recorded by wrapping
 *  the real function rather than replacing it, so the component still renders what it would ship. */
const handedGroups = vi.hoisted(() => ({
  calls: [] as readonly DisplayGroup[][],
}));

vi.mock("@/store/configurator-store", async (importActual) => {
  const actual =
    await importActual<typeof import("@/store/configurator-store")>();
  return {
    ...actual,
    useConfiguratorStore: (selector: (state: unknown) => unknown) =>
      selector(storeState.current),
  };
});

vi.mock("@/price/price-breakdown-model", async (importActual) => {
  const actual =
    await importActual<typeof import("@/price/price-breakdown-model")>();
  return {
    ...actual,
    describePriceBreakdown: (
      input: Parameters<typeof actual.describePriceBreakdown>[0],
    ) => {
      handedGroups.calls = [...handedGroups.calls, [...input.groups]];
      return actual.describePriceBreakdown(input);
    },
  };
});

const { PriceBreakdown, PriceBreakdownSurface } = await import(
  "@/price/price-breakdown"
);
const { describePriceBreakdown, PriceBreakdownDivergenceError } = await import(
  "@/price/price-breakdown-model"
);
type AvailableBreakdown = Extract<
  ReturnType<typeof describePriceBreakdown>,
  { kind: "available" }
>;

function priceOf(design: Design): PricingResult {
  return priceDesign({
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
  });
}

function groupsOf(design: Design): readonly DisplayGroup[] {
  return projectDesignForDisplay(design, KITCHEN_L_BODY_CATALOG);
}

function stateFor(design: Design): ConfiguratorState {
  return createConfiguratorStore({
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    bodyProbe: createFakeBodyProbe(),
    now: () => "2026-09-03T12:00:00.000Z",
  }).getState();
}

const SHIPPED_PRICING = priceOf(KITCHEN_L_DESIGN);
const SHIPPED_GROUPS = groupsOf(KITCHEN_L_DESIGN);

function cabinetLinesOf(pricing: PricingResult): readonly CabinetPriceLine[] {
  if (!pricing.ok) throw new Error("expected a priced result");
  return pricing.priced.lines.filter(
    (line): line is CabinetPriceLine => line.kind === "cabinet",
  );
}

function withLines(
  pricing: PricingResult,
  lines: readonly PriceLine[],
): PricingResult {
  if (!pricing.ok) throw new Error("expected a priced result to rewrite");
  return { ok: true, priced: { ...pricing.priced, lines } };
}

/** The seeded design reduced to one wall, which projects to a different set of group headings. Not
 *  reachable by a command — built as a document, exactly as `price-breakdown-model.test.ts`'s
 *  overflowing design is — because what is under test is the projection the component reaches, not
 *  the editor that would get you there. */
function wallBOnlyDesign(): Design {
  return {
    ...KITCHEN_L_DESIGN,
    placements: KITCHEN_L_DESIGN.placements.filter(
      (placement) => placement.wall === "B",
    ),
  };
}

/** The groups the component handed the model on its most recent render. */
function groupsHandedWhileRendering(design: Design): readonly DisplayGroup[] {
  handedGroups.calls = [];
  storeState.current = stateFor(design);
  renderToStaticMarkup(createElement(PriceBreakdown));
  const last = handedGroups.calls.at(-1);
  if (!last) throw new Error("the component described no breakdown at all");
  return last;
}

function renderSurface(view: AvailableBreakdown): string {
  return renderToStaticMarkup(
    createElement(PriceBreakdownSurface, {
      id: "breakdown",
      view,
      onClose: () => undefined,
    }),
  );
}

function availableView(
  pricing: PricingResult,
  groups: readonly DisplayGroup[],
): AvailableBreakdown {
  const view = describePriceBreakdown({ pricing, groups });
  if (view.kind !== "available")
    throw new Error("expected the seeded design to price");
  return view;
}

/** The projection's very first entry, which is what the two disagreement cases below rewrite. */
function firstProjectedEntry(): DisplayEntry {
  const entry = SHIPPED_GROUPS[0]?.entries[0];
  if (!entry) throw new Error("the seeded design projects empty");
  return entry;
}

describe("the component's rows come from the projection, not from the lines beside them", () => {
  it("hands the model projectDesignForDisplay's answer verbatim", () => {
    // The assertion a deleted projection call fails. `PriceBreakdown` is rendered — not a
    // hand-written copy of what it composes — so the `groups` captured here is the one the shipped
    // component actually builds.
    expect(groupsHandedWhileRendering(KITCHEN_L_DESIGN)).toEqual(
      SHIPPED_GROUPS,
    );
  });

  it("does the same for a design with a different group structure, so no fixed list stands in", () => {
    // A rebuild from `pricing.priced.lines` can fabricate one plausible heading and pass the case
    // above. It cannot fabricate two different ones, because it never learns which wall or band a
    // body is on.
    const wallB = wallBOnlyDesign();
    const handed = groupsHandedWhileRendering(wallB);

    expect(handed).toEqual(groupsOf(wallB));
    expect(handed.map((group) => `${group.wall}/${group.band}`)).not.toEqual(
      SHIPPED_GROUPS.map((group) => `${group.wall}/${group.band}`),
    );
  });

  it("is asking for something no price line holds: a line names neither a wall nor a band", () => {
    // What makes the two assertions above unforgeable, stated rather than assumed. If a line ever
    // gains a wall or a band, they stop being about the projection and this says so first.
    for (const line of cabinetLinesOf(SHIPPED_PRICING)) {
      expect(Object.keys(line), line.lineId).not.toContain("wall");
      expect(Object.keys(line), line.lineId).not.toContain("band");
    }
  });
});

describe("a line's words are the projection's, and the price line's copy of them is ignored", () => {
  const ONLY_ENTRY = firstProjectedEntry();

  /** One group holding one entry, with its label and width replaced — so the entry and the price
   *  line that matches it disagree about the two values **both** of them carry. */
  function groupsWithOneRelabelledEntry(
    label: string,
    widthMm: number,
  ): readonly DisplayGroup[] {
    const [first] = SHIPPED_GROUPS;
    if (!first) throw new Error("the seeded design projects empty");
    return [{ ...first, entries: [{ ...ONLY_ENTRY, label, widthMm }] }];
  }

  /** The same pricing reduced to that one placement, so the two-way refusal has nothing to complain
   *  about and the words are what is under test. */
  function pricingForOneEntry(): PricingResult {
    return withLines(
      SHIPPED_PRICING,
      cabinetLinesOf(SHIPPED_PRICING).filter(
        (line) => line.placementId === ONLY_ENTRY.placementId,
      ),
    );
  }

  it("prints the entry's label where the price line disagrees", () => {
    // `CabinetPriceLine.label` is `describeBodyLabelAt`'s answer too, so every shipped assertion
    // holds whichever of the two the model read. This one does not.
    const view = availableView(
      pricingForOneEntry(),
      groupsWithOneRelabelledEntry("Corp inventat de proiecție", 600),
    );

    expect(view.groups[0]?.rows[0]?.label).toContain(
      "Corp inventat de proiecție",
    );
  });

  it("prints the entry's width where the price line disagrees", () => {
    // ADR 0033: `describeBodyLabelAt` answers a door count and never a width, so the number on the
    // line is composed at the copy layer from `entry.widthMm`. From the **entry**, not from the
    // line's own `widthMm`, and not re-read off the placement.
    const line = cabinetLinesOf(pricingForOneEntry())[0];
    const view = availableView(
      pricingForOneEntry(),
      groupsWithOneRelabelledEntry("Corp bază", 337),
    );

    expect(view.groups[0]?.rows[0]?.label).toBe("Corp bază 337");
    expect(line?.widthMm).not.toBe(337);
  });

  it("takes no width out of the label itself, so the number on a line has one source", () => {
    // The composer is not a second labelling authority: it appends a width to a label that never
    // contains one. A label that already carried its width would print it twice, and the pin above
    // would still pass.
    for (const group of SHIPPED_GROUPS)
      for (const entry of group.entries)
        expect(entry.label, entry.placementId).not.toContain(
          String(entry.widthMm),
        );
  });
});

describe("the two-way refusal, at every edge and not only at two of them", () => {
  it("refuses for every single group the projection could lose", () => {
    expect(SHIPPED_GROUPS.length).toBeGreaterThan(1);
    for (const [index] of SHIPPED_GROUPS.entries()) {
      const short = SHIPPED_GROUPS.filter((_, other) => other !== index);

      expect(() =>
        describePriceBreakdown({ pricing: SHIPPED_PRICING, groups: short }),
      ).toThrow(PriceBreakdownDivergenceError);
    }
  });

  it("refuses for every single entry a group could lose", () => {
    // The subtler half of the same drift: the list is the right shape, one row short. Nothing about
    // the rendered page would look wrong, and the total underneath would still hold the body.
    for (const [groupIndex, group] of SHIPPED_GROUPS.entries()) {
      for (const [entryIndex] of group.entries.entries()) {
        const short = SHIPPED_GROUPS.map((candidate, index) =>
          index === groupIndex
            ? {
                ...candidate,
                entries: candidate.entries.filter(
                  (_, other) => other !== entryIndex,
                ),
              }
            : candidate,
        );

        expect(() =>
          describePriceBreakdown({ pricing: SHIPPED_PRICING, groups: short }),
        ).toThrow(PriceBreakdownDivergenceError);
      }
    }
  });

  it("refuses for every single cabinet line the pricing could lose", () => {
    const lines = cabinetLinesOf(SHIPPED_PRICING);

    expect(lines.length).toBeGreaterThan(1);
    for (const [index] of lines.entries()) {
      const short = lines.filter((_, other) => other !== index);

      expect(() =>
        describePriceBreakdown({
          pricing: withLines(SHIPPED_PRICING, short),
          groups: SHIPPED_GROUPS,
        }),
      ).toThrow(PriceBreakdownDivergenceError);
    }
  });
});

describe("how many amounts the surface may show, counted against the design", () => {
  /** Every amount the design entitles the surface to, derived from the **projection and the priced
   *  lines** and never from the view under test: one per projected body, one per whole-kitchen line.
   *  The figure is counted separately below, because there is exactly one of it however many rows
   *  there are. */
  function entitledAmountCount(): number {
    return (
      SHIPPED_GROUPS.flatMap((group) => group.entries).length +
      wholeKitchenLineCount()
    );
  }

  function wholeKitchenLineCount(): number {
    if (!SHIPPED_PRICING.ok) throw new Error("expected a priced result");
    return SHIPPED_PRICING.priced.lines.filter(
      (line) => line.kind !== "cabinet",
    ).length;
  }

  function renderedAmountCount(markup: string): number {
    return [...markup.matchAll(/data-testid="breakdown-row-amount"/g)].length;
  }

  function renderedFigureCount(markup: string): number {
    return [...markup.matchAll(/data-testid="price-breakdown-figure"/g)].length;
  }

  it("shows one amount per projected body, one per whole-kitchen line, and one figure", () => {
    // **The expected side is not read off the view.** `price-breakdown-copy.test.ts`'s number-token
    // guard accounts for every number on the page against `view.groups`, `view.wholeKitchenRows` and
    // `view.figure` — which closes a subtotal the *component* composes, and did so under mutation
    // during this pass. It cannot close a subtotal the **model** appends as one more ordinary row:
    // the row lands on both sides of that comparison at once and cancels out. A wordless subtotal
    // row added to `describePriceBreakdown` left all seventeen of that file's tests green.
    //
    // This counts against the projection and the price book instead, so a row nothing in the design
    // entitles the surface to is an extra whichever layer produced it.
    const markup = renderSurface(
      availableView(SHIPPED_PRICING, SHIPPED_GROUPS),
    );

    expect(entitledAmountCount()).toBeGreaterThan(0);
    expect(renderedAmountCount(markup)).toBe(entitledAmountCount());
    expect(renderedFigureCount(markup)).toBe(1);
  });

  it("would catch one more row than the design entitles it to, wordless and correctly formatted", () => {
    // The counterfactual, in the exact shape that walked past the view-derived guard: an unlabelled
    // row carrying the total, which is what a customer reads as the sum of the lines above it.
    const view = availableView(SHIPPED_PRICING, SHIPPED_GROUPS);
    const withSubtotal = {
      ...view,
      wholeKitchenRows: [
        ...view.wholeKitchenRows,
        { key: "subtotal", label: "", amountText: view.figure.amountText },
      ],
    };

    expect(renderedAmountCount(renderSurface(withSubtotal))).not.toBe(
      entitledAmountCount(),
    );
  });
});

describe("what a zero prints, wherever a zero lands", () => {
  /** The seeded pricing with the first cabinet line dropped to nothing. Rounding is upward, so a
   *  placement row reaches zero only by genuinely costing nothing — which is a state the book can
   *  produce and this surface has to have an answer for. */
  function pricingWithAFreeBody(): PricingResult {
    if (!SHIPPED_PRICING.ok) throw new Error("expected a priced result");
    const [first, ...rest] = SHIPPED_PRICING.priced.lines;
    if (!first) throw new Error("the seeded design priced no lines");
    return withLines(SHIPPED_PRICING, [{ ...first, amountMinor: 0 }, ...rest]);
  }

  it("reads inclus for a placement row that prices at zero, not only for a tier", () => {
    // Frame 2E ruled the word for a tier. The rule is applied to whatever row reaches zero, because
    // a `0` beside a body is the same number-that-is-not-a-price on either row.
    const view = availableView(pricingWithAFreeBody(), SHIPPED_GROUPS);

    expect(view.groups[0]?.rows[0]?.amountText).toBe(
      ro.priceBreakdown.included,
    );
  });

  it("prints no bare 0 on any rendered amount, on either kind of row", () => {
    const markup = renderSurface(
      availableView(pricingWithAFreeBody(), SHIPPED_GROUPS),
    );
    const amounts = [
      ...markup.matchAll(
        /data-testid="breakdown-row-amount"[^>]*>(.*?)<\/span>/g,
      ),
    ].map((match) => match[1] ?? "");

    expect(amounts.length).toBeGreaterThan(0);
    for (const amount of amounts) expect(amount).not.toMatch(/^0$/);
  });
});
