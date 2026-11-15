// What a body declares about the wall body that hangs over it (ADR 0183). One declaration per row, never an id or a
// role read in a second place (ADR 0110 E7's own reason): the freestanding fridge is the one row that declares it.
//
// Two facts, one field each, so neither is a second meaning of the other: whether generation owes a wall body over
// the row (decision 1), and whether a wall body over the row is built to the deepest declared cabinet depth
// (decision 4, Amendment A). Generation reads the first; the depth rule reads the second, through the column.

export interface WallBodyOverIt {
  /** Generation hangs one `wall-cabinet` over every placed body of this row, on the body's top, as wide as the body
   *  (ADR 0183 decision 1). Where the room cannot take it, the step is logged as not placed (decision 2). */
  readonly isOwedByGeneration: boolean;
  /** A wall body standing over this row, whoever placed it, is built to the deepest declared cabinet depth rather
   *  than the cabinet-depth setting, so it covers the machine under it (ADR 0183 decision 4). Read by the depth
   *  rule through `Column.hasDeepWallBodyUnder`, never by generation. */
  readonly isBuiltToTheDeepestCabinetDepth: boolean;
}

/** The freestanding fridge's declaration: a body is owed over it, and a body over it is built to the deepest depth. */
export const A_WALL_BODY_IS_OWED_AND_BUILT_DEEP_OVER_IT: WallBodyOverIt = {
  isOwedByGeneration: true,
  isBuiltToTheDeepestCabinetDepth: true,
};

/** Whether this entry declares that generation owes a wall body over it. The one reader of
 *  `isOwedByGeneration`: an absent declaration reads as *no*, and a row the catalogue does not hold declares
 *  nothing. */
export function isAWallBodyOwedOver(
  definition: { readonly wallBodyOverIt?: WallBodyOverIt } | undefined,
): boolean {
  return definition?.wallBodyOverIt?.isOwedByGeneration === true;
}

/** Whether this entry, a catalogue row or the record copied off it, declares that a wall body over it is built to
 *  the deepest declared cabinet depth. The one reader of `isBuiltToTheDeepestCabinetDepth`, as absent as above. */
export function declaresADeepWallBodyOver(
  declarer: { readonly wallBodyOverIt?: WallBodyOverIt } | undefined,
): boolean {
  return declarer?.wallBodyOverIt?.isBuiltToTheDeepestCabinetDepth === true;
}
