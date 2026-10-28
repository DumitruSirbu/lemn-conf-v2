// **A price that moves silently is a defect for the people who most need to be told.** The figure
// changes in direct response to an edit — a width step, a swap, a delete — and until this it was
// announced to nobody.
//
// Scope beyond wave 6C's written criteria, added deliberately: it is far cheaper here than after
// waves 6D and 6G build on this surface, and both totals are already on screen.
//
// Two regions, not one, and the split is the whole design:
//
// - the **figure** is live, so the amount is announced when it moves. The bar is not, because a
//   region wrapping the bar would re-read the flagged-total warning on every width step.
// - the **warning** has a region of its own, mounted whether or not there is anything in it. A
//   region that appears at the same moment its first message does can be announced late or not at
//   all, which is `PanelNoticeRow`'s recorded reason for the same shape — and the warning's arrival
//   is the announcement that matters most, since it says the number now includes cabinets that do
//   not fit.
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  priceDesign,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  type Design,
  type PricingResult,
} from "@lemnaria/configurator-domain";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/use-content", async () => {
  const { ro } = await import("../support/romanian-content");
  return { useContent: () => ro };
});

import { ro } from "../support/romanian-content";
import { EditorPanel } from "@/panel/editor-panel";
import { describePanel, type PanelView } from "@/panel/panel-model";

import { occupiedMeta } from "../support/selection-meta";
import { noWidthIsFree } from "../support/width-options";
import { PAL_KITCHEN } from "../support/panel-material";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows";
import { NOTHING_DISABLED } from "../support/availability";

/** The same two seams `PriceBar` reads, stubbed for the same reason the adversarial suite stubs
 *  them: the flagged state is not reachable from the seeded design. */
const barState = vi.hoisted(() => ({
  pricing: undefined as PricingResult | undefined,
}));

vi.mock("@/price/use-priced-design", () => ({
  usePricedDesign: () => barState.pricing,
}));

vi.mock("@/store/configurator-store", async (importActual) => {
  const actual =
    await importActual<typeof import("@/store/configurator-store")>();
  return {
    ...actual,
    useConfiguratorStore: (selector: (state: unknown) => unknown) =>
      selector({ lastRejection: null, deselect: () => undefined }),
  };
});

const { PriceBar } = await import("@/price/price-bar");
const { FlaggedTotalWarning } = await import("@/price/flagged-total-warning");

function priceOf(design: Design): PricingResult {
  return priceDesign({
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
  });
}

/** The seeded design with one body pushed past the end of wall A, so the total is flagged. */
function overflowingDesign(): Design {
  const [first, ...rest] = KITCHEN_L_DESIGN.placements;
  if (!first) throw new Error("the seeded design has no placements");
  return {
    ...KITCHEN_L_DESIGN,
    placements: [
      { ...first, wall: "A", alongMm: KITCHEN_L_DESIGN.room.widthMm + 500 },
      ...rest,
    ],
  };
}

function barMarkup(pricing: PricingResult): string {
  barState.pricing = pricing;
  return renderToStaticMarkup(createElement(PriceBar));
}

/** The flagged total's own surface since ADR 0104 decision 8b: the owner ruled the sentence out of
 *  the top bar and onto the scene. **The region moved; the announcement did not**, which is what the
 *  cases below are about — so they follow it here rather than being deleted with the bar's copy. */
function flaggedTotalMarkup(pricing: PricingResult): string {
  barState.pricing = pricing;
  return renderToStaticMarkup(createElement(FlaggedTotalWarning));
}

function panelMarkup(pricing: PricingResult): string {
  const meta = occupiedMeta();
  const view: PanelView = describePanel({
    content: ro,
    material: PAL_KITCHEN,
    meta,
    offers: [],
    rejection: null,
    widthOptions: noWidthIsFree(meta.widthMm, meta.sizesMm),
    buildableWidthSpanMm: undefined,
    isBodyProbeAttached: true,
    canWrite: true,
    saveStatus: "idle",
    pricing,
  });
  return renderToStaticMarkup(createElement(EditorPanel, { view }));
}

