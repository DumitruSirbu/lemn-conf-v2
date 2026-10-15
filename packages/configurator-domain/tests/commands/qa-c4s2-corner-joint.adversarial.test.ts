// M7C wave C4 slice S2 adversarial QA — the joint on the run's carcass front, in the document (ADR
// 0135 decision 5; plan criteria 3, 4 and 7).
//
// Asked of **generated** rooms: an L, a right-hand L and both corners of a U, at 600 and after a
// change to 700. Every figure is written out from the plan's table, never read from the catalogue.
import { describe, expect, it } from "vitest";

import { removePlacement } from "../../src/commands/remove-placement.js";
import { setCabinetDepth } from "../../src/commands/set-cabinet-depth.js";
import { cabinetDepthMmOf, type DesignRoom } from "../../src/design.js";
import { buildKitchenLBodyCatalog } from "../../src/fixtures/kitchen-l-design.js";
import { generateKitchen } from "../../src/generation/generate-kitchen.js";
import {
  buildLShellDesign,
  buildUShellDesign,
} from "../../src/generation/shell-design.js";
import { describeSelection } from "../../src/queries/describe-selection.js";
import { offersFor } from "../../src/queries/offers.js";
import { APPROVED_ROOM_POLICY } from "../../src/room/approved-room-policy.js";
import { validateRoomInput } from "../../src/room/validate-room.js";
import { validateDesignForCatalog } from "../../src/validate-design.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";
import { createWorld, type KitchenWorld } from "../support/kitchen-world.js";

const OCCURRED_AT = "2026-10-01T10:00:00.000Z";
const SHALLOW_MM = 600;
const DEEP_MM = 700;

/** The plan's table, at depth D: the joint and the return's near edge `D − 30`, the X-leg's frame
 *  `D − 50`, and both pieces finishing on the run's worktop line `D + 20`. */
const JOINT_INSET_MM = 30;
const X_LEG_FRAME_INSET_MM = 50;
const WORKTOP_REACH_MM = 20;
const REFERENCE_CORNER_REACH_MM = 900;
const REFERENCE_RETURN_WIDTH_MM = 330;

