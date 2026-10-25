import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  StaffKitchenActionError,
  requireListedRequestStatus,
} from "../src/staff-kitchen-actions-store.js";

const judged = vi.hoisted(() => ({
  verdict: vi.fn<(raw: unknown) => { ok: boolean }>(),
}));

vi.mock("@lemnaria/configurator-domain", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  judgeRequestStatus: (raw: unknown) => judged.verdict(raw),
}));

/**
 * The store takes no view of its own on what a status is: `requireListedRequestStatus` asks the domain's
 * `judgeRequestStatus`, the reading the route also uses, so the two cannot disagree. The verdict is replaced here by one
 * that disagrees with the list on purpose, and the store must follow it.
 */
describe("requireListedRequestStatus follows the domain's judgement of a status", () => {
  beforeEach(() => {
    judged.verdict.mockReset();
  });

  it("refuses what the domain refuses, even a status the list names, with the published code", () => {
    judged.verdict.mockReturnValue({ ok: false });

    const refusal = (() => {
      try {
        requireListedRequestStatus("closed");
      } catch (error) {
        return error;
      }
      return undefined;
    })();

    expect(judged.verdict).toHaveBeenCalledWith("closed");
    expect(refusal).toBeInstanceOf(StaffKitchenActionError);
    expect(refusal).toMatchObject({
      failure: "invalid-request",
      refusal: "STATUS_NOT_IN_LIST",
    });
  });

  it("accepts what the domain accepts, even text the list does not name", () => {
    judged.verdict.mockReturnValue({ ok: true });

    expect(() => {
      requireListedRequestStatus("not-in-the-list");
    }).not.toThrow();
  });
});
