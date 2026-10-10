import { afterEach, describe, expect, it, vi } from "vitest";

import { reportOverwriteReadFailure } from "../../src/persistence/report-overwrite-read-failure";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("reportOverwriteReadFailure", () => {
  it("writes one line with the label, the event and the failure's message", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    reportOverwriteReadFailure(
      new Error("Loading a design failed: HTTP status 429"),
    );

    expect(warn.mock.calls).toEqual([
      [
        "[save]",
        {
          event: "overwrite-read-failed",
          reason: "Loading a design failed: HTTP status 429",
        },
      ],
    ]);
  });

  it("strips control characters and caps the length of the reason", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    reportOverwriteReadFailure(new Error(`a\nb\u0000${"x".repeat(5000)}`));

    const line = warn.mock.calls[0]?.[1] as { reason: string };
    const hasControlCharacter = line.reason
      .split("")
      .some((unit) => unit.charCodeAt(0) < 32);
    expect(hasControlCharacter).toBe(false);
    expect(line.reason.length).toBeLessThan(1000);
  });

  it("writes the text of a thrown value that is not an error", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    reportOverwriteReadFailure("refused");

    expect(warn.mock.calls[0]?.[1]).toMatchObject({ reason: "refused" });
  });

  it("lets nothing escape: a message that throws and a transport that throws", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const hostile = new Error("x");
    Object.defineProperty(hostile, "message", {
      get() {
        throw new Error("MARKER");
      },
    });

    expect(() => {
      reportOverwriteReadFailure(hostile);
    }).not.toThrow();
    warn.mockImplementation(() => {
      throw new Error("transport down");
    });
    expect(() => {
      reportOverwriteReadFailure(new Error("x"));
    }).not.toThrow();
  });
});
