// **ADR 0099 decision 8: the way back out of an override**, which that record makes part of the
// decision rather than UI polish.
//
// The failure it exists to prevent is stated there and is what these tests are written against:
// without a control that *un*-chooses, the first tap on any swatch pins that cabinet out of the
// kitchen's colour for ever, and the precedence the owner asked for becomes a one-way door.
//
// **It must not appear on the global settings sheet**, which is the level being followed — an offer
// there would be one this product cannot satisfy (§9). One block below asserts that, because the two
// surfaces now share one projection and one component.
//
// Since the owner's ruling of 2026-09-10 it is also **not a chip in the scrolling colour row** but a
// fixed full-width row under it; the last two blocks hold that placement.
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  materialById,
  type MaterialLookup,
  paletteFinish,
  priceDesign,
  projectDesignForDisplay,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
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
import { ro as content } from "../support/romanian-content";
import { FinishSectionView } from "@/panel/editor-panel";
import {
  describeFinishSection,
  describePanel,
  type FinishSection,
} from "@/panel/panel-model";
import { offerWholeKitchenTiers } from "@/price/whole-kitchen-tiers";
import { GlobalSettingsSurface } from "@/settings/global-settings";
import { describeGlobalSettings } from "@/settings/global-settings-model";
import { describeEditability } from "@/store/editability";

import { MDF_KITCHEN, PAL_KITCHEN } from "../support/panel-material";
import { pickerSectionOf, swatchSectionOf } from "../support/panel-sections";
import { occupiedMeta } from "../support/selection-meta";
import { noWidthIsFree } from "../support/width-options";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows";

const PAL_ANTRACIT = paletteFinish("pal.antracit");

const WRITABLE = describeEditability(
  { canWrite: true, saveStatus: "idle" },
  ro.panel,
);
const LOCKED = describeEditability(
  { canWrite: false, saveStatus: "idle" },
  ro.panel,
);

function openPanelOn(
  material: MaterialLookup,
  finish: ReturnType<typeof paletteFinish> | undefined,
) {
  const meta = occupiedMeta(finish === undefined ? {} : { finish });
  return describePanel({
    content,
    material,
    meta,
    offers: [],
    rejection: null,
    widthOptions: noWidthIsFree(meta.widthMm, meta.sizesMm),
    buildableWidthSpanMm: undefined,
    isBodyProbeAttached: true,
    canWrite: true,
    saveStatus: "idle",
  });
}

function panelSectionFor(finish: ReturnType<typeof paletteFinish> | undefined) {
  return swatchSectionOf(openPanelOn(PAL_KITCHEN, finish));
}

/** MDF's free-colour path, which takes the same follow row — and needs it most, since every hex its
 *  picker can produce is a choice. */
function pickerSectionOnMdf() {
  return pickerSectionOf(openPanelOn(MDF_KITCHEN, undefined));
}

function renderFinishSection(section: FinishSection): string {
  return renderToStaticMarkup(
    createElement(FinishSectionView, {
      section,
      onPick: () => undefined,
      onFollow: () => undefined,
    }),
  );
}

/** The follow control's own opening tag, so an assertion about how it is drawn cannot be satisfied
 *  by some other element on the section. */
function followButtonTagIn(markup: string): string {
  const tag = /<button[^>]*data-testid="finish-follow-kitchen"[^>]*>/.exec(
    markup,
  );
  if (tag === null) throw new Error("no follow control in the finish section");
  return tag[0];
}

/** What the horizontally scrolling colour row actually contains. It holds buttons and spans and no
 *  nested `<div>`, so the first close tag after it is its own. */
function scrollingColourRowIn(markup: string): string {
  const row = /data-testid="colour-options"[^>]*>([\s\S]*?)<\/div>/.exec(
    markup,
  );
  if (row === null) throw new Error("no colour row in the finish section");
  return row[1] ?? "";
}

