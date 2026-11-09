// A switched-off colour or handle replaced inside one press of the replacement sheet (A-16): planned beside the other
// whole-kitchen settings, run after the handle and before the depth, and dropped whenever it would change nothing, so a
// press that owes nothing is no command and no save.
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  declaredCabinetDepthsMm,
  KITCHEN_L_DESIGN,
  paletteFinish,
  type Design,
  type Handle,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { createConfiguratorStore } from "@/store/configurator-store";
import {
  preflightWholeKitchenSettings,
  type AppearanceReplacement,
  type WholeKitchenSettingsRequest,
} from "@/store/whole-kitchen-apply";

import { createFakeProbeFactory } from "../support/fake-body-probe";

const OCCURRED_AT = "2026-11-09T09:00:00.000Z";
const NO_TIERS = {
  availableMaterialTierIds: ["material.melamine", "material.veneer"],
  availableHardwareTierIds: [],
} as const;

const WHITE = paletteFinish("pal.alb");
const ANTHRACITE = paletteFinish("pal.antracit");
const HAVANNA = paletteFinish("pal.gri-havanna");

const ANOTHER_DEPTH_MM =
  declaredCabinetDepthsMm().find(
    (depthMm) => depthMm !== cabinetDepthMmOf(KITCHEN_L_DESIGN),
  ) ?? 0;

/** A kitchen wearing white at the kitchen level and on two cabinets, one cabinet in anthracite, the rest following. */
function kitchenWearingWhite(): Design {
  const [first, second, third, ...others] = KITCHEN_L_DESIGN.placements;
  if (first === undefined || second === undefined || third === undefined) {
    throw new Error("the sample kitchen has fewer than three cabinets");
  }
  return {
    ...KITCHEN_L_DESIGN,
    settings: { ...KITCHEN_L_DESIGN.settings, finish: WHITE },
    placements: [
      { ...first, body: { ...first.body, finish: WHITE } },
      { ...second, body: { ...second.body, finish: ANTHRACITE } },
      third,
      ...others,
    ],
  };
}

/** A kitchen whose handle and top-row handle are black, one cabinet's own is black and another's is steel. */
function kitchenWearingBlackHandles(): Design {
  const [first, second, ...others] = KITCHEN_L_DESIGN.placements;
  if (first === undefined || second === undefined) {
    throw new Error("the sample kitchen has fewer than two cabinets");
  }
  return {
    ...KITCHEN_L_DESIGN,
    settings: {
      ...KITCHEN_L_DESIGN.settings,
      handle: "black",
      topRowHandle: "black",
    },
    placements: [
      { ...first, body: { ...first.body, handle: "black" } },
      { ...second, body: { ...second.body, handle: "steel" } },
      ...others,
    ],
  };
}

function preflight(
  request: Partial<WholeKitchenSettingsRequest>,
  design: Design,
) {
  return preflightWholeKitchenSettings(
    { ...NO_TIERS, ...request },
    {
      design,
      catalogAt: buildKitchenLBodyCatalog,
      probeAt: createFakeProbeFactory(),
      occurredAt: OCCURRED_AT,
    },
  );
}

function readyDesign(outcome: ReturnType<typeof preflight>): Design {
  if (outcome.outcome !== "ready") throw new Error(outcome.outcome);
  return outcome.result.design;
}

const REPLACING_WHITE: AppearanceReplacement = {
  kind: "finish",
  from: WHITE,
  to: HAVANNA,
};
const REPLACING_BLACK: AppearanceReplacement = {
  kind: "handle",
  from: "black",
  to: "push",
};

describe("a press that replaces a colour", () => {
  it("rewrites the kitchen's colour and every cabinet wearing it, and no other colour", () => {
    const design = readyDesign(
      preflight({ replacement: REPLACING_WHITE }, kitchenWearingWhite()),
    );

    expect(design.settings?.finish).toEqual(HAVANNA);
    expect(design.placements.map((placement) => placement.body.finish)).toEqual(
      [
        HAVANNA,
        ANTHRACITE,
        ...kitchenWearingWhite()
          .placements.slice(2)
          .map(() => undefined),
      ],
    );
  });

  it("reports the replacement's own effect", () => {
    const outcome = preflight(
      { replacement: REPLACING_WHITE },
      kitchenWearingWhite(),
    );

    if (outcome.outcome !== "ready") throw new Error(outcome.outcome);
    expect(outcome.result.effect).toEqual({
      type: "colour_replaced",
      from: WHITE,
      to: HAVANNA,
    });
  });

  it("names the colour as the refused setting when the design's material does not offer the replacement", () => {
    const outcome = preflight(
      {
        replacement: {
          kind: "finish",
          from: WHITE,
          to: paletteFinish("veneer.nuc"),
        },
      },
      kitchenWearingWhite(),
    );

    expect(outcome).toMatchObject({
      outcome: "refused",
      setting: "finish",
      reason: { code: "FINISH_NOT_OFFERED" },
    });
  });
});

