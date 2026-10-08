import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SOURCE_DIRECTORY = join(import.meta.dirname, "..", "src");

/** Every module of the contact submission store, found by name so the Neon store is covered the day it lands. */
const MODULES = readdirSync(SOURCE_DIRECTORY).filter(
  (fileName) =>
    fileName.endsWith("contact-submission-store.ts") ||
    fileName === "generate-submission-reference.ts",
);

const SECRET_OR_ENVIRONMENT_READ =
  /process\.env|import\.meta\.env|DIGEST_SECRET|createHmac|createHash/;

describe("the contact submission store's modules", () => {
  it("are found, so the scan below reads something", () => {
    expect(MODULES).toEqual(
      expect.arrayContaining([
        "contact-submission-store.ts",
        "fake-contact-submission-store.ts",
        "generate-submission-reference.ts",
      ]),
    );
  });

  it.each(MODULES)(
    "%s reads no variable, holds no secret and makes no digest",
    (fileName) => {
      const text = readFileSync(join(SOURCE_DIRECTORY, fileName), "utf8");

      expect(text).not.toMatch(SECRET_OR_ENVIRONMENT_READ);
    },
  );
});
