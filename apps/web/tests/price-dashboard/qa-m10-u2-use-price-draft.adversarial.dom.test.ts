// @vitest-environment happy-dom
//
// Adversarial QA of M10 wave U2, the draft a screen writes through (`use-price-draft.ts` over the fetching client).
// `use-price-draft.dom.test.ts` drives the hook over an in-memory client that answers with the client's own outcome types, so
// no test there reaches the part that turns a response into one: a 401 from the network, a 503, a 200 whose body is not the
// route's, a connection that drops, a screen that goes away with a write out. Here the hook runs over the fetching client and
// a stubbed `fetch`, and the words a refusal becomes are checked against every code a body could carry.
import { fc, test as propertyTest } from "@fast-check/vitest";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getStaffSessionExpiry,
  resetStaffSessionExpiryForTests,
} from "@/staff/staff-session-expiry";
import {
  FETCHING_PRICE_DRAFT_CLIENT,
  type DraftWriteResult,
} from "@/price-dashboard/price-draft-client";
import {
  bulkWriteFailureWords,
  depthWriteFailureWords,
  priceWriteFailureWords,
} from "@/price-dashboard/price-input-words";
import { usePriceDraft } from "@/price-dashboard/use-price-draft";

import { flushPromises, renderHook } from "../support/render-hook";
import { BASE_CABINET_RULE, stateOf } from "./dashboard-state-fixture";
import { roCopy } from "./romanian-copy";

const ANCHOR = {
  address: {
    kind: "cabinet",
    ruleId: BASE_CABINET_RULE,
    field: "anchorMinor",
  },
  value: 500_000,
} as const;

type Fetch = (address: string, init?: RequestInit) => Promise<Response>;

function answer(status: number, body?: unknown): Response {
  const isEmpty = body === undefined;
  return new Response(
    isEmpty ? null : typeof body === "string" ? body : JSON.stringify(body),
    { status },
  );
}

function stubFetch(handler: Fetch) {
  const stub = vi.fn<Fetch>(handler);
  vi.stubGlobal("fetch", stub);
  return stub;
}

function methodsOf(stub: ReturnType<typeof stubFetch>): string[] {
  return stub.mock.calls.map(([, init]) => init?.method ?? "GET");
}

function mount(revision = "4") {
  return renderHook(() => usePriceDraft({ initial: stateOf([], revision) }));
}

let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetStaffSessionExpiryForTests();
});

