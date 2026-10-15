import { describe, expect, it } from "vitest";

import type { CspReportStore } from "../../src/csp-report-store.js";
import {
  CSP_REPORT_CASES,
  columnsOf,
  rowAndPlacementOf,
} from "./csp-report-case-table.js";
import { aBareRow, aFullRow } from "./csp-report-fixtures.js";
import { rejectionOf } from "./rejection-of.js";

export interface CspReportStoreContractSubject {
  readonly createStore: () => CspReportStore;
  /** The writer mark this run's rows carry, so a test can tell them from any other. */
  readonly mark: string;
}

/** The cases that put no demand on slot or number: what a caller can get wrong, as opposed to the ring. */
const ROW_CASES = CSP_REPORT_CASES.filter(
  ({ overrides }) => !("slot" in overrides || "report_number" in overrides),
);

function rowOf(overrides: Parameters<typeof columnsOf>[0], mark: string) {
  return rowAndPlacementOf(columnsOf({ writer_mark: mark, ...overrides })).row;
}

/** What a `CspReportStore` promises, asserted once and run against the fake and against the Neon store. */
export function describeCspReportStoreContract({
  createStore,
  mark,
}: CspReportStoreContractSubject): void {
  describe("recordReport", () => {
    it("accepts a report with every optional column set", async () => {
      await expect(
        createStore().recordReport(aFullRow(mark)),
      ).resolves.toBeUndefined();
    });

    it("accepts a report with every optional column absent", async () => {
      await expect(
        createStore().recordReport(aBareRow(mark)),
      ).resolves.toBeUndefined();
    });

    it.each(ROW_CASES.filter(({ isAccepted }) => isAccepted))(
      "accepts $label",
      async ({ overrides }) => {
        await expect(
          createStore().recordReport(rowOf(overrides, mark)),
        ).resolves.toBeUndefined();
      },
    );

    it.each(ROW_CASES.filter(({ isAccepted }) => !isAccepted))(
      "refuses $label, naming a field and no value",
      async ({ overrides }) => {
        const refusal = await rejectionOf(
          createStore().recordReport(rowOf(overrides, mark)),
        );

        expect(refusal).toBeInstanceOf(Error);
        expect((refusal as Error).message).toMatch(
          /^Refusing to record a CSP report: its [a-z ]+ must be /,
        );
      },
    );
  });
}
