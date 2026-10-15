import { createHmac } from "node:crypto";

import { fc } from "@fast-check/vitest";
import { CspReportStoreError } from "@lemnaria/persistence";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getCspReportStore } from "@/lib/server/csp/csp-report-store-instance";
import { RATE_LIMIT_DEADLINE_MS } from "@/lib/server/rate-limit/enforce-rate-limit";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { getRateLimitStore } from "@/lib/server/rate-limit/rate-limit-store-instance";
import { CSP_REPORT_PATH } from "@/lib/security-headers";

/**
 * `POST /api/csp-reports` through the real route and the real limiter, with the persistence package's fake in place of
 * the report table (the shared setup). What a test looks at is whether the store was reached, with what, in which
 * order, and that whatever the store does the browser is answered the same `204`. Nothing here sees a real database: a
 * database failure is the error the store raises for it (see `neon-csp-report-store.driver.test.ts`).
 */
const FAKE_SECRET =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const A_NETWORK = "192.0.2.77";
const STORE_FAILURE_TEXT = "postgres://owner:Zq7DriverSecret@db.example/neondb";
const BODY_BOUND_BYTES = 8 * 1024;

const order = vi.hoisted(() => ({ calls: [] as string[] }));

const { POST } = await import("../../../../src/app/api/csp-reports/route");

function chromiumReport(): Record<string, unknown> {
  const documentUri = "https://shop.test/ro/s/Zq7ShareToken0123456789";
  return {
    "document-uri": documentUri,
    "violated-directive": "script-src-elem",
    "effective-directive": "script-src-elem",
    disposition: "enforce",
    "blocked-uri": "inline",
    "line-number": 1,
    "source-file": documentUri,
    "status-code": 200,
  };
}

const VALID_BODY = JSON.stringify({ "csp-report": chromiumReport() });

/** What the report above reduces to, and what the store must be handed beside the writer mark. */
const REDUCED_RECORD = {
  directive: "script-src-elem",
  blocked: "inline",
  source: "self",
  line: 1,
  page: "/[locale]/s/[token]",
  locale: "ro",
  origin: "own",
  disposition: "enforce",
  status: 200,
};

function reportRequest({
  contentType = "application/csp-report",
  body = VALID_BODY,
  headers = {},
}: {
  readonly contentType?: string;
  readonly body?: string | ReadableStream<Uint8Array>;
  readonly headers?: Record<string, string>;
} = {}): Request {
  return new Request(`https://shop.test${CSP_REPORT_PATH}`, {
    method: "POST",
    headers: {
      "content-type": contentType,
      "x-forwarded-for": A_NETWORK,
      ...headers,
    },
    body,
    duplex: "half",
  } as RequestInit);
}

function brokenBody(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.error(new Error("the connection was reset"));
    },
  });
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

/** The report store the route reaches, with every call noted in `order`; `behaviour` is what the call does. */
function storeThat(behaviour: () => Promise<void>) {
  return vi
    .spyOn(getCspReportStore(), "recordReport")
    .mockImplementation(() => {
      order.calls.push("store");
      return behaviour();
    });
}

function countingStore(answer: () => Promise<number[]>) {
  return vi.spyOn(getRateLimitStore(), "recordHits").mockImplementation(() => {
    order.calls.push("count");
    return answer();
  });
}

const ALLOWS = () => Promise.resolve([1]);
const REFUSES = () => Promise.resolve([101]);
const FAILS = () => Promise.reject(new Error("the counter store is down"));
const STORES = () => Promise.resolve();

/** The writer mark made from the encoding the digest module documents and not by it: each part as its byte count, a
 *  colon, the part and a comma, the purpose first, under HMAC-SHA-256 with the secret's bytes. */
function writerMarkUnder(secret: string): string {
  const encoding = ["csp-report-writer", "csp_reports"]
    .map((part) => `${String(Buffer.byteLength(part))}:${part},`)
    .join("");
  return createHmac("sha256", Buffer.from(secret, "hex"))
    .update(encoding, "utf8")
    .digest("hex");
}

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

/** The route from a module graph of its own: its unstored line is written once for a process and a cause. */
async function freshRoute(): Promise<typeof POST> {
  vi.resetModules();
  return (await import("../../../../src/app/api/csp-reports/route")).POST;
}