describe("the cabinet editor offers a way back to the kitchen's colour", () => {
  it("publishes the chip beside the decors, whatever the cabinet is wearing", () => {
    const section = panelSectionFor(PAL_ANTRACIT);

    expect(section.follow).toEqual({
      value: "follow",
      label: ro.panel.finishFollowsKitchen,
      isActive: false,
      isDisabled: false,
    });
  });

  it("marks it standing when the cabinet has chosen nothing, so exactly one choice is marked", () => {
    const section = panelSectionFor(undefined);

    expect(section.follow?.isActive).toBe(true);
    expect(section.chips.filter((chip) => chip.isActive)).toHaveLength(0);
  });

  it("marks a chosen decor instead, and never both", () => {
    const section = panelSectionFor(PAL_ANTRACIT);

    expect(section.follow?.isActive).toBe(false);
    expect(
      section.chips.filter((chip) => chip.isActive).map((chip) => chip.value),
    ).toEqual(["pal.antracit"]);
  });

  it("renders it as a pressed-or-not button carrying the shared control's own markup", () => {
    const markup = renderFinishSection(panelSectionFor(undefined));

    expect(markup).toContain('data-testid="finish-follow-kitchen"');
    expect(markup).toContain(ro.panel.finishFollowsKitchen);
    expect(markup).toMatch(
      /data-testid="finish-follow-kitchen"[\s\S]*?aria-pressed="true"/,
    );
  });

  it("greys it with §13.1's reason on a read-only panel, like every other chip", () => {
    const meta = occupiedMeta({ finish: PAL_ANTRACIT });
    const panel = describePanel({
      content,
      material: PAL_KITCHEN,
      meta,
      offers: [],
      rejection: null,
      widthOptions: noWidthIsFree(meta.widthMm, meta.sizesMm),
      buildableWidthSpanMm: undefined,
      isBodyProbeAttached: true,
      canWrite: false,
      saveStatus: "idle",
    });

    expect(swatchSectionOf(panel).follow).toEqual({
      value: "follow",
      label: ro.panel.finishFollowsKitchen,
      isActive: false,
      isDisabled: true,
      reason: LOCKED.disabledReason,
    });
  });

  it("wires the store's clearFinish, which is the press no node runtime can drive", () => {
    // The same source-text device `qa-w2-locked-surface-reach.adversarial.test.ts` uses: the
    // component reads the store through a hook, and a projection test cannot see which action it
    // reached for.
    const source = readFileSync(
      resolve(import.meta.dirname, "../../src/panel/editor-panel.tsx"),
      "utf8",
    );

    expect(source).toMatch(/state\.clearFinish/);
    expect(source).toMatch(/onFollow=\{clearFinish\}/);
  });
});

// **The placement the owner ruled on 2026-09-10.** The control used to be one more chip inside the
// horizontally scrolling colour row; sitting there, the way back out of an override could scroll
// out of sight, which reintroduces decision 8's one-way door as a scroll position. These are the
// tests that fail if it ever drifts back in.
describe("the way back sits on its own fixed row, not among the scrolling colours", () => {
  it("renders outside the scrolling colour row, so it can never scroll away", () => {
    const markup = renderFinishSection(panelSectionFor(PAL_ANTRACIT));

    expect(markup).toContain('data-testid="finish-follow-kitchen"');
    expect(scrollingColourRowIn(markup)).not.toContain("finish-follow-kitchen");
  });

  it("sits directly beneath that row rather than above the colours", () => {
    const markup = renderFinishSection(panelSectionFor(PAL_ANTRACIT));

    expect(
      markup.indexOf('data-testid="finish-follow-kitchen"'),
    ).toBeGreaterThan(markup.indexOf('data-testid="colour-options"'));
  });

  it("is drawn with its own class and never the swatch's, so it reads as a reset", () => {
    const tag = followButtonTagIn(
      renderFinishSection(panelSectionFor(PAL_ANTRACIT)),
    );

    expect(tag).toMatch(/class="[^"]*followRow/);
    expect(tag).not.toMatch(/class="[^"]*swatch/);
  });

  it("keeps every attribute the press depends on", () => {
    const tag = followButtonTagIn(
      renderFinishSection(panelSectionFor(PAL_ANTRACIT)),
    );

    expect(tag).toContain('data-follow="true"');
    expect(tag).toContain('aria-pressed="false"');
  });

  it("puts the same row under MDF's picker, which needs the way back most", () => {
    const markup = renderFinishSection(pickerSectionOnMdf());

    expect(followButtonTagIn(markup)).toMatch(/class="[^"]*followRow/);
    expect(
      markup.indexOf('data-testid="finish-follow-kitchen"'),
    ).toBeGreaterThan(markup.indexOf('data-testid="finish-colour-picker"'));
  });
});

