// **One declaration of React's act environment, for every test in this project.**
//
// `.dom.test.ts` files (M6-AUD-009) render real components with `react-dom/client` and drive them
// through `act`, which warns unless this flag is set. Two files declared it themselves; a third
// would have made it a habit, so it moves here before it becomes one.
//
// Unconditional, and harmless for the ~1,900 tests that run in the `node` environment: nothing
// reads it but React's own `act`, and a test that never calls `act` never asks.
declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ADR 0114 Amendment H4: `VISITOR_ROTATION_SECRET` is read lazily at mint, never at module load
// (`next build` runs with no environment at all), so nothing needs it until a test actually mints —
// but every one of those tests needs *some* well-formed value, or the very first mint answers 500.
// One fixed, test-only value here covers every test that does not care about the secret itself; the
// missing and malformed cases (M7 wave 7E3b S5) override this per test with `vi.stubEnv` and restore
// it afterwards, never editing `process.env` directly where a later test could inherit the change.
process.env.VISITOR_ROTATION_SECRET ??=
  "cU3Ntsg8ejMpK0XZ9oSuEDhk1mxMzFU30Gkz7VpUJr8";

export {};