describe("POST /api/csp-reports: an accepted report is kept once, after its line (criterion 9)", () => {
  it("hands the store exactly the reduced record and the writer mark, once, after the line is written", async () => {
    const lines = consoleLines();
    const store = storeThat(STORES);

    const response = await POST(reportRequest());

    expect(response.status).toBe(204);
    expect(store.mock.calls).toEqual([
      [{ ...REDUCED_RECORD, writerMark: writerMarkUnder(FAKE_SECRET) }],
    ]);
    expect(lines.warn).toHaveBeenCalledTimes(1);
    expect(lines.error).not.toHaveBeenCalled();
    expect(order.calls).toEqual(["log", "store"]);
  });

  it("counts, then reads, then writes the line, then stores", async () => {
    consoleLines();
    countingStore(ALLOWS);
    storeThat(STORES);

    await POST(reportRequest());

    expect(order.calls).toEqual(["count", "log", "store"]);
  });

  it("keeps the report in the table the fake holds, under the mark and in the first slot after the cursor", async () => {
    consoleLines();
    const fake = getCspReportStore() as unknown as {
      heldReports(): readonly { writerMark: string; reportNumber: number }[];
    };

    await POST(reportRequest());

    expect(fake.heldReports()).toMatchObject([
      { writerMark: writerMarkUnder(FAKE_SECRET), reportNumber: 1 },
    ]);
  });

  it("carries one mark for one secret and another mark for another", async () => {
    consoleLines();
    const store = storeThat(STORES);
    const otherSecret = "ff".repeat(32);

    await POST(reportRequest());
    await POST(reportRequest());
    vi.stubEnv("DIGEST_SECRET", otherSecret);
    await POST(reportRequest());

    const marks = store.mock.calls.map(([row]) => row.writerMark);
    expect(marks[0]).toBe(marks[1]);
    expect(marks[2]).not.toBe(marks[0]);
    expect(marks[2]).toBe(writerMarkUnder(otherSecret));
  });
});

