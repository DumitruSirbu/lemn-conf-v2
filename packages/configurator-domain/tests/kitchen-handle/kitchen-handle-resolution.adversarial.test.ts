// Adversarial QA of wave H1 (whole-kitchen handle). Each block names the claim it attacks.
//
// What this file does not cover: the hardware line and the scene, which receive `design.settings.handle` from wave H1b
// and are held to the kitchen handle by `kitchen-handle-readers-agree.*` here and in `three-adapter/tests`; every H1-b
// assertion in this file is at the `isPushToOpen` / `describeSelection` level.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { setCabinetDepth } from "../../src/commands/set-cabinet-depth.js";
import { setKitchenHandle } from "../../src/commands/set-kitchen-handle.js";
import {
  setGlobalFinish,
  setHardwareTier,
  setMaterialTier,
} from "../../src/commands/set-whole-kitchen-settings.js";
import {
  CurrentDesignSchema,
  DesignSchema,
  cabinetDepthMmOf,
  type Design,
  type Handle,
} from "../../src/design.js";
import {
  buildKitchenLBodyCatalog,
  KITCHEN_L_BODY_CATALOG,
  KITCHEN_L_DESIGN,
} from "../../src/fixtures/kitchen-l-design.js";
import { resolvedHandleOf } from "../../src/kitchen-handle/kitchen-handle.js";
import { toMillimetres } from "../../src/millimetres.js";
import { isPushToOpen, TOP_ROW_Y0_MM } from "../../src/push-to-open.js";
import { describeSelection } from "../../src/queries/describe-selection.js";
import { projectDesignForDisplay } from "../../src/queries/design-projection.js";
import type { PlacementRecord } from "../../src/void-engine.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";
import { createWorld } from "../support/kitchen-world.js";
import {
  documentsWithNoKitchenHandle,
  type NamedDocument,
} from "./handle-document-facts.js";

const OCCURRED_AT = "2026-10-26T09:30:00.000Z";
const A_HANDLE = fc.constantFrom<Handle>("steel", "black", "push");
const OWN_CHOICE = fc.constantFrom<Handle | undefined>(
  undefined,
  "steel",
  "black",
  "push",
);
const POOL: readonly NamedDocument[] = documentsWithNoKitchenHandle().filter(
  (document) => !document.name.endsWith("+own-handles"),
);

function dealt(
  document: NamedDocument,
  choices: readonly (Handle | undefined)[],
): Design {
  const placements = document.design.placements.map((placement, index) => {
    const own = choices[index % choices.length];
    return own === undefined
      ? placement
      : { ...placement, body: { ...placement.body, handle: own } };
  });
  return { ...document.design, placements };
}

function appliedHandle(design: Design, handle: Handle): Design {
  const result = setKitchenHandle({ design, handle, occurredAt: OCCURRED_AT });
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
  return result.design;
}

describe("the three readers agree for every placement of a dealt kitchen (H1-a)", () => {
  propertyTest.prop([
    fc.constantFrom(...POOL),
    fc.array(OWN_CHOICE, { minLength: 1, maxLength: 9 }),
    fc.option(A_HANDLE, { nil: undefined }),
  ])(
    "describeSelection.defaultHandle, isPushToOpen and resolvedHandleOf never contradict each other",
    (document, choices, kitchenHandle) => {
      const design = dealt(document, choices);
      const world = createWorld(design, document.catalog);
      const entryById = new Map(
        projectDesignForDisplay(design, document.catalog)
          .flatMap((group) => group.entries)
          .map((entry) => [entry.placementId, entry]),
      );

      for (const record of world.records) {
        const entry = entryById.get(record.id);
        if (!entry) throw new Error(`no display entry for ${record.id}`);
        const meta = describeSelection({
          ...world,
          target: { kind: "placement", id: record.id },
          kitchenSettings: { handle: kitchenHandle },
        });
        const isTopRow = entry.y0Mm >= TOP_ROW_Y0_MM;
        const latched = isPushToOpen({
          y0Mm: entry.y0Mm,
          recordedHandle: entry.handle,
          kitchenSettings: { handle: kitchenHandle },
          canHandle: record.canHandle,
        });

        // the floor the panel and the scene read (metres, rounded) is the floor the latch reads (millimetres)
        expect(toMillimetres(record.frame.y0)).toBe(entry.y0Mm);
        if (!record.canHandle) {
          expect(meta?.defaultHandle).toBe(isTopRow ? "push" : "steel");
          expect(latched).toBe(isTopRow);
        } else if (record.handleMode !== undefined) {
          expect(meta?.handle).toBe(record.handleMode);
          expect(latched).toBe(record.handleMode === "push");
        } else {
          const expected = isTopRow ? "push" : (kitchenHandle ?? "steel");
          expect(meta?.defaultHandle).toBe(expected);
          expect(latched).toBe(expected === "push");
          expect(
            resolvedHandleOf({
              ownHandle: undefined,
              kitchenSettings: { handle: kitchenHandle },
              canHandle: true,
              isTopRow,
            }),
          ).toBe(expected);
        }
      }
    },
  );
});

