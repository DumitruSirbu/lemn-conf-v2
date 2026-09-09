// **ADR 0099's fourth group, in the sheet** — the owner's manual-feedback item 6.
//
// The load-bearing assertions here are on the **stored document**, not on the markup: a sheet that
// renders the right colour out of a document whose cabinets grew a `finish` key has still converted
// every following cabinet into an overriding one, and the customer's *next* global change would
// move nothing. The markup half asserts only what markup can decide — that the group is after the
// material, that it is the panel's own control, and that a locked sheet greys it.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredCabinetDepthsMm,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  materialById,
  paletteFinish,
  priceDesign,
  projectDesignForDisplay,
  resolvedFinishOf,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  type Design,
  type DesignPlacement,
  type Finish,
  type PricingResult,
} from "@lemnaria/configurator-domain";
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ro } from "@/content/ro";
import {
  offerWholeKitchenTiers,
  type WholeKitchenTierOffer,
} from "@/price/whole-kitchen-tiers";
import { GlobalSettingsSurface } from "@/settings/global-settings";
import {
  chooseDepthIn,
  chooseFinishIn,
  chooseTierIn,
  describeGlobalSettings,
  resolveOpeningChoice,
  type GlobalSettingsView,
  type WholeKitchenChoice,
} from "@/settings/global-settings-model";
import { createConfiguratorStore } from "@/store/configurator-store";
import { describeEditability, type Editability } from "@/store/editability";

import { createFakeProbeFactory } from "../support/fake-body-probe";

const PAL_TIER_ID = "material.melamine";
const VENEER_TIER_ID = "material.veneer";

const PAL_ANTRACIT = paletteFinish("pal.antracit");
const PAL_GRI = paletteFinish("pal.gri-havanna");
const VENEER_NUC = paletteFinish("veneer.nuc");

const MATERIAL_TIER_IDS = SAMPLE_PRICE_BOOK.material.tiers.map(
  (tier) => tier.tierId,
);
const HARDWARE_TIER_IDS = SAMPLE_PRICE_BOOK.hardware.tiers.map(
  (tier) => tier.tierId,
);

const WRITABLE = describeEditability({ canWrite: true, saveStatus: "idle" });
const LOCKED = describeEditability({ canWrite: false, saveStatus: "idle" });

function pricingOf(design: Design): PricingResult {
  return priceDesign({
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    selections: design.settings,
  });
}

function offerOf(design: Design): WholeKitchenTierOffer {
  return offerWholeKitchenTiers({
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    selections: design.settings,
  });
}

function viewOf(
  design: Design,
  pending: WholeKitchenChoice,
): GlobalSettingsView {
  return describeGlobalSettings({
    pricing: pricingOf(design),
    offer: offerOf(design),
    groups: projectDesignForDisplay(design, KITCHEN_L_BODY_CATALOG),
    applied: design.settings ?? {},
    pending,
    chosenColourCount: 0,
  });
}

function markupOf(view: GlobalSettingsView, editability: Editability): string {
  return renderToStaticMarkup(
    createElement(GlobalSettingsSurface, {
      id: "settings",
      view,
      editability,
      onChoose: () => undefined,
      onChooseDepth: () => undefined,
      onChooseFinish: () => undefined,
      onCancel: () => undefined,
      onApply: () => undefined,
    }),
  );
}

/** Just the colour group, so an assertion about it cannot be satisfied by the three groups around
 *  it — the depth group's radios are disabled on a locked sheet too. */
function colourGroupMarkup(markup: string): string {
  const from = markup.indexOf('data-testid="global-settings-colour-group"');
  const to = markup.indexOf('data-testid="global-settings-colour-warning"');
  if (from === -1 || to === -1)
    throw new Error("the colour group is not on the sheet");
  return markup.slice(from, to);
}