describe("a write answered by the network as it really answers", () => {
  it("a 401 on a change raises the session sheet once, keeps the draft as it was, and leaves the screen free to press again", async () => {
    stubFetch(() => Promise.resolve(answer(401, { status: "unauthorised" })));
    const draft = mount();

    let result: unknown;
    await act(async () => {
      result = await draft.result.current.change(ANCHOR);
    });

    expect(result).toEqual({ kind: "failed" });
    expect(getStaffSessionExpiry()).toEqual({ keepsTypedText: true });
    expect(draft.result.current.isBusy).toBe(false);
    expect(draft.result.current.state.draft).toEqual({
      draftRevision: "4",
      changes: [],
    });
    draft.unmount();
  });

  it.each(["change", "revert", "bulk"] as const)(
    "a 401 on a %s raises the session sheet, whichever write it was",
    async (kind) => {
      stubFetch(() => Promise.resolve(answer(401, {})));
      const draft = mount();

      await act(async () => {
        if (kind === "change") await draft.result.current.change(ANCHOR);
        else if (kind === "revert") {
          await draft.result.current.revert({
            kind: "change",
            address: ANCHOR.address,
          });
        } else {
          await draft.result.current.bulk({
            target: { scope: "all" },
            percent: 5,
          });
        }
      });

      expect(getStaffSessionExpiry()).toEqual({ keepsTypedText: true });
      draft.unmount();
    },
  );

  it.each([500, 502, 503, 504, 429, 403, 404, 405, 413, 415, 302, 307])(
    "a %i is a write that failed: nothing adopted, no sheet raised, not busy",
    async (status) => {
      stubFetch(() => Promise.resolve(answer(status, { status: "x" })));
      const draft = mount();

      let result: unknown;
      await act(async () => {
        result = await draft.result.current.change(ANCHOR);
      });

      expect(result).toEqual({ kind: "failed" });
      expect(getStaffSessionExpiry()).toBeUndefined();
      expect(draft.result.current.isBusy).toBe(false);
      expect(draft.result.current.state.draft.draftRevision).toBe("4");
      draft.unmount();
    },
  );

  it.each([
    ["HTML", "<html><body>Bad gateway</body></html>"],
    ["an empty body", ""],
    ["null", "null"],
    ["an array", "[]"],
    ["a revision that is a number", '{"draftRevision":5,"changes":[]}'],
    ["changes that are not a list", '{"draftRevision":"5","changes":{}}'],
    [
      "a change with no address",
      '{"draftRevision":"5","changes":[{"value":1}]}',
    ],
    [
      "a body whose members are inherited",
      '{"__proto__":{"draftRevision":"5","changes":[]}}',
    ],
  ])(
    "a 200 whose body is %s is a write that failed, and the draft the screen holds is not replaced by it",
    async (_name, body) => {
      stubFetch(() => Promise.resolve(answer(200, body)));
      const draft = mount();

      let result: unknown;
      await act(async () => {
        result = await draft.result.current.change(ANCHOR);
      });

      expect(result).toEqual({ kind: "failed" });
      expect(draft.result.current.state.draft).toEqual({
        draftRevision: "4",
        changes: [],
      });
      expect(draft.result.current.isBusy).toBe(false);
      draft.unmount();
    },
  );

  it("recovers on the press after a 200 it could not read: the write had landed, so the next one conflicts, the state is read again, and the one after is sent against the revision that is there", async () => {
    let writes = 0;
    const stub = stubFetch((address, init) => {
      if (address === "/api/staff/prices" && init?.method === "GET") {
        return Promise.resolve(
          answer(200, {
            active: stateOf().active,
            draft: { draftRevision: "6", changes: [ANCHOR] },
          }),
        );
      }
      writes += 1;
      if (writes === 1) return Promise.resolve(answer(200, "not json"));
      if (writes === 2) {
        return Promise.resolve(answer(409, { status: "changed-meanwhile" }));
      }
      return Promise.resolve(
        answer(200, {
          draftRevision: "7",
          changes: [{ ...ANCHOR, value: 600_000 }],
        }),
      );
    });
    const draft = mount("5");

    const results: unknown[] = [];
    for (const value of [500_000, 600_000, 600_000]) {
      await act(async () => {
        results.push(await draft.result.current.change({ ...ANCHOR, value }));
      });
    }

    expect(results).toEqual([
      { kind: "failed" },
      { kind: "conflict" },
      { kind: "saved" },
    ]);
    expect(methodsOf(stub)).toEqual(["PUT", "PUT", "GET", "PUT"]);
    const sentRevisions = stub.mock.calls
      .filter(([, init]) => init?.method === "PUT")
      .map(
        ([, init]) =>
          (
            JSON.parse(init?.body as string) as {
              expectedDraftRevision: string;
            }
          ).expectedDraftRevision,
      );
    expect(sentRevisions).toEqual(["5", "5", "6"]);
    expect(draft.result.current.state.draft.draftRevision).toBe("7");
    draft.unmount();
  });

  it("a connection that drops is a write that failed, and the next write goes out", async () => {
    let attempts = 0;
    stubFetch(() => {
      attempts += 1;
      return attempts === 1
        ? Promise.reject(new TypeError("Failed to fetch"))
        : Promise.resolve(
            answer(200, { draftRevision: "5", changes: [ANCHOR] }),
          );
    });
    const draft = mount();

    const results: unknown[] = [];
    for (let press = 0; press < 2; press += 1) {
      await act(async () => {
        results.push(await draft.result.current.change(ANCHOR));
      });
    }

    expect(results).toEqual([{ kind: "failed" }, { kind: "saved" }]);
    expect(draft.result.current.state.draft.draftRevision).toBe("5");
    draft.unmount();
  });

  it("a response whose body read throws is a write that failed, not an unhandled rejection", async () => {
    stubFetch(() =>
      Promise.resolve({
        status: 200,
        json: () => Promise.reject(new SyntaxError("Unexpected end of JSON")),
      } as unknown as Response),
    );
    const draft = mount();

    let result: unknown;
    await act(async () => {
      result = await draft.result.current.change(ANCHOR);
    });

    expect(result).toEqual({ kind: "failed" });
    draft.unmount();
  });
});

