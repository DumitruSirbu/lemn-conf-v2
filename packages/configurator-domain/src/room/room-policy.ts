// What a customer may enter as a room, as data the validator is handed rather than rules it holds
// (ADR 0108 decision 1), and the engine's own limits. Each limit is derived at module load from the
// constant that already imposes it, never a chosen number (decision 6).
//
// These limits are not the product's policy (Amendment B): the owner-approved bounds live in
// `approved-room-policy.ts`, and this object is the floor and ceiling that policy is guarded against.
//
// Nothing it imports may reach back into `room/`: a cycle would bind a bound to `undefined` and
// compare every value against it silently (see `module-grid.ts`). The type-only imports below are
// erased and add no edge.
import {
  narrowestCornerReachMm,
  twoCornersWallAMinimumMm,
} from "../corner-assembly-size.js";
import {
  LINEAR_ROOM_DEPTH_MM,
  MAX_ROOM_DEPTH_MM,
  MAX_ROOM_HEIGHT_MM,
  MAX_ROOM_WIDTH_MM,
} from "../design-bounds.js";
import type { DesignWall } from "../design.js";
import {
  GENERATION_PRIORITIES,
  type GenerationCoreRole,
} from "../generation/generation-priorities.js";
import { toExactMillimetres } from "../millimetres.js";
import { LEVELS } from "../module-grid.js";
import type { RoomShape } from "./validate-room.js";

/** Whole millimetres, inclusive at both ends. */
export interface MillimetreBounds {
  readonly minMm: number;
  readonly maxMm: number;
}

/** An L's two walls. Wall A's run is the room's `widthMm` and wall B's its `depthMm`
 *  (`wallLengthMm`'s mapping; ADR 0065 decision 5). */
export interface LWallBounds {
  readonly wallA: MillimetreBounds;
  readonly wallB: MillimetreBounds;
  /** The generated sink and hob, and the structural corner they must clear (ADR 0108 C–E), distinct
   *  from the catalogue's manually buildable width ranges. */
  readonly minimumKitchen: LMinimumKitchen;
}

/** A straight room's one wall (ADR 0130 D2). No `minimumKitchen`: with no corner to clear, the coupled
 *  rule (ADR 0108 C) collapses to wall A ≥ sink + hob, the wall's own minimum.
 *
 *  `depthMm` rides here rather than being imported by `validate-room.ts` (ADR 0130 D3): that module is
 *  held to type-only imports so it can never reach a cabinet depth reader, and a value import for this
 *  unrelated room depth would weaken that guard for every depth. */
export interface LinearWallBounds {
  readonly wallA: MillimetreBounds;
  readonly depthMm: number;
}

export interface LMinimumKitchen {
  /** `ENGINE_ROOM_LIMITS` carries the derived figures as a guard source but remains only the shell's
   *  geometric envelope; the owner-approved product policy requires the coupled rule. */
  readonly isRequired: boolean;
  readonly sinkWidthMm: number;
  readonly hobWidthMm: number;
  readonly cornerReachMm: {
    readonly wallA: number;
    readonly wallB: number;
  };
}

/** The U's coupled fit rule's figures (ADR 0108 Amendment H3): the sink stands on the back wall, and
 *  the hob follows it on wall A or round the far corner onto the far side wall. `ENGINE_ROOM_LIMITS`
 *  carries derived figures as a guard source and leaves the rule off, as for the L. */
export interface UMinimumKitchen {
  readonly isRequired: boolean;
  readonly sinkWidthMm: number;
  readonly hobWidthMm: number;
  /** What each run gives up to its corners before a body can stand. The approved literals are 1800 on
   *  wall A (both X-legs) and 1000 on a side wall (one corner's 900 mm reach plus the 100 mm slide
   *  reserve). The engine's values are a guard floor beneath them: wall A's is
   *  `twoCornersWallAMinimumMm()`, and a side wall's is `wallMinimumMm("B")`, 870, which leaves the
   *  slide reserve out. */
  readonly cornerReachMm: {
    readonly wallA: number;
    readonly sideWall: number;
  };
}

/** A U's three walls (ADR 0132 decision 2). Wall C mirrors wall B's run, so no fourth bound exists. */
export interface UWallBounds {
  readonly wallA: MillimetreBounds;
  readonly wallB: MillimetreBounds;
  readonly wallC: MillimetreBounds;
  readonly minimumKitchen: UMinimumKitchen;
}

/** A shape is buildable exactly when its walls' bounds are stated here, so a buildable shape cannot
 *  lack them (ADR 0108 decision 8, ADR 0130 decision 2). */
export interface BuildableShapes {
  readonly L?: LWallBounds;
  readonly linear?: LinearWallBounds;
  readonly U?: UWallBounds;
}

/** Whether the owner has ruled on these bounds. Load-bearing (ADR 0108, *Consequences*): no surface,
 *  commit or record may call the bounds settled while a policy reads `interim-unapproved`. */
export type RoomPolicyApproval = "interim-unapproved" | "owner-approved";

export interface RoomPolicy {
  readonly approval: RoomPolicyApproval;
  readonly buildableShapes: BuildableShapes;
  readonly heightBounds: MillimetreBounds;
}

