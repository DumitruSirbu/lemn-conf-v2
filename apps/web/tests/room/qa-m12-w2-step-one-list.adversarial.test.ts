// M12 wave W2-6, adversarial (ADR 0183): the Step 1 list renders unchanged for every generated room, whatever the
// step over the fridge did. The implementer's test reads one room; this one reads a swept, seeded set that reaches
// all three shapes, a ceiling below, at and above the line where the cabinet is placed, and both depths, and holds the
// list to the three things a customer can see: the rows, each row's status, and the dropped roles.
//
// The step is exercised in all three of its outcomes (placed, refused `OPENING_TOO_SHORT`, `NO_OPENING`): none may
// flip a row, add one, or be counted under the fridge's.
import {
  generateKitchen,
  type DesignRoom,
  type GenerationLog,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { droppedRolesIn, resolveGenerationRows } from "@/room/generation-model";

import { createFakeProbeFactory } from "../support/fake-body-probe";

const OCCURRED_AT = "2026-11-15T09:00:00.000Z";
const OVER_BODY_ROLE = "over-body";
const CEILINGS_MM = [2100, 2400, 2500, 2501, 2599, 2600, 2800, 3200];
const DEPTHS_MM = [600, 700];
const EXPECTED_ROW_COUNT = 6;

function seededRooms(count: number): DesignRoom[] {
  let state = 0x51a7c3;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const between = (low: number, high: number) =>
    low + Math.floor(next() * (high - low + 1));
  const rooms: DesignRoom[] = [];
  for (let index = 0; index < count; index += 1) {
    const heightMm = CEILINGS_MM[index % CEILINGS_MM.length] ?? 2800;
    const widthMm = between(2400, 6000);
    const shape = (["L", "linear", "U"] as const)[index % 3] ?? "L";
    if (shape === "linear") {
      rooms.push({ shape, widthMm, depthMm: 3400, heightMm });
    } else if (shape === "L") {
      rooms.push({ shape, widthMm, depthMm: between(1800, 5000), heightMm });
    } else {
      rooms.push({
        shape,
        widthMm,
        depthMm: between(1800, 5000),
        wallCMm: between(1800, 5000),
        heightMm,
      });
    }
  }
  return rooms;
}

function logOf(room: DesignRoom, cabinetDepthMm: number): GenerationLog | null {
  try {
    return generateKitchen({
      room,
      occurredAt: OCCURRED_AT,
      probeAt: createFakeProbeFactory(),
      newKitchenSettings: { cabinetDepthMm },
    }).log;
  } catch {
    // A room the engine refuses with a throw, at HEAD as well (a U at a ceiling too low for its hood).
    return null;
  }
}

describe("the Step 1 list reads the same with the step over the fridge in the log as with it taken out (W2-6)", () => {
  it("holds for every swept room, in each of the step's three outcomes", () => {
    const outcomes = new Map<string, number>();
    for (const cabinetDepthMm of DEPTHS_MM) {
      for (const room of seededRooms(240)) {
        const log = logOf(room, cabinetDepthMm);
        if (log === null) continue;
        const [overStep, ...extra] = log.steps.filter(
          (step) => step.role === OVER_BODY_ROLE,
        );
        expect(extra).toEqual([]);
        const withoutIt: GenerationLog = {
          ...log,
          steps: log.steps.filter((step) => step.role !== OVER_BODY_ROLE),
        };
        const label = JSON.stringify(room);

        const rows = resolveGenerationRows(log);
        expect(rows, label).toStrictEqual(resolveGenerationRows(withoutIt));
        expect(rows, label).toHaveLength(EXPECTED_ROW_COUNT);
        expect(droppedRolesIn(log), label).toStrictEqual(
          droppedRolesIn(withoutIt),
        );
        const outcome =
          overStep === undefined
            ? "no step"
            : overStep.status === "placed"
              ? "placed"
              : overStep.reason.code;
        outcomes.set(outcome, (outcomes.get(outcome) ?? 0) + 1);
      }
    }
    for (const outcome of [
      "placed",
      "OPENING_TOO_SHORT",
      "NO_OPENING",
      "no step",
    ]) {
      expect(outcomes.get(outcome) ?? 0, outcome).toBeGreaterThanOrEqual(5);
    }
  });

  it("counts a placed cabinet under no row: the fridge row's status depends on the fridge step alone", () => {
    let checked = 0;
    for (const room of seededRooms(120)) {
      const log = logOf({ ...room, heightMm: 2800 }, 600);
      if (log === null) continue;
      const overStep = log.steps.find((step) => step.role === OVER_BODY_ROLE);
      if (overStep?.status !== "placed") continue;
      const fridgeRefusedButCabinetPlaced: GenerationLog = {
        ...log,
        steps: log.steps.map((step) =>
          step.id === "fridge"
            ? {
                ...step,
                status: "not_placed" as const,
                reason: { code: "DROPPED_FOR_FIT" as const, params: {} },
                commands: [],
              }
            : step,
        ),
      };

      expect(
        resolveGenerationRows(fridgeRefusedButCabinetPlaced).find(
          (row) => row.id === "fridge",
        )?.status,
      ).toBe("not_placed");
      checked += 1;
    }
    expect(checked).toBeGreaterThanOrEqual(40);
  });
});
