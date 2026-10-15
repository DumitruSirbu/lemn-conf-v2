// **The two things about the run that only its source can state** — M7 wave 7F4a, criteria 29 and 33,
// ruling R15.
//
// **Why source assertions and not only behavioural ones.** Both invariants here are about what the
// *shipped bundle* and the *browser's frame schedule* do, and a `happy-dom` component test cannot see
// either. Both were verified by breaking them (2026-09-14):
//
//   - A static `@lemnaria/three-adapter` import added in a later wave **compiles, and every other
//     test stays green**, while the customer's first screen quietly gains the adapter and `three`
//     behind it — measured at 399 kB for the chunk carrying `WebGLRenderer` alone. That is risk 4 in
//     the wave's own ranking, ranked where it is precisely because it is silent.
//   - Deleting `await theNextPaint()` from `use-generation.ts` **reddened nothing at all** in the
//     whole suite before this file's second gate existed. The component test proves no
//     `generateKitchen` call happens while the rows are absent from the DOM; it cannot prove a frame
//     was *painted*, because nothing paints under `happy-dom`.
//
// So these are structural gates, and they are labelled as structural rather than dressed up as
// behavioural ones. The behavioural halves live in the 390 x 844 visual gate and in the measurement
// criterion 38 asks for.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOM_SOURCE_DIR = resolve(import.meta.dirname, "../../src/room");

/** The one module allowed to name the adapter at all, and the only shape it may name it in. */
const THE_DYNAMIC_IMPORT = 'await import(\n    "@lemnaria/three-adapter"\n  )';

const BANNED_PACKAGES = ["@lemnaria/three-adapter", "three"];

interface RoomModule {
  readonly name: string;
  readonly source: string;
}

function roomModules(): readonly RoomModule[] {
  return readdirSync(ROOM_SOURCE_DIR)
    .filter((name) => name.endsWith(".ts") || name.endsWith(".tsx"))
    .map((name) => ({
      name,
      source: readFileSync(resolve(ROOM_SOURCE_DIR, name), "utf8"),
    }));
}

/** A module's code with its prose stripped out: this file's subject is what is *imported*, and the
 *  comments under `src/room` name the adapter on purpose — they are the argument for not importing
 *  it. `room-screen.dom.test.ts` carries the same helper for the same reason. */
function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function staticImportsIn(source: string): readonly string[] {
  return [...codeOf(source).matchAll(/^import[^;]*?from\s+"([^"]+)"/gm)].map(
    (match) => match[1] ?? "",
  );
}

describe("the room route's first load (criterion 33)", () => {
  it("has room modules to sweep, so the assertions below are not vacuous", () => {
    expect(roomModules().length).toBeGreaterThan(5);
  });

  it.each(BANNED_PACKAGES)(
    "imports %s statically from no module under src/room",
    (banned) => {
      const offenders = roomModules()
        .filter((module) => staticImportsIn(module.source).includes(banned))
        .map((module) => module.name);

      expect(offenders).toEqual([]);
    },
  );

  it("reaches the adapter from use-generation.ts and from nowhere else", () => {
    const naming = roomModules().filter((module) =>
      codeOf(module.source).includes("@lemnaria/three-adapter"),
    );

    expect(naming.map((module) => module.name)).toEqual(["use-generation.ts"]);
    expect(naming[0]?.source).toContain(THE_DYNAMIC_IMPORT);
  });
});

/**
 * **The pending rows are on the glass before the main thread stops** (criterion 29, risk 2).
 *
 * `generateKitchen` is synchronous and runs on the main thread after building a Three.js kit, so if
 * the run reached it in the same frame as the state change the customer would see a **stopped
 * screen** rather than a list. Awaiting the dynamic import is not enough: the first tap fetches a
 * chunk and yields for real, every tap after it resolves in a microtask.
 *
 * **Both calls are load-bearing.** `requestAnimationFrame` runs *before* the paint; only a task
 * scheduled from inside it runs *after* one. Dropping the inner `setTimeout` is the subtle version of
 * this defect and is the reason this asserts the shape rather than merely the presence of a wait.
 */
describe("the run yields for a paint before it blocks (criterion 29)", () => {
  const runSource = readFileSync(
    resolve(ROOM_SOURCE_DIR, "use-generation.ts"),
    "utf8",
  );

  it("waits for the next paint before calling the generator", () => {
    const code = codeOf(runSource);
    const waited = code.indexOf("await theNextPaint()");
    const blocked = code.indexOf("generateKitchen({");

    expect(waited).toBeGreaterThan(-1);
    expect(blocked).toBeGreaterThan(-1);
    expect(waited).toBeLessThan(blocked);
  });

  // That the wait crosses a frame with both calls is the order things run in, and `room-composition.dom.test.ts`
  // drives it ("crosses a frame before it blocks"): a body that names both calls and resolves at once reads the same.
});
