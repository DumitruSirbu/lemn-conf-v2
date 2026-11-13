// Adversarial QA of how the fetching client sorts the answers to a switch: only the route's own `200` is a switch that was
// written, and only a revision the store could have made is believed. Every other status, every body that is not the
// route's, and every way a request can fail is a failure, and none of them is ever a `set`.
import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AVAILABILITY_REFUSAL_CODES,
  isRevisionShape,
  type ItemRef,
} from "@lemnaria/configurator-domain";

import {
  availabilityOutcomeOf,
  createFetchingItemLifecycleClient,
} from "@/price-dashboard/fetching-item-lifecycle-client";
import type { AvailabilityOutcome } from "@/price-dashboard/item-lifecycle-client";

const MDF: ItemRef = { kind: "material", tierId: "material.painted-mdf" };
const REQUEST = { expectedRevision: "3", item: MDF, active: false };
const FAILED: AvailabilityOutcome = { kind: "failed" };

afterEach(() => {
  vi.unstubAllGlobals();
});

async function switchedAnsweredBy(
  response: Response,
): Promise<AvailabilityOutcome> {
  vi.stubGlobal("fetch", () => Promise.resolve(response));
  return createFetchingItemLifecycleClient().setActive(REQUEST);
}

describe("a switch is written only on the route's own 200", () => {
  it.each([
    201, 202, 204, 206, 301, 400, 403, 404, 408, 413, 415, 422, 429, 500, 502,
    503, 504,
  ])("is failed on a %i that carries a revision", async (status) => {
    const bodyAllowed = status !== 204 && status !== 301;
    const response = new Response(
      bodyAllowed ? JSON.stringify({ revision: "4" }) : null,
      { status },
    );

    expect(await switchedAnsweredBy(response)).toEqual(FAILED);
  });

  it.each([
    ["a revision that is a list", { revision: ["4"] }],
    ["a revision that is an object", { revision: { value: "4" } }],
    ["a revision that is a number", { revision: 4 }],
    ["a revision that is null", { revision: null }],
    ["a body that is a list", ["4"]],
    ["a body that is text", "4"],
    ["no body", undefined],
  ])("is failed on a 200 with %s", async (_name, body) => {
    const response = new Response(
      body === undefined ? null : JSON.stringify(body),
      {
        status: 200,
      },
    );

    expect(await switchedAnsweredBy(response)).toEqual(FAILED);
  });

  it.each([
    ["empty", ""],
    ["blank", " "],
    ["padded", " 4"],
    ["signed", "-4"],
    ["fractional", "4.5"],
    ["led by a zero", "04"],
    ["a word", "latest"],
    ["a line feed after the digits", "4\n"],
    ["wider than a revision column", "9223372036854775808"],
    ["as wide as any text the route would read", "9".repeat(5_000)],
  ])(
    "is failed on a 200 whose revision is %s: the next switch would state it and the route would refuse it",
    async (_name, revision) => {
      const response = new Response(JSON.stringify({ revision }), {
        status: 200,
      });

      expect(await switchedAnsweredBy(response)).toEqual(FAILED);
    },
  );

  it("is set with a revision on a 200 exactly when the revision has the shape the route reads back", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.string({ maxLength: 24 }),
          fc.stringMatching(/^[0-9]{1,20}$/),
        ),
        async (revision) => {
          const outcome = await switchedAnsweredBy(
            new Response(JSON.stringify({ revision }), { status: 200 }),
          );

          expect(outcome.kind).toBe(
            isRevisionShape(revision) ? "set" : "failed",
          );
        },
      ),
      { numRuns: 300 },
    );
  });

  it("is failed on a 200 that is not JSON, such as the sign-in page a redirect lands on", async () => {
    const response = new Response("<html><title>Sign in</title></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });

    expect(await switchedAnsweredBy(response)).toEqual(FAILED);
  });

  it("is failed when the request cannot be made, whatever it throws", async () => {
    for (const thrown of [
      new TypeError("offline"),
      new DOMException("x", "AbortError"),
      "text",
      undefined,
    ]) {
      vi.stubGlobal("fetch", () => Promise.reject(thrown as Error));

      expect(
        await createFetchingItemLifecycleClient().setActive(REQUEST),
      ).toEqual(FAILED);
    }
  });

  it("is failed when the request throws before it is made", async () => {
    vi.stubGlobal("fetch", () => {
      throw new TypeError("blocked");
    });

    expect(
      await createFetchingItemLifecycleClient().setActive(REQUEST),
    ).toEqual(FAILED);
  });

  it("is failed when the body of a 200 cannot be read to the end", async () => {
    const broken = new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new TypeError("reset"));
        },
      }),
      { status: 200 },
    );

    expect(await switchedAnsweredBy(broken)).toEqual(FAILED);
  });
});

describe("a 409 is a refusal or a conflict only by the route's own word", () => {
  it.each(Object.getOwnPropertyNames(Object.prototype))(
    "is failed for the word %s, which every object already holds",
    (word) => {
      expect(
        availabilityOutcomeOf({ status: 409, body: { status: word } }),
      ).toEqual(FAILED);
    },
  );

  it("is failed for a word that is a list or an object holding a known word", () => {
    for (const word of [
      ["changed-meanwhile"],
      { toString: () => "changed-meanwhile" },
      [AVAILABILITY_REFUSAL_CODES[0]],
    ]) {
      expect(
        availabilityOutcomeOf({ status: 409, body: { status: word } }),
      ).toEqual(FAILED);
    }
  });

  it("is failed when the word is an inherited member of the body and not its own", () => {
    const inherited = Object.create({ status: "changed-meanwhile" }) as unknown;

    expect(availabilityOutcomeOf({ status: 409, body: inherited })).toEqual(
      FAILED,
    );
  });

  it("is a refusal in the route's own word whatever else the body carries", () => {
    const code = AVAILABILITY_REFUSAL_CODES[0];

    expect(
      availabilityOutcomeOf({
        status: 409,
        body: { status: code, revision: "9", extra: [1, 2] },
      }),
    ).toEqual({ kind: "refused", code });
  });

  it("is a conflict only on a 409: the same word on any other status is a failure", () => {
    for (const status of [200, 400, 403, 404, 412, 422, 429, 500]) {
      expect(
        availabilityOutcomeOf({
          status,
          body: { status: "changed-meanwhile" },
        }),
        String(status),
      ).toEqual(FAILED);
    }
  });

  it("is the end of the session on a 401 whatever the body says, and on no other status", () => {
    expect(
      availabilityOutcomeOf({ status: 401, body: { revision: "4" } }),
    ).toEqual({
      kind: "session-ended",
    });
    for (const status of [403, 419, 440, 511]) {
      expect(
        availabilityOutcomeOf({ status, body: undefined }),
        String(status),
      ).toEqual(FAILED);
    }
  });
});
