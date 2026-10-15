// A save's `429` that carries the limit's code is its own failure and holds the wait. Any other `429` is the
// throttle it always was, and the wait is read from `Retry-After` with a floor, a ceiling and a fixed minute.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DesignRequestFailedError,
  MINT_LIMIT_REACHED_CODE,
  MintLimitReachedError,
  SAVE_LIMIT_REACHED_CODE,
  SaveLimitReachedError,
  saveWaitSecondsFrom,
  UNREADABLE_SAVE_WAIT_SECONDS,
  WriteNotRetryableError,
} from "../../src/persistence/design-request-errors";
import { FetchConfigurationRepository } from "../../src/persistence/fetch-configuration-repository";

const WINDOW_SECONDS = 3600;

function saveRefusal(retryAfter: string | null, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 429,
    ...(retryAfter === null ? {} : { headers: { "Retry-After": retryAfter } }),
  });
}

function limitRefusal(retryAfter: string | null): Response {
  return saveRefusal(retryAfter, { code: SAVE_LIMIT_REACHED_CODE });
}

async function failureOf(action: () => Promise<unknown>): Promise<unknown> {
  try {
    await action();
  } catch (error) {
    return error;
  }
  throw new Error("expected a failure");
}

describe("a save that answers 429 with the limit's code", () => {
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

  function save() {
    return new FetchConfigurationRepository().save({
      id: "design-1",
      design: KITCHEN_L_DESIGN,
      expectedRevision: "1",
    });
  }

  it("is its own failure, holding the stated wait in milliseconds", async () => {
    answers.push(() => limitRefusal("2400"));

    const failure = await failureOf(save);

    expect(failure).toBeInstanceOf(SaveLimitReachedError);
    expect((failure as SaveLimitReachedError).waitMs).toBe(2_400_000);
    expect(methods).toEqual(["PUT"]);
  });

  it("is neither the terminal failure nor the plain throttle's retry, so nothing treats it as either", async () => {
    answers.push(() => limitRefusal("30"));

    const failure = await failureOf(save);

    expect(failure).toBeInstanceOf(DesignRequestFailedError);
    expect(failure).not.toBeInstanceOf(WriteNotRetryableError);
    expect(failure).not.toBeInstanceOf(MintLimitReachedError);
  });

  it("holds nothing of the answer's body in its message", async () => {
    answers.push(() =>
      saveRefusal("30", {
        code: SAVE_LIMIT_REACHED_CODE,
        error: "BODY-MARKER-4471",
      }),
    );

    const failure = await failureOf(save);

    expect((failure as Error).message).not.toContain("MARKER");
  });

  it.each([
    ["no body", () => new Response(null, { status: 429 })],
    ["a body that is not JSON", () => new Response("slow", { status: 429 })],
    ["a body with no code", () => saveRefusal("30", { error: "x" })],
    ["a body with another code", () => saveRefusal("30", { code: "FIREWALL" })],
    [
      "the mint's code",
      () => saveRefusal("30", { code: MINT_LIMIT_REACHED_CODE }),
    ],
    [
      "a code that only contains the limit's",
      () => saveRefusal("30", { code: `${SAVE_LIMIT_REACHED_CODE}_` }),
    ],
    [
      "a body that will not read",
      () =>
        ({
          status: 429,
          ok: false,
          headers: new Headers({ "Retry-After": "30" }),
          json: () => Promise.reject(new Error("BODY-MARKER-88")),
        }) as unknown as Response,
    ],
  ])(
    "is the throttle it was when the answer has %s",
    async (_label, answer) => {
      answers.push(answer);

      const failure = await failureOf(save);

      expect(failure).toBeInstanceOf(DesignRequestFailedError);
      expect(failure).not.toBeInstanceOf(SaveLimitReachedError);
      expect(failure).not.toBeInstanceOf(WriteNotRetryableError);
      expect((failure as Error).message).not.toContain("MARKER");
    },
  );

  it("is not taken for the limit when the code arrives under another status", async () => {
    answers.push(
      () =>
        new Response(JSON.stringify({ code: SAVE_LIMIT_REACHED_CODE }), {
          status: 503,
        }),
    );

    expect(await failureOf(save)).not.toBeInstanceOf(SaveLimitReachedError);
  });

  it("is not taken for a mint that carries the save's code", async () => {
    answers.push(() => limitRefusal("30"));

    const failure = await failureOf(() =>
      new FetchConfigurationRepository().save({
        id: null,
        design: KITCHEN_L_DESIGN,
        expectedRevision: null,
      }),
    );

    expect(failure).not.toBeInstanceOf(SaveLimitReachedError);
    expect(failure).not.toBeInstanceOf(MintLimitReachedError);
  });
});

describe("saveWaitSecondsFrom: the wait a refused save holds", () => {
  it.each([
    ["1", 1],
    ["2", 2],
    ["60", 60],
    ["2400", 2400],
    ["3599", 3599],
    ["3600", 3600],
  ])(
    "is the stated %s seconds when it is whole and inside the window",
    (header, seconds) => {
      expect(saveWaitSecondsFrom(header)).toBe(seconds);
    },
  );

  it.each(["0", "00", "000"])(
    "is one second for a stated nought, %s, never none",
    (header) => {
      expect(saveWaitSecondsFrom(header)).toBe(1);
    },
  );

  it.each([
    ["absent", null],
    ["empty", ""],
    ["a date", "Wed, 21 Oct 2026 07:28:00 GMT"],
    ["a fraction", "1.5"],
    ["negative", "-1"],
    ["signed", "+5"],
    ["spaced", " 5"],
    ["words", "soon"],
    ["an exponent", "1e3"],
    ["hexadecimal", "0x10"],
    ["over the window", "3601"],
    ["far over the window", "99999999999999999999"],
  ])("is the fixed minute when the header is %s", (_label, header) => {
    expect(saveWaitSecondsFrom(header)).toBe(UNREADABLE_SAVE_WAIT_SECONDS);
    expect(UNREADABLE_SAVE_WAIT_SECONDS).toBe(60);
  });

  it("is never under one second nor over the window, whatever the header, over a swept range", () => {
    for (let seconds = -5; seconds <= WINDOW_SECONDS + 5; seconds += 1) {
      const wait = saveWaitSecondsFrom(String(seconds));
      expect(wait).toBeGreaterThanOrEqual(1);
      expect(wait).toBeLessThanOrEqual(WINDOW_SECONDS);
    }
  });
});
