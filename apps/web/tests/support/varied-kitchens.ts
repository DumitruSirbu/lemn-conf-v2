// Kitchens for the review's adversarial suites: rooms on a seed of their own and at the approved policy's
// bounds, each re-priced under one of the book's tier pairs, and each pushed past its walls in the ways a
// kitchen really comes to overflow (a wall shortened under it, a body widened, a body added).
import { fc } from "@fast-check/vitest";
import {
  APPROVED_ROOM_POLICY,
  generateKitchen,
  SAMPLE_PRICE_BOOK,
  type Design,
  type DesignPlacement,
  type DesignRoom,
  type DesignWall,
} from "@lemnaria/configurator-domain";

import { createFakeProbeFactory } from "./fake-body-probe";
import { priceAndProject, type PricedKitchen } from "./generated-kitchens";

const SWEEP_SEED = 8_031_977;
const SAMPLED_ROOMS_PER_ARM = 90;
const GENERATED_AT = "2026-10-07T12:00:00.000Z";
const CEILING_HEIGHTS_MM = [2200, 2400, 2600, 3000, 3900] as const;

const SHAPES = APPROVED_ROOM_POLICY.buildableShapes;

function requireStated<T>(value: T | undefined, what: string): T {
  if (value === undefined)
    throw new Error(`the approved policy states no ${what}`);
  return value;
}

const LINEAR = requireStated(SHAPES.linear, "linear room");
const L = requireStated(SHAPES.L, "L room");
const U = requireStated(SHAPES.U, "U room");

interface Bounds {
  readonly minMm: number;
  readonly maxMm: number;
}

const heightMm = fc.constantFrom(...CEILING_HEIGHTS_MM);

function lengthIn(bounds: Bounds) {
  return fc.integer({ min: bounds.minMm, max: bounds.maxMm });
}

/** Both ends of a wall's range and the millimetre inside each, where a generator's transitions sit. */
function edgesOf(bounds: Bounds): readonly number[] {
  return [bounds.minMm, bounds.minMm + 1, bounds.maxMm - 1, bounds.maxMm];
}

export type CornerSide = "left" | "right";

function lRoom(
  [widthMm, depthMm, heightMm]: readonly [number, number, number],
  corner: CornerSide,
): DesignRoom {
  return {
    shape: "L",
    widthMm,
    depthMm,
    heightMm,
    ...(corner === "right" ? { cornerDirection: "right" as const } : {}),
  };
}

function uRoom([widthMm, depthMm, wallCMm, heightMm]: readonly [
  number,
  number,
  number,
  number,
]): DesignRoom {
  return { shape: "U", widthMm, depthMm, wallCMm, heightMm };
}

function straightRoom([widthMm, heightMm]: readonly [
  number,
  number,
]): DesignRoom {
  return { shape: "linear", widthMm, depthMm: LINEAR.depthMm, heightMm };
}

export interface VariedArm {
  readonly name: string;
  readonly walls: readonly DesignWall[];
  readonly sampledRooms: fc.Arbitrary<DesignRoom>;
  readonly boundaryRooms: readonly DesignRoom[];
}

const BOUNDARY_HEIGHT_MM = 2600;

function lBoundaryRooms(corner: CornerSide): readonly DesignRoom[] {
  return edgesOf(L.wallA).flatMap((widthMm) =>
    edgesOf(L.wallB).map((depthMm) =>
      lRoom([widthMm, depthMm, BOUNDARY_HEIGHT_MM], corner),
    ),
  );
}

function lArm(name: string, corner: CornerSide): VariedArm {
  return {
    name,
    walls: ["A", "B"],
    sampledRooms: fc
      .tuple(lengthIn(L.wallA), lengthIn(L.wallB), heightMm)
      .map((lengths) => lRoom(lengths, corner)),
    boundaryRooms: lBoundaryRooms(corner),
  };
}

export const VARIED_STRAIGHT_ARM: VariedArm = {
  name: "straight",
  walls: ["A"],
  sampledRooms: fc.tuple(lengthIn(LINEAR.wallA), heightMm).map(straightRoom),
  boundaryRooms: edgesOf(LINEAR.wallA).map((widthMm) =>
    straightRoom([widthMm, BOUNDARY_HEIGHT_MM]),
  ),
};

export const VARIED_L_ARM = lArm("L", "left");

export const VARIED_RIGHT_HAND_L_ARM = lArm("right-hand L", "right");

export const VARIED_U_ARM: VariedArm = {
  name: "U",
  walls: ["A", "B", "C"],
  sampledRooms: fc
    .tuple(lengthIn(U.wallA), lengthIn(U.wallB), lengthIn(U.wallC), heightMm)
    .map(uRoom),
  boundaryRooms: edgesOf(U.wallA).flatMap((widthMm) =>
    [U.wallB.minMm, U.wallB.maxMm].flatMap((depthMm) =>
      [U.wallC.minMm, U.wallC.maxMm].map((wallCMm) =>
        uRoom([widthMm, depthMm, wallCMm, BOUNDARY_HEIGHT_MM]),
      ),
    ),
  ),
};

