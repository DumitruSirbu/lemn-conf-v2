// M7B U4 round 3, R3.5 (ADR 0132 A8.4): which corner a record belongs to is answered by its wall.
//
// `placementStandingFor` (`right-corner-wrapper.ts`) stands a `DesignPlacement` back up from a record
// and fills `alongMm` from `frame.x` for every wall. On walls B and C, `frame.x` is across the wall,
// not along it, so on those walls the number means something else. It is harmless only because
// `cornerOf` answers walls B and C by wall before it reads `alongMm`. This suite gives every wall-B
// and wall-C corner record the `frame.x` that would put it on the *other* side of the room if wall A's
// rule read it, and demands the wrapping does not change.
import {
  buildKitchenLBodyCatalog,
  buildUShellDesign,
  derivePlacementRecords,
  type DesignRoom,
  type PlacementRecord,
} from "@lemnaria/configurator-domain";
import { beforeAll, describe, expect, it } from "vitest";

import { makeKit } from "../src/kitchen-parts.js";
import { rightCornerRecordIds } from "../src/right-corner-wrapper.js";
import {
  createHeadlessCanvas,
  installHeadlessDocument,
} from "./support/headless-canvas.js";

const U_ROOM: DesignRoom = {
  shape: "U",
  widthMm: 4500,
  depthMm: 3000,
  wallCMm: 3600,
  heightMm: 2600,
};
const NEAR_THE_A_B_CORNER_M = 0.1;

beforeAll(() => {
  installHeadlessDocument();
});

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

function rightIdsOf(records: readonly PlacementRecord[]): ReadonlySet<string> {
  const kit = makeKit({ createCanvas: createHeadlessCanvas });
  return rightCornerRecordIds({ kit, room: U_ROOM, records });
}

describe("a wall-B or wall-C corner record wraps by its wall, whatever its frame.x", () => {
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

  it("still answers wall A's two X-legs by their position, one each side", () => {
    const wrapped = rightIdsOf(shellRecords());

    expect(wrapped.has("right-p25")).toBe(true);
    expect(wrapped.has("p25")).toBe(false);
  });

  it("wraps no record of an L: its corner is always the left", () => {
    const kit = makeKit({ createCanvas: createHeadlessCanvas });
    const room: DesignRoom = {
      shape: "L",
      widthMm: 3700,
      depthMm: 3400,
      heightMm: 2600,
    };

    expect(
      rightCornerRecordIds({ kit, room, records: shellRecords() }).size,
    ).toBe(0);
  });
});
