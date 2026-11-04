// The materials screens' deferred wire tests (`material-wire.test.ts`) are promises that go red when the route they wait
// for lands. Three things could keep one from ever going red, and each is held here: a header that names no wave leaves the
// flip to nobody, the availability route is looked up through a variable the bundler cannot see, and a deletion the
// reader refuses today must be refused as the screens say it is.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const WIRE_TEST = join(import.meta.dirname, "material-wire.test.ts");
const HEADER_LINES = 4;
const WAITED_FOR = "R4a";

function linesOf(path: string): readonly string[] {
  return readFileSync(path, "utf8").split("\n");
}

describe("each it.fails of the materials wire test", () => {
  const lines = linesOf(WIRE_TEST);
  const deferredAt = lines.flatMap((line, index) =>
    /^\s*it\.fails\(/.test(line) ? [index] : [],
  );

  it("is there to be held, so that a file with none would show", () => {
    expect(deferredAt.length).toBeGreaterThanOrEqual(2);
  });

  it("is headed, just above it, with the wave whose route it waits for", () => {
    for (const index of deferredAt) {
      const header = lines.slice(Math.max(0, index - HEADER_LINES), index);
      const comment = header.filter((line) => /^\s*\/\//.test(line));

      expect(
        comment.some((line) => line.includes(WAITED_FOR)),
        `line ${String(index + 1)}`,
      ).toBe(true);
    }
  });

  it("asserts the success the route will answer, so the promise goes red when it is kept", () => {
    const body = lines.slice(deferredAt[0] ?? 0).join("\n");

    expect(body).toMatch(/expect\(outcome\.kind\)\.toBe\("changed"\)/);
    expect(body).toMatch(/expect\(answer\.status\)\.not\.toBe\(404\)/);
  });
});

describe("the availability route's lookup in the materials wire test", () => {
  const ROUTE_THROUGH_A_VARIABLE = "@/app/api/staff/prices/draft/route";

  it("reaches a module of the tree by its alias through a variable, as the wire test does, so a route dropped in is found", async () => {
    const route = (await import(
      /* @vite-ignore */ ROUTE_THROUGH_A_VARIABLE
    )) as { readonly PUT?: unknown; readonly DELETE?: unknown };

    expect(typeof route.PUT).toBe("function");
    expect(typeof route.DELETE).toBe("function");
  });
});