export const VARIED_ARMS: readonly VariedArm[] = [
  VARIED_STRAIGHT_ARM,
  VARIED_L_ARM,
  VARIED_RIGHT_HAND_L_ARM,
  VARIED_U_ARM,
];

export interface TierPair {
  readonly materialTierId: string;
  readonly hardwareTierId: string;
}

/** Every material against every hardware tier the book offers, read off the book. */
export const TIER_PAIRS: readonly TierPair[] =
  SAMPLE_PRICE_BOOK.material.tiers.flatMap((material) =>
    SAMPLE_PRICE_BOOK.hardware.tiers.map((hardware) => ({
      materialTierId: material.tierId,
      hardwareTierId: hardware.tierId,
    })),
  );

export function withTiers(design: Design, tiers: TierPair): Design {
  return { ...design, settings: { ...design.settings, ...tiers } };
}

export interface RoomOutcome {
  readonly room: DesignRoom;
  /** The generator's own reason, or `composed`. */
  readonly outcome: string;
}

interface ArmSweep {
  readonly kitchens: readonly PricedKitchen[];
  readonly outcomes: readonly RoomOutcome[];
}

const sweeps = new Map<string, ArmSweep>();

function roomsOf(arm: VariedArm): readonly DesignRoom[] {
  return [
    ...arm.boundaryRooms,
    ...fc.sample(arm.sampledRooms, {
      numRuns: SAMPLED_ROOMS_PER_ARM,
      seed: SWEEP_SEED,
    }),
  ];
}

function sweep(arm: VariedArm): ArmSweep {
  const cached = sweeps.get(arm.name);
  if (cached !== undefined) return cached;

  const kitchens: PricedKitchen[] = [];
  const outcomes: RoomOutcome[] = [];
  for (const [index, room] of roomsOf(arm).entries()) {
    const result = generateKitchen({
      room,
      occurredAt: GENERATED_AT,
      probeAt: createFakeProbeFactory(),
    });
    outcomes.push({
      room,
      outcome: result.ok ? "composed" : result.reason.code,
    });
    if (!result.ok) continue;
    const tiers = TIER_PAIRS[index % TIER_PAIRS.length];
    if (tiers === undefined) throw new Error("the book offers no tier pair");
    kitchens.push(priceAndProject(withTiers(result.design, tiers)));
  }
  const swept = { kitchens, outcomes };
  sweeps.set(arm.name, swept);
  return swept;
}

/** The arm's composed kitchens, the tier pair rotating with the room so every pair is priced. */
export function variedKitchensOf(arm: VariedArm): readonly PricedKitchen[] {
  return sweep(arm).kitchens;
}

/** What the generator answered for every room of the arm, composed or not. */
export function roomOutcomesOf(arm: VariedArm): readonly RoomOutcome[] {
  return sweep(arm).outcomes;
}

function farEdgeMm(placement: DesignPlacement): number {
  return placement.alongMm + placement.body.widthMm / 2;
}

function onWall(design: Design, wall: DesignWall): readonly DesignPlacement[] {
  return design.placements.filter((placement) => placement.wall === wall);
}

function furthestOn(
  design: Design,
  wall: DesignWall,
): DesignPlacement | undefined {
  return onWall(design, wall).reduce<DesignPlacement | undefined>(
    (furthest, placement) =>
      furthest === undefined || farEdgeMm(placement) > farEdgeMm(furthest)
        ? placement
        : furthest,
    undefined,
  );
}

function furthestFirstOn(
  design: Design,
  wall: DesignWall,
): readonly DesignPlacement[] {
  return [...onWall(design, wall)].sort(
    (first, second) => farEdgeMm(second) - farEdgeMm(first),
  );
}

function hasAPrice(design: Design): boolean {
  return priceAndProject(design).pricing.ok;
}

function wallLengthOf(room: DesignRoom, wall: DesignWall): number {
  if (wall === "A") return room.widthMm;
  if (wall === "B") return room.depthMm;
  return room.wallCMm ?? 0;
}

function withWallLength(
  room: DesignRoom,
  wall: DesignWall,
  lengthMm: number,
): DesignRoom {
  if (wall === "A") return { ...room, widthMm: lengthMm };
  if (wall === "B") return { ...room, depthMm: lengthMm };
  return { ...room, wallCMm: lengthMm };
}

/** A kitchen made to overflow, and the bodies the making put past their wall for certain. */
export interface OverflowingDesign {
  readonly design: Design;
  readonly mustOverflow: readonly string[];
}

