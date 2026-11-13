// M10 wave Q3c, adversarial QA of the notice client: whatever the network or the body does, a read is one of two closed
// outcomes and an acknowledgement is one of three, and nothing is thrown. The implementer's tests pin one example per
// arm; these sweep the statuses and mutate a valid body member by member, so that a reader that only checks the members
// it happens to name is caught.
import { afterEach, describe, expect, it, vi } from "vitest";

import { FETCHING_PRICE_NOTICE_CLIENT } from "@/price/price-notice-client";

const DESIGN_ID = "abcdefghijklmnopqrstu";
const PAIR = { versionId: "ver-1", availabilityRevision: "4" };
const UNAVAILABLE = { kind: "unavailable" };
const FAILED = { kind: "failed" };

const VALID_ACTIVE: Record<string, unknown> = {
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

/** Statuses a `Response` cannot carry a body with. */
const BODYLESS_STATUSES = new Set([204, 205, 304]);
const ALL_ANSWERABLE_STATUSES = Array.from(
  { length: 599 - 200 + 1 },
  (_, index) => 200 + index,
);

function stubFetch(
  respond: (address: string, init?: RequestInit) => Promise<Response>,
): ReturnType<typeof vi.fn> {
  const stub = vi.fn(respond);
  vi.stubGlobal("fetch", stub);
  return stub;
}

function answerWithText(status: number, text: string | null): void {
  stubFetch(() => Promise.resolve(new Response(text, { status })));
}

function answerWithJson(status: number, body: unknown): void {
  answerWithText(status, JSON.stringify(body));
}

function withMember(
  body: Record<string, unknown>,
  name: string,
  value: unknown,
): Record<string, unknown> {
  return { ...body, [name]: value };
}

function withoutMember(
  body: Record<string, unknown>,
  name: string,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(body).filter(([member]) => member !== name),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reading: every status but 200 is unavailable, whatever the body says", () => {
  it("answers unavailable for each status from 201 to 599 carrying a perfectly valid notice", async () => {
    const offenders: number[] = [];
    for (const status of ALL_ANSWERABLE_STATUSES.filter((s) => s !== 200)) {
      answerWithText(
        status,
        BODYLESS_STATUSES.has(status) ? null : JSON.stringify(VALID_ACTIVE),
      );
      const read = await FETCHING_PRICE_NOTICE_CLIENT.read(DESIGN_ID);
      if (read.kind !== "unavailable") offenders.push(status);
    }

    expect(offenders).toEqual([]);
  });

  it("answers a notice for 200 and for nothing else (the sweep is not vacuous)", async () => {
    answerWithJson(200, VALID_ACTIVE);

    expect((await FETCHING_PRICE_NOTICE_CLIENT.read(DESIGN_ID)).kind).toBe(
      "notice",
    );
  });
});

