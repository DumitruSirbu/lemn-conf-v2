/* eslint-disable @typescript-eslint/prefer-promise-reject-errors, @typescript-eslint/only-throw-error -- a store may reject or throw anything at all, and that is what these cases are for. */
import { fc } from "@fast-check/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UNSTORED_CAUSES } from "@/lib/server/csp/csp-report-log";
import { getCspReportStore } from "@/lib/server/csp/csp-report-store-instance";
import { RATE_LIMIT_DEADLINE_MS } from "@/lib/server/rate-limit/enforce-rate-limit";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { getRateLimitStore } from "@/lib/server/rate-limit/rate-limit-store-instance";
import { CSP_REPORT_PATH } from "@/lib/security-headers";

/**
 * Wave 8Q2, QA's attack on the sink's write (criteria 8 to 11, 14), through the real route and the real limiter with the
 * persistence fake as the report table (the shared setup). Where the developer's route tests pick one failure of each
 * kind, these sweep: every thing a store can do wrong at the moment it is wrong, the deadline either side of its
 * boundary, whether anything outlives the request, a burst of concurrent reports, and whether a planted value can reach
 * a store argument, a line or an answer by any failure path.
 */
const FAKE_SECRET =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const A_NETWORK = "192.0.2.88";
const REPORT_STORED_AT_THE_DEADLINE_MS = RATE_LIMIT_DEADLINE_MS;

type Route = typeof import("../../../../src/app/api/csp-reports/route").POST;

function aReport(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    "csp-report": {
      "document-uri": "https://shop.test/ro/s/Zq7ShareToken0123456789",
      "violated-directive": "script-src-elem",
      "effective-directive": "script-src-elem",
      disposition: "enforce",
      "blocked-uri": "inline",
      "line-number": 1,
      "source-file": "https://shop.test/ro/s/Zq7ShareToken0123456789",
      "status-code": 200,
      ...overrides,
    },
  });
}

