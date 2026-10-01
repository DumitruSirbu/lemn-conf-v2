// ADR 0116's fabrication, in the one place it now stands. Until M7B U6 the approved policy stated no
// U, so a suite proving Step 1 carries a U borrowed the L's bounds. `APPROVED_ROOM_POLICY` states the
// U itself now, and every shape is buildable under it — so no real policy refuses a shape. A suite whose
// subject is the shape refusal (the region, its words, its announcements, the 1C note it brings) needs
// a policy that states no U, and this is it: the approved policy with the U's bounds taken away.
import {
  APPROVED_ROOM_POLICY,
  type RoomPolicy,
} from "@lemnaria/configurator-domain";

/** The approved policy without its U, so the U is a shape the policy does not build. Throws if the
 *  approved policy ever stops stating an L or a straight kitchen — the suites that call this assume it does. */
export function policyWithoutU(): RoomPolicy {
  const { L, linear } = APPROVED_ROOM_POLICY.buildableShapes;
  if (L === undefined || linear === undefined) {
    throw new Error(
      "the approved policy states no L or straight kitchen to build a policy without a U from",
    );
  }
  return { ...APPROVED_ROOM_POLICY, buildableShapes: { L, linear } };
}
