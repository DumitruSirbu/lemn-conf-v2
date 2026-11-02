// **Adversarial QA for wave Q2 (M10): the whole-kitchen handle inside one press of *Aplică*, attacked at the store.**
//
// `whole-kitchen-handle-apply.test.ts` drives the handle alone, or beside the depth. It never runs the handle beside
// the other three settings, never refuses a step that precedes it with the handle in the press, and compares nothing
// with an oracle written from the documented order. This file does, over every subset of the five settings:
//
//   - the chained press equals the five commands run by hand in the documented order (material, colour, hardware,
//     handle, depth), and its effect is the depth's whenever a depth is asked, else the last link's;
//   - a refusal at each step commits nothing, saves nothing, names the step, and never leaves the handle written;
//   - the handle plus a depth equals the two as separate store actions (the depth's frozen map survives the handle);
//   - the press never stamps a handle it was not asked for, and a re-applied handle runs no command;
//   - a save already out, and a design hydrated with a write still waiting;
//   - every effect kind that names no placement leaves the selection where it was (the fold into `CommandEffect`).
import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  canonicalSerializeDesign,
  declaredCabinetDepthsMm,
  KITCHEN_L_DESIGN,
  paletteFinish,
  freeColourFinish,
  SAMPLE_PRICE_BOOK,
  setCabinetDepth,
  setGlobalFinish,
  setHardwareTier,
  setKitchenHandle,
  setMaterialTier,
  type CommandEffect,
  type CommandResult,
  type Design,
  type Finish,
  type Handle,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import type { WaitingWrite } from "@/persistence/save-coalescer";
import { applyCommandResult as applyToStore } from "@/store/apply-command-result";
import { createConfiguratorStore } from "@/store/configurator-store";
import {
  preflightWholeKitchenSettings,
  type WholeKitchenSettingsRequest,
} from "@/store/whole-kitchen-apply";

import { createFakeProbeFactory } from "../support/fake-body-probe";

const CLOCK = "2026-11-02T10:00:00.000Z";

const MATERIAL_TIER_IDS = SAMPLE_PRICE_BOOK.material.tiers.map(
  (tier) => tier.tierId,
);
const HARDWARE_TIER_IDS = SAMPLE_PRICE_BOOK.hardware.tiers.map(
  (tier) => tier.tierId,
);
const OTHER_MATERIAL = "material.painted-mdf";
const OTHER_HARDWARE = HARDWARE_TIER_IDS.at(-1) ?? "";
const OTHER_DEPTH_MM =
  declaredCabinetDepthsMm().find(
    (depthMm) => depthMm !== cabinetDepthMmOf(KITCHEN_L_DESIGN),
  ) ?? 0;
const UNOFFERED_TIER_ID = "tier.the-book-never-offered";

/** A colour the melamine default offers, and one the painted MDF offers: a colour change only commits beside a
 *  material change when it is read against the material it lands on. */
const MELAMINE_FINISH: Finish = paletteFinish("pal.antracit");
const MDF_FINISH: Finish = freeColourFinish("#336699");

const SETTINGS = [
  "material",
  "finish",
  "hardware",
  "handle",
  "cabinetDepth",
] as const;
type Setting = (typeof SETTINGS)[number];

function storeOf(
  options: {
    readonly design?: Design;
    readonly hasProbe?: boolean;
    readonly adoptWaitingWrite?: () => WaitingWrite | undefined;
  } = {},
) {
  const saved: Design[] = [];
  const store = createConfiguratorStore({
    design: options.design ?? KITCHEN_L_DESIGN,
    catalogAt: buildKitchenLBodyCatalog,
    now: () => CLOCK,
    ...(options.hasProbe === false
      ? {}
      : { probeAt: createFakeProbeFactory() }),
    onDesignChanged: (design) => saved.push(design),
    ...(options.adoptWaitingWrite === undefined
      ? {}
      : { adoptWaitingWrite: options.adoptWaitingWrite }),
  });
  return { store, saved };
}

function requestFor(
  asked: ReadonlySet<Setting>,
  handle: Handle = "push",
): WholeKitchenSettingsRequest {
  const withMaterial = asked.has("material");
  return {
    availableMaterialTierIds: MATERIAL_TIER_IDS,
    availableHardwareTierIds: HARDWARE_TIER_IDS,
    ...(withMaterial ? { materialTierId: OTHER_MATERIAL } : {}),
    ...(asked.has("finish")
      ? { finish: withMaterial ? MDF_FINISH : MELAMINE_FINISH }
      : {}),
    ...(asked.has("hardware") ? { hardwareTierId: OTHER_HARDWARE } : {}),
    ...(asked.has("handle") ? { handle } : {}),
    ...(asked.has("cabinetDepth") ? { cabinetDepthMm: OTHER_DEPTH_MM } : {}),
  };
}

