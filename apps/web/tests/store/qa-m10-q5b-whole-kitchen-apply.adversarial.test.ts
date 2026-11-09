// Q5b's adversarial pass over the one-press preflight: which stored levels make a replacement real, what makes it dropped, the
// order material -> replacement -> depth with the depth's frozen columns surviving, what a refusal is reported under, and
// that a whole press is one commit and one save or nothing at all.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredCabinetDepthsMm,
  fatalDesignValidationIssues,
  validateDesignForCatalog,
  HandleSchema,
  KITCHEN_L_DESIGN,
  paletteFinish,
  type Design,
  type Finish,
  type Handle,
} from "@lemnaria/configurator-domain";
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "@/store/configurator-store";
import {
  preflightWholeKitchenSettings,
  type AppearanceReplacement,
  type WholeKitchenSettingsRequest,
} from "@/store/whole-kitchen-apply";

import { createFakeProbeFactory } from "../support/fake-body-probe";

const OCCURRED_AT = "2026-11-09T09:00:00.000Z";
const TIERS = {
  availableMaterialTierIds: [
    "material.melamine",
    "material.veneer",
    "material.painted-mdf",
  ],
  availableHardwareTierIds: ["hardware.standard"],
} as const;
const WHITE = paletteFinish("pal.alb");
const ANTHRACITE = paletteFinish("pal.antracit");
const HAVANNA = paletteFinish("pal.gri-havanna");
const VENEER_OAK = paletteFinish("veneer.stejar");
const DEEPER_DEPTH_MM = 700;
const ANOTHER_DEPTH_MM =
  declaredCabinetDepthsMm().find(
    (depthMm) => depthMm !== cabinetDepthMmOf(KITCHEN_L_DESIGN),
  ) ?? 0;

function withSettings(
  settings: NonNullable<Design["settings"]>,
  design: Design = KITCHEN_L_DESIGN,
): Design {
  return { ...design, settings: { ...design.settings, ...settings } };
}

function withBody(
  design: Design,
  index: number,
  body: Partial<Design["placements"][number]["body"]>,
): Design {
  return {
    ...design,
    placements: design.placements.map((placement, at) =>
      at === index
        ? { ...placement, body: { ...placement.body, ...body } }
        : placement,
    ),
  };
}

function preflight(
  request: Partial<WholeKitchenSettingsRequest>,
  design: Design,
) {
  return preflightWholeKitchenSettings(
    { ...TIERS, ...request },
    {
      design,
      catalogAt: buildKitchenLBodyCatalog,
      probeAt: createFakeProbeFactory(),
      occurredAt: OCCURRED_AT,
    },
  );
}

function ready(outcome: ReturnType<typeof preflight>): Design {
  if (outcome.outcome !== "ready") {
    throw new Error(`expected ready, got ${outcome.outcome}`);
  }
  return outcome.result.design;
}

const finishReplacement = (
  from: Finish,
  to: Finish,
): AppearanceReplacement => ({
  kind: "finish",
  from,
  to,
});
const handleReplacement = (
  from: Handle,
  to: Handle,
): AppearanceReplacement => ({
  kind: "handle",
  from,
  to,
});

