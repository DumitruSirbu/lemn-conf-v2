// **Adversarial QA — wave 7F1, criterion 16 and the gate on its gate.**
//
// `room-example-dimensions.test.ts` probes **one** of the three banned figures. Criterion 16 bans
// `3600`, `2400` **and** `2600`, so a future editor who dropped `2400` from
// `ROOM_EXAMPLE_DIMENSIONS` would leave every test in the repository green while the ban covered a
// third less than it claims. The same argument the wave made for the two inherited selector lists
// applies to the entries of the new list, and this file is that argument carried to the end.
//
// It also tries to **smuggle** each figure past the gate in the spellings a literal can take —
// a numeric separator, a hexadecimal, a trailing zero — and confirms the two inherited gates fire at
// a `.ts` path as well as at the `.tsx` one the existing probe uses, because the room block selects
// on both extensions and a `files` pattern narrowed to `.tsx` would go dark over every module in the
// directory that holds no JSX.
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

/** Two paths, not two files: `lintText` reads the source it is handed and nothing is written to the
 *  tree. Both are under `apps/web/src/room/`, which is the only thing the room block selects on. */
const TSX_PROBE_FROM_ROOT = "apps/web/src/room/qa-7f1-gate-probe.tsx";
const TS_PROBE_FROM_ROOT = "apps/web/src/room/qa-7f1-gate-probe.ts";

/** Frame 1B's example room, as the three figures criterion 16 names. Read as a table so a figure
 *  removed from the shipped list fails here by name rather than by a count nobody reads. */
const BANNED_DIMENSIONS = [3600, 2400, 2600] as const;

/** The spellings one figure can reach the AST under. `Literal[value=N]` reads the *value*, so all
 *  four are the same literal — and a gate that matched the source characters would miss three. */
function everySpellingOf(
  value: number,
): readonly (readonly [string, string])[] {
  return [
    ["decimal", String(value)],
    ["a numeric separator", `${String(value / 100)}_00`],
    ["hexadecimal", `0x${value.toString(16)}`],
    ["a trailing zero", `${String(value)}.0`],
  ];
}

let lintRoomSource: (code: string, path?: string) => Promise<readonly string[]>;

beforeAll(() => {
  // `allowDefaultProject` buys the probes a parser and nothing more: the TypeScript project service
  // reads tsconfig membership off disk, so a path that is deliberately not a file is refused with a
  // parsing error before any rule runs. Every `files` pattern, selector and message asserted below
  // is the shipped `eslint.config.mjs`'s.
  const eslint = new ESLint({
    cwd: REPOSITORY_ROOT,
    overrideConfig: {
      languageOptions: {
        parserOptions: {
          projectService: {
            allowDefaultProject: [TSX_PROBE_FROM_ROOT, TS_PROBE_FROM_ROOT],
          },
        },
      },
    },
  });

  lintRoomSource = async (code, path = TSX_PROBE_FROM_ROOT) => {
    const results = await eslint.lintText(code, {
      filePath: `${REPOSITORY_ROOT}${path}`,
    });
    return results
      .flatMap((result) => result.messages)
      .filter((message) => message.ruleId === "no-restricted-syntax")
      .map((message) => message.message);
  };
}, 120_000);

describe("every figure criterion 16 names is banned, not only the probed one", () => {
  it.each(BANNED_DIMENSIONS)(
    "refuses %i written as a number under the room directory",
    async (value) => {
      const messages = await lintRoomSource(
        `export const measured = ${String(value)};\n`,
      );

      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain(String(value));
      expect(messages[0]).toContain("M7 criterion 16");
    },
    120_000,
  );

  it.each(BANNED_DIMENSIONS)(
    "refuses %i however the literal is spelled",
    async (value) => {
      for (const [spelling, source] of everySpellingOf(value)) {
        const messages = await lintRoomSource(
          `export const measured = ${source};\n`,
        );

        expect(messages, `${spelling}: ${source}`).toHaveLength(1);
      }
    },
    120_000,
  );

  it("leaves a figure the frame does not draw alone", async () => {
    // The ban is three figures, not every four-digit number: a gate that refused any literal would
    // be a gate nobody could keep, and the first `eslint-disable` would hollow it out.
    expect(await lintRoomSource("export const measured = 3601;\n")).toEqual([]);
  });
});

describe("the two inherited gates fire at a .ts path as well as a .tsx one", () => {
  // The room block's pattern is `**/*.{ts,tsx}`. Narrowed to `.tsx` it would still satisfy the
  // existing probe — which uses a `.tsx` path — while going dark over `metres-text.ts`,
  // `room-draft.ts`, `plan-preview-model.ts` and `room-url-state.ts`, four of the directory's
  // eleven modules.
  it("still refuses a Romanian string literal in a .ts module", async () => {
    const messages = await lintRoomSource(
      // The probe *is* the literal: reaching it through the catalogue would prove the opposite of
      // the claim being made.
      // eslint-disable-next-line no-restricted-syntax -- 6B-j: the wording is the subject, see above.
      'export const heading = "Cameră";\n',
      TS_PROBE_FROM_ROOT,
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("A Romanian string literal");
  });

  it("still refuses a banned dimension in a .ts module", async () => {
    const messages = await lintRoomSource(
      "export const measured = 2400;\n",
      TS_PROBE_FROM_ROOT,
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("M7 criterion 16");
  });
});
