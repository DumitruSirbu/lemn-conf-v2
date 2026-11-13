import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fc from "fast-check";

import {
  DEFAULT_HANDLE,
  isRevisionShape,
  SAMPLE_PRICE_BOOK,
  type ItemRef,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import {
  GET as DEFAULTS_GET,
  PUT as DEFAULTS_PUT,
} from "@/app/api/staff/prices/defaults/route";
import { GET as STATE_GET } from "@/app/api/staff/prices/route";
import { STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY } from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import {
  defaultsSaveOutcomeOf,
  FETCHING_KITCHEN_DEFAULTS_CLIENT,
} from "@/price-dashboard/fetching-kitchen-defaults-client";
import type {
  KitchenDefaultsSaveRequestWire,
  KitchenDefaultsWire,
} from "@/price-dashboard/price-dashboard-wire-contract";

import {
  accountRequest,
  captureConsole,
  currentAccountWorld,
  freshAccountWorld,
  limiterLedger,
} from "../../../support/account-world";
import {
  administrator,
  publishNextVersion,
  writeWithoutJudgement,
  type Administrator,
} from "../../../support/availability-route-world";
import { FIXED_DEFAULTS } from "../../../support/kitchen-defaults-route-world";
import {
  currentPriceDashboardWorld,
  freshPriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import { freshStaffWorld, signedInAs } from "../../../support/staff-world";
import { stateOf } from "../../../price-dashboard/dashboard-state-fixture";

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/staff/staff-audit-store-instance", () =>
  import("../../../support/staff-world").then((world) =>
    world.staffAuditStoreModule(),
  ),
);
vi.mock("@/lib/server/price-stores", () =>
  import("../../../support/price-dashboard-world").then((world) =>
    world.priceStoresModule(),
  ),
);

/**
 * QA of M10 R4b2 item 2, `fetching-kitchen-defaults-client.ts`. The pure sorter is attacked with arbitrary statuses
 * and bodies. The save and the facts read again are attacked against the real route handlers over the fake stores, for
 * every answer the routes can give, including the ones the developer's table stubs.
 */

const NETWORK = { "x-forwarded-for": "192.0.2.10" };
const DEFAULTS_ADDRESS = "/api/staff/prices/defaults";
const STATE_ADDRESS = "/api/staff/prices";
const EVERY_KIND_OF_ITEM: readonly ItemRef[] = [
  { kind: "material", tierId: "material.veneer" },
  { kind: "hardware", tierId: "hardware.soft-close" },
  { kind: "finish", finishId: "veneer.stejar" },
  { kind: "handle", handle: "black" },
  { kind: "accessory", accessoryId: "dishDryingRack" },
];

let cookie: string | undefined;
let staff: Administrator;
let afterDefaultsRead: () => Promise<void> = () => Promise.resolve();

async function routeFetch(
  address: string,
  init?: RequestInit,
): Promise<Response> {
  const method = init?.method ?? "GET";
  const request = accountRequest(address, {
    method,
    headers: NETWORK,
    ...(cookie === undefined ? {} : { cookie }),
    ...(init?.body === undefined ? {} : { json: init.body as string }),
  });
  if (address === STATE_ADDRESS) return STATE_GET(request);
  if (address !== DEFAULTS_ADDRESS) throw new Error(`no route: ${address}`);
  if (method === "PUT") return DEFAULTS_PUT(request);
  const answer = await DEFAULTS_GET(request);
  await afterDefaultsRead();
  return answer;
}

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  await freshPriceDashboardWorld();
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  vi.stubGlobal("fetch", routeFetch);
  afterDefaultsRead = () => Promise.resolve();
  staff = await administrator();
  cookie = staff.cookie;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function factsOrFail() {
  const facts = await FETCHING_KITCHEN_DEFAULTS_CLIENT.readAgain();
  if (facts === undefined) throw new Error("the facts cannot be read");
  return facts;
}

async function requestWith(
  defaults: Readonly<Record<string, unknown>> = {},
): Promise<KitchenDefaultsSaveRequestWire> {
  const { state } = await factsOrFail();
  return {
    expectedRevision: state.revision,
    expectedAvailabilityRevision: state.availabilityRevision,
    defaults: { ...state.defaults, ...defaults } as KitchenDefaultsWire,
  };
}

describe("every answer the real PUT route can give a save", () => {
  it("is failed for a 429 of the draft bucket the save shares, and nothing is saved", async () => {
    const request = await requestWith({ handle: "black" });
    limiterLedger.refusing.set(STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY.name, 5);

    const outcome = await FETCHING_KITCHEN_DEFAULTS_CLIENT.save(request);

    expect(outcome).toEqual({ kind: "failed" });
    limiterLedger.refusing.clear();
    expect((await factsOrFail()).state.saved).toBe(false);
  });

  it("is failed for a 503 whose audit row cannot be written, and nothing is saved", async () => {
    const request = await requestWith({ handle: "black" });
    const stage = vi
      .spyOn(currentPriceDashboardWorld().ledger, "stage")
      .mockRejectedValue(new Error("the audit row cannot be staged"));

    const outcome = await FETCHING_KITCHEN_DEFAULTS_CLIENT.save(request);

    expect(outcome).toEqual({ kind: "failed" });
    stage.mockRestore();
    expect((await factsOrFail()).state.saved).toBe(false);
  });

  it("is invalid, naming the finish, for a colour the saved material's palette does not hold (400 FINISH_NOT_IN_PALETTE)", async () => {
    const request = await requestWith({
      materialTierId: "material.veneer",
      finish: { kind: "palette", id: "pal.alb" },
    });

    const outcome = await FETCHING_KITCHEN_DEFAULTS_CLIENT.save(request);

    expect(outcome).toEqual({
      kind: "invalid",
      issues: [{ field: "finish", code: "FINISH_NOT_IN_PALETTE" }],
    });
  });

  const UNKNOWN = (field: string) => ({
    kind: "invalid",
    issues: [{ field, code: "UNKNOWN_VALUE" }],
  });
  it.each([
    ["cabinetDepthMm", 650, UNKNOWN("cabinetDepthMm")],
    ["handle", "gold", UNKNOWN("handle")],
    ["topRowHandle", "gold", UNKNOWN("topRowHandle")],
    [
      "materialTierId",
      "material.nonexistent-class",
      {
        kind: "item-unavailable",
        item: { kind: "material", tierId: "material.nonexistent-class" },
      },
    ],
  ])(
    "is exactly the stand-in's outcome for a %s the route refuses, and nothing is saved",
    async (member, value, expected) => {
      const request = await requestWith({ [member]: value });

      const outcome = await FETCHING_KITCHEN_DEFAULTS_CLIENT.save(request);

      expect(outcome).toEqual(expected);
      expect((await factsOrFail()).state.saved).toBe(false);
    },
  );

  it("is failed for a 401 without a session and for one whose session has ended", async () => {
    const request = await requestWith({ handle: "black" });
    cookie = undefined;
    const withoutSession = await FETCHING_KITCHEN_DEFAULTS_CLIENT.save(request);
    cookie = staff.cookie;
    currentAccountWorld().advance(7 * 24 * 60 * 60 * 1000);
    const expired = await FETCHING_KITCHEN_DEFAULTS_CLIENT.save(request);

    expect([withoutSession, expired]).toEqual([
      { kind: "failed" },
      { kind: "failed" },
    ]);
  });

  it("is failed for a 403 of an operator", async () => {
    const request = await requestWith({ handle: "black" });
    cookie = (await signedInAs({ role: "operator" })).session.cookie;

    expect(await FETCHING_KITCHEN_DEFAULTS_CLIENT.save(request)).toEqual({
      kind: "failed",
    });
  });

  it("is failed for a 409 no-active-version, a word the screen has no outcome for", async () => {
    const request = await requestWith({ handle: "black" });
    await freshPriceDashboardWorld({ isPublished: false });

    expect(await FETCHING_KITCHEN_DEFAULTS_CLIENT.save(request)).toEqual({
      kind: "failed",
    });
  });

  it("is saved with both new revisions that the next read states, and a repeat of the same save is saved with the same revisions", async () => {
    const request = await requestWith({ handle: "black" });

    const first = await FETCHING_KITCHEN_DEFAULTS_CLIENT.save(request);
    const again = await FETCHING_KITCHEN_DEFAULTS_CLIENT.save(request);

    if (first.kind !== "saved") throw new Error("the save was not accepted");
    const { state } = await factsOrFail();
    expect(first.saved).toEqual({
      revision: state.revision,
      availabilityRevision: state.availabilityRevision,
    });
    expect(again).toEqual(first);
  });
});

describe("the facts read again, against the real routes", () => {
  it("name every kind of item that is switched off, rebuilt as its kind and its one id", async () => {
    for (const item of EVERY_KIND_OF_ITEM) {
      await writeWithoutJudgement(staff, item, false);
    }

    const facts = await factsOrFail();

    expect(facts.disabled).toEqual(
      expect.arrayContaining([...EVERY_KIND_OF_ITEM]),
    );
    expect(facts.disabled).toHaveLength(EVERY_KIND_OF_ITEM.length);
    for (const item of facts.disabled) {
      expect(Object.keys(item)).toHaveLength(2);
    }
  });

  it("are nothing when a version is published between the two reads: a publish moves the head, so the book is never mixed", async () => {
    const before = (await factsOrFail()).state.availabilityRevision;
    afterDefaultsRead = async () => {
      afterDefaultsRead = () => Promise.resolve();
      const { stores } = currentPriceDashboardWorld();
      const active = await stores.priceBook.readActive();
      if (active.kind !== "found") throw new Error("no active version");
      await publishNextVersion(staff, active.version.book as PriceBook);
    };

    const facts = await FETCHING_KITCHEN_DEFAULTS_CLIENT.readAgain();

    expect(facts).toBeUndefined();
    const after = (await factsOrFail()).state.availabilityRevision;
    expect(after).not.toBe(before);
  });

  it("are nothing when the saved row is not settings (the route answers 503), and the state is not asked for", async () => {
    vi.spyOn(currentPriceDashboardWorld().defaults, "read").mockResolvedValue({
      kind: "saved",
      saved: {
        revision: "3",
        defaults: { handle: "STORED-JUNK-4471" },
        savedAt: new Date(0),
      },
    });
    const asked: string[] = [];
    const real = routeFetch;
    vi.stubGlobal("fetch", (address: string, init?: RequestInit) => {
      asked.push(address);
      return real(address, init);
    });

    const facts = await FETCHING_KITCHEN_DEFAULTS_CLIENT.readAgain();

    expect(facts).toBeUndefined();
    expect(asked).toEqual([DEFAULTS_ADDRESS]);
  });

  it("states a saved whole that the client reads back as the six values the route was given", async () => {
    const request = await requestWith({ handle: "black", cabinetDepthMm: 700 });
    expect((await FETCHING_KITCHEN_DEFAULTS_CLIENT.save(request)).kind).toBe(
      "saved",
    );

    const { state } = await factsOrFail();

    expect(state.saved).toBe(true);
    expect(state.defaults).toEqual({
      ...FIXED_DEFAULTS,
      handle: "black",
      cabinetDepthMm: 700,
    });
    expect(DEFAULT_HANDLE).not.toBe("black");
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The sorter on arbitrary answers

describe("the sorter of a save's answer, on arbitrary statuses and bodies", () => {
  const REVISION = fc.nat().map(String);
  const STATUS = fc.oneof(
    fc.constantFrom(200, 400, 401, 403, 409, 429, 503),
    fc.integer({ min: 100, max: 599 }),
  );
  const WORDS = fc.oneof(
    fc.constantFrom(
      "changed-meanwhile",
      "availability-changed-meanwhile",
      "item-unavailable",
      "no-active-version",
      "invalid-input",
    ),
    fc.jsonValue(),
  );
  const ITEM = fc.oneof(
    fc.record({
      kind: fc.constantFrom(
        "material",
        "hardware",
        "finish",
        "handle",
        "accessory",
      ),
      tierId: fc.string(),
      finishId: fc.string(),
      handle: fc.constantFrom("steel", "black", "push", "gold"),
      accessoryId: fc.string(),
    }),
    fc.jsonValue(),
  );
  const ANY_BODY = fc.oneof(
    fc.constant(undefined),
    fc.jsonValue(),
    fc.record({
      revision: fc.oneof(REVISION, fc.jsonValue()),
      availabilityRevision: fc.oneof(REVISION, fc.jsonValue()),
      status: WORDS,
      issues: fc.jsonValue(),
      item: ITEM,
    }),
  );

  it("answers saved for every 200 whose two revisions are revisions, carrying exactly those two, and for no other answer", () => {
    fc.assert(
      fc.property(STATUS, ANY_BODY, (status, body) => {
        const outcome = defaultsSaveOutcomeOf({ status, body });
        const members = body as
          | { revision?: unknown; availabilityRevision?: unknown }
          | undefined;
        const isWholeSave =
          status === 200 &&
          isRevisionShape(members?.revision) &&
          isRevisionShape(members.availabilityRevision);

        expect(outcome.kind === "saved").toBe(isWholeSave);
        if (outcome.kind === "saved") {
          expect(outcome.saved).toEqual({
            revision: members?.revision,
            availabilityRevision: members?.availabilityRevision,
          });
        }
      }),
      { numRuns: 2000 },
    );
  });

  it("answers failed for every status the routes' words do not carry (not 200, 400 or 409), whatever the body says", () => {
    fc.assert(
      fc.property(
        fc
          .integer({ min: 100, max: 599 })
          .filter((n) => ![200, 400, 409].includes(n)),
        ANY_BODY,
        (status, body) => {
          expect(defaultsSaveOutcomeOf({ status, body })).toEqual({
            kind: "failed",
          });
        },
      ),
      { numRuns: 300 },
    );
  });

  it("answers conflict for exactly the two changed-meanwhile words, item-unavailable for exactly an item of a known kind with its id (handles among the handles), and failed otherwise", () => {
    fc.assert(
      fc.property(ANY_BODY, (body) => {
        const outcome = defaultsSaveOutcomeOf({ status: 409, body });

        const word = (body as { status?: unknown } | undefined)?.status;
        const isConflictWord =
          word === "changed-meanwhile" ||
          word === "availability-changed-meanwhile";
        expect(outcome.kind === "conflict").toBe(isConflictWord);
        if (outcome.kind === "item-unavailable") {
          expect(word).toBe("item-unavailable");
          expect(Object.keys(outcome.item)).toHaveLength(2);
        }
        if (word !== "item-unavailable" && !isConflictWord) {
          expect(outcome).toEqual({ kind: "failed" });
        }
      }),
      { numRuns: 600 },
    );
  });

  it("answers item-unavailable for a named item of each kind and failed for one that names no id, over a sweep of ids", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "material",
          "hardware",
          "finish",
          "handle",
          "accessory",
        ),
        fc.string(),
        (kind, id) => {
          const member = {
            material: "tierId",
            hardware: "tierId",
            finish: "finishId",
            handle: "handle",
            accessory: "accessoryId",
          }[kind];
          const outcome = defaultsSaveOutcomeOf({
            status: 409,
            body: { status: "item-unavailable", item: { kind, [member]: id } },
          });
          const isNamed =
            id !== "" &&
            (kind !== "handle" || ["steel", "black", "push"].includes(id));

          expect(outcome.kind === "item-unavailable").toBe(isNamed);
        },
      ),
      { numRuns: 400 },
    );
  });

  it("does not read an inherited or a prototype-named member: `__proto__` and `constructor` name nothing", () => {
    const hostile = JSON.parse(
      '{"status":"item-unavailable","item":{"__proto__":{"kind":"material","tierId":"material.veneer"}}}',
    ) as unknown;
    const inheritedKind: unknown = Object.create({
      kind: "material",
      tierId: "x",
    });
    const constructorKind = {
      status: "item-unavailable",
      item: { kind: "constructor", tierId: "x" },
    };

    expect(defaultsSaveOutcomeOf({ status: 409, body: hostile })).toEqual({
      kind: "failed",
    });
    expect(
      defaultsSaveOutcomeOf({
        status: 409,
        body: { status: "item-unavailable", item: inheritedKind },
      }),
    ).toEqual({ kind: "failed" });
    expect(
      defaultsSaveOutcomeOf({ status: 409, body: constructorKind }),
    ).toEqual({ kind: "failed" });
  });

  it("rebuilds a handle only when it is one of the handles, and drops every member beyond the kind and the id", () => {
    const named = (item: unknown) =>
      defaultsSaveOutcomeOf({
        status: 409,
        body: { status: "item-unavailable", item },
      });

    expect(named({ kind: "handle", handle: "gold-plated" })).toEqual({
      kind: "failed",
    });
    expect(
      named({ kind: "handle", handle: "black", note: "x", extra: 1 }),
    ).toEqual({
      kind: "item-unavailable",
      item: { kind: "handle", handle: "black" },
    });
    expect(named({ kind: "material", tierId: "" })).toEqual({ kind: "failed" });
    expect(named({ kind: "material", tierId: 7 })).toEqual({ kind: "failed" });
  });

  it("keeps only the issues whose field and code the route has, and is failed when none is", () => {
    const invalid = (issues: unknown) =>
      defaultsSaveOutcomeOf({ status: 400, body: { issues } });

    expect(
      invalid([
        { field: "handle", code: "UNKNOWN_VALUE" },
        { field: "__proto__", code: "UNKNOWN_VALUE" },
        { field: "handle", code: "SOMETHING_ELSE" },
        { field: "defaults", code: "UNKNOWN_VALUE" },
        null,
        7,
      ]),
    ).toEqual({
      kind: "invalid",
      issues: [{ field: "handle", code: "UNKNOWN_VALUE" }],
    });
    expect(invalid([])).toEqual({ kind: "failed" });
    expect(invalid("handle")).toEqual({ kind: "failed" });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The two reads of readAgain, answered by hand

describe("the facts read again, on arbitrary pairs of answers", () => {
  const DEFAULTS = { ...FIXED_DEFAULTS };

  function defaultsBody(head: string, overrides: object = {}): unknown {
    return {
      revision: "2",
      availabilityRevision: head,
      saved: true,
      defaults: DEFAULTS,
      ...overrides,
    };
  }

  function stateBody(head: string, disabled: unknown = []): unknown {
    const state = stateOf();
    return {
      ...state,
      active: { ...state.active, availability: { revision: head, disabled } },
    };
  }

  function stateWithBook(book: object): unknown {
    const state = stateOf();
    return {
      ...state,
      active: {
        ...state.active,
        book,
        availability: { revision: "1", disabled: [] },
      },
    };
  }

  function stubAnswers(defaults: () => Response, state: () => Response) {
    const asked: [string, string | undefined][] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((address: string, init?: RequestInit) => {
        asked.push([address, init?.method]);
        return Promise.resolve(
          address === DEFAULTS_ADDRESS ? defaults() : state(),
        );
      }),
    );
    return asked;
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status });

  it("joins the two answers exactly when their availability heads are equal, for any pair of revisions", async () => {
    const pairsOfHeads = fc.oneof(
      fc.nat(10_000).map((head) => [head, head] as const),
      fc.tuple(fc.nat(10_000), fc.nat(10_000)),
    );
    await fc.assert(
      fc.asyncProperty(pairsOfHeads, async ([one, other]) => {
        stubAnswers(
          () => json(defaultsBody(String(one))),
          () => json(stateBody(String(other))),
        );

        const facts = await FETCHING_KITCHEN_DEFAULTS_CLIENT.readAgain();

        expect(facts !== undefined).toBe(one === other);
        if (facts !== undefined) {
          expect(facts.state.availabilityRevision).toBe(String(one));
        }
      }),
      { numRuns: 120 },
    );
  });

  it("asks the defaults and then the state, both as GET, and asks the state for nothing if the defaults failed", async () => {
    const asked = stubAnswers(
      () => json({ status: "unavailable" }, 503),
      () => json(stateBody("1")),
    );

    expect(await FETCHING_KITCHEN_DEFAULTS_CLIENT.readAgain()).toBeUndefined();
    expect(asked).toEqual([[DEFAULTS_ADDRESS, "GET"]]);

    const both = stubAnswers(
      () => json(defaultsBody("1")),
      () => json(stateBody("1")),
    );
    expect(await FETCHING_KITCHEN_DEFAULTS_CLIENT.readAgain()).toBeDefined();
    expect(both).toEqual([
      [DEFAULTS_ADDRESS, "GET"],
      [STATE_ADDRESS, "GET"],
    ]);
  });

  const HOSTILE_DEFAULTS: readonly [string, object][] = [
    ["a saved flag that is a string", { saved: "true" }],
    ["a saved flag that is missing", { saved: undefined }],
    ["a revision that is a number", { revision: 2 }],
    ["a revision that is not a revision", { revision: "-1" }],
    ["an availability revision that is not one", { availabilityRevision: "x" }],
    ["no defaults", { defaults: undefined }],
    [
      "a depth that is a string",
      { defaults: { ...DEFAULTS, cabinetDepthMm: "600" } },
    ],
    ["a handle nobody sells", { defaults: { ...DEFAULTS, handle: "gold" } }],
    [
      "a missing top-row handle",
      { defaults: { ...DEFAULTS, topRowHandle: undefined } },
    ],
    ["a missing finish", { defaults: { ...DEFAULTS, finish: undefined } }],
    [
      "a missing material tier",
      { defaults: { ...DEFAULTS, materialTierId: undefined } },
    ],
    [
      "a missing hardware tier",
      { defaults: { ...DEFAULTS, hardwareTierId: undefined } },
    ],
  ];

  it.each(HOSTILE_DEFAULTS)(
    "is nothing when the defaults answer holds %s",
    async (_name, overrides) => {
      stubAnswers(
        () => json(defaultsBody("1", overrides)),
        () => json(stateBody("1")),
      );

      expect(
        await FETCHING_KITCHEN_DEFAULTS_CLIENT.readAgain(),
      ).toBeUndefined();
    },
  );

  const HOSTILE_DISABLED: readonly [string, unknown][] = [
    ["a disabled list that is an object", {}],
    ["one entry that is not an item", [{ kind: "material", tierId: "a" }, 7]],
    ["one entry of a kind nobody has", [{ kind: "constructor", tierId: "a" }]],
    ["one entry with no id", [{ kind: "material" }]],
    ["one handle that is not a handle", [{ kind: "handle", handle: "gold" }]],
    ["a null entry", [null]],
  ];

  it.each(HOSTILE_DISABLED)(
    "is nothing, not a shorter list, when the state holds %s",
    async (_name, disabled) => {
      stubAnswers(
        () => json(defaultsBody("1")),
        () => json(stateBody("1", disabled)),
      );

      expect(
        await FETCHING_KITCHEN_DEFAULTS_CLIENT.readAgain(),
      ).toBeUndefined();
    },
  );

  it.each([
    [
      "a material group that is not a list of tiers",
      { material: { tiers: "none" } },
    ],
    ["a tier without a name", { material: { tiers: [{ tierId: "a" }] } }],
    ["no hardware group", { hardware: undefined }],
  ])("is nothing when the state's book holds %s", async (_name, breakage) => {
    stubAnswers(
      () => json(defaultsBody("1")),
      () => json(stateWithBook({ ...SAMPLE_PRICE_BOOK, ...breakage })),
    );

    expect(await FETCHING_KITCHEN_DEFAULTS_CLIENT.readAgain()).toBeUndefined();
  });

  it("is nothing, and throws nothing, when a read cannot be made, answers with a body that is not JSON, or ends in the middle", async () => {
    const failures: (() => Promise<Response>)[] = [
      () => Promise.reject(new TypeError("network down")),
      () => Promise.reject(new DOMException("aborted", "AbortError")),
      () => Promise.resolve(new Response("<html>", { status: 200 })),
      () => Promise.resolve(new Response(null, { status: 200 })),
    ];
    for (const failure of failures) {
      vi.stubGlobal("fetch", () => failure());
      expect(
        await FETCHING_KITCHEN_DEFAULTS_CLIENT.readAgain(),
      ).toBeUndefined();
      expect(
        await FETCHING_KITCHEN_DEFAULTS_CLIENT.save({
          expectedRevision: "0",
          expectedAvailabilityRevision: "0",
          defaults: DEFAULTS as KitchenDefaultsWire,
        }),
      ).toEqual({ kind: "failed" });
    }
    stubAnswers(
      () => json(defaultsBody("1")),
      () => Promise.reject(new TypeError("network down")) as never,
    );
    expect(await FETCHING_KITCHEN_DEFAULTS_CLIENT.readAgain()).toBeUndefined();
  });
});
