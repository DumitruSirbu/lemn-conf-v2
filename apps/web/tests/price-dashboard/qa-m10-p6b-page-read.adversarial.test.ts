// The read every item screen shares, and the one segment every item address is built from: a production build is handed no
// invented count (the loader is not even called), an unreadable state is `unavailable` before any item is looked for, a
// missing item is `not-found` after, and no id, whatever it holds, is ever more than one path segment.
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readOnlyIfHeld, readItemPage } from "@/price-dashboard/item-page-read";
import { segmentOf } from "@/price-dashboard/path-segment";

import { stateOf } from "./dashboard-state-fixture";

const world = vi.hoisted(() => ({
  answer: undefined as (() => Promise<unknown>) | undefined,
}));

vi.mock("@/lib/server/price-dashboard/price-dashboard-service", () => ({
  PRICE_READ_EVENT: "staff-prices",
  readDashboardStateForAdmittedPage: () => {
    if (world.answer === undefined) throw new Error("no answer planned");
    return world.answer();
  },
}));
vi.mock("@/lib/server/account/account-log", () => ({
  reportAccountEvent: () => undefined,
}));

const INVENTED_COUNTS = [
  { item: { kind: "hardware", tierId: "hardware.standard" }, designCount: 99 },
] as const;

function sourceThatCounts(canDerive: boolean) {
  return {
    canDerive: vi.fn(() => canDerive),
    loadSampleUsage: vi.fn(() => Promise.resolve([...INVENTED_COUNTS])),
  };
}

beforeEach(() => {
  world.answer = () => Promise.resolve(stateOf());
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the item page's read", () => {
  it("never calls the loader of invented counts in a production build, and the page holds none", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const source = sourceThatCounts(true);

    const read = await readItemPage(source);

    expect(source.loadSampleUsage).not.toHaveBeenCalled();
    expect(read.kind).toBe("ready");
    expect(read.kind === "ready" && read.page.sampleUsage).toBeUndefined();
  });

  it.each(["development", "test"])(
    "hands a %s build the loader's counts, as the page's own",
    async (environment) => {
      vi.stubEnv("NODE_ENV", environment);
      const source = sourceThatCounts(true);

      const read = await readItemPage(source);

      expect(source.loadSampleUsage).toHaveBeenCalledTimes(1);
      expect(read.kind === "ready" && read.page.sampleUsage).toEqual(
        INVENTED_COUNTS,
      );
    },
  );

  it("is unavailable, and loads no count, when the screen's own check cannot work the list out", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const source = sourceThatCounts(false);

    expect(await readItemPage(source)).toEqual({ kind: "unavailable" });
    expect(source.loadSampleUsage).not.toHaveBeenCalled();
  });

  it("is unavailable, and asks the screen nothing, when the state cannot be read", async () => {
    world.answer = () => Promise.resolve(undefined);
    const source = sourceThatCounts(true);

    expect(await readItemPage(source)).toEqual({ kind: "unavailable" });
    expect(source.canDerive).not.toHaveBeenCalled();
  });
});

describe("one item of the page", () => {
  const ready = { kind: "ready" as const, page: { held: ["a"] } };
  const isHeld = (id: string) => (page: { held: string[] }) =>
    page.held.includes(id);

  it("is the page itself when the item is held", () => {
    expect(readOnlyIfHeld(ready, isHeld("a"))).toBe(ready);
  });

  it("is not-found when it is not held, whatever else the page holds", () => {
    expect(readOnlyIfHeld(ready, isHeld("b"))).toEqual({ kind: "not-found" });
  });

  it("is unavailable, and the item is not looked for, when the page is", () => {
    const looksFor = vi.fn(() => true);

    expect(readOnlyIfHeld({ kind: "unavailable" }, looksFor)).toEqual({
      kind: "unavailable",
    });
    expect(looksFor).not.toHaveBeenCalled();
  });
});

describe("an id as a path segment, for any id", () => {
  it("is one segment: no slash, no dot segment, and what is decoded once is the id, but for the ids . and ..", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary-ascii", maxLength: 40 }), (id) => {
        const segment = segmentOf(id);
        expect(segment).not.toContain("/");
        expect([".", "..", "%2E", "%2e", "%2E%2E"]).not.toContain(segment);
        if (id !== "." && id !== "..") {
          expect(decodeURIComponent(segment)).toBe(id);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("keeps . and .. apart from every other id, which decode once to something else", () => {
    expect(segmentOf(".")).not.toBe(segmentOf(".."));
    expect(decodeURIComponent(segmentOf("."))).not.toBe(".");
    expect(decodeURIComponent(segmentOf(".."))).not.toBe("..");
  });
});
