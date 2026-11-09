import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ALWAYS_PRESENT_ACCESSORY_ID,
  SAMPLE_PRICE_BOOK,
  type ItemRef,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import { NONE_SAVED, type ItemUsageProbe } from "@lemnaria/persistence";

import { USAGE_READ_DEADLINE_MS } from "@/lib/server/price-dashboard/item-usage-read";
import { STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY } from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  DRIVER_FAILURE_MARKER,
  captureConsole,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
  wireOf,
} from "../../../support/account-world";
import {
  changeRequest,
  currentDraftRevision,
  readUsage,
} from "../../../support/price-dashboard-requests";
import { PUT } from "@/app/api/staff/prices/draft/route";
import {
  saveBody,
  putDefaults,
} from "../../../support/kitchen-defaults-route-world";
import { deleting, plantDraft } from "../../../support/planted-draft";
import {
  freshPriceDashboardWorld,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import { freshStaffWorld, signedInAs } from "../../../support/staff-world";
import { linkedAccessory } from "../../../support/wide-price-book";

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
 * Adversarial QA of R4c2, the draft route taking `item-deleted` (Full + security). What the implementer's own file asserts
 * is not repeated: this one tries to make the route leak, skip a check, wait twice, hold the usage slot, or write on a
 * refusal. Each test names the request that would be a counterexample.
 */

const BOOK: PriceBook = {
  ...SAMPLE_PRICE_BOOK,
  linkedAccessories: [linkedAccessory("plinth-light")],
};
const VENEER: ItemRef = { kind: "material", tierId: "material.veneer" };
const PAINTED: ItemRef = { kind: "material", tierId: "material.painted-mdf" };
const PREMIUM: ItemRef = { kind: "hardware", tierId: "hardware.premium" };
const SOFT_CLOSE: ItemRef = { kind: "hardware", tierId: "hardware.soft-close" };
const PLINTH: ItemRef = { kind: "accessory", accessoryId: "plinth-light" };
const DELETABLE: readonly ItemRef[] = [
  VENEER,
  PAINTED,
  PREMIUM,
  SOFT_CLOSE,
  PLINTH,
];
const ROW_IDS = [
  "material.veneer",
  "material.painted-mdf",
  "hardware.premium",
  "hardware.soft-close",
  "plinth-light",
];

let prices: PriceDashboardWorld;
let cookie: string;
let tokenHash: string;
let console_: ReturnType<typeof captureConsole>;
let designCount = 0;

beforeEach(async () => {
  revisionOnHand = undefined;
  freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld({ book: BOOK });
  console_ = captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  const { session } = await signedInAs(
    { role: "administrator" },
    "administrator@example.test",
  );
  cookie = session.cookie;
  tokenHash = session.tokenHash;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function deletion(item: ItemRef, value: unknown = true) {
  return { address: { kind: "item-deleted", item }, value };
}

async function send(
  change: unknown,
  init: Parameters<typeof changeRequest>[0] = {},
  revision?: string,
): Promise<Response> {
  return PUT(
    changeRequest({
      cookie,
      json: {
        expectedDraftRevision:
          revision ?? revisionOnHand ?? (await currentDraftRevision()),
        change,
      },
      ...init,
    }),
  );
}

/** The revision a test read before it set its spies on the draft, so that sending does not read the draft itself. */
let revisionOnHand: string | undefined;

function deleteRow(item: ItemRef): Promise<Response> {
  return send(deletion(item));
}

function aDesignNaming(item: ItemRef, designId?: string): string {
  designCount += 1;
  const id = designId ?? `design-${String(designCount)}`;
  prices.designs.plant({
    designId: id,
    uses: [item],
    isDeletedByClient: false,
  });
  return id;
}

async function stateOfTheWorld() {
  return {
    versions: (await prices.stores.priceBook.listVersions({ page: 1 })).total,
    draft: await prices.stores.priceBook.readDraft(),
    auditRows: prices.ledger.heldEvents().length,
    availability: (await prices.stores.availability.readCurrent()).revision,
    defaults: await prices.stores.defaults.read(),
  };
}

type Probes = ItemUsageProbe[][];

/** Counts every ask of the usage reader, answering as `designs` would unless `answer` takes over. */
function spiesOnTheReaders() {
  const probes: Probes = [];
  const counting = vi.spyOn(prices.defaults, "countEach");
  counting.mockImplementation((asked) => {
    probes.push([...asked]);
    return Promise.resolve({
      counts: asked.map(({ item }) => ({
        item,
        designCount: prices.designs.countUsing(item),
      })),
      unreadableDesigns: 0,
    });
  });
  const readingDefaults = vi.spyOn(prices.defaults, "read");
  const readingDraft = vi.spyOn(prices.stores.priceBook, "readDraft");
  return { probes, counting, readingDefaults, readingDraft };
}

// ---------------------------------------------------------------------------------------------------------------------
// The closed body

describe("every refusal is the closed shape, whatever the row, the count or the design behind it", () => {
  const CLOSED_400 = (field: string, code: string) => ({
    status: "invalid-input",
    issues: [{ field, code }],
  });

  async function refusedAnswers(): Promise<
    { name: string; answer: Response; expected: unknown }[]
  > {
    aDesignNaming(VENEER, "design-secret-id-31415");
    aDesignNaming(PREMIUM, "design-secret-id-92653");
    await putDefaults({
      cookie,
      json: await saveBody({ hardwareTierId: "hardware.soft-close" }),
    });
    return [
      {
        name: "in use",
        answer: await deleteRow(VENEER),
        expected: CLOSED_400("change", "ITEM_IN_USE"),
      },
      {
        name: "in use, a hardware class",
        answer: await deleteRow(PREMIUM),
        expected: CLOSED_400("change", "ITEM_IN_USE"),
      },
      {
        name: "a saved default",
        answer: await deleteRow(SOFT_CLOSE),
        expected: CLOSED_400("change", "ITEM_IS_DEFAULT"),
      },
      {
        name: "the fixed default",
        answer: await deleteRow({
          kind: "material",
          tierId: BOOK.material.defaultTierId,
        }),
        expected: CLOSED_400("change", "ITEM_IS_DEFAULT"),
      },
      {
        name: "an unstated row",
        answer: await deleteRow({
          kind: "hardware",
          tierId: "hardware.ghost-7",
        }),
        expected: CLOSED_400("change", "UNKNOWN_ITEM"),
      },
      {
        name: "the built-in accessory",
        answer: await deleteRow({
          kind: "accessory",
          accessoryId: ALWAYS_PRESENT_ACCESSORY_ID,
        }),
        expected: CLOSED_400("change", "NOT_EDITABLE"),
      },
      {
        name: "a value that is not true",
        answer: await send(deletion(PAINTED, false)),
        expected: CLOSED_400("change", "MISSING_VALUE"),
      },
      {
        name: "a colour",
        answer: await send(
          deletion({ kind: "finish", finishId: "pal.alb" } as never),
        ),
        expected: CLOSED_400("address", "UNKNOWN_ADDRESS"),
      },
    ];
  }

  it("is exactly {status, issues:[{field, code}]} for each 400, with no count, no design id and no row id", async () => {
    for (const { name, answer, expected } of await refusedAnswers()) {
      expect(answer.status, name).toBe(400);
      const body = await jsonOf(answer);
      expect(body, name).toEqual(expected);
      const text = await answer.clone().text();
      expect(text, name).not.toContain("design-secret");
      expect(text, name).not.toMatch(
        /designCount|count|designId|name|tierId|accessoryId/i,
      );
      for (const id of [...ROW_IDS, "hardware.ghost-7"])
        expect(text, name).not.toContain(id);
      const issues = (body as { issues: Record<string, unknown>[] }).issues;
      expect(issues, name).toHaveLength(1);
      expect(Object.keys(issues[0] ?? {}).sort(), name).toEqual([
        "code",
        "field",
      ]);
      expect(Object.keys(body as object).sort(), name).toEqual([
        "issues",
        "status",
      ]);
    }
  });

  it("answers byte for byte the same whether one design or four hundred use the row, and under whichever design ids", async () => {
    aDesignNaming(VENEER, "a");
    const one = await wireOf(await deleteRow(VENEER));
    for (let index = 0; index < 400; index += 1) {
      aDesignNaming(
        VENEER,
        `design-with-a-long-and-odd-id-${String(index)}-é-‮`,
      );
    }

    const many = await wireOf(await deleteRow(VENEER));

    expect(many).toBe(one);
  });

  it("answers a used row and a row used and also a saved default in the same shape, the default naming no count either", async () => {
    aDesignNaming(PREMIUM);
    await putDefaults({
      cookie,
      json: await saveBody({ hardwareTierId: "hardware.premium" }),
    });

    const answer = await deleteRow(PREMIUM);

    expect(await jsonOf(answer)).toEqual(
      CLOSED_400("change", "ITEM_IS_DEFAULT"),
    );
  });

  it("is the same 503 {status: unavailable} for an unreadable default, a failed count and a count past the deadline, and carries no cause", async () => {
    const answers: string[] = [];
    vi.spyOn(prices.defaults, "read").mockResolvedValueOnce({
      kind: "saved",
      saved: { revision: "3", defaults: { materialTierId: 7 } },
    } as never);
    answers.push(await wireOf(await deleteRow(VENEER)));
    vi.spyOn(prices.defaults, "countEach").mockRejectedValueOnce(
      new Error(`${DRIVER_FAILURE_MARKER} veneer`),
    );
    answers.push(await wireOf(await deleteRow(VENEER)));
    vi.spyOn(prices.defaults, "countEach").mockReturnValueOnce(
      new Promise(() => undefined),
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const pending = deleteRow(VENEER);
    await vi.advanceTimersByTimeAsync(USAGE_READ_DEADLINE_MS);
    answers.push(await wireOf(await pending));

    expect(new Set(answers).size).toBe(1);
    expect(answers[0]).toContain(String.raw`{\"status\":\"unavailable\"}`);
    expect(answers[0]).not.toContain(DRIVER_FAILURE_MARKER);
    expect(answers[0]).not.toContain("veneer");
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The order of checks

describe("a request refused before the plan never reaches the draft, the saved defaults or the count", () => {
  const NOT_REACHED = async () => {
    revisionOnHand = await currentDraftRevision();
    return spiesOnTheReaders();
  };

  function expectNoRead(
    spies: ReturnType<typeof spiesOnTheReaders>,
    name: string,
  ) {
    expect(spies.counting, name).not.toHaveBeenCalled();
    expect(spies.readingDefaults, name).not.toHaveBeenCalled();
    expect(spies.readingDraft, name).not.toHaveBeenCalled();
  }

  it.each<[string, () => Promise<Response>, number]>([
    [
      "no session",
      () => send(deletion(VENEER), { cookie: undefined as never }),
      401,
    ],
    [
      "a cross-site request",
      () => send(deletion(VENEER), { secFetchSite: "cross-site" }),
      403,
    ],
    [
      "a text/plain body",
      () => send(deletion(VENEER), { contentType: "text/plain" }),
      415,
    ],
    [
      "no content type",
      () => send(deletion(VENEER), { contentType: null }),
      415,
    ],
    [
      "a body that is not JSON",
      () => PUT(changeRequest({ cookie, json: "{not json" })),
      400,
    ],
    [
      "a body over the bound",
      () =>
        PUT(
          changeRequest({
            cookie,
            json: JSON.stringify({ pad: "x ".repeat(10_000) }),
          }),
        ),
      413,
    ],
  ])("%s", async (name, request, status) => {
    const spies = await NOT_REACHED();
    const before = await stateOfTheWorld();
    spies.readingDraft.mockClear();
    spies.readingDefaults.mockClear();

    const answer = await request();

    expect(answer.status, name).toBe(status);
    expectNoRead(spies, name);
    expect(await stateOfTheWorld()).toEqual(before);
  });

  it("is a 429 from the draft bucket, before the draft, the saved defaults or the count, and writes nothing", async () => {
    const spies = await NOT_REACHED();
    const before = await stateOfTheWorld();
    spies.readingDraft.mockClear();
    spies.readingDefaults.mockClear();
    limiterLedger.refusing.set(STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY.name, 5);

    const answer = await deleteRow(VENEER);

    expect(answer.status).toBe(429);
    expectNoRead(spies, "rate limited");
    limiterLedger.refusing.clear();
    expect(await stateOfTheWorld()).toEqual(before);
  });

  it("is a 503 from a limiter that cannot judge, before any read of the defaults or the count", async () => {
    const spies = await NOT_REACHED();
    spies.readingDraft.mockClear();
    limiterLedger.unavailable.add(STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY.name);

    const answer = await deleteRow(VENEER);

    expect(answer.status).toBe(503);
    expect(spies.counting).not.toHaveBeenCalled();
    expect(spies.readingDefaults).not.toHaveBeenCalled();
  });

  it("is a 403 for an operator, with no read of the draft, the defaults or the count", async () => {
    const operator = await signedInAs({ role: "operator" }, "op@example.test");
    const spies = await NOT_REACHED();
    spies.readingDraft.mockClear();

    const answer = await send(deletion(VENEER), {
      cookie: operator.session.cookie,
    });

    expect(answer.status).toBe(403);
    expectNoRead(spies, "operator");
  });

  it("refuses a stale revision as 409 before the saved defaults or the count, for a row that would be a default and for one that is used", async () => {
    aDesignNaming(VENEER);
    await putDefaults({
      cookie,
      json: await saveBody({ hardwareTierId: "hardware.premium" }),
    });
    const spies = spiesOnTheReaders();
    const revision = await currentDraftRevision();
    spies.readingDefaults.mockClear();

    for (const item of [VENEER, PREMIUM]) {
      const answer = await send(deletion(item), {}, `${revision}0`);
      expect(answer.status).toBe(409);
      expect(await jsonOf(answer)).toEqual({ status: "changed-meanwhile" });
    }

    expect(spies.counting).not.toHaveBeenCalled();
    expect(spies.readingDefaults).not.toHaveBeenCalled();
  });

  it.each<[string, unknown]>([
    [
      "an unstated row",
      deletion({ kind: "material", tierId: "material.ghost" }),
    ],
    [
      "the built-in accessory",
      deletion({ kind: "accessory", accessoryId: ALWAYS_PRESENT_ACCESSORY_ID }),
    ],
    [
      "a fixed default",
      deletion({ kind: "material", tierId: BOOK.material.defaultTierId }),
    ],
    ["a value that is not true", deletion(VENEER, "true")],
    ["a colour", deletion({ kind: "finish", finishId: "pal.alb" } as never)],
  ])(
    "refuses %s on the plan, with no read of the defaults and no count",
    async (name, change) => {
      const spies = spiesOnTheReaders();
      spies.readingDefaults.mockClear();

      const answer = await send(change);

      expect(answer.status, name).toBe(400);
      expect(spies.counting).not.toHaveBeenCalled();
      expect(spies.readingDefaults).not.toHaveBeenCalled();
    },
  );
});

// ---------------------------------------------------------------------------------------------------------------------
// What the reader is asked

describe("what the pre-check asks of the stores", () => {
  it.each(DELETABLE.map((item) => [JSON.stringify(item), item] as const))(
    "makes exactly one read of the defaults and one count of one probe for an unused %s",
    async (_name, item) => {
      const spies = spiesOnTheReaders();
      spies.readingDefaults.mockClear();

      const answer = await deleteRow(item);

      expect(answer.status).toBe(200);
      expect(spies.counting).toHaveBeenCalledTimes(1);
      expect(spies.probes[0]).toHaveLength(1);
      expect(spies.probes[0]?.[0]?.item).toEqual(item);
      expect(spies.readingDefaults).toHaveBeenCalledTimes(1);
    },
  );

  it("counts the one row once, however many rows the draft already deletes (the rest are not counted again)", async () => {
    await plantDraft(tokenHash, deleting(VENEER, PAINTED, SOFT_CLOSE, PLINTH));
    aDesignNaming(VENEER);
    const spies = spiesOnTheReaders();

    const answer = await deleteRow(PREMIUM);

    expect(answer.status).toBe(200);
    expect(spies.counting).toHaveBeenCalledTimes(1);
    expect(spies.probes[0]?.map(({ item }) => item)).toEqual([PREMIUM]);
  });

  it("makes no count when a saved default is the row, even when a design uses it too", async () => {
    aDesignNaming(SOFT_CLOSE);
    await putDefaults({
      cookie,
      json: await saveBody({ hardwareTierId: "hardware.soft-close" }),
    });
    const spies = spiesOnTheReaders();

    const answer = await deleteRow(SOFT_CLOSE);

    expect(answer.status).toBe(400);
    expect(spies.counting).not.toHaveBeenCalled();
  });

  it("asks for the walk over no design: no probe of the pre-check is a migrated-design probe, whichever kind is deleted", async () => {
    const spies = spiesOnTheReaders();

    for (const item of DELETABLE) {
      await deleteRow(item);
    }

    const viaOf = spies.probes.flat().map(({ via }) => via);
    expect(viaOf.length).toBeGreaterThan(0);
    expect(viaOf).not.toContain("migrated-design");
  });

  it("takes a deletion of a linked accessory as a count of the build ids its rule is priced as, never an empty list", async () => {
    const spies = spiesOnTheReaders();

    await deleteRow(PLINTH);

    const [probe] = spies.probes[0] ?? [];
    expect(probe?.via).toBe("placed-bodies");
    expect(
      probe && "buildIds" in probe ? probe.buildIds.length : 0,
    ).toBeGreaterThan(0);
  });

  it("makes neither read nor count for a row the draft created, planted or made through the route, and for its repeat", async () => {
    const created = await (async () => {
      const { createClassAs } = await import("../../../support/creation-world");
      const answer = await createClassAs(cookie);
      return ((await jsonOf(answer)) as { created: ItemRef }).created;
    })();
    const spies = spiesOnTheReaders();
    spies.readingDefaults.mockClear();

    const first = await deleteRow(created);
    const again = await deleteRow(created);

    expect([first.status, again.status]).toEqual([200, 200]);
    expect(spies.counting).not.toHaveBeenCalled();
    expect(spies.readingDefaults).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// One deadline, and no slot

describe("the saved defaults and the count share one deadline", () => {
  function slowDefaults(delayMs: number) {
    return vi.spyOn(prices.defaults, "read").mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve(NONE_SAVED);
          }, delayMs);
        }),
    );
  }

  function slowCount(delayMs: number) {
    return vi.spyOn(prices.defaults, "countEach").mockImplementation(
      (asked) =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              counts: asked.map(({ item }) => ({ item, designCount: 0 })),
              unreadableDesigns: 0,
            });
          }, delayMs);
        }),
    );
  }

  /** Lets the request run (the fake clock stands still) until `spy` has been asked, so that the read's own timer exists. */
  async function untilAsked(spy: { mock: { calls: unknown[] } }) {
    for (
      let turns = 0;
      turns < 2_000 && spy.mock.calls.length === 0;
      turns += 1
    ) {
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
    }
    expect(spy.mock.calls.length).toBeGreaterThan(0);
  }

  async function answerWithReadsTaking(defaultsMs: number, countMs: number) {
    const reading = slowDefaults(defaultsMs);
    const counting = slowCount(countMs);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const answering = deleteRow(VENEER);
    await untilAsked(reading);
    await vi.advanceTimersByTimeAsync(defaultsMs);
    await untilAsked(counting);
    await vi.advanceTimersByTimeAsync(USAGE_READ_DEADLINE_MS);
    return answering;
  }

  it("answers 503 and writes nothing when the defaults take D-1 ms and the count 2 ms more: no read has its own clock", async () => {
    const before = await stateOfTheWorld();

    const answer = await answerWithReadsTaking(USAGE_READ_DEADLINE_MS - 1, 2);

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    vi.useRealTimers();
    vi.restoreAllMocks();
    expect(await stateOfTheWorld()).toEqual(before);
  });

  it("answers 200 when the two reads together finish inside it, so the 503 above is the sum and not either read", async () => {
    const answer = await answerWithReadsTaking(USAGE_READ_DEADLINE_MS - 3, 2);

    expect(answer.status).toBe(200);
  });

  it("aborts the count's signal at the deadline, so a late reader is told to stop", async () => {
    let signal: AbortSignal | undefined;
    vi.spyOn(prices.defaults, "countEach").mockImplementation(
      (_asked, given) => {
        signal = given;
        return new Promise(() => undefined);
      },
    );
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const answering = deleteRow(VENEER);
    await vi.advanceTimersByTimeAsync(USAGE_READ_DEADLINE_MS - 1);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const answer = await answering;

    expect(answer.status).toBe(503);
    expect(signal?.aborted).toBe(true);
  });

  it("answers 503 for a count that answers a design with an item the reader was not asked about", async () => {
    vi.spyOn(prices.defaults, "countEach").mockResolvedValue({
      counts: [{ item: PREMIUM, designCount: 0 }],
      unreadableDesigns: 0,
    });
    const before = await stateOfTheWorld();

    const answer = await deleteRow(VENEER);

    expect(answer.status).toBe(503);
    expect(await stateOfTheWorld()).toEqual(before);
  });

  it("answers 503 for a count that answers the row twice, or a negative or fractional count, never reading it as unused", async () => {
    const before = await stateOfTheWorld();
    for (const counts of [
      [
        { item: VENEER, designCount: 0 },
        { item: VENEER, designCount: 0 },
      ],
      [{ item: VENEER, designCount: -1 }],
      [{ item: VENEER, designCount: 0.5 }],
      [{ item: VENEER, designCount: Number.POSITIVE_INFINITY }],
    ]) {
      vi.spyOn(prices.defaults, "countEach").mockResolvedValueOnce({
        counts,
        unreadableDesigns: 0,
      });

      const answer = await deleteRow(VENEER);

      expect(answer.status, JSON.stringify(counts)).toBe(503);
    }
    expect(await stateOfTheWorld()).toEqual(before);
  });

  it("answers 503 for a count whose designs left out is not a whole number, never reading it as unused", async () => {
    vi.spyOn(prices.defaults, "countEach").mockResolvedValue({
      counts: [{ item: VENEER, designCount: 0 }],
      unreadableDesigns: -2,
    });
    const before = await stateOfTheWorld();

    const answer = await deleteRow(VENEER);

    expect(answer.status).toBe(503);
    expect(await stateOfTheWorld()).toEqual(before);
  });
});

describe("the usage route's one read at a time", () => {
  it("is not taken by a deletion whose count hangs: the usage route answers 200 meanwhile, and the deletion is 503 at the deadline", async () => {
    let calls = 0;
    const honest = (asked: readonly ItemUsageProbe[]) => ({
      counts: asked.map(({ item }) => ({ item, designCount: 0 })),
      unreadableDesigns: 0,
    });
    vi.spyOn(prices.defaults, "countEach").mockImplementation((asked) => {
      calls += 1;
      return calls === 1
        ? new Promise(() => undefined)
        : Promise.resolve(honest(asked));
    });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const before = await stateOfTheWorld();

    const hung = deleteRow(VENEER);
    await vi.waitFor(() => {
      expect(calls).toBe(1);
    });
    const usage = await readUsage({ cookie, json: { items: [PREMIUM] } });
    await vi.advanceTimersByTimeAsync(USAGE_READ_DEADLINE_MS);
    const deleted = await hung;

    expect(usage.status).toBe(200);
    expect(deleted.status).toBe(503);
    expect(await stateOfTheWorld()).toEqual(before);
  });

  it("is not made to wait by a usage read that is in flight, however many deletions are made while it is", async () => {
    let release: () => void = () => undefined;
    let calls = 0;
    vi.spyOn(prices.defaults, "countEach").mockImplementation((asked) => {
      calls += 1;
      const answer = {
        counts: asked.map(({ item }) => ({ item, designCount: 0 })),
        unreadableDesigns: 0,
      };
      if (calls > 1) return Promise.resolve(answer);
      return new Promise((resolve) => {
        release = () => {
          resolve(answer);
        };
      });
    });
    const usage = readUsage({ cookie, json: { items: [VENEER] } });
    await vi.waitFor(() => {
      expect(calls).toBe(1);
    });

    const answers = [
      await deleteRow(PREMIUM),
      await deleteRow(PAINTED),
      await deleteRow(SOFT_CLOSE),
    ];

    expect(answers.map(({ status }) => status)).toEqual([200, 200, 200]);
    release();
    expect((await usage).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Logging

describe("no row id reaches the console", () => {
  it("on a stored deletion, a refusal of each kind, a stale revision and an unreadable count", async () => {
    aDesignNaming(VENEER, "design-in-console-7");
    await putDefaults({
      cookie,
      json: await saveBody({ hardwareTierId: "hardware.soft-close" }),
    });

    await deleteRow(PREMIUM);
    await deleteRow(VENEER);
    await deleteRow(SOFT_CLOSE);
    await deleteRow({ kind: "hardware", tierId: "hardware.ghost-9" });
    await deleteRow({
      kind: "accessory",
      accessoryId: ALWAYS_PRESENT_ACCESSORY_ID,
    });
    await send(deletion(PAINTED), {}, `${await currentDraftRevision()}0`);
    vi.spyOn(prices.defaults, "countEach").mockRejectedValueOnce(
      new Error(DRIVER_FAILURE_MARKER),
    );
    await deleteRow(PAINTED);
    await readUsage({ cookie, json: { items: [VENEER] } });

    const everything = console_.everything();
    for (const id of [
      ...ROW_IDS,
      "hardware.ghost-9",
      "design-in-console-7",
      DRIVER_FAILURE_MARKER,
    ]) {
      expect(everything, id).not.toContain(id);
    }
  });
});