function reportRequest(
  body: string = aReport(),
  headers: Record<string, string> = {},
): Request {
  return new Request(`https://shop.test${CSP_REPORT_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/csp-report",
      "x-forwarded-for": A_NETWORK,
      ...headers,
    },
    body,
    duplex: "half",
  } as RequestInit);
}

/** Every call the console received, in order, each as the kind and what it was handed. */
function recordConsole() {
  const calls: { kind: "warn" | "error"; text: string }[] = [];
  const noteAs =
    (kind: "warn" | "error") =>
    (...printed: unknown[]) => {
      calls.push({ kind, text: printed.map(String).join(" ") });
    };
  vi.spyOn(console, "warn").mockImplementation(noteAs("warn"));
  vi.spyOn(console, "error").mockImplementation(noteAs("error"));
  return calls;
}

function theStoreDoes(behaviour: (row: unknown) => unknown) {
  return vi
    .spyOn(getCspReportStore(), "recordReport")
    .mockImplementation((row) => behaviour(row) as Promise<void>);
}

async function freshRoute(): Promise<Route> {
  vi.resetModules();
  return (await import("../../../../src/app/api/csp-reports/route")).POST;
}

function unstoredLinesIn(
  calls: readonly { kind: string; text: string }[],
): Record<string, unknown>[] {
  return calls
    .filter((call) => call.text.includes("csp-report-unstored"))
    .map(
      (call) =>
        JSON.parse(call.text.replace(/^\[csp\] /, "")) as Record<
          string,
          unknown
        >,
    );
}

beforeEach(() => {
  vi.stubEnv("DIGEST_SECRET", FAKE_SECRET);
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  vi.stubEnv("LEMNARIA_E2E_RATE_LIMIT_POLICY", undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("the deadline, either side of its boundary (criterion 10)", () => {
  async function answerWhenTheStoreTakes(
    storeDurationMs: number,
    advanceByMs: number,
  ) {
    const calls = recordConsole();
    let hasReachedStore = (): void => undefined;
    const reached = new Promise<void>((resolve) => {
      hasReachedStore = resolve;
    });
    theStoreDoes(() => {
      hasReachedStore();
      return new Promise<void>((resolve) =>
        setTimeout(resolve, storeDurationMs),
      );
    });
    const route = await freshRoute();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const answer = route(reportRequest());
    await reached;
    await vi.advanceTimersByTimeAsync(advanceByMs);
    const response = await answer;
    return { response, calls };
  }

  it("keeps the report, with no unstored line, when the store answers one millisecond before the deadline", async () => {
    const { response, calls } = await answerWhenTheStoreTakes(
      REPORT_STORED_AT_THE_DEADLINE_MS - 1,
      REPORT_STORED_AT_THE_DEADLINE_MS - 1,
    );

    expect(response.status).toBe(204);
    expect(unstoredLinesIn(calls)).toEqual([]);
  });

  it("writes the deadline line, and still answers 204, when the store answers one millisecond after it", async () => {
    const { response, calls } = await answerWhenTheStoreTakes(
      REPORT_STORED_AT_THE_DEADLINE_MS + 1,
      REPORT_STORED_AT_THE_DEADLINE_MS,
    );

    expect(response.status).toBe(204);
    expect(unstoredLinesIn(calls)).toEqual([
      { event: "csp-report-unstored", cause: "deadline" },
    ]);
  });

  it("writes no second line when the store gives up, or answers, after the deadline has already been written", async () => {
    for (const lateEnding of ["rejects", "resolves"] as const) {
      const calls = recordConsole();
      let finish = (): void => undefined;
      let hasReachedStore = (): void => undefined;
      const reached = new Promise<void>((resolve) => {
        hasReachedStore = resolve;
      });
      theStoreDoes(() => {
        hasReachedStore();
        return new Promise<void>((resolve, reject) => {
          finish =
            lateEnding === "rejects"
              ? () => {
                  reject(new Error("late"));
                }
              : resolve;
        });
      });
      const route = await freshRoute();
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

      const answer = route(reportRequest());
      await reached;
      await vi.advanceTimersByTimeAsync(REPORT_STORED_AT_THE_DEADLINE_MS);
      await answer;
      const linesAtTheDeadline = calls.length;
      finish();
      await vi.advanceTimersByTimeAsync(REPORT_STORED_AT_THE_DEADLINE_MS * 3);

      expect(calls, `a store that ${lateEnding} late`).toHaveLength(
        linesAtTheDeadline,
      );
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });

  it("leaves no timer behind when the store answers promptly, or fails promptly, so nothing outlives the request", async () => {
    for (const behaviour of [
      () => Promise.resolve(),
      () => Promise.reject(new Error("down")),
      () => {
        throw new Error("down at once");
      },
    ]) {
      recordConsole();
      theStoreDoes(behaviour);
      const route = await freshRoute();
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

      const response = await route(reportRequest());

      expect(response.status).toBe(204);
      expect(vi.getTimerCount(), "timers pending after the answer").toBe(0);
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });

  it("starts the deadline once the store is called and not before: a slow body does not shorten the store's wait", async () => {
    recordConsole();
    let calledAt = -1;
    theStoreDoes(() => {
      calledAt = Date.now();
      return new Promise<void>((resolve) => setTimeout(resolve, 100));
    });
    const route = await freshRoute();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });

    const answer = route(reportRequest());
    await vi.advanceTimersByTimeAsync(RATE_LIMIT_DEADLINE_MS - 100);
    await vi.advanceTimersByTimeAsync(100);
    const response = await answer;

    expect(response.status).toBe(204);
    expect(calledAt).toBeGreaterThanOrEqual(0);
  });
});

describe("whatever a store does, the browser is told the same thing (criterion 10)", () => {
  const BEHAVIOURS: readonly [string, () => unknown][] = [
    ["resolves", () => Promise.resolve()],
    ["rejects with an Error", () => Promise.reject(new Error("down"))],
    ["rejects with a string", () => Promise.reject("down")],
    ["rejects with undefined", () => Promise.reject(undefined)],
    ["rejects with null", () => Promise.reject(null)],
    ["rejects with an object", () => Promise.reject({ code: "42P01" })],
    [
      "throws an Error at once",
      () => {
        throw new Error("down");
      },
    ],
    [
      "throws a string at once",
      () => {
        throw "down";
      },
    ],
    [
      "throws an object whose text cannot be read",
      () => {
        throw {
          toString() {
            throw new Error("no text");
          },
        };
      },
    ],
    [
      "returns a thenable that throws when asked to resolve",
      () => ({
        then() {
          throw new Error("hostile thenable");
        },
      }),
    ],
    [
      "returns a thenable that resolves twice",
      () => ({
        then(resolve: () => void) {
          resolve();
          resolve();
        },
      }),
    ],
    [
      "returns a thenable that rejects after resolving",
      () => ({
        then(resolve: () => void, reject: (reason: unknown) => void) {
          resolve();
          reject(new Error("too late"));
        },
      }),
    ],
    ["returns nothing at all", () => undefined],
    ["returns a value that is not a promise", () => 42],
  ];

  it.each(BEHAVIOURS)(
    "answers the 204 a healthy store gets, byte for byte, when the store %s",
    async (_label, behaviour) => {
      recordConsole();
      theStoreDoes(() => Promise.resolve());
      const healthy = await (await freshRoute())(reportRequest());
      vi.restoreAllMocks();
      const calls = recordConsole();
      theStoreDoes(behaviour);

      const response = await (await freshRoute())(reportRequest());

      expect(response.status).toBe(204);
      expect(await response.text()).toBe("");
      expect(Object.fromEntries(response.headers)).toEqual(
        Object.fromEntries(healthy.headers),
      );
      expect(response.headers.has("set-cookie")).toBe(false);
      for (const line of unstoredLinesIn(calls)) {
        expect(Object.keys(line).sort()).toEqual(["cause", "event"]);
        expect(UNSTORED_CAUSES).toContain(line.cause);
      }
    },
  );

  it("never leaves an unhandled rejection behind, whichever way the store ends", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      for (const [, behaviour] of BEHAVIOURS) {
        recordConsole();
        theStoreDoes(behaviour);
        await (
          await freshRoute()
        )(reportRequest());
        vi.restoreAllMocks();
      }
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      process.off("unhandledRejection", unhandled);
    }

    expect(unhandled).not.toHaveBeenCalled();
  });

  it("reveals nothing a failure carried: no store argument, line or answer holds a planted text, over arbitrary failures", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[A-Za-z0-9]{10,24}$/),
        fc.constantFrom("reject", "throw", "reject-object", "throw-object"),
        async (secret, how) => {
          const planted = `Zq7Fail${secret}`;
          const calls = recordConsole();
          theStoreDoes(() => {
            const error = Object.assign(
              new Error(`postgres://owner:${planted}@db.example/neondb`),
              { detail: planted, code: planted },
            );
            if (how === "reject") return Promise.reject(error);
            if (how === "reject-object") return Promise.reject({ planted });
            if (how === "throw") throw error;
            throw { planted };
          });

          const response = await (await freshRoute())(reportRequest());

          expect(response.status).toBe(204);
          expect(JSON.stringify(calls)).not.toContain(planted);
          expect(await response.text()).not.toContain(planted);
          expect(JSON.stringify([...response.headers])).not.toContain(planted);
          expect(unstoredLinesIn(calls)).toEqual([
            { event: "csp-report-unstored", cause: "store-failed" },
          ]);
          vi.restoreAllMocks();
        },
      ),
      { numRuns: 40 },
    );
  });

  it("writes the unstored line once for each cause in one process, whatever order the causes arrive in", async () => {
    const calls = recordConsole();
    const route = await freshRoute();
    const failing = theStoreDoes(() => Promise.reject(new Error("down")));

    await route(reportRequest());
    await route(reportRequest());
    failing.mockImplementation(() => new Promise<void>(() => undefined));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const first = route(reportRequest());
    await vi.advanceTimersByTimeAsync(REPORT_STORED_AT_THE_DEADLINE_MS);
    await first;
    const second = route(reportRequest());
    await vi.advanceTimersByTimeAsync(REPORT_STORED_AT_THE_DEADLINE_MS);
    await second;
    vi.useRealTimers();
    failing.mockImplementation(() => Promise.reject(new Error("down again")));
    await route(reportRequest());

    expect(unstoredLinesIn(calls)).toEqual([
      { event: "csp-report-unstored", cause: "store-failed" },
      { event: "csp-report-unstored", cause: "deadline" },
    ]);
  });

  it("writes the violation line before the store is called, and the unstored line after, even for a store that throws at once", async () => {
    const order: string[] = [];
    vi.spyOn(console, "warn").mockImplementation(() => {
      order.push("violation");
    });
    vi.spyOn(console, "error").mockImplementation(() => {
      order.push("unstored");
    });
    theStoreDoes(() => {
      order.push("store");
      throw new Error("down at once");
    });

    await (
      await freshRoute()
    )(reportRequest());

    expect(order).toEqual(["violation", "store", "unstored"]);
  });
});

