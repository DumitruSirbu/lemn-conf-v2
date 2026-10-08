// Wave 8H, criterion 14: on the server only `snapshotSubmission` puts the submission facts together. Nothing
// under `apps/web/src` calls `judgeSubmissionEligibility` but the review model, and nothing builds its facts
// by hand. A scan of every source file there, held to sources that break each rule, so that a route added
// later (8K) trips it by being written.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = resolve(import.meta.dirname, "../../src");
const REVIEW_MODEL = "review/review-model.ts";
const DOMAIN = "@lemnaria/configurator-domain";

interface SourceFile {
  readonly file: string;
  readonly code: string;
}

interface Finding {
  readonly file: string;
  readonly what: string;
}

/** Comments removed, so a sentence that names the rule is not read as code that calls it. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

function sourcesUnder(root: string): readonly SourceFile[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() && /\.(ts|tsx|mts|js|jsx|mjs)$/.test(entry.name),
    )
    .map((entry) => join(entry.parentPath, entry.name))
    .map((file) => ({
      file: relative(root, file).split("\\").join("/"),
      code: withoutComments(readFileSync(file, "utf8")),
    }));
}

/** Every way a file outside the review model could reach the rule or make its facts. */
const OUTSIDE_THE_REVIEW_MODEL: readonly (readonly [string, RegExp])[] = [
  ["names the rule", /judgeSubmissionEligibility/],
  ["names the rule's facts", /\bSubmissionFacts\b/],
  ["names the rule's own error", /\bSubmissionFactsContradictionError\b/],
  [
    "builds an object with a fit list of its own",
    /\boverflowingPlacementIds\s*:\s*(?!\s|readonly\b|string\b|ReadonlyArray\b|Array\b)/,
  ],
];

/** Ways to reach an export without naming it, which would hide a call from the patterns above. */
const ANYWHERE: readonly (readonly [string, RegExp])[] = [
  [
    "takes the whole domain as a namespace",
    new RegExp(`import\\s*\\*\\s*as\\s+\\w+\\s+from\\s*["']${DOMAIN}["']`),
  ],
  [
    "loads the domain at run time",
    new RegExp(`(import|require)\\s*\\(\\s*["']${DOMAIN}`),
  ],
  [
    "imports from inside the domain package",
    new RegExp(`["']${DOMAIN}/|configurator-domain/(src|dist)/`),
  ],
];

function findingsIn(sources: readonly SourceFile[]): readonly Finding[] {
  return sources.flatMap(({ file, code }) => [
    ...(file === REVIEW_MODEL ? [] : OUTSIDE_THE_REVIEW_MODEL)
      .filter(([, pattern]) => pattern.test(code))
      .map(([what]) => ({ file, what })),
    ...ANYWHERE.filter(([, pattern]) => pattern.test(code)).map(([what]) => ({
      file,
      what,
    })),
  ]);
}

function scanned(file: string, code: string): readonly SourceFile[] {
  return [{ file, code: withoutComments(code) }];
}

const A_ROUTE = "app/api/contact-submissions/route.ts";

describe("8H criterion 14: the scanner refuses what it claims to", () => {
  it.each([
    [
      "a route that calls the rule",
      `import { judgeSubmissionEligibility } from "${DOMAIN}";\nconst verdict = judgeSubmissionEligibility(facts);`,
    ],
    [
      "a route that calls the rule under another name",
      `import { judgeSubmissionEligibility as judge } from "${DOMAIN}";\njudge(facts);`,
    ],
    [
      "a route that makes the facts with an empty fit list",
      `const facts = { design, overflowingPlacementIds: [], pricing };`,
    ],
    [
      "a route that makes the facts with a list on the next line",
      `const facts = {\n  design,\n  overflowingPlacementIds:\n    idsFromTheBody,\n  pricing,\n};`,
    ],
    [
      "a route that types the facts it makes",
      `import type { SubmissionFacts } from "${DOMAIN}";\nconst facts: SubmissionFacts = made;`,
    ],
    [
      "a route that catches the rule's error, so it called the rule",
      `if (error instanceof SubmissionFactsContradictionError) return refuse();`,
    ],
    [
      "a route that takes the domain as a namespace",
      `import * as domain from "${DOMAIN}";\ndomain[name](facts);`,
    ],
    [
      "a route that loads the domain when asked",
      `const domain = await import("${DOMAIN}");`,
    ],
    [
      "a route that reaches into the domain's files",
      `import { judgeSubmissionEligibility as j } from "${DOMAIN}/dist/contact/submission-eligibility.js";`,
    ],
    [
      "a route that reaches the built file by a path",
      `import { x } from "../../../../../packages/configurator-domain/dist/contact/index.js";`,
    ],
  ])("finds %s", (_name, code) => {
    expect(findingsIn(scanned(A_ROUTE, code))).not.toEqual([]);
  });

  it.each([
    [
      "a route that calls the snapshot",
      `import { snapshotSubmission, validateContactSubmission } from "${DOMAIN}";\nconst result = snapshotSubmission({ design, catalog, book, pricingVersion });`,
    ],
    [
      "a route that reads the refusal's bodies",
      `if (!result.ok && result.refusal.code === "BODIES_PAST_WALL") log(result.refusal.placementIds);`,
    ],
    [
      "a surface that reads the price's own list",
      `const ids = priced.overflowingPlacementIds;\nconst { overflowingPlacementIds } = priced;`,
    ],
    [
      "a component that declares the list as a prop",
      `interface Props {\n  readonly overflowingPlacementIds: readonly string[];\n}`,
    ],
    [
      "a comment that names the rule",
      `// never judgeSubmissionEligibility here\nconst a = 1; /* nor SubmissionFacts */`,
    ],
  ])("passes %s", (_name, code) => {
    expect(findingsIn(scanned(A_ROUTE, code))).toEqual([]);
  });

  it("lets the review model, and only it, name the rule", () => {
    const code = `import { judgeSubmissionEligibility } from "${DOMAIN}";`;

    expect(findingsIn(scanned(REVIEW_MODEL, code))).toEqual([]);
    expect(findingsIn(scanned("review/review-screen.tsx", code))).not.toEqual(
      [],
    );
  });
});

describe("8H criterion 14: the web's own source", () => {
  const sources = sourcesUnder(SRC);
  const model = sources.find(({ file }) => file === REVIEW_MODEL);

  it("is read whole, the review model included", () => {
    expect(sources.length).toBeGreaterThan(100);
    expect(model).toBeDefined();
  });

  it("calls the rule nowhere but the review model, and builds its facts nowhere else", () => {
    expect(findingsIn(sources)).toEqual([]);
  });

  it("calls the rule at one place in the review model", () => {
    const calls = model?.code.match(/judgeSubmissionEligibility\s*\(/g) ?? [];

    expect(calls).toHaveLength(1);
  });

  it("hands the rule no list but the fit query's answer for the design under review", () => {
    const code = model?.code ?? "";
    const listsMade =
      code.match(/findOverflowingPlacementIds\s*\(([^)]*)\)/g) ?? [];
    const handedOn = [
      ...code.matchAll(/judgeFor\(\s*input,\s*([^)]*?)\s*\)/g),
    ].map((match) => match[1]);

    expect(listsMade).toEqual(["findOverflowingPlacementIds(input.design)"]);
    expect(code).toContain(
      "const overflowingIds = findOverflowingPlacementIds(input.design);",
    );
    expect(handedOn).toEqual(["overflowingIds", "overflowingIds"]);
    expect(code).not.toMatch(/overflowingPlacementIds\s*:\s*\[/);
  });
});
