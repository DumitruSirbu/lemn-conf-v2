// M10 K1: what one day's digest says, as facts and codes (frame D10D; ADR 0178 A-13, S-21, X0-5).
import { describe, expect, it } from "vitest";

import {
  DIGEST_CADENCE,
  NOTHING_TO_SEND,
  buildDigestModel,
  type DigestKitchenInput,
  type DigestModel,
  type DigestRow,
} from "../../src/staff-changes/digest-model.js";
import {
  DIGEST_STOPPING_STATUSES,
  DIGEST_WINDOW_DAYS,
} from "../../src/staff-changes/digest-eligibility.js";

const SENT_AT_MS = Date.parse("2026-10-17T10:00:00.000Z");
const UPDATED_AT_MS = Date.parse("2026-10-25T15:40:00.000Z");

function kitchen(
  overrides: Partial<DigestKitchenInput> & { readonly designId: string },
): DigestKitchenInput {
  return {
    customerName: "Ana",
    sentAtMs: SENT_AT_MS,
    updatedAtMs: UPDATED_AT_MS,
    ...overrides,
  } as DigestKitchenInput;
}

function digestOf(kitchens: readonly DigestKitchenInput[]): DigestModel {
  const model = buildDigestModel(kitchens);
  if (model.kind !== "digest") {
    throw new Error("expected a digest, got nothing to send");
  }
  return model;
}

function rowFor(model: DigestModel, designId: string): DigestRow {
  const row = model.rows.find((candidate) => candidate.designId === designId);
  if (row === undefined) throw new Error(`no row for ${designId}`);
  return row;
}

describe("no eligible kitchen", () => {
  it("is nothing to send, not a digest of zero", () => {
    expect(buildDigestModel([])).toBe(NOTHING_TO_SEND);
    expect(NOTHING_TO_SEND).toEqual({ kind: "nothing-to-send" });
  });

  it("is a frozen special case, so a caller cannot turn it into a digest", () => {
    expect(Object.isFrozen(NOTHING_TO_SEND)).toBe(true);
  });
});

describe("the subject", () => {
  it("carries the count of kitchens and nothing else", () => {
    const model = digestOf([
      kitchen({ designId: "a" }),
      kitchen({ designId: "b" }),
      kitchen({ designId: "c" }),
    ]);

    expect(model.subjectCount).toBe(3);
    expect(model.subjectCount).toBe(model.rows.length);
  });

  it("counts a kitchen once when the same design is given twice", () => {
    const model = digestOf([
      kitchen({ designId: "a", updatedAtMs: UPDATED_AT_MS - 1 }),
      kitchen({ designId: "a" }),
    ]);

    expect(model.subjectCount).toBe(1);
    expect(model.rows[0]?.updatedAtMs).toBe(UPDATED_AT_MS);
  });
});

