import "server-only";

import { isCapabilityHeld } from "@/lib/server/account/require-capability";
import { readCurrentSessionOrThrow } from "@/lib/server/account/current-session";

// Who may save a kitchen as a preset: one swappable function (ADR 0112 Amendment A). Both the
// save route and `GET /api/designs/{id}` ask `mayAuthorPresets`, so the server's answer decides whether the button is
// shown (ADR 0112 decision 2, bullet 3: the client never decides) and the route cannot disagree with it.

/** The part of a request a policy may read: its cookies and its headers, which is all a session lookup needs. A
 *  `NextRequest` satisfies it. */
export interface PresetAuthoringRequest {
  readonly cookies: {
    get(name: string): { readonly value: string } | undefined;
  };
  readonly headers: { get(name: string): string | null };
}

/**
 * Whether this request may author presets. The caller has already shown the design's own write token and visitor
 * (ADR 0114 decision G4), so a policy decides who may publish on top of that and never re-proves authorship.
 */
export type PresetAuthoringPolicy = (
  request: PresetAuthoringRequest,
) => Promise<boolean>;

/**
 * A signed-in session with a confirmed address whose account's current role holds `preset.create` (ADR 0172 decision
 * 7), which the domain gives to the administrator alone. The role is read from the account on every request, so a
 * demotion ends this at once. The confirmed address is asked here and not left to the capability table, which waives it
 * for every capability that is not a design's (K-14: a verified administrator only). The session is read by the variant
 * that throws: a store that is down is `mayAuthorPresets`'s refusal, never a guess.
 */
export const sessionHoldsPresetCreate: PresetAuthoringPolicy = async (
  request,
) => {
  const session = await readCurrentSessionOrThrow(request.cookies);
  return (
    session.kind === "signed-in" &&
    session.isEmailVerified &&
    isCapabilityHeld(session, "preset.create")
  );
};

/** The one place a policy is chosen. */
export const WIRED_PRESET_AUTHORING_POLICY: PresetAuthoringPolicy =
  sessionHoldsPresetCreate;

/**
 * The wired policy's answer, failing closed: a policy that throws or rejects does not let a request author a preset.
 */
export async function mayAuthorPresets(
  request: PresetAuthoringRequest,
): Promise<boolean> {
  try {
    return await WIRED_PRESET_AUTHORING_POLICY(request);
  } catch {
    return false;
  }
}
