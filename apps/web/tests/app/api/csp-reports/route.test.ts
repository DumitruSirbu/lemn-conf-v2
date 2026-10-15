import { createHmac } from "node:crypto";

import { fc } from "@fast-check/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CSP_REPORTS_PER_BLOCK_FIGURE } from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { getRateLimitStore } from "@/lib/server/rate-limit/rate-limit-store-instance";
import { utcWindowOf } from "@/lib/server/rate-limit/utc-window";
import { CSP_REPORT_PATH } from "@/lib/security-headers";

import { flattenLogArguments } from "../../../support/console-log-line";

/**
 * `POST /api/csp-reports` through the real route, the real limiter and the shared setup's fake counters. What a test
 * looks at is the order of what the route did (a count, a read of the body, a line written), the status of each
 * refusal, and the one line an accepted report leaves behind.
 */
const FAKE_SECRET =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const BODY_BOUND_BYTES = 8 * 1024;
const HOUR_SECONDS = 3600;
const A_NETWORK = "192.0.2.77";
const NOON = new Date("2026-07-15T12:20:00Z");

/** Text no reduced line may hold: what a report, its request and its cookies carry that is a visitor's. */
const SHARE_TOKEN = "Zq7ShareTokenOfAVisitor0123456789";
const NONCE = "Zq7NonceOfThePolicy9876543210";
const COOKIE_VALUE = "Zq7CookieValueOfAVisitor0123456";
const USER_AGENT = "Zq7BrowserOfAVisitor/1.0";
const QUERY_VALUE = "Zq7QueryValue";
const FORBIDDEN_TEXTS = [
  SHARE_TOKEN,
  NONCE,
  COOKIE_VALUE,
  USER_AGENT,
  QUERY_VALUE,
  A_NETWORK,
  "192.0.2",
  "original-policy",
  "document-uri",
  "referrer",
  "script-sample",
];

const order = vi.hoisted(() => ({ calls: [] as string[] }));

const { POST } = await import("../../../../src/app/api/csp-reports/route");

/** A browser's report of an inline script on a share view, as Chromium 151 writes it (8Q S0 M6). */
function chromiumReport(): Record<string, unknown> {
  const documentUri = `https://shop.test/ro/s/${SHARE_TOKEN}?q=${QUERY_VALUE}`;
  return {
    "document-uri": documentUri,
    referrer: `https://shop.test/ro/d/${SHARE_TOKEN}/review`,
    "violated-directive": "script-src-elem",
    "effective-directive": "script-src-elem",
    "original-policy": `default-src 'self'; script-src 'self' 'nonce-${NONCE}' 'strict-dynamic'`,
    disposition: "enforce",
    "blocked-uri": "inline",
    "line-number": 1,
    "source-file": documentUri,
    "status-code": 200,
    "script-sample": SHARE_TOKEN,
  };
}

const VALID_BODY = JSON.stringify({ "csp-report": chromiumReport() });

/** A valid report of exactly this many bytes, padded by a field the reduction never reads. */
function validBodyOfBytes(bytes: number): string {
  const unpadded = JSON.stringify({
    "csp-report": { ...chromiumReport(), pad: "" },
  });
  return JSON.stringify({
    "csp-report": {
      ...chromiumReport(),
      pad: "p".repeat(bytes - unpadded.length),
    },
  });
}

interface BodyProbe {
  reads: number;
}

/** A body whose stream says when it is first read, so that "no body was read" is a thing a test can see. */
function probedBody(
  text: string,
  probe: BodyProbe,
): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let isSent = false;
  return new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        probe.reads += 1;
        order.calls.push("read");
        if (isSent) {
          controller.close();
          return;
        }
        isSent = true;
        controller.enqueue(bytes);
      },
    },
    { highWaterMark: 0 },
  );
}

function brokenBody(probe: BodyProbe): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        probe.reads += 1;
        order.calls.push("read");
        controller.error(new Error("the connection was reset"));
      },
    },
    { highWaterMark: 0 },
  );
}

