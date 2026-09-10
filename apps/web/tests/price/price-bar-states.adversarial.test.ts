// Adversarial QA for wave 6C's three states, attacked where the shipped suite asserts on a value:
// on the **rendered markup**, and through the **real store's real refusals** rather than through one
// hand-built `RejectionReason`.
//
// Three things the model-level tests cannot say:
//
// - *"A refused edit leaves the figure byte-identical"* is a claim about every refusal the
//   application can produce, not about the one fixture. The first block drives every command the
//   store publishes across every seeded body and asserts the document — and therefore the figure —
//   is unchanged after each refusal.
// - *"A pricing failure renders no figure"* is a claim about what is **absent from the page**. A
//   value assertion cannot see a zero rendered beside the model, so the second block asserts the
//   whole markup string.
// - *"The flag is not the rejection banner"* (ADR 0065 decision 8) is a claim about two surfaces at
//   once, so the third block renders both and checks neither carries the other's sentence.
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
import { describePriceBar, type PricedBar } from "@/price/price-bar-model";
import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";
import { occupiedMeta } from "../support/selection-meta";
import { noWidthIsFree } from "../support/width-options";
import { PAL_KITCHEN } from "../support/panel-material";

/** The store's pricing seam and its store, both stubbed, so the bar can be rendered in a state the
 *  seeded design cannot reach — a failed query — and in one it can. `PriceBar` reads exactly these
 *  two hooks, and stubbing them is what makes the markup assertions below about the component's own
 *  decision rather than about the store's initial state. (React's server renderer takes zustand's
 *  `getInitialState` as its snapshot, so a `setState` before rendering would not be seen.) */
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

/** **What the seeded kitchen's total renders as, derived rather than typed.** Since wave 6T-a the
 *  figure contains a drafted push-to-open rate with no supplier source (ADR 0092 Amendment C), and
 *  this file's subject is *which* figure a bar shows and when — never what a kitchen costs, which
 *  `starting-price.adversarial.test.ts` owns and reconciles. */
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

/** The flagged total's surface since ADR 0104 decision 8b: the owner ruled the sentence out of the
 *  top bar and onto the scene. It renders the **same model** the bar does, so what these assertions
 *  are about — decisions 6 and 8 — is unchanged; only the surface moved. */
function flaggedTotalMarkup(
  pricing: PricingResult,
  rejection: RejectionReason | null = null,
): string {
  barState.pricing = pricing;
  barState.rejection = rejection;
  return renderToStaticMarkup(createElement(FlaggedTotalWarning));
}

/** The visible text of one element of the rendered markup, by its testid — the element's whole
 *  subtree, because §9's banner wraps its sentence beside a decorative `!` span and a first-text-node
 *  reading would see an empty string and pass every negative assertion below.
 *
 *  **Throws when the element is absent**, which is the point: an element-scoped negative is
 *  satisfied by an element that is not there, so a renamed or deleted testid must fail loudly rather
 *  than quietly turn two real checks into vacuous ones. */
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
      // Decorative content is not the sentence: §9's banner carries an `aria-hidden` `!` glyph, and
      // leaving it in would make "the banner says exactly the refusal" impossible to state.
      .replace(/<(\w+)[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/\1>/g, "")
      .replace(/<[^>]*>/g, "")
      .trim()
  );
}

const PAST_THE_WALL_END_MM = 500;

/** **The moved body holds no sink**, which is wave 6T2's constraint on this fixture: wall A's first
 *  placement is the sink, and pushing it past the wall's end takes it out from under the wall
 *  cabinet its drying rack hangs in — so the total would legitimately fall and this block, which
 *  asserts the total is never reduced, would fail for the wrong reason. */
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

// ---------------------------------------------------------------------------------------------
// A refused edit, through every refusal the application can actually produce.
// ---------------------------------------------------------------------------------------------

describe("no refusal the store can produce moves the figure", () => {
  /** Every command §9 publishes, called with an argument chosen to be refused as often as it is
   *  accepted — the point is to sweep both outcomes and assert only about the refusals. */
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

  /** **The figure, whatever the store's last refusal was** — which is now a fact about the document
   *  alone: the model takes no refusal since the owner removed the *"neschimbat"* label, so the
   *  sweep below asserts the stronger thing it was always reaching for. */
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

    // The sweep is only worth anything if it produced refusals of several kinds — a run in which
    // every command happened to succeed would assert nothing at all.
    expect(refusals).toBeGreaterThan(100);
    expect(refusalCodes.size).toBeGreaterThanOrEqual(4);
  });

  it("shows the same figure it showed before, and says nothing about the refusal", () => {
    // **The relabelling this replaces is withdrawn** (owner, 2026-09-09): the bar used to call the
    // figure *"De la neschimbat"* while a refusal stood. What the sweep above is really about
    // survives whole and is what is asserted — a refusal moves no figure — and the bar now says
    // nothing about the refusal at all, which §9's banner does say.
    const quiet = describePriceBar({
      pricing: priceOf(KITCHEN_L_DESIGN),
      content: ro,
    });
    if (quiet.kind !== "priced") throw new Error("expected a priced bar");

    expect(quiet.figure.label).toBe(ro.price.startingPrefix);
    expect(quiet.figure.label).not.toContain("neschimbat");
  });
});

