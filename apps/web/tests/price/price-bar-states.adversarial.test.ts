import {
  buildKitchenLBodyCatalog,
  findOverflowingPlacementIds,
  declaresASink,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  priceDesign,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  entryLabel,
  kindLabel,
  type Design,
  type PricingResult,
  type RejectionReason,
} from "@lemnaria/configurator-domain";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/use-content", async () => {
  const { ro } = await import("../support/romanian-content");
  return { useContent: () => ro };
});

import { ro } from "../support/romanian-content";
import { EditorPanel } from "@/panel/editor-panel";
import { describePanel, type PanelView } from "@/panel/panel-model";
import { PRICE_BAR_RESERVED_HEIGHT_PX } from "@/price/price-bar-layout";
import { describePriceBar } from "@/price/price-bar-model";
import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";
import { occupiedMeta } from "../support/selection-meta";
import { noWidthIsFree } from "../support/width-options";
import { PAL_KITCHEN } from "../support/panel-material";

/** Stubs the pricing seam and the store so the bar renders in a state the seeded design cannot reach (a failed
 *  query). React's server renderer takes zustand's `getInitialState` as its snapshot, so a `setState` before
 *  rendering would not be seen. */
const barState = vi.hoisted(() => ({
  pricing: undefined as PricingResult | undefined,
  rejection: null as RejectionReason | null,
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
      selector({
        lastRejection: barState.rejection,
        deselect: () => undefined,
      }),
  };
});

const { PriceBar } = await import("@/price/price-bar");
const { FlaggedTotalWarning } = await import("@/price/flagged-total-warning");

/** The seeded total, derived rather than typed: it contains a drafted push-to-open rate with no supplier source
 *  (ADR 0092 Amendment C). What a kitchen costs is `starting-price.adversarial.test.ts`'s subject, not this file's. */
function seededTotalText(): string {
  const bar = describePriceBar({
    content: ro,
    pricing: priceOf(KITCHEN_L_DESIGN),
  });
  if (bar.kind !== "priced") throw new Error("the seeded design did not price");
  return bar.figure.amountText;
}

function priceOf(design: Design): PricingResult {
  return priceDesign({
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
  });
}

function barMarkup(
  pricing: PricingResult,
  rejection: RejectionReason | null = null,
): string {
  barState.pricing = pricing;
  barState.rejection = rejection;
  return renderToStaticMarkup(createElement(PriceBar));
}

/** The flagged total's surface (ADR 0104 decision 8b): the sentence is on the scene, rendered from the same model
 *  as the bar. */
function flaggedTotalMarkup(
  pricing: PricingResult,
  rejection: RejectionReason | null = null,
): string {
  barState.pricing = pricing;
  barState.rejection = rejection;
  return renderToStaticMarkup(createElement(FlaggedTotalWarning));
}

/** The visible text of one element by testid, over its whole subtree (§9's banner wraps its sentence beside a
 *  decorative `!` span). Throws when the element is absent: an element-scoped negative is satisfied by an element
 *  that is not there. */
