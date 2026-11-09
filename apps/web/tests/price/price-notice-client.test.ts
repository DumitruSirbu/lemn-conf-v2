import { afterEach, describe, expect, it, vi } from "vitest";

import { FETCHING_PRICE_NOTICE_CLIENT } from "@/price/price-notice-client";

const DESIGN_ID = "abcdefghijklmnopqrstu";
const PAIR = { versionId: "ver-1", availabilityRevision: "4" };

const ACTIVE_BODY = {
  kind: "active-version",
  isSent: false,
  current: PAIR,
  pricesChanged: true,
  replacementsRequired: [
    {
      item: { kind: "material", tierId: "gone" },
      remaining: [{ kind: "material", tierId: "melamine" }],
    },
  ],
  removedAccessories: [
    { accessoryId: "dishDryingRack" },
    { accessoryId: "accessory.shelf", authoredName: "Raft" },
  ],
};

interface SentRequest {
  readonly address: string;
  readonly init: RequestInit | undefined;
}

function answerWith(status: number, body?: unknown) {
  const sent: SentRequest[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((address: string, init?: RequestInit) => {
      sent.push({ address, init });
      return Promise.resolve(
        new Response(body === undefined ? "not json" : JSON.stringify(body), {
          status,
        }),
      );
    }),
  );
  return sent;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reading the notice", () => {
  it("asks the design's own route with a GET", async () => {
    const sent = answerWith(200, ACTIVE_BODY);

    await FETCHING_PRICE_NOTICE_CLIENT.read(DESIGN_ID);

    expect(sent.map(({ address }) => address)).toEqual([
      `/api/designs/${DESIGN_ID}/price-notice`,
    ]);
    expect(sent[0]?.init?.method).toBe("GET");
  });

  it("reads the active arm member by member", async () => {
    answerWith(200, ACTIVE_BODY);

    const read = await FETCHING_PRICE_NOTICE_CLIENT.read(DESIGN_ID);

    expect(read).toEqual({ kind: "notice", notice: ACTIVE_BODY });
  });

  it.each([true, false])(
    "reads the no-active-version arm with isSent %s",
    async (isSent) => {
      answerWith(200, { kind: "no-active-version", isSent });

      const read = await FETCHING_PRICE_NOTICE_CLIENT.read(DESIGN_ID);

      expect(read).toEqual({
        kind: "notice",
        notice: { kind: "no-active-version", isSent },
      });
    },
  );

  it.each([404, 429, 500, 503])("a %i is unavailable", async (status) => {
    answerWith(status, { status: "anything" });

    expect(await FETCHING_PRICE_NOTICE_CLIENT.read(DESIGN_ID)).toEqual({
      kind: "unavailable",
    });
  });

  it("a network failure is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("offline"))),
    );

    expect(await FETCHING_PRICE_NOTICE_CLIENT.read(DESIGN_ID)).toEqual({
      kind: "unavailable",
    });
  });

  it("a 200 that is not JSON is unavailable", async () => {
    answerWith(200);

    expect(await FETCHING_PRICE_NOTICE_CLIENT.read(DESIGN_ID)).toEqual({
      kind: "unavailable",
    });
  });

  it.each([
    ["a missing isSent", { ...ACTIVE_BODY, isSent: undefined }],
    ["an unknown kind", { ...ACTIVE_BODY, kind: "other" }],
    ["a pricesChanged that is text", { ...ACTIVE_BODY, pricesChanged: "yes" }],
    [
      "a current with no version",
      { ...ACTIVE_BODY, current: { ...PAIR, versionId: "" } },
    ],
    [
      "a current whose revision is not a revision",
      { ...ACTIVE_BODY, current: { ...PAIR, availabilityRevision: "x" } },
    ],
    [
      "replacements that are not a list",
      { ...ACTIVE_BODY, replacementsRequired: {} },
    ],
    [
      "a replacement naming an unknown kind",
      {
        ...ACTIVE_BODY,
        replacementsRequired: [
          { item: { kind: "colour", tierId: "a" }, remaining: [] },
        ],
      },
    ],
    [
      "a removed accessory whose name is not text",
      {
        ...ACTIVE_BODY,
        removedAccessories: [{ accessoryId: "a", authoredName: 7 }],
      },
    ],
  ])("a 200 with %s is unavailable", async (_name, body) => {
    answerWith(200, body);

    expect(await FETCHING_PRICE_NOTICE_CLIENT.read(DESIGN_ID)).toEqual({
      kind: "unavailable",
    });
  });
});

describe("acknowledging a pair", () => {
  it("posts exactly the two members of the displayed pair as JSON", async () => {
    const sent = answerWith(200, { acknowledged: PAIR });

    const outcome = await FETCHING_PRICE_NOTICE_CLIENT.acknowledge(DESIGN_ID, {
      ...PAIR,
      extra: "never sent",
    } as typeof PAIR);

    expect(outcome).toEqual({ kind: "acknowledged" });
    expect(sent.map(({ address }) => address)).toEqual([
      `/api/designs/${DESIGN_ID}/price-notice/acknowledge`,
    ]);
    expect(sent[0]?.init?.method).toBe("POST");
    expect(JSON.parse(sent[0]?.init?.body as string)).toEqual(PAIR);
    expect(sent[0]?.init?.headers).toEqual({
      "content-type": "application/json",
    });
  });

  it.each(["unknown-version", "revision-ahead"] as const)(
    "a 400 saying %s is a refusal of that word",
    async (refusal) => {
      answerWith(400, { status: refusal });

      expect(
        await FETCHING_PRICE_NOTICE_CLIENT.acknowledge(DESIGN_ID, PAIR),
      ).toEqual({ kind: "refused", refusal });
    },
  );

  it.each([
    ["a 400 of the invalid-input body", 400, { status: "invalid-input" }],
    ["a 400 with no body", 400, undefined],
    ["a 404", 404, { status: "not-found" }],
    ["a 429", 429, { status: "busy" }],
    ["a 500", 500, { status: "unexpected" }],
    ["a 503", 503, { status: "unavailable" }],
    ["a 200 that acknowledges nothing", 200, {}],
  ])("%s has failed", async (_name, status, body) => {
    answerWith(status, body);

    expect(
      await FETCHING_PRICE_NOTICE_CLIENT.acknowledge(DESIGN_ID, PAIR),
    ).toEqual({ kind: "failed" });
  });

  it("a network failure has failed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("offline"))),
    );

    expect(
      await FETCHING_PRICE_NOTICE_CLIENT.acknowledge(DESIGN_ID, PAIR),
    ).toEqual({ kind: "failed" });
  });
});
