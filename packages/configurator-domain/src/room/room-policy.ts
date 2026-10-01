// ADR 0108: what a customer may enter as a room, as data the validator is handed rather than rules
// it holds (decision 1) — the policy's shape, and the engine's own limits. Each limit is **derived at
// module load from the constant that already imposes it**, never a chosen number (decision 6).
//
// **Since Amendment B these limits are not the product's policy.** The owner approved the L's bounds
// as numbers, and those live in `approved-room-policy.ts`; this object is the floor and ceiling that
// policy is guarded against, so an engineering change that moves a limit past an approved bound turns
// a test red instead of silently moving what a customer may enter.
//
// Nothing it imports reaches back into `room/`: a cycle here would bind a bound to `undefined` and
// compare every value against it silently, the failure `module-grid.ts`'s head comment records.
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
// Type-only, so it is erased and adds no edge to the module graph the head comment guards.
import type { DesignWall } from "../design.js";
import {
  GENERATION_PRIORITIES,
  type GenerationCoreRole,
} from "../generation/generation-priorities.js";
import { toExactMillimetres } from "../millimetres.js";
import { LEVELS } from "../module-grid.js";
// Type-only, so it is erased and adds no edge to the module graph the head comment guards.
import type { RoomShape } from "./validate-room.js";

/** Whole millimetres, inclusive at both ends. */
export interface MillimetreBounds {
  readonly minMm: number;
  readonly maxMm: number;
}

/** An L's two walls. Wall A's run is the room's `widthMm` and wall B's its `depthMm` —
 *  `wallLengthMm`'s mapping (ADR 0065 decision 5). */
export interface LWallBounds {
  readonly wallA: MillimetreBounds;
  readonly wallB: MillimetreBounds;
  /** The generated sink and hob, and the structural corner they must clear (ADR 0108 C–E).
   *  These are distinct from the catalogue's manually buildable width ranges. */
  readonly minimumKitchen: LMinimumKitchen;
}

/** A straight room's one wall (ADR 0130 D2). **No `minimumKitchen`**: with no corner to clear, the
 *  coupled rule (ADR 0108 C) collapses to *wall A ≥ sink + hob*, which is the wall's own minimum —
 *  there is no second wall for the rule to couple against.
 *
 *  **`depthMm` rides here rather than being imported by `validate-room.ts` directly** (ADR 0130 D3):
 *  that module's own guard (`validate-room.ts can read no depth...`) holds it to type-only imports so
 *  it can never reach a *cabinet* depth reader — a value import for this unrelated room depth would
 *  weaken that guard's mechanism for every depth, not only the one this shape is exempt from. Handed
 *  through the policy instead, the same way every other bound here is. */
export interface LinearWallBounds {
  readonly wallA: MillimetreBounds;
  readonly depthMm: number;
}

export interface LMinimumKitchen {
  /** `ENGINE_ROOM_LIMITS` carries the derived figures as a guard source but remains only the shell's
   *  geometric envelope. The owner-approved product policy requires the coupled rule. */
  readonly isRequired: boolean;
  readonly sinkWidthMm: number;
  readonly hobWidthMm: number;
  readonly cornerReachMm: {
    readonly wallA: number;
    readonly wallB: number;
  };
}

/** The U's coupled fit rule's own figures (ADR 0108 Amendment H3, landed by M7B U3b S3): the sink
 *  stands on the back wall, and the hob follows it on wall A or round the far corner onto the far side
 *  wall. `ENGINE_ROOM_LIMITS` carries the derived figures as a guard source and leaves the rule off,
 *  as it does for the L; the owner-approved literals entered `APPROVED_ROOM_POLICY` at M7B U6. */
export interface UMinimumKitchen {
  readonly isRequired: boolean;
  readonly sinkWidthMm: number;
  readonly hobWidthMm: number;
  /** The run's corner allowance: what each run gives up to its corners before a body can stand.
   *  The approved literals (U6) are H3's 1800 on wall A, both X-legs together, and 1000 on a side wall,
   *  one corner's 900 mm reach plus the 100 mm slide reserve its run keeps at its end. The engine's
   *  values are a guard floor beneath them: wall A's is `twoCornersWallAMinimumMm()`, which is 1800 too,
   *  and a side wall's is `wallMinimumMm("B")`, 870 (880 before ADR 0135), which leaves the slide reserve out. */
  readonly cornerReachMm: {
    readonly wallA: number;
    readonly sideWall: number;
  };
}

/** A U's three walls (ADR 0132 decision 2). Wall C mirrors wall B's own run, so no fourth bound
 *  exists here. Its coupled fit rule is ADR 0108 Amendment H3's own, stated once for the room. */
export interface UWallBounds {
  readonly wallA: MillimetreBounds;
  readonly wallB: MillimetreBounds;
  readonly wallC: MillimetreBounds;
  readonly minimumKitchen: UMinimumKitchen;
}

