// **Wave H2 QA (M10): a request that names no defaults makes the kitchen the code made before H2 touched it.**
//
// The implementer compared 941 rooms against the old sources once. That comparison is re-established here as a recorded
// baseline, over a room set the implementer did not use (odd millimetres, both corner directions, four ceilings):
// each digest below was computed on the tree at `ce341734` (H1b's merge, before H2) by running this same corpus
// through its `generateKitchen`, `buildLShellDesign`, `buildLinearShellDesign`, `buildUShellDesign`, `lShellFloorRuns`
// and `uShellFloorRuns`, hashing the exact `JSON.stringify` of each result (key order included). The shell builders
// and the run functions changed signature in H2; with the new argument omitted they must answer what they answered.
//
// To regenerate (only when the old behaviour is deliberately changed), print `measured(shape)` for each shape.
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  APPROVED_ROOM_POLICY,
  buildLinearShellDesign,
  buildLShellDesign,
  buildUShellDesign,
  canonicalSerializeDesign,
  generateKitchen,
  lShellFloorRuns,
  uShellFloorRuns,
  validateRoomInput,
  type DesignRoom,
  type RoomInput,
} from "../../src/index.js";
import { createFakeProbeFactory } from "../support/fake-probe.js";

const OCCURRED_AT = "2026-10-27T09:30:00.000Z";

const RECORDED_AT_CE341734 = {
  linear: {
    rooms: 144,
    generated:
      "f4645a7af4a52d5cae82f6768f03540354e3461e2ef41b248746a39d1c94f543",
    canonical:
      "58e6c8c5b1f285bc8b8f979fa7321de191b5b06d4d54eac8f6b8c29101741ad6",
    shells: "aaed0f7416c313bde8c874a40d43654ee1a4afca7448267e8aa163a2b63138ed",
    runs: "4859d6d9c123cd3f8385d34fdfb03003998a4f08c7dc6f620b29942e1656e71e",
  },
  L: {
    rooms: 320,
    generated:
      "0803cf1da0d0e4bb9ae4cf7df19b831f5da35b71f33e858ff0e884d44e254b2c",
    canonical:
      "0a1802919e2b27ef83edfc5d0237f0104a7c8f0aee7507ae704389c3bd0bda40",
    shells: "f447139c66c244d97001f58e20a2cfb7fe2309fbf046223ced5aca7e8b7b5f87",
    runs: "6fbf6453a134727285916661d6bf77f77db0ddc7e6cf47662631ab1934a72cf1",
  },
  U: {
    rooms: 144,
    generated:
      "2dee0ed2835048dffa051d4ecdbb3310597e91e58aafb7ba75b2a841edbad1ee",
    canonical:
      "51cca7b1f099db0420d803f75c2de0cda34180e1391a76f83820435555d3fe4a",
    shells: "4c81ebbadc0b2819b692f581feaa02282ca4b380560b4f91134a6d63e5455b5b",
    runs: "168b03fd492865e70c72ac87be8f41cdaa5bc84ce0113ef9f1213ccd1f79f04c",
  },
} as const;

type Shape = DesignRoom["shape"];

function accepted(input: RoomInput): DesignRoom[] {
  const result = validateRoomInput(input, APPROVED_ROOM_POLICY);
  return result.ok ? [result.room] : [];
}

function corpusOf(shape: Shape): DesignRoom[] {
  const heights = [2200, 2250, 2600, 3900];
  const rooms: DesignRoom[] = [];
  if (shape === "linear") {
    for (let wallAMm = 900; wallAMm <= 6000; wallAMm += 131) {
      for (const heightMm of heights) {
        rooms.push(...accepted({ shape, wallAMm, heightMm }));
      }
    }
  } else if (shape === "L") {
    for (const wallAMm of [900, 1250, 1777, 2400, 3101, 3600, 4550, 6000]) {
      for (const wallBMm of [1000, 1333, 2000, 2999, 4300, 6000]) {
        for (const heightMm of heights) {
          for (const cornerDirection of ["left", "right"] as const) {
            rooms.push(
              ...accepted({
                shape,
                wallAMm,
                wallBMm,
                heightMm,
                cornerDirection,
              }),
            );
          }
        }
      }
    }
  } else {
    for (const wallAMm of [2400, 3001, 3600, 4747, 6000]) {
      for (const wallBMm of [1200, 2000, 3250]) {
        for (const wallCMm of [1500, 2600, 3600]) {
          for (const heightMm of heights) {
            rooms.push(
              ...accepted({
                shape,
                wallAMm,
                wallBMm,
                wallCMm,
                heightMm,
                cornerDirection: "left",
              }),
            );
          }
        }
      }
    }
  }
  return rooms;
}

function digestOf(values: readonly unknown[]): string {
  const hash = createHash("sha256");
  for (const value of values) hash.update(`${JSON.stringify(value)}\n`);
  return hash.digest("hex");
}

function generatedFor(room: DesignRoom) {
  return generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
}

function shellFor(room: DesignRoom) {
  const input = { room, occurredAt: OCCURRED_AT };
  if (room.shape === "linear") return buildLinearShellDesign(input);
  if (room.shape === "L") return buildLShellDesign(input);
  return buildUShellDesign(input);
}

function runsFor(room: DesignRoom) {
  if (room.shape === "linear") return null;
  return room.shape === "L" ? lShellFloorRuns(room) : uShellFloorRuns(room);
}

function measured(shape: Shape) {
  const rooms = corpusOf(shape);
  const results = rooms.map(generatedFor);
  return {
    rooms: rooms.length,
    generated: digestOf(results),
    canonical: digestOf(
      results.map((result) =>
        result.ok ? canonicalSerializeDesign(result.design) : result.reason,
      ),
    ),
    shells: digestOf(rooms.map(shellFor)),
    runs: digestOf(rooms.map(runsFor)),
  };
}

describe("a request that names no defaults is, byte for byte, what ce341734 generated", () => {
  it.each(["linear", "L", "U"] as const)(
    "%s rooms: result, canonical document, shell and floor runs match the recorded digests",
    (shape) => {
      const now = measured(shape);

      expect(now).toStrictEqual(RECORDED_AT_CE341734[shape]);
    },
  );

  it("is not vacuous: the corpus generates plenty of rooms of every shape", () => {
    for (const shape of ["linear", "L", "U"] as const) {
      const results = corpusOf(shape).map(generatedFor);

      expect(
        results.filter((result) => result.ok).length,
        shape,
      ).toBeGreaterThan(20);
    }
  });
});
