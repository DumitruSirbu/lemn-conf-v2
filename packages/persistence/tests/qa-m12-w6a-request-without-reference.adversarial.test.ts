import { describe, expect, it, vi } from "vitest";

import { NeonStaffKitchenReader } from "../src/neon-staff-kitchen-reader.js";
import { StaffKitchenReaderError } from "../src/staff-kitchen-reader.js";
import { WELL_FORMED_UNREACHABLE_VALUE } from "./support/leaked-connection-markers.js";
import {
  answerQueryWith,
  resetQueryDriver,
} from "./support/mocked-neon-query-driver.js";

// M12 W6a adversarial: the request of a kitchen is decided by the one column the statement still returns (`request_ms`)
// now that `reference` is gone. A request row whose instant is the epoch, a negative instant, a stale `reference` key in
// the row, and a request_ms that is not milliseconds must each read as the contract says.
vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-query-driver.js")).withMockedQueryDriver(
    await importOriginal<object>(),
  ),
);

const DESIGN_ID = "D".repeat(21);

function aKitchenRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DESIGN_ID,
    name: null,
    schema_version: 5,
    document: {},
    revision: "7",
    is_changed_since_seen: false,
    is_sent: true,
    is_hidden: false,
    sent_ms: "1790000000000",
    updated_ms: "1790000000000",
    client_id: null,
    client_email: null,
    client_name: null,
    client_phone: null,
    request_ms: null,
    priced_total_minor: null,
    priced_currency: null,
    sent_schema_version: null,
    sent_document: null,
    stored_status: null,
    changed_by_id: null,
    changed_ms: null,
    changed_by_email: null,
    changed_by_name: null,
    ...overrides,
  };
}

async function requestOf(row: Record<string, unknown>) {
  resetQueryDriver();
  answerQueryWith([aKitchenRow(row)]);
  answerQueryWith([]);
  const reading = await new NeonStaffKitchenReader(
    WELL_FORMED_UNREACHABLE_VALUE,
  ).readOne(DESIGN_ID);
  if (reading.kind !== "found") throw new Error("not found");
  return reading.kitchen.request;
}

describe("the neon reader decides that a kitchen has a request by request_ms alone", () => {
  it.each([
    ["the epoch itself", "0", 0],
    ["a minute before the epoch", "-60000", -60000],
    ["a recent instant", "1790000000000", 1790000000000],
    ["the largest the clamp allows", "8640000000000000", 8640000000000000],
    ["the smallest the clamp allows", "-8640000000000000", -8640000000000000],
  ])("has a request at %s, and it is the sentAt only", async (_, text, ms) => {
    const request = await requestOf({ request_ms: text });

    expect(request).toEqual({ sentAt: new Date(ms) });
    expect(Object.keys(request ?? {})).toEqual(["sentAt"]);
  });

  it("has no request when request_ms is null, even if a stale request_reference rides in the row", async () => {
    const request = await requestOf({
      request_ms: null,
      request_reference: "LM-STALE",
    });

    expect(request).toBeNull();
  });

  it("does not carry a stale request_reference into the request it reads", async () => {
    const request = await requestOf({
      request_ms: "1790000000000",
      request_reference: "LM-STALE",
    });

    expect(JSON.stringify(request)).not.toContain("LM-STALE");
  });

  it.each([
    ["an absent member", undefined],
    ["an empty text", ""],
    ["a number rather than text", 1790000000000],
    ["a decimal", "1.5"],
    ["a word", "soon"],
    ["more digits than the statement writes", "12345678901234567"],
  ])(
    "reads %s as an unexpected answer, never as no request",
    async (_, value) => {
      resetQueryDriver();
      const row: Record<string, unknown> = aKitchenRow();
      if (value === undefined) delete row["request_ms"];
      else row["request_ms"] = value;
      answerQueryWith([row]);
      answerQueryWith([]);

      const failure = await new NeonStaffKitchenReader(
        WELL_FORMED_UNREACHABLE_VALUE,
      )
        .readOne(DESIGN_ID)
        .then(
          () => undefined,
          (error: unknown) => error,
        );

      expect(failure).toBeInstanceOf(StaffKitchenReaderError);
      expect((failure as StaffKitchenReaderError).failure).toBe(
        "unexpected-answer",
      );
    },
  );
});