/** How many times an attribute appears, which is how "the figure is live and the bar is not" is
 *  said without depending on the shape of the markup around it. */
function countOf(markup: string, attribute: string): number {
  return markup.split(attribute).length - 1;
}

beforeEach(() => {
  barState.pricing = undefined;
});

/** The live region's own markup, found by its testid — the panel carries a second `role="status"`
 *  (§9's notice), so matching on the role alone would read the wrong element. */
function flagRegionOf(markup: string, testId: string): string {
  const region = new RegExp(
    `<div[^>]*data-testid="${testId}"[^>]*>(.*?)</div>`,
    "s",
  ).exec(markup);
  if (!region) throw new Error(`no live region with data-testid="${testId}"`);
  return region[1] ?? "";
}

describe.each([
  ["the price bar", barMarkup],
  ["§9's footer", panelMarkup],
])("%s announces its total politely", (_surface, render) => {
  it("makes the figure a live region, and exactly one of them", () => {
    const markup = render(priceOf(KITCHEN_L_DESIGN));

    expect(markup).toContain('aria-live="polite"');
    expect(countOf(markup, 'aria-live="polite"')).toBe(1);
  });

  it("never interrupts — no assertive region and no alert anywhere", () => {
    // A price update is not an emergency. `assertive` would cut across whatever the customer is
    // being read at the moment they press a width chip.
    const markup = render(priceOf(overflowingDesign()));

    expect(markup).not.toContain("assertive");
    expect(markup).not.toContain('role="alert"');
  });

  it("leaves the warning out of the figure's own region, so a width step does not re-read it", () => {
    const markup = render(priceOf(overflowingDesign()));
    const figure =
      /aria-live="polite"[^>]*>(.*?)<\/p>/s.exec(markup)?.[1] ?? "";

    expect(figure).toContain("MDL");
    expect(figure).not.toContain(ro.price.overflowingTotalWarning);
  });
});

/** **The surface the flagged sentence is on since ADR 0104 decision 8b**, and §9's footer, which did
 *  not move. The bar is no longer one of them: the owner ruled the sentence out of the top bar, so
 *  the assertion that it is *not* there is what the bar owes now — see below. */
describe.each([
  ["the scene's flagged total", flaggedTotalMarkup, "price-bar-flag-region"],
  ["§9's footer", panelMarkup, "panel-price-flag-region"],
])("%s carries the flag's own region", (_surface, render, regionTestId) => {
  it("keeps the warning's region mounted while there is nothing to say", () => {
    // The region has to be in the accessibility tree *before* the warning arrives, or its arrival —
    // the announcement that matters — can be missed entirely.
    const markup = render(priceOf(KITCHEN_L_DESIGN));

    expect(flagRegionOf(markup, regionTestId)).toBe("");
    expect(markup).not.toContain(ro.price.overflowingTotalWarning);
  });

  it("puts the warning inside that region when the total is flagged", () => {
    const markup = render(priceOf(overflowingDesign()));

    expect(flagRegionOf(markup, regionTestId)).toContain(
      ro.price.overflowingTotalWarning,
    );
  });

  it("never interrupts — no assertive region and no alert anywhere", () => {
    const markup = render(priceOf(overflowingDesign()));

    expect(markup).not.toContain("assertive");
    expect(markup).not.toContain('role="alert"');
  });
});

describe("the price bar, after the sentence left it", () => {
  it("draws no flagged-total sentence and reserves no region for one", () => {
    // ADR 0104 decision 8b, owner 2026-09-09. The point of the move is that the top bar keeps frame
    // D2A's shape on a flagged design as well as a seeded one, and the bar carrying neither the
    // sentence nor an empty region for it is what makes that true rather than nearly true.
    const markup = barMarkup(priceOf(overflowingDesign()));

    expect(markup).not.toContain(ro.price.overflowingTotalWarning);
    expect(markup).not.toContain('data-testid="price-bar-flag-region"');
  });

  it("still shows the total it would have flagged", () => {
    // Non-vacuity for the case above: the bar renders, and what is absent is the sentence rather
    // than the surface.
    expect(barMarkup(priceOf(overflowingDesign()))).toContain("MDL");
  });
});