// ---------------------------------------------------------------------------------------------
// A pricing failure, asserted on the page rather than on the value.
// ---------------------------------------------------------------------------------------------

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
    // The criterion names three specific wrong answers — a zero, a stale figure, a dash that reads
    // as free — and the whole markup is what rules all three out at once.
    const markup = barMarkup(failed);

    expect(markup).not.toMatch(/\d/);
    expect(markup).not.toContain("MDL");
    expect(markup).not.toMatch(/[-–—]/);
    expect(markup).not.toContain(ro.price.startingPrefix);
    expect(markup).not.toContain("price-bar");
  });

  it("does not paint a figure that a stale query would have left behind", () => {
    // The sequence a memo or a piece of retained state would get wrong: a good price, then a failed
    // one. The second render must not inherit the first.
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
    // Including the flag: a failed query has no `priced`, so there is no `totalIsFlagged` to read
    // and nothing to warn about. A footer that warned without a figure would be the same invention
    // as one that showed a zero.
    expect(markup).not.toContain('data-testid="panel-price-overflow"');
    expect(markup).not.toContain(ro.price.overflowingTotalWarning);
  });
});

// ---------------------------------------------------------------------------------------------
// An overflowing design: shown, flagged, and never wearing the rejection banner's clothes.
// ---------------------------------------------------------------------------------------------

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
    // **Together on the screen, no longer inside one element** (ADR 0104 decision 8b): the figure is
    // in the bar and the sentence is on the scene, both rendered from the same model. Decision 6 —
    // the flag travels with the total wherever a total is shown — is what is asserted, and it is
    // satisfied by the pair rather than by the bar alone.
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
    // ADR 0065 decision 8, on both surfaces at once. Each renders its own sentence and neither
    // renders the other's, which is what stops the two from reading as a contradiction.
    //
    // **Scoped to the two elements, not to the whole panel — and the earlier panel-wide form was
    // wrong.** It read `expect(panel).not.toContain(overflowingTotalWarning)`, which passed only
    // while §9's footer had no flag at all. That absence *was* the defect this file reports, so the
    // assertion could not tell the fix from the bug, and it made decision 6 — the flag travels with
    // the total wherever a total is shown — unsatisfiable alongside decision 8. What decision 8
    // actually forbids is the two sentences sharing a *surface*: the banner must carry the refusal
    // and only the refusal, the flag must carry the warning and only the warning. That is what is
    // asserted below, element by element.
    //
    // Each negative is paired with the positive for the same element, and `textOfElement` throws on
    // a missing testid, so a renamed or deleted element fails loudly rather than satisfying both
    // negatives by rendering nothing.
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

    // The bar is a whole separate surface from §9, so its negative stays panel-wide: a refusal has
    // no business appearing anywhere on it. The flag's own sentence is on the scene since ADR 0104
    // decision 8b, and it too carries the warning and only the warning.
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

    // The reader itself, so the two negatives above cannot be satisfied by an element that stopped
    // existing: a testid that is not on the page raises rather than returning an empty string.
    expect(() => textOfElement(panel, "panel-price-overflow-renamed")).toThrow(
      /no element with data-testid/,
    );
  });

  it("flags the total and says nothing about any refusal, which is now the only pairing", () => {
    // ADR 0065 decision 8 holds with one statement fewer: the flag is about what the number
    // contains, and the refusal's own sentence is §9's banner rather than a second label here.
    const bar = describePriceBar({
      content: ro,
      pricing: priceOf(overflowing),
    }) as PricedBar;

    expect(bar.figure.label).toBe(ro.price.startingPrefix);
    expect(bar.overflowWarning).toBe(ro.price.overflowingTotalWarning);
    expect(bar.overflowWarning).not.toContain("neschimbat");
  });
});

// ---------------------------------------------------------------------------------------------
// REGRESSION — the mobile shell used to show an overflowing total with no flag anywhere on screen.
// Found by this suite, ruled and fixed 2026-09-03; these are what stop it coming back.
// ---------------------------------------------------------------------------------------------

describe("the flagged total on the mobile shell, while §9's sheet is open", () => {
  const overflowing = overflowingDesign();

  it("is a real occlusion, not a hypothetical: the sheet's box contains the bar's", () => {
    // Read from the two stylesheets rather than asserted by eye. `.screen` is the positioning
    // context (`configure.module.css`, changed by this wave for exactly this reason), and §9's shell
    // is `position: absolute; bottom: 0; height: 78dvh; z-index: 4` inside it. At 390 × 844 the
    // sheet spans 186–844 px and the bar's reserved band spans 752–844 px, wholly inside it, under a
    // lower stacking order.
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

    const viewportHeightPx = 844;
    const sheetTopPx = viewportHeightPx - 0.78 * viewportHeightPx;
    const barTopPx = viewportHeightPx - 92;
    expect(sheetTopPx).toBeLessThan(barTopPx);
  });

  it("carries the flag on the only total the customer can see", () => {
    // ADR 0065 decision 6: *"the total carries the same warning the scene does"*, and wave 6C's
    // criterion: an overflowing design shows its total **flagged**, never suppressed.
    //
    // **What was wrong.** §9's sheet covers the price bar completely, so the bar's flag is off
    // screen exactly while a customer is fixing the overflow — the width chips that fix it are in
    // this sheet. The only visible total was §9 item 7's footer figure, and `describeFooterPrice`
    // built a `PriceFigure` and dropped `priced.totalIsFlagged` on the floor, so the total silently
    // included cabinets that do not fit.
    //
    // **What the fix is.** `describeFlaggedTotalWarning` in `price/starting-price.ts`, called by
    // both `describePriceBar` and `describeFooter`. The sentence is unshortened on both surfaces —
    // it wraps rather than truncating, so no compact form had to be invented and no unruled copy was
    // written. The sheet's positioning is untouched.
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
    // The property that makes the fix structural rather than a second copy of the rule. Both models
    // are driven from one priced result and must agree about the flag — in both directions, so a
    // surface that flagged everything would fail here too.
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