describe("a write that is answered with a conflict", () => {
  it("reads the state again, adopts what it says whole (the active version too), and is not busy while it is read", async () => {
    const fresh = stateOf([ANCHOR as never], "9");
    const stub = stubFetch((address, init) =>
      Promise.resolve(
        init?.method === "GET"
          ? answer(200, fresh)
          : answer(409, { status: "changed-meanwhile" }),
      ),
    );
    const draft = mount("4");

    let result: unknown;
    await act(async () => {
      result = await draft.result.current.change({ ...ANCHOR, value: 600_000 });
    });

    expect(result).toEqual({ kind: "conflict" });
    expect(methodsOf(stub)).toEqual(["PUT", "GET"]);
    expect(draft.result.current.state).toEqual(fresh);
    expect(draft.result.current.isBusy).toBe(false);
    draft.unmount();
  });

  it.each([
    ["a 503", () => Promise.resolve(answer(503, {}))],
    ["a refused connection", () => Promise.reject(new TypeError("down"))],
    [
      "a 200 that is not the state",
      () => Promise.resolve(answer(200, { draft: {} })),
    ],
    ["a 401", () => Promise.resolve(answer(401, {}))],
  ] as const)(
    "keeps the state it held when the read after it is %s, is not busy, and says conflict",
    async (_name, readAnswer) => {
      stubFetch((_address, init) =>
        init?.method === "GET"
          ? readAnswer()
          : Promise.resolve(answer(409, { status: "changed-meanwhile" })),
      );
      const draft = mount("4");

      let result: unknown;
      await act(async () => {
        result = await draft.result.current.change(ANCHOR);
      });

      expect(result).toEqual({ kind: "conflict" });
      expect(draft.result.current.state.draft.draftRevision).toBe("4");
      expect(draft.result.current.isBusy).toBe(false);
      draft.unmount();
    },
  );

  it("is not a conflict when the 409 names another status, and a candidate the draft no longer makes is its own outcome", async () => {
    const outcomes: unknown[] = [];
    for (const body of [
      { status: "candidate-refused" },
      { status: "something-else" },
      {},
      null,
    ]) {
      stubFetch(() => Promise.resolve(answer(409, body)));
      const draft = mount();
      await act(async () => {
        outcomes.push(await draft.result.current.change(ANCHOR));
      });
      draft.unmount();
    }

    expect(outcomes).toEqual([
      { kind: "candidate-refused" },
      { kind: "failed" },
      { kind: "failed" },
      { kind: "failed" },
    ]);
  });
});

describe("a screen that goes away with a write out", () => {
  it("raises no error and throws nothing when the answer arrives after the unmount, and the write is not sent twice", async () => {
    let release: () => void = () => undefined;
    const stub = stubFetch(
      () =>
        new Promise<Response>((resolve) => {
          release = () => {
            resolve(answer(200, { draftRevision: "5", changes: [ANCHOR] }));
          };
        }),
    );
    const draft = mount();
    let settled: Promise<unknown> = Promise.resolve();
    act(() => {
      settled = draft.result.current.change(ANCHOR);
    });
    draft.unmount();

    release();
    await act(async () => {
      await settled;
      await flushPromises(5);
    });

    expect(stub).toHaveBeenCalledTimes(1);
    expect(errors).not.toHaveBeenCalled();
  });

  it("raises no error when the conflict's re-read arrives after the unmount", async () => {
    let releaseRead: () => void = () => undefined;
    stubFetch((_address, init) =>
      init?.method === "GET"
        ? new Promise<Response>((resolve) => {
            releaseRead = () => {
              resolve(answer(200, stateOf([], "9")));
            };
          })
        : Promise.resolve(answer(409, { status: "changed-meanwhile" })),
    );
    const draft = mount();
    let settled: Promise<unknown> = Promise.resolve();
    act(() => {
      settled = draft.result.current.change(ANCHOR);
    });
    await flushPromises(5);
    draft.unmount();

    releaseRead();
    await act(async () => {
      await settled;
      await flushPromises(5);
    });

    expect(errors).not.toHaveBeenCalled();
  });
});

