import { NextRequest, type NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RATE_LIMIT_READ_DEADLINE_MS } from "../src/lib/server/rate-limit/enforce-rate-limit";
import { READS_PER_BLOCK_FIGURE } from "../src/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "../src/lib/server/rate-limit/network-source";
import {
  CSP_REPORT_ONLY_HEADER,
  SHARE_VIEW_HEADERS,
} from "../src/lib/security-headers";
import roMessages from "../src/messages/ro.json";
import ruMessages from "../src/messages/ru.json";
import { readSource } from "./lib/server/server-source-support";

const FAKE_SECRET =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const FROM_192_0_2 = { "x-forwarded-for": "192.0.2.77" };
const A_DESIGN = "V1StGXR8Z5jdHi6BmyT_a";
const HOUR_SECONDS = 3600;

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

function requestTo(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(path, "https://lemnaria.test"), { headers });
}

function theConsole() {
  return {
    warn: vi.spyOn(console, "warn").mockImplementation(() => undefined),
    error: vi.spyOn(console, "error").mockImplementation(() => undefined),
  };
}

beforeEach(() => {
  vi.stubEnv("DIGEST_SECRET", FAKE_SECRET);
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.doUnmock("../src/lib/server/rate-limit/page-limit-response");
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const COUNTED_PATHS: readonly [string, string][] = [
  ["a locale's root", "/ro"],
  ["the other locale's root", "/ru"],
  ["a design's page", `/ro/d/${A_DESIGN}`],
  ["a design's review step", `/ro/d/${A_DESIGN}/review`],
  ["a design's contact step", `/ru/d/${A_DESIGN}/contact`],
  ["a design's done step", `/ro/d/${A_DESIGN}/done`],
  ["a share's view", "/ro/s/abcdefghijkl"],
];

const UNCOUNTED_PATHS: readonly [string, string][] = [
  ["the locale's redirect of the root", "/"],
  ["the locale's redirect of a design", `/d/${A_DESIGN}`],
  ["the case-variant locale's 404", `/RO/d/${A_DESIGN}`],
  ["a step that is not one of the three", `/ro/d/${A_DESIGN}/other`],
  ["the editor's configure page", "/ro/configurator/configure"],
  ["the room page", "/ro/configurator/room"],
  ["an API route", `/api/designs/${A_DESIGN}`],
  ["an API route under a locale", `/ro/api/designs/${A_DESIGN}`],
  ["a static file", "/models/kitchen.glb"],
];

describe("proxy: a counted page read under a named source waits for the judgement and nowhere else", () => {
  it.each(COUNTED_PATHS)(
    "hands back a promise for %s, counts it once, and serves the page's own response",
    async (_label, path) => {
      const { proxy, recorded } = await freshInterceptor();

      const answer = proxy(requestTo(path, FROM_192_0_2));

      expect(answer).toBeInstanceOf(Promise);
      const served = await answer;
      expect(served.status).toBe(200);
      expect(served.headers.get(CSP_REPORT_ONLY_HEADER)).toBeTruthy();
      expect(recorded).toHaveBeenCalledTimes(1);
      expect(recorded.mock.calls[0]?.[0][0]?.key).toBe(
        PINNED_KEY_OF_A_READ_FROM_192_0_2,
      );
    },
  );

  it.each(UNCOUNTED_PATHS)(
    "hands back the response itself, at once, for %s, and asks nothing",
    async (_label, path) => {
      const { proxy, recorded } = await freshInterceptor();

      const answer = proxy(requestTo(path, FROM_192_0_2));

      expect(answer).not.toBeInstanceOf(Promise);
      expect(recorded).not.toHaveBeenCalled();
    },
  );

  it.each([...COUNTED_PATHS, ...UNCOUNTED_PATHS])(
    "hands back the response itself, at once, for %s under no network source",
    async (_label, path) => {
      vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, undefined);
      const { proxy, recorded } = await freshInterceptor();

      const answer = proxy(requestTo(path, FROM_192_0_2));

      expect(answer).not.toBeInstanceOf(Promise);
      expect(recorded).not.toHaveBeenCalled();
    },
  );

  it("gives a counted request, once served, the answer an immediate one gets, bar the nonce", async () => {
    const { proxy } = await freshInterceptor();
    const path = `/ro/d/${A_DESIGN}`;

    const counted = await proxy(requestTo(path, FROM_192_0_2));
    vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, undefined);
    const immediate = proxy(requestTo(path, FROM_192_0_2)) as NextResponse;

    expect(counted.status).toBe(immediate.status);
    expect([...counted.headers.keys()].sort()).toEqual(
      [...immediate.headers.keys()].sort(),
    );
  });
});

