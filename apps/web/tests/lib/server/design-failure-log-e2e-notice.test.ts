import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

/** The module's own state decides "once in a process", so each test takes the module fresh. */
async function freshLog() {
  vi.resetModules();
  return await import("@/lib/server/design-failure-log");
}

describe("reportE2ePolicyInUse", () => {
  it("writes the one notice the first time and nothing after, in one process", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { reportE2ePolicyInUse, E2E_MINT_POLICY_NOTICE } = await freshLog();

    reportE2ePolicyInUse();
    reportE2ePolicyInUse();
    reportE2ePolicyInUse();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("[designs]", {
      event: "rate-limit-policy-notice",
      message: E2E_MINT_POLICY_NOTICE,
    });
  });

  it("writes it again in a process that starts afresh, so no earlier test decides this one", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    (await freshLog()).reportE2ePolicyInUse();
    (await freshLog()).reportE2ePolicyInUse();

    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("says, byte for byte, what the section words, built from the flag's own name", async () => {
    const { E2E_MINT_POLICY_NOTICE } = await freshLog();

    expect(E2E_MINT_POLICY_NOTICE).toBe(
      "rate limit: an e2e policy is in use (LEMNARIA_E2E_RATE_LIMIT_POLICY); " +
        "its figure is not the production one",
    );
  });
});
