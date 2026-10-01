// **The gate on the gate** — M7 wave 7F1, criterion 16.
//
// `eslint.config.mjs`'s room block names `no-restricted-syntax` over a subset of the files the
// block above it already covers, and flat config *replaces* a rule's options rather than merging
// them. So the room block has to re-declare the Romanian and unkeyed-JSX selectors alongside the
// new banned-dimension ones, and **the assertions that matter here are the second and third**: they
// are what fails if a later editor drops a spread from that block while adding to it, which would
// otherwise go dark silently over the directory holding the most new JSX text in this milestone.
//
// **Wave 7F1-D45 added a fourth gate and, with it, a fourth way for that to happen** — the ban on
// `window.history.pushState`/`replaceState`, which is defect D4's own mechanism (criterion 9).
//
// Every probe is linted through the repository's own config at a path under `apps/web/src/room/`,
// so this reads the shipped rule rather than a copy of it.
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

/** A path, not a file: `lintText` reads the source it is handed, and nothing is written to the
 *  tree. The name is under `apps/web/src/room/` because that is the only thing the room block
 *  selects on, and `.tsx` because one probe is JSX. */
const PROBE_PATH_FROM_ROOT = "apps/web/src/room/lint-gate-probe.tsx";
const PROBE_PATH = `${REPOSITORY_ROOT}${PROBE_PATH_FROM_ROOT}`;

const BANNED_DIMENSION_PROBE = "export const wallA = 3600;\n";

// The probe *is* an unkeyed Romanian literal: reaching it through the catalogue would prove the
// opposite of the claim it is here to make.
// eslint-disable-next-line no-restricted-syntax -- 6B-j: the wording is the subject, see above.
const ROMANIAN_LITERAL_PROBE = 'export const title = "Cameră";\n';

const UNKEYED_JSX_PROBE =
  "export function Probe() {\n  return <p>Room shape</p>;\n}\n";

/** The same figure the ban reads, written where the gate is meant to leave it alone: this is the
 *  shape `parse-metres.ts:37` already ships, and the reason the rule is AST-based. */
const COMMENTED_DIMENSION_PROBE =
  "// 3,6000 m is 3600 mm, so the parser returns whole millimetres.\nexport const parsed = true;\n";

/** The call wave 7F1-D45 deleted from the room screen, written exactly as it stood there. It is the
 *  mechanism behind defect D4: the address bar changes and Next's record of the entry does not. */
const HISTORY_WRITE_PROBE =
  "export function sync(query: string): void {\n" +
  '  window.history.replaceState(null, "", `?${query}`);\n' +
  "}\n";

function restrictedSyntaxMessagesIn(results: readonly ESLint.LintResult[]) {
  return results
    .flatMap((result) => result.messages)
    .filter((message) => message.ruleId === "no-restricted-syntax")
    .map((message) => message.message);
}

describe("the room directory's no-restricted-syntax block", () => {
  let bannedDimension: readonly string[] = [];
  let romanianLiteral: readonly string[] = [];
  let unkeyedJsxText: readonly string[] = [];
  let commentedDimension: readonly string[] = [];
  let historyWrite: readonly string[] = [];

  beforeAll(async () => {
    // `allowDefaultProject` is the one override, and it buys the probes a parser rather than a
    // verdict: the TypeScript project service reads tsconfig membership off disk, so a path that is
    // deliberately not a file is refused with a parsing error before any rule runs. Nothing else is
    // overridden — the `files` patterns, the selectors and the messages asserted below are the
    // shipped `eslint.config.mjs`'s. `no-restricted-syntax` needs no type information, so the three
    // type-aware rules that complain about the inferred project are filtered out by rule id.
    const eslint = new ESLint({
      cwd: REPOSITORY_ROOT,
      overrideConfig: {
        languageOptions: {
          parserOptions: {
            projectService: { allowDefaultProject: [PROBE_PATH_FROM_ROOT] },
          },
        },
      },
    });
    const lintProbe = async (code: string) =>
      restrictedSyntaxMessagesIn(
        await eslint.lintText(code, { filePath: PROBE_PATH }),
      );

    bannedDimension = await lintProbe(BANNED_DIMENSION_PROBE);
    romanianLiteral = await lintProbe(ROMANIAN_LITERAL_PROBE);
    unkeyedJsxText = await lintProbe(UNKEYED_JSX_PROBE);
    commentedDimension = await lintProbe(COMMENTED_DIMENSION_PROBE);
    historyWrite = await lintProbe(HISTORY_WRITE_PROBE);
  }, 120_000);

  it("errors on a drawn example dimension written as a number", () => {
    expect(bannedDimension).toHaveLength(1);
    expect(bannedDimension[0]).toContain("3600");
    expect(bannedDimension[0]).toContain("M7 criterion 16");
  });

  it("still errors on a Romanian string literal", () => {
    expect(romanianLiteral).toHaveLength(1);
    expect(romanianLiteral[0]).toContain("A Romanian string literal");
  });

  it("still errors on text rendered as bare JSX", () => {
    expect(unkeyedJsxText).toHaveLength(1);
    expect(unkeyedJsxText[0]).toContain("Bare text rendered as JSX");
  });

  it("errors on a native history write, which is defect D4's own mechanism", () => {
    expect(historyWrite).toHaveLength(1);
    expect(historyWrite[0]).toContain("M7 criterion 9");
    expect(historyWrite[0]).toContain("router.replace");
  });

  it("leaves the same figure alone inside a comment", () => {
    expect(commentedDimension).toEqual([]);
  });
});
