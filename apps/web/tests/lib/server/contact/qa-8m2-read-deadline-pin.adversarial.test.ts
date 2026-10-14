// The e2e spec that measures the warm read cannot import the production deadline (the module is `server-only`), so it
// holds a literal. This reads that literal out of the spec and holds it to the production constant, so a deadline moved
// in one place and not the other turns this red instead of leaving the p95 assertion measuring the wrong figure.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CONTACT_PAGE_READ_DEADLINE_MS } from "@/lib/server/contact/sent-reference";

const E2E_SPEC = join(
  import.meta.dirname,
  "../../../e2e/qa-8m2-hand-over-and-read.adversarial.e2e.spec.ts",
);
const LITERAL_DEADLINE = /^const READ_DEADLINE_MS = (\d+);$/m;

describe("the 8M2 read-latency spec's deadline literal", () => {
  it("is declared exactly once, as a plain number", () => {
    const source = readFileSync(E2E_SPEC, "utf8");

    expect(source.match(new RegExp(LITERAL_DEADLINE, "gm"))).toHaveLength(1);
  });

  it("equals the production deadline the contact page waits for", () => {
    const source = readFileSync(E2E_SPEC, "utf8");

    const literal = Number(LITERAL_DEADLINE.exec(source)?.[1]);

    expect(literal).toBe(CONTACT_PAGE_READ_DEADLINE_MS);
  });
});
