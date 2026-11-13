// M7C wave C4 slice S1 adversarial QA — the base return is still structural after ADR 0135 gave it a
// fixed front and the run's depth (ADR 0021 d2; plan criteria 3 and 5).
//
// Asked of **generated** rooms rather than the seeded fixture: an L, a right-hand L and both corners
// of a U, at 600 and after a change to 700.
import { describe, expect, it } from "vitest";

import { baseFinishedDepthMm, NO_OPENING_FRONTS } from "../../src/index.js";
import { removePlacement } from "../../src/commands/remove-placement.js";
import { setCabinetDepth } from "../../src/commands/set-cabinet-depth.js";
import { setWidth } from "../../src/commands/set-width.js";
import { cabinetDepthMmOf, type DesignRoom } from "../../src/design.js";
import { buildKitchenLBodyCatalog } from "../../src/fixtures/kitchen-l-design.js";
import { generateKitchen } from "../../src/generation/generate-kitchen.js";
import { describeSelection } from "../../src/queries/describe-selection.js";
import { offersFor } from "../../src/queries/offers.js";
import { widthOptionsFor } from "../../src/queries/width-options.js";
import { validateDesignForCatalog } from "../../src/validate-design.js";
import { deriveRecordedColumns } from "../../src/void-engine.js";
import { toMetres } from "../../src/millimetres.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";
import { createWorld, type KitchenWorld } from "../support/kitchen-world.js";

const OCCURRED_AT = "2026-10-01T10:00:00.000Z";
const DEEP_MM = 700;
const RETURN_BUILD_ID = "base-corner-return-320";
const WIDTH_STEP_MM = 50;

const ROOMS: readonly (readonly [string, DesignRoom, readonly string[]])[] = [
  ["L", { shape: "L", widthMm: 4100, depthMm: 3300, heightMm: 2600 }, ["p26"]],
  [
    "right-hand L",
    {
      shape: "L",
      widthMm: 4100,
      depthMm: 3300,
      heightMm: 2600,
      cornerDirection: "right",
    },
    ["p26"],
  ],
  [
    "U",
    { shape: "U", widthMm: 4500, depthMm: 3000, wallCMm: 3600, heightMm: 2600 },
    ["p26", "right-p26"],
  ],
];

function generatedWorld(
  room: DesignRoom,
  cabinetDepthMm: number,
): KitchenWorld {
  const probeAt = createFakeProbeFactory();
  const generated = generateKitchen({ room, occurredAt: OCCURRED_AT, probeAt });
  if (!generated.ok) throw new Error(`refused: ${generated.reason.code}`);
  if (cabinetDepthMm === cabinetDepthMmOf(generated.design)) {
    return createWorld(
      generated.design,
      buildKitchenLBodyCatalog(cabinetDepthMm),
    );
  }
  const deepened = setCabinetDepth({
    design: generated.design,
    catalogAt: buildKitchenLBodyCatalog,
    cabinetDepthMm,
    probeAt,
    occurredAt: OCCURRED_AT,
  });
  if (!deepened.ok) throw new Error(`depth refused: ${deepened.reason.code}`);
  return createWorld(deepened.design, buildKitchenLBodyCatalog(cabinetDepthMm));
}

const CASES = ROOMS.flatMap(([label, room, returnIds]) =>
  [600, DEEP_MM].flatMap((cabinetDepthMm) =>
    returnIds.map(
      (id) =>
        [
          `${label} at ${String(cabinetDepthMm)}`,
          id,
          room,
          cabinetDepthMm,
        ] as const,
    ),
  ),
);

describe.each(CASES)(
  "%s: the base return %s is structural",
  (_label, id, room, cabinetDepthMm) => {
    const world = generatedWorld(room, cabinetDepthMm);
    const target = { kind: "placement", id } as const;
    const placement = world.design.placements.find(
      (candidate) => candidate.id === id,
    );

    it("is the return, placed by the generator", () => {
      expect(placement?.body.buildId).toBe(RETURN_BUILD_ID);
    });

    it("offers a colour and nothing else, with the corner's explanation", () => {
      const meta = describeSelection({ kitchenSettings: {}, ...world, target });

      expect({
        canReplace: meta?.canReplace,
        canDelete: meta?.canDelete,
        canFinish: meta?.canFinish,
        canHandle: meta?.canHandle,
        canWidth: meta?.canWidth,
        fixedWidth: meta?.fixedWidth,
        structuralReason: meta?.structuralReason,
      }).toEqual({
        canReplace: false,
        canDelete: false,
        canFinish: true,
        canHandle: false,
        canWidth: false,
        fixedWidth: true,
        structuralReason: "corner",
      });
    });

    it("has no swap list and refuses deletion", () => {
      const removal = removePlacement({
        design: world.design,
        catalog: world.catalog,
        target,
        occurredAt: OCCURRED_AT,
      });

      expect(offersFor({ ...world, target })).toEqual([]);
      expect(removal.ok ? "removed" : removal.reason.code).toBe(
        "NOT_DELETABLE",
      );
    });

    it("refuses every width, wider or narrower, and publishes no free chip", () => {
      const columns = deriveRecordedColumns(
        world.records,
        {
          emptyColumns: world.design.emptyColumns,
          columnExtents: world.design.columnExtents,
        },
        toMetres(world.design.room.widthMm),
      );
      const currentMm = placement?.body.widthMm ?? Number.NaN;

      createFakeProbeFactory()(cabinetDepthMm).use((probe) => {
        for (const widthMm of [
          currentMm - WIDTH_STEP_MM,
          currentMm + WIDTH_STEP_MM,
        ]) {
          const resized = setWidth({
            design: world.design,
            columns,
            target,
            catalog: world.catalog,
            widthMm,
            probe,
            occurredAt: OCCURRED_AT,
          });
          expect([widthMm, resized.ok]).toEqual([widthMm, false]);
        }
        const free = widthOptionsFor({
          design: world.design,
          catalog: world.catalog,
          target,
          columns,
          probe,
        }).filter((option) => option.verdict.status === "available");
        expect(free).toEqual([]);
      });
    });

    it("declares no opening front, so no handle, hinge or door count can reach it", () => {
      expect(world.catalog.get(RETURN_BUILD_ID)?.fronts).toBe(
        NO_OPENING_FRONTS,
      );
    });

    it("stands in a full column as deep as a base run finishes, and raises no finding", () => {
      const record = world.records.find((candidate) => candidate.id === id);
      const column = world.columns.get(record?.col ?? "");

      expect(column?.regions).toEqual([[0, 0.82]]);
      expect(Math.round((column?.d ?? Number.NaN) * 1000)).toBe(
        baseFinishedDepthMm(cabinetDepthMm),
      );
      expect(world.voids.filter((gap) => gap.col === record?.col)).toEqual([]);
      expect(validateDesignForCatalog(world.design, world.catalog)).toEqual([]);
    });
  },
);
