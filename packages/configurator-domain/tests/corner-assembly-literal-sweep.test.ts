// Wave 7D6 criterion 10: **no corner width survives as a literal** under `src/generation/` or
// `src/room/`. The four figures the shipped corner was built from — 900 on wall A, 320 for the base
// return, 570 for each upper one — are one derivation since slice S2 (`corner-assembly-size.ts`),
// and 880 is what that derivation answers today for the narrowest corner it will build.
//
// **Why a grep, and why it reads code rather than values.** A second copy of a corner width is
// invisible to every behavioural test in this suite for exactly as long as it agrees with the
// derivation, and it is wrong from the first commit that moves one of them — the defect
// [ADR 0102](../../docs/decisions/0102-a-recorded-source-must-explain-its-depth-and-a-second-authority-in-a-test-is-the-defect-laundered.md)
// forbids. A constant "kept in sync" with the derivation is that defect and not a mitigation of it,
// so the sweep rejects a corner-named constant carrying a number as well as a bare literal.
//
// **Scope is criterion 10's own.** The fixture (`src/fixtures/kitchen-l-design.ts`) records the
// reference kitchen's placements and the derivation module holds the single 900 mm reference reach
// it derives the other three widths from; neither is swept, and both are pinned by
// `corner-assembly-size.test.ts`.
//
// The pattern is the repository's source-grep-in-a-test: `shell-design.test.ts`'s *"what
// src/generation/ does not do"* scan, with the same comment stripping, because prose that names a
// number is documentation and the whole point of the sweep is the code.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SOURCE_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
);

/** The two directories criterion 10 names. */
const SWEPT_DIRECTORIES = ["generation", "room"] as const;

/** The corner widths that must not be typed: the three the shipped assembly was built from, and the
 *  figure the derivation answers for the narrowest corner today — what a constant "kept in sync"
 *  with it would carry. */
const FORBIDDEN_CORNER_WIDTHS_MM = [900, 320, 570, 880] as const;

/** **The one file allowed to hold a corner number, and why that is not a hole.**
 *  `approved-room-policy.ts` is owner-approved product data: literals on purpose (ADR 0108
 *  Amendment B1), untouchable outside an owner ruling (ADR 0125), and never a source the derivation
 *  reads. Every corner number in it is pinned three times in `room/approved-room-policy.test.ts` —
 *  the six-bound table, Amendment E's generated minimum, and criterion 4′'s ruled margin against the
 *  derivation itself — so a figure that drifts there fails on a number rather than on this grep.
 *  Its occurrences are still accounted for one by one below; the file is not skipped. */
const OWNER_APPROVED_DATA = "room/approved-room-policy.ts";

/** The occurrences the owner's ruling accounts for, as the sweep reports them. Wall A's approved
 *  minimum and Amendment E's wall-A corner reach are both the owner's 900 (ADR 0108 Amendment B,
 *  reaffirmed by ADR 0125). A third would be a new copy and fails here. */
const ACCOUNTED_FOR_OCCURRENCES = [
  "room/approved-room-policy.ts: const APPROVED_L_WALL_A_MIN_MM = 900;",
  "room/approved-room-policy.ts: const APPROVED_L_CORNER_REACH_WALL_A_MM = 900;",
] as const;

interface SweptSource {
  readonly name: string;
  readonly code: string;
}

/** Comments are stripped, newlines kept, so a reported occurrence carries its own line of code. */
function withoutComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/\/\/.*$/gm, "");
}

function sweptSources(): SweptSource[] {
  return SWEPT_DIRECTORIES.flatMap((directory) =>
    readdirSync(path.join(SOURCE_ROOT, directory))
      .filter((file) => file.endsWith(".ts"))
      .map((file) => ({
        name: `${directory}/${file}`,
        code: withoutComments(
          readFileSync(path.join(SOURCE_ROOT, directory, file), "utf8"),
        ),
      })),
  );
}

/** A whole number, so 3900, 5700 and 1320 are their own figures and not a corner width inside one. */
function cornerWidthPattern(widthMm: number): RegExp {
  return new RegExp(String.raw`\b${String(widthMm)}\b`);
}

