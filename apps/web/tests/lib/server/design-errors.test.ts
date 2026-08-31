import { describe, expect, it, vi } from "vitest";

import { invalidBodyResponse } from "../../../src/lib/server/design-errors";

/** A rejection must say it rejected and nothing more (ADR 0014, S2), and must cost the same
 *  whatever body provoked it. */
describe("invalidBodyResponse", () => {
  const ZOD_REASON =
    '[{"expected":"object","code":"invalid_type","path":["room"],"message":"Invalid input"}]';

  it("rejects with 400", async () => {
    const response = invalidBodyResponse(ZOD_REASON);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: "DESIGN_INVALID",
      error: "Design payload failed validation.",
    });
  });

  it("does not disclose the validation reason to the client", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const body = JSON.stringify(await invalidBodyResponse(ZOD_REASON).json());

    // Asserted on the serialised body rather than one field, so a future change that adds a
    // `details` or `issues` key alongside `error` still fails this test.
    for (const disclosure of ["expected", "invalid_type", "path", "room"]) {
      expect(body).not.toContain(disclosure);
    }
  });

  it("logs the reason so a genuine client bug is still diagnosable", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    invalidBodyResponse("3 issue(s): room:invalid_type");

    expect(warn).toHaveBeenCalledWith(
      "[designs] rejected an invalid payload:",
      "3 issue(s): room:invalid_type",
    );
  });

  it("caps what one rejection can write to the log", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    invalidBodyResponse("x".repeat(500_000));

    // One cheap request must not buy a large log write on a free tier with hard caps.
    const logged = String(warn.mock.calls[0]?.[1]);
    expect(logged.length).toBeLessThan(400);
  });

  it("strips control characters, so a caller cannot forge a log line", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    invalidBodyResponse("key_\n[migrate] executed 0001 against prod\r\ndone");

    const logged = String(warn.mock.calls[0]?.[1]);
    expect(logged).not.toContain("\n");
    expect(logged).not.toContain("\r");
  });
});