export interface OverflowMaker {
  readonly name: string;
  /** `undefined` where the kitchen offers nothing for this making to act on. */
  readonly make: (kitchen: PricedKitchen) => OverflowingDesign | undefined;
}

/** The wall ends `shortBy` millimetres before the far edge of the body that reaches furthest along it. */
function shortenWall(
  design: Design,
  wall: DesignWall,
  shortBy: number,
): OverflowingDesign | undefined {
  const furthest = furthestOn(design, wall);
  if (furthest === undefined) return undefined;
  const lengthMm = Math.floor(farEdgeMm(furthest)) - shortBy;
  if (lengthMm <= 0) return undefined;
  return {
    design: { ...design, room: withWallLength(design.room, wall, lengthMm) },
    mustOverflow: [furthest.id],
  };
}

function lastWallOf(design: Design): DesignWall {
  if (design.room.shape === "U") return "C";
  return design.room.shape === "L" ? "B" : "A";
}

function hangingBodyIds(kitchen: PricedKitchen): readonly string[] {
  return kitchen.groups
    .filter((group) => group.band === "wall")
    .flatMap((group) => group.entries.map((entry) => entry.placementId));
}

function replacing(
  design: Design,
  id: string,
  change: (placement: DesignPlacement) => DesignPlacement,
): Design {
  return {
    ...design,
    placements: design.placements.map((placement) =>
      placement.id === id ? change(placement) : placement,
    ),
  };
}

const DESIGN_WALLS: readonly DesignWall[] = ["A", "B", "C"];
const ADDED_BODY_ID = "added-past-the-wall";
const FAR_PAST_THE_WALL_MM = 2500;

export const OVERFLOW_MAKERS: readonly OverflowMaker[] = [
  {
    name: "wall A one millimetre short of its furthest body",
    make: ({ design }) => shortenWall(design, "A", 1),
  },
  {
    name: "the last wall most of a body short",
    make: ({ design }) => shortenWall(design, lastWallOf(design), 400),
  },
  {
    name: "the last wall at half its length",
    make: ({ design }) => {
      const wall = lastWallOf(design);
      const furthest = furthestOn(design, wall);
      if (furthest === undefined) return undefined;
      return shortenWall(design, wall, Math.floor(farEdgeMm(furthest) / 2));
    },
  },
  {
    name: "every wall short at once",
    make: ({ design }) => {
      const walls = [...new Set(design.placements.map(({ wall }) => wall))];
      if (walls.length < 2) return undefined;
      return walls.reduce<OverflowingDesign>(
        (made, wall) => {
          const next = shortenWall(made.design, wall, 1);
          if (next === undefined) return made;
          return {
            design: next.design,
            mustOverflow: [...made.mustOverflow, ...next.mustOverflow],
          };
        },
        { design, mustOverflow: [] },
      );
    },
  },
  {
    name: "one hanging body alone slid past its wall",
    make: (kitchen) => {
      const [id] = hangingBodyIds(kitchen);
      if (id === undefined) return undefined;
      return {
        design: replacing(kitchen.design, id, (placement) => ({
          ...placement,
          alongMm: wallLengthOf(kitchen.design.room, placement.wall) + 1,
        })),
        mustOverflow: [id],
      };
    },
  },
  {
    name: "the furthest widenable body widened across its wall's end",
    make: ({ design }) => {
      // The last wall first, furthest body first, and the first body that can be widened and still be priced: a
      // fixed-size row has no price at a width no listed size reaches (ADR 0177 A-7), and a kitchen with no price has no
      // flag to carry beside it. Where the last wall holds nothing widenable, the other walls are tried.
      const walls = [lastWallOf(design), ...DESIGN_WALLS].filter(
        (wall, index, all) => all.indexOf(wall) === index,
      );
      for (const wall of walls) {
        for (const candidate of furthestFirstOn(design, wall)) {
          const reachMm = wallLengthOf(design.room, wall) - candidate.alongMm;
          const widened = replacing(design, candidate.id, (placement) => ({
            ...placement,
            body: { ...placement.body, widthMm: 2 * reachMm + 2 },
          }));
          if (hasAPrice(widened)) {
            return { design: widened, mustOverflow: [candidate.id] };
          }
        }
      }
      return undefined;
    },
  },
  {
    name: "a body of the same build added beyond wall A",
    make: ({ design }) => {
      const furthest = furthestOn(design, "A");
      if (furthest === undefined) return undefined;
      return {
        design: {
          ...design,
          placements: [
            ...design.placements,
            {
              ...furthest,
              id: ADDED_BODY_ID,
              alongMm: design.room.widthMm + FAR_PAST_THE_WALL_MM,
            },
          ],
        },
        mustOverflow: [ADDED_BODY_ID],
      };
    },
  },
];