function textOfElement(markup: string, testId: string): string {
  const opening = new RegExp(`<(\\w+)[^>]*data-testid="${testId}"[^>]*>`).exec(
    markup,
  );
  if (!opening)
    throw new Error(`no element with data-testid="${testId}" was rendered`);

  const tag = opening[1] ?? "";
  const from = opening.index + opening[0].length;
  const boundaries = new RegExp(`<(/?)${tag}[\\s>]`, "g");
  boundaries.lastIndex = from;

  let depth = 1;
  let boundary = boundaries.exec(markup);
  while (boundary && depth > 0) {
    depth += boundary[1] === "/" ? -1 : 1;
    if (depth === 0) break;
    boundary = boundaries.exec(markup);
  }
  if (!boundary)
    throw new Error(`the <${tag}> carrying "${testId}" is never closed`);

  return (
    markup
      .slice(from, boundary.index)
      // Decorative content is not the sentence: the banner's `aria-hidden` `!` glyph would defeat an exact match.
      .replace(/<(\w+)[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/\1>/g, "")
      .replace(/<[^>]*>/g, "")
      .trim()
  );
}

const PAST_THE_WALL_END_MM = 500;

/** The moved body holds no sink: moving wall A's sink would drop the wall cabinet its drying rack hangs in, and the
 *  total would legitimately fall. */
function overflowingDesign(): Design {
  const onWallA = KITCHEN_L_DESIGN.placements.find(
    (placement) =>
      placement.wall === "A" &&
      !declaresASink(KITCHEN_L_BODY_CATALOG.get(placement.body.buildId)),
  );
  if (!onWallA) throw new Error("the seeded design has no wall A placement");
  return {
    ...KITCHEN_L_DESIGN,
    placements: KITCHEN_L_DESIGN.placements.map((placement) =>
      placement.id === onWallA.id
        ? {
            ...placement,
            alongMm: KITCHEN_L_DESIGN.room.widthMm + PAST_THE_WALL_END_MM,
          }
        : placement,
    ),
  };
}

describe("no refusal the store can produce moves the figure", () => {
  /** Every command §9 publishes, with arguments refused as often as accepted; only the refusals are asserted. */
  const ATTEMPTS: readonly {
    readonly name: string;
    readonly run: (store: ReturnType<typeof createConfiguratorStore>) => void;
  }[] = [
    ...[0, 1, 50, 250, 349, 350, 351, 999, 1_000, 1_001, 100_000, -400].map(
      (widthMm) => ({
        name: `setWidth(${String(widthMm)})`,
        run: (store: ReturnType<typeof createConfiguratorStore>) => {
          store.getState().setWidth(widthMm);
        },
      }),
    ),
    {
      name: "insert(unknown build)",
      run: (store) => {
        store.getState().insert("no-such-build");
      },
    },
    {
      name: "setFinish(unavailable)",
      run: (store) => {
        store.getState().setFinish("no-such-finish" as never);
      },
    },
    {
      name: "setHandle(unavailable)",
      run: (store) => {
        store.getState().setHandle("no-such-handle" as never);
      },
    },
    {
      name: "remove",
      run: (store) => {
        store.getState().remove();
      },
    },
  ];

  function freshStore() {
    return createConfiguratorStore({
      design: KITCHEN_L_DESIGN,
      catalogAt: buildKitchenLBodyCatalog,
      probeAt: createFakeProbeFactory(),
      now: () => "2026-09-03T12:00:00.000Z",
    });
  }

  /** The figure is a fact about the document alone: the bar's model takes no refusal. */
  function figureOf(design: Design): string {
    const view = describePriceBar({ pricing: priceOf(design), content: ro });
    if (view.kind !== "priced") throw new Error("expected a priced bar");
    return view.figure.amountText;
  }

  it("leaves the document, and therefore the figure, byte-identical after every refusal", () => {
    const store = freshStore();
    const refusalCodes = new Set<string>();
    let refusals = 0;

    for (const placement of KITCHEN_L_DESIGN.placements) {
      for (const attempt of ATTEMPTS) {
        // `select` clears the previous refusal, so a rejection read after the call belongs to it.
        store.getState().select({ kind: "placement", id: placement.id });
        const documentBefore = JSON.stringify(store.getState().design);
        const figureBefore = figureOf(store.getState().design);

        attempt.run(store);

        const rejection = store.getState().lastRejection;
        if (!rejection) continue;
        refusals += 1;
        refusalCodes.add(rejection.code);

        const where = `${attempt.name} on ${placement.id} (${rejection.code})`;
        expect(JSON.stringify(store.getState().design), where).toBe(
          documentBefore,
        );
        expect(figureOf(store.getState().design), where).toBe(figureBefore);
      }
    }

    // A run in which every command succeeded would assert nothing, so the sweep must produce several refusal kinds.
    expect(refusals).toBeGreaterThan(100);
    expect(refusalCodes.size).toBeGreaterThanOrEqual(4);
  });

  it("shows the same figure it showed before, and says nothing about the refusal", () => {
    // A standing refusal changes neither the bar's figure nor its label; §9's banner is what says the refusal.
    const quiet = describePriceBar({
      pricing: priceOf(KITCHEN_L_DESIGN),
      content: ro,
    });
    if (quiet.kind !== "priced") throw new Error("expected a priced bar");

    expect(quiet.figure.label).toBe(ro.price.startingPrefix);
    expect(quiet.figure.label).not.toContain("neschimbat");
  });
});

describe("a pricing failure puts nothing on the page", () => {
  const failed = priceDesign({
    design: KITCHEN_L_DESIGN,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: `${SAMPLE_PRICE_BOOK_VERSION}-not-this-one`,
  });

  it("renders the empty string — not an empty bar, not a hidden one", () => {
    expect(failed.ok).toBe(false);
    expect(barMarkup(failed)).toBe("");
  });

  it("renders the empty string with a refusal standing as well", () => {
    expect(
      barMarkup(failed, {
        code: "NOT_DELETABLE",
        params: { label: kindLabel("corner_wall_return") },
      }),
    ).toBe("");
  });

  it("puts no digit, no currency and no dash anywhere in the output", () => {
    // Rules out a zero, a stale figure and a dash that reads as free, all at once.
    const markup = barMarkup(failed);

    expect(markup).not.toMatch(/\d/);
    expect(markup).not.toContain("MDL");
    expect(markup).not.toMatch(/[-–—]/);
    expect(markup).not.toContain(ro.price.startingPrefix);
    expect(markup).not.toContain("price-bar");
  });

  it("does not paint a figure that a stale query would have left behind", () => {
    // A good price then a failed one: a memo or retained state would let the second inherit the first.
    expect(barMarkup(priceOf(KITCHEN_L_DESIGN))).toContain("MDL");
    expect(barMarkup(failed)).toBe("");
  });

  it("renders a real figure when the query succeeds, so the emptiness above is not the default", () => {
    const markup = barMarkup(priceOf(KITCHEN_L_DESIGN));

    expect(markup).toContain('data-testid="price-bar"');
    expect(markup).toContain("De la");
    expect(markup).toContain(seededTotalText());
  });

  it("also renders nothing in §9's footer, and nothing that reads as free", () => {
    const footer = openPanelFor({ pricing: failed }).footer;

    expect(footer.price).toBeUndefined();
    const markup = renderToStaticMarkup(
      createElement(EditorPanel, { view: openPanelFor({ pricing: failed }) }),
    );
    expect(markup).not.toContain("MDL");
    expect(markup).not.toContain('data-testid="panel-price"');
    // A failed query has no `priced`, so no `totalIsFlagged`: a footer warning without a figure would be as invented
    // as a zero.
    expect(markup).not.toContain('data-testid="panel-price-overflow"');
    expect(markup).not.toContain(ro.price.overflowingTotalWarning);
  });
});

function openPanelFor(
  overrides: Partial<Parameters<typeof describePanel>[0]> = {},
): Extract<PanelView, { kind: "open" }> {
  const meta = occupiedMeta();
  const panel = describePanel({
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
    ...overrides,
  });
  if (panel.kind !== "open") throw new Error("expected an open panel");
  return panel;
}

describe("an overflowing design, on the page", () => {
  const overflowing = overflowingDesign();

  it("is the fixture this block claims", () => {
    expect(findOverflowingPlacementIds(overflowing).length).toBe(1);
  });

  it("shows the total and the flag together, and shows the same total as a design that fits", () => {
    // The flag travels with the total (ADR 0065 decision 6): the figure is in the bar and the sentence on the scene.
    const markup = barMarkup(priceOf(overflowing));
    const flag = flaggedTotalMarkup(priceOf(overflowing));

    expect(markup).toContain(seededTotalText());
    expect(flag).toContain(ro.price.overflowingTotalWarning);
    // The bar keeps frame D2A's shape on a flagged design, which is the point of the move.
    expect(markup).not.toContain(ro.price.overflowingTotalWarning);
    // Never reduced: the same figure the fitting design shows, because the body that does not fit is
    // still in the total.
    expect(markup).toContain(
      /[\d ]+ MDL/.exec(barMarkup(priceOf(KITCHEN_L_DESIGN)))?.[0] ??
        "no figure",
    );
  });

  it("never suppresses the figure in favour of the warning", () => {
    const markup = barMarkup(priceOf(overflowing));
    const figure = /data-testid="price-bar-total">([^<]*)</.exec(markup);

    expect(figure?.[1]).toMatch(/^[\d ]+ MDL$/);
  });

  it("keeps the flag off §9's rejection banner and the refusal off the bar", () => {
    // ADR 0065 decision 8: each surface renders its own sentence and neither the other's. Scoped to the two
    // elements, not the whole panel: a panel-wide negative passed only while the footer had no flag, so it could not
    // tell the fix from the bug. `textOfElement` throws on a missing testid, so no negative passes on nothing.
    const refusal: RejectionReason = {
      code: "WIDTH_NOT_SUPPORTED",
      params: {
        sizesMm: [400, 600, 800],
        availableMm: 800,
        label: entryLabel("base-cabinet"),
      },
    };
    const refusalMessage = ro.rejection(refusal);
    const bar = barMarkup(priceOf(overflowing), refusal);
    const panel = renderToStaticMarkup(
      createElement(EditorPanel, {
        view: openPanelFor({
          rejection: refusal,
          pricing: priceOf(overflowing),
        }),
      }),
    );

    // The bar is a separate surface, so its negative stays panel-wide; the scene flag carries only the warning.
    const sceneFlag = flaggedTotalMarkup(priceOf(overflowing), refusal);

    expect(sceneFlag).toContain(ro.price.overflowingTotalWarning);
    expect(sceneFlag).not.toContain(ro.rejection(refusal));
    expect(bar).not.toContain(ro.rejection(refusal));

    const banner = textOfElement(panel, "panel-rejection");
    const flag = textOfElement(panel, "panel-price-overflow");

    expect(banner).toBe(refusalMessage);
    expect(banner).not.toContain(ro.price.overflowingTotalWarning);
    expect(flag).toBe(ro.price.overflowingTotalWarning);
    expect(flag).not.toContain(refusalMessage);

    // So the negatives above cannot be satisfied by an element that stopped existing.
    expect(() => textOfElement(panel, "panel-price-overflow-renamed")).toThrow(
      /no element with data-testid/,
    );
  });
});

describe("the bar's reserved height reaches the stylesheet from one constant", () => {
  // The stylesheet reads `--price-bar-height` as the bar's floor, so the property has to be on the rendered bar
  // and has to carry the constant the 390 × 844 gate is asserted against. Read from the markup, on a priced
  // kitchen and on an empty one, which draws a prompt in the same reserved band.
  const KITCHENS_THE_BAR_IS_DRAWN_FOR: readonly (readonly [string, Design])[] =
    [
      ["a priced kitchen", KITCHEN_L_DESIGN],
      ["an empty kitchen", { ...KITCHEN_L_DESIGN, placements: [] }],
    ];

  it.each(KITCHENS_THE_BAR_IS_DRAWN_FOR)(
    "publishes the reserved height on the bar it renders, for %s",
    (_name, design) => {
      const markup = barMarkup(priceOf(design));

      expect(PRICE_BAR_RESERVED_HEIGHT_PX).toBeGreaterThan(0);
      expect(markup).toContain(
        `style="--price-bar-height:${String(PRICE_BAR_RESERVED_HEIGHT_PX)}px"`,
      );
    },
  );
});

/** §10.1's phone gate, 390 × 844. */
const GATE_VIEWPORT_HEIGHT_PX = 844;

describe("the flagged total on the mobile shell, while §9's sheet is open", () => {
  const overflowing = overflowingDesign();

  it("is a real occlusion, not a hypothetical: the sheet's box contains the bar's", () => {
    // Read from the two stylesheets: `.screen` is the positioning context and the sheet is `position: absolute;
    // bottom: 0; height: 78dvh; z-index: 4` inside it, so at 390 × 844 it spans 186–844 px over the bar's 752–844.
    const screen = readFileSync(
      resolve(
        import.meta.dirname,
        "../../src/app/configurator/configure/configure.module.css",
      ),
      "utf8",
    );
    const panel = readFileSync(
      resolve(import.meta.dirname, "../../src/panel/editor-panel.module.css"),
      "utf8",
    );

    expect(screen).toMatch(/\.screen \{[^}]*position: relative;/s);
    expect(panel).toMatch(/\.shell \{[^}]*position: absolute;/s);
    expect(panel).toMatch(/\.shell \{[^}]*bottom: 0;/s);
    expect(panel).toMatch(/\.shell \{[^}]*height: 78dvh;/s);
    expect(panel).toMatch(/\.shell \{[^}]*z-index: 4;/s);

    // The bar's height is the constant the layout reserves and the sheet's is the stylesheet's own figure. Written
    // here as `92` and `0.78`, the comparison held whatever either of them became.
    const sheetHeightDvh = Number(
      /\.shell \{[^}]*height: (\d+)dvh;/s.exec(panel)?.[1],
    );
    const sheetTopPx = GATE_VIEWPORT_HEIGHT_PX * (1 - sheetHeightDvh / 100);
    const barTopPx = GATE_VIEWPORT_HEIGHT_PX - PRICE_BAR_RESERVED_HEIGHT_PX;

    expect(sheetHeightDvh).toBeGreaterThan(0);
    expect(PRICE_BAR_RESERVED_HEIGHT_PX).toBeGreaterThan(0);
    expect(sheetTopPx).toBeLessThan(barTopPx);
  });

  it("carries the flag on the only total the customer can see", () => {
    // §9's sheet covers the price bar completely, so the footer figure is the only visible total while a customer
    // fixes the overflow; `describeFlaggedTotalWarning` (`price/starting-price.ts`) serves both surfaces
    // (ADR 0065 decision 6).
    const footer = openPanelFor({ pricing: priceOf(overflowing) }).footer;
    const markup = renderToStaticMarkup(
      createElement(EditorPanel, {
        view: openPanelFor({ pricing: priceOf(overflowing) }),
      }),
    );

    expect(footer.price?.amountText).toBe(seededTotalText());
    expect(footer.overflowWarning).toBe(ro.price.overflowingTotalWarning);
    expect(textOfElement(markup, "panel-price-overflow")).toBe(
      ro.price.overflowingTotalWarning,
    );
  });

  it("asks one question for both surfaces, so neither can show a total and forget the flag", () => {
    // Both models are driven from one priced result and must agree about the flag in both directions, so a surface
    // that flagged everything fails too.
    for (const design of [KITCHEN_L_DESIGN, overflowing]) {
      const priced = priceOf(design);
      if (!priced.ok) throw new Error("expected a priced design");

      const bar = describePriceBar({ pricing: priced, content: ro });
      const footer = openPanelFor({ pricing: priced }).footer;
      if (bar.kind !== "priced") throw new Error("expected a priced bar");

      expect(
        bar.overflowWarning,
        design === overflowing ? "overflowing" : "fitting",
      ).toBe(footer.overflowWarning);
      expect(bar.overflowWarning !== undefined).toBe(
        priced.priced.totalIsFlagged,
      );
    }
  });

  it("shows no flag on a design that fits, on either surface", () => {
    const priced = priceOf(KITCHEN_L_DESIGN);
    const markup = renderToStaticMarkup(
      createElement(EditorPanel, { view: openPanelFor({ pricing: priced }) }),
    );

    expect(
      openPanelFor({ pricing: priced }).footer.overflowWarning,
    ).toBeUndefined();
    expect(markup).not.toContain('data-testid="panel-price-overflow"');
    expect(barMarkup(priced)).not.toContain('data-testid="price-bar-overflow"');
  });
});