describe("proxy: a counted read past its figure is refused with a page", () => {
  async function refused(path: string) {
    const { proxy, recorded } = await freshInterceptor();
    recorded.mockResolvedValue([READS_PER_BLOCK_FIGURE + 1]);
    theConsole();
    const response = await proxy(requestTo(path, FROM_192_0_2));
    return { response, text: await response.text() };
  }

  it.each(COUNTED_PATHS)(
    "answers %s with a 429, a wait of 1 to 3,600 seconds, no-store and a page",
    async (_label, path) => {
      const { response, text } = await refused(path);

      expect(response.status).toBe(429);
      expect(response.headers.get("location")).toBeNull();
      const wait = Number(response.headers.get("retry-after"));
      expect(Number.isInteger(wait) && wait >= 1 && wait <= HOUR_SECONDS).toBe(
        true,
      );
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(response.headers.get("content-type")).toBe(
        "text/html; charset=utf-8",
      );
      expect(text.startsWith("<!doctype html>")).toBe(true);
    },
  );

  it("says the sentence of the path's language: Romanian under /ro and Russian under /ru", async () => {
    const ro = await refused(`/ro/d/${A_DESIGN}`);
    const ru = await refused(`/ru/d/${A_DESIGN}`);

    expect(ro.text).toContain('<html lang="ro">');
    expect(ro.text).toContain(roMessages.designLoadError.tooManyRequests);
    expect(ru.text).toContain('<html lang="ru">');
    expect(ru.text).toContain(ruMessages.designLoadError.tooManyRequests);
    expect(ru.text).not.toContain(roMessages.designLoadError.tooManyRequests);
  });

  it("gives a refusal the headers a served page gets: the policy, and a share view's own", async () => {
    const page = await refused(`/ro/d/${A_DESIGN}`);
    const share = await refused("/ro/s/abcdefghijkl");

    expect(page.response.headers.get(CSP_REPORT_ONLY_HEADER)).toBeTruthy();
    expect(share.response.headers.get(CSP_REPORT_ONLY_HEADER)).toBeTruthy();
    for (const { key, value } of SHARE_VIEW_HEADERS) {
      expect(share.response.headers.get(key)).toBe(value);
      expect(page.response.headers.get(key)).not.toBe(value);
    }
  });

  it("holds no script, no style, no address, no count and no key in the page", async () => {
    const { text } = await refused(`/ro/d/${A_DESIGN}`);

    expect(text).not.toMatch(
      /<script|<style|<link|<img|<iframe|style=|\son[a-z]+=/i,
    );
    expect(text).not.toMatch(/192\.0\.2|[0-9a-f]{64}|\b600\b|\b601\b/);
  });

  it("is never a redirect and never a 200 that says too many requests", async () => {
    const { response, text } = await refused(`/ro/d/${A_DESIGN}`);

    expect([301, 302, 303, 307, 308, 200]).not.toContain(response.status);
    expect(response.status).toBe(429);
    expect(text).toContain(roMessages.designLoadError.tooManyRequests);
  });
});

describe("proxy: a read that cannot be judged, or is late, is served", () => {
  it("serves the page when the store never answers, at the read's deadline and not before", async () => {
    theConsole();
    const { proxy, recorded } = await freshInterceptor();
    // The first read loads the limiter's chain, which is not done under a faked clock.
    await proxy(requestTo(`/ro/d/${A_DESIGN}`, FROM_192_0_2));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    recorded.mockReturnValue(new Promise<readonly number[]>(() => undefined));
    let status: number | undefined;
    const pending = (
      proxy(
        requestTo(`/ro/d/${A_DESIGN}`, FROM_192_0_2),
      ) as Promise<NextResponse>
    ).then((response) => {
      status = response.status;
    });

    await vi.advanceTimersByTimeAsync(RATE_LIMIT_READ_DEADLINE_MS - 1);
    expect(status).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await pending;

    expect(status).toBe(200);
  });

  it("serves the page when the store fails, and when the secret is unusable", async () => {
    theConsole();
    const { proxy, recorded } = await freshInterceptor();
    recorded.mockRejectedValue(new Error("down"));
    const failedStore = await proxy(
      requestTo(`/ro/d/${A_DESIGN}`, FROM_192_0_2),
    );
    vi.stubEnv("DIGEST_SECRET", "short");
    const unusable = await proxy(requestTo(`/ro/d/${A_DESIGN}`, FROM_192_0_2));

    expect([failedStore.status, unusable.status]).toEqual([200, 200]);
  });

  it("serves the page when the limiter cannot be loaded, with one line and the error's name only", async () => {
    vi.doMock("../src/lib/server/rate-limit/page-limit-response", () => {
      throw new TypeError("LOAD-MARKER-3317 /private/path/to/chain");
    });
    const { warn } = theConsole();
    const { proxy } = await freshInterceptor();

    for (let read = 0; read < 3; read += 1) {
      const response = await proxy(
        requestTo(`/ro/d/${A_DESIGN}`, FROM_192_0_2),
      );
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

  it("serves the page when the refusal cannot be made, a refusal that throws being a failure like any", async () => {
    vi.doMock("../src/lib/server/rate-limit/page-limit-response", () => ({
      refusalOfPageRead: () =>
        Promise.reject(new RangeError("a wait nobody can tell")),
    }));
    theConsole();
    const { proxy } = await freshInterceptor();

    const response = await proxy(requestTo(`/ro/d/${A_DESIGN}`, FROM_192_0_2));

    expect(response.status).toBe(200);
  });
});

describe("proxy.ts", () => {
  const source = readSource("proxy.ts");

  it("reads source: one dynamic import in a try reaches the limiter, and no message file or judge is static", () => {
    const staticImports = [
      ...source.matchAll(/^import [^;]*?from "([^"]+)";/gms),
    ].map((match) => match[1] ?? "");

    expect(
      staticImports.filter((path) =>
        /judge|enforce|digest|store|rate-limited-response|design-failure-log|page-limit|messages/.test(
          path,
        ),
      ),
    ).toEqual([]);
    expect(staticImports).toContain("@/lib/server/rate-limit/network-source");
    expect(source.match(/await import\(/g)).toHaveLength(1);
    expect(source.indexOf("try {")).toBeLessThan(
      source.indexOf("await import("),
    );
  });

  it("reads source: the interceptor is not async and awaits nothing: only the counted read's function waits", () => {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "");
    const start = code.indexOf("export function proxy(");
    const body = code.slice(start, code.indexOf("\n}\n", start));

    expect(start).toBeGreaterThan(-1);
    expect(body).not.toMatch(/\basync\b|\bawait\b/);
    expect(code).not.toMatch(/^const .*process\.env/m);
  });
});
