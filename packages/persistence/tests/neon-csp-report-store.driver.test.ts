import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CSP_REPORT_CAPACITY,
  CspReportStoreError,
} from "../src/csp-report-store.js";
import { NeonCspReportStore } from "../src/neon-csp-report-store.js";
import {
  FAKE_MARKERS,
  markersFoundOn,
} from "./support/leaked-connection-markers.js";
import { aBareRow, aFullRow, markOf } from "./support/csp-report-fixtures.js";
import {
  answerWith,
  driver,
  failWith,
  resetDriver,
  throwSynchronously,
} from "./support/mocked-neon-driver.js";
import { rejectionOf } from "./support/rejection-of.js";

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-driver.js")).withMockedDriver(
    await importOriginal<object>(),
  ),
);

/** A well-formed address no driver is ever asked to reach: the driver is replaced. */
const UNREACHED_URL =
  "postgresql://owner:secret@host.neon.tech/neondb?sslmode=require";
const MARK = markOf("e");
const WRITTEN = [{ report_number: "1" }];

function aStore(): NeonCspReportStore {
  return new NeonCspReportStore(UNREACHED_URL);
}

function sentText(): string {
  return (driver.statements[0]?.text ?? "").replace(/\s+/g, " ").trim();
}

describe("NeonCspReportStore with the driver replaced", () => {
  beforeEach(resetDriver);

  describe("the one statement", () => {
    it("advances the cursor and upserts into the slot the number maps to, one statement and nothing else", async () => {
      answerWith(WRITTEN);

      await aStore().recordReport(aFullRow(MARK));

      expect(driver.statements).toHaveLength(1);
      expect(sentText()).toBe(
        "with advanced as ( update csp_report_cursor set last_number = last_number + 1 where singleton " +
          "returning last_number ) insert into csp_reports ( slot, report_number, received_at, writer_mark, " +
          "directive, blocked, source, line_number, column_number, page, locale, origin, disposition, status_code ) " +
          "select (last_number % 10000)::integer, last_number, now(), ?::text, ?::text, ?::text, ?::text, " +
          "?::integer, ?::integer, ?::text, ?::text, ?::text, ?::text, ?::integer from advanced " +
          "on conflict (slot) do update set report_number = excluded.report_number, " +
          "received_at = excluded.received_at, writer_mark = excluded.writer_mark, " +
          "directive = excluded.directive, blocked = excluded.blocked, source = excluded.source, " +
          "line_number = excluded.line_number, column_number = excluded.column_number, page = excluded.page, " +
          "locale = excluded.locale, origin = excluded.origin, disposition = excluded.disposition, " +
          "status_code = excluded.status_code returning report_number",
      );
    });

    it("takes the capacity from the constant the table's text is tested against", async () => {
      answerWith(WRITTEN);

      await aStore().recordReport(aBareRow(MARK));

      expect(sentText()).toContain(
        `(last_number % ${String(CSP_REPORT_CAPACITY)})::integer`,
      );
    });

    it("sends the row's values in the table's order, an absent optional one as null", async () => {
      answerWith(WRITTEN);

      await aStore().recordReport(aBareRow(MARK));

      expect(driver.statements[0]?.values).toEqual([
        MARK,
        "other",
        "inline",
        null,
        null,
        null,
        "other",
        "none",
        "none",
        "report",
        null,
      ]);
    });

    it("destroys nothing: it never deletes, truncates or drops", async () => {
      answerWith(WRITTEN);

      await aStore().recordReport(aFullRow(MARK));

      expect(sentText()).not.toMatch(/\b(delete|truncate|drop)\b/);
    });
  });

  describe("a row the table would refuse", () => {
    it("is refused before any statement is sent", async () => {
      const refusal = await rejectionOf(
        aStore().recordReport({
          ...aBareRow(MARK),
          blocked: "https://a.example/x",
        }),
      );

      expect(refusal).toBeInstanceOf(Error);
      expect(refusal).not.toBeInstanceOf(CspReportStoreError);
      expect(driver.statements).toEqual([]);
    });
  });

  describe("a failure of the database", () => {
    it("is not repeated, whatever it was", async () => {
      failWith(
        Object.assign(new Error("fetch failed"), { code: "ECONNRESET" }),
      );
      answerWith(WRITTEN);

      const failure = await rejectionOf(aStore().recordReport(aBareRow(MARK)));

      expect(failure).toBeInstanceOf(CspReportStoreError);
      expect(driver.statements).toHaveLength(1);
    });

    it("leaves as a store error naming the operation, carrying the driver's type and code and nothing it said", async () => {
      const leaking = Object.assign(
        new Error(`postgres://${FAKE_MARKERS.join("/")}`),
        {
          code: "42P01",
        },
      );
      failWith(leaking);

      const failure = (await rejectionOf(
        aStore().recordReport(aBareRow(MARK)),
      )) as CspReportStoreError;

      expect(failure.operation).toBe("record a report");
      expect(failure.cause).toEqual({ name: "Error", code: "42P01" });
      expect(markersFoundOn(failure)).toEqual([]);
    });

    it("includes a driver that throws before it returns a promise", async () => {
      throwSynchronously(new Error("synchronous"));

      const failure = await rejectionOf(aStore().recordReport(aBareRow(MARK)));

      expect(failure).toBeInstanceOf(CspReportStoreError);
    });
  });

  describe("a reply that is not one written report", () => {
    it.each([
      ["no row, as when the cursor row is missing", []],
      ["two rows", [{ report_number: "1" }, { report_number: "2" }]],
      ["not a list", { report_number: "1" }],
      ["a null row", [null]],
      ["a number that is not whole", [{ report_number: 1.5 }]],
      ["a report number of 0", [{ report_number: "0" }]],
      ["a report number that is not a number", [{ report_number: "x" }]],
      ["a row without a report number", [{}]],
    ])("is a store error: %s", async (_label, reply) => {
      answerWith(reply);

      const failure = await rejectionOf(aStore().recordReport(aBareRow(MARK)));

      expect(failure).toBeInstanceOf(CspReportStoreError);
    });

    it.each([
      ["a bigint as the driver sends it, text", [{ report_number: "10001" }]],
      ["a number", [{ report_number: 7 }]],
    ])("is written: %s", async (_label, reply) => {
      answerWith(reply);

      await expect(
        aStore().recordReport(aBareRow(MARK)),
      ).resolves.toBeUndefined();
    });
  });
});
