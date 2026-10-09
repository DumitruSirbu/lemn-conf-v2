import type { NextFetchEvent } from "next/server";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLIENT_NETWORK_SOURCE_VARIABLE } from "../src/lib/server/rate-limit/network-source";
import { readSource } from "./lib/server/server-source-support";

const FAKE_SECRET =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const FROM_192_0_2 = { "x-forwarded-for": "192.0.2.77" };

/** What `openssl dgst -sha256 -mac HMAC -macopt hexkey:<the fake secret>` gave for a read's bucket for 192.0.2. */
const PINNED_KEY_OF_A_READ_FROM_192_0_2 =
  "6cf8d1034dfdb1c1cabd3dcba28628a218f096163470839aff962bfdd4b819c7";

/** The interceptor and the store it counts in, from a module graph of their own, so what the interceptor announces
 *  for a process is announced afresh. */
async function freshInterceptor() {
  vi.resetModules();
  const { proxy } = await import("../src/proxy");
  const { getRateLimitStore } = await import(
    "../src/lib/server/rate-limit/rate-limit-store-instance"
  );
  return { proxy, recorded: vi.spyOn(getRateLimitStore(), "recordHits") };
}

function eventOf() {
  const waitUntil = vi.fn<(promise: Promise<unknown>) => void>();
  return { event: { waitUntil } as unknown as NextFetchEvent, waitUntil };
}

function requestTo(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(path, "https://lemnaria.test"), { headers });
}

beforeEach(() => {
  vi.stubEnv("DIGEST_SECRET", FAKE_SECRET);
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.doUnmock("../src/lib/server/rate-limit/judge-read-request");
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("proxy: a design page read is counted beside its response, where a source is named", () => {
  it("counts one hit under the pinned key of the request's block, and serves the page as without it", async () => {
    const { proxy, recorded } = await freshInterceptor();
    const { event, waitUntil } = eventOf();
    const path = "/ro/d/V1StGXR8Z5jdHi6BmyT_a";

    const counted = proxy(requestTo(path, FROM_192_0_2), event);
    await waitUntil.mock.calls[0]?.[0];
    const uncounted = proxy(requestTo(path, FROM_192_0_2));

    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(recorded).toHaveBeenCalledTimes(1);
    expect(recorded.mock.calls[0]?.[0][0]?.key).toBe(
      PINNED_KEY_OF_A_READ_FROM_192_0_2,
    );
    expect(counted.status).toBe(uncounted.status);
    expect([...counted.headers.keys()].sort()).toEqual(
      [...uncounted.headers.keys()].sort(),
    );
  });

  it("loads nothing of the limiter and asks nothing under no network source", async () => {
    vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, undefined);
    const { proxy, recorded } = await freshInterceptor();
    const { event, waitUntil } = eventOf();

    proxy(requestTo("/ro/d/V1StGXR8Z5jdHi6BmyT_a", FROM_192_0_2), event);

    expect(waitUntil).not.toHaveBeenCalled();
    expect(recorded).not.toHaveBeenCalled();
  });

  it.each([
    ["a redirect to the locale", "/d/V1StGXR8Z5jdHi6BmyT_a"],
    ["the case-variant locale's 404", "/RO/d/V1StGXR8Z5jdHi6BmyT_a"],
    ["a design's review step", "/ro/d/V1StGXR8Z5jdHi6BmyT_a/review"],
    ["a share's view", "/ro/s/abcdefghijkl"],
    ["the home page", "/ro"],
    ["the editor's configure page", "/ro/configurator/configure"],
    ["an API route", "/api/designs/V1StGXR8Z5jdHi6BmyT_a"],
    ["a static file", "/models/kitchen.glb"],
  ])("does not count %s", async (_label, path) => {
    const { proxy } = await freshInterceptor();
    const { event, waitUntil } = eventOf();

    proxy(requestTo(path, FROM_192_0_2), event);

    expect(waitUntil).not.toHaveBeenCalled();
  });

  it("serves a page when the limiter cannot be loaded, with one line and the error's name only", async () => {
    vi.doMock("../src/lib/server/rate-limit/judge-read-request", () => {
      throw new TypeError("LOAD-MARKER-3317 /private/path/to/chain");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { proxy } = await freshInterceptor();

    for (let read = 0; read < 3; read += 1) {
      const { event, waitUntil } = eventOf();
      const response = proxy(
        requestTo("/ro/d/V1StGXR8Z5jdHi6BmyT_a", FROM_192_0_2),
        event,
      );
      await expect(waitUntil.mock.calls[0]?.[0]).resolves.toBeUndefined();
      expect(response.status).toBe(200);
    }

    expect(warn.mock.calls).toEqual([
      [
        "[designs]",
        {
          event: "design-read-limiter-unavailable",
          errorName: expect.stringMatching(/Error$/) as string,
        },
      ],
    ]);
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/MARKER|private/);
  });

  it("serves a page whose count fails in the store, as the read judge itself serves it", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { proxy, recorded } = await freshInterceptor();
    recorded.mockRejectedValue(new Error("down"));
    const { event, waitUntil } = eventOf();

    const response = proxy(
      requestTo("/ro/d/V1StGXR8Z5jdHi6BmyT_a", FROM_192_0_2),
      event,
    );

    await expect(waitUntil.mock.calls[0]?.[0]).resolves.toBeUndefined();
    expect(response.status).toBe(200);
  });
});

describe("proxy.ts", () => {
  const source = readSource("proxy.ts");

  it("reads source: one dynamic import in a try reaches the limiter, and only the pure source check is static", () => {
    const staticImports = [
      ...source.matchAll(/^import [^;]*?from "(@\/lib\/server\/[^"]+)";/gms),
    ].map((match) => match[1]);

    expect(staticImports).toContain("@/lib/server/rate-limit/network-source");
    expect(
      staticImports.filter((path) =>
        /judge|enforce|digest|store|rate-limited-response|design-failure-log/.test(
          path ?? "",
        ),
      ),
    ).toEqual([]);
    expect(source.match(/await import\(/g)).toHaveLength(1);
    expect(source.indexOf("try {")).toBeLessThan(
      source.indexOf("await import("),
    );
  });
});
