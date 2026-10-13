import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { CSP_REPORT_PATH } from "@/lib/security-headers";

/**
 * The route with the report store's REAL instance, as a deployment before the owner applies `0009` or a host with no
 * `DATABASE_URL` runs it (criterion 14, ADR 0162: until the table and the grant exist the sink behaves as it did).
 * The store opens its connection in its constructor, so with no variable the constructor throws synchronously; no
 * connection is opened and no database is reached. The limiter's own store stays the shared setup's fake.
 */
vi.unmock("@/lib/server/csp/csp-report-store-instance");

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
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("TEST_DATABASE_URL", "");
  vi.stubEnv("MIGRATION_DATABASE_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function freshRoute() {
  vi.resetModules();
  return (await import("../../../../src/app/api/csp-reports/route")).POST;
}

describe("POST /api/csp-reports with no DATABASE_URL, so that the report store cannot be made", () => {
  it("answers 204 and empty, writes the violation line and one unstored line, and throws nothing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const response = await (await freshRoute())(reportRequest());

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[1]).toContain('"event":"csp-violation"');
    expect(error.mock.calls).toEqual([
      [
        "[csp]",
        JSON.stringify({ event: "csp-report-unstored", cause: "store-failed" }),
      ],
    ]);
  });

  it("writes the unstored line once for the process, however many reports arrive", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const route = await freshRoute();

    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await route(reportRequest())).status).toBe(204);
    }

    expect(error).toHaveBeenCalledTimes(1);
  });

  it("names nothing of the missing variable's message in the line", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await (
      await freshRoute()
    )(reportRequest());

    expect(JSON.stringify(error.mock.calls)).not.toMatch(
      /DATABASE_URL|environment variable/,
    );
  });
});