describe("a burst of reports (criterion 9)", () => {
  it("stores each accepted report once, under distinct numbers, and writes one violation line for each", async () => {
    const calls = recordConsole();
    const fake = getCspReportStore() as unknown as {
      heldReports(): readonly { reportNumber: number; writerMark: string }[];
      reportsEverStored(): number;
    };
    const route = await freshRoute();
    const reports = 40;

    const answers = await Promise.all(
      Array.from({ length: reports }, (_, index) =>
        route(reportRequest(aReport({ "line-number": index }))),
      ),
    );

    expect(answers.map((answer) => answer.status)).toEqual(
      Array(reports).fill(204),
    );
    expect(fake.reportsEverStored()).toBe(reports);
    expect(fake.heldReports().map((held) => held.reportNumber)).toEqual(
      Array.from({ length: reports }, (_, index) => index + 1),
    );
    expect(
      new Set(fake.heldReports().map((held) => held.writerMark)).size,
    ).toBe(1);
    expect(calls.filter((call) => call.kind === "warn")).toHaveLength(reports);
  });

  it("writes one unstored line for a burst of failures, not one for each", async () => {
    const calls = recordConsole();
    theStoreDoes(() => Promise.reject(new Error("down")));
    const route = await freshRoute();

    await Promise.all(Array.from({ length: 40 }, () => route(reportRequest())));

    expect(unstoredLinesIn(calls)).toHaveLength(1);
    expect(calls.filter((call) => call.kind === "warn")).toHaveLength(40);
  });
});

