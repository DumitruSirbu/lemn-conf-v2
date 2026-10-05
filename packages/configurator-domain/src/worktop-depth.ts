// The one place a worktop depth exists, and the one place a wall carcass's depth is decided from it.
//
// `catalog.ts`'s `WALL_DEPTH_MM` and `insert-fit.ts`'s head-clearance cap both read this module, so there
// is exactly one 330 in the source: two independent constants would let a re-inserted top-row cabinet
// be built deeper than its neighbours.

/** The default cabinet depth: what a legacy document with no persisted depth is built at, and the
 *  declared depth the shipped kitchen is built at. A design carries its own (`cabinetDepthMmOf`) and the
 *  catalogue's depth-derived facts are functions of it, so this is only the default argument. */
export const DEFAULT_CABINET_DEPTH_MM = 600;

/** ADR 0059: the dishwasher decor door reaches its appliance at 520 mm. The arithmetic stays
 * beside the floor so a later geometry change cannot leave an unexplained product limit behind. */
const BASE_FRONT_OVERHANG_MM = 40;
const DISHWASHER_HALF_DEPTH_MM = 240;
export const MIN_CABINET_DEPTH_MM =
  2 * DISHWASHER_HALF_DEPTH_MM + BASE_FRONT_OVERHANG_MM;

/** Compatibility name for the single-depth model: "worktop" here means *cabinet* depth (ADR 0036
 * decision 3: the worktop is an external part that influences neither geometry nor price), and the
 * rename is deferred. New code reads a design's `cabinetDepthMm` and uses `DEFAULT_CABINET_DEPTH_MM`
 * only to migrate legacy documents. Not marked `@deprecated`: every remaining caller is still correct,
 * and a tag over that many call sites would turn `lint` red for work nobody has done wrong. */
export const WORKTOP_DEPTH_MM = DEFAULT_CABINET_DEPTH_MM;

/** Wall and top carcass depth per worktop depth: a declaration, not a computation. Wall cabinets come
 *  in manufactured sizes and the owner's numbers are non-linear (100 mm of worktop buys 70 mm of wall),
 *  so a third worktop size is a new row here, never an interpolation. */
const WALL_DEPTH_MM_BY_WORKTOP_DEPTH_MM: ReadonlyMap<number, number> = new Map([
  [600, 330],
  [700, 400],
]);

/** A worktop depth the map does not declare. It is a programming error rather than a number to
 *  guess at: no interpolation, no rounding, no nearest row, no silent default. */
export class UnknownWorktopDepthError extends Error {
  constructor(worktopDepthMm: number) {
    super(
      `No wall depth declared for a worktop depth of ${String(worktopDepthMm)} mm. ` +
        `Declared worktop depths: ${declaredWorktopDepthsMm().join(", ")} mm.`,
    );
    this.name = "UnknownWorktopDepthError";
  }
}

export class CabinetDepthBelowMinimumError extends Error {
  constructor(cabinetDepthMm: number) {
    super(
      `Cabinet depth ${String(cabinetDepthMm)} mm is below the ${String(MIN_CABINET_DEPTH_MM)} mm dishwasher floor.`,
    );
    this.name = "CabinetDepthBelowMinimumError";
  }
}

/** The wall/top carcass depth a given worktop implies. Throws rather than falling back, because a
 *  guessed depth builds a cabinet that is not manufactured. */
export function wallDepthMmForWorktop(worktopDepthMm: number): number {
  const wallDepthMm = WALL_DEPTH_MM_BY_WORKTOP_DEPTH_MM.get(worktopDepthMm);
  if (wallDepthMm === undefined) {
    throw new UnknownWorktopDepthError(worktopDepthMm);
  }
  return wallDepthMm;
}

/** The worktop depths the map declares, for a refusal sentence and for the tests that sweep the
 *  whole map rather than a hand-picked row. */
export function declaredWorktopDepthsMm(): readonly number[] {
  return [...WALL_DEPTH_MM_BY_WORKTOP_DEPTH_MM.keys()];
}

/** Product-vocabulary alias for the same declaration. */
export function declaredCabinetDepthsMm(): readonly number[] {
  return declaredWorktopDepthsMm();
}

/** Validates both independent domain rules: the dishwasher floor and membership in the declared
 * manufactured-depth map. No clamp, interpolation or nearest row is permitted. */
export function requireDeclaredCabinetDepthMm(cabinetDepthMm: number): number {
  if (cabinetDepthMm < MIN_CABINET_DEPTH_MM) {
    throw new CabinetDepthBelowMinimumError(cabinetDepthMm);
  }
  if (!declaredCabinetDepthsMm().includes(cabinetDepthMm)) {
    throw new UnknownWorktopDepthError(cabinetDepthMm);
  }
  return cabinetDepthMm;
}

/** A declared dimension is the *finished* cabinet, doors included (ADR 0036 decision 1), so a fronted
 *  carcass is built at its declared depth less what stands in front of it: an 18 mm door slab and a bar
 *  handle reaching 21 mm past that.
 *
 *  Measured with the real `BodyProbe`: the 4 mm gap ADR 0036 counted is `kitchen-parts.ts`'s lateral
 *  `GAP` between door leaves, which never reaches the depth axis; the remainder is the handle.
 *
 *  A product rule, not a builder detail (§12), so it lives beside the depth map: it makes "330" mean
 *  the same thing to the catalogue, a swap's opening and the geometry. The adapter derives its own
 *  value from the door and handle it builds, and a three-adapter gate asserts the two agree. */
export const WALL_FRONT_ASSEMBLY_MM = 39;