describe("a replacement is real exactly when the replaced item is stored at some level", () => {
  it.each([
    ["the kitchen's colour only", withSettings({ finish: WHITE })],
    [
      "one cabinet's colour only",
      withBody(KITCHEN_L_DESIGN, 3, { finish: WHITE }),
    ],
    [
      "the last cabinet's colour only",
      withBody(KITCHEN_L_DESIGN, KITCHEN_L_DESIGN.placements.length - 1, {
        finish: WHITE,
      }),
    ],
  ])("runs for a colour stored at %s, and rewrites it", (_where, design) => {
    const after = ready(
      preflight({ replacement: finishReplacement(WHITE, HAVANNA) }, design),
    );

    expect(JSON.stringify(after)).not.toContain("pal.alb");
    expect(JSON.stringify(after)).toContain("pal.gri-havanna");
  });

  it.each([
    ["the kitchen's handle only", withSettings({ handle: "black" })],
    ["the top row's handle only", withSettings({ topRowHandle: "black" })],
    [
      "one cabinet's handle only",
      withBody(KITCHEN_L_DESIGN, 2, { handle: "black" }),
    ],
  ])("runs for a handle stored at %s, and rewrites it", (_where, design) => {
    const after = ready(
      preflight({ replacement: handleReplacement("black", "push") }, design),
    );

    expect(JSON.stringify(after)).not.toContain('"black"');
    expect(JSON.stringify(after)).toContain('"push"');
  });

  it("is dropped, as unchanged, for a colour the design stores only as other colours", () => {
    const design = withBody(withSettings({ finish: ANTHRACITE }), 1, {
      finish: VENEER_OAK,
    });

    expect(
      preflight({ replacement: finishReplacement(WHITE, HAVANNA) }, design),
    ).toEqual({ outcome: "unchanged" });
  });

  it("is dropped when the stored colour is a free one that differs by value from the replaced palette entry", () => {
    const design = withSettings({
      finish: { kind: "free-colour", value: "#ffffff" },
    });

    expect(
      preflight({ replacement: finishReplacement(WHITE, HAVANNA) }, design),
    ).toEqual({ outcome: "unchanged" });
  });

  it("runs for a free colour that equals the replaced one by value (sameFinish, not identity)", () => {
    const design = withSettings({
      finish: { kind: "free-colour", value: "#ff0000" },
    });

    const after = ready(
      preflight(
        {
          replacement: finishReplacement(
            { kind: "free-colour", value: "#ff0000" },
            HAVANNA,
          ),
        },
        design,
      ),
    );

    expect(after.settings?.finish).toEqual(HAVANNA);
  });

  propertyTest.prop([
    fc.constantFrom(...HandleSchema.options),
    fc.constantFrom(...HandleSchema.options),
  ])(
    "a handle swapped for itself, or for anything when nothing stores it, is never a command (unchanged)",
    (from, to) => {
      const design = withSettings({ handle: "steel" });

      const outcome = preflight(
        { replacement: handleReplacement(from, to) },
        design,
      );

      expect(outcome.outcome).toBe(
        from === "steel" && to !== "steel" ? "ready" : "unchanged",
      );
    },
  );

  it("no request, no replacement and no setting is unchanged, whatever the kitchen stores", () => {
    expect(
      preflight({}, withSettings({ finish: WHITE, handle: "black" })),
    ).toEqual({ outcome: "unchanged" });
    expect(preflight({ replacement: undefined }, KITCHEN_L_DESIGN)).toEqual({
      outcome: "unchanged",
    });
  });
});