describe("reading: a 200 that is not the wire's shape is unavailable", () => {
  const TOP_LEVEL_MEMBERS = [
    "kind",
    "isSent",
    "current",
    "pricesChanged",
    "replacementsRequired",
    "removedAccessories",
  ];

  it.each(TOP_LEVEL_MEMBERS)("with %s missing", async (name) => {
    answerWithJson(200, withoutMember(VALID_ACTIVE, name));

    expect(await FETCHING_PRICE_NOTICE_CLIENT.read(DESIGN_ID)).toEqual(
      UNAVAILABLE,
    );
  });

  const WRONG_TYPES: readonly [string, unknown][] = [
    ["null", null],
    ["a number", 7],
    ["zero", 0],
    ["an empty string", ""],
    ["text", "yes"],
    ["true", true],
    ["false", false],
    ["an empty array", []],
    ["an empty object", {}],
  ];
  const VALID_TYPES: Record<string, readonly string[]> = {
    kind: [],
    isSent: ["true", "false"],
    current: [],
    pricesChanged: ["true", "false"],
    replacementsRequired: ["an empty array"],
    removedAccessories: ["an empty array"],
  };
  const MISTYPED = TOP_LEVEL_MEMBERS.flatMap((name) =>
    WRONG_TYPES.filter(
      ([description]) => !VALID_TYPES[name]?.includes(description),
    ).map(([description, value]) => [name, description, value] as const),
  );

  it.each(MISTYPED)("with %s holding %s", async (name, _description, value) => {
    answerWithJson(200, withMember(VALID_ACTIVE, name, value));

    expect(await FETCHING_PRICE_NOTICE_CLIENT.read(DESIGN_ID)).toEqual(
      UNAVAILABLE,
    );
  });

  it.each([
    ["null", "null"],
    ["an array holding a valid notice", JSON.stringify([VALID_ACTIVE])],
    ["a string", '"active-version"'],
    ["a number", "7"],
    ["true", "true"],
    ["an empty object", "{}"],
    ["an empty body", ""],
    ["html", "<html><body>502</body></html>"],
    [
      "an own __proto__ member standing in for the members",
      '{"__proto__":{"kind":"no-active-version","isSent":true}}',
    ],
    ["the arm name alone", '{"kind":"active-version"}'],
    ["isSent alone", '{"isSent":true}'],
  ])("with a body that is %s", async (_name, text) => {
    answerWithText(200, text);

    expect(await FETCHING_PRICE_NOTICE_CLIENT.read(DESIGN_ID)).toEqual(
      UNAVAILABLE,
    );
  });

  it.each([
    ["no version", withMember(PAIR, "versionId", undefined)],
    ["a null version", withMember(PAIR, "versionId", null)],
    ["a numeric version", withMember(PAIR, "versionId", 3)],
    ["an empty version", withMember(PAIR, "versionId", "")],
    ["no revision", withMember(PAIR, "availabilityRevision", undefined)],
    ["a numeric revision", withMember(PAIR, "availabilityRevision", 4)],
    ["a negative revision", withMember(PAIR, "availabilityRevision", "-1")],
    ["a fractional revision", withMember(PAIR, "availabilityRevision", "1.5")],
    ["a padded revision", withMember(PAIR, "availabilityRevision", " 4")],
    ["a leading zero", withMember(PAIR, "availabilityRevision", "04")],
    [
      "a revision wider than a bigint",
      withMember(PAIR, "availabilityRevision", "9223372036854775808"),
    ],
    [
      "a revision with a trailing newline",
      { ...PAIR, availabilityRevision: "4\n" },
    ],
  ])("with a current stamping %s", async (_name, current) => {
    answerWithJson(200, withMember(VALID_ACTIVE, "current", current));

    expect(await FETCHING_PRICE_NOTICE_CLIENT.read(DESIGN_ID)).toEqual(
      UNAVAILABLE,
    );
  });

  it.each([
    ["a null member", [null]],
    ["a text member", ["material"]],
    ["a nested array member", [[]]],
    ["an empty object", [{}]],
    [
      "an item with no remaining",
      [{ item: { kind: "material", tierId: "a" } }],
    ],
    ["remaining with no item", [{ remaining: [] }]],
    [
      "remaining that is not a list",
      [{ item: { kind: "hardware", tierId: "a" }, remaining: {} }],
    ],
    ["a null item", [{ item: null, remaining: [] }]],
    [
      "an item of an unknown kind",
      [{ item: { kind: "colour", tierId: "a" }, remaining: [] }],
    ],
    [
      "an item whose kind is an Object.prototype name",
      [{ item: { kind: "toString", tierId: "a" }, remaining: [] }],
    ],
    [
      "an item whose kind is constructor",
      [{ item: { kind: "constructor", tierId: "a" }, remaining: [] }],
    ],
    [
      "an item whose kind is a number",
      [{ item: { kind: 1, tierId: "a" }, remaining: [] }],
    ],
    [
      "an item with a numeric id",
      [{ item: { kind: "material", tierId: 1 }, remaining: [] }],
    ],
    [
      "an item with a null id",
      [{ item: { kind: "material", tierId: null }, remaining: [] }],
    ],
    [
      "an item naming its id by the wrong member",
      [{ item: { kind: "material", finishId: "a" }, remaining: [] }],
    ],
    [
      "a remaining entry that is text",
      [{ item: { kind: "material", tierId: "a" }, remaining: ["melamine"] }],
    ],
    [
      "a remaining entry with no id",
      [
        {
          item: { kind: "material", tierId: "a" },
          remaining: [{ kind: "material" }],
        },
      ],
    ],
    [
      "one good member and one bad",
      [
        { item: { kind: "material", tierId: "a" }, remaining: [] },
        { item: { kind: "material", tierId: 9 }, remaining: [] },
      ],
    ],
  ])("with replacements holding %s", async (_name, replacementsRequired) => {
    answerWithJson(
      200,
      withMember(VALID_ACTIVE, "replacementsRequired", replacementsRequired),
    );

    expect(await FETCHING_PRICE_NOTICE_CLIENT.read(DESIGN_ID)).toEqual(
      UNAVAILABLE,
    );
  });

  it.each([
    ["a null member", [null]],
    ["a text member", ["dishDryingRack"]],
    ["an empty object", [{}]],
    ["a numeric id", [{ accessoryId: 1 }]],
    ["a null id", [{ accessoryId: null }]],
    ["a null name", [{ accessoryId: "a", authoredName: null }]],
    ["a numeric name", [{ accessoryId: "a", authoredName: 1 }]],
    ["an object name", [{ accessoryId: "a", authoredName: {} }]],
    ["an array name", [{ accessoryId: "a", authoredName: ["Raft"] }]],
    [
      "a good member and a bad one: the list is discarded whole, never trimmed",
      [{ accessoryId: "dishDryingRack" }, { accessoryId: 5 }],
    ],
  ])("with removed accessories holding %s", async (_name, accessories) => {
    answerWithJson(
      200,
      withMember(VALID_ACTIVE, "removedAccessories", accessories),
    );

    expect(await FETCHING_PRICE_NOTICE_CLIENT.read(DESIGN_ID)).toEqual(
      UNAVAILABLE,
    );
  });
});