interface ReportRequestParts {
  /** `null` sends no type at all; leaving it out sends the report type. */
  readonly contentType?: string | null;
  readonly body?: string | ReadableStream<Uint8Array> | undefined;
  readonly headers?: Record<string, string>;
  readonly probe?: BodyProbe;
}

function reportRequest({
  contentType = "application/csp-report",
  body = VALID_BODY,
  headers = {},
  probe = { reads: 0 },
}: ReportRequestParts = {}): Request {
  const stream = typeof body === "string" ? probedBody(body, probe) : body;
  return new Request(`https://shop.test${CSP_REPORT_PATH}`, {
    method: "POST",
    headers: {
      ...(contentType === null ? {} : { "content-type": contentType }),
      "x-forwarded-for": A_NETWORK,
      ...headers,
    },
    body: stream,
    duplex: "half",
  } as RequestInit);
}

function consoleLines() {
  const note = (kind: string) => () => {
    order.calls.push(kind);
  };
  return {
    warn: vi.spyOn(console, "warn").mockImplementation(note("log")),
    error: vi.spyOn(console, "error").mockImplementation(note("log-error")),
  };
}

/** One console call as the label and the text it was given; a text that is no string is written as nothing. */
function loggedLine(call: readonly unknown[] | undefined): {
  readonly argumentCount: number;
  readonly label: unknown;
  readonly text: string;
} {
  const [label, text] = call ?? [];
  return {
    argumentCount: call?.length ?? 0,
    label,
    text: typeof text === "string" ? text : "",
  };
}

function countingStore(answer: () => Promise<number[]>) {
  return vi.spyOn(getRateLimitStore(), "recordHits").mockImplementation(() => {
    order.calls.push("count");
    return answer();
  });
}

const ALLOWS = () => Promise.resolve([1]);
const REFUSES = () => Promise.resolve([CSP_REPORTS_PER_BLOCK_FIGURE + 1]);
const FAILS = () => Promise.reject(new Error("the store is down"));

