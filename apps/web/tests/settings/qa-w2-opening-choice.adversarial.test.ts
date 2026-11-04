// **Adversarial QA for wave W2, attack 4: `resolveOpeningChoice` must not become a stamp.**
//
// The wave's own `withdrawn-tier-recovery.test.ts` drives one withdrawn group at a time and one
// untouched document. That leaves the cases where seeding a default is most tempting and most
// damaging untested:
//
//   - **both** groups withdrawn at once, so the press writes two ids the customer never chose;
//   - a tier withdrawn **between** opening the sheet and pressing *Aplică*, where pending already
//     holds an id the book has stopped offering;
//   - **re-opening after a cancel**, where a stale pending value would carry a previous session's
//     choice into a document that never received it;
//   - a book whose **default is itself withdrawn**, which is what the fallback resolves to;
//   - the **depth**, which `resolveOpeningChoice` deliberately does not resolve.
//
// And the invariant as a swept property rather than as three examples: over any sequence of radio
// presses, a group the document leaves unnamed is still unnamed after *Renunță*, and re-opening
// starts from the document again.
import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  canonicalSerializeDesign,
  declaredCabinetDepthsMm,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
  priceDesign,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  type Design,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  offerWholeKitchenTiers,
  UnofferedDefaultTierError,
  type WholeKitchenTierOffer,
} from "@/price/whole-kitchen-tiers";
import {
  chooseDepthIn,
  chooseTierIn,
  resolveOpeningChoice,
  type WholeKitchenChoice,
  type WholeKitchenGroupKey,
} from "@/settings/global-settings-model";
import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";
import { MEASURED_DEEPENING_ROWS } from "../support/deepening-rows";
import { NOTHING_DISABLED } from "../support/availability";

/** Fixed, so a failing run is reproducible from the file rather than from a CI log. */
const PROPERTY_SEED = 20260907;

const MATERIAL_TIER_IDS = SAMPLE_PRICE_BOOK.material.tiers.map(
  (tier) => tier.tierId,
);
const HARDWARE_TIER_IDS = SAMPLE_PRICE_BOOK.hardware.tiers.map(
  (tier) => tier.tierId,
);

const WITHDRAWN_MATERIAL_TIER_ID = "material.withdrawn";
const WITHDRAWN_HARDWARE_TIER_ID = "hardware.withdrawn";

function offerFor(design: Design): WholeKitchenTierOffer {
  return offerWholeKitchenTiers({
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
    selections: design.settings,
  });
}

function designWith(settings: Design["settings"]): Design {
  return { ...KITCHEN_L_DESIGN, ...(settings ? { settings } : {}) };
}

function storeFor(design: Design) {
  const saved: Design[] = [];
  const store = createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    onDesignChanged: (one) => saved.push(one),
  });
  return { store, saved };
}

/** One press of *Aplică*, exactly as `applyPending` composes it: only the fields pending names, and
 *  the offered lists the sheet was rendering when the button was pressed. */
function pressApply(
  store: ReturnType<typeof storeFor>["store"],
  pending: WholeKitchenChoice,
  offered: {
    readonly material: readonly string[];
    readonly hardware: readonly string[];
  },
) {
  return store.getState().applyWholeKitchenSettings({
    ...(pending.materialTierId === undefined
      ? {}
      : { materialTierId: pending.materialTierId }),
    ...(pending.hardwareTierId === undefined
      ? {}
      : { hardwareTierId: pending.hardwareTierId }),
    ...(pending.cabinetDepthMm === undefined
      ? {}
      : { cabinetDepthMm: pending.cabinetDepthMm }),
    availableMaterialTierIds: offered.material,
    availableHardwareTierIds: offered.hardware,
  });
}

