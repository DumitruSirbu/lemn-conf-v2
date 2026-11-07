import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as defaultsRoute from "@/app/api/staff/prices/defaults/route";
import { GET as DEFAULTS_GET } from "@/app/api/staff/prices/defaults/route";
import { GET as STATE_GET } from "@/app/api/staff/prices/route";
import {
  READ_POLICY,
  STAFF_PRICES_READ_BY_ACCOUNT_POLICY,
} from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  DRIVER_FAILURE_MARKER,
  accountRequest,
  captureConsole,
  currentAccountWorld,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
} from "../../../support/account-world";
import {
  administrator,
  saveDefaults,
  switchItem,
} from "../../../support/availability-route-world";
import {
  freshPriceDashboardWorld,
  priceStoreAsks,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import {
  freshStaffWorld,
  signedInAs,
  type StaffWorld,
} from "../../../support/staff-world";

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
 * QA of M10 R4b2 item 1: `GET /api/staff/prices/defaults` and the refactor of the read pipeline it shares with
 * `GET /api/staff/prices` (`answerReadForStaff`). The two reads are driven through the same scenarios so that any
 * difference between them is a difference of the answer's own section, never of the order of the checks.
 */

const NETWORK = { "x-forwarded-for": "192.0.2.10" };
const ACCOUNT_BUCKET = STAFF_PRICES_READ_BY_ACCOUNT_POLICY.name;
const NETWORK_BUCKET = READ_POLICY.name;
const DEFAULTS_ADDRESS = "/api/staff/prices/defaults";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const TIER_OFFER_WORDS = ["tiers", "disabled", "nameKey", "draft", "versionId"];

let staffWorld: StaffWorld;
let prices: PriceDashboardWorld;
let console_: ReturnType<typeof captureConsole>;

beforeEach(async () => {
  freshAccountWorld();
  staffWorld = freshStaffWorld();
  prices = await freshPriceDashboardWorld();
  console_ = captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

type Read = typeof DEFAULTS_GET;
const READS: readonly (readonly [string, Read, string])[] = [
  ["defaults", DEFAULTS_GET, DEFAULTS_ADDRESS],
  ["state", STATE_GET, "/api/staff/prices"],
];

function call(
  read: Read,
  address: string,
  init: { cookie?: string; secFetchSite?: string | null; search?: string } = {},
) {
  return read(
    accountRequest(address, { method: "GET", headers: NETWORK, ...init }),
  );
}

function viewedRows() {
  return staffWorld.audit
    .heldEvents()
    .filter(({ action }) => action === "price-catalogue-viewed");
}

interface Outcome {
  readonly status: number;
  readonly counted: readonly string[];
  readonly storeAsks: number;
  readonly rows: number;
}

async function outcomeOf(
  read: Read,
  address: string,
  cookie: string | undefined,
  secFetchSite?: string,
): Promise<Outcome> {
  limiterLedger.counted.length = 0;
  priceStoreAsks.count = 0;
  const rowsBefore = staffWorld.audit.heldEvents().length;
  const answer = await call(read, address, {
    ...(cookie === undefined ? {} : { cookie }),
    ...(secFetchSite === undefined ? {} : { secFetchSite }),
  });
  return {
    status: answer.status,
    counted: [...limiterLedger.counted],
    storeAsks: priceStoreAsks.count,
    rows: staffWorld.audit.heldEvents().length - rowsBefore,
  };
}

interface Scenario {
  readonly name: string;
  readonly arrange: () => Promise<{ cookie?: string; secFetchSite?: string }>;
  readonly expected: Outcome;
}

const SCENARIOS: readonly Scenario[] = [
  {
    name: "a cross-site read, even with an administrator's cookie",
    arrange: async () => ({
      cookie: (await administrator()).cookie,
      secFetchSite: "cross-site",
    }),
    expected: { status: 403, counted: [], storeAsks: 0, rows: 0 },
  },
  {
    name: "no session",
    arrange: () => Promise.resolve({}),
    expected: { status: 401, counted: [NETWORK_BUCKET], storeAsks: 0, rows: 0 },
  },
  {
    name: "no session while the network's read limit refuses",
    arrange: () => {
      limiterLedger.refusing.set(NETWORK_BUCKET, 5);
      return Promise.resolve({});
    },
    expected: { status: 429, counted: [NETWORK_BUCKET], storeAsks: 0, rows: 0 },
  },
  {
    name: "an operator",
    arrange: async () => ({
      cookie: (await signedInAs({ role: "operator" })).session.cookie,
    }),
    expected: { status: 403, counted: [NETWORK_BUCKET], storeAsks: 0, rows: 0 },
  },
  {
    name: "an operator while the network's read limit refuses",
    arrange: async () => {
      limiterLedger.refusing.set(NETWORK_BUCKET, 5);
      return {
        cookie: (await signedInAs({ role: "operator" })).session.cookie,
      };
    },
    expected: { status: 429, counted: [NETWORK_BUCKET], storeAsks: 0, rows: 0 },
  },
  {
    name: "a session the idle lifetime has ended",
    arrange: async () => {
      const { cookie } = await administrator();
      currentAccountWorld().advance(SEVEN_DAYS_MS);
      return { cookie };
    },
    expected: { status: 401, counted: [NETWORK_BUCKET], storeAsks: 0, rows: 0 },
  },
  {
    name: "an administrator whose own read bucket refuses",
    arrange: async () => {
      limiterLedger.refusing.set(ACCOUNT_BUCKET, 5);
      return { cookie: (await administrator()).cookie };
    },
    expected: {
      status: 429,
      counted: [NETWORK_BUCKET, ACCOUNT_BUCKET],
      storeAsks: 0,
      rows: 0,
    },
  },
  {
    name: "an administrator whose own read bucket cannot be counted",
    arrange: async () => {
      limiterLedger.unavailable.add(ACCOUNT_BUCKET);
      return { cookie: (await administrator()).cookie };
    },
    expected: {
      status: 503,
      counted: [NETWORK_BUCKET, ACCOUNT_BUCKET],
      storeAsks: 0,
      rows: 0,
    },
  },
  {
    name: "an administrator whose read the network's limit cannot count (a read fails open)",
    arrange: async () => {
      limiterLedger.unavailable.add(NETWORK_BUCKET);
      return { cookie: (await administrator()).cookie };
    },
    expected: {
      status: 200,
      counted: [NETWORK_BUCKET, ACCOUNT_BUCKET],
      storeAsks: 1,
      rows: 1,
    },
  },
];

describe("the order of the checks, the same for the defaults and for the dashboard's state", () => {
  for (const [readName, read, address] of READS) {
    for (const { name, arrange, expected } of SCENARIOS) {
      it(`${readName}: ${name} is ${String(expected.status)}, counts ${expected.counted.join(" then ") || "nothing"}, asks ${String(expected.storeAsks)} store(s), writes ${String(expected.rows)} row(s)`, async () => {
        const { cookie, secFetchSite } = await arrange();

        const outcome = await outcomeOf(read, address, cookie, secFetchSite);

        expect(outcome.status).toBe(expected.status);
        expect(outcome.counted).toEqual(expected.counted);
        expect(outcome.rows).toBe(expected.rows);
        if (expected.storeAsks === 0) expect(outcome.storeAsks).toBe(0);
        else expect(outcome.storeAsks).toBeGreaterThan(0);
      });
    }
  }

  it("a served read counts the network's block bucket first and the account's own second, once each", async () => {
    const { cookie } = await administrator();

    const outcome = await outcomeOf(DEFAULTS_GET, DEFAULTS_ADDRESS, cookie);

    expect(outcome.counted).toEqual([NETWORK_BUCKET, ACCOUNT_BUCKET]);
  });
});

describe("one price-catalogue-viewed row per served read, and none for a refusal", () => {
  it("is exactly one event of any kind per served defaults read, naming the defaults, and one naming the catalogue per state read", async () => {
    const { cookie, accountId } = await administrator();
    const eventsBefore = staffWorld.audit.heldEvents().length;

    await call(DEFAULTS_GET, DEFAULTS_ADDRESS, { cookie });
    await call(STATE_GET, "/api/staff/prices", { cookie });
    await call(DEFAULTS_GET, DEFAULTS_ADDRESS, { cookie });

    const added = staffWorld.audit.heldEvents().slice(eventsBefore);
    expect(
      added.map(({ action, detail, actorAccountId }) => ({
        action,
        detail,
        actorAccountId,
      })),
    ).toEqual([
      {
        action: "price-catalogue-viewed",
        detail: { section: "defaults" },
        actorAccountId: accountId,
      },
      {
        action: "price-catalogue-viewed",
        detail: { section: "catalogue" },
        actorAccountId: accountId,
      },
      {
        action: "price-catalogue-viewed",
        detail: { section: "defaults" },
        actorAccountId: accountId,
      },
    ]);
  });

  it("names the defaults whatever the query string asks for: the section is the route's, not the caller's", async () => {
    const { cookie } = await administrator();

    await call(DEFAULTS_GET, DEFAULTS_ADDRESS, {
      cookie,
      search: "?section=publish&section=history",
    });

    expect(viewedRows().map(({ detail }) => detail)).toEqual([
      { section: "defaults" },
    ]);
  });

  const REFUSING_STATES: readonly [string, () => void | Promise<void>][] = [
    [
      "the availability head cannot be read",
      () => {
        vi.spyOn(prices.stores.availability, "readCurrent").mockRejectedValue(
          new Error(DRIVER_FAILURE_MARKER),
        );
      },
    ],
    [
      "the active version cannot be read",
      () => {
        vi.spyOn(prices.stores.priceBook, "readActive").mockRejectedValue(
          new Error(DRIVER_FAILURE_MARKER),
        );
      },
    ],
    [
      "the saved defaults cannot be read",
      () => {
        vi.spyOn(prices.defaults, "read").mockRejectedValue(
          new Error(DRIVER_FAILURE_MARKER),
        );
      },
    ],
    [
      "the active version holds a book that is not one",
      () => {
        vi.spyOn(prices.stores.priceBook, "readActive").mockResolvedValue({
          kind: "found",
          version: {
            versionId: "v-junk",
            sequenceNumber: 1,
            book: { junk: DRIVER_FAILURE_MARKER },
          },
        } as never);
      },
    ],
    [
      "the audit row cannot be written",
      () => {
        staffWorld.auditBehaviour = "reject";
      },
    ],
  ];

  it.each(REFUSING_STATES)(
    "writes no row and shows no driver text when %s, and the answer holds none of the defaults",
    async (_name, arrange) => {
      const { cookie } = await administrator();
      await arrange();

      const answer = await call(DEFAULTS_GET, DEFAULTS_ADDRESS, {
        cookie,
      });

      expect(answer.status).toBe(503);
      expect(await answer.clone().text()).toBe('{"status":"unavailable"}');
      expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
      expect(viewedRows()).toEqual([]);
    },
  );

  it("writes no row when no version was ever published, and says 409 no-active-version like the dashboard's state does", async () => {
    prices = await freshPriceDashboardWorld({ isPublished: false });
    const { cookie } = await administrator();

    const defaults = await call(DEFAULTS_GET, DEFAULTS_ADDRESS, {
      cookie,
    });
    const state = await call(STATE_GET, "/api/staff/prices", { cookie });

    expect([defaults.status, state.status]).toEqual([409, 409]);
    expect(await jsonOf(defaults)).toEqual(await jsonOf(state));
    expect(viewedRows()).toEqual([]);
  });
});

describe("the defaults read reaches neither the draft nor the archive", () => {
  const FORBIDDEN_STORE_CALLS = [
    "readDraft",
    "writeDraft",
    "readVersion",
    "listVersions",
    "publish",
  ] as const;

  function watchForbiddenStoreCalls() {
    return FORBIDDEN_STORE_CALLS.map((method) =>
      vi
        .spyOn(prices.priceBook, method)
        .mockRejectedValue(new Error(`${method} was called`)),
    );
  }

  it("answers 200 while the draft cannot be read at all, and asks the price book store for no draft or version", async () => {
    const { cookie } = await administrator();
    const watched = watchForbiddenStoreCalls();

    const answer = await call(DEFAULTS_GET, DEFAULTS_ADDRESS, {
      cookie,
    });

    expect(answer.status).toBe(200);
    expect(watched.map((spy) => spy.mock.calls.length)).toEqual([
      0, 0, 0, 0, 0,
    ]);
  });

  it("is untouched by a stored draft that is unreadable, where the dashboard's state answers 409 draft-unreadable", async () => {
    const { cookie } = await administrator();
    vi.spyOn(prices.priceBook, "readDraft").mockResolvedValue({
      draftRevision: "3",
      changes: "JUNK",
    } as never);

    const defaults = await call(DEFAULTS_GET, DEFAULTS_ADDRESS, {
      cookie,
    });
    const state = await call(STATE_GET, "/api/staff/prices", { cookie });

    expect(defaults.status).toBe(200);
    expect(state.status).toBe(409);
    expect(viewedRows().map(({ detail }) => detail)).toEqual([
      { section: "defaults" },
    ]);
  });

  it("states exactly the six values and the two revisions, whatever is switched off or saved, with no tier offer, version or account in the body", async () => {
    const admin = await administrator();
    const other = await administrator("second-admin@example.test");
    await switchItem(
      admin.cookie,
      { kind: "material", tierId: "material.veneer" },
      false,
    );
    await saveDefaults(admin, { handle: "black" });

    const mine = await call(DEFAULTS_GET, DEFAULTS_ADDRESS, {
      cookie: admin.cookie,
    });
    const theirs = await call(DEFAULTS_GET, DEFAULTS_ADDRESS, {
      cookie: other.cookie,
    });

    const text = await mine.clone().text();
    expect(Object.keys((await jsonOf(mine)) as object).sort()).toEqual([
      "availabilityRevision",
      "defaults",
      "revision",
      "saved",
    ]);
    for (const word of TIER_OFFER_WORDS) expect(text).not.toContain(word);
    for (const secret of [
      admin.accountId,
      admin.tokenHash,
      "material.veneer",
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(await jsonOf(theirs)).toEqual(await jsonOf(mine));
  });
});

describe("the route's methods", () => {
  it("exports a GET, a HEAD and a PUT and no other method, so that the framework answers 405 for the rest", () => {
    const methods = Object.keys(defaultsRoute).filter((name) =>
      /^[A-Z]+$/.test(name),
    );

    expect(methods.sort()).toEqual(["GET", "HEAD", "PUT"]);
  });

  it("answers HEAD 405 whatever the session, spending no bucket and writing no row", async () => {
    const { cookie } = await administrator();
    limiterLedger.counted.length = 0;
    priceStoreAsks.count = 0;

    const answer = defaultsRoute.HEAD();

    expect(cookie).toBeDefined();
    expect(answer.status).toBe(405);
    expect(await answer.text()).toBe("");
    expect(limiterLedger.counted).toEqual([]);
    expect(priceStoreAsks.count).toBe(0);
    expect(viewedRows()).toEqual([]);
  });
});