describe("the order of a press: material, then the replacement, then the depth", () => {
  const veneerKitchen = withSettings({
    materialTierId: "material.veneer",
    finish: VENEER_OAK,
    handle: "black",
  });

  function storeHolding(design: Design) {
    const saved: Design[] = [];
    const store = createConfiguratorStore({
      design,
      catalogAt: buildKitchenLBodyCatalog,
      now: () => OCCURRED_AT,
      probeAt: createFakeProbeFactory(),
      onDesignChanged: (changed) => saved.push(changed),
    });
    return { store, saved };
  }

  /** The kitchen with its oven tower cleared (so a member-less column stands there) and a handle to replace: the shape on
   *  which a depth change must move frozen extents (ADR 0090), which only the depth command's own map can do. */
  function kitchenWithAClearedTower(): Design {
    const { store } = storeHolding(veneerKitchen);
    for (const id of ["p5", "p22"]) {
      store.getState().select({ kind: "placement", id });
      store.getState().remove();
    }
    return store.getState().design;
  }

  it("keeps the depth's frozen columns when a replacement shares the press: the document ends exactly where the same changes in separate presses end, and it still validates", () => {
    const base = kitchenWithAClearedTower();
    const together = storeHolding(base);
    const apart = storeHolding(base);
    const replacement = handleReplacement("black", "push");

    together.store.getState().applyWholeKitchenSettings({
      ...TIERS,
      materialTierId: "material.melamine",
      replacement,
      cabinetDepthMm: DEEPER_DEPTH_MM,
    });
    apart.store.getState().applyWholeKitchenSettings({
      ...TIERS,
      materialTierId: "material.melamine",
      replacement,
    });
    apart.store.getState().applyWholeKitchenSettings({
      ...TIERS,
      cabinetDepthMm: DEEPER_DEPTH_MM,
    });

    const one = together.store.getState();
    const other = apart.store.getState();
    expect(cabinetDepthMmOf(one.design)).toBe(DEEPER_DEPTH_MM);
    expect(base.emptyColumns?.length).toBeGreaterThan(0);
    expect(one.design.columnExtents).toEqual(other.design.columnExtents);
    expect(one.design.emptyColumns).toEqual(other.design.emptyColumns);
    expect(one.design.placements).toEqual(other.design.placements);
    expect(one.design.settings).toEqual(other.design.settings);
    expect([...one.columns.keys()]).toEqual([...other.columns.keys()]);
    expect(
      fatalDesignValidationIssues(
        validateDesignForCatalog(
          one.design,
          buildKitchenLBodyCatalog(DEEPER_DEPTH_MM),
        ),
      ),
    ).toEqual([]);
  });

  it("applies the replacement to the design the material left, so a handle replacement survives the material change (a material touches no handle)", () => {
    const after = ready(
      preflight(
        {
          materialTierId: "material.melamine",
          replacement: handleReplacement("black", "push"),
        },
        veneerKitchen,
      ),
    );

    expect(after.settings?.materialTierId).toBe("material.melamine");
    expect(after.settings?.handle).toBe("push");
    expect(after.settings?.finish).toEqual(WHITE);
  });

  it("refuses a colour the new material does not offer under the colour, and the whole press with it (nothing half applied)", () => {
    const { store, saved } = storeHolding(veneerKitchen);
    const before = store.getState().design;

    const answer = store.getState().applyWholeKitchenSettings({
      ...TIERS,
      materialTierId: "material.melamine",
      replacement: finishReplacement(VENEER_OAK, paletteFinish("veneer.nuc")),
    });

    expect(answer).toMatchObject({
      committed: false,
      setting: "finish",
      reason: { code: "FINISH_NOT_OFFERED" },
    });
    expect(store.getState().design).toBe(before);
    expect(saved).toEqual([]);
  });

  it("reports a refused handle replacement under the handle and a refused depth under the depth, committing neither", () => {
    const { store, saved } = storeHolding(veneerKitchen);
    const before = store.getState().design;
    const unknown = "telepathy" as unknown as Handle;

    const refusedHandle = store.getState().applyWholeKitchenSettings({
      ...TIERS,
      replacement: { kind: "handle", from: "black", to: unknown },
    });

    expect(refusedHandle).toMatchObject({
      committed: false,
      setting: "handle",
      reason: { code: "UNKNOWN_HANDLE" },
    });
    expect(store.getState().design).toBe(before);

    const withoutProbe = createConfiguratorStore({
      design: veneerKitchen,
      catalogAt: buildKitchenLBodyCatalog,
      now: () => OCCURRED_AT,
      onDesignChanged: (changed) => saved.push(changed),
    });
    const refusedDepth = withoutProbe.getState().applyWholeKitchenSettings({
      ...TIERS,
      replacement: handleReplacement("black", "push"),
      cabinetDepthMm: ANOTHER_DEPTH_MM,
    });

    expect(refusedDepth).toMatchObject({
      committed: false,
      setting: "cabinetDepth",
    });
    expect(withoutProbe.getState().design.settings?.handle).toBe("black");
    expect(saved).toEqual([]);
  });

  it("a press of a material, a replacement and a depth is one commit and one save", () => {
    const { store, saved } = storeHolding(veneerKitchen);

    const answer = store.getState().applyWholeKitchenSettings({
      ...TIERS,
      materialTierId: "material.melamine",
      replacement: handleReplacement("black", "push"),
      cabinetDepthMm: ANOTHER_DEPTH_MM,
    });

    expect(answer).toEqual({ committed: true });
    expect(saved).toHaveLength(1);
  });

  it("a colour replacement the same press's material change makes moot still commits once, and the colour is the one the material set", () => {
    const { store, saved } = storeHolding(veneerKitchen);

    store.getState().applyWholeKitchenSettings({
      ...TIERS,
      materialTierId: "material.melamine",
      replacement: finishReplacement(VENEER_OAK, WHITE),
    });

    expect(saved).toHaveLength(1);
    expect(store.getState().design.settings?.finish).toEqual(WHITE);
  });
});
