// Which planned bases get an upper, and which upper it is (ADR 0110 Amendments C and E7, and N3
// revised 9-11 for a U). `generateKitchen` places an upper by `insertBody` into the shell's wall-row
// void above a base, so an upper this policy does not owe leaves its void behind for the editor's
// ordinary insert (N11, RQ7). The top row (Amendment O9) follows the upper: one 400 mm cabinet over
// each upper placed, so it stands over no full-height body and, on a large U's back wall, over the
// hood alone; `isATopRowFitting` is the one question the room is asked.
//
// What a U adds to the L's rule:
// - A large U's back wall is base-only (N3 revised 11, RQ7): no other wall-row or top-row body is
//   generated on wall A, and the hood over the hob stays with its top cabinet, because a hood is an
//   appliance and the owner's reason was the cost of furniture.
// - Below 10 m the uppers follow C and E7 as the L's do: over the back wall (the wall-A fill included,
//   N11.9), over the far wall's door bases (RQ14), and never over a full-height body.
// - No upper stands over either corner zone (7D2 criterion 14) without a test here: a base stands only
//   in its wall's floor run, and each run starts past its corner's reach (`uShellFloorRuns`). A
//   property over generated designs guards it, reading the shell's wall-only strips.
import { HEIGHT_FLEX_MIN_OPENING_MM } from "../commands/insert-fit.js";
import type { DesignRoom } from "../design.js";
import { TOP_ROW_Y0_MM } from "../push-to-open.js";
import type { BodyCatalog } from "../void-engine.js";
import {
  isBackWallBaseOnly,
  type UPlannedGenerationBase,
} from "./run-layout.js";

export const WALL_ROW_Y0_MM = 1500;
export const WALL_CABINET_BUILD_ID = "wall-cabinet";
export const HOOD_BUILD_ID = "hood";

export type UpperRole = "upper" | "hood";

export type TopRole = "top";

/** The role and the step-id prefix of the top cabinet over an upper: `top:upper:sink`, `top:hood:hob`. */
export const TOP_ROLE: TopRole = "top";
export const TOP_STEP_ID_PREFIX = "top:";

/** Whether the room is tall enough for the generated top row (ADR 0110 Amendment O: rooms at least
 *  2600 high). Derived: the ceiling less `TOP_ROW_Y0_MM` must reach `HEIGHT_FLEX_MIN_OPENING_MM`,
 *  `insertBody`'s own `OPENING_TOO_SHORT` refusal (`insert-fit.ts`), so below it every top void stays
 *  empty and no insert is attempted.
 *
 *  The shell's corner top unit decides by a second expression (`piecesUnderTheCeiling`) that agrees
 *  only while that constant equals the unit's 400; `qa-c3s1-top-row.adversarial.test.ts` pins both
 *  switching at the same millimetre. */
export function hasRoomForATopRow(room: DesignRoom): boolean {
  return room.heightMm - TOP_ROW_Y0_MM >= HEIGHT_FLEX_MIN_OPENING_MM;
}

export function upperRoleOver(planned: UPlannedGenerationBase): UpperRole {
  return planned.role === "hob" ? "hood" : "upper";
}

export function upperBuildIdOver(planned: UPlannedGenerationBase): string {
  return planned.role === "hob" ? HOOD_BUILD_ID : WALL_CABINET_BUILD_ID;
}

/** Whether generation owes an upper above `planned`: none over a full-height body (E7), and none over
 *  wall A's bodies in a large U, whose hob keeps its hood. */
export function isAnUpperOwedOver(
  planned: UPlannedGenerationBase,
  context: { readonly room: DesignRoom; readonly catalog: BodyCatalog },
): boolean {
  if (risesIntoWallRow(context.catalog, planned.buildId)) return false;
  return !isOverABaseOnlyBackWall(planned, context.room);
}

/** N3 revised 11: in a large U wall A's wall and top rows carry no generated body, the hood aside. */
function isOverABaseOnlyBackWall(
  planned: UPlannedGenerationBase,
  room: DesignRoom,
): boolean {
  return (
    isBackWallBaseOnly(room) && planned.wall === "A" && planned.role !== "hob"
  );
}

/** ADR 0110 Amendment E7: an upper is attempted above a base only where the body's declared top is at
 *  or below the wall row's floor. Reading the catalogue's declared height rather than a list of role
 *  names means a new full-height body needs no second place to be remembered. */
function risesIntoWallRow(catalog: BodyCatalog, buildId: string): boolean {
  const declaredTopMm = catalog.get(buildId)?.nominalHeightMm;
  if (declaredTopMm === undefined) {
    throw new Error(
      `generateKitchen: ${buildId} declares no height, so no upper can be ruled above it`,
    );
  }
  return declaredTopMm > WALL_ROW_Y0_MM;
}