describe("one write at a time, whatever the writes are", () => {
  const WRITES = ["change", "revert", "bulk"] as const;

  propertyTest.prop(
    [fc.array(fc.constantFrom(...WRITES), { minLength: 2, maxLength: 6 })],
    { numRuns: 60 },
  )(
    "sends exactly one request when several writes are asked in one moment, and answers every other as busy without sending it",
    async (kinds) => {
      let release: () => void = () => undefined;
      const stub = stubFetch(
        () =>
          new Promise<Response>((resolve) => {
            release = () => {
              resolve(answer(200, { draftRevision: "5", changes: [ANCHOR] }));
            };
          }),
      );
      const draft = mount();
      const results: Promise<unknown>[] = [];

      act(() => {
        for (const kind of kinds) {
          results.push(
            kind === "change"
              ? draft.result.current.change(ANCHOR)
              : kind === "revert"
                ? draft.result.current.revert({
                    kind: "change",
                    address: ANCHOR.address,
                  })
                : draft.result.current.bulk({
                    target: { scope: "all" },
                    percent: 5,
                  }),
          );
        }
      });
      await flushPromises(3);

      expect(stub).toHaveBeenCalledTimes(1);
      const refused = await Promise.all(results.slice(1));
      expect(refused).toEqual(refused.map(() => ({ kind: "busy" })));
      release();
      await act(async () => {
        await results[0];
        await flushPromises(3);
      });
      expect(draft.result.current.isBusy).toBe(false);
      draft.unmount();
    },
  );
});

describe("the words a refusal becomes", () => {
  const FIELD_WORDS = [
    roCopy("priceDashboard.errors.negative"),
    roCopy("priceDashboard.errors.tooBig"),
    roCopy("priceDashboard.errors.notNumber", { example: "450,00" }),
    roCopy("priceDashboard.errors.changedMeanwhile"),
    roCopy("priceDashboard.errors.saveFailed"),
  ];

  propertyTest.prop([fc.string({ minLength: 6, maxLength: 40 })], {
    numRuns: 300,
  })(
    "never carry a code the server sent that the screen does not know, in a price, the depth rule or a bulk action",
    (code) => {
      const translate = roCopy as unknown as Parameters<
        typeof priceWriteFailureWords
      >[0];
      const refused = { kind: "refused", code } as unknown as Parameters<
        typeof priceWriteFailureWords
      >[1];
      const unknown = DRAFT_CODES.has(code) ? [] : [code];

      for (const words of [
        priceWriteFailureWords(translate, refused),
        depthWriteFailureWords(translate, refused),
        bulkWriteFailureWords(translate, refused as never),
      ]) {
        for (const foreign of unknown) {
          expect(words).not.toContain(foreign);
        }
        expect(words.trim()).not.toBe("");
      }
    },
  );

  it("is, for a price the server refused, one of the sentences the field has for it and never a code", () => {
    const translate = roCopy as unknown as Parameters<
      typeof priceWriteFailureWords
    >[0];
    for (const code of [
      "NEGATIVE",
      "TOO_LARGE",
      "NOT_A_WHOLE_NUMBER",
      "MISSING_VALUE",
      "UNKNOWN_ADDRESS",
      "NOT_AN_AMOUNT",
    ]) {
      const words = priceWriteFailureWords(translate, {
        kind: "refused",
        code,
      } as never);

      expect(FIELD_WORDS, code).toContain(words);
    }
  });
});

describe("the outcomes of the fetching client, over every status a server may answer", () => {
  const CLOSED_KINDS = [
    "changed",
    "refused",
    "candidate-refused",
    "conflict",
    "session-ended",
    "failed",
  ];

  propertyTest.prop(
    [
      fc.integer({ min: 200, max: 599 }),
      fc.oneof(
        fc.constant(undefined),
        fc.json().map((text) => text),
        fc.string({ maxLength: 40 }),
      ),
    ],
    { numRuns: 400 },
  )(
    "is one of the six outcomes, is `changed` only for a 200 that holds a draft, and `session-ended` only for a 401",
    async (status, body) => {
      const hasNoBody = [204, 205, 304].includes(status);
      stubFetch(() =>
        Promise.resolve(new Response(hasNoBody ? null : body, { status })),
      );

      const outcome: DraftWriteResult<string, unknown> =
        await FETCHING_PRICE_DRAFT_CLIENT.change({
          expectedDraftRevision: "1",
          change: ANCHOR,
        });

      expect(CLOSED_KINDS).toContain(outcome.kind);
      if (outcome.kind === "changed") expect(status).toBe(200);
      expect(outcome.kind === "session-ended").toBe(status === 401);
      vi.unstubAllGlobals();
    },
  );
});

const DRAFT_CODES = new Set([
  "NEGATIVE",
  "TOO_LARGE",
  "NOT_A_WHOLE_NUMBER",
  "MISSING_VALUE",
  "NO_CABINETS_SELECTED",
  "PERCENT_OUT_OF_RANGE",
  "PRICE_WOULD_BE_NEGATIVE",
]);