describe("a document whose two tiers were both withdrawn", () => {
  const bothWithdrawn = designWith({
    materialTierId: WITHDRAWN_MATERIAL_TIER_ID,
    hardwareTierId: WITHDRAWN_HARDWARE_TIER_ID,
  });

  it("cannot be priced, so this is the state one press has to recover from", () => {
    expect(priceDesignOf(bothWithdrawn).ok).toBe(false);
  });

  it("opens both groups on their displayed fallback, not one of them", () => {
    // The single-group cases pass with a resolver that only ever rewrites the first key it finds.
    const opening = resolveOpeningChoice(
      bothWithdrawn.settings ?? {},
      offerFor(bothWithdrawn),
    );

    expect(opening.materialTierId).toBe(
      SAMPLE_PRICE_BOOK.material.defaultTierId,
    );
    expect(opening.hardwareTierId).toBe(
      SAMPLE_PRICE_BOOK.hardware.defaultTierId,
    );
  });

  it("prices again after one press with no radio touched, and writes both ids together", () => {
    const { store, saved } = storeFor(bothWithdrawn);
    const opening = resolveOpeningChoice(
      bothWithdrawn.settings ?? {},
      offerFor(bothWithdrawn),
    );

    const outcome = pressApply(store, opening, {
      material: MATERIAL_TIER_IDS,
      hardware: HARDWARE_TIER_IDS,
    });

    expect(outcome.committed).toBe(true);
    expect(priceDesignOf(store.getState().design).ok).toBe(true);
    // One document, not two: the recovery is subject to the wave's own atomicity rule.
    expect(saved.length).toBe(1);
  });
});

describe("a tier withdrawn between opening the sheet and pressing apply", () => {
  it("is refused by name rather than written or silently dropped", () => {
    // The sheet opened while the book still offered the tier, so pending holds an id that was
    // legitimate when it was chosen. `applyPending` sends the offered list the sheet is rendering
    // *now*, so the press must be refused — never committed, and never quietly reduced to the other
    // settings the same press asked for.
    const { store, saved } = storeFor(KITCHEN_L_DESIGN);
    const opening = resolveOpeningChoice(
      KITCHEN_L_DESIGN.settings ?? {},
      offerFor(KITCHEN_L_DESIGN),
    );
    const chosenWhileOffered = chooseTierIn(opening, {
      key: "material",
      tierId: MATERIAL_TIER_IDS.at(-1) ?? "",
    });
    const bookAfterWithdrawal = MATERIAL_TIER_IDS.filter(
      (tierId) => tierId !== chosenWhileOffered.materialTierId,
    );
    const before = canonicalSerializeDesign(store.getState().design);

    const outcome = pressApply(store, chosenWhileOffered, {
      material: bookAfterWithdrawal,
      hardware: HARDWARE_TIER_IDS,
    });

    if (outcome.committed) throw new Error("expected the material to refuse");
    expect(outcome.setting).toBe("material");
    expect(canonicalSerializeDesign(store.getState().design)).toBe(before);
    expect(saved).toEqual([]);
  });

  it("takes the surviving hardware choice down with it, because one press is one commit", () => {
    // The half-apply this wave exists to remove, reached through the book rather than through the
    // probe: the hardware id in the same press is perfectly good and must still not be written.
    const { store, saved } = storeFor(KITCHEN_L_DESIGN);
    const opening = resolveOpeningChoice(
      KITCHEN_L_DESIGN.settings ?? {},
      offerFor(KITCHEN_L_DESIGN),
    );
    const chosen = chooseTierIn(
      chooseTierIn(opening, {
        key: "material",
        tierId: MATERIAL_TIER_IDS.at(-1) ?? "",
      }),
      { key: "hardware", tierId: HARDWARE_TIER_IDS.at(-1) ?? "" },
    );

    const outcome = pressApply(store, chosen, {
      material: MATERIAL_TIER_IDS.filter(
        (tierId) => tierId !== chosen.materialTierId,
      ),
      hardware: HARDWARE_TIER_IDS,
    });

    expect(outcome.committed).toBe(false);
    expect(store.getState().design.settings?.hardwareTierId).toBe(
      KITCHEN_L_DESIGN.settings?.hardwareTierId,
    );
    expect(saved).toEqual([]);
  });
});

describe("a book whose own default is the withdrawn tier", () => {
  it("is refused where the offer is built, so the fallback can never resolve to nothing", () => {
    // `offeredOrFallback` reaches `selectedTierIn`, whose fallback is the group's `defaultTierId`.
    // A book that does not offer its own default would leave that with no answer — so the guard has
    // to fire before a sheet is ever described, not inside the resolver.
    const bookWithoutItsDefault = {
      ...SAMPLE_PRICE_BOOK,
      material: {
        ...SAMPLE_PRICE_BOOK.material,
        tiers: SAMPLE_PRICE_BOOK.material.tiers.filter(
          (tier) => tier.tierId !== SAMPLE_PRICE_BOOK.material.defaultTierId,
        ),
      },
    };

    expect(() =>
      offerWholeKitchenTiers({
        design: KITCHEN_L_DESIGN,
        catalog: KITCHEN_L_BODY_CATALOG,
        book: bookWithoutItsDefault,
        pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
        deepeningRows: MEASURED_DEEPENING_ROWS,
        availability: NOTHING_DISABLED,
        selections: KITCHEN_L_DESIGN.settings,
      }),
    ).toThrow(UnofferedDefaultTierError);
  });
});