/** The seeded kitchen with one cabinet wearing a colour of its own, and the rest wearing none. */
function kitchenWithOneOverride(finish: Finish): Design {
  return {
    ...KITCHEN_L_DESIGN,
    placements: KITCHEN_L_DESIGN.placements.map((placement, at) =>
      at === 0 ? wearing(placement, finish) : withoutAFinish(placement),
    ),
    settings: { ...KITCHEN_L_DESIGN.settings, materialTierId: PAL_TIER_ID },
  };
}

function wearing(placement: DesignPlacement, finish: Finish): DesignPlacement {
  return { ...placement, body: { ...placement.body, finish } };
}

function withoutAFinish(placement: DesignPlacement): DesignPlacement {
  const body = { ...placement.body };
  delete body.finish;
  return { ...placement, body };
}

describe("acceptance 1 — the colour group renders after material, from the material's own palette", () => {
  it("puts the colour group between the material group and hardware", () => {
    const markup = markupOf(viewOf(KITCHEN_L_DESIGN, {}), WRITABLE);

    const material = markup.indexOf(ro.globalSettings.groupHeadings.material);
    const colour = markup.indexOf(ro.globalSettings.colourHeading);
    const hardware = markup.indexOf(ro.globalSettings.groupHeadings.hardware);

    expect(material).toBeGreaterThan(-1);
    expect(colour).toBeGreaterThan(material);
    expect(hardware).toBeGreaterThan(colour);
  });

  it("renders §9's own control rather than a second one, tagged with the declared shape", () => {
    // `data-finish-control` is the panel's attribute, carried here because this *is* the panel's
    // component — a decor list for PAL, and the swatch test ids the cabinet editor already uses.
    const markup = markupOf(viewOf(KITCHEN_L_DESIGN, {}), WRITABLE);

    expect(markup).toContain('data-finish-control="decor-list"');
    expect(markup).toContain('data-testid="finish-pal.antracit"');
  });

  it("offers the pending material's palette, not the applied one", () => {
    // The design is on PAL; the customer has chosen veneer and has not pressed Aplică.
    const markup = markupOf(
      viewOf(KITCHEN_L_DESIGN, { materialTierId: VENEER_TIER_ID }),
      WRITABLE,
    );

    expect(markup).toContain('data-finish-control="wood-swatches"');
    expect(markup).toContain('data-testid="finish-veneer.nuc"');
    expect(markup).not.toContain('data-testid="finish-pal.antracit"');
  });

  it("greys every swatch with the reason when the sheet may not write", () => {
    const locked = colourGroupMarkup(
      markupOf(viewOf(KITCHEN_L_DESIGN, {}), LOCKED),
    );
    const writable = colourGroupMarkup(
      markupOf(viewOf(KITCHEN_L_DESIGN, {}), WRITABLE),
    );

    // Every decor the material declares, and each one disabled — counted against the declaration so
    // a seventh PAL decor widens this rather than slipping past it.
    const declaredDecors = materialById(PAL_TIER_ID);
    const offered =
      declaredDecors.colourControl.shape === "ral-picker"
        ? []
        : declaredDecors.colourControl.entries;
    expect(offered.length).toBeGreaterThan(0);
    expect(locked.match(/disabled=""/g)?.length).toBe(offered.length);
    expect(locked).toContain(LOCKED.disabledReason);
    // The positive control: the same group, writable, greys nothing.
    expect(writable).not.toContain('disabled=""');
  });

  it("keeps the confirm step's own action gated too", () => {
    // The confirm step replaces the body wholesale, so its one write action carries the same guard —
    // asserted here because this wave adds a fourth group to the press that button commits.
    const view = describeGlobalSettings({
      pricing: pricingOf(KITCHEN_L_DESIGN),
      offer: offerOf(KITCHEN_L_DESIGN),
      groups: projectDesignForDisplay(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG),
      applied: { materialTierId: PAL_TIER_ID },
      pending: { materialTierId: VENEER_TIER_ID },
      chosenColourCount: 0,
      globalFinishWouldBeLost: true,
    });
    const confirm = view.materialResetConfirm;
    if (!confirm) throw new Error("the second arm published no confirmation");

    const markup = renderToStaticMarkup(
      createElement(GlobalSettingsSurface, {
        id: "settings",
        view,
        editability: LOCKED,
        confirming: {
          view: confirm,
          onConfirm: () => undefined,
          onStepBack: () => undefined,
        },
        onChoose: () => undefined,
        onChooseDepth: () => undefined,
        onChooseFinish: () => undefined,
        onCancel: () => undefined,
        onApply: () => undefined,
      }),
    );

    expect(markup).toContain(confirm.body);
    expect(markup).toContain(ro.globalSettings.materialResetConfirm.globalBody);
    expect(markup).toMatch(
      /data-testid="global-settings-confirm"[^>]*disabled=""/,
    );
  });

  it("wires the production sheet's own handler, which no node runtime can open the sheet to prove", () => {
    // The strongest guard this runtime allows, and the same device
    // `qa-w2-locked-surface-reach.adversarial.test.ts` uses for `editability`: `useState(false)`
    // never advances without a DOM, so nothing here renders the store-connected component *open*.
    const source = readFileSync(
      resolve(import.meta.dirname, "../../src/settings/global-settings.tsx"),
      "utf8",
    );

    expect(source).toMatch(
      /<GlobalSettingsSurface[\s\S]*?onChooseFinish=\{chooseFinish\}/,
    );
  });
});