describe("reading: a 200 with a member beyond the wire's keys (tolerated by ruling, so a wire widening does not blind the client)", () => {
  it("never lets an unknown member reach what it does return", async () => {
    answerWithJson(200, withMember(VALID_ACTIVE, "designDocument", { a: 1 }));

    const read = await FETCHING_PRICE_NOTICE_CLIENT.read(DESIGN_ID);

    expect(JSON.stringify(read)).not.toContain("designDocument");
  });
});

describe("reading: a body or a transport that is hostile still answers unavailable and never throws", () => {
  it("reads a 3 MB body of junk as unavailable", async () => {
    answerWithText(200, JSON.stringify("x".repeat(3_000_000)));

    expect(await FETCHING_PRICE_NOTICE_CLIENT.read(DESIGN_ID)).toEqual(
      UNAVAILABLE,
    );
  });

  it("reads a 200 000 member list of junk as unavailable", async () => {
    answerWithJson(
      200,
      withMember(
        VALID_ACTIVE,
        "replacementsRequired",
        Array.from({ length: 200_000 }, () => 0),
      ),
    );

    expect(await FETCHING_PRICE_NOTICE_CLIENT.read(DESIGN_ID)).toEqual(
      UNAVAILABLE,
    );
  });

  it("reads a body nested a million arrays deep as unavailable", async () => {
    answerWithText(200, "[".repeat(1_000_000) + "]".repeat(1_000_000));

    expect(await FETCHING_PRICE_NOTICE_CLIENT.read(DESIGN_ID)).toEqual(
      UNAVAILABLE,
    );
  });

  it("reads a fetch that throws before returning a promise as unavailable", async () => {
    vi.stubGlobal("fetch", () => {
      throw new TypeError("blocked by the browser");
    });

    expect(await FETCHING_PRICE_NOTICE_CLIENT.read(DESIGN_ID)).toEqual(
      UNAVAILABLE,
    );
  });

  it.each([undefined, null, "offline", 0, { name: "AbortError" }])(
    "reads a request rejected with %j as unavailable",
    async (reason) => {
      // The point is a rejection that is not an Error, which browsers do produce.
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      stubFetch(() => Promise.reject(reason));

      expect(await FETCHING_PRICE_NOTICE_CLIENT.read(DESIGN_ID)).toEqual(
        UNAVAILABLE,
      );
    },
  );

  it("makes exactly one request per read, with no retry on a failure", async () => {
    const stub = stubFetch(() => Promise.reject(new TypeError("offline")));

    await FETCHING_PRICE_NOTICE_CLIENT.read(DESIGN_ID);

    expect(stub).toHaveBeenCalledTimes(1);
  });

  it("makes exactly one request per read, with no retry on a 503", async () => {
    answerWithJson(503, { status: "unavailable" });
    const stub = vi.mocked(fetch);

    await FETCHING_PRICE_NOTICE_CLIENT.read(DESIGN_ID);

    expect(stub).toHaveBeenCalledTimes(1);
  });

  it("sends a body-less GET to the design's own route and nowhere else", async () => {
    const stub = stubFetch(() =>
      Promise.resolve(new Response(JSON.stringify(VALID_ACTIVE))),
    );

    await FETCHING_PRICE_NOTICE_CLIENT.read(DESIGN_ID);

    const [address, init] = stub.mock.calls[0] as [string, RequestInit];
    expect(address).toBe(`/api/designs/${DESIGN_ID}/price-notice`);
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });
});

