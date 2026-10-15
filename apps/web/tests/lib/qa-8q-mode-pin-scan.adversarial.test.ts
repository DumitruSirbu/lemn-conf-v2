import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 8Q criterion 7 (8Q.5), QA's scan: a rollback is the one constant set back and the ONE test that names the live mode
 * edited, with nothing else red. That holds only while (a) exactly one test pins the constant's value, and (b) no test
 * spells the live policy header's name, or reads it from a constant that names a mode, but through
 * `cspResponseHeaderName(CONTENT_SECURITY_POLICY_MODE)`. Both are scanned for here, over every file under `tests/`, so a
 * second pin is a red at the commit that adds it, and not a surprise at a rollback.
 *
 * The scan's own patterns are assembled from parts so this file, which the scan reads like any other, matches none.
 */
const WEB_DIRECTORY = join(import.meta.dirname, "..", "..");
const TESTS_DIRECTORY = join(WEB_DIRECTORY, "tests");
const THIS_FILE = join(
  import.meta.dirname,
  "qa-8q-mode-pin-scan.adversarial.test.ts",
);

const MODE_NAME = ["CONTENT_SECURITY", "POLICY_MODE"].join("_");
const PINS_THE_MODE = new RegExp(`expect\\(\\s*${MODE_NAME}\\s*\\)`, "g");
const ALIASES_THE_MODE = new RegExp(`\\b${MODE_NAME}\\s+as\\s`);
const SPELLS_A_POLICY_HEADER = new RegExp(
  `["'\`]content-security-policy(?:-report-only)?["'\`]`,
  "i",
);
const NAMES_A_MODE_HEADER_CONSTANT = new RegExp(
  `\\bCSP_(?:ENFORCED|REPORT_ONLY)_HEADER\\b`,
);

/** The two files whose business is the header names themselves: the module's own test and the proxy's, which reads the
 *  enforcing name from the REQUEST it hands Next whatever the mode (so Next nonces its own scripts). */
const MAY_NAME_A_MODE_HEADER = [
  join("tests", "lib", "security-headers.test.ts"),
  join("tests", "proxy.test.ts"),
];

describe("the scan's own matchers", () => {
  it("flags a pin on the constant and passes a derivation from it", () => {
    expect(
      `expect(${MODE_NAME}).toBe("enforce")`.match(PINS_THE_MODE),
    ).toHaveLength(1);
    expect(
      `const live = ${MODE_NAME} === "enforce"`.match(PINS_THE_MODE),
    ).toBeNull();
    expect(
      `expect( ${MODE_NAME} ).toBe("x")`.match(PINS_THE_MODE),
    ).toHaveLength(1);
  });

  it("flags the constant imported under another name, which would hide a pin from the matcher above", () => {
    expect(
      ALIASES_THE_MODE.test(`import { ${MODE_NAME} as mode } from "x"`),
    ).toBe(true);
    expect(
      ALIASES_THE_MODE.test(`import { ${MODE_NAME}, other } from "x"`),
    ).toBe(false);
  });

  it("flags a spelled header name, in either case and quote, and passes a prose mention", () => {
    expect(
      SPELLS_A_POLICY_HEADER.test(
        `headers["content-security-policy-report-only"]`,
      ),
    ).toBe(true);
    expect(SPELLS_A_POLICY_HEADER.test(`"Content-Security-Policy"`)).toBe(true);
    expect(
      SPELLS_A_POLICY_HEADER.test("a content-security-policy in prose"),
    ).toBe(false);
  });
});

describe("what a rollback would have to touch", () => {
  const files = filesUnder(TESTS_DIRECTORY).filter(
    (file) => file !== THIS_FILE,
  );

  it("reads every file under tests/, so the scans below are not vacuous", () => {
    expect(files.length).toBeGreaterThan(200);
    expect(files).toContain(
      join(TESTS_DIRECTORY, "lib", "security-headers.test.ts"),
    );
    expect(files).toContain(
      join(TESTS_DIRECTORY, "e2e", "support", "csp-violations.ts"),
    );
  });

  it("holds exactly one pin on the mode's value: the module's own test", () => {
    const pins = files.flatMap((file) =>
      Array.from({ length: countOf(file, PINS_THE_MODE) }, () =>
        relative(WEB_DIRECTORY, file),
      ),
    );

    expect(pins).toEqual([join("tests", "lib", "security-headers.test.ts")]);
  });

  it("imports the mode constant under its own name in every test, so the pin count above cannot be evaded", () => {
    const offenders = files
      .filter((file) => ALIASES_THE_MODE.test(readFileSync(file, "utf8")))
      .map((file) => relative(WEB_DIRECTORY, file));

    expect(offenders).toEqual([]);
  });

  it("spells the policy header's name in no test", () => {
    const offenders = files
      .filter((file) => SPELLS_A_POLICY_HEADER.test(readFileSync(file, "utf8")))
      .map((file) => relative(WEB_DIRECTORY, file));

    expect(offenders).toEqual([]);
  });

  it("names a mode's header constant in no test but the module's own and the proxy's", () => {
    const offenders = files
      .filter((file) =>
        NAMES_A_MODE_HEADER_CONSTANT.test(readFileSync(file, "utf8")),
      )
      .map((file) => relative(WEB_DIRECTORY, file))
      .filter((file) => !MAY_NAME_A_MODE_HEADER.includes(file));

    expect(offenders).toEqual([]);
  });
});

function countOf(file: string, pattern: RegExp): number {
  return readFileSync(file, "utf8").match(pattern)?.length ?? 0;
}

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}