function everySubset(): readonly ReadonlySet<Setting>[] {
  return Array.from({ length: 1 << SETTINGS.length }, (_, mask) => {
    return new Set(SETTINGS.filter((_setting, index) => (mask >> index) & 1));
  });
}

function nameOf(asked: ReadonlySet<Setting>): string {
  return asked.size === 0 ? "(nothing)" : [...asked].join("+");
}

/** The documented order, run by hand over the domain's commands: the oracle the chain is held to. */
function byHandInTheDocumentedOrder(asked: ReadonlySet<Setting>): {
  readonly design: Design;
  readonly effectType: CommandEffect["type"] | undefined;
} {
  let design = KITCHEN_L_DESIGN;
  let effectType: CommandEffect["type"] | undefined;
  const step = (result: CommandResult): void => {
    if (!result.ok)
      throw new Error(`the oracle refused: ${result.reason.code}`);
    design = result.design;
    effectType = result.effect.type;
  };
  const withMaterial = asked.has("material");
  if (withMaterial)
    step(
      setMaterialTier({
        design,
        tierId: OTHER_MATERIAL,
        availableTierIds: MATERIAL_TIER_IDS,
        occurredAt: CLOCK,
      }),
    );
  if (asked.has("finish"))
    step(
      setGlobalFinish({
        design,
        finish: withMaterial ? MDF_FINISH : MELAMINE_FINISH,
        occurredAt: CLOCK,
      }),
    );
  if (asked.has("hardware"))
    step(
      setHardwareTier({
        design,
        tierId: OTHER_HARDWARE,
        availableTierIds: HARDWARE_TIER_IDS,
        occurredAt: CLOCK,
      }),
    );
  if (asked.has("handle"))
    step(setKitchenHandle({ design, handle: "push", occurredAt: CLOCK }));
  if (asked.has("cabinetDepth"))
    step(
      setCabinetDepth({
        design,
        catalogAt: buildKitchenLBodyCatalog,
        cabinetDepthMm: OTHER_DEPTH_MM,
        probeAt: createFakeProbeFactory(),
        occurredAt: CLOCK,
      }),
    );
  return { design, effectType };
}

function preflightOf(request: WholeKitchenSettingsRequest, hasProbe = true) {
  return preflightWholeKitchenSettings(request, {
    design: KITCHEN_L_DESIGN,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: hasProbe ? createFakeProbeFactory() : undefined,
    occurredAt: CLOCK,
  });
}

describe("the chain, over every subset of material, colour, hardware, handle and depth", () => {
  const subsets = everySubset();

  it("sweeps all thirty-two subsets", () => {
    expect(subsets).toHaveLength(32);
  });

  it.each(subsets.map((asked) => [nameOf(asked), asked] as const))(
    "%s: the press equals the commands run by hand in the documented order",
    (_name, asked) => {
      const outcome = preflightOf(requestFor(asked));
      const expected = byHandInTheDocumentedOrder(asked);

      if (asked.size === 0) {
        expect(outcome).toEqual({ outcome: "unchanged" });
        return;
      }
      if (outcome.outcome !== "ready") throw new Error(outcome.outcome);
      expect(canonicalSerializeDesign(outcome.result.design)).toBe(
        canonicalSerializeDesign(expected.design),
      );
      expect(outcome.result.effect.type).toBe(expected.effectType);
    },
  );

  it.each(
    subsets
      .filter((asked) => asked.has("handle"))
      .map((asked) => [nameOf(asked), asked] as const),
  )(
    "%s: the handle lands whatever else the press carries, and a depth keeps the last effect",
    (_name, asked) => {
      const outcome = preflightOf(requestFor(asked, "black"));

      if (outcome.outcome !== "ready") throw new Error(outcome.outcome);
      expect(outcome.result.design.settings?.handle).toBe("black");
      expect(outcome.result.effect.type).toBe(
        asked.has("cabinetDepth") ? "cabinet_depth_set" : "kitchen_handle_set",
      );
    },
  );

  it.each(
    subsets
      .filter((asked) => !asked.has("handle") && asked.size > 0)
      .map((asked) => [nameOf(asked), asked] as const),
  )("%s: a press that names no handle never writes one", (_name, asked) => {
    const outcome = preflightOf(requestFor(asked));

    if (outcome.outcome !== "ready") throw new Error(outcome.outcome);
    expect(outcome.result.design.settings).not.toHaveProperty("handle");
    expect(outcome.result.effect.type).not.toBe("kitchen_handle_set");
  });
});

