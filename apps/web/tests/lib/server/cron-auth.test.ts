import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `node:crypto`'s ESM namespace is frozen, so `vi.spyOn` can't wrap its export directly — `vi.mock`
// intercepts the module at resolution time instead, which works regardless of that.
const timingSafeEqualSpy = vi.hoisted(() => vi.fn());
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  timingSafeEqualSpy.mockImplementation(actual.timingSafeEqual);
  return { ...actual, timingSafeEqual: timingSafeEqualSpy };
});

const { isAuthorizedCronRequest } = await import(
  "../../../src/lib/server/cron-auth"
);

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

describe("isAuthorizedCronRequest", () => {
  afterEach(() => {
    if (ORIGINAL_CRON_SECRET === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
    vi.restoreAllMocks();
  });

  it("accepts a request bearing the configured secret", () => {
    process.env.CRON_SECRET = "correct-secret";
    const headers = new Headers({ authorization: "Bearer correct-secret" });

    expect(isAuthorizedCronRequest(headers)).toBe(true);
  });

  it("rejects a request bearing the wrong secret", () => {
    process.env.CRON_SECRET = "correct-secret";
    const headers = new Headers({ authorization: "Bearer wrong-secret" });

    expect(isAuthorizedCronRequest(headers)).toBe(false);
  });

  it("rejects a request with no authorization header", () => {
    process.env.CRON_SECRET = "correct-secret";
    const headers = new Headers();

    expect(isAuthorizedCronRequest(headers)).toBe(false);
  });

  it("fails closed when CRON_SECRET is unset, even for a plausible-looking header", () => {
    delete process.env.CRON_SECRET;
    const headers = new Headers({ authorization: "Bearer anything" });

    expect(isAuthorizedCronRequest(headers)).toBe(false);
  });

  describe("timing-safe comparison", () => {
    beforeEach(() => {
      process.env.CRON_SECRET = "correct-secret";
      timingSafeEqualSpy.mockClear();
    });

    it("uses crypto.timingSafeEqual, not a short-circuiting ===, to compare equal-length headers", () => {
      const headers = new Headers({ authorization: "Bearer wrong-secretxx" }); // same length as "Bearer correct-secret"

      isAuthorizedCronRequest(headers);

      expect(timingSafeEqualSpy).toHaveBeenCalledTimes(1);
    });

    it("never calls timingSafeEqual for a length mismatch, since it throws on unequal-length buffers", () => {
      const headers = new Headers({ authorization: "Bearer short" });

      expect(isAuthorizedCronRequest(headers)).toBe(false);
      expect(timingSafeEqualSpy).not.toHaveBeenCalled();
    });
  });
});
