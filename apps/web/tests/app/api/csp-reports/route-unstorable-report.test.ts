import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getCspReportStore } from "@/lib/server/csp/csp-report-store-instance";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { CSP_REPORT_PATH } from "@/lib/security-headers";

/**
 * The two causes the route cannot reach with a real secret, because the limiter judges with the same secret and
 * refuses first: a writer mark that cannot be made, and a mark that makes the row one the table would refuse. The mark's
 * reader is replaced; the route, the limiter and the store's fake are real.
 */
const writer = vi.hoisted(() => ({
  current: { status: "unavailable" } as
    | { status: "unavailable" }
    | { status: "usable"; mark: string },
}));

vi.mock("@/lib/server/csp/csp-report-writer-mark", () => ({
  readCspReportWriterMark: () => writer.current,
}));

const FAKE_SECRET =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const REPORT_BODY = JSON.stringify({
  "csp-report": {
    "document-uri": "https://shop.test/ro/s/Zq7ShareToken0123456789",
    "violated-directive": "script-src-elem",
    "effective-directive": "script-src-elem",
    disposition: "enforce",
    "blocked-uri": "inline",
  },
});

function reportRequest(): Request {
  return new Request(`https://shop.test${CSP_REPORT_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/csp-report",
      "x-forwarded-for": "192.0.2.77",
    },
    body: REPORT_BODY,
  });
}

beforeEach(() => {
  vi.stubEnv("DIGEST_SECRET", FAKE_SECRET);
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  vi.stubEnv("LEMNARIA_E2E_RATE_LIMIT_POLICY", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function freshRoute() {
  vi.resetModules();
  return (await import("../../../../src/app/api/csp-reports/route")).POST;
}

describe.each([
  [
    "a writer mark that cannot be made",
    { status: "unavailable" },
    "mark-unavailable",
  ],
  [
    "a writer mark the table would refuse",
    { status: "usable", mark: "not-a-digest" },
    "row-refused",
  ],
] as const)("POST /api/csp-reports with %s", (_label, outcome, cause) => {
  it("still answers 204, calls no store, and writes the violation line and one unstored line naming the cause", async () => {
    writer.current = outcome;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const store = vi.spyOn(getCspReportStore(), "recordReport");

    const response = await (await freshRoute())(reportRequest());

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(store).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error.mock.calls).toEqual([
      ["[csp]", JSON.stringify({ event: "csp-report-unstored", cause })],
    ]);
  });
});