// The row is full width and centred in a stylesheet, and no type spans that hop — so these read it
// as text, the device `price-bar-layout.test.ts` uses for the same reason.
describe("the fixed row's stylesheet", () => {
  const declarations = readFileSync(
    resolve(import.meta.dirname, "../../src/panel/editor-panel.module.css"),
    "utf8",
  ).replace(/\/\*[\s\S]*?\*\//g, "");

  function ruleFor(selector: string): string {
    const rule = new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`).exec(
      declarations,
    );
    if (rule === null) {
      throw new Error(`no ${selector} rule in editor-panel.module.css`);
    }
    return rule[1] ?? "";
  }

  it("spans the full width of the finish section", () => {
    expect(ruleFor(".followRow")).toMatch(/width:\s*100%/);
  });

  it("centres its label on both axes", () => {
    expect(ruleFor(".followRow")).toMatch(/align-items:\s*center/);
    expect(ruleFor(".followRow")).toMatch(/justify-content:\s*center/);
  });

  it("takes the shared touch token, so §10.1's 44px floor holds at 390px", () => {
    expect(ruleFor(".followRow")).toMatch(/min-height:\s*var\(--chip-height\)/);
    expect(ruleFor(".shell")).toMatch(/--chip-height:\s*44px/);
  });

  it("adds no layout branch: the desktop media query never mentions it", () => {
    const desktop = declarations.slice(
      declarations.indexOf("@media (min-width: 900px)"),
    );

    expect(desktop).not.toContain("followRow");
  });
});

describe("the global settings sheet is the level being followed, so it offers no way to follow it", () => {
  it("publishes no follow chip and renders no follow button", () => {
    const design = KITCHEN_L_DESIGN;
    const priced = {
      design,
      catalog: KITCHEN_L_BODY_CATALOG,
      book: SAMPLE_PRICE_BOOK,
      pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
      selections: design.settings,
      deepeningRows: MEASURED_DEEPENING_ROWS,
    };
    const view = describeGlobalSettings({
      content,
      pricing: priceDesign(priced),
      offer: offerWholeKitchenTiers(priced),
      groups: projectDesignForDisplay(design, KITCHEN_L_BODY_CATALOG),
      applied: design.settings ?? {},
      pending: {},
      chosenColourCount: 0,
    });

    const section = describeFinishSection(
      { kind: "declared", material: materialById("material.melamine") },
      undefined,
      WRITABLE,
      content,
    );
    expect(section).toBeDefined();
    // The shared projection publishes none: the chip is composed on top of it by the panel alone.
    expect(section).not.toHaveProperty("follow");

    const markup = renderToStaticMarkup(
      createElement(GlobalSettingsSurface, {
        id: "settings",
        view,
        editability: WRITABLE,
        onChoose: () => undefined,
        onChooseDepth: () => undefined,
        onChooseFinish: () => undefined,
        onCancel: () => undefined,
        onApply: () => undefined,
      }),
    );
    expect(markup).toContain('data-testid="global-settings-colour-group"');
    expect(markup).not.toContain('data-testid="finish-follow-kitchen"');
  });
});
