/**
 * `/internal/scene-shot` is verification tooling, not a customer surface: `noindex` and the absence
 * of any link to it are not authorisation (SEC-003). It is not deleted because
 * `scripts/capture-fidelity.mjs` drives it against a real production build to run the M1 fidelity
 * gate, so it is opt-in instead — a deployed environment serves 404 unless someone sets the flag
 * deliberately, and the capture script sets it on the server it spawns.
 */
export const SCENE_SHOT_ROUTE_FLAG = "LEMNARIA_ENABLE_SCENE_SHOT_ROUTE";

/** Only this exact value opts in, so a stray `false`/`0`/`off` cannot read as "enabled". */
export const SCENE_SHOT_ROUTE_FLAG_ENABLED = "1";

/**
 * Local development and the e2e dev server always have the route: they are not an exposed origin,
 * and requiring the flag there would only teach people to set it everywhere.
 */
export function isSceneShotRouteEnabled(
  environment: Record<string, string | undefined>,
): boolean {
  if (environment.NODE_ENV !== "production") return true;
  return environment[SCENE_SHOT_ROUTE_FLAG] === SCENE_SHOT_ROUTE_FLAG_ENABLED;
}
