import { describe, expect, it, vi } from "vitest";

import { invalidBodyResponse } from "../../../src/lib/server/design-errors";

/** The write routes have no authentication (ADR 0014, S1), so the schema is effectively the only
 *  thing an unauthenticated caller does not already have. These tests pin that a rejection says it
 *  rejected and nothing more. */
describe("invalidBodyResponse", () => {
  const ZOD_REASON =
    '[{"expected":"object","code":"invalid_type","path":["room"],"message":"Invalid input"}]';

  it("rejects with 400", async () => {
    const response = invalidBodyResponse(ZOD_REASON);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
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

    invalidBodyResponse(ZOD_REASON);

    expect(warn).toHaveBeenCalledWith(
      "[designs] rejected an invalid payload:",
      ZOD_REASON,
    );
  });
});
