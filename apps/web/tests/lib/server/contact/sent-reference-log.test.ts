import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SENT_REFERENCE_CAUSES,
  reportSentReferenceUnread,
} from "@/lib/server/contact/sent-reference-log";

/** The module keeps its once-per-cause memo for the life of the process, so each test reads it from a graph of its own. */
async function freshLog(): Promise<{
  reportSentReferenceUnread: typeof reportSentReferenceUnread;
}> {
  vi.resetModules();
  return import("@/lib/server/contact/sent-reference-log");
}

let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  error = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("reportSentReferenceUnread", () => {
  it("lists exactly the three causes the plan names", () => {
    expect([...SENT_REFERENCE_CAUSES]).toEqual([
      "store-error",
      "deadline",
      "unexpected",
    ]);
  });

  it.each(SENT_REFERENCE_CAUSES)(
    "writes one line for %s: the label, then the event and the cause and nothing else",
    async (cause) => {
      (await freshLog()).reportSentReferenceUnread(cause);

      expect(error.mock.calls).toEqual([
        [
          "[sent-reference]",
          JSON.stringify({ event: "sent-reference-unread", cause }),
        ],
      ]);
    },
  );

  it("writes one line per cause for a process, and none for a cause already written", async () => {
    const log = await freshLog();

    for (const cause of [...SENT_REFERENCE_CAUSES, ...SENT_REFERENCE_CAUSES]) {
      log.reportSentReferenceUnread(cause);
    }

    expect(error).toHaveBeenCalledTimes(SENT_REFERENCE_CAUSES.length);
  });

  it("writes a cause outside the list as unexpected, so a free-text cause cannot reach the log", async () => {
    const log = await freshLog();

    log.reportSentReferenceUnread(
      "postgres://owner:Zq7Secret@host/db" as never,
    );

    expect(error.mock.calls).toEqual([
      [
        "[sent-reference]",
        JSON.stringify({
          event: "sent-reference-unread",
          cause: "unexpected",
        }),
      ],
    ]);
  });

  it("does not throw when the console does", async () => {
    const log = await freshLog();
    error.mockImplementation(() => {
      throw new Error("the console is closed");
    });

    expect(() => {
      log.reportSentReferenceUnread("deadline");
    }).not.toThrow();
  });
});