const ROOMS: readonly (readonly [string, DesignRoom, readonly string[]])[] = [
  ["L", { shape: "L", widthMm: 4100, depthMm: 3300, heightMm: 2600 }, [""]],
  [
    "right-hand L",
    {
      shape: "L",
      widthMm: 4100,
      depthMm: 3300,
      heightMm: 2600,
      cornerDirection: "right",
    },
    [""],
  ],
  [
    "U",
    { shape: "U", widthMm: 4500, depthMm: 3000, wallCMm: 3600, heightMm: 2600 },
    ["", "right-"],
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

const CASES = ROOMS.flatMap(([label, room, corners]) =>
  [SHALLOW_MM, DEEP_MM].flatMap((cabinetDepthMm) =>
    corners.map(
      (prefix) =>
        [
          `${label} at ${String(cabinetDepthMm)}, ${prefix === "" ? "left" : "right"} corner`,
          prefix,
          room,
          cabinetDepthMm,
        ] as const,
    ),
  ),
);

describe.each(CASES)("%s", (_label, prefix, room, cabinetDepthMm) => {
  const world = generatedWorld(room, cabinetDepthMm);
  const xLegId = `${prefix}p25`;
  const returnId = `${prefix}p26`;
  const placed = (id: string) => {
    const placement = world.design.placements.find(
      (candidate) => candidate.id === id,
    );
    if (!placement) throw new Error(`no ${id}`);
    return placement;
  };
  const recordOf = (id: string) => {
    const record = world.records.find((candidate) => candidate.id === id);
    if (!record) throw new Error(`no record for ${id}`);
    return record;
  };

  it("starts the base return on the joint, D − 30, 330 wide", () => {
    const leg = placed(returnId);

    expect(leg.body.widthMm).toBe(REFERENCE_RETURN_WIDTH_MM);
    expect(leg.alongMm - leg.body.widthMm / 2).toBe(
      cabinetDepthMm - JOINT_INSET_MM,
    );
  });

  /** A depth change slides the stored corner and keeps its generated width (`SPEC.md`, the corner's
   *  scaling rule), so the reach is the reference 900 at 600 and 100 mm further at 700. */
  it("ends the base return where it ended before the joint moved", () => {
    const leg = placed(returnId);

    expect(leg.alongMm + leg.body.widthMm / 2).toBe(
      REFERENCE_CORNER_REACH_MM + (cabinetDepthMm - SHALLOW_MM),
    );
  });

  it("seats the X-leg D − 50 deep, so its front is the joint and its back 20 mm behind the wall", () => {
    const seatM = (cabinetDepthMm - X_LEG_FRAME_INSET_MM) / 2000;

    expect(world.catalog.get("base-corner-x-900")?.frameDepthMm).toBe(
      cabinetDepthMm - X_LEG_FRAME_INSET_MM,
    );
    expect(recordOf(xLegId).frame.z).toBeCloseTo(seatM, 9);
  });

  it("records both pieces' columns as deep as the run's worktop line, D + 20", () => {
    for (const id of [xLegId, returnId]) {
      const column = world.columns.get(recordOf(id).col);

      expect([id, Math.round((column?.d ?? Number.NaN) * 1000)]).toEqual([
        id,
        cabinetDepthMm + WORKTOP_REACH_MM,
      ]);
    }
  });

  it.each([xLegId, returnId])(
    "keeps %s structural: a colour and nothing else",
    (id) => {
      const target = { kind: "placement", id } as const;
      const meta = describeSelection({ ...world, target });
      const removal = removePlacement({
        design: world.design,
        catalog: world.catalog,
        target,
        occurredAt: OCCURRED_AT,
      });

      expect({
        canReplace: meta?.canReplace,
        canDelete: meta?.canDelete,
        canWidth: meta?.canWidth,
        fixedWidth: meta?.fixedWidth,
        structuralReason: meta?.structuralReason,
      }).toEqual({
        canReplace: false,
        canDelete: false,
        canWidth: false,
        fixedWidth: true,
        structuralReason: "corner",
      });
      expect(offersFor({ ...world, target })).toEqual([]);
      expect(removal.ok ? "removed" : removal.reason.code).toBe(
        "NOT_DELETABLE",
      );
    },
  );

  it("raises no finding, the corner sweep included (criterion 7)", () => {
    expect(validateDesignForCatalog(world.design, world.catalog)).toEqual([]);
  });
});

// -------------------------------------------------------------------------------------------------
// The engine's corner floor fell from 880 to 870; the approved minima did not move (criterion 4).
// -------------------------------------------------------------------------------------------------

const LONG_WALL_MM = 3000;
const ENGINE_FLOOR_MM = 870;
const APPROVED_WALL_A_MINIMUM_MM = 900;
const APPROVED_SIDE_WALL_MINIMUM_MM = 1000;
const OUTSIDE_THE_ENGINE = "outside the engine's limits";
const SWEPT_SHORT_WALLS_MM = [869, 870, 879, 880, 899, 900, 999, 1000];

function lRoom(wallAMm: number, wallBMm: number): DesignRoom {
  return { shape: "L", widthMm: wallAMm, depthMm: wallBMm, heightMm: 2600 };
}

function shellOutcome(build: () => unknown): string {
  try {
    build();
    return "built";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes("ROOM_OUTSIDE_ENGINE_LIMITS")
      ? OUTSIDE_THE_ENGINE
      : message;
  }
}

function approves(policy: typeof APPROVED_ROOM_POLICY, room: DesignRoom) {
  return validateRoomInput(
    {
      shape: "L",
      wallAMm: room.widthMm,
      wallBMm: room.depthMm,
      heightMm: room.heightMm,
      cornerDirection: "left",
    },
    policy,
  ).ok;
}

describe("the engine's corner floor is 870 and the approved minima are where the owner put them", () => {
  it.each(SWEPT_SHORT_WALLS_MM)(
    "a %i mm wall: the shell builds exactly from 870, on wall A, wall B and a U's side wall",
    (shortMm) => {
      const expected =
        shortMm >= ENGINE_FLOOR_MM ? "built" : OUTSIDE_THE_ENGINE;
      const outcomes = [
        shellOutcome(() =>
          buildLShellDesign({
            room: lRoom(shortMm, LONG_WALL_MM),
            occurredAt: OCCURRED_AT,
          }),
        ),
        shellOutcome(() =>
          buildLShellDesign({
            room: lRoom(LONG_WALL_MM, shortMm),
            occurredAt: OCCURRED_AT,
          }),
        ),
        shellOutcome(() =>
          buildUShellDesign({
            room: {
              shape: "U",
              widthMm: 3600,
              depthMm: shortMm,
              wallCMm: LONG_WALL_MM,
              heightMm: 2600,
            },
            occurredAt: OCCURRED_AT,
          }),
        ),
      ];

      expect(outcomes).toEqual([expected, expected, expected]);
    },
  );

  it.each(SWEPT_SHORT_WALLS_MM)(
    "a %i mm wall: the approved policy answers as it did, 900 on wall A and 1000 on wall B",
    (shortMm) => {
      expect([
        approves(APPROVED_ROOM_POLICY, lRoom(shortMm, LONG_WALL_MM)),
        approves(APPROVED_ROOM_POLICY, lRoom(LONG_WALL_MM, shortMm)),
      ]).toEqual([
        shortMm >= APPROVED_WALL_A_MINIMUM_MM,
        shortMm >= APPROVED_SIDE_WALL_MINIMUM_MM,
      ]);
    },
  );

  it("keeps every corner piece inside the wall in the smallest room the engine admits", () => {
    for (const room of [
      lRoom(ENGINE_FLOOR_MM, LONG_WALL_MM),
      lRoom(LONG_WALL_MM, ENGINE_FLOOR_MM),
    ]) {
      const shell = buildLShellDesign({ room, occurredAt: OCCURRED_AT });
      const pastTheWall = shell.placements.filter(
        (placement) =>
          placement.alongMm + placement.body.widthMm / 2 >
          (placement.wall === "A" ? room.widthMm : room.depthMm),
      );

      expect(pastTheWall).toEqual([]);
      expect(
        validateDesignForCatalog(shell, buildKitchenLBodyCatalog(SHALLOW_MM)),
      ).toEqual([]);
    }
  });
});
