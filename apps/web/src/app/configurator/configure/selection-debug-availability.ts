/**
 * `SelectionDebug` is e2e instrumentation, not a customer surface: it publishes selection ids, §8's
 * derived opening dimensions, the save status, the current design id, the body-probe state and the
 * last rejection code into DOM attributes. None of those is a write credential, but a stable DOM
 * oracle for internal state does not belong on the production attack surface (finding WEB-004), so
 * the component is opted **in** rather than out.
 *
 * Same shape and same reasoning as `app/internal/scene-shot/route-availability.ts`, deliberately:
 * one pattern for "test-only surface, off unless a flag says otherwise", not two.
 *
 * **Two differences from that one, and both are the point.** It is `NEXT_PUBLIC_`-prefixed because
 * that is the only prefix Next exposes to client code at all; without it the flag reads `undefined`
 * in the browser and the e2e suite silently loses its hook. And there is **no development
 * exemption**: `NODE_ENV === "development"` must not imply E2E observability, because ordinary
 * development is not the e2e suite and a developer's browser is not a Playwright worker. Playwright
 * sets the flag on the server it starts (`playwright.config.ts`).
 *
 * **What the gate does and does not do** (finding S7-F3, verified against a real production build
 * rather than assumed). The component returns `null`, so no `[data-testid="selection-debug"]` node
 * ever reaches the page — that is the whole of WEB-004 and it holds. It is **not** dead-code
 * elimination: with the variable absent at build time Next emits a runtime read against its
 * `process` shim rather than folding the comparison, so the readout's markup and attribute names
 * remain present as unreachable code in the client chunk. Unreachable code publishes nothing; do
 * not upgrade that into a claim the build does not support.
 */
export const SELECTION_DEBUG_FLAG =
  "NEXT_PUBLIC_LEMNARIA_ENABLE_SELECTION_DEBUG";

/** Only this exact value opts in, so a stray `false`/`0`/`off` cannot read as "enabled". */
export const SELECTION_DEBUG_FLAG_ENABLED = "1";

/**
 * Takes the flag's value rather than an environment object, unlike `isSceneShotRouteEnabled`. That
 * is what keeps it inlinable: Next replaces the literal member expression
 * `process.env.NEXT_PUBLIC_…` and nothing else, so a caller that handed over `process.env` whole
 * would defeat the substitution and reach for `process` in a browser that has none.
 */
export function isSelectionDebugEnabled(
  flagValue: string | undefined,
): boolean {
  return flagValue === SELECTION_DEBUG_FLAG_ENABLED;
}
