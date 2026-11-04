// The rows a linked accessory may follow, as a select offers them: the same answer a creation gives, so the form can
// never list a row the route would refuse.
import { describe, expect, it } from "vitest";

import { applyChanges } from "../../src/price-dashboard/apply-changes.js";
import {
  linkTargetBuildIdsOf,
  refuseLinkTarget,
} from "../../src/price-dashboard/link-target.js";
import { SAMPLE_PRICE_BOOK } from "../../src/pricing/sample-price-book.js";
import {
  CUSTOMER_ROW_IDS,
  SUPPLIED_ROW_IDS,
} from "../support/linked-accessory-books.js";

describe("linkTargetBuildIdsOf", () => {
  it("lists every row the manufacturer supplies and none the customer does", () => {
    const targets = linkTargetBuildIdsOf(SAMPLE_PRICE_BOOK);

    expect([...targets].sort()).toEqual([...SUPPLIED_ROW_IDS].sort());
    for (const customerRow of CUSTOMER_ROW_IDS) {
      expect(targets).not.toContain(customerRow);
    }
  });

  it("holds only rows that a creation accepts, and every customer row is refused as customer-supplied", () => {
    for (const buildId of linkTargetBuildIdsOf(SAMPLE_PRICE_BOOK)) {
      const applied = applyChanges(SAMPLE_PRICE_BOOK, [
        {
          address: { kind: "accessory-created", accessoryId: "organiser" },
          value: {
            linkedBuildId: buildId,
            perUnitMinor: 1_000,
            name: "Organizator",
          },
        },
      ]);

      expect(applied.ok).toBe(true);
    }
    for (const buildId of CUSTOMER_ROW_IDS) {
      expect(refuseLinkTarget(SAMPLE_PRICE_BOOK, buildId)).toBe(
        "LINK_TARGET_CUSTOMER_SUPPLIED",
      );
    }
  });

  it("is empty for a book that prices no rows", () => {
    expect(
      linkTargetBuildIdsOf({ ...SAMPLE_PRICE_BOOK, cabinetRules: [] }),
    ).toEqual([]);
  });
});