describe("nothing a request carries but the reduction reaches a store or a line (criterion 11)", () => {
  it("holds for a planted value in every dropped field and header, over every line and the answer as well as the store's argument", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[A-Za-z0-9]{12,24}$/),
        async (suffix) => {
          const planted = `Zq7${suffix}`;
          const calls = recordConsole();
          const store = theStoreDoes(() => Promise.resolve());
          const body = aReport({
            "document-uri": `https://shop.test/ro/d/${planted}/review?q=${planted}#${planted}`,
            "source-file": `https://shop.test/_next/static/chunks/a.js?v=${planted}`,
            "blocked-uri": `https://user:${planted}@evil.example/${planted}?${planted}#${planted}`,
            referrer: `https://elsewhere.example/${planted}`,
            "script-sample": planted,
            "original-policy": `script-src 'nonce-${planted}'`,
            "effective-directive": `script-src-elem ${planted}`,
            [`unknown-${planted}`]: planted,
            "line-number": 7,
          });

          const response = await (
            await freshRoute()
          )(
            reportRequest(body, {
              cookie: `__Host-visitor=${planted}`,
              "user-agent": `Agent/${planted}`,
              origin: `https://${planted}.example`,
              referer: `https://${planted}.example/`,
              "x-forwarded-for": "198.51.100.23",
            }),
          );

          expect(response.status).toBe(204);
          expect(store).toHaveBeenCalledTimes(1);
          const everything = JSON.stringify([
            store.mock.calls,
            calls,
            [...response.headers],
          ]);
          expect(everything).not.toContain(planted);
          expect(everything).not.toContain("198.51.100.23");
          vi.restoreAllMocks();
        },
      ),
      { numRuns: 40 },
    );
  });

  it("stores a row whose keys are exactly the reduction's and the mark, for any accepted body", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.dictionary(
          fc.string({ maxLength: 12 }),
          fc.jsonValue({ maxDepth: 2 }),
          { maxKeys: 8 },
        ),
        async (extraFields) => {
          recordConsole();
          const store = theStoreDoes(() => Promise.resolve());

          const response = await (
            await freshRoute()
          )(reportRequest(aReport(extraFields)));

          if (response.status !== 204) {
            expect(store).not.toHaveBeenCalled();
            return;
          }
          for (const [row] of store.mock.calls) {
            expect(
              Object.keys(row).filter(
                (key) =>
                  ![
                    "directive",
                    "blocked",
                    "source",
                    "line",
                    "column",
                    "page",
                    "locale",
                    "origin",
                    "disposition",
                    "status",
                    "writerMark",
                  ].includes(key),
              ),
            ).toEqual([]);
            expect(
              Object.values(row).filter((value) => value === null),
            ).toEqual([]);
          }
          vi.restoreAllMocks();
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe("a refusal stores nothing and writes no unstored line (criterion 8)", () => {
  it("holds for every media type, body and header combination the route refuses, sampled widely", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          "text/plain",
          "application/json",
          "application/csp-reportx",
          "application/reports+json",
          "",
          "application/csp-report;",
          "  APPLICATION/CSP-REPORT ; charset=utf-8",
        ),
        fc.oneof(
          fc.string({ maxLength: 40 }),
          fc.constantFrom(
            "{}",
            "null",
            "[]",
            '{"csp-report":[]}',
            '{"csp-report":null}',
            "x".repeat(8193),
          ),
        ),
        async (contentType, body) => {
          const calls = recordConsole();
          const store = theStoreDoes(() => Promise.resolve());

          const response = await (
            await freshRoute()
          )(
            new Request(`https://shop.test${CSP_REPORT_PATH}`, {
              method: "POST",
              headers: {
                "content-type": contentType,
                "x-forwarded-for": A_NETWORK,
              },
              body,
            }),
          );

          if (response.status === 204) {
            expect(store).toHaveBeenCalledTimes(1);
          } else {
            expect(store).not.toHaveBeenCalled();
            expect(unstoredLinesIn(calls)).toEqual([]);
            expect(
              calls.filter((call) => call.text.includes("csp-violation")),
            ).toEqual([]);
          }
          vi.restoreAllMocks();
        },
      ),
      { numRuns: 120 },
    );
  });
});

