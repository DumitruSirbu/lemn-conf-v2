// What one day's digest says, as facts and codes (ADR 0178 A-13). Ordering, shuffling, leaks and the footer's
// immutability are swept in qa-k1-adversarial.test.ts.
import { describe, expect, it } from "vitest";

import {
  DIGEST_CADENCE,
  NOTHING_TO_SEND,
  buildDigestModel,
  type DigestKitchenInput,
  type DigestModel,
  type DigestRow,
} from "../../src/staff-changes/digest-model.js";

const SENT_AT_MS = Date.parse("2026-10-17T10:00:00.000Z");
const UPDATED_AT_MS = Date.parse("2026-10-25T15:40:00.000Z");

function kitchen(
  designId: string,
  overrides: Record<string, unknown> = {},
): DigestKitchenInput {
  return {
    designId,
    customerName: "Ana",
    sentAtMs: SENT_AT_MS,
    updatedAtMs: UPDATED_AT_MS,
    ...overrides,
  } as DigestKitchenInput;
}

function onlyRowOf(input: DigestKitchenInput): DigestRow {
  const model = buildDigestModel([input]);
  if (model.kind !== "digest") throw new Error("expected a digest");
  const [row] = model.rows;
  if (row === undefined) throw new Error("expected one row");
  return row;
}

function digestOf(kitchens: readonly DigestKitchenInput[]): DigestModel {
  const model = buildDigestModel(kitchens);
  if (model.kind !== "digest") throw new Error("expected a digest");
  return model;
}

describe("no eligible kitchen", () => {
  it("is nothing to send, not a digest of zero", () => {
    expect(buildDigestModel([])).toBe(NOTHING_TO_SEND);
    expect(NOTHING_TO_SEND).toEqual({ kind: "nothing-to-send" });
  });
});

describe("a design given twice", () => {
  it("is counted and listed once, at its latest change", () => {
    const model = digestOf([
      kitchen("a", { updatedAtMs: UPDATED_AT_MS - 1 }),
      kitchen("a"),
    ]);

    expect(model.subjectCount).toBe(1);
    expect(model.rows[0]?.updatedAtMs).toBe(UPDATED_AT_MS);
  });
});

describe("the customer a row names", () => {
  it("is the account name when there is one", () => {
    const row = onlyRowOf(kitchen("a", { customerName: "Ion Ceban" }));

    expect(row.customer).toEqual({ kind: "account-name", name: "Ion Ceban" });
  });

  it("is the request reference when the kitchen was sent without an account", () => {
    const row = onlyRowOf({
      designId: "a",
      reference: "REQ-123",
      sentAtMs: SENT_AT_MS,
      updatedAtMs: UPDATED_AT_MS,
    });

    expect(row.customer).toEqual({
      kind: "request-reference",
      reference: "REQ-123",
    });
  });

  it.each([
    ["an empty name", ""],
    ["a whitespace-only name", " \t  "],
  ])(
    "falls back to the request reference when the account has %s",
    (_label, customerName) => {
      const row = onlyRowOf({
        ...kitchen("a", { customerName }),
        reference: "REQ-7",
      } as DigestKitchenInput);

      expect(row.customer).toEqual({
        kind: "request-reference",
        reference: "REQ-7",
      });
    },
  );

  it.each([
    ["no reference", {}],
    ["a blank reference", { reference: "   " }],
  ])(
    "is refused, naming the design, when a blank name meets %s",
    (_label, extra) => {
      const unnamed = {
        ...kitchen("design-9", { customerName: "  " }),
        ...extra,
      } as DigestKitchenInput;

      expect(() => buildDigestModel([unnamed])).toThrow(
        /buildDigestModel.*design-9.*neither/,
      );
    },
  );
});

describe("the kitchen name a row carries", () => {
  it("is kept exactly as given", () => {
    const name = "In L, <b>3200</b> ‮alb";

    expect(onlyRowOf(kitchen("a", { kitchenName: name })).kitchenName).toBe(
      name,
    );
  });

  it.each([
    ["absent", {}],
    ["empty", { kitchenName: "" }],
    ["whitespace only", { kitchenName: "  \n " }],
  ])("is left out of the row when it is %s", (_label, overrides) => {
    const row = onlyRowOf(kitchen("a", overrides));

    expect("kitchenName" in row).toBe(false);
  });
});

describe("the closed set of facts in a row", () => {
  it("is the same keys with a name as without, plus the name", () => {
    const withoutName = Object.keys(onlyRowOf(kitchen("a"))).sort();
    const withName = Object.keys(
      onlyRowOf(kitchen("a", { kitchenName: "Cu insula" })),
    ).sort();

    expect(withoutName).toEqual([
      "customer",
      "designId",
      "sentAtMs",
      "sentDay",
      "updatedAtMs",
      "updatedDay",
    ]);
    expect(withName).toEqual([...withoutName, "kitchenName"].sort());
  });
});

describe("the footer", () => {
  it("states the cadence by code", () => {
    expect(digestOf([kitchen("a")]).footer.cadence).toBe(DIGEST_CADENCE);
    expect(DIGEST_CADENCE).toBe("at-most-once-per-day");
  });
});
