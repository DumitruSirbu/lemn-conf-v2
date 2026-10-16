// Composition splits and merges member-less columns at its own width limit, never the editor's, and hands over a
// design re-derived by the editor's uncapped rule (see 8U plan §6.1). The getter below switches `module-grid.ts`'s
// `MAX_EMPTY_COLUMN_WIDTH_MM`, which no longer bounds the editor's merge but still bounds the commands' own cuts and
// the reconcile's split: 800 is today's tree, `Infinity` the tree once those cuts are retired (8U plan S5).
// It starts at `Infinity`, so a limit read once at module load is read in that world as well.
import { describe, expect, it, vi } from "vitest";

import type { BodyProbeFactory } from "../../src/body-probe.js";
import {
  cabinetDepthMmOf,
  type Design,
  type DesignRoom,
  type DesignWall,
} from "../../src/design.js";
import { buildKitchenLBodyCatalog } from "../../src/fixtures/kitchen-l-design.js";
import {
  generateKitchen,
  replayGenerationLog,
  type GenerateKitchenResult,
} from "../../src/generation/generate-kitchen.js";
import { toMetres } from "../../src/millimetres.js";
import {
  derivePlacementRecords,
  deriveRecordedColumns,
  projectFrozenMap,
} from "../../src/void-engine.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";

const cutsLimit = vi.hoisted(() => ({
  widthMm: Number.POSITIVE_INFINITY,
}));

vi.mock("../../src/module-grid.js", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const switchable: Record<string, unknown> = { ...actual };
  Object.defineProperty(switchable, "MAX_EMPTY_COLUMN_WIDTH_MM", {
    get: () => cutsLimit.widthMm,
    enumerable: true,
  });
  return switchable;
});

const OCCURRED_AT = "2026-10-16T12:00:00.000Z";
const TODAYS_CUT_MM = 800;
const NO_CUT_MM = Number.POSITIVE_INFINITY;

/** Each room is here for a site of composition's limit it reaches, pinned by `reaches` so the set cannot lose it. */
const ROOMS: readonly {
  readonly name: string;
  readonly room: DesignRoom;
  readonly reaches: (composed: Composed) => boolean;
}[] = [
  {
    name: "the owner's L, whose wall B has no opening for its first body when the planned tiles merge",
    room: { shape: "L", widthMm: 4100, depthMm: 3300, heightMm: 2600 },
    reaches: ({ result }) =>
      result.log.steps.some((step) => step.id === "sink"),
  },
  {
    name: "an L whose free-end body is stepped back to its planned width",
    room: { shape: "L", widthMm: 1600, depthMm: 1700, heightMm: 2600 },
    reaches: ({ result }) =>
      result.log.commands.some((command) => command.type === "set_width"),
  },
  {
    name: "a straight room",
    room: { shape: "linear", widthMm: 3600, depthMm: 3400, heightMm: 2600 },
    reaches: ({ result }) => result.design.room.shape === "linear",
  },
  {
    name: "a U whose upper row over each corner is tiled 800 + 100",
    room: {
      shape: "U",
      widthMm: 2700,
      depthMm: 1600,
      wallCMm: 5700,
      heightMm: 2600,
    },
    reaches: ({ result }) =>
      memberlessSpansOn(result.design, "A").some(
        (span) => span.startMm === 800 && span.endMm === 900,
      ),
  },
];

interface Composed {
  readonly result: Extract<GenerateKitchenResult, { readonly ok: true }>;
}

describe("composition's width limit, whatever the editor's", () => {
  it.each(ROOMS)(
    "composes $name byte-identically, design and log, with the editor uncapped",
    ({ room, reaches }) => {
      const todays = composedWithTheCutsAt(TODAYS_CUT_MM, room);
      const uncapped = composedWithTheCutsAt(NO_CUT_MM, room);

      expect(reaches(todays)).toBe(true);
      expect(uncapped.result).toStrictEqual(todays.result);
    },
  );

  it.each(ROOMS)(
    "replays $name to the design it composed, with the editor uncapped",
    ({ room }) => {
      const { result } = composedWithTheCutsAt(NO_CUT_MM, room);

      const replayed = replayGenerationLog({
        log: result.log,
        probeAt: createFakeProbeFactory(),
      });

      expect(replayed).toStrictEqual(result.design);
    },
  );

  it.each(ROOMS)(
    "delivers $name in the uncapped editor's canonical form: its own load gives back the stored map",
    ({ room }) => {
      const { result } = composedWithTheCutsAt(NO_CUT_MM, room);

      expect(storedMapAsTheEditorLoadsIt(result.design)).toStrictEqual(
        storedMapOf(result.design),
      );
    },
  );
});

