// M10 Q5d, adversarial: after the unresolved row lost its labelled group, `ReplacementRowView.announcement` and the copy leaf behind
// it (`resolveReplacementSheetCopy(...).unavailableAria`, `replacementSheet.unavailableAria`) have no reader. This pins that
// fact so it is not rediscovered by accident: the field is produced in `replacement-sheet-model.ts` and read by nothing that
// draws a screen.
//
// This is a pin on dead code, not on behaviour. When the field and the leaf are deleted, delete this file and the model tests that
// still read `.announcement`; if a screen starts reading the field again, this goes red on purpose and the "said once" tests in
// `qa-m10-q5d-owed-row-read-once.adversarial.dom.test.ts` are the ones to consult first.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const SOURCE_ROOT = resolve(import.meta.dirname, "../../src");
const MODEL = "price/replacement-sheet-model.ts";

function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFilesUnder(path);
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.json.ts")
      ? [path]
      : [];
  });
}

function filesMatching(pattern: RegExp): string[] {
  return sourceFilesUnder(SOURCE_ROOT)
    .filter((path) => pattern.test(readFileSync(path, "utf8")))
    .map((path) => relative(SOURCE_ROOT, path))
    .sort();
}

describe("the sheet row's `announcement` and the copy leaf behind it", () => {
  it("are mentioned only by the model that produces them: no component and no hook reads `unavailableAria`", () => {
    expect(filesMatching(/unavailableAria/)).toEqual([MODEL]);
  });

  it("is produced once and read nowhere: no source file takes `.announcement` off a replacement row", () => {
    const readers = filesMatching(
      /\brow\.announcement\b|\.announcement\b/,
    ).filter((file) =>
      readFileSync(join(SOURCE_ROOT, file), "utf8").includes(
        "replacement-sheet-model",
      ),
    );

    expect(readers).toEqual([]);
  });

  it("is still declared by the model, so the pin above is about a live field and not a rename", () => {
    const model = readFileSync(join(SOURCE_ROOT, MODEL), "utf8");

    expect(model).toMatch(/readonly announcement: string;/);
    expect(model.match(/copy\.unavailableAria\(/g)).toHaveLength(1);
  });
});