describe("the top-row boundary is one millimetre wide in both units (H1-a must-not)", () => {
  const world = createWorld(KITCHEN_L_DESIGN, KITCHEN_L_BODY_CATALOG);
  const record = world.records.find((candidate) => candidate.canHandle);
  if (!record)
    throw new Error("the seeded kitchen has no body that takes a handle");

  propertyTest.prop([
    fc.integer({ min: 2_150, max: 2_250 }),
    A_HANDLE,
    fc.constantFrom("division", "sum", "tenths"),
  ])(
    "a floor at %i mm is the top row for describeSelection exactly when it is for isPushToOpen",
    (floorMm, kitchenHandle, construction) => {
      const floorM = {
        division: floorMm / 1000,
        sum: (floorMm - 700) / 1000 + 0.7,
        tenths: floorMm / 100 / 10,
      }[construction];
      const moved: PlacementRecord = {
        ...record,
        frame: { ...record.frame, y0: floorM },
      };
      const meta = describeSelection({
        ...world,
        records: world.records.map((candidate) =>
          candidate.id === record.id ? moved : candidate,
        ),
        target: { kind: "placement", id: record.id },
        kitchenSettings: { handle: kitchenHandle },
      });
      const latched = isPushToOpen({
        y0Mm: toMillimetres(floorM),
        recordedHandle: undefined,
        kitchenSettings: { handle: kitchenHandle },
        canHandle: true,
      });

      expect(meta?.defaultHandle === "push" || kitchenHandle === "push").toBe(
        latched,
      );
      expect(meta?.defaultHandle).toBe(
        toMillimetres(floorM) >= TOP_ROW_Y0_MM ? "push" : kitchenHandle,
      );
    },
  );
});

describe("a cabinet whose own handle is the legacy null follows the kitchen as one with none (builders, H1b)", () => {
  const withNullOwnHandles = (design: Design): Design => ({
    ...design,
    placements: design.placements.map((placement) => ({
      ...placement,
      body: { ...placement.body, handle: null as unknown as Handle },
    })),
  });

  for (const kitchenHandle of [undefined, "steel", "black", "push"] as const) {
    it(`describes and latches every body as the absent key does under kitchen ${String(kitchenHandle)}`, () => {
      const absent: Design =
        kitchenHandle === undefined
          ? KITCHEN_L_DESIGN
          : {
              ...KITCHEN_L_DESIGN,
              settings: { ...KITCHEN_L_DESIGN.settings, handle: kitchenHandle },
            };
      const nulled = withNullOwnHandles(absent);
      const absentWorld = createWorld(absent, KITCHEN_L_BODY_CATALOG);
      const nulledWorld = createWorld(nulled, KITCHEN_L_BODY_CATALOG);

      for (const record of absentWorld.records) {
        const target = { kind: "placement", id: record.id } as const;
        const settings = { handle: kitchenHandle };

        expect(
          describeSelection({
            ...nulledWorld,
            target,
            kitchenSettings: settings,
          }),
        ).toEqual(
          describeSelection({
            ...absentWorld,
            target,
            kitchenSettings: settings,
          }),
        );
      }
      expect(projectDesignForDisplay(nulled, KITCHEN_L_BODY_CATALOG)).toEqual(
        projectDesignForDisplay(absent, KITCHEN_L_BODY_CATALOG),
      );
    });
  }
});

describe("setKitchenHandle refusals and shape (item 3)", () => {
  propertyTest.prop([
    fc.constantFrom(
      "",
      "yesterday",
      "2026-13-45T00:00:00.000Z",
      "2026-10-26",
      "2026-10-26T09:30:00Z",
      " 2026-10-26T09:30:00.000Z",
      "2026-10-26T09:30:00.000",
    ),
    A_HANDLE,
  ])(
    "refuses the timestamp %j with the very same design",
    (occurredAt, handle) => {
      const result = setKitchenHandle({
        design: KITCHEN_L_DESIGN,
        handle,
        occurredAt,
      });

      expect(result.ok).toBe(false);
      expect(result.design).toBe(KITCHEN_L_DESIGN);
    },
  );

  it("starting from a document with no settings at all, writes only the handle and stays valid", () => {
    const bare: Design = { ...KITCHEN_L_DESIGN };
    delete bare.settings;

    const after = appliedHandle(bare, "black");

    expect(after.settings).toEqual({ handle: "black" });
    expect(DesignSchema.safeParse(after).success).toBe(true);
  });
});