// Generated kitchens hold no pair the finishing step would join, so these refuse one row's inserts to leave two planned
// 600 mm tiles member-less side by side (wall A, 1500-2100 and 2100-2700); composition's limit keeps them apart.
describe("the finishing step, given two member-less planned tiles side by side (criterion 15a)", () => {
  const ROOM_WITH_TWO_STORAGE_TILES: DesignRoom = {
    shape: "L",
    widthMm: 3400,
    depthMm: 3500,
    heightMm: 2600,
  };
  const REFUSED_BUILD_ID = "base-cabinet";
  const LEFT_TILE = { startMm: 1500, endMm: 2100 };
  const RIGHT_TILE = { startMm: 2100, endMm: 2700 };
  const BOTH_TILES = { startMm: 1500, endMm: 2700 };

  it("joins them into one 1200 mm column in the design generateKitchen returns, with the commands' cuts at 800", () => {
    const result = composedRefusing(
      REFUSED_BUILD_ID,
      TODAYS_CUT_MM,
      ROOM_WITH_TWO_STORAGE_TILES,
    );

    const spans = memberlessSpansOn(result.design, "A");
    expect(spans).toContainEqual(BOTH_TILES);
    expect(spans).not.toContainEqual(LEFT_TILE);
    expect(spans).not.toContainEqual(RIGHT_TILE);
  });

  it("joins them into one 1200 mm column in the design generateKitchen returns, with the editor uncapped", () => {
    const result = composedRefusing(
      REFUSED_BUILD_ID,
      NO_CUT_MM,
      ROOM_WITH_TWO_STORAGE_TILES,
    );

    const spans = memberlessSpansOn(result.design, "A");
    expect(spans).toContainEqual(BOTH_TILES);
    expect(spans).not.toContainEqual(LEFT_TILE);
  });

  it("joins them into one 1200 mm column in the design replayGenerationLog returns, with the editor uncapped", () => {
    const result = composedRefusing(
      REFUSED_BUILD_ID,
      NO_CUT_MM,
      ROOM_WITH_TWO_STORAGE_TILES,
    );

    const replayed = replayGenerationLog({
      log: result.log,
      probeAt: probeRefusing(REFUSED_BUILD_ID),
    });

    const spans = memberlessSpansOn(replayed, "A");
    expect(spans).toContainEqual(BOTH_TILES);
    expect(spans).not.toContainEqual(LEFT_TILE);
  });
});

function composedWithTheCutsAt(cutMm: number, room: DesignRoom): Composed {
  cutsLimit.widthMm = cutMm;
  return { result: composedOrThrow(room, createFakeProbeFactory()) };
}

function composedRefusing(
  buildId: string,
  cutMm: number,
  room: DesignRoom,
): Composed["result"] {
  cutsLimit.widthMm = cutMm;
  const result = composedOrThrow(room, probeRefusing(buildId));
  const refused = result.log.steps.filter(
    (step) => step.buildId === buildId && step.status === "not_placed",
  );
  expect(refused.length).toBeGreaterThanOrEqual(2);
  return result;
}

function composedOrThrow(
  room: DesignRoom,
  probeAt: BodyProbeFactory,
): Composed["result"] {
  const result = generateKitchen({ room, occurredAt: OCCURRED_AT, probeAt });
  if (!result.ok) throw new Error(`${JSON.stringify(room)} did not compose`);
  return result;
}

/** The fake probe, reporting every `buildId` carcass 100 mm wider than asked, so `insertBody` refuses that row. */
function probeRefusing(buildId: string): BodyProbeFactory {
  const OVERSIZE_M = 0.1;
  const fake = createFakeProbeFactory();
  return (cabinetDepthMm) => {
    const lease = fake(cabinetDepthMm);
    return {
      use: (borrow) =>
        lease.use((probe) =>
          borrow({
            measure: (request) => {
              const measured = probe.measure(request);
              return request.buildId === buildId
                ? {
                    ...measured,
                    carcassWidthM: measured.carcassWidthM + OVERSIZE_M,
                  }
                : measured;
            },
          }),
        ),
    };
  };
}

function storedMapOf(design: Design): unknown {
  return {
    emptyColumns: design.emptyColumns ?? [],
    columnExtents: design.columnExtents ?? [],
  };
}

function storedMapAsTheEditorLoadsIt(design: Design): unknown {
  const records = derivePlacementRecords(
    design,
    buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
  );
  const projected = projectFrozenMap(
    deriveRecordedColumns(records, design, toMetres(design.room.widthMm)),
    records,
  );
  return {
    emptyColumns: projected.emptyColumns ?? [],
    columnExtents: projected.columnExtents ?? [],
  };
}

/** The stored member-less columns on `wall`, as along-wall spans. */
function memberlessSpansOn(
  design: Design,
  wall: DesignWall,
): { readonly startMm: number; readonly endMm: number }[] {
  return (design.emptyColumns ?? [])
    .filter((space) => space.wall === wall)
    .map((space) => ({
      startMm: space.alongMm - space.widthMm / 2,
      endMm: space.alongMm + space.widthMm / 2,
    }));
}
