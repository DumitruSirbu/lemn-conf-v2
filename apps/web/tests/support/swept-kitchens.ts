// The seeded room sweep the review suites share: four arms of generated rooms, each composed through the real
// generator with the fake probe, priced and projected.
import { fc } from "@fast-check/vitest";
import {
  APPROVED_ROOM_POLICY,
  type DesignRoom,
} from "@lemnaria/configurator-domain";

import {
  generatePricedKitchen,
  type PricedKitchen,
} from "./generated-kitchens";

const SWEEP_SEED = 20_261_007;
const RUNS_PER_ARM = 120;
const CEILING_HEIGHTS_MM = [2200, 2600, 3900] as const;

const SHAPES = APPROVED_ROOM_POLICY.buildableShapes;

function requireStated<T>(value: T | undefined, what: string): T {
  if (value === undefined)
    throw new Error(`the approved policy states no ${what}`);
  return value;
}

const LINEAR = requireStated(SHAPES.linear, "linear room");
const L = requireStated(SHAPES.L, "L room");
const U = requireStated(SHAPES.U, "U room");

const heightMm = fc.constantFrom(...CEILING_HEIGHTS_MM);

function lengthIn(bounds: { readonly minMm: number; readonly maxMm: number }) {
  return fc.integer({ min: bounds.minMm, max: bounds.maxMm });
}

export interface SweepArm {
  readonly name: string;
  readonly rooms: fc.Arbitrary<DesignRoom>;
  readonly walls: readonly string[];
}

export const STRAIGHT_ARM: SweepArm = {
  name: "straight",
  walls: ["A"],
  rooms: fc.tuple(lengthIn(LINEAR.wallA), heightMm).map(
    ([widthMm, heightMm]): DesignRoom => ({
      shape: "linear",
      widthMm,
      depthMm: LINEAR.depthMm,
      heightMm,
    }),
  ),
};

export const L_ARM: SweepArm = {
  name: "L",
  walls: ["A", "B"],
  rooms: fc.tuple(lengthIn(L.wallA), lengthIn(L.wallB), heightMm).map(
    ([widthMm, depthMm, heightMm]): DesignRoom => ({
      shape: "L",
      widthMm,
      depthMm,
      heightMm,
    }),
  ),
};

export const RIGHT_HAND_L_ARM: SweepArm = {
  name: "right-hand L",
  walls: ["A", "B"],
  rooms: fc.tuple(lengthIn(L.wallA), lengthIn(L.wallB), heightMm).map(
    ([widthMm, depthMm, heightMm]): DesignRoom => ({
      shape: "L",
      widthMm,
      depthMm,
      heightMm,
      cornerDirection: "right",
    }),
  ),
};

export const U_ARM: SweepArm = {
  name: "U",
  walls: ["A", "B", "C"],
  rooms: fc
    .tuple(lengthIn(U.wallA), lengthIn(U.wallB), lengthIn(U.wallC), heightMm)
    .map(
      ([widthMm, depthMm, wallCMm, heightMm]): DesignRoom => ({
        shape: "U",
        widthMm,
        depthMm,
        wallCMm,
        heightMm,
      }),
    ),
};

export const ARMS: readonly SweepArm[] = [
  STRAIGHT_ARM,
  L_ARM,
  RIGHT_HAND_L_ARM,
  U_ARM,
];

const sweptKitchens = new Map<string, readonly PricedKitchen[]>();

/** The kitchens an arm's seeded room sweep composes, generated once however many tests read them. */
export function composedKitchensOf(arm: SweepArm): readonly PricedKitchen[] {
  const cached = sweptKitchens.get(arm.name);
  if (cached !== undefined) return cached;

  const composed: PricedKitchen[] = [];
  fc.assert(
    fc.property(arm.rooms, (room) => {
      const generated = generatePricedKitchen(room);
      if (generated.kind === "composed") composed.push(generated.kitchen);
    }),
    { numRuns: RUNS_PER_ARM, seed: SWEEP_SEED },
  );
  sweptKitchens.set(arm.name, composed);
  return composed;
}