describe("a row", () => {
  it("names the customer by the account name when there is one", () => {
    const row = rowFor(
      digestOf([kitchen({ designId: "a", customerName: "Ion Ceban" })]),
      "a",
    );

    expect(row.customer).toEqual({ kind: "account-name", name: "Ion Ceban" });
  });

  it("names the customer by the request reference when the kitchen was sent without an account", () => {
    const withReference = {
      designId: "a",
      reference: "REQ-123",
      sentAtMs: SENT_AT_MS,
      updatedAtMs: UPDATED_AT_MS,
    } satisfies DigestKitchenInput;

    const row = rowFor(digestOf([withReference]), "a");

    expect(row.customer).toEqual({
      kind: "request-reference",
      reference: "REQ-123",
    });
  });

  it("carries the kitchen name when it has one, as given", () => {
    const name = "In L, <b>3200</b> ‮alb";

    const row = rowFor(
      digestOf([kitchen({ designId: "a", kitchenName: name })]),
      "a",
    );

    expect(row.kitchenName).toBe(name);
  });

  it.each([
    ["absent", {}],
    ["empty", { kitchenName: "" }],
  ] as const)(
    "omits the kitchen name key when the name is %s",
    (_label, overrides) => {
      const row = rowFor(
        digestOf([kitchen({ designId: "a", ...overrides })]),
        "a",
      );

      expect("kitchenName" in row).toBe(false);
    },
  );

  it("carries the two instants and their Chisinau days, so the reader's date agrees with the shop's", () => {
    const sentAtMs = Date.parse("2026-10-24T21:30:00.000Z");
    const updatedAtMs = Date.parse("2026-10-25T22:00:00.000Z");

    const row = rowFor(
      digestOf([kitchen({ designId: "a", sentAtMs, updatedAtMs })]),
      "a",
    );

    expect(row.sentAtMs).toBe(sentAtMs);
    expect(row.updatedAtMs).toBe(updatedAtMs);
    expect(row.sentDay).toBe("2026-10-25");
    expect(row.updatedDay).toBe("2026-10-26");
  });

  it("has a closed set of keys: no e-mail, no phone and no revision can ride along", () => {
    const smuggling: DigestKitchenInput = Object.assign(
      kitchen({ designId: "a" }),
      { email: "ana@mail.md", phone: "069123456", revision: "7" },
    );

    const row = rowFor(digestOf([smuggling]), "a");

    expect(Object.keys(row).sort()).toEqual([
      "customer",
      "designId",
      "sentAtMs",
      "sentDay",
      "updatedAtMs",
      "updatedDay",
    ]);
  });

  it("has the same closed key set, plus the name, for a kitchen that has one", () => {
    const row = rowFor(
      digestOf([kitchen({ designId: "a", kitchenName: "Cu insula" })]),
      "a",
    );

    expect(Object.keys(row).sort()).toEqual([
      "customer",
      "designId",
      "kitchenName",
      "sentAtMs",
      "sentDay",
      "updatedAtMs",
      "updatedDay",
    ]);
  });
});

describe("the row order", () => {
  it("lists the latest change first", () => {
    const model = digestOf([
      kitchen({
        designId: "old",
        updatedAtMs: Date.parse("2026-10-20T10:00:00Z"),
      }),
      kitchen({
        designId: "new",
        updatedAtMs: Date.parse("2026-10-25T10:00:00Z"),
      }),
      kitchen({
        designId: "mid",
        updatedAtMs: Date.parse("2026-10-22T10:00:00Z"),
      }),
    ]);

    expect(model.rows.map((row) => row.designId)).toEqual([
      "new",
      "mid",
      "old",
    ]);
  });

  it("breaks a tie by design id, so the same set always prints the same e-mail", () => {
    const ids = ["b", "c", "a"];
    const forward = digestOf(ids.map((designId) => kitchen({ designId })));
    const backward = digestOf(
      [...ids].reverse().map((designId) => kitchen({ designId })),
    );

    expect(forward.rows.map((row) => row.designId)).toEqual(["a", "b", "c"]);
    expect(backward.rows).toEqual(forward.rows);
  });
});

describe("the footer facts", () => {
  it("are the rule's own numbers and codes, never a sentence", () => {
    const { footer } = digestOf([kitchen({ designId: "a" })]);

    expect(footer).toEqual({
      cadence: "at-most-once-per-day",
      windowDays: 30,
      stoppingStatuses: ["offer-sent", "closed"],
    });
    expect(footer.cadence).toBe(DIGEST_CADENCE);
  });

  it("are read from the eligibility rule, so the footer cannot say one thing while the rule does another", () => {
    const { footer } = digestOf([kitchen({ designId: "a" })]);

    expect(footer.windowDays).toBe(DIGEST_WINDOW_DAYS);
    expect(footer.stoppingStatuses).toBe(DIGEST_STOPPING_STATUSES);
  });

  it("hold no space-separated text anywhere in the footer", () => {
    const { footer } = digestOf([kitchen({ designId: "a" })]);

    const strings = JSON.stringify(footer).match(/"[^"]*"/g) ?? [];

    expect(strings.every((text) => !text.includes(" "))).toBe(true);
  });
});
