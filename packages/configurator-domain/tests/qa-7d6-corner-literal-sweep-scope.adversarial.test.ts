// Wave 7D6 adversarial pass — **criterion 10's sweep only sees the files it lists.**
//
// `corner-assembly-literal-sweep.test.ts` reads `src/generation/` and `src/room/` with a single
// non-recursive `readdirSync`, keeping the entries that end in `.ts`. A directory entry does not,
// so **a corner literal in `src/generation/<anything>/x.ts` is invisible to it** — the sweep stays
// green and reports the same file list it always did. Demonstrated 2026-09-17 by writing
// `src/generation/deep/nested.ts` holding `export const CORNER_REACH_MM = 900;`: all five of that
// file's cases passed.
//
// Neither directory has a subdirectory today, so the shipped sweep is **complete as things stand**
// and this file is what says so out loud: it fails on the day one appears, which is the day the
// sweep would otherwise disarm itself silently. A guard that stops covering ground without changing
// colour is the shape `docs/best-practices/engineering-conventions.md` calls a dead gate.
//
// **What this file deliberately does not claim to close.** A literal assembled by arithmetic
// (`450 * 2`), written with a numeric separator (`5_70`), or reached as `879 + 1` is out of any
// grep's reach, and so is a corner number living outside the two directories criterion 10 names.
// Those are reported as accepted misses rather than papered over with a wider regex that would
// match half the catalogue.
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SOURCE_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
);

/** The two directories criterion 10 names, as the shipped sweep names them. */
const SWEPT_DIRECTORIES = ["generation", "room"] as const;

describe("criterion 10's sweep reaches every file it is supposed to cover", () => {
  it.each(SWEPT_DIRECTORIES)(
    "holds src/%s flat, so no directory entry can hide a corner literal from the sweep",
    (directory) => {
      const subdirectories = readdirSync(path.join(SOURCE_ROOT, directory), {
        withFileTypes: true,
      })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);

      expect(subdirectories).toStrictEqual([]);
    },
  );
});