/** Every line of code in `sources` that types a corner width, as `file: line`. */
function cornerWidthLiteralsIn(sources: readonly SweptSource[]): string[] {
  return sources.flatMap((source) =>
    source.code
      .split("\n")
      .filter((line) =>
        FORBIDDEN_CORNER_WIDTHS_MM.some((widthMm) =>
          cornerWidthPattern(widthMm).test(line),
        ),
      )
      .map((line) => `${source.name}: ${line.trim()}`),
  );
}

/** A `const` whose name says corner and whose initialiser carries a multi-digit number — the second
 *  authority, whatever value it happens to hold. Reading the derivation is not matched: those
 *  initialisers are calls, and an index like `[0]` is one digit. */
const CORNER_NAMED_CONSTANT =
  /\bconst\s+\w*corner\w*\s*(?::[^=;]*)?=([^;]*);/gi;
const MULTI_DIGIT_NUMBER = /(?<![\w.])\d{2,}(?!\w)/;

function cornerNamedNumericConstantsIn(
  sources: readonly SweptSource[],
): string[] {
  return sources.flatMap((source) =>
    [...source.code.matchAll(CORNER_NAMED_CONSTANT)]
      .filter((match) => MULTI_DIGIT_NUMBER.test(match[1] ?? ""))
      .map((match) => `${source.name}: ${match[0].replace(/\s+/g, " ")}`),
  );
}

function except(name: string): (source: SweptSource) => boolean {
  return (source) => source.name !== name;
}

/** A source written for the failure demonstration, read the same way a swept file is. */
function specimen(name: string, code: string): SweptSource {
  return { name, code: withoutComments(code) };
}

describe("no corner width survives as a literal under src/generation or src/room (7D6 criterion 10)", () => {
  it("sweeps both directories, the shell and both policies among them (premise)", () => {
    const names = sweptSources().map((source) => source.name);

    expect(names).toContain("generation/shell-design.ts");
    expect(names).toContain("generation/generate-kitchen.ts");
    expect(names).toContain("room/room-policy.ts");
    expect(names).toContain(OWNER_APPROVED_DATA);
    expect(names.length).toBeGreaterThan(5);
  });

  it("types none of 900, 320, 570 or 880 outside the owner's approved data", () => {
    expect(
      cornerWidthLiteralsIn(sweptSources().filter(except(OWNER_APPROVED_DATA))),
    ).toStrictEqual([]);
  });

  it("accounts for every occurrence the owner's approved data does hold", () => {
    expect(
      cornerWidthLiteralsIn(
        sweptSources().filter((source) => source.name === OWNER_APPROVED_DATA),
      ),
    ).toStrictEqual([...ACCOUNTED_FOR_OCCURRENCES]);
  });

  it("declares no corner-named constant carrying a number, which is the copy kept in sync", () => {
    expect(
      cornerNamedNumericConstantsIn(
        sweptSources().filter(except(OWNER_APPROVED_DATA)),
      ),
    ).toStrictEqual([]);
  });

  // The sweep is only worth its name if it can fail, and neither directory offers a specimen — so
  // both defects are put to it directly: a bare width, and the constant ADR 0102 calls the laundered
  // form of the same thing.
  it("reports a typed width and a constant kept in sync with the derivation", () => {
    const smuggled: SweptSource[] = [
      specimen("generation/x.ts", "const runStartMm = 900;"),
      specimen(
        "room/y.ts",
        "const CORNER_REACH_MM = 880; // kept in sync\nconst first = pieces[0];",
      ),
    ];

    expect(cornerWidthLiteralsIn(smuggled)).toStrictEqual([
      "generation/x.ts: const runStartMm = 900;",
      "room/y.ts: const CORNER_REACH_MM = 880;",
    ]);
    expect(cornerNamedNumericConstantsIn(smuggled)).toStrictEqual([
      "room/y.ts: const CORNER_REACH_MM = 880;",
    ]);
  });
});
