import { randomBytes } from "node:crypto";

import { beforeEach, vi } from "vitest";

import { PUBLIC_ORIGIN_VARIABLE } from "@/lib/server/public-origin-variable";

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

// The mint limiter runs for real in every test file: the decision is never faked, only what it counts in.
//
// The key every digest is made under is random, made here in this process, in no file and printed nowhere. A test
// that is about the secret sets or unsets `DIGEST_SECRET` for itself.
process.env.DIGEST_SECRET = randomBytes(32).toString("hex");

// The site's public origin is never inherited: a value from the shell would send a unit test through the production
// repository getter. Cleared here, once per file and before it runs; a test about the origin stubs it for itself.
Reflect.deleteProperty(process.env, PUBLIC_ORIGIN_VARIABLE);

// The rate-limit store's instance is the persistence package's own fake, fresh for each test, so no test counts in a
// database and no test sees another's count.
const rateLimitStore = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock("@/lib/server/rate-limit/rate-limit-store-instance", async () => {
  const { FakeRateLimitStore } = await import("@lemnaria/persistence");
  return {
    getRateLimitStore: () => {
      rateLimitStore.current ??= new FakeRateLimitStore();
      return rateLimitStore.current;
    },
  };
});

// The CSP report store's instance is a fresh fake per test, so none writes to a database; a test of the instance
// itself unmocks it.
const cspReportStore = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock("@/lib/server/csp/csp-report-store-instance", async () => {
  const { FakeCspReportStore } = await import("@lemnaria/persistence");
  return {
    getCspReportStore: () => {
      cspReportStore.current ??= new FakeCspReportStore();
      return cspReportStore.current;
    },
  };
});

beforeEach(() => {
  rateLimitStore.current = undefined;
  cspReportStore.current = undefined;
});