describe("the depth, which the resolver deliberately leaves alone", () => {
  it("stays absent where the document names none, so no press can rebuild every body by default", () => {
    // ADR 0074: committing a depth rebuilds every body and redraws the scene. Seeding the declared
    // default here would make an untouched *Aplică* on a pre-6J-a document do exactly that.
    const untouched = designWith({});

    const opening = resolveOpeningChoice(
      untouched.settings ?? {},
      offerFor(untouched),
    );

    expect(opening.cabinetDepthMm).toBeUndefined();
    expect("cabinetDepthMm" in opening).toBe(false);
  });

  it("keeps a stored depth exactly as stored, in either declared value", () => {
    for (const cabinetDepthMm of declaredCabinetDepthsMm()) {
      const design = designWith({ cabinetDepthMm });

      const opening = resolveOpeningChoice(
        design.settings ?? {},
        offerFor(design),
      );

      expect(opening.cabinetDepthMm, String(cabinetDepthMm)).toBe(
        cabinetDepthMm,
      );
    }
  });
});

describe("re-opening the sheet", () => {
  it("starts from the document again, whatever the last session chose and cancelled", () => {
    // `openSheet` re-seeds pending from `design.settings` on every open. The failure this guards
    // against is a resolver that returned its own previous answer — a cancel that wrote nothing to
    // the document but everything to the next opening.
    const design = designWith({ materialTierId: WITHDRAWN_MATERIAL_TIER_ID });
    const firstOpening = resolveOpeningChoice(
      design.settings ?? {},
      offerFor(design),
    );
    const afterPressing = chooseDepthIn(
      chooseTierIn(firstOpening, {
        key: "hardware",
        tierId: HARDWARE_TIER_IDS.at(-1) ?? "",
      }),
      declaredCabinetDepthsMm().at(-1) ?? 0,
    );
    expect(afterPressing).not.toEqual(firstOpening);

    const secondOpening = resolveOpeningChoice(
      design.settings ?? {},
      offerFor(design),
    );

    expect(secondOpening).toEqual(firstOpening);
  });

  it("is a fixed point, so opening on what was just applied changes nothing further", () => {
    // The recovery writes the resolved id. Re-opening on that document must resolve to itself, or
    // the sheet would keep proposing a change after the change has been made.
    for (const applied of [
      {},
      { materialTierId: WITHDRAWN_MATERIAL_TIER_ID },
      { hardwareTierId: WITHDRAWN_HARDWARE_TIER_ID },
      {
        materialTierId: WITHDRAWN_MATERIAL_TIER_ID,
        hardwareTierId: WITHDRAWN_HARDWARE_TIER_ID,
      },
      { materialTierId: MATERIAL_TIER_IDS.at(-1) ?? "" },
    ]) {
      const design = designWith(applied);
      const offer = offerFor(design);
      const once = resolveOpeningChoice(applied, offer);

      expect(
        resolveOpeningChoice(once, offer),
        JSON.stringify(applied),
      ).toEqual(once);
    }
  });
});

/** One press of one radio, in the sheet's own vocabulary. */
type RadioPress =
  | {
      readonly kind: "tier";
      readonly key: WholeKitchenGroupKey;
      readonly tierId: string;
    }
  | { readonly kind: "depth"; readonly cabinetDepthMm: number };

const anyRadioPress: fc.Arbitrary<RadioPress> = fc.oneof(
  fc.record({
    kind: fc.constant("tier" as const),
    key: fc.constant<WholeKitchenGroupKey>("material"),
    tierId: fc.constantFrom(...MATERIAL_TIER_IDS),
  }),
  fc.record({
    kind: fc.constant("tier" as const),
    key: fc.constant<WholeKitchenGroupKey>("hardware"),
    tierId: fc.constantFrom(...HARDWARE_TIER_IDS),
  }),
  fc.record({
    kind: fc.constant("depth" as const),
    cabinetDepthMm: fc.constantFrom(...declaredCabinetDepthsMm()),
  }),
);

