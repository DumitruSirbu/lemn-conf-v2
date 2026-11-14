// The wall body generation owes over a body whose catalogue row declares one (ADR 0183 decisions 1 and 2): today the
// freestanding fridge's. It is a step of its own, between the uppers and the top row. It carries a role of its own so
// that no Step 1 row counts it, and a stable id so a log is read the same way twice.
//
// The top row is composed only over placed uppers (ADR 0110 Amendment O9), and this body is neither an upper nor a
// hood, so nothing is attempted over it: the cabinet runs to the top of its opening, which is the ceiling, or 2600 mm
// where the module grid ends first.

export type OverBodyRole = "over-body";

/** The role of the wall body over a placed body, and (`overBodyStepId`) its step id: `over-body:fridge`. */
export const OVER_BODY_ROLE: OverBodyRole = "over-body";
const OVER_BODY_STEP_ID_PREFIX = "over-body:";

export function overBodyStepId(plannedBaseId: string): string {
  return `${OVER_BODY_STEP_ID_PREFIX}${plannedBaseId}`;
}
