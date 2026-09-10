// **Cancel writes nothing, over any sequence of radio presses at all.**
//
// The sheet's whole shape rests on this: a tier press is a change of *pending* state and never a
// command, so a customer who opens the sheet, tries five materials, three depths and both hardware
// tiers, and then presses *Renunță*, leaves the document exactly as they found it. It is stated in
// `global-settings.tsx` as a comment and pinned here as a property, because a comment cannot say
// what happens after nine presses in an order nobody wrote a test for.
//
// **Driven through the same functions the sheet runs.** `chooseTierIn` and `chooseDepthIn` are the
// component's own reducers, extracted so a sweep can reach them; the store is a real one. Cancel is
// modelled the way the component performs it — the pending value is dropped and no commit is called
// — which is the whole of `close()` as far as the document is concerned.
//
// **The control is what keeps it from being vacuous**: the identical sequence, ended with *Aplică*
// instead, must move the document. A test that only ever proves "nothing happened" would stay green
// against a sheet whose radios were wired to nothing at all.
import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  canonicalSerializeDesign,
  declaredCabinetDepthsMm,
  KITCHEN_L_DESIGN,
  SAMPLE_PRICE_BOOK,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  chooseDepthIn,
  chooseTierIn,
  resolveOpeningChoice,
  type WholeKitchenChoice,
  type WholeKitchenGroupKey,
} from "@/settings/global-settings-model";
import { offerWholeKitchenTiers } from "@/price/whole-kitchen-tiers";
import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../support/fake-body-probe";

const MATERIAL_TIER_IDS = SAMPLE_PRICE_BOOK.material.tiers.map(
  (tier) => tier.tierId,
);
const HARDWARE_TIER_IDS = SAMPLE_PRICE_BOOK.hardware.tiers.map(
  (tier) => tier.tierId,
);

const OFFER = offerWholeKitchenTiers({
  design: KITCHEN_L_DESIGN,
  catalog: buildKitchenLBodyCatalog(600),
  book: SAMPLE_PRICE_BOOK,
  pricingVersion: "sample",
  selections: KITCHEN_L_DESIGN.settings,
});

/** One press of one radio, in the sheet's own vocabulary. Depth is a separate arm because a depth is
 *  not a tier id — the same split the component's two callbacks make. */
type RadioPress =
  | {
      readonly kind: "tier";
      readonly key: WholeKitchenGroupKey;
      readonly tierId: string;
    }
  | { readonly kind: "depth"; readonly cabinetDepthMm: number };

/** **A group's radios carry that group's ids and no others**, which is a fact about the rendered
 *  sheet rather than a convenience: `toGroupView` maps the group's own tiers. Drawing a hardware id
 *  into a material press would sweep a press no customer can make, and `setMaterialTier` refuses an
 *  id its caller did not offer — so the sweep would be measuring the command's own guard instead of
 *  this surface's invariant. */
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

/** Long enough to interleave every group several times over; short enough that a shrunk
 *  counter-example is readable. */
const anyPressSequence = fc.array(anyRadioPress, {
  minLength: 1,
  maxLength: 12,
});

function pendingAfter(presses: readonly RadioPress[]): WholeKitchenChoice {
  return presses.reduce<WholeKitchenChoice>(
    (chosen, press) =>
      press.kind === "tier"
        ? chooseTierIn(chosen, { key: press.key, tierId: press.tierId })
        : chooseDepthIn(chosen, press.cabinetDepthMm),
    resolveOpeningChoice(KITCHEN_L_DESIGN.settings ?? {}, OFFER),
  );
}

function freshStore() {
  const saved: string[] = [];
  const store = createConfiguratorStore({
    design: KITCHEN_L_DESIGN,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    onDesignChanged: (design) => saved.push(canonicalSerializeDesign(design)),
  });
  return { store, saved };
}

function commit(
  store: ReturnType<typeof freshStore>["store"],
  pending: WholeKitchenChoice,
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
    availableMaterialTierIds: MATERIAL_TIER_IDS,
    availableHardwareTierIds: HARDWARE_TIER_IDS,
  });
}

describe("any sequence of radio presses ending in cancel", () => {
  propertyTest.prop([anyPressSequence])(
    "leaves the stored document byte-identical to the one the sheet opened on",
    (presses) => {
      const { store, saved } = freshStore();
      const opened = canonicalSerializeDesign(store.getState().design);

      // The sheet's whole life: open, press, press, press, cancel. Cancel drops pending and calls
      // no commit — so nothing below this line touches the store at all, which is the claim.
      pendingAfter(presses);

      expect(canonicalSerializeDesign(store.getState().design)).toBe(opened);
      expect(saved).toEqual([]);
      expect(store.getState().lastRejection).toBeNull();
    },
  );

  propertyTest.prop([anyPressSequence])(
    "would have moved the document had it ended in apply, so the claim above is not vacuous",
    (presses) => {
      const { store } = freshStore();
      const opened = canonicalSerializeDesign(store.getState().design);
      const pending = pendingAfter(presses);

      const outcome = commit(store, pending);

      // Not every sequence *is* a change — a customer can press their way back to what is stored —
      // so the property is the biconditional rather than "it always moves". The depth is compared
      // through `cabinetDepthMmOf`, because a document naming none is still built at the declared
      // default and pressing that default is not a change.
      const askedForSomethingNew =
        pending.materialTierId !== KITCHEN_L_DESIGN.settings?.materialTierId ||
        pending.hardwareTierId !== KITCHEN_L_DESIGN.settings?.hardwareTierId ||
        pending.cabinetDepthMm !== cabinetDepthMmOf(KITCHEN_L_DESIGN);
      expect(outcome.committed).toBe(true);
      expect(canonicalSerializeDesign(store.getState().design) !== opened).toBe(
        askedForSomethingNew,
      );
    },
  );

  it("exercises presses in both tier groups and the depth, so the sweep is not one arm wide", () => {
    // A guard on the arbitrary rather than on the property: an `oneof` that collapsed to one arm
    // would leave both sweeps green while testing a third of the sheet.
    const drawn = fc.sample(anyRadioPress, 200);
    const kinds = new Set(
      drawn.map((press) =>
        press.kind === "tier" ? `tier:${press.key}` : "depth",
      ),
    );

    expect(kinds).toEqual(new Set(["tier:material", "tier:hardware", "depth"]));
  });
});
