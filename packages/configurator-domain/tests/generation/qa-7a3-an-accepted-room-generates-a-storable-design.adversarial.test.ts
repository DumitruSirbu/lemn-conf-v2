// Adversarial QA for M7 wave 7A3 slice S2 — criterion 3 carried one step further, to the document.
//
// Criterion 3 proves a room Step 1 accepts is a room `DesignRoomSchema` accepts. What the customer
// actually hands the save seam is the **kitchen generated for that room**, and it meets three more
// gates there: the whole-document schema, the executable validator the route runs, and SEC-002's
// byte and entry caps — the caps ADR 0124 moved. None of those is reached by a room-only property.
//
// So the chain is walked from the validator's own output, never from a hand-built room: every room
// the approved policy accepts on a grid that lands on 6000 mm on both walls, at both approved
// ceilings, is generated, sent through the wire, and held to what `PUT /api/designs/[id]` checks.
// The admitted wall-B band is floored separately, because it is the population the wave added and
// an aggregate over the whole policy would pass while barely visiting it (ADR 0121 decision 5).
//
// `6300 x 6300` is swept on its own and named as **engine-level**: no customer can enter it, but ADR
// 0124 made it a room a design may declare, and before that wave no design could carry a 6300 mm
// wall B at all.
import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  canonicalSerializeDesign,
  CurrentDesignSchema,
  fatalDesignValidationIssues,
  generateKitchen,
  MAX_COLUMN_EXTENTS,
  MAX_DESIGN_BYTES,
  MAX_EMPTY_COLUMNS,
  MAX_PLACEMENTS,
  validateDesignForCatalog,
  validateRoomInput,
  type Design,
  type DesignRoom,
} from "../../src/index.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";

const OCCURRED_AT = "2026-09-17T12:00:00.000Z";

/** Steps that land exactly on both walls' 6000 mm maximum from their minima: 900 + 17 x 300 and
 *  1000 + 20 x 250. */
const WALL_A_STEP_MM = 300;
const WALL_B_STEP_MM = 250;
const RULED_WALL_MAX_MM = 6000;
const PRE_7A3_WALL_B_MAX_MM = 5100;
const WIRE_RUN_MAX_MM = 6300;

/** The admitted band on this grid is 18 wall A values x 4 wall B values x 2 ceilings. */
const ADMITTED_BAND_FLOOR = 144;

interface StorageFailure {
  readonly room: string;
  readonly reason: string;
}

describe("a room the approved policy accepts generates a design the save seam stores (M7 7A3)", () => {
  const sweep = sweepTheApprovedGrid();

  it("generates a kitchen for every accepted room on the grid, 6000 x 6000 included", () => {
    expect(sweep.notGenerated.slice(0, 5)).toEqual([]);
    expect(sweep.generatedRooms).toContainEqual({
      shape: "L",
      widthMm: RULED_WALL_MAX_MM,
      depthMm: RULED_WALL_MAX_MM,
      heightMm: APPROVED_ROOM_POLICY.heightBounds.maxMm,
    });
  });

  it("passes every generated design through the wire schema, the executable validator and every SEC-002 cap", () => {
    expect(sweep.failures.slice(0, 5)).toEqual([]);
  });

  it("reaches the admitted wall B band on every grid room in it", () => {
    const admitted = sweep.generatedRooms.filter(
      (room) => room.depthMm > PRE_7A3_WALL_B_MAX_MM,
    );

    expect(admitted.length).toBe(ADMITTED_BAND_FLOOR);
  });
});

describe("the storage corner ADR 0124 opened, 6300 x 6300 (engine-level, not a policy room)", () => {
  it.each(
    approvedHeights().map((heightMm) => ({
      shape: "L" as const,
      widthMm: WIRE_RUN_MAX_MM,
      depthMm: WIRE_RUN_MAX_MM,
      heightMm,
    })),
  )("generates a storable design in %o", (room) => {
    const result = generateKitchen({
      room,
      occurredAt: OCCURRED_AT,
      probeAt: createFakeProbeFactory(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(storageFailuresOf(result.design)).toEqual([]);
  });
});

function approvedHeights(): number[] {
  return [
    APPROVED_ROOM_POLICY.heightBounds.minMm,
    APPROVED_ROOM_POLICY.heightBounds.maxMm,
  ];
}

function sweepTheApprovedGrid(): {
  generatedRooms: DesignRoom[];
  notGenerated: string[];
  failures: StorageFailure[];
} {
  const generatedRooms: DesignRoom[] = [];
  const notGenerated: string[] = [];
  const failures: StorageFailure[] = [];
  for (const room of acceptedGridRooms()) {
    const outcome = generatedOrReason(room);
    if (typeof outcome === "string") {
      notGenerated.push(`${keyOf(room)}: ${outcome}`);
      continue;
    }
    generatedRooms.push(room);
    failures.push(
      ...storageFailuresOf(outcome).map((reason) => ({
        room: keyOf(room),
        reason,
      })),
    );
  }
  return { generatedRooms, notGenerated, failures };
}

/** The generated design, or why there is none — a refusal or a throw — so one room that cannot be
 *  built fails the sweep's assertion by name instead of failing the file at collection. */
function generatedOrReason(room: DesignRoom): Design | string {
  try {
    const result = generateKitchen({
      room,
      occurredAt: OCCURRED_AT,
      probeAt: createFakeProbeFactory(),
    });
    return result.ok ? result.design : result.reason.code;
  } catch (error) {
    return String(error);
  }
}

/** Every grid room the approved policy accepts, as the room the validator hands on. */
function acceptedGridRooms(): DesignRoom[] {
  const rooms: DesignRoom[] = [];
  for (
    let wallAMm = 900;
    wallAMm <= RULED_WALL_MAX_MM;
    wallAMm += WALL_A_STEP_MM
  ) {
    for (
      let wallBMm = 1000;
      wallBMm <= RULED_WALL_MAX_MM;
      wallBMm += WALL_B_STEP_MM
    ) {
      for (const heightMm of approvedHeights()) {
        const result = validateRoomInput(
          { shape: "L", wallAMm, wallBMm, heightMm, cornerDirection: "left" },
          APPROVED_ROOM_POLICY,
        );
        if (result.ok) rooms.push(result.room);
      }
    }
  }
  return rooms;
}

/** What `PUT /api/designs/[id]` would refuse the design for, as readable reasons. */
function storageFailuresOf(design: Design): string[] {
  const serialised = canonicalSerializeDesign(design);
  const reasons: string[] = [];
  const bytes = Buffer.byteLength(serialised, "utf8");
  if (bytes > MAX_DESIGN_BYTES) reasons.push(`${String(bytes)} bytes`);
  const parsed = CurrentDesignSchema.safeParse(JSON.parse(serialised));
  if (!parsed.success) {
    reasons.push(
      ...parsed.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`,
      ),
    );
  }
  const fatal = fatalDesignValidationIssues(
    validateDesignForCatalog(
      design,
      buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
    ),
  );
  reasons.push(...fatal.map((issue) => issue.code));
  const counts = [
    ["placements", design.placements.length, MAX_PLACEMENTS],
    ["empty columns", (design.emptyColumns ?? []).length, MAX_EMPTY_COLUMNS],
    ["column extents", (design.columnExtents ?? []).length, MAX_COLUMN_EXTENTS],
  ] as const;
  for (const [entries, count, cap] of counts) {
    if (count > cap) reasons.push(`${entries} past the cap`);
  }
  return reasons;
}

function keyOf(room: DesignRoom): string {
  return `${String(room.widthMm)}x${String(room.depthMm)}x${String(room.heightMm)}`;
}
