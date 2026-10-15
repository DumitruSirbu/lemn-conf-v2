import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { CSP_REPORT_CAPACITY } from "../src/csp-report-store.js";
import { FakeCspReportStore } from "../src/fake-csp-report-store.js";
import { describeCspReportStoreContract } from "./support/csp-report-store-contract.js";
import {
  aBareRow,
  aFullRow,
  markOf,
  validCspReportRow,
} from "./support/csp-report-fixtures.js";
import { rejectionOf } from "./support/rejection-of.js";

const MARK = markOf("c");
const CAPACITIES = fc.integer({ min: 1, max: 16 });

describe("FakeCspReportStore", () => {
  describeCspReportStoreContract({
    createStore: () => new FakeCspReportStore(),
    mark: MARK,
  });

  describe("the ring (criterion 4)", () => {
    it("never holds more than its capacity, and holds the newest reports in the slots their numbers map to", async () => {
      await fc.assert(
        fc.asyncProperty(
          CAPACITIES,
          fc.nat({ max: 2 }),
          fc.array(validCspReportRow, { minLength: 0, maxLength: 48 }),
          async (capacity, extraLaps, rows) => {
            const store = new FakeCspReportStore(capacity);
            const written = rows.slice(0, capacity * (extraLaps + 1));
            for (const row of written) {
              await store.recordReport(row);
              expect(store.heldReports().length).toBeLessThanOrEqual(capacity);
            }

            const held = store.heldReports();

            const count = written.length;
            const firstHeld = Math.max(1, count - capacity + 1);
            expect(held.length).toBeLessThanOrEqual(capacity);
            expect(
              held.map((report) => report.reportNumber).sort((a, b) => a - b),
            ).toEqual(
              Array.from(
                { length: count - firstHeld + 1 },
                (_unused, index) => firstHeld + index,
              ).filter((number) => number >= 1),
            );
            for (const report of held) {
              expect(report.slot).toBe(report.reportNumber % capacity);
              expect(report.blocked).toBe(
                written[report.reportNumber - 1]?.blocked,
              );
            }
          },
        ),
      );
    });

    it("keeps reports 1 to k below capacity, and k - N + 1 to k after it, in a ring of one", async () => {
      const store = new FakeCspReportStore(1);

      await store.recordReport({ ...aBareRow(MARK), blocked: "inline" });
      await store.recordReport({ ...aBareRow(MARK), blocked: "eval" });

      expect(store.heldReports()).toMatchObject([
        { slot: 0, reportNumber: 2, blocked: "eval" },
      ]);
      expect(store.reportsEverStored()).toBe(2);
    });

    it("wraps at the table's own capacity, the third report of a lap landing in slot 0", async () => {
      const store = new FakeCspReportStore(3);
      for (let report = 1; report <= 4; report += 1) {
        await store.recordReport(aBareRow(MARK));
      }

      expect(
        store
          .heldReports()
          .map(({ slot, reportNumber }) => [slot, reportNumber]),
      ).toEqual([
        [0, 3],
        [1, 4],
        [2, 2],
      ]);
    });
  });

  describe("an overwrite keeps nothing of the old report (criterion 5)", () => {
    it("reads the new row's values and nulls, never a field of the old one", async () => {
      await fc.assert(
        fc.asyncProperty(CAPACITIES, async (capacity) => {
          const store = new FakeCspReportStore(capacity);
          for (let lap = 0; lap < capacity; lap += 1)
            await store.recordReport(aFullRow(MARK));
          const bare = aBareRow(markOf("d"));

          for (let lap = 0; lap < capacity; lap += 1)
            await store.recordReport(bare);

          expect(store.heldReports()).toHaveLength(capacity);
          for (const report of store.heldReports()) {
            expect(report).toMatchObject({
              writerMark: markOf("d"),
              blocked: "inline",
              source: null,
              line: null,
              column: null,
              status: null,
              page: "other",
            });
          }
        }),
      );
    });
  });

  describe("a refusal", () => {
    it("rejects before the cursor moves, so the next report is number 1", async () => {
      const store = new FakeCspReportStore(4);

      await rejectionOf(
        store.recordReport({
          ...aBareRow(MARK),
          blocked: "https://a.example/x",
        }),
      );
      await store.recordReport(aBareRow(MARK));

      expect(
        store.heldReports().map(({ reportNumber }) => reportNumber),
      ).toEqual([1]);
    });
  });

  describe("its capacity", () => {
    it("is the table's by default", async () => {
      const store = new FakeCspReportStore();
      await store.recordReport(aFullRow(MARK));

      expect(store.heldReports()[0]?.slot).toBe(1);
      expect(CSP_REPORT_CAPACITY).toBe(10_000);
    });

    it.each([0, -1, 1.5, Number.NaN])("refuses %s", (capacity) => {
      expect(() => new FakeCspReportStore(capacity)).toThrow(/capacity/);
    });
  });
});
