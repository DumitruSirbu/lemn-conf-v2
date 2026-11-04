import { describe, expect, it } from "vitest";

import { readSource } from "../server-source-support";

/**
 * A revision is an opaque digit string, compared for equality in SQL and nowhere above it: the staff routes carry what
 * the store answered, so none of them parses, orders or counts with one.
 */

const STAFF_READ_MODULES = [
  "lib/server/staff/staff-kitchens.ts",
  "lib/server/staff/staff-kitchen-seen.ts",
  "lib/server/staff/staff-kitchen-estimates.ts",
  "lib/server/staff/staff-changed-count.ts",
  "lib/server/staff/changed-count-cache.ts",
  "lib/server/staff/staff-responses.ts",
] as const;

const READS_A_REVISION_AS_A_NUMBER =
  /(?:Number|BigInt|parseInt|parseFloat)\([^)]*revision/i;
const ORDERS_OR_COUNTS_A_REVISION = /\w*revision\w*\s+(?:<|>|<=|>=|\+|-)\s/i;

describe("the staff read modules", () => {
  it.each(STAFF_READ_MODULES)("%s reads no revision as a number", (path) => {
    expect(readSource(path)).not.toMatch(READS_A_REVISION_AS_A_NUMBER);
  });

  it.each(STAFF_READ_MODULES)("%s orders or counts no revision", (path) => {
    expect(readSource(path)).not.toMatch(ORDERS_OR_COUNTS_A_REVISION);
  });

  it("reads source: the patterns recognise what they exist for", () => {
    expect("Number(kitchen.revision)").toMatch(READS_A_REVISION_AS_A_NUMBER);
    expect("BigInt(displayedRevision)").toMatch(READS_A_REVISION_AS_A_NUMBER);
    expect("if (a.revision > b.revision)").toMatch(ORDERS_OR_COUNTS_A_REVISION);
    expect("if (displayedRevision < 5)").toMatch(ORDERS_OR_COUNTS_A_REVISION);
    expect("const next = revision + 1;").toMatch(ORDERS_OR_COUNTS_A_REVISION);
  });
});
