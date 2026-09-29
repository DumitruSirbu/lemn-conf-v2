// M7B U4 round 3, R3.5, and U5 S0 (ADR 0132 A8.4): which corner a record belongs to is answered by the
// record's own `corner`, and by nothing the adapter reads off the record's frame or wall.
//
// Until U5 S0 the adapter stood a `DesignPlacement` back up from each record and filled `alongMm`
// from `frame.x` for every wall. On walls B and C, `frame.x` is across the wall, not along it, so on
// those walls the number means something else; it was harmless only because `cornerOf` answers walls
// B and C by wall before it reads `alongMm`. `derivePlacementRecords` now carries `corner` on the
// record, and `rightCornerRecordIds` reads that. This suite gives every wall-B and wall-C corner
// record the `frame.x` that would put it on the *other* side of the room if wall A's rule read it,
// then overrides `corner` itself, and demands that only the override changes the wrapping.
import {
  buildKitchenLBodyCatalog,
  buildUShellDesign,
  derivePlacementRecords,
  type Corner,
  type DesignRoom,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { rightCornerRecordIds } from "../src/right-corner-wrapper.js";

const U_ROOM: DesignRoom = {
  shape: "U",
  widthMm: 4500,
  depthMm: 3000,
  wallCMm: 3600,
  heightMm: 2600,
};
const NEAR_THE_A_B_CORNER_M = 0.1;

function shellRecords(): readonly PlacementRecord[] {
  const shell = buildUShellDesign({
    room: U_ROOM,
    occurredAt: "2026-09-29T12:00:00.000Z",
  });
  return derivePlacementRecords(shell, buildKitchenLBodyCatalog(600));
}

function withFrameX(record: PlacementRecord, xM: number): PlacementRecord {
  return { ...record, frame: { ...record.frame, x: xM } };
}

function withCorner(
  record: PlacementRecord,
  corner: Corner | undefined,
): PlacementRecord {
  const withoutCorner: Record<string, unknown> = { ...record };
  delete withoutCorner["corner"];
  return {
    ...(withoutCorner as unknown as PlacementRecord),
    ...(corner === undefined ? {} : { corner }),
  };
}

function rightIdsOf(records: readonly PlacementRecord[]): ReadonlySet<string> {
  return rightCornerRecordIds({ room: U_ROOM, records });
}

describe("a corner record wraps by its own corner, whatever its wall or frame.x", () => {
  const widthM = U_ROOM.widthMm / 1000;

  it("wraps exactly the four wall-C and wall-A right-hand pieces for the domain's own records", () => {
    const wrapped = [...rightIdsOf(shellRecords())].sort();

    expect(wrapped).toEqual([
      "right-p21",
      "right-p25",
      "right-p26",
      "right-p9",
    ]);
  });

  it("still wraps every wall-C corner record when its frame.x is on wall A's left half", () => {
    const records = shellRecords().map((record) =>
      record.wall === "C" ? withFrameX(record, NEAR_THE_A_B_CORNER_M) : record,
    );

    const wrapped = rightIdsOf(records);

    for (const record of records.filter((r) => r.wall === "C")) {
      expect(wrapped.has(record.id), record.id).toBe(true);
    }
  });

  it("still wraps no wall-B corner record when its frame.x is on wall A's right half", () => {
    const records = shellRecords().map((record) =>
      record.wall === "B"
        ? withFrameX(record, widthM - NEAR_THE_A_B_CORNER_M)
        : record,
    );

    const wrapped = rightIdsOf(records);

    for (const record of records.filter((r) => r.wall === "B")) {
      expect(wrapped.has(record.id), record.id).toBe(false);
    }
  });

  it("has wall-B and wall-C corner records to test, so the two cases above are not vacuous", () => {
    const records = shellRecords();

    expect(records.filter((r) => r.wall === "B").length).toBeGreaterThan(0);
    expect(records.filter((r) => r.wall === "C").length).toBeGreaterThan(0);
    expect(records.filter((r) => r.wall === "A").length).toBeGreaterThan(0);
  });

  it("wraps wall A's right X-leg and not its left one, by their records' corners", () => {
    const wrapped = rightIdsOf(shellRecords());

    expect(wrapped.has("right-p25")).toBe(true);
    expect(wrapped.has("p25")).toBe(false);
  });

  it("follows the record's corner against its wall: a wall-C record marked left is not wrapped", () => {
    const records = shellRecords().map((record) =>
      record.id === "right-p26" ? withCorner(record, "left") : record,
    );

    const wrapped = rightIdsOf(records);

    expect(wrapped.has("right-p26")).toBe(false);
    expect(wrapped.has("right-p25")).toBe(true);
  });

  it("follows the record's corner against its wall: a wall-B record marked right is wrapped", () => {
    const records = shellRecords().map((record) =>
      record.wall === "B" && record.corner === "left"
        ? withCorner(record, "right")
        : record,
    );

    const wrapped = rightIdsOf(records);

    const wallB = records.filter((r) => r.wall === "B" && r.corner === "right");
    expect(wallB.length).toBeGreaterThan(0);
    for (const record of wallB) {
      expect(wrapped.has(record.id), record.id).toBe(true);
    }
  });

  it("wraps nothing for a record that carries no corner, wherever it stands", () => {
    const records = shellRecords().map((record) =>
      withCorner(record, undefined),
    );

    expect(rightIdsOf(records).size).toBe(0);
  });

  it("wraps no record of an L: its corner is always the left", () => {
    const room: DesignRoom = {
      shape: "L",
      widthMm: 3700,
      depthMm: 3400,
      heightMm: 2600,
    };

    expect(rightCornerRecordIds({ room, records: shellRecords() }).size).toBe(
      0,
    );
  });
});
