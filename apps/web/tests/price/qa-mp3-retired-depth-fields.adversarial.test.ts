// Adversarial QA for the MP-3 fix round: the depth line has one wording and one placement rule, and the first-round
// names are gone. A surface that kept reading a retired field would list a depth line worded or placed on its own, or
// none at all, while the total beside it counts the uplift; the parity sweep catches the behaviour, this catches the
// leftover.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { filesUnder } from "../support/files-under";
import { codeWithoutComments } from "../support/source-import-closure";

const SOURCE_ROOT = join(import.meta.dirname, "..", "..", "src");
const MODELS_THAT_OWN_THE_FIELD = [
  join("price", "price-breakdown-model.ts"),
  join("review", "review-model.ts"),
];

const RETIRED_NAMES =
  /\b(depthRow|BreakdownDepthRow|ReviewWholeKitchenRow|useDeepCabinetPercent|PriceBreakdownDepthRuleMissingError|DepthRowWithoutMaterialRowError|requirePublished|MATERIAL_ROW_KEY)\b/u;

const READS_THE_UNPLACED_ROWS =
  /\b(view|breakdown|review|available)\.wholeKitchenRows\b/u;

function codeOf(file: string): string {
  return codeWithoutComments(file, readFileSync(file, "utf8"));
}

describe("no source still names what the fix round retired", () => {
  it("names none of the first-round fields, errors or hooks, anywhere under apps/web/src", () => {
    const readers = filesUnder(SOURCE_ROOT).filter((file) =>
      RETIRED_NAMES.test(codeOf(file)),
    );

    expect(readers).toEqual([]);
  });

  it("lets no module but the two models read the unplaced whole-kitchen rows off a view: they list through listWholeKitchenRows or wholeKitchenListing", () => {
    const readers = filesUnder(SOURCE_ROOT)
      .filter(
        (file) =>
          !MODELS_THAT_OWN_THE_FIELD.some((owner) => file.endsWith(owner)),
      )
      .filter((file) => READS_THE_UNPLACED_ROWS.test(codeOf(file)));

    expect(readers).toEqual([]);
  });

  it("sees what it forbids: the patterns match the retired reads and not the placed ones", () => {
    expect(RETIRED_NAMES.test("const x = review.depthRow;")).toBe(true);
    expect(RETIRED_NAMES.test("review.depthLine")).toBe(false);
    expect(READS_THE_UNPLACED_ROWS.test("view.wholeKitchenRows.map(f)")).toBe(
      true,
    );
    expect(
      READS_THE_UNPLACED_ROWS.test("view.wholeKitchenListing.map(f)"),
    ).toBe(false);
    expect(READS_THE_UNPLACED_ROWS.test("listWholeKitchenRows(review)")).toBe(
      false,
    );
  });
});
