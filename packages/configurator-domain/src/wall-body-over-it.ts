// What a body declares about the wall body that hangs over it (ADR 0183). One declaration per row, never an id or a
// role read in a second place (ADR 0110 E7's own reason): the freestanding fridge is the one row that declares it.
//
// Today it says whether generation owes a wall body over the row (decision 1). The deepest-declared build depth a
// wall body over the row takes (decision 4, wave W3a) is the second fact of the same declaration, so it joins this
// interface and the catalogue row stays the one place the question is answered.

export interface WallBodyOverIt {
  /** Generation hangs one `wall-cabinet` over every placed body of this row, on the body's top, as wide as the body
   *  (ADR 0183 decision 1). Where the room cannot take it, the step is logged as not placed (decision 2). */
  readonly isOwedByGeneration: boolean;
}

/** The freestanding fridge's declaration: a body is owed over it. */
export const A_WALL_BODY_IS_OWED_OVER_IT: WallBodyOverIt = {
  isOwedByGeneration: true,
};

/** Whether this entry declares that generation owes a wall body over it. The one reader of
 *  `BodyDefinition.wallBodyOverIt`: an absent declaration reads as *no*, and a row the catalogue does not hold
 *  declares nothing. */
export function isAWallBodyOwedOver(
  definition: { readonly wallBodyOverIt?: WallBodyOverIt } | undefined,
): boolean {
  return definition?.wallBodyOverIt?.isOwedByGeneration === true;
}
