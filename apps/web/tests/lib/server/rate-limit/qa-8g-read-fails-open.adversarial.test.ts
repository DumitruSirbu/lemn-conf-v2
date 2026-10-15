// A read is served whenever its judgement cannot be made, including when the judgement itself throws before
// anything is counted: through the judge, the route's refusal and the page's refusal alike, with one line for
// the process that holds nothing of what was thrown.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { everyReadingOf } from "../mail/qa-8j-support";
import {
  consoleCallsOf,
  spyOnEveryConsoleMethod,
} from "../mail/mail-test-support";

const THROWN_MARKER = "QA-THROWN-5d81c0";
const USABLE_SECRET = "5d81c0".repeat(10) + "0a1b";

/** Headers that cannot be read at all, as nothing a real request hands over would be. */
const UNREADABLE_HEADERS = {
  get(): string {
    throw new Error(`the headers could not be read ${THROWN_MARKER}`);
  },
};

/** The three ways a read asks, from a module graph of their own, so "once in a process" starts afresh. */
async function freshReaders() {
  vi.resetModules();
  const judge = await import("@/lib/server/rate-limit/judge-read-request");
  const page = await import("@/lib/server/rate-limit/page-limit-response");
  const store = await import(
    "@/lib/server/rate-limit/rate-limit-store-instance"
  );
  return {
    judgeReadRequest: judge.judgeReadRequest,
    refusalOfReadLimit: judge.refusalOfReadLimit,
    refusalOfPageRead: page.refusalOfPageRead,
    hits: vi.spyOn(store.getRateLimitStore(), "recordHits"),
  };
}

beforeEach(() => {
  vi.stubEnv("DIGEST_SECRET", USABLE_SECRET);
  vi.stubEnv("CLIENT_NETWORK_SOURCE", "vercel");
  vi.stubEnv("LEMNARIA_E2E_RATE_LIMIT_POLICY", undefined as unknown as string);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("a read whose judgement throws before anything is counted", () => {
  it("is served by the judge, by the route's refusal and by the page's refusal, and nothing is counted", async () => {
    spyOnEveryConsoleMethod();
    const readers = await freshReaders();

    const judged = await readers.judgeReadRequest(UNREADABLE_HEADERS);
    const forARoute = await readers.refusalOfReadLimit(UNREADABLE_HEADERS);
    const forAPage = await readers.refusalOfPageRead(UNREADABLE_HEADERS, "/ro");

    expect(judged).toEqual({ kind: "serve" });
    expect(forARoute).toBeUndefined();
    expect(forAPage).toBeUndefined();
    expect(readers.hits).not.toHaveBeenCalled();
  });

  it("writes one line for the process, however often it happens, with nothing of what was thrown", async () => {
    const consoleSpies = spyOnEveryConsoleMethod();
    const readers = await freshReaders();

    for (let asked = 0; asked < 25; asked += 1) {
      await readers.judgeReadRequest(UNREADABLE_HEADERS);
    }

    const lines = consoleCallsOf(consoleSpies);
    expect(lines).toEqual([
      [
        "[designs]",
        { event: "design-read-served-unjudged", cause: "judgement-failed" },
      ],
    ]);
    expect(everyReadingOf(lines)).not.toContain(THROWN_MARKER);
  });
});

describe("a read whose store answers what is no count, or throws at once", () => {
  const AN_ADDRESS = new Headers({ "x-forwarded-for": "203.0.113.7" });

  it.each([
    ["nought", () => Promise.resolve([0])],
    ["nothing", () => Promise.resolve(undefined)],
    ["a count written as text", () => Promise.resolve(["601"])],
    [
      "a throw before any promise",
      () => {
        throw new Error(THROWN_MARKER);
      },
    ],
  ])("is served, for %s", async (_label, answer) => {
    spyOnEveryConsoleMethod();
    const readers = await freshReaders();
    readers.hits.mockImplementation(answer as never);

    const judged = await readers.judgeReadRequest(AN_ADDRESS);

    expect(judged).toEqual({ kind: "serve" });
    expect(readers.hits).toHaveBeenCalledTimes(1);
  });
});