describe("a refusal at each step, with the handle in the press", () => {
  /** Every step but the handle, each made to refuse while a later step (and the handle) could commit. */
  const REFUSING: readonly {
    readonly step: Setting;
    readonly request: WholeKitchenSettingsRequest;
    readonly hasProbe: boolean;
  }[] = [
    {
      step: "material",
      request: {
        ...requestFor(new Set<Setting>(["handle", "cabinetDepth"])),
        materialTierId: UNOFFERED_TIER_ID,
      },
      hasProbe: true,
    },
    {
      step: "finish",
      // A palette colour on a press that moves to painted MDF: the material's offer is free colours only.
      request: {
        ...requestFor(new Set<Setting>(["material", "handle", "cabinetDepth"])),
        finish: MELAMINE_FINISH,
      },
      hasProbe: true,
    },
    {
      step: "hardware",
      request: {
        ...requestFor(new Set<Setting>(["handle", "cabinetDepth"])),
        hardwareTierId: UNOFFERED_TIER_ID,
      },
      hasProbe: true,
    },
    {
      step: "handle",
      request: {
        ...requestFor(
          new Set<Setting>(["material", "hardware", "cabinetDepth"]),
        ),
        handle: "gold" as Handle,
      },
      hasProbe: true,
    },
    {
      step: "cabinetDepth",
      request: requestFor(
        new Set<Setting>(["material", "hardware", "handle", "cabinetDepth"]),
      ),
      hasProbe: false,
    },
  ];

  it.each(REFUSING.map((row) => [row.step, row] as const))(
    "%s refuses: the store is the same object as before, nothing is saved, the handle is not written",
    (step, row) => {
      const { store, saved } = storeOf({ hasProbe: row.hasProbe });
      const designBefore = store.getState().design;
      const recordsBefore = store.getState().records;

      const outcome = store.getState().applyWholeKitchenSettings(row.request);

      if (outcome.committed) throw new Error("expected a refusal");
      expect(outcome.setting).toBe(step);
      expect(store.getState().design).toBe(designBefore);
      expect(store.getState().records).toBe(recordsBefore);
      expect(store.getState().design.settings?.handle).toBeUndefined();
      expect(store.getState().lastRejection).toEqual(outcome.reason);
      expect(saved).toEqual([]);
    },
  );

  it("is not vacuous: each of those presses commits once its refusing member is taken out", () => {
    const { store } = storeOf();

    const outcome = store
      .getState()
      .applyWholeKitchenSettings(
        requestFor(
          new Set<Setting>([
            "material",
            "finish",
            "hardware",
            "handle",
            "cabinetDepth",
          ]),
        ),
      );

    expect(outcome).toEqual({ committed: true });
  });

  it("names the earlier step when two would refuse: a bad handle before a depth that cannot rebuild", () => {
    const outcome = preflightOf(
      {
        ...requestFor(new Set<Setting>(["cabinetDepth"])),
        handle: "gold" as Handle,
      },
      false,
    );

    expect(outcome).toMatchObject({ outcome: "refused", setting: "handle" });
  });

  it("names the material when a bad material and a bad handle are both asked for", () => {
    const outcome = preflightOf({
      ...requestFor(new Set<Setting>()),
      materialTierId: UNOFFERED_TIER_ID,
      handle: "gold" as Handle,
    });

    expect(outcome).toMatchObject({ outcome: "refused", setting: "material" });
  });

  it.each([null, 0, 1, "", "STEEL", " steel", "steel ", "push-to-open"])(
    "refuses the handle %j as an undeclared handle and writes nothing",
    (value) => {
      const outcome = preflightOf({
        ...requestFor(new Set<Setting>()),
        handle: value as unknown as Handle,
      });

      expect(outcome).toMatchObject({
        outcome: "refused",
        setting: "handle",
        reason: { code: "UNKNOWN_HANDLE" },
      });
    },
  );
});