beforeEach(() => {
  order.calls.length = 0;
  vi.stubEnv("DIGEST_SECRET", FAKE_SECRET);
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  vi.stubEnv("LEMNARIA_E2E_RATE_LIMIT_POLICY", undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** The route from a module graph of its own: its unavailable line is written once for a process and a cause. */
async function freshRoute(): Promise<typeof POST> {
  vi.resetModules();
  return (await import("../../../../src/app/api/csp-reports/route")).POST;
}

async function bodyTextOf(response: Response): Promise<string> {
  return response.text();
}

describe("POST /api/csp-reports: the media type is asked first, and counts nothing", () => {
  it.each([
    ["no type", null],
    ["application/json", "application/json"],
    ["text/plain", "text/plain"],
    ["a report type with a suffix", "application/csp-report+json"],
    ["the reporting API's type", "application/reports+json"],
    ["a form", "multipart/form-data; boundary=x"],
    ["a type that only starts like it", "application/csp-reports"],
  ])(
    "answers 415 for %s, with nothing counted, read or written",
    async (_label, contentType) => {
      const lines = consoleLines();
      const store = countingStore(ALLOWS);
      const probe = { reads: 0 };

      const response = await POST(reportRequest({ contentType, probe }));

      expect(response.status).toBe(415);
      expect(store).not.toHaveBeenCalled();
      expect(probe.reads).toBe(0);
      expect(lines.warn).not.toHaveBeenCalled();
      expect(lines.error).not.toHaveBeenCalled();
      expect(order.calls).toEqual([]);
    },
  );

  it("answers 415 for a wrong type even when the limiter would refuse, so that it is not the limiter that answers", async () => {
    consoleLines();
    countingStore(REFUSES);

    const response = await POST(reportRequest({ contentType: "text/plain" }));

    expect(response.status).toBe(415);
  });

  it("takes the type whatever its case or its parameters", async () => {
    consoleLines();

    const response = await POST(
      reportRequest({ contentType: "Application/CSP-Report ; charset=utf-8" }),
    );

    expect(response.status).toBe(204);
  });
});

describe("POST /api/csp-reports: a count before any body, a refusal that reads nothing", () => {
  it("answers 429 with a whole wait in the hour when the figure is passed, reading nothing and writing the one limited line", async () => {
    const lines = consoleLines();
    countingStore(REFUSES);
    const probe = { reads: 0 };

    const response = await (await freshRoute())(reportRequest({ probe }));

    const wait = Number(response.headers.get("retry-after"));
    expect(response.status).toBe(429);
    expect(Number.isInteger(wait) && wait >= 1 && wait <= HOUR_SECONDS).toBe(
      true,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await bodyTextOf(response)).toBe("");
    expect(probe.reads).toBe(0);
    expect(lines.warn.mock.calls).toEqual([
      ["[csp]", '{"event":"csp-report-limited"}'],
    ]);
    expect(lines.error).not.toHaveBeenCalled();
    expect(order.calls).toEqual(["count", "log"]);
  });

  it("answers 503 for a request that cannot be judged, with no wait and no body, reading nothing", async () => {
    consoleLines();
    countingStore(FAILS);
    const probe = { reads: 0 };

    const response = await (await freshRoute())(reportRequest({ probe }));

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await bodyTextOf(response)).toBe("");
    expect(probe.reads).toBe(0);
  });

  it.each([
    ["a store that fails", () => undefined, "store-failed"],
    [
      "a secret that cannot key a bucket",
      () => vi.stubEnv("DIGEST_SECRET", "short"),
      "digester-unusable",
    ],
    [
      "a network source that is misconfigured",
      () => vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "not-a-source"),
      "source-misconfigured",
    ],
  ])(
    "fails closed for %s with one line, naming the cause",
    async (_label, arrange, cause) => {
      const lines = consoleLines();
      countingStore(FAILS);
      arrange();

      const response = await (await freshRoute())(reportRequest());

      expect(response.status).toBe(503);
      expect(lines.warn).not.toHaveBeenCalled();
      expect(lines.error.mock.calls).toEqual([
        ["[csp]", JSON.stringify({ event: "csp-report-unavailable", cause })],
      ]);
    },
  );

  it("writes the unavailable line once for a process and a cause, however many requests cannot be judged", async () => {
    const lines = consoleLines();
    countingStore(FAILS);
    const route = await freshRoute();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await route(reportRequest())).status).toBe(503);
    }
    vi.stubEnv("DIGEST_SECRET", "short");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await route(reportRequest())).status).toBe(503);
    }

    expect(lines.error).toHaveBeenCalledTimes(2);
    expect(lines.warn).not.toHaveBeenCalled();
  });

  it("writes the limited line once for a process and a UTC hour, however many requests the limiter refuses", async () => {
    const lines = consoleLines();
    countingStore(REFUSES);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOON);
    const route = await freshRoute();

    for (let attempt = 0; attempt < 50; attempt += 1) {
      expect((await route(reportRequest())).status).toBe(429);
    }

    expect(lines.warn).toHaveBeenCalledTimes(1);
    expect(lines.error).not.toHaveBeenCalled();
  });

  it("writes the limited line again in the next UTC hour, and not again at its last second", async () => {
    const lines = consoleLines();
    countingStore(REFUSES);
    vi.useFakeTimers({ toFake: ["Date"] });
    const route = await freshRoute();
    const sendAt = async (instant: string) => {
      vi.setSystemTime(new Date(instant));
      await route(reportRequest());
    };

    await sendAt("2026-07-15T12:00:00Z");
    await sendAt("2026-07-15T12:59:59Z");
    expect(lines.warn).toHaveBeenCalledTimes(1);
    await sendAt("2026-07-15T13:00:00Z");
    expect(lines.warn).toHaveBeenCalledTimes(2);
  });

  it("writes no limited line for a request that is allowed, or one that cannot be judged", async () => {
    const lines = consoleLines();
    const route = await freshRoute();

    countingStore(FAILS);
    await route(reportRequest({ body: "" }));
    countingStore(ALLOWS);
    await route(reportRequest({ body: "" }));

    expect(lines.warn).not.toHaveBeenCalled();
  });

  it("counts one hit in the network block's bucket under the policy report's own name, in the clock hour", async () => {
    consoleLines();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOON);
    const store = vi.spyOn(getRateLimitStore(), "recordHits");

    await POST(reportRequest());

    expect(store.mock.calls).toEqual([
      [[{ key: keyOfBlock("192.0.2"), window: utcWindowOf(NOON, 60) }]],
    ]);
  });

  it("allows the figure's worth of reports in an hour and refuses the next, for that block alone", async () => {
    consoleLines();
    const answers: number[] = [];

    for (let report = 0; report <= CSP_REPORTS_PER_BLOCK_FIGURE; report += 1) {
      answers.push((await POST(reportRequest())).status);
    }
    const another = await POST(
      reportRequest({ headers: { "x-forwarded-for": "198.51.100.5" } }),
    );

    expect(
      answers
        .slice(0, CSP_REPORTS_PER_BLOCK_FIGURE)
        .every((status) => status === 204),
    ).toBe(true);
    expect(answers[CSP_REPORTS_PER_BLOCK_FIGURE]).toBe(429);
    expect(another.status).toBe(204);
  });
});

