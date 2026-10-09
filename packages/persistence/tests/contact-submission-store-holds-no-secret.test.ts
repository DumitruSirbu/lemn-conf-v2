import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SOURCE_DIRECTORY = join(import.meta.dirname, "..", "src");

/** The modules of the contact submission store. The filter finds a file by the names it matches (anything ending in
 *  `contact-submission-store.ts`, and the three others), and the test below lists exactly the modules expected: a listed
 *  module that is renamed or missing fails it, and so does a new module the filter matches until it is listed. A module
 *  named otherwise is not scanned until the filter names it. */
const MODULES = readdirSync(SOURCE_DIRECTORY).filter(
  (fileName) =>
    fileName.endsWith("contact-submission-store.ts") ||
    fileName === "contact-submission-refusal.ts" ||
    fileName === "snapshot-judgement.ts" ||
    fileName === "generate-submission-reference.ts",
);

const SECRET_OR_ENVIRONMENT_READ =
  /process\.env|import\.meta\.env|DIGEST_SECRET|createHmac|createHash/;

describe("the contact submission store's modules", () => {
  it("are exactly the modules listed, so a renamed or missing one fails here and the scan below reads each", () => {
    expect([...MODULES].sort()).toEqual([
      "contact-submission-refusal.ts",
      "contact-submission-store.ts",
      "fake-contact-submission-store.ts",
      "generate-submission-reference.ts",
      "neon-contact-submission-store.ts",
      "snapshot-judgement.ts",
    ]);
  });

  it.each(MODULES)(
    "%s reads no variable, holds no secret and makes no digest",
    (fileName) => {
      const text = readFileSync(join(SOURCE_DIRECTORY, fileName), "utf8");

      expect(text).not.toMatch(SECRET_OR_ENVIRONMENT_READ);
    },
  );
});
