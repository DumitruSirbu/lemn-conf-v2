import { describe, expect, it } from "vitest";

import { sourceFilesMatching } from "../server-source-support";

const NAMES_A_PERSISTENCE_FAKE =
  /FakeRateLimitStore|FakeContactSubmissionStore|fake-rate-limit-store|fake-contact-submission-store/;

describe("which files under apps/web/src name a persistence fake", () => {
  it.each([
    "import { FakeRateLimitStore } from '@lemnaria/persistence';",
    "new FakeContactSubmissionStore()",
    'import x from "../../persistence/src/fake-rate-limit-store.js";',
    "// fake-contact-submission-store",
  ])("reads source: the pattern recognises %s", (text) => {
    expect(NAMES_A_PERSISTENCE_FAKE.test(text)).toBe(true);
  });

  it.each([
    "import { NeonRateLimitStore } from '@lemnaria/persistence';",
    "import { FakeMailSender } from './fake-mail-sender';",
  ])("reads source: the pattern leaves out %s", (text) => {
    expect(NAMES_A_PERSISTENCE_FAKE.test(text)).toBe(false);
  });

  it("reads source: finds no file that names either fake", () => {
    expect(sourceFilesMatching(NAMES_A_PERSISTENCE_FAKE)).toEqual([]);
  });

  it("reads source: reads the files that import the persistence package, so a clean answer is no empty scan", () => {
    const importers = sourceFilesMatching(/@lemnaria\/persistence/);

    expect(importers.length).toBeGreaterThanOrEqual(10);
    expect(importers).toContain("lib/server/repository.ts");
    expect(importers).toContain("lib/server/rate-limit/enforce-rate-limit.ts");
  });
});