describe("the depth's frozen map survives a handle in the same press", () => {
  it("lands where the depth and then the handle, as two separate store actions, land", () => {
    const chained = storeOf();
    const separate = storeOf();

    chained.store.getState().applyWholeKitchenSettings({
      availableMaterialTierIds: MATERIAL_TIER_IDS,
      availableHardwareTierIds: HARDWARE_TIER_IDS,
      handle: "black",
      cabinetDepthMm: OTHER_DEPTH_MM,
    });
    separate.store.getState().setCabinetDepth(OTHER_DEPTH_MM);
    separate.store.getState().applyWholeKitchenSettings({
      availableMaterialTierIds: MATERIAL_TIER_IDS,
      availableHardwareTierIds: HARDWARE_TIER_IDS,
      handle: "black",
    });

    /** Without `regions`: the one field the two routes disagree about on a document with no stored extents, which
     *  `qa-w2-apply-atomicity.adversarial.test.ts` measures and which no reader of the document sees. */
    const columnsOf = (store: typeof chained.store) =>
      [...store.getState().recordedColumns.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, column]) => [
          key,
          Object.fromEntries(
            Object.entries(column).filter(([field]) => field !== "regions"),
          ),
        ]);
    expect(canonicalSerializeDesign(chained.store.getState().design)).toBe(
      canonicalSerializeDesign(separate.store.getState().design),
    );
    expect(columnsOf(chained.store).length).toBeGreaterThan(0);
    expect(columnsOf(chained.store)).toEqual(columnsOf(separate.store));
    expect(chained.store.getState().records).toEqual(
      separate.store.getState().records,
    );
  });
});

describe("saving what a press changes", () => {
  it("schedules exactly one save for a press of all five settings", () => {
    const { store, saved } = storeOf();

    store
      .getState()
      .applyWholeKitchenSettings(
        requestFor(
          new Set<Setting>([
            "material",
            "finish",
            "hardware",
            "handle",
            "cabinetDepth",
          ]),
        ),
      );

    expect(saved).toHaveLength(1);
    expect(saved[0]?.settings?.handle).toBe("push");
    expect(saved[0]).toBe(store.getState().design);
  });

  it("runs no command and schedules no save when the handle named is the one stored, and leaves updatedAt alone", () => {
    const { store, saved } = storeOf();
    store.getState().applyWholeKitchenSettings({
      availableMaterialTierIds: [],
      availableHardwareTierIds: [],
      handle: "black",
    });
    const afterFirst = store.getState().design;
    saved.length = 0;

    const outcome = store.getState().applyWholeKitchenSettings({
      availableMaterialTierIds: [],
      availableHardwareTierIds: [],
      handle: "black",
    });

    expect(outcome).toEqual({ committed: true });
    expect(store.getState().design).toBe(afterFirst);
    expect(store.getState().design.updatedAt).toBe(afterFirst.updatedAt);
    expect(saved).toEqual([]);
  });

  it("applies while a save is out: the new design is held, scheduled again, and the save's state is not touched", () => {
    const { store, saved } = storeOf();
    store.getState().setSaveStatus("saving");

    const outcome = store.getState().applyWholeKitchenSettings({
      availableMaterialTierIds: [],
      availableHardwareTierIds: [],
      handle: "push",
    });

    expect(outcome).toEqual({ committed: true });
    expect(store.getState().design.settings?.handle).toBe("push");
    expect(store.getState().hasBeenEdited).toBe(true);
    expect(saved).toHaveLength(1);
    expect(store.getState().saveStatus).toBe("saving");
  });

  it("builds on a design hydrated with a waiting write, so the press re-applies against what the customer last chose", () => {
    const waitingDesign: Design = {
      ...KITCHEN_L_DESIGN,
      settings: { ...KITCHEN_L_DESIGN.settings, handle: "push" },
    };
    const { store, saved } = storeOf({
      adoptWaitingWrite: () => ({
        design: waitingDesign,
        expectedRevision: "1",
        resumesAtMs: null,
        heldAs: "sent",
      }),
    });
    store.getState().hydrate({
      design: KITCHEN_L_DESIGN,
      designId: "q2-waiting-write",
      revision: "1",
      canWrite: true,
    });
    expect(store.getState().design.settings?.handle).toBe("push");

    const same = store.getState().applyWholeKitchenSettings({
      availableMaterialTierIds: [],
      availableHardwareTierIds: [],
      handle: "push",
    });
    expect(same).toEqual({ committed: true });
    expect(saved).toEqual([]);

    store.getState().applyWholeKitchenSettings({
      availableMaterialTierIds: [],
      availableHardwareTierIds: [],
      handle: "black",
    });
    expect(store.getState().design.settings?.handle).toBe("black");
    expect(saved).toHaveLength(1);
    // The saved copy is the one still on disk: a press over a waiting write never reads it as the saved one.
    expect(store.getState().savedDesign).toBe(KITCHEN_L_DESIGN);
  });

  it("changes the settings key and the clock and no cabinet: every placement is the same object afterwards", () => {
    const { store } = storeOf();
    const before = store.getState().design;

    store.getState().applyWholeKitchenSettings({
      availableMaterialTierIds: [],
      availableHardwareTierIds: [],
      handle: "black",
    });

    const after = store.getState().design;
    expect(after.placements).toEqual(before.placements);
    expect(after.settings).toEqual({ ...before.settings, handle: "black" });
    expect(after.updatedAt).toBe(CLOCK);
  });
});

