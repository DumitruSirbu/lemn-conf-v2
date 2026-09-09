// **ADR 0099 decision 8: the way back out of an override**, which that record makes part of the
// decision rather than UI polish.
//
// The failure it exists to prevent is stated there and is what these tests are written against:
// without a control that *un*-chooses, the first tap on any swatch pins that cabinet out of the
// kitchen's colour for ever, and the precedence the owner asked for becomes a one-way door.
//
// **It must not appear on the global settings sheet**, which is the level being followed — an offer
// there would be one this product cannot satisfy (§9). The last block asserts that, because the two
// surfaces now share one projection and one component.
import {
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  materialById,
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

import { ro } from "@/content/ro";
import { ro as content } from "../support/romanian-content";
import { FinishSectionView } from "@/panel/editor-panel";
import { describeFinishSection, describePanel } from "@/panel/panel-model";
import { offerWholeKitchenTiers } from "@/price/whole-kitchen-tiers";
import { GlobalSettingsSurface } from "@/settings/global-settings";
import { describeGlobalSettings } from "@/settings/global-settings-model";
import { describeEditability } from "@/store/editability";

import { PAL_KITCHEN } from "../support/panel-material";
import { swatchSectionOf } from "../support/panel-sections";
import { occupiedMeta } from "../support/selection-meta";
import { noWidthIsFree } from "../support/width-options";

const PAL_ANTRACIT = paletteFinish("pal.antracit");

const WRITABLE = describeEditability({ canWrite: true, saveStatus: "idle" });
const LOCKED = describeEditability({ canWrite: false, saveStatus: "idle" });

function panelSectionFor(finish: ReturnType<typeof paletteFinish> | undefined) {
  const meta = occupiedMeta(finish === undefined ? {} : { finish });
  const panel = describePanel({
    content,
    material: PAL_KITCHEN,
    meta,
    offers: [],
    rejection: null,
    widthOptions: noWidthIsFree(meta.widthMm, meta.sizesMm),
    isBodyProbeAttached: true,
    canWrite: true,
    saveStatus: "idle",
  });
  return swatchSectionOf(panel);
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
    const markup = renderToStaticMarkup(
      createElement(FinishSectionView, {
        section: panelSectionFor(undefined),
        onPick: () => undefined,
        onFollow: () => undefined,
      }),
    );

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

describe("the global settings sheet is the level being followed, so it offers no way to follow it", () => {
  it("publishes no follow chip and renders no follow button", () => {
    const design = KITCHEN_L_DESIGN;
    const priced = {
      design,
      catalog: KITCHEN_L_BODY_CATALOG,
      book: SAMPLE_PRICE_BOOK,
      pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
      selections: design.settings,
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