describe("acceptance 2 and 3 — what a global colour change does to the stored document", () => {
  it("leaves every cabinet-level override byte-identical and grows no finish key", () => {
    const design = kitchenWithOneOverride(PAL_ANTRACIT);
    const saved: Design[] = [];
    const store = createConfiguratorStore({
      design,
      catalogAt: buildKitchenLBodyCatalog,
      probeAt: createFakeProbeFactory(),
      onDesignChanged: (next) => saved.push(next),
    });

    const outcome = store.getState().applyWholeKitchenSettings({
      finish: PAL_GRI,
      availableMaterialTierIds: MATERIAL_TIER_IDS,
      availableHardwareTierIds: HARDWARE_TIER_IDS,
    });

    expect(outcome.committed).toBe(true);
    const stored = store.getState().design;
    expect(stored.settings?.finish).toEqual(PAL_GRI);
    // The document, not the view: identical placements, character for character.
    expect(JSON.stringify(stored.placements)).toBe(
      JSON.stringify(design.placements),
    );
  });

  it("makes a cabinet with no override adopt the global colour, and the override keep its own", () => {
    const design = kitchenWithOneOverride(PAL_ANTRACIT);
    const store = createConfiguratorStore({
      design,
      catalogAt: buildKitchenLBodyCatalog,
      probeAt: createFakeProbeFactory(),
    });

    store.getState().applyWholeKitchenSettings({
      finish: PAL_GRI,
      availableMaterialTierIds: MATERIAL_TIER_IDS,
      availableHardwareTierIds: HARDWARE_TIER_IDS,
    });

    const stored = store.getState().design;
    const overriding = stored.placements[0];
    const following = stored.placements[1];
    if (!overriding || !following) throw new Error("fixture is too short");
    expect(resolvedFinishOf(overriding, stored)).toEqual(PAL_ANTRACIT);
    expect(resolvedFinishOf(following, stored)).toEqual(PAL_GRI);
    expect(following.body.finish).toBeUndefined();
  });
});

