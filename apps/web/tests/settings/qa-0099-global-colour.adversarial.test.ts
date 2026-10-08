// **Adversarial QA of wave W3 — ADR 0099's two-level colour, in `apps/web`.**
//
// The wave's own suite covers the sheet's markup, one store-level global change and *Renunță* over a
// random press sequence. This file attacks what those leave open:
//
// - **The apply path**, not the cancel path. *Renunță* writing nothing is the easy half; the claim
//   with the customer's data behind it is that **pressing *Aplică*** after any sequence of presses
//   leaves every cabinet-level override byte-identical and grows no `finish` key on a following one.
//   That is asserted here over a shuffled sequence, against the real store.
// - **Two subsequent global changes after a clear**, through the store rather than the domain — the
//   half that catches a store rebuilding records in a way that re-stamps a colour.
// - **Both confirmation sentences**, chosen separately, so an implementation that shows the
//   cabinets' sentence for a whole-kitchen-only loss fails on the wording rather than on presence.
// - **ADR 0099 decision 4 swept over every ordered material pair and every colour each offers**,
//   rather than on the two examples that happen to be typed out.
// - **The Romanian.** Every string the wave added must reach the surface it was written for and be
//   Romanian (ADR 0095).
import {
  buildKitchenLBodyCatalog,
  declaredCabinetDepthsMm,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  lookUpMaterial,
  materialById,
  materialOffersFinish,
  MATERIALS,
  paletteEntriesOf,
  paletteFinish,
  freeColourFinish,
  priceDesign,
  projectDesignForDisplay,
  resolvedFinishOf,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  type Design,
  type DesignPlacement,
  type Finish,
  type Material,
  type PricingResult,
} from "@lemnaria/configurator-domain";
import fc from "fast-check";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/use-content", async () => {
  const { ro } = await import("../support/romanian-content");
  return { useContent: () => ro };
});

import { ro as content } from "../support/romanian-content";
import { FinishSectionView } from "@/panel/editor-panel";
import { describeFinishSection, describePanel } from "@/panel/panel-model";
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
import { describeEditability } from "@/store/editability";

import { createFakeProbeFactory } from "../support/fake-body-probe";
import { PAL_KITCHEN } from "../support/panel-material";
import { swatchSectionOf } from "../support/panel-sections";
import { occupiedMeta } from "../support/selection-meta";
import { noWidthIsFree } from "../support/width-options";

const PAL_TIER_ID = "material.melamine";
const VENEER_TIER_ID = "material.veneer";
const MDF_TIER_ID = "material.painted-mdf";

const PAL_ALB = paletteFinish("pal.alb");
const PAL_ANTRACIT = paletteFinish("pal.antracit");
const PAL_GRI = paletteFinish("pal.gri-havanna");
const VENEER_NUC = paletteFinish("veneer.nuc");

const MATERIAL_TIER_IDS = SAMPLE_PRICE_BOOK.material.tiers.map(
  (tier) => tier.tierId,
);
const HARDWARE_TIER_IDS = SAMPLE_PRICE_BOOK.hardware.tiers.map(
  (tier) => tier.tierId,
);

const WRITABLE = describeEditability(
  { canWrite: true, saveStatus: "idle" },
  content.panel,
);

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

interface ViewInput {
  readonly design: Design;
  readonly pending: WholeKitchenChoice;
  readonly chosenColourCount?: number;
  readonly globalFinishWouldBeLost?: boolean;
}

function viewOf(input: ViewInput): GlobalSettingsView {
  return describeGlobalSettings({
    content,
    pricing: pricingOf(input.design),
    offer: offerOf(input.design),
    groups: projectDesignForDisplay(input.design, KITCHEN_L_BODY_CATALOG),
    applied: input.design.settings ?? {},
    pending: input.pending,
    chosenColourCount: input.chosenColourCount ?? 0,
    globalFinishWouldBeLost: input.globalFinishWouldBeLost ?? false,
  });
}

