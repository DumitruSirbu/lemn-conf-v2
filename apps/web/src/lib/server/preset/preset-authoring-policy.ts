// Who may save a kitchen as a preset: one swappable function (ADR 0112 Amendment A). Both the
// save route and `GET /api/designs/{id}` ask `mayAuthorPresets`, so the server's answer decides whether the button is
// shown (ADR 0112 decision 2, bullet 3: the client never decides) and the route cannot disagree with it.
//
// This module imports neither `server-only` nor a framework value: the launch gate runs it in a bare Vitest process
// that carries neither alias, and what it reads is only which function is wired below.

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
 * Anyone who holds a design's write token and visitor may publish it, in every environment, with no flag and no secret
 * (the owner's ruling of 2026-10-17, ADR 0112 Amendment A). The accepted, time-boxed risk: anyone who can reach an
 * environment can publish a preset onto every Step 1 screen in that environment's database.
 *
 * It ends at the first public deploy: `pnpm gate:launch-placeholders` refuses while this is the wired policy.
 */
export const ungatedUntilLaunch: PresetAuthoringPolicy = () =>
  Promise.resolve(true);

/** The one place a policy is chosen. Fix 3 (accounts and roles) wires the administrator capability `preset.create`
 *  here and the route does not change. */
export const WIRED_PRESET_AUTHORING_POLICY: PresetAuthoringPolicy =
  ungatedUntilLaunch;

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
