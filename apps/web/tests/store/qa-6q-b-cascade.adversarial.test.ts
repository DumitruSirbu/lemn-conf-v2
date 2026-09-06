// **Adversarial QA for wave 6Q-b's "one result, not a cascade" criterion, at the seam a cascade
// would actually be written.**
//
// The criterion's own words: *"a cascade cannot be represented in `CommandResult<MaterialTierSetEffect>`,
// so the criterion is not about the command's type — it is about what a **surface** could
// reintroduce: applying the material and then walking the placements calling `setFinish`."* The
// shipped store test asserts `onDesignChanged` once on the veneer direction. This file attacks the
// premise underneath it — that the fixture makes *N* ≥ 2 genuinely, in **every** direction the
// customer can tap, not only the one the assertion happens to read — and adds the two observations a
// cascade would move that a single count cannot see: the number of intermediate designs the store
// published, and the number of distinct `updatedAt` values the document ends up holding.
import {
  buildKitchenLBodyCatalog,
  materialById,
  materialOffersFinish,
  MATERIAL_IDS,
  sameFinish,
  SAMPLE_PRICE_BOOK,
  type Design,
} from "@lemnaria/configurator-domain";
import { describe, expect, it, vi } from "vitest";

import { createFakeProbeFactory } from "../support/fake-body-probe";
import {
  countMovedFinishes,
  FINISHES_RESOLVED_BY_VENEER,
  HOOD_PLACEMENT_ID,
  MDF_KITCHEN_WEARING_CHOSEN_COLOURS,
  VENEER_TIER_ID,
} from "../support/mdf-kitchen-wearing-chosen-colours";

const { createConfiguratorStore } = await import("@/store/configurator-store");

const OCCURRED_AT = "2026-09-04T12:00:00.000Z";
const MATERIAL_TIER_IDS = SAMPLE_PRICE_BOOK.material.tiers.map(
  (tier) => tier.tierId,
);

function storeOver(design: Design, onDesignChanged?: (design: Design) => void) {
  return createConfiguratorStore({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    now: () => OCCURRED_AT,
    ...(onDesignChanged ? { onDesignChanged } : {}),
  });
}

// **Attack 1 — the fixture makes N ≥ 2 in every direction, not only the one the assertion reads.**
//
// The old version of the shipped assertion was vacuous because `KITCHEN_L_DESIGN` carries no finish
// at all. The replacement is only non-vacuous for the directions where the fixture actually moves
// something; a later edit that leaves veneer moving two while PAL moves none would keep the shipped
// test green and quietly re-vacuum the other tabs.
describe("the fixture makes the reset genuinely destructive in every direction", () => {
  // Including MDF → MDF, which ADR 0084 decision 3 records as also resolving two — the woods — so
  // "re-applying the tier already set" is not a silent skip at the store seam either.
  it.each(MATERIAL_IDS)(
    "moves at least two cabinets when %s is applied",
    (tierId) => {
      const store = storeOver(MDF_KITCHEN_WEARING_CHOSEN_COLOURS);

      store.getState().setMaterialTier(tierId, MATERIAL_TIER_IDS);

      expect(
        countMovedFinishes(
          MDF_KITCHEN_WEARING_CHOSEN_COLOURS,
          store.getState().design,
        ),
      ).toBeGreaterThanOrEqual(2);
    },
  );

  it("moves exactly the two free-colour bodies when veneer is applied", () => {
    const store = storeOver(MDF_KITCHEN_WEARING_CHOSEN_COLOURS);

    store.getState().setMaterialTier(VENEER_TIER_ID, MATERIAL_TIER_IDS);

    const moved = store
      .getState()
      .design.placements.filter((placement, index) => {
        const was =
          MDF_KITCHEN_WEARING_CHOSEN_COLOURS.placements[index]?.body.finish;
        const now = placement.body.finish;
        if (was === undefined || now === undefined) return was !== now;
        return !sameFinish(was, now);
      })
      .map((placement) => placement.id);

    expect(moved).toEqual(["p0", "p1"]);
    expect(moved).toHaveLength(FINISHES_RESOLVED_BY_VENEER);
  });
});

// **Attack 2 — a cascade, measured three ways rather than one.**
//
// `onDesignChanged` once is the criterion's own observation. Two more, because a cascade written
// with a coalescer in front of it could still publish once: the store's own state must be published
// once (a cascade would set state N + 1 times, which a subscriber counts), and the document must
// carry exactly one `updatedAt` — a per-cabinet `setFinish` walk stamps the clock per call, which is
// invisible in a document that holds one field only if every call used the same value.
describe("applying a material publishes one design, whatever it resets", () => {
  it.each(MATERIAL_IDS)(
    "notifies the save path exactly once for %s",
    (tierId) => {
      const onDesignChanged = vi.fn();
      const store = storeOver(
        MDF_KITCHEN_WEARING_CHOSEN_COLOURS,
        onDesignChanged,
      );

      store.getState().setMaterialTier(tierId, MATERIAL_TIER_IDS);

      expect(onDesignChanged).toHaveBeenCalledTimes(1);
      expect(onDesignChanged.mock.calls[0]?.[0]).toBe(store.getState().design);
    },
  );

  it("sets the store's design exactly once, which a coalescer cannot hide", () => {
    const store = storeOver(MDF_KITCHEN_WEARING_CHOSEN_COLOURS);
    const published: Design[] = [];
    const unsubscribe = store.subscribe((state, previous) => {
      if (state.design !== previous.design) published.push(state.design);
    });

    store.getState().setMaterialTier(VENEER_TIER_ID, MATERIAL_TIER_IDS);
    unsubscribe();

    expect(published).toHaveLength(1);
    expect(published[0]).toBe(store.getState().design);
  });

  it("leaves the whole document on one updatedAt", () => {
    const store = storeOver(MDF_KITCHEN_WEARING_CHOSEN_COLOURS);

    store.getState().setMaterialTier(VENEER_TIER_ID, MATERIAL_TIER_IDS);

    expect(store.getState().design.updatedAt).toBe(OCCURRED_AT);
    expect(store.getState().design.createdAt).toBe(
      MDF_KITCHEN_WEARING_CHOSEN_COLOURS.createdAt,
    );
  });
});

// **Attack 3 — what the store leaves behind is a document the write seam accepts.**
//
// The command's guarantee is only worth anything if the thing the store then saves is a document
// `PUT /api/designs/[id]` would not refuse. That is the round trip nothing in the wave asserts at the
// store seam.
describe("the design the store publishes satisfies the invariant the write seam refuses on", () => {
  it.each(MATERIAL_IDS)(
    "carries only finishes %s offers, and adds none",
    (tierId) => {
      const store = storeOver(MDF_KITCHEN_WEARING_CHOSEN_COLOURS);
      const bareBefore = MDF_KITCHEN_WEARING_CHOSEN_COLOURS.placements
        .filter((placement) => placement.body.finish === undefined)
        .map((placement) => placement.id);

      store.getState().setMaterialTier(tierId, MATERIAL_TIER_IDS);
      const after = store.getState().design;
      const material = materialById(tierId);

      for (const placement of after.placements) {
        const carried = placement.body.finish;
        if (carried === undefined) continue;
        expect({
          id: placement.id,
          offered: materialOffersFinish(material, carried),
        }).toEqual({ id: placement.id, offered: true });
      }
      expect(
        after.placements
          .filter((placement) => placement.body.finish === undefined)
          .map((placement) => placement.id),
      ).toEqual(bareBefore);
      expect(bareBefore).toContain(HOOD_PLACEMENT_ID);
    },
  );
});