describe("acknowledging: only a 200 stating a stamp has acknowledged", () => {
  const ACKNOWLEDGED = { acknowledged: PAIR };

  it("is acknowledged for a 200 stating the stamp (the sweep is not vacuous)", async () => {
    answerWithJson(200, ACKNOWLEDGED);

    expect(
      await FETCHING_PRICE_NOTICE_CLIENT.acknowledge(DESIGN_ID, PAIR),
    ).toEqual({ kind: "acknowledged" });
  });

  it("has failed for every status from 201 to 599 but 400, carrying a valid acknowledgement", async () => {
    const offenders: number[] = [];
    const statuses = ALL_ANSWERABLE_STATUSES.filter(
      (status) => status !== 200 && status !== 400,
    );
    for (const status of statuses) {
      answerWithText(
        status,
        BODYLESS_STATUSES.has(status) ? null : JSON.stringify(ACKNOWLEDGED),
      );
      const outcome = await FETCHING_PRICE_NOTICE_CLIENT.acknowledge(
        DESIGN_ID,
        PAIR,
      );
      if (outcome.kind !== "failed") offenders.push(status);
    }

    expect(offenders).toEqual([]);
  });

  it.each([
    ["no body at all", ""],
    ["null", "null"],
    ["an empty object", "{}"],
    ["acknowledged: null", '{"acknowledged":null}'],
    ["acknowledged as an array", `{"acknowledged":[${JSON.stringify(PAIR)}]}`],
    [
      "a stamp with no version",
      '{"acknowledged":{"availabilityRevision":"4"}}',
    ],
    [
      "a stamp with an empty version",
      '{"acknowledged":{"versionId":"","availabilityRevision":"4"}}',
    ],
    [
      "a stamp with a malformed revision",
      '{"acknowledged":{"versionId":"v","availabilityRevision":"04"}}',
    ],
    ["the stamp at the top level", JSON.stringify(PAIR)],
  ])("has failed for a 200 with %s", async (_name, text) => {
    answerWithText(200, text);

    expect(
      await FETCHING_PRICE_NOTICE_CLIENT.acknowledge(DESIGN_ID, PAIR),
    ).toEqual(FAILED);
  });

  it.each([
    ["unknown-version", { kind: "refused", refusal: "unknown-version" }],
    ["revision-ahead", { kind: "refused", refusal: "revision-ahead" }],
  ])("is refused for a 400 saying %s", async (word, outcome) => {
    answerWithJson(400, { status: word });

    expect(
      await FETCHING_PRICE_NOTICE_CLIENT.acknowledge(DESIGN_ID, PAIR),
    ).toEqual(outcome);
  });

  it.each([
    ["an Object.prototype name", { status: "toString" }],
    ["an empty word", { status: "" }],
    ["a null word", { status: null }],
    ["a word in a list", { status: ["unknown-version"] }],
    ["the word in the wrong member", { state: "unknown-version" }],
    ["the word nested", { status: { status: "unknown-version" } }],
    ["another case", { status: "UNKNOWN-VERSION" }],
    ["trailing space", { status: "unknown-version " }],
    ["a bare string", "unknown-version"],
    ["null", null],
  ])("has failed, never refused, for a 400 with %s", async (_name, body) => {
    answerWithJson(400, body);

    expect(
      await FETCHING_PRICE_NOTICE_CLIENT.acknowledge(DESIGN_ID, PAIR),
    ).toEqual(FAILED);
  });

  it("has failed when the transport throws before returning a promise", async () => {
    vi.stubGlobal("fetch", () => {
      throw new TypeError("blocked");
    });

    expect(
      await FETCHING_PRICE_NOTICE_CLIENT.acknowledge(DESIGN_ID, PAIR),
    ).toEqual(FAILED);
  });

  it("posts the two members as JSON, once, and nothing else of a stamp that carries more", async () => {
    const stub = stubFetch(() =>
      Promise.resolve(new Response(JSON.stringify(ACKNOWLEDGED))),
    );
    const generous = {
      ...PAIR,
      current: { versionId: "other", availabilityRevision: "9" },
      replacementsRequired: [1],
    };

    await FETCHING_PRICE_NOTICE_CLIENT.acknowledge(DESIGN_ID, generous);

    expect(stub).toHaveBeenCalledTimes(1);
    const [, init] = stub.mock.calls[0] as [string, RequestInit];
    expect(
      Object.keys(JSON.parse(init.body as string) as object).sort(),
    ).toEqual(["availabilityRevision", "versionId"]);
  });

  it("makes one request per call, with no retry on a failure", async () => {
    const stub = stubFetch(() => Promise.reject(new TypeError("offline")));

    await FETCHING_PRICE_NOTICE_CLIENT.acknowledge(DESIGN_ID, PAIR);

    expect(stub).toHaveBeenCalledTimes(1);
  });
});