/** Whether `policy` states bounds for `shape`: a boolean and no bound, the only thing a surface may
 *  learn about a shape it offers (ADR 0108 decision 3). A shape starts being offered by gaining its
 *  bounds in `APPROVED_ROOM_POLICY` and by no edit to any caller.
 *
 *  `Object.hasOwn`, never a plain index read: `statedShapes[shape]` also answers for `"toString"`,
 *  `"__proto__"` and `"constructor"`, which every `BuildableShapes` inherits. */
export function isShapeBuildable(
  shape: RoomShape,
  policy: RoomPolicy,
): boolean {
  return Object.hasOwn(policy.buildableShapes, shape);
}

/** Not a product bound (ADR 0108 decision 6, Amendment B). The minima are what the engine can build
 *  at every cabinet depth the customer can later choose (Amendment A); the maxima are what a design
 *  can store, so no policy maximum can exceed the wire bound for its axis (decision 7). Still
 *  `interim-unapproved`: the owner ruled on the approved policy's numbers, not on these. */
export const ENGINE_ROOM_LIMITS: RoomPolicy = {
  approval: "interim-unapproved",
  buildableShapes: {
    L: {
      wallA: { minMm: wallMinimumMm("A"), maxMm: MAX_ROOM_WIDTH_MM },
      wallB: { minMm: wallMinimumMm("B"), maxMm: MAX_ROOM_DEPTH_MM },
      minimumKitchen: {
        isRequired: false,
        sinkWidthMm: generatedRequiredWidthMm("sink"),
        hobWidthMm: generatedRequiredWidthMm("hob"),
        cornerReachMm: {
          wallA: wallMinimumMm("A"),
          wallB: wallMinimumMm("B"),
        },
      },
    },
    // ADR 0130 D2: no corner to clear, so the minimum is the generated sink plus the generated hob,
    // and the maximum is the storage ceiling every wall carries (decision 7).
    linear: {
      wallA: {
        minMm:
          generatedRequiredWidthMm("sink") + generatedRequiredWidthMm("hob"),
        maxMm: MAX_ROOM_WIDTH_MM,
      },
      depthMm: LINEAR_ROOM_DEPTH_MM,
    },
    // ADR 0132 decision 4: wall A clears two corners, so its minimum is `twoCornersWallAMinimumMm()`.
    // Wall C's minimum is wall B's: the right corner's narrowest reach reads only the cabinet depth
    // and the catalogue, and `narrowestCornerReachMm` cannot be asked for a wall it holds no piece on.
    U: {
      wallA: { minMm: twoCornersWallAMinimumMm(), maxMm: MAX_ROOM_WIDTH_MM },
      wallB: { minMm: wallMinimumMm("B"), maxMm: MAX_ROOM_DEPTH_MM },
      wallC: { minMm: wallMinimumMm("B"), maxMm: MAX_ROOM_DEPTH_MM },
      // ADR 0108 H3, derived like the L's as a guard floor and not the product's figures: the approved
      // 1800 and 1000 sit in `APPROVED_ROOM_POLICY`, guarded against these.
      minimumKitchen: {
        isRequired: false,
        sinkWidthMm: generatedRequiredWidthMm("sink"),
        hobWidthMm: generatedRequiredWidthMm("hob"),
        cornerReachMm: {
          wallA: twoCornersWallAMinimumMm(),
          sideWall: wallMinimumMm("B"),
        },
      },
    },
  },
  heightBounds: { minMm: baseRowTopMm(), maxMm: MAX_ROOM_HEIGHT_MM },
};

/** The same declared generated width `planKitchenComposition` consumes. The required marker is checked
 *  too: a role removed from the generated minimum must not remain a room prerequisite. */
function generatedRequiredWidthMm(
  role: Extract<GenerationCoreRole, "sink" | "hob">,
): number {
  const priority = GENERATION_PRIORITIES.find(
    (candidate) => candidate.role === role,
  );
  if (!priority?.required) {
    throw new Error(
      `ENGINE_ROOM_LIMITS: generation declares no required ${role} width for the minimum kitchen`,
    );
  }
  return priority.widthMm;
}

/** The least length `wall` may have and still hold a corner at any declared cabinet depth: the
 *  narrowest corner's reach (a one-door cabinet at each of three levels), not the reference kitchen's.
 *  Room-independent, so the bound does not depend on the rooms it admits (ADR 0120 Amendment A;
 *  derivation in `corner-assembly-size.ts`).
 *
 *  The approved minima (900 and 1000) are deliberately above this 870, and the margin is pinned by
 *  `approved-room-policy.test.ts` (ADR 0108 B1: only the owner may choose a margin). The U's approved
 *  literals are pinned beside it, and `room-policy.test.ts` pins that the engine's U bounds derive
 *  from the sources named above. */
function wallMinimumMm(wall: DesignWall): number {
  return narrowestCornerReachMm(wall).wallMinimumMm;
}

/** The top of `LEVELS[0]`, the base row: below it no cabinet stands at all. */
function baseRowTopMm(): number {
  const baseRow = LEVELS[0];
  const topMm =
    baseRow === undefined ? undefined : toExactMillimetres(baseRow[1]);
  if (topMm === undefined) {
    throw new Error(
      "ENGINE_ROOM_LIMITS: LEVELS declares no base row on a whole millimetre to derive the height minimum from",
    );
  }
  return topMm;
}
