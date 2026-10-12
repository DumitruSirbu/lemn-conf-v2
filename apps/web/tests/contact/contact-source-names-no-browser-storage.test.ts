// Reads source: the absence claim is criterion 6's, that nothing typed is persisted, and the properties of the hook
// are what guard the behaviour. This only keeps the four names out of the folder that holds the form's code.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const CONTACT_SOURCE_DIRECTORY = join(import.meta.dirname, "../../src/contact");

const BROWSER_STORAGE_NAMES = [
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "document.cookie",
] as const;

function contactSourceFiles(): string[] {
  return readdirSync(CONTACT_SOURCE_DIRECTORY).filter((name) =>
    /\.tsx?$/.test(name),
  );
}

describe("the contact form's source", () => {
  it("has files to read, so the scan below is not an empty loop", () => {
    expect(contactSourceFiles()).toEqual(
      expect.arrayContaining([
        "send-contact-request.ts",
        "use-contact-submission.ts",
      ]),
    );
  });

  it.each(BROWSER_STORAGE_NAMES)("names %s in no file", (name) => {
    const namingIt = contactSourceFiles().filter((file) =>
      readFileSync(join(CONTACT_SOURCE_DIRECTORY, file), "utf8").includes(name),
    );

    expect(namingIt).toEqual([]);
  });
});
