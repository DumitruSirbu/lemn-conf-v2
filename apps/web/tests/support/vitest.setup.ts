import { vi } from "vitest";

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

// M7 wave 7E3b S6 (ADR 0114 Amendment H6, D2): recent Node ships a real `navigator.locks`, which
// no test before this wave was written expecting. Left alone, `withCreateDesignLock`
// (`create-design-lock.ts`) would wrap every unit test's own `mint()` in a genuine, if
// uncontended, Web Lock acquisition — an extra task hop that breaks tests asserting a request was
// dispatched synchronously after a store action, for a concern those tests never meant to cover.
//
// Only the one property is shadowed, never the whole `navigator` (a `vi.stubGlobal("navigator",
// {})` once did exactly that here, and took `userAgent` down with it — `react-dom`'s own
// environment detection reads it, so every `.dom.test.ts` file broke). `"locks" in navigator` is
// false under happy-dom, which does not implement the Web Locks API at all, so this is a no-op
// there; it only has work to do in the plain `node` environment, where the property is an
// inherited getter on `Navigator.prototype`, not an own property `delete` could remove — an own
// `undefined` here shadows it instead. `create-design-lock.test.ts` and
// `fetch-configuration-repository.test.ts`'s own wiring test replace `navigator` outright, per
// test, to exercise the lock itself.
if (typeof navigator !== "undefined" && "locks" in navigator) {
  Object.defineProperty(navigator, "locks", {
    value: undefined,
    configurable: true,
  });
}

export {};

// The mint limiter, answered for every test file as "allow", so a test of the mint, a save or a share asks about the
// route's own work and not about a day's count. `judge-mint-request.ts` is the one seam the route reaches the limiter
// through; the files that are about the limiter put the real one back with `vi.unmock`.
vi.mock("@/lib/server/rate-limit/judge-mint-request", () => ({
  judgeMintRequest: () =>
    Promise.resolve({
      decision: { kind: "allow" },
      policy: {
        status: "chosen",
        policy: {
          name: "design-mint-per-chisinau-day",
          figure: 20,
          window: "chisinau-day",
        },
      },
    }),
}));