describe("POST /api/csp-reports: a refusal stores nothing (criterion 8)", () => {
  it.each([
    [
      "415, a wrong type",
      () => reportRequest({ contentType: "text/plain" }),
      415,
    ],
    [
      "413, a body over the bound",
      () => reportRequest({ body: "x".repeat(BODY_BOUND_BYTES + 1) }),
      413,
    ],
    [
      "400, a stream that broke",
      () => reportRequest({ body: brokenBody() }),
      400,
    ],
    ["400, text that is not JSON", () => reportRequest({ body: "<<<" }), 400],
    ["400, JSON with no csp-report", () => reportRequest({ body: "{}" }), 400],
  ])("answers %s with no store call", async (_label, request, status) => {
    consoleLines();
    countingStore(ALLOWS);
    const store = storeThat(STORES);

    const response = await POST(request());

    expect(response.status).toBe(status);
    expect(store).not.toHaveBeenCalled();
  });

  it.each([
    ["429, a refused count", REFUSES, 429],
    ["503, a count that failed", FAILS, 503],
  ])("answers %s with no store call", async (_label, answer, status) => {
    consoleLines();
    countingStore(answer);
    const store = storeThat(STORES);

    const response = await (await freshRoute())(reportRequest());

    expect(response.status).toBe(status);
    expect(store).not.toHaveBeenCalled();
  });

  it("calls the store exactly when the answer is 204, over any type, limiter and body", async () => {
    const route = await freshRoute();
    const bodies = [VALID_BODY, "<<<", '{"csp-report":3}', "x".repeat(9000)];
    const answers = [ALLOWS, REFUSES, FAILS];

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("application/csp-report", "text/plain"),
        fc.constantFrom(...answers),
        fc.constantFrom(...bodies),
        async (contentType, answer, body) => {
          consoleLines();
          countingStore(answer);
          const store = storeThat(STORES);

          const response = await route(reportRequest({ contentType, body }));

          expect(store).toHaveBeenCalledTimes(response.status === 204 ? 1 : 0);
          vi.restoreAllMocks();
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe("POST /api/csp-reports: a store that fails changes nothing a browser sees (criterion 10)", () => {
  const driverError = (code: string) =>
    new CspReportStoreError("record a report", {
      cause: { name: "Error", code },
    });

  async function answerOfAKeptReport(): Promise<Response> {
    consoleLines();
    storeThat(STORES);
    return POST(reportRequest());
  }

  it.each([
    [
      "rejects with an error carrying 42P01, the table missing",
      () => Promise.reject(driverError("42P01")),
      "store-failed",
    ],
    [
      "rejects with an error carrying 42501, the grant missing",
      () => Promise.reject(driverError("42501")),
      "store-failed",
    ],
    [
      "rejects with text of its own",
      () => Promise.reject(new Error(STORE_FAILURE_TEXT)),
      "store-failed",
    ],
    [
      "throws before it returns a promise",
      () => {
        throw new Error(STORE_FAILURE_TEXT);
      },
      "store-failed",
    ],
  ])(
    "answers the same 204 when the store %s, with one unstored line naming the cause and nothing of the error",
    async (_label, behaviour, cause) => {
      const kept = await answerOfAKeptReport();
      vi.restoreAllMocks();
      const lines = consoleLines();
      storeThat(behaviour);

      const response = await (await freshRoute())(reportRequest());

      expect(response.status).toBe(204);
      expect(await response.text()).toBe("");
      expect(Object.fromEntries(response.headers)).toEqual(
        Object.fromEntries(kept.headers),
      );
      expect(lines.warn).toHaveBeenCalledTimes(1);
      expect(lines.error.mock.calls).toEqual([
        ["[csp]", JSON.stringify({ event: "csp-report-unstored", cause })],
      ]);
      expect(JSON.stringify(lines.error.mock.calls)).not.toContain("Zq7");
    },
  );

  it("writes the unstored line once for a process and a cause, however many reports the store fails to keep", async () => {
    const lines = consoleLines();
    storeThat(() => Promise.reject(driverError("42P01")));
    const route = await freshRoute();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await route(reportRequest())).status).toBe(204);
    }

    expect(lines.error).toHaveBeenCalledTimes(1);
    expect(lines.warn).toHaveBeenCalledTimes(5);
  });

  it("does not repeat a store call that failed", async () => {
    consoleLines();
    const store = storeThat(() => Promise.reject(driverError("42P01")));

    await POST(reportRequest());

    expect(store).toHaveBeenCalledTimes(1);
  });

  describe("a store that never answers", () => {
    it("is waited for the limiter's deadline and not a moment longer, then the answer is 204 and the line says deadline", async () => {
      const lines = consoleLines();
      let reachedStore = (): void => undefined;
      const hasReachedStore = new Promise<void>((resolve) => {
        reachedStore = resolve;
      });
      storeThat(() => {
        reachedStore();
        return new Promise<void>(() => undefined);
      });
      const route = await freshRoute();
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      let isAnswered = false;

      const answer = route(reportRequest()).then((response) => {
        isAnswered = true;
        return response;
      });
      await hasReachedStore;
      await vi.advanceTimersByTimeAsync(RATE_LIMIT_DEADLINE_MS - 1);
      expect(isAnswered).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const response = await answer;

      expect(response.status).toBe(204);
      expect(await response.text()).toBe("");
      expect(lines.error.mock.calls).toEqual([
        [
          "[csp]",
          JSON.stringify({ event: "csp-report-unstored", cause: "deadline" }),
        ],
      ]);
    });

    it("leaves no unhandled rejection when the store gives up after the deadline", async () => {
      consoleLines();
      let giveUp = (): void => undefined;
      let reachedStore = (): void => undefined;
      const hasReachedStore = new Promise<void>((resolve) => {
        reachedStore = resolve;
      });
      storeThat(() => {
        reachedStore();
        return new Promise<void>((_resolve, reject) => {
          giveUp = () => {
            reject(new Error(STORE_FAILURE_TEXT));
          };
        });
      });
      const unhandled = vi.fn();
      process.on("unhandledRejection", unhandled);
      const route = await freshRoute();
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

      const answer = route(reportRequest());
      await hasReachedStore;
      await vi.advanceTimersByTimeAsync(RATE_LIMIT_DEADLINE_MS);
      await answer;
      giveUp();
      vi.useRealTimers();
      await new Promise((resolve) => setImmediate(resolve));
      process.off("unhandledRejection", unhandled);

      expect(unhandled).not.toHaveBeenCalled();
    });
  });
});

describe("POST /api/csp-reports: nothing from the request but the reduction reaches the store (criterion 11)", () => {
  it("hands over none of what a report, its headers or its cookies carry beyond the reduced fields", async () => {
    consoleLines();
    const store = storeThat(STORES);

    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[A-Za-z0-9]{8,20}$/),
        async (planted) => {
          const secret = `Zq7${planted}`;
          const body = JSON.stringify({
            "csp-report": {
              ...chromiumReport(),
              "document-uri": `https://shop.test/ro/s/${secret}?q=${secret}#${secret}`,
              "source-file": `https://shop.test/ro/d/${secret}?q=${secret}`,
              referrer: `https://elsewhere.example/${secret}`,
              "script-sample": secret,
              "original-policy": `script-src 'nonce-${secret}'`,
              [`unknown-${secret}`]: secret,
            },
          });
          store.mockClear();

          await POST(
            reportRequest({
              body,
              headers: {
                cookie: `__Host-visitor=${secret}`,
                "user-agent": `Agent/${secret}`,
              },
            }),
          );

          expect(store).toHaveBeenCalledTimes(1);
          expect(JSON.stringify(store.mock.calls)).not.toContain(secret);
          expect(JSON.stringify(store.mock.calls)).not.toContain(A_NETWORK);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("asks the request's headers for the type and the network source and for nothing else, the mark from none", async () => {
    consoleLines();
    storeThat(STORES);
    const reading = vi.spyOn(Headers.prototype, "get");

    const response = await POST(
      reportRequest({ headers: { cookie: "a=Zq7Cookie" } }),
    );

    expect(response.status).toBe(204);
    expect(
      new Set(reading.mock.calls.map(([name]) => name.toLowerCase())),
    ).toEqual(new Set(["content-type", "x-forwarded-for"]));
    expect(response.headers.has("set-cookie")).toBe(false);
  });
});