describe("acceptance 5 — one press carrying all four settings is one commit or none", () => {
  it("commits nothing, colour included, when the depth half is refused", () => {
    const anotherDepthMm = declaredCabinetDepthsMm().find(
      (depthMm) => depthMm !== cabinetDepthMmOf(KITCHEN_L_DESIGN),
    );
    if (anotherDepthMm === undefined) {
      throw new Error("the map declares only one depth");
    }
    const design = kitchenWithOneOverride(PAL_ANTRACIT);
    const saved: Design[] = [];
    // No probe: `setCabinetDepth` refuses `BODY_PROBE_UNAVAILABLE`, which is the reachable refusal
    // the atomicity suite is written against.
    const store = createConfiguratorStore({
      design,
      catalogAt: buildKitchenLBodyCatalog,
      onDesignChanged: (next) => saved.push(next),
    });

    const outcome = store.getState().applyWholeKitchenSettings({
      materialTierId: MATERIAL_TIER_IDS.at(-1) ?? "",
      finish: PAL_GRI,
      hardwareTierId: HARDWARE_TIER_IDS.at(-1) ?? "",
      cabinetDepthMm: anotherDepthMm,
      availableMaterialTierIds: MATERIAL_TIER_IDS,
      availableHardwareTierIds: HARDWARE_TIER_IDS,
    });

    expect(outcome.committed).toBe(false);
    expect(store.getState().design).toBe(design);
    expect(saved).toHaveLength(0);
  });

  it("commits the colour together with the other three when nothing refuses", () => {
    const design = kitchenWithOneOverride(PAL_ANTRACIT);
    const store = createConfiguratorStore({
      design,
      catalogAt: buildKitchenLBodyCatalog,
      probeAt: createFakeProbeFactory(),
    });

    const outcome = store.getState().applyWholeKitchenSettings({
      materialTierId: VENEER_TIER_ID,
      finish: VENEER_NUC,
      hardwareTierId: HARDWARE_TIER_IDS.at(-1) ?? "",
      availableMaterialTierIds: MATERIAL_TIER_IDS,
      availableHardwareTierIds: HARDWARE_TIER_IDS,
    });

    expect(outcome.committed).toBe(true);
    const stored = store.getState().design;
    expect(stored.settings?.materialTierId).toBe(VENEER_TIER_ID);
    expect(stored.settings?.hardwareTierId).toBe(HARDWARE_TIER_IDS.at(-1));
    // **The colour runs after the material.** Were the order the other way round, ADR 0057's reset
    // would have replaced the colour the customer picked in this very press with veneer's default.
    expect(stored.settings?.finish).toEqual(VENEER_NUC);
  });
});

describe("acceptance 6 — a document written before this wave", () => {
  it("loads, prices and resolves exactly as it did, carrying no global colour", () => {
    // A document written before this wave, modelled the only way it can be: the shipped fixture,
    // which carries no `settings.finish` key at all. That absence is the assertion — if the wave
    // had made the field required or seeded it anywhere, this line would be the first to say so.
    expect(KITCHEN_L_DESIGN.settings).not.toHaveProperty("finish");

    const priced = pricingOf(KITCHEN_L_DESIGN);
    const withAColour = pricingOf({
      ...KITCHEN_L_DESIGN,
      settings: { ...KITCHEN_L_DESIGN.settings, finish: PAL_GRI },
    });
    if (!priced.ok || !withAColour.ok) {
      throw new Error("the seeded design must price at both levels");
    }
    // ADR 0071 decision 1, at the new level: a colour moves no price, so the pre-wave document and
    // the same document carrying a global colour are the same estimate to the last bănuț. Asserted
    // as the two totals rather than as a pinned figure, which would only restate
    // `starting-price.adversarial.test.ts`'s pin and would go stale with the next book change.
    expect(withAColour.priced.totalMinor).toBe(priced.priced.totalMinor);

    const first = KITCHEN_L_DESIGN.placements[0];
    if (!first) throw new Error("fixture is too short");
    expect(resolvedFinishOf(first, KITCHEN_L_DESIGN)).toEqual(
      first.body.finish ?? materialById(PAL_TIER_ID).defaultFinish,
    );
  });

  it("opens the sheet on no colour at all, so an untouched Aplică writes none", () => {
    const opening = resolveOpeningChoice(
      KITCHEN_L_DESIGN.settings ?? {},
      offerOf(KITCHEN_L_DESIGN),
    );

    expect(opening.finish).toBeUndefined();
    expect("finish" in opening).toBe(false);
  });
});