describe("settings.handle survives the other whole-kitchen commands (item 5)", () => {
  const depthCatalog = (depthMm: number) => buildKitchenLBodyCatalog(depthMm);
  const OTHER_COMMANDS: readonly [string, (design: Design) => Design][] = [
    [
      "setGlobalFinish",
      (design) =>
        ok(
          setGlobalFinish({
            design,
            finish: { kind: "palette-entry", entryId: "pal.alb" },
            occurredAt: OCCURRED_AT,
          }),
        ),
    ],
    [
      "setMaterialTier",
      (design) =>
        ok(
          setMaterialTier({
            design,
            tierId: "material-premium",
            availableTierIds: ["material-premium"],
            occurredAt: OCCURRED_AT,
          }),
        ),
    ],
    [
      "setHardwareTier",
      (design) =>
        ok(
          setHardwareTier({
            design,
            tierId: "hardware-premium",
            availableTierIds: ["hardware-premium"],
            occurredAt: OCCURRED_AT,
          }),
        ),
    ],
    [
      "setCabinetDepth",
      (design) =>
        ok(
          setCabinetDepth({
            design,
            catalogAt: depthCatalog,
            cabinetDepthMm: cabinetDepthMmOf(design) === 600 ? 700 : 600,
            probeAt: createFakeProbeFactory(),
            occurredAt: OCCURRED_AT,
          }),
        ),
    ],
  ];

  function ok(result: {
    ok: boolean;
    design: Design;
    reason?: unknown;
  }): Design {
    if (!result.ok) {
      throw new Error(`refused: ${JSON.stringify(result.reason)}`);
    }
    return result.design;
  }

  it.each(OTHER_COMMANDS)("%s keeps the kitchen handle", (_name, command) => {
    for (const handle of ["steel", "black", "push"] as const) {
      const after = command(appliedHandle(KITCHEN_L_DESIGN, handle));

      expect(after.settings?.handle).toBe(handle);
      expect(CurrentDesignSchema.safeParse(after).success).toBe(true);
    }
  });

  it.each(OTHER_COMMANDS)(
    "%s run after setKitchenHandle equals the same two commands in the other order, on settings",
    (_name, command) => {
      const handleFirst = command(appliedHandle(KITCHEN_L_DESIGN, "push"));
      const handleLast = appliedHandle(command(KITCHEN_L_DESIGN), "push");

      expect(handleFirst.settings).toEqual(handleLast.settings);
    },
  );
});

describe("choosing the kitchen handle is history-independent (H1-b)", () => {
  function latchesOf(document: NamedDocument, design: Design): number {
    const catalog = document.catalog;
    return projectDesignForDisplay(design, catalog)
      .flatMap((group) => group.entries)
      .filter((entry) =>
        isPushToOpen({
          y0Mm: entry.y0Mm,
          recordedHandle: entry.handle,
          kitchenSettings: { handle: design.settings?.handle },
          canHandle: catalog.get(entry.buildId)?.canHandle === true,
        }),
      ).length;
  }

  propertyTest.prop([
    fc.constantFrom(...POOL),
    fc.array(OWN_CHOICE, { minLength: 1, maxLength: 9 }),
    fc.array(A_HANDLE, { minLength: 1, maxLength: 8 }),
  ])(
    "the push-to-open count after any sequence of kitchen choices depends on the last one alone, and push-then-bars restores it",
    (document, choices, sequence) => {
      const start = dealt(document, choices);
      const walked = sequence.reduce(appliedHandle, start);
      const [last = "steel"] = sequence.slice(-1);
      const direct = appliedHandle(start, last);
      const base = latchesOf(document, start);

      expect(latchesOf(document, walked)).toBe(latchesOf(document, direct));
      for (const bars of ["steel", "black"] as const) {
        expect(
          latchesOf(
            document,
            appliedHandle(appliedHandle(start, "push"), bars),
          ),
        ).toBe(base);
      }
      expect(
        latchesOf(document, appliedHandle(start, "push")),
      ).toBeGreaterThanOrEqual(base);
    },
  );
});

describe("a document without settings.handle is untouched by every H1 seam (H1-c)", () => {
  it("serialises, parses and describes as it did, with no handle key anywhere", () => {
    for (const document of POOL) {
      expect(JSON.stringify(document.design)).not.toContain('"handle"');
      expect(CurrentDesignSchema.safeParse(document.design).success).toBe(true);
    }
  });
});