/** Every effect kind that names no placement, built by its own command. A kind added to `CommandEffect` and left out
 *  of the union below fails to compile here, which is the exhaustiveness check the fold needs. */
type TargetedEffect =
  | "placement_removed"
  | "body_inserted"
  | "body_resized"
  | "finish_set"
  | "finish_cleared"
  | "handle_set";
const WHOLE_KITCHEN_RESULTS: Record<
  Exclude<CommandEffect["type"], TargetedEffect>,
  (design: Design) => CommandResult
> = {
  material_tier_set: (design) =>
    setMaterialTier({
      design,
      tierId: OTHER_MATERIAL,
      availableTierIds: MATERIAL_TIER_IDS,
      occurredAt: CLOCK,
    }),
  hardware_tier_set: (design) =>
    setHardwareTier({
      design,
      tierId: OTHER_HARDWARE,
      availableTierIds: HARDWARE_TIER_IDS,
      occurredAt: CLOCK,
    }),
  global_finish_set: (design) =>
    setGlobalFinish({
      design,
      finish: MELAMINE_FINISH,
      occurredAt: CLOCK,
    }),
  kitchen_handle_set: (design) =>
    setKitchenHandle({
      design,
      handle: "black",
      occurredAt: CLOCK,
    }),
  cabinet_depth_set: (design) =>
    setCabinetDepth({
      design,
      catalogAt: buildKitchenLBodyCatalog,
      cabinetDepthMm: OTHER_DEPTH_MM,
      probeAt: createFakeProbeFactory(),
      occurredAt: CLOCK,
    }),
};

describe("the fold of every whole-kitchen effect into the selection", () => {
  const seeded = (() => {
    const { store } = storeOf();
    // Removing one cabinet leaves an opening to select, and every other cabinet stays.
    store.getState().select({
      kind: "placement",
      id: store.getState().records[0]?.id ?? "",
    });
    store.getState().remove();
    return store.getState();
  })();
  const aPlacement = {
    kind: "placement" as const,
    id: seeded.records[0]?.id ?? "",
  };
  const aVoid = { kind: "void" as const, id: seeded.voids[0]?.id ?? "" };
  const dangling = {
    kind: "placement" as const,
    id: "no-such-placement",
  };
  const kinds = Object.keys(
    WHOLE_KITCHEN_RESULTS,
  ) as (keyof typeof WHOLE_KITCHEN_RESULTS)[];

  function foldOf(
    kind: (typeof kinds)[number],
    selection: typeof aPlacement | typeof aVoid | typeof dangling | null,
  ) {
    return applyToStore({
      result: WHOLE_KITCHEN_RESULTS[kind](seeded.design),
      catalog: seeded.catalog,
      columns: seeded.recordedColumns,
      selection,
    });
  }

  it("has a placement and a void to select in the seeded kitchen", () => {
    expect(aPlacement.id).not.toBe("");
    expect(aVoid.id).not.toBe("");
  });

  it.each(kinds)(
    "%s keeps a selected cabinet, a selected opening, and nothing",
    (kind) => {
      for (const held of [aPlacement, aVoid, null]) {
        const folded = foldOf(kind, held);
        if (!folded.applied) throw new Error("the command refused");
        expect(folded.state.selection).toEqual(held);
      }
    },
  );

  it.each(kinds)(
    "%s drops a selection that no longer exists, rather than carrying it through",
    (kind) => {
      const folded = foldOf(kind, dangling);
      if (!folded.applied) throw new Error("the command refused");
      expect(folded.state.selection).toBeNull();
    },
  );

  it("answers a kitchen-handle result with the handle written and the placements untouched", () => {
    const folded = foldOf("kitchen_handle_set", aPlacement);
    if (!folded.applied) throw new Error("the command refused");
    expect(folded.state.design.settings?.handle).toBe("black");
    expect(folded.state.design.placements).toEqual(seeded.design.placements);
  });
});