describe("ADR 0099 decision 4 — a material change drops a colour it does not offer, in the sheet", () => {
  it("clears the pending colour rather than committing it and resetting it after", () => {
    const chosen = chooseFinishIn({ materialTierId: PAL_TIER_ID }, PAL_GRI);

    const moved = chooseTierIn(chosen, {
      key: "material",
      tierId: VENEER_TIER_ID,
    });

    expect(chosen.finish).toEqual(PAL_GRI);
    expect(moved.finish).toBeUndefined();
    expect("finish" in moved).toBe(false);
  });

  it("keeps a pending colour the new material does offer", () => {
    // Re-applying the same material is not a material change, and must not discard a choice.
    const chosen = chooseFinishIn({ materialTierId: PAL_TIER_ID }, PAL_GRI);

    const moved = chooseTierIn(chosen, {
      key: "material",
      tierId: PAL_TIER_ID,
    });

    expect(moved.finish).toEqual(PAL_GRI);
  });

  it("marks the new material's declared default without anybody having chosen it", () => {
    const view = viewOf(KITCHEN_L_DESIGN, { materialTierId: VENEER_TIER_ID });

    expect(view.colourGroup?.selected).toEqual(
      materialById(VENEER_TIER_ID).defaultFinish,
    );
  });
});

describe("acceptance 7 — Renunță writes nothing, over any sequence of presses", () => {
  /** Every press the choosing step offers, as the model runs it. */
  type Press =
    | { readonly kind: "material"; readonly tierId: string }
    | { readonly kind: "hardware"; readonly tierId: string }
    | { readonly kind: "depth"; readonly cabinetDepthMm: number }
    | { readonly kind: "colour"; readonly finish: Finish };

  function pressed(
    chosen: WholeKitchenChoice,
    press: Press,
  ): WholeKitchenChoice {
    if (press.kind === "depth")
      return chooseDepthIn(chosen, press.cabinetDepthMm);
    if (press.kind === "colour") return chooseFinishIn(chosen, press.finish);
    return chooseTierIn(chosen, { key: press.kind, tierId: press.tierId });
  }

  const OFFERED_FINISHES: readonly Finish[] = [
    PAL_ANTRACIT,
    PAL_GRI,
    VENEER_NUC,
  ];

  it("leaves the stored document byte-identical to the one the sheet opened on", () => {
    const opened = kitchenWithOneOverride(PAL_ANTRACIT);
    const openedText = JSON.stringify(opened);
    // The witness that keeps this from passing on empty sequences alone: at least one run has to
    // have moved the pending choice somewhere the opening one was not.
    let pendingEverMoved = false;

    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc
              .constantFrom(...MATERIAL_TIER_IDS)
              .map((tierId): Press => ({ kind: "material", tierId })),
            fc
              .constantFrom(...HARDWARE_TIER_IDS)
              .map((tierId): Press => ({ kind: "hardware", tierId })),
            fc.constantFrom(...declaredCabinetDepthsMm()).map(
              (cabinetDepthMm): Press => ({
                kind: "depth",
                cabinetDepthMm,
              }),
            ),
            fc
              .constantFrom(...OFFERED_FINISHES)
              .map((finish): Press => ({ kind: "colour", finish })),
          ),
          { maxLength: 12 },
        ),
        (presses) => {
          const store = createConfiguratorStore({
            design: opened,
            catalogAt: buildKitchenLBodyCatalog,
            probeAt: createFakeProbeFactory(),
          });
          // The sheet's whole life, less the press it never gets: open, choose, choose again,
          // *Renunță*. Nothing between `resolveOpeningChoice` and `applyWholeKitchenSettings`
          // touches the store, and cancelling calls neither.
          const opening = resolveOpeningChoice(
            opened.settings ?? {},
            offerOf(opened),
          );
          const finalChoice = presses.reduce(pressed, opening);
          if (JSON.stringify(finalChoice) !== JSON.stringify(opening)) {
            pendingEverMoved = true;
          }

          expect(JSON.stringify(store.getState().design)).toBe(openedText);
        },
      ),
      { numRuns: 150 },
    );

    expect(pendingEverMoved).toBe(true);
  });
});
