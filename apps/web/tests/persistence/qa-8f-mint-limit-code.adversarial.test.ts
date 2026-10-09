// Which answers the client takes for the day's limit on new designs: a mint's 429 whose body's own top-level
// `code` is exactly the limit's, and nothing else. Near misses of the code, the code in another place, the
// code under another status, and the code on a request that is not the mint all keep the retry they had.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DesignRequestFailedError,
  MINT_LIMIT_REACHED_CODE,
  MintLimitReachedError,
  WriteNotRetryableError,
} from "../../src/persistence/design-request-errors";
import { FetchConfigurationRepository } from "../../src/persistence/fetch-configuration-repository";

const LIMIT_STATUS = 429;
const BODY_MARKER = "QA-BODY-5d81c0";

let requests: string[];
let answers: Response[];

function answer(body: unknown, status = LIMIT_STATUS): void {
  answers.push(new Response(JSON.stringify(body), { status }));
}

async function failureOf(action: () => Promise<unknown>): Promise<unknown> {
  try {
    await action();
  } catch (error) {
    return error;
  }
  throw new Error("expected a failure");
}

function mintFailure(): Promise<unknown> {
  return failureOf(() =>
    new FetchConfigurationRepository().save({
      id: null,
      design: KITCHEN_L_DESIGN,
      expectedRevision: null,
    }),
  );
}

function saveFailure(): Promise<unknown> {
  return failureOf(() =>
    new FetchConfigurationRepository().save({
      id: "qa-design-1",
      design: KITCHEN_L_DESIGN,
      expectedRevision: "1",
    }),
  );
}

function expectAThrottleThatKeepsItsRetry(failure: unknown): void {
  expect(failure).toBeInstanceOf(DesignRequestFailedError);
  expect(failure).not.toBeInstanceOf(WriteNotRetryableError);
  expect(failure).not.toBeInstanceOf(MintLimitReachedError);
  expect((failure as Error).message).not.toContain(BODY_MARKER);
}

beforeEach(() => {
  requests = [];
  answers = [];
  vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
    requests.push(init.method ?? "GET");
    const next = answers.shift();
    if (next === undefined) throw new Error("unscripted request");
    return Promise.resolve(next);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a mint's 429 whose body nearly says the day's limit", () => {
  const NEAR_MISSES: readonly [string, unknown][] = [
    ["the code in lower case", { code: MINT_LIMIT_REACHED_CODE.toLowerCase() }],
    ["the code with a space after it", { code: `${MINT_LIMIT_REACHED_CODE} ` }],
    ["the code inside a list", { code: [MINT_LIMIT_REACHED_CODE] }],
    ["the code inside an object", { code: { code: MINT_LIMIT_REACHED_CODE } }],
    ["a code that is a number", { code: LIMIT_STATUS }],
    ["a code that is true", { code: true }],
    ["a code that is null", { code: null }],
    ["the code under a capitalised key", { Code: MINT_LIMIT_REACHED_CODE }],
    ["the code as the error's text", { error: MINT_LIMIT_REACHED_CODE }],
    ["the code one level down", { data: { code: MINT_LIMIT_REACHED_CODE } }],
    ["a list holding the right body", [{ code: MINT_LIMIT_REACHED_CODE }]],
    ["nothing but null", null],
  ];

  it.each(NEAR_MISSES)(
    "is a throttle that keeps its retry, for %s",
    async (_label, body) => {
      answer(
        body !== null && !Array.isArray(body)
          ? { ...(body as object), error: BODY_MARKER, ...(body as object) }
          : body,
      );

      expectAThrottleThatKeepsItsRetry(await mintFailure());
      expect(requests).toEqual(["POST"]);
    },
  );
});

describe("the limit's own code where the day's limit cannot be", () => {
  it.each([503, 500, 502])(
    "is a failure that keeps its retry on a mint answered %i",
    async (status) => {
      answer({ code: MINT_LIMIT_REACHED_CODE, error: BODY_MARKER }, status);

      expectAThrottleThatKeepsItsRetry(await mintFailure());
    },
  );

  it("is a throttle that keeps its retry on a save answered 429, which is not a mint", async () => {
    answer({ code: MINT_LIMIT_REACHED_CODE, error: BODY_MARKER });

    expectAThrottleThatKeepsItsRetry(await saveFailure());
    expect(requests).toEqual(["PUT"]);
  });
});

describe("the day's limit, said exactly", () => {
  it("is taken for the limit whatever else the body holds, and none of the body is kept", async () => {
    answer({
      error: BODY_MARKER,
      retryAfter: BODY_MARKER,
      code: MINT_LIMIT_REACHED_CODE,
    });

    const failure = await mintFailure();

    expect(failure).toBeInstanceOf(MintLimitReachedError);
    expect(
      JSON.stringify(failure, Object.getOwnPropertyNames(failure)),
    ).not.toContain(BODY_MARKER);
    expect(requests).toEqual(["POST"]);
  });
});
