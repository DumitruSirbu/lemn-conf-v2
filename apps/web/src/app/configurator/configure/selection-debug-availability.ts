/**
 * `SelectionDebug` is e2e instrumentation, not a customer surface: it publishes selection ids, §8's derived opening
 * dimensions, save status, design id, body-probe state and the last rejection code into DOM attributes. None is a
 * write credential, but a stable DOM oracle for internal state does not belong on the production attack surface
 * (finding WEB-004), so it is opted in rather than out, like `app/internal/scene-shot/route-availability.ts`.
 * The flag is `NEXT_PUBLIC_`-prefixed, the only prefix Next exposes to client code, and has no development
 * exemption (`NODE_ENV === "development"` must not imply E2E observability); Playwright sets it
 * (`playwright.config.ts`). The gate keeps the `[data-testid="selection-debug"]` node off the page, which is all of
 * WEB-004. It is not dead-code elimination: with the variable absent at build time Next emits a runtime read
 * against its `process` shim rather than folding the comparison (finding S7-F3), so the readout stays in the client
 * chunk as unreachable code.
 */
export const SELECTION_DEBUG_FLAG =
  "NEXT_PUBLIC_LEMNARIA_ENABLE_SELECTION_DEBUG";

/** Only this exact value opts in, so a stray `false`/`0`/`off` cannot read as "enabled". */
export const SELECTION_DEBUG_FLAG_ENABLED = "1";

/**
 * Takes the flag's value rather than an environment object, unlike `isSceneShotRouteEnabled`: Next replaces only
 * the literal member expression `process.env.NEXT_PUBLIC_…`, so handing over `process.env` whole would defeat the
 * substitution and reach for `process` in a browser that has none.
 */
export function isSelectionDebugEnabled(
  flagValue: string | undefined,
): boolean {
  return flagValue === SELECTION_DEBUG_FLAG_ENABLED;
}