function markupOf(view: GlobalSettingsView): string {
  return renderToStaticMarkup(
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
}

function withoutAFinish(placement: DesignPlacement): DesignPlacement {
  const body = { ...placement.body };
  delete body.finish;
  return { ...placement, body };
}

function wearing(placement: DesignPlacement, finish: Finish): DesignPlacement {
  return { ...placement, body: { ...placement.body, finish } };
}

/** The seeded kitchen with one cabinet wearing a colour of its own and the rest following. */
function kitchenWithOneOverride(finish: Finish): Design {
  return {
    ...KITCHEN_L_DESIGN,
    placements: KITCHEN_L_DESIGN.placements.map((placement, at) =>
      at === 0 ? wearing(placement, finish) : withoutAFinish(placement),
    ),
    settings: { ...KITCHEN_L_DESIGN.settings, materialTierId: PAL_TIER_ID },
  };
}

/** Which placement ids carry a `finish` key, and what each one is. */
function carriedFinishes(design: Design): Record<string, string> {
  const carried: Record<string, string> = {};
  for (const placement of design.placements) {
    if (placement.body.finish !== undefined) {
      carried[placement.id] = JSON.stringify(placement.body.finish);
    }
  }
  return carried;
}

/** Every finish a declared material offers. MDF's picker offers no palette entry, so it contributes
 *  free colours rather than an empty list — otherwise a sweep "over all three" skips the one whose
 *  control differs most. */
function offeredFinishesOf(material: Material): readonly Finish[] {
  if (material.colourControl.shape === "ral-picker") {
    return [freeColourFinish("#123456"), freeColourFinish("#abcdef")];
  }
  return paletteEntriesOf(material).map((entry) =>
    paletteFinish(entry.entryId),
  );
}

describe("ADR 0099 acceptance 1 — apply, not cancel, is where an override could be lost", () => {
  /**
   * The wave's own property presses the model and then **cancels**, which cannot lose anything by
   * construction. This one presses the model and then **applies**, against the real store, and
   * asserts the document afterwards: every override byte-identical, and no following cabinet grown a
   * key. A colour press that stamped a resolved colour anywhere, or an apply that planned the colour
   * before the material, fails here.
   */
  type Press =
    | { readonly kind: "material"; readonly tierId: string }
    | { readonly kind: "hardware"; readonly tierId: string }
    | { readonly kind: "depth"; readonly cabinetDepthMm: number }
    | { readonly kind: "colour"; readonly finish: Finish };

  function pressed(
    chosen: WholeKitchenChoice,
    press: Press,
  ): WholeKitchenChoice {
    if (press.kind === "depth") {
      return chooseDepthIn(chosen, press.cabinetDepthMm);
    }
    if (press.kind === "colour") return chooseFinishIn(chosen, press.finish);
    return chooseTierIn(chosen, { key: press.kind, tierId: press.tierId });
  }

  const anyPress: fc.Arbitrary<Press> = fc.oneof(
    fc
      .constantFrom(...MATERIAL_TIER_IDS)
      .map((tierId): Press => ({ kind: "material", tierId })),
    fc
      .constantFrom(...HARDWARE_TIER_IDS)
      .map((tierId): Press => ({ kind: "hardware", tierId })),
    fc
      .constantFrom(...declaredCabinetDepthsMm())
      .map((cabinetDepthMm): Press => ({ kind: "depth", cabinetDepthMm })),
    fc
      .constantFrom(PAL_ANTRACIT, PAL_GRI, PAL_ALB, VENEER_NUC)
      .map((finish): Press => ({ kind: "colour", finish })),
  );

  it("never grows a finish key on a cabinet that was following, over any applied sequence", () => {
    const opened = kitchenWithOneOverride(PAL_ANTRACIT);
    const followingIds = opened.placements
      .filter((placement) => placement.body.finish === undefined)
      .map((placement) => placement.id);
    expect(followingIds.length).toBeGreaterThan(0);
    let everCommitted = false;

    fc.assert(
      fc.property(fc.array(anyPress, { maxLength: 8 }), (presses) => {
        const store = createConfiguratorStore({
          design: opened,
          catalogAt: buildKitchenLBodyCatalog,
          probeAt: createFakeProbeFactory(),
        });
        const chosen = presses.reduce(
          pressed,
          resolveOpeningChoice(opened.settings ?? {}, offerOf(opened)),
        );

        const outcome = store.getState().applyWholeKitchenSettings({
          ...chosen,
          availableMaterialTierIds: MATERIAL_TIER_IDS,
          availableHardwareTierIds: HARDWARE_TIER_IDS,
        });
        if (outcome.committed) everCommitted = true;

        const stored = store.getState().design;
        const grown = followingIds.filter((id) => {
          const placement = stored.placements.find(
            (candidate) => candidate.id === id,
          );
          return placement?.body.finish !== undefined;
        });
        // ADR 0057's reset never *adds* a key — it rewrites one that is already there — so a
        // following cabinet must still be following whatever the press did.
        expect(grown).toEqual([]);
      }),
      { numRuns: 80 },
    );

    // The witness: at least one run actually wrote something, so the assertion above is not passing
    // on a suite of refusals.
    expect(everCommitted).toBe(true);
  });

  it("changes an override only when the material changed, never when only the colour did", () => {
    const opened = kitchenWithOneOverride(PAL_ANTRACIT);
    const before = carriedFinishes(opened);

    fc.assert(
      fc.property(
        fc.array(
          fc
            .constantFrom(PAL_ANTRACIT, PAL_GRI, PAL_ALB)
            .map((finish): Press => ({ kind: "colour", finish })),
          { minLength: 1, maxLength: 6 },
        ),
        (presses) => {
          const store = createConfiguratorStore({
            design: opened,
            catalogAt: buildKitchenLBodyCatalog,
            probeAt: createFakeProbeFactory(),
          });
          const chosen = presses.reduce(
            pressed,
            resolveOpeningChoice(opened.settings ?? {}, offerOf(opened)),
          );

          store.getState().applyWholeKitchenSettings({
            ...chosen,
            availableMaterialTierIds: MATERIAL_TIER_IDS,
            availableHardwareTierIds: HARDWARE_TIER_IDS,
          });

          expect(carriedFinishes(store.getState().design)).toEqual(before);
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe("ADR 0099 acceptance 3 — through the store, a cleared cabinet tracks two changes", () => {
  /** The domain suite asserts this on the command. This asserts it on the store, which is what the
   *  browser runs: the store re-derives records after every command, and a record that carried a
   *  resolved colour would be written back into `body.finish` by the next rebuild. */
  it("follows the kitchen twice running after the editor's own clear", () => {
    const opened = kitchenWithOneOverride(PAL_ANTRACIT);
    const store = createConfiguratorStore({
      design: opened,
      catalogAt: buildKitchenLBodyCatalog,
      probeAt: createFakeProbeFactory(),
    });
    const targetId = opened.placements[0]?.id ?? "";

    store.getState().select({ kind: "placement", id: targetId });
    store.getState().clearFinish();
    expect(store.getState().design.placements[0]?.body).not.toHaveProperty(
      "finish",
    );

    for (const finish of [PAL_GRI, PAL_ALB]) {
      store.getState().applyWholeKitchenSettings({
        finish,
        availableMaterialTierIds: MATERIAL_TIER_IDS,
        availableHardwareTierIds: HARDWARE_TIER_IDS,
      });
      const stored = store.getState().design;
      const placement = stored.placements[0];
      expect(placement).toBeDefined();
      if (placement === undefined) return;
      expect(placement.body).not.toHaveProperty("finish");
      expect(resolvedFinishOf(placement, stored)).toEqual(finish);
    }
  });
});

describe("ADR 0099 decision 7 — the confirmation says which loss it is", () => {
  const materialChange: WholeKitchenChoice = {
    materialTierId: VENEER_TIER_ID,
  };

  it("shows the whole-kitchen sentence when only the kitchen's colour would be lost", () => {
    const view = viewOf({
      design: kitchenWithOneOverride(PAL_ANTRACIT),
      pending: materialChange,
      chosenColourCount: 0,
      globalFinishWouldBeLost: true,
    });

    expect(view.materialResetConfirm?.body).toBe(
      content.globalSettings.materialResetConfirm.globalBody,
    );
  });

  it("shows the cabinets' sentence when cabinets would be lost too", () => {
    const view = viewOf({
      design: kitchenWithOneOverride(PAL_ANTRACIT),
      pending: materialChange,
      chosenColourCount: 3,
      globalFinishWouldBeLost: true,
    });

    expect(view.materialResetConfirm?.body).toBe(
      content.globalSettings.materialResetConfirm.body(3),
    );
  });

  it("owes no confirmation when neither arm fires", () => {
    const view = viewOf({
      design: kitchenWithOneOverride(PAL_ANTRACIT),
      pending: materialChange,
      chosenColourCount: 0,
      globalFinishWouldBeLost: false,
    });

    expect(view.materialResetConfirm).toBeUndefined();
  });

  /** The second arm must not resurrect a confirmation for a press that changes no material — the
   *  whole point of ADR 0086 decision 3's other two preconditions. */
  it("owes none for a press that does not change the material, whatever the arms say", () => {
    const view = viewOf({
      design: kitchenWithOneOverride(PAL_ANTRACIT),
      pending: { materialTierId: PAL_TIER_ID },
      chosenColourCount: 3,
      globalFinishWouldBeLost: true,
    });

    expect(view.materialResetConfirm).toBeUndefined();
  });

  /** The two sentences must actually differ, or the test above passes on an implementation that
   *  returns one string for both. */
  it("uses two different sentences", () => {
    expect(content.globalSettings.materialResetConfirm.globalBody).not.toBe(
      content.globalSettings.materialResetConfirm.body(3),
    );
  });
});

describe("ADR 0099 decision 4 — a pending colour follows the pending material, over every pair", () => {
  /** The sheet's own rule, swept: for every ordered pair of declared materials and every colour the
   *  first one offers, choosing the second material either keeps the colour (it is offered) or
   *  **deletes the key** — never substitutes another colour, and never leaves an unoffered one for
   *  *Aplică* to commit. */
  it("keeps an offered colour and deletes an unoffered one, never substituting", () => {
    for (const from of MATERIALS) {
      for (const finish of offeredFinishesOf(from)) {
        const chosen = chooseFinishIn(
          { materialTierId: from.materialId },
          finish,
        );
        for (const to of MATERIALS) {
          const moved = chooseTierIn(chosen, {
            key: "material",
            tierId: to.materialId,
          });

          if (materialOffersFinish(to, finish)) {
            expect(moved.finish).toEqual(finish);
          } else {
            expect(moved).not.toHaveProperty("finish");
          }
        }
      }
    }
  });

  /** An undeclared pending material refuses nothing (ADR 0078 decision 3) — the colour survives the
   *  press rather than being dropped by a material that declares no offer. */
  it("keeps the pending colour when the pending material is undeclared", () => {
    const moved = chooseTierIn(
      chooseFinishIn({ materialTierId: PAL_TIER_ID }, PAL_ANTRACIT),
      { key: "material", tierId: "material.retired-tier" },
    );

    expect(moved.finish).toEqual(PAL_ANTRACIT);
  });

  /** ...and the group is then absent rather than present-and-empty, so wave 6G's recovery path
   *  still renders the other three groups. */
  it("renders no colour group at all for an undeclared pending material", () => {
    const view = viewOf({
      design: kitchenWithOneOverride(PAL_ANTRACIT),
      pending: { materialTierId: "material.retired-tier" },
    });

    expect(view.colourGroup).toBeUndefined();
    expect(markupOf(view)).toContain(
      content.globalSettings.groupHeadings.hardware,
    );
  });

  /** The group marks the pending material's declared default where nobody chose — and marking is not
   *  choosing, which is what stops *Aplică* stamping a colour into a document that has none. */
  it("marks a default without the pending choice acquiring it", () => {
    const pending = chooseTierIn(
      { materialTierId: PAL_TIER_ID },
      { key: "material", tierId: VENEER_TIER_ID },
    );
    const view = viewOf({
      design: kitchenWithOneOverride(PAL_ANTRACIT),
      pending,
    });

    expect(view.colourGroup?.selected).toEqual(
      materialById(VENEER_TIER_ID).defaultFinish,
    );
    expect(pending).not.toHaveProperty("finish");
  });

  /** `resolveOpeningChoice` applies the same rule to the id the sheet actually opens on: a stored
   *  colour the fallback material does not offer is dropped rather than shown as standing. */
  it("drops a stored colour the sheet's opening material refuses", () => {
    const opening = resolveOpeningChoice(
      { materialTierId: "material.retired-tier", finish: VENEER_NUC },
      offerOf(KITCHEN_L_DESIGN),
    );

    const resolved = lookUpMaterial(opening.materialTierId ?? PAL_TIER_ID);
    expect(resolved.kind).toBe("declared");
    if (resolved.kind !== "declared") return;
    if (materialOffersFinish(resolved.material, VENEER_NUC)) {
      expect(opening.finish).toEqual(VENEER_NUC);
    } else {
      expect(opening).not.toHaveProperty("finish");
    }
  });
});

describe("ADR 0099 decision 8 — the follow chip belongs to the editor and not to the sheet", () => {
  function panelSectionFor(finish: Finish | undefined) {
    const meta = occupiedMeta(finish === undefined ? {} : { finish });
    const panel = describePanel({
      content,
      material: PAL_KITCHEN,
      meta,
      offers: [],
      rejection: null,
      widthOptions: noWidthIsFree(meta.widthMm, meta.sizesMm),
      buildableWidthSpanMm: undefined,
      isBodyProbeAttached: true,
      canWrite: true,
      saveStatus: "idle",
    });
    return swatchSectionOf(panel);
  }

  /** **Exactly one standing choice, whatever the cabinet wears** — over every decor PAL offers and
   *  over the absence, so a marking rule that got one value right cannot pass. */
  it("marks exactly one choice in the section, over every decor and over absence", () => {
    const decors = offeredFinishesOf(materialById(PAL_TIER_ID));
    for (const finish of [...decors, undefined]) {
      const section = panelSectionFor(finish);
      const standing =
        section.chips.filter((chip) => chip.isActive).length +
        (section.follow?.isActive === true ? 1 : 0);

      expect(standing).toBe(1);
    }
  });

  /** The projection the **sheet** reads carries no follow chip: the sheet is the level being
   *  followed, so an offer there would be one this product cannot satisfy. */
  it("is absent from the projection the sheet renders, and from its markup", () => {
    const section = describeFinishSection(
      PAL_KITCHEN,
      PAL_ANTRACIT,
      WRITABLE,
      content,
    );
    expect(section).toBeDefined();
    if (section === undefined) return;

    expect(section).not.toHaveProperty("follow");
    const markup = renderToStaticMarkup(
      createElement(FinishSectionView, {
        section,
        onPick: () => undefined,
      }),
    );
    expect(markup).not.toContain(content.panel.finishFollowsKitchen);
  });
});

describe("ADR 0095 — the wave's Romanian, on the surface it was written for", () => {
  it("puts the colour group's three strings on the rendered sheet", () => {
    const markup = markupOf(
      viewOf({ design: kitchenWithOneOverride(PAL_ANTRACIT), pending: {} }),
    );

    for (const value of [
      content.globalSettings.colourHeading,
      content.globalSettings.colourNote,
      content.globalSettings.colourWarning,
    ]) {
      expect(markup).toContain(value);
    }
  });

  it("puts the whole-kitchen loss sentence on the rendered confirm step", () => {
    const view = viewOf({
      design: kitchenWithOneOverride(PAL_ANTRACIT),
      pending: { materialTierId: VENEER_TIER_ID },
      chosenColourCount: 0,
      globalFinishWouldBeLost: true,
    });
    const confirm = view.materialResetConfirm;
    expect(confirm).toBeDefined();
    if (confirm === undefined) return;

    const markup = renderToStaticMarkup(
      createElement(GlobalSettingsSurface, {
        id: "settings",
        view,
        editability: WRITABLE,
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

    expect(markup).toContain(
      content.globalSettings.materialResetConfirm.globalBody,
    );
    // The negative control: the *other* sentence, the one about cabinets, is not on this step.
    expect(markup).not.toContain(
      content.globalSettings.materialResetConfirm.body(3),
    );
  });

  /** The three MDF/veneer/PAL controls all render under the same heading, so the sheet's copy must
   *  not name a control shape it is not showing. */
  it("uses one heading for all three declared materials' controls", () => {
    for (const tierId of [PAL_TIER_ID, MDF_TIER_ID, VENEER_TIER_ID]) {
      const markup = markupOf(
        viewOf({
          design: kitchenWithOneOverride(PAL_ANTRACIT),
          pending: { materialTierId: tierId },
        }),
      );

      expect(markup).toContain(content.globalSettings.colourHeading);
    }
  });
});
