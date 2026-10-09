// The mint's `429` is its own failure: the day's limit on new designs, which no retry can change until tomorrow.
// Every other `429`, and every `503`, keeps the retry it always had.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DesignRequestFailedError,
  isRetryableStatus,
  MINT_LIMIT_REACHED_CODE,
  MINT_LIMIT_REACHED_STATUS,
  MintLimitReachedError,
  WriteNotRetryableError,
} from "../../src/persistence/design-request-errors";
import { FetchConfigurationRepository } from "../../src/persistence/fetch-configuration-repository";
import { createSaveCoalescer } from "../../src/persistence/save-coalescer";
import type { SaveStatus } from "../../src/persistence/save-coalescer";

function answerWithStatus(status: number): Response {
  return new Response(JSON.stringify({ code: "ANY" }), { status });
}

function limitReachedAnswer(): Response {
  return new Response(JSON.stringify({ code: MINT_LIMIT_REACHED_CODE }), {
    status: 429,
  });
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status });
}

async function failureOf(action: () => Promise<unknown>): Promise<unknown> {
  try {
    await action();
  } catch (error) {
    return error;
  }
  throw new Error("expected a failure");
}

describe("a mint that answers 429", () => {
  let methods: string[];
  let answers: (() => Response)[];

  beforeEach(() => {
    methods = [];
    answers = [];
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
      methods.push(init.method ?? "GET");
      const next = answers.shift();
      if (next === undefined) throw new Error("unscripted request");
      return Promise.resolve(next());
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function save(repository: FetchConfigurationRepository) {
    return repository.save({
      id: null,
      design: KITCHEN_L_DESIGN,
      expectedRevision: null,
    });
  }

  it("is its own failure, a terminal one, and sends no save after it", async () => {
    answers.push(limitReachedAnswer);

    const failure = await failureOf(() =>
      save(new FetchConfigurationRepository()),
    );

    expect(failure).toBeInstanceOf(MintLimitReachedError);
    expect(failure).toBeInstanceOf(WriteNotRetryableError);
    expect(methods).toEqual(["POST"]);
  });

  it("holds nothing of the answer's body in its message", async () => {
    answers.push(
      () =>
        new Response(
          JSON.stringify({
            code: MINT_LIMIT_REACHED_CODE,
            error: "BODY-MARKER-93",
          }),
          { status: 429 },
        ),
    );

    const failure = await failureOf(() =>
      save(new FetchConfigurationRepository()),
    );

    expect((failure as Error).message).not.toContain("MARKER");
  });

  it("is not repeated by the save coalescer, which stops where it would have retried a throttle", async () => {
    vi.useFakeTimers();
    answers.push(limitReachedAnswer);
    const statuses: SaveStatus[] = [];
    const repository = new FetchConfigurationRepository();
    const coalescer = createSaveCoalescer({
      repository,
      getDesignId: () => null,
      getGeneration: () => 0,
      getRevision: () => null,
      readCurrentRevision: () => Promise.reject(new Error("no read")),
      onSaved: () => undefined,
      onSaveStatusChange: (status) => {
        statuses.push(status);
      },
    });

    coalescer.scheduleSave(KITCHEN_L_DESIGN);
    await vi.advanceTimersByTimeAsync(120_000);

    expect(methods).toEqual(["POST"]);
    expect(statuses).toContain("stopped");
  });
});

describe("a mint's 429 that is not the day's limit keeps its retry", () => {
  let answers: (() => Response)[];

  beforeEach(() => {
    answers = [];
    vi.stubGlobal("fetch", () => {
      const next = answers.shift();
      if (next === undefined) throw new Error("unscripted request");
      return Promise.resolve(next());
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ["no body", () => new Response(null, { status: 429 })],
    [
      "a body that is not JSON",
      () => new Response("slow down", { status: 429 }),
    ],
    [
      "a body that is JSON and not an object",
      () => jsonResponse("MINT_LIMIT_REACHED", 429),
    ],
    ["a body with no code", () => jsonResponse({ error: "x" }, 429)],
    ["a body with another code", () => jsonResponse({ code: "FIREWALL" }, 429)],
    [
      "a body whose code only contains the limit's",
      () => jsonResponse({ code: `${MINT_LIMIT_REACHED_CODE}_` }, 429),
    ],
    [
      "a body that will not read",
      () =>
        ({
          status: 429,
          ok: false,
          json: () => Promise.reject(new Error("BODY-MARKER-71")),
        }) as unknown as Response,
    ],
  ])(
    "is a throttle worth repeating when the answer has %s",
    async (_label, answer) => {
      answers.push(answer);

      const failure = await failureOf(() =>
        new FetchConfigurationRepository().save({
          id: null,
          design: KITCHEN_L_DESIGN,
          expectedRevision: null,
        }),
      );

      expect(failure).toBeInstanceOf(DesignRequestFailedError);
      expect(failure).not.toBeInstanceOf(WriteNotRetryableError);
      expect(failure).not.toBeInstanceOf(MintLimitReachedError);
      expect((failure as Error).message).not.toContain("MARKER");
    },
  );
});

describe("what keeps its retry", () => {
  let methods: string[];
  let answers: (() => Response)[];

  beforeEach(() => {
    methods = [];
    answers = [];
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
      methods.push(init.method ?? "GET");
      const next = answers.shift();
      if (next === undefined) throw new Error("unscripted request");
      return Promise.resolve(next());
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is a mint that answers 503, a failure worth repeating and not the limit's", async () => {
    answers.push(() => answerWithStatus(503));

    const failure = await failureOf(() =>
      new FetchConfigurationRepository().save({
        id: null,
        design: KITCHEN_L_DESIGN,
        expectedRevision: null,
      }),
    );

    expect(failure).toBeInstanceOf(DesignRequestFailedError);
    expect(failure).not.toBeInstanceOf(WriteNotRetryableError);
    expect(failure).not.toBeInstanceOf(MintLimitReachedError);
  });

  it("is a save that answers 429, which is a throttle and not the mint's limit", async () => {
    answers.push(() => answerWithStatus(429));

    const failure = await failureOf(() =>
      new FetchConfigurationRepository().save({
        id: "design-1",
        design: KITCHEN_L_DESIGN,
        expectedRevision: "1",
      }),
    );

    expect(failure).toBeInstanceOf(DesignRequestFailedError);
    expect(failure).not.toBeInstanceOf(WriteNotRetryableError);
  });

  it("is the status rule itself: a 429 and a 5xx are retryable, as before", () => {
    expect(MINT_LIMIT_REACHED_STATUS).toBe(429);
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(400)).toBe(false);
  });
});