describe("POST /api/csp-reports: the body is read to its bound, after the count", () => {
  it("answers 413 for a body of one byte over the bound, counted, read, and written nowhere", async () => {
    const lines = consoleLines();
    countingStore(ALLOWS);

    const response = await POST(
      reportRequest({ body: validBodyOfBytes(BODY_BOUND_BYTES + 1) }),
    );

    expect(response.status).toBe(413);
    expect(await bodyTextOf(response)).toBe("");
    expect(lines.warn).not.toHaveBeenCalled();
    expect(lines.error).not.toHaveBeenCalled();
    expect(order.calls.filter((call) => call !== "read")).toEqual(["count"]);
  });

  it("takes a report of exactly the bound", async () => {
    consoleLines();

    const response = await POST(
      reportRequest({ body: validBodyOfBytes(BODY_BOUND_BYTES) }),
    );

    expect(response.status).toBe(204);
  });

  it("answers 400 for a stream that broke, counted and read, and written nowhere", async () => {
    const lines = consoleLines();
    countingStore(ALLOWS);
    const probe = { reads: 0 };

    const response = await POST(reportRequest({ body: brokenBody(probe) }));

    expect(response.status).toBe(400);
    expect(probe.reads).toBe(1);
    expect(lines.warn).not.toHaveBeenCalled();
    expect(lines.error).not.toHaveBeenCalled();
    expect(order.calls).toEqual(["count", "read"]);
  });
});

describe("POST /api/csp-reports: a body that holds no report is 400, counted and written nowhere", () => {
  it.each([
    ["an empty body", ""],
    ["text that is not JSON", "this is not a report"],
    ["JSON that is a list", "[]"],
    ["JSON that is null", "null"],
    ["an object with no `csp-report`", '{"report-to":{}}'],
    ["a `csp-report` that is not an object", '{"csp-report":"inline"}'],
  ])("answers 400 for %s", async (_label, body) => {
    const lines = consoleLines();
    countingStore(ALLOWS);

    const response = await POST(reportRequest({ body }));

    expect(response.status).toBe(400);
    expect(await bodyTextOf(response)).toBe("");
    expect(lines.warn).not.toHaveBeenCalled();
    expect(lines.error).not.toHaveBeenCalled();
    expect(order.calls.filter((call) => call !== "read")).toEqual(["count"]);
  });
});