describe("a press that replaces a handle", () => {
  it("rewrites the kitchen's, the top row's and each cabinet's own that is the replaced handle, and no other", () => {
    const design = readyDesign(
      preflight({ replacement: REPLACING_BLACK }, kitchenWearingBlackHandles()),
    );

    expect(design.settings).toMatchObject({
      handle: "push",
      topRowHandle: "push",
    });
    expect(
      design.placements.slice(0, 2).map((placement) => placement.body.handle),
    ).toEqual(["push", "steel"]);
  });

  it("names the handle as the refused setting when the replacement is no handle", () => {
    const outcome = preflight(
      { replacement: { kind: "handle", from: "black", to: "gold" as Handle } },
      kitchenWearingBlackHandles(),
    );

    expect(outcome).toMatchObject({
      outcome: "refused",
      setting: "handle",
      reason: { code: "UNKNOWN_HANDLE" },
    });
  });
});

describe("a replacement that would change nothing is dropped, so it runs no command", () => {
  it.each([
    {
      name: "a colour for itself",
      replacement: { kind: "finish", from: WHITE, to: WHITE } as const,
      design: kitchenWearingWhite(),
    },
    {
      name: "a colour the design stores nowhere",
      replacement: { kind: "finish", from: HAVANNA, to: ANTHRACITE } as const,
      design: kitchenWearingWhite(),
    },
    {
      name: "a handle for itself",
      replacement: { kind: "handle", from: "black", to: "black" } as const,
      design: kitchenWearingBlackHandles(),
    },
    {
      name: "a handle the design stores nowhere",
      replacement: { kind: "handle", from: "push", to: "steel" } as const,
      design: kitchenWearingBlackHandles(),
    },
  ])("$name", ({ replacement, design }) => {
    expect(preflight({ replacement }, design)).toEqual({
      outcome: "unchanged",
    });
  });

  it("finds a colour that only a cabinet stores, which the kitchen's own settings do not name", () => {
    const design = kitchenWearingWhite();
    const cabinetOnly: Design = {
      ...design,
      settings: { ...design.settings, finish: HAVANNA },
    };

    const outcome = preflight({ replacement: REPLACING_WHITE }, cabinetOnly);

    expect(readyDesign(outcome).placements[0]?.body.finish).toEqual(HAVANNA);
  });
});

describe("the order inside one press", () => {
  it("runs a replacement after the material and before the depth, so the result the store applies still carries the depth's column map", () => {
    const outcome = preflight(
      {
        materialTierId: "material.melamine",
        replacement: REPLACING_WHITE,
        cabinetDepthMm: ANOTHER_DEPTH_MM,
      },
      kitchenWearingWhite(),
    );

    if (outcome.outcome !== "ready") throw new Error(outcome.outcome);
    expect(outcome.result.effect.type).toBe("cabinet_depth_set");
    expect(outcome.result.design.settings?.finish).toEqual(HAVANNA);
    expect(cabinetDepthMmOf(outcome.result.design)).toBe(ANOTHER_DEPTH_MM);
  });
});

describe("a replacement through the store", () => {
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

  it("is one commit and one save", () => {
    const { store, saved } = storeHolding(kitchenWearingWhite());

    const answer = store
      .getState()
      .applyWholeKitchenSettings({ ...NO_TIERS, replacement: REPLACING_WHITE });

    expect(answer).toEqual({ committed: true });
    expect(saved).toHaveLength(1);
    expect(store.getState().design.settings?.finish).toEqual(HAVANNA);
  });

  it("schedules no save for a replacement of something the design does not store", () => {
    const { store, saved } = storeHolding(kitchenWearingWhite());
    const before = store.getState().design;

    const answer = store.getState().applyWholeKitchenSettings({
      ...NO_TIERS,
      replacement: { kind: "finish", from: HAVANNA, to: ANTHRACITE },
    });

    expect(answer).toEqual({ committed: true });
    expect(saved).toHaveLength(0);
    expect(store.getState().design).toBe(before);
  });
});