describe("a secret that cannot make the mark (criterion 13)", () => {
  it.each([
    ["unset", undefined],
    ["empty", ""],
    ["not hexadecimal", "zz".repeat(32)],
    ["upper-case hexadecimal", "AB".repeat(32)],
    ["one byte short", "ab".repeat(31)],
    ["one byte long", "ab".repeat(33)],
    ["a line feed after good hex", `${"ab".repeat(32)}\n`],
  ])(
    "stores nothing and answers no 204 when DIGEST_SECRET is %s, because the limiter has already refused",
    async (_label, secret) => {
      recordConsole();
      const store = theStoreDoes(() => Promise.resolve());
      vi.stubEnv("DIGEST_SECRET", secret);

      const response = await (await freshRoute())(reportRequest());

      expect(response.status).not.toBe(204);
      expect(store).not.toHaveBeenCalled();
    },
  );

  it("is one mark for one secret over a run of reports, and a different one after the secret changes mid-process", async () => {
    recordConsole();
    const store = theStoreDoes(() => Promise.resolve());
    const route = await freshRoute();

    await route(reportRequest());
    await route(reportRequest());
    vi.stubEnv("DIGEST_SECRET", "ff".repeat(32));
    await route(reportRequest());

    const marks = store.mock.calls.map(
      ([row]) => (row as { writerMark: string }).writerMark,
    );
    expect(marks[0]).toBe(marks[1]);
    expect(marks[2]).not.toBe(marks[0]);
    expect(marks.every((mark) => /^[0-9a-f]{64}$/.test(mark))).toBe(true);
    expect(marks.join("")).not.toContain(FAKE_SECRET);
  });
});

describe("the limiter's count is made before the report is read and the store is reached last (criterion 8)", () => {
  it("does not count a second time for the store: one counter write for one accepted report", async () => {
    recordConsole();
    theStoreDoes(() => Promise.resolve());
    const counting = vi.spyOn(getRateLimitStore(), "recordHits");

    await (
      await freshRoute()
    )(reportRequest());

    expect(counting).toHaveBeenCalledTimes(1);
  });
});