/** **The documents the invariant is hardest on**, swept alongside the ordinary one: a document that
 *  names nothing is the one a stamp would damage, and a withdrawn id is the one the resolver
 *  rewrites. `pending-choice-invariant.test.ts` sweeps presses over the seeded design only. */
const anyStartingSettings = fc.constantFrom<Design["settings"][]>(
  {},
  { materialTierId: WITHDRAWN_MATERIAL_TIER_ID },
  { hardwareTierId: WITHDRAWN_HARDWARE_TIER_ID },
  {
    materialTierId: WITHDRAWN_MATERIAL_TIER_ID,
    hardwareTierId: WITHDRAWN_HARDWARE_TIER_ID,
  },
  KITCHEN_L_DESIGN.settings ?? {},
  { cabinetDepthMm: declaredCabinetDepthsMm().at(-1) ?? 0 },
);

const anyPressSequence = fc.array(anyRadioPress, {
  minLength: 0,
  maxLength: 10,
});

describe("any sequence of presses on any of these documents", () => {
  // That a session ending in cancel writes nothing is not swept here. A press sequence is a pure fold over the
  // pending choice and this file has no cancel to call, so a property built from the two compared a store nothing had
  // touched with itself. The cancel button is pressed on the rendered sheet in `global-settings-inert.dom.test.ts`,
  // "leaving the sheet with a choice pending".

  propertyTest.prop([anyStartingSettings, anyPressSequence], {
    seed: PROPERTY_SEED,
  })(
    "never names a group the document left unnamed and the customer never pressed",
    (settings, presses) => {
      // The trap `resolveOpeningChoice`'s own comment names, swept: an absent choice may become
      // named only by a press aimed at that group. A resolver that seeded the book's default would
      // fail this on the empty press sequence.
      const design = designWith(settings);
      const { store } = storeFor(design);

      const outcome = pressApply(store, pressesFrom(design, presses), {
        material: MATERIAL_TIER_IDS,
        hardware: HARDWARE_TIER_IDS,
      });

      expect(outcome.committed).toBe(true);
      const stored = store.getState().design.settings ?? {};
      for (const [key, group] of [
        ["materialTierId", "material"],
        ["hardwareTierId", "hardware"],
      ] as const) {
        const wasNamed = settings?.[key] !== undefined;
        const wasPressed = presses.some(
          (press) => press.kind === "tier" && press.key === group,
        );
        if (!wasNamed && !wasPressed)
          expect(stored[key], `${key} was stamped`).toBeUndefined();
      }
    },
  );

  propertyTest.prop([anyStartingSettings, anyPressSequence], {
    seed: PROPERTY_SEED,
  })(
    "would have moved the document had it ended in apply on a group it did press, so the sweep is not vacuous",
    (settings, presses) => {
      const design = designWith(settings);
      const { store } = storeFor(design);
      const pending = pressesFrom(design, presses);

      pressApply(store, pending, {
        material: MATERIAL_TIER_IDS,
        hardware: HARDWARE_TIER_IDS,
      });

      const stored = store.getState().design.settings ?? {};
      const lastMaterialPress = [...presses]
        .reverse()
        .find((press) => press.kind === "tier" && press.key === "material");
      if (lastMaterialPress?.kind === "tier")
        expect(stored.materialTierId).toBe(lastMaterialPress.tierId);
      const lastDepthPress = [...presses]
        .reverse()
        .find((press) => press.kind === "depth");
      if (lastDepthPress?.kind === "depth")
        expect(cabinetDepthMmOf(store.getState().design)).toBe(
          lastDepthPress.cabinetDepthMm,
        );
    },
  );
});

/** The sheet's whole pending life: seeded by `openSheet`, then one reducer call per press. */
function pressesFrom(
  design: Design,
  presses: readonly RadioPress[],
): WholeKitchenChoice {
  return presses.reduce<WholeKitchenChoice>(
    (chosen, press) =>
      press.kind === "tier"
        ? chooseTierIn(chosen, { key: press.key, tierId: press.tierId })
        : chooseDepthIn(chosen, press.cabinetDepthMm),
    resolveOpeningChoice(design.settings ?? {}, offerFor(design)),
  );
}

function priceDesignOf(design: Design) {
  return priceDesign({
    design,
    catalog: KITCHEN_L_BODY_CATALOG,
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    deepeningRows: MEASURED_DEEPENING_ROWS,
    availability: NOTHING_DISABLED,
    selections: design.settings,
  });
}
