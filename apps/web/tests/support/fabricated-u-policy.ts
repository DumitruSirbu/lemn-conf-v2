// ADR 0116's R8 fabrication, in the one place it now stands (C1.4): a policy that states the U's
// bounds the way `APPROVED_ROOM_POLICY` will once the owner rules on them. `APPROVED_ROOM_POLICY`
// has no U bounds of its own yet, so every room suite that needs a policy building a U borrows the
// approved L's own bounds, reshaped into a real `UWallBounds` — wall C standing in for wall B's, the
// domain's own proof that the right corner's narrowest reach on wall C equals wall B's
// (`corner-assembly-size.ts`'s right-corner head comment) — rather than a cast between two
// differently-shaped types. Before this file the same four lines were pasted into four test files.
import {
  APPROVED_ROOM_POLICY,
  type RoomPolicy,
  type UWallBounds,
} from "@lemnaria/configurator-domain";

/** The approved policy plus a U, so a suite can prove Step 1 carries a U before the owner's bounds
 *  land at U6. `isShapeBuildable("U", APPROVED_ROOM_POLICY)` stays false: this is a new value, and
 *  the approved policy is not touched. */
export function policyStatingU(): RoomPolicy {
  return {
    ...APPROVED_ROOM_POLICY,
    buildableShapes: {
      ...APPROVED_ROOM_POLICY.buildableShapes,
      U: approvedUWallBoundsStandIn(),
    },
  };
}

/** `APPROVED_ROOM_POLICY`'s own L bounds, reshaped into `UWallBounds`. Throws if the approved
 *  policy ever stops stating an L — every room suite that calls this assumes it does. */
export function approvedUWallBoundsStandIn(): UWallBounds {
  const l = APPROVED_ROOM_POLICY.buildableShapes.L;
  if (l === undefined) {
    throw new Error(
      "the approved policy states no L bounds to fabricate the U's from",
    );
  }
  return { wallA: l.wallA, wallB: l.wallB, wallC: l.wallB };
}
