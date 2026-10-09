import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const SOURCE_DIRECTORY = join(import.meta.dirname, "..", "src");

/** Every module of the contact submission store, found by name, so one added later is scanned without anyone listing it. */
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
  it("are found, so the scan below reads something", () => {
    expect(MODULES).toEqual(
      expect.arrayContaining([
        "contact-submission-refusal.ts",
        "contact-submission-store.ts",
        "fake-contact-submission-store.ts",
        "generate-submission-reference.ts",
        "neon-contact-submission-store.ts",
        "snapshot-judgement.ts",
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