/** A shape is buildable exactly when its walls' bounds are stated here, so a buildable shape cannot
 *  lack them. The L, the straight kitchen and the U can be stated (ADR 0108 decision 8, extended by
 *  ADR 0130 decision 2 and M7B U2 S2); the approved policy states all three since U6. */
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

/** Whether `policy` states bounds for `shape`: a boolean and **no bound**, which is the only thing
 *  ADR 0108 decision 3 lets a surface learn about a shape it offers. It reads the policy's data
 *  rather than naming a shape, so a shape starts being offered by gaining its bounds in
 *  `APPROVED_ROOM_POLICY` and by no edit to any caller — which is how wave 7J turns the straight
 *  kitchen on without touching a component.
 *
 *  **`Object.hasOwn`, never a plain index read** (R1.2). `statedShapes[shape]` answers for
 *  `"toString"`, `"__proto__"` and `"constructor"` too — every `BuildableShapes` object inherits
 *  them from `Object.prototype`, whatever bounds it actually states — so a caller handed one of
 *  those three strings as `shape` would read a buildable room that is not a `RoomShape` at all. */
export function isShapeBuildable(
  shape: RoomShape,
  policy: RoomPolicy,
): boolean {
  return Object.hasOwn(policy.buildableShapes, shape);
}

/** **Not a product bound — none of these is** (ADR 0108 decision 6, Amendment B). The minima are what
 *  the engine can build at all, at every cabinet depth the customer can later choose (Amendment A);
 *  the maxima are what a design can store, so no policy maximum can exceed the wire bound for its
 *  axis (decision 7). Still `interim-unapproved`: the owner ruled on the approved policy's numbers,
 *  not on these. */
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
    // ADR 0130 D2: no corner to clear, so the minimum is the wall's own — the generated sink plus the
    // generated hob — and the maximum is the same storage ceiling every wall carries (decision 7).
    linear: {
      wallA: {
        minMm:
          generatedRequiredWidthMm("sink") + generatedRequiredWidthMm("hob"),
        maxMm: MAX_ROOM_WIDTH_MM,
      },
      depthMm: LINEAR_ROOM_DEPTH_MM,
    },
    // ADR 0132 decision 4: wall A now clears two corners, not one, so its minimum is
    // `twoCornersWallAMinimumMm()` rather than `wallMinimumMm("A")`. Wall C's own minimum is wall
    // B's: the right corner's narrowest reach on wall C is the same figure `narrowestCornerReachMm`
    // gives wall B's own (`corner-assembly-size.ts`'s right-corner head comment — the formula reads
    // only the cabinet depth and the catalogue, never which corner is asking), and that function
    // cannot itself be asked for a wall it holds no assembly piece on.
    U: {
      wallA: { minMm: twoCornersWallAMinimumMm(), maxMm: MAX_ROOM_WIDTH_MM },
      wallB: { minMm: wallMinimumMm("B"), maxMm: MAX_ROOM_DEPTH_MM },
      wallC: { minMm: wallMinimumMm("B"), maxMm: MAX_ROOM_DEPTH_MM },
      // ADR 0108 H3, derived like the L's, as a guard floor and not the product's figures: wall A's
      // allowance is the two X-legs its own minimum already clears, and a side wall's is the narrowest
      // corner's reach, which excludes the 100 mm slide reserve. The approved 1800 and 1000 are U6's
      // literals, and sit in `APPROVED_ROOM_POLICY` guarded against these.
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

/** The same declared generated width `planKitchenComposition` consumes. The required marker is
 *  checked too: a role removed from the generated minimum must not remain a room prerequisite. */
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

/** The least length `wall` may have and still hold a corner at all, **at any declared cabinet
 *  depth**. The L has exactly one corner assembly and it is structural (ADR 0021), so a wall
 *  shorter than this cannot hold its own corner at some depth the editor offers.
 *
 *  **Since 7D6's J1′ that is the *narrowest* corner's reach, not the reference kitchen's.** The
 *  generator sizes a corner to the room it builds in (ADR 0120 Amendment A), so the binding case is
 *  the narrowest corner the product will build — a cabinet with one door at each of the three
 *  levels — and it is room-independent, which is what keeps this bound from depending on the rooms
 *  the bound itself admits. The derivation is `corner-assembly-size.ts`'s, whose own head comment
 *  records why the quantifier lives in its three entry points' names.
 *
 *  **The approved minima are deliberately above it**: `approved-room-policy.ts` holds the owner's
 *  900 and 1000 while this reads 870 on both walls, and that margin is pinned — not merely allowed
 *  — by `approved-room-policy.test.ts` (ADR 0108 B1 permits a margin; only the owner may choose
 *  one, which is M7's Q-K1). That pin is the L's. The U's approved literals are pinned beside it in
 *  `approved-room-policy.test.ts` (M7B U6), and `room-policy.test.ts` pins that the engine's U bounds
 *  and minimum kitchen are derived from the sources named above. */
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