describe("POST /api/csp-reports: an accepted report is 204 and exactly one reduced line", () => {
  it("answers 204 with no body and no cookie, and writes the one line after the count and the read", async () => {
    const lines = consoleLines();
    countingStore(ALLOWS);

    const response = await POST(reportRequest());

    expect(response.status).toBe(204);
    expect(await bodyTextOf(response)).toBe("");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(lines.error).not.toHaveBeenCalled();
    expect(order.calls.filter((call) => call !== "read")).toEqual([
      "count",
      "log",
    ]);
    expect(order.calls.indexOf("read")).toBeGreaterThan(
      order.calls.indexOf("count"),
    );
    expect(order.calls.indexOf("read")).toBeLessThan(
      order.calls.indexOf("log"),
    );
  });

  it("writes the line `[csp]` with the event and the reduced record, and no other key", async () => {
    const lines = consoleLines();

    await POST(reportRequest());

    expect(lines.warn.mock.calls).toEqual([
      [
        "[csp]",
        JSON.stringify({
          event: "csp-violation",
          directive: "script-src-elem",
          blocked: "inline",
          source: "self",
          line: 1,
          page: "/[locale]/s/[token]",
          locale: "ro",
          origin: "own",
          disposition: "enforce",
          status: 200,
        }),
      ],
    ]);
  });

  it.each([
    ["accepted report", () => POST(reportRequest()), "warn"],
    [
      "unavailable cause",
      async () => {
        countingStore(FAILS);
        return (await freshRoute())(reportRequest());
      },
      "error",
    ],
    [
      "limited refusal",
      async () => {
        countingStore(REFUSES);
        return (await freshRoute())(reportRequest());
      },
      "warn",
    ],
  ] as const)(
    "writes the %s as the label and one string of JSON on one line, and nothing else",
    async (_label, send, severity) => {
      const lines = consoleLines();

      await send();

      expect(lines[severity]).toHaveBeenCalledTimes(1);
      const { argumentCount, label, text } = loggedLine(
        lines[severity].mock.calls[0],
      );
      expect(argumentCount).toBe(2);
      expect(label).toBe("[csp]");
      expect(text).not.toMatch(/[\r\n]/);
      expect(JSON.parse(text)).toEqual(expect.any(Object));
    },
  );

  it("writes the origin of a report whose document is on another origin as `foreign`, with the page `other` and no source", async () => {
    const lines = consoleLines();
    const forged = {
      ...chromiumReport(),
      "document-uri": `https://forger.example/ro/s/${SHARE_TOKEN}`,
      "source-file": "https://forger.example/_next/static/chunks/a1.js",
    };

    const response = await POST(
      reportRequest({ body: JSON.stringify({ "csp-report": forged }) }),
    );

    expect(response.status).toBe(204);
    const { text } = loggedLine(lines.warn.mock.calls[0]);
    expect(JSON.parse(text)).toMatchObject({
      event: "csp-violation",
      origin: "foreign",
      page: "other",
    });
    expect(JSON.parse(text)).not.toHaveProperty("source");
    expect(text).not.toContain(SHARE_TOKEN);
  });

  it("compares the report's document with the origin the request was sent to, not with a header", async () => {
    const lines = consoleLines();

    await POST(
      reportRequest({
        headers: { origin: "https://forger.example", host: "forger.example" },
      }),
    );

    const { text } = loggedLine(lines.warn.mock.calls[0]);
    expect(JSON.parse(text)).toMatchObject({ origin: "own" });
  });

  it("writes nothing of the report's address, policy, sample, nor of the request's address, agent or cookies", async () => {
    const lines = consoleLines();

    await POST(
      reportRequest({
        headers: {
          cookie: `__Host-lemnaria_visitor=${COOKIE_VALUE}; NEXT_LOCALE=ro`,
          "user-agent": USER_AGENT,
          origin: "https://shop.test",
          referer: `https://shop.test/ro/s/${SHARE_TOKEN}`,
        },
      }),
    );

    const written = [...lines.warn.mock.calls, ...lines.error.mock.calls]
      .map((call) => flattenLogArguments(call))
      .join("\n");
    expect(written).not.toBe("");
    for (const text of FORBIDDEN_TEXTS) expect(written).not.toContain(text);
  });
});

describe("POST /api/csp-reports: the visitor's cookies come with a report and are neither read nor set", () => {
  it("asks the request's headers for the type and the network source and for nothing else, a cookie least", async () => {
    consoleLines();
    const reading = vi.spyOn(Headers.prototype, "get");

    const response = await POST(
      reportRequest({
        headers: { cookie: `__Host-lemnaria_visitor=${COOKIE_VALUE}` },
      }),
    );

    expect(response.status).toBe(204);
    expect(
      new Set(reading.mock.calls.map(([name]) => name.toLowerCase())),
    ).toEqual(new Set(["content-type", "x-forwarded-for"]));
    expect(response.headers.has("set-cookie")).toBe(false);
  });

  it.each([
    ["a refused count", REFUSES, 429],
    ["a count that failed", FAILS, 503],
    ["an accepted report", ALLOWS, 204],
  ])("sets no cookie on %s", async (_label, answer, status) => {
    consoleLines();
    countingStore(answer);

    const response = await POST(
      reportRequest({ headers: { cookie: `a=${COOKIE_VALUE}` } }),
    );

    expect(response.status).toBe(status);
    expect(response.headers.has("set-cookie")).toBe(false);
  });
});

