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

export {};
