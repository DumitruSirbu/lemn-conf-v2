import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 8Q criterion 9: no browser context in the suite switches the content security policy off. A context that did would
 * make every violation net in `tests/e2e` read an empty page. The option's name is assembled so that this file, which
 * the scan reads like any other, does not contain it.
 */

const OPTION_NAME = ["bypass", "CSP"].join("");
const NAMES_THE_OPTION = new RegExp(`\\b${OPTION_NAME}\\b`);
const WEB_DIRECTORY = join(import.meta.dirname, "..", "..", "..");
const E2E_DIRECTORY = join(WEB_DIRECTORY, "tests", "e2e");
const PLAYWRIGHT_CONFIG = join(WEB_DIRECTORY, "playwright.config.ts");

describe("the scan's own matcher", () => {
  it.each([
    `use: { ${OPTION_NAME}: true }`,
    `browser.newContext({ ${OPTION_NAME} })`,
    `test.use({ ${OPTION_NAME}: false })`,
    `contextOptions: {${OPTION_NAME}:true}`,
  ])("flags %s", (source) => {
    expect(NAMES_THE_OPTION.test(source)).toBe(true);
  });

  it("passes a configuration that does not name the option", () => {
    expect(
      NAMES_THE_OPTION.test("use: { baseURL, hasTouch: true, bypassed: 1 }"),
    ).toBe(false);
  });
});

describe("what the suite configures", () => {
  it("reads the configuration and every file under tests/e2e, so that the scan below is not vacuous", () => {
    const files = filesUnder(E2E_DIRECTORY);

    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain(
      join(E2E_DIRECTORY, "support", "csp-violations.ts"),
    );
    expect(readFileSync(PLAYWRIGHT_CONFIG, "utf8")).toContain("defineConfig");
  });

  it("names the option in no file of playwright.config.ts or tests/e2e", () => {
    const offenders = [PLAYWRIGHT_CONFIG, ...filesUnder(E2E_DIRECTORY)]
      .filter((file) => NAMES_THE_OPTION.test(readFileSync(file, "utf8")))
      .map((file) => relative(WEB_DIRECTORY, file));

    expect(offenders).toEqual([]);
  });
});

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}