describe("POST /api/csp-reports: over any request, what is counted, read and written follows the order (P4)", () => {
  const TYPES = [
    "application/csp-report",
    "application/csp-report; charset=utf-8",
    "application/json",
    "text/plain",
    null,
  ];
  const BODIES = [
    "valid",
    "not-json",
    "not-a-report",
    "oversized",
    "broken",
  ] as const;
  const LIMITERS = ["allow", "refuse", "fail"] as const;
  const ANSWERS = { allow: ALLOWS, refuse: REFUSES, fail: FAILS };

  function bodyFor(kind: (typeof BODIES)[number], probe: BodyProbe) {
    if (kind === "broken") return brokenBody(probe);
    const texts = {
      valid: VALID_BODY,
      "not-json": "<<<",
      "not-a-report": '{"csp-report":3}',
      oversized: validBodyOfBytes(BODY_BOUND_BYTES + 1),
    };
    return texts[kind];
  }

  function expectedStatus(
    isReportType: boolean,
    limiter: (typeof LIMITERS)[number],
    body: (typeof BODIES)[number],
  ): number {
    if (!isReportType) return 415;
    if (limiter === "fail") return 503;
    if (limiter === "refuse") return 429;
    if (body === "oversized") return 413;
    return body === "valid" ? 204 : 400;
  }

  it("counts only a request of the report type, reads only one that was allowed, and writes one line only for a 204, a first 503 or a first 429", async () => {
    const route = await freshRoute();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOON);
    let hasWrittenUnavailable = false;
    let hasWrittenLimited = false;

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...TYPES),
        fc.constantFrom(...LIMITERS),
        fc.constantFrom(...BODIES),
        async (contentType, limiter, body) => {
          order.calls.length = 0;
          const lines = consoleLines();
          const store = countingStore(ANSWERS[limiter]);
          const probe = { reads: 0 };
          const isReportType =
            contentType?.startsWith("application/csp-report") === true;

          const response = await route(
            reportRequest({ contentType, body: bodyFor(body, probe), probe }),
          );

          const isFirstUnavailable =
            response.status === 503 && !hasWrittenUnavailable;
          const isFirstLimited = response.status === 429 && !hasWrittenLimited;
          hasWrittenUnavailable ||= response.status === 503;
          hasWrittenLimited ||= response.status === 429;
          expect(response.status).toBe(
            expectedStatus(isReportType, limiter, body),
          );
          expect(store).toHaveBeenCalledTimes(isReportType ? 1 : 0);
          expect(probe.reads > 0).toBe(isReportType && limiter === "allow");
          expect(lines.warn).toHaveBeenCalledTimes(
            response.status === 204 || isFirstLimited ? 1 : 0,
          );
          expect(lines.error).toHaveBeenCalledTimes(isFirstUnavailable ? 1 : 0);
          vi.restoreAllMocks();
        },
      ),
      { numRuns: 150 },
    );
  });
});

/** The bucket's key, made from the encoding the digest module documents and not by it: each part as its byte count, a
 *  colon, the part and a comma, the purpose first, under HMAC-SHA-256 with the secret's bytes. */
function keyOfBlock(subject: string): string {
  const parts = [
    "rate-limit-bucket",
    "csp-report-by-block-per-60-utc-minutes",
    "ipv4-block",
    subject,
  ];
  const encoding = parts
    .map((part) => `${String(Buffer.byteLength(part))}:${part},`)
    .join("");
  return createHmac("sha256", Buffer.from(FAKE_SECRET, "hex"))
    .update(encoding, "utf8")
    .digest("hex");
}
