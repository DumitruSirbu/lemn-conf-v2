import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  reportCspReportUnstored,
  UNSTORED_CAUSES,
} from "@/lib/server/csp/csp-report-log";

/** The module keeps its once-per-cause memo for the life of the process, so each test reads it from a graph of its own. */
async function freshLog(): Promise<{
  reportCspReportUnstored: typeof reportCspReportUnstored;
}> {
  vi.resetModules();
  return import("@/lib/server/csp/csp-report-log");
}

let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  error = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("reportCspReportUnstored", () => {
  it("lists exactly the four causes the plan names", () => {
    expect([...UNSTORED_CAUSES]).toEqual([
      "store-failed",
      "deadline",
      "row-refused",
      "mark-unavailable",
    ]);
  });

  it.each(UNSTORED_CAUSES)(
    "writes one line for %s, with the event and the cause and nothing else",
    async (cause) => {
      (await freshLog()).reportCspReportUnstored(cause);

      expect(error.mock.calls).toEqual([
        ["[csp]", JSON.stringify({ event: "csp-report-unstored", cause })],
      ]);
    },
  );

  it("writes one line per cause for a process, and none for a cause already written", async () => {
    const log = await freshLog();

    for (const cause of [...UNSTORED_CAUSES, ...UNSTORED_CAUSES]) {
      log.reportCspReportUnstored(cause);
    }

    expect(error).toHaveBeenCalledTimes(UNSTORED_CAUSES.length);
  });

  it("writes a cause outside the list as store-failed, so a free-text cause cannot reach the log", async () => {
    const log = await freshLog();

    log.reportCspReportUnstored("postgres://owner:Zq7Secret@host/db" as never);

    expect(error.mock.calls).toEqual([
      [
        "[csp]",
        JSON.stringify({ event: "csp-report-unstored", cause: "store-failed" }),
      ],
    ]);
  });

  it("does not throw when the console does", async () => {
    error.mockImplementation(() => {
      throw new Error("the console is closed");
    });
    const log = await freshLog();

    expect(() => {
      log.reportCspReportUnstored("deadline");
    }).not.toThrow();
  });
});
