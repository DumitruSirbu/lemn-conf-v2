import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DASHBOARD_DETAIL_KEYS } from "@lemnaria/configurator-domain";

import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  captureConsole,
  cookieOfValue,
  freshAccountWorld,
  jsonOf,
  type AccountWorld,
} from "../../../support/account-world";
import {
  DASHBOARD_ROUTES,
  changeDraft,
  currentDraftRevision,
  readState,
} from "../../../support/price-dashboard-requests";
import {
  freshPriceDashboardWorld,
  priceStoreAsks,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import {
  freshStaffWorld,
  signedInAs,
  type StaffCaller,
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
vi.mock("@/lib/server/price-dashboard/bulk-planner", () =>
  import("../../../support/test-bulk-planner").then((world) =>
    world.bulkPlannerModule(),
  ),
);
const capabilitiesAsked: string[] = [];
vi.mock("@/lib/server/account/require-capability", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("@/lib/server/account/require-capability")
    >();
  return {
    ...original,
    requireCapability: (
      ...args: Parameters<typeof original.requireCapability>
    ) => {
      capabilitiesAsked.push(args[1]);
      return original.requireCapability(...args);
    },
  };
});

/**
 * Every price dashboard route (M10 R2, acceptance for R2 and R3): the answer is `401` without a live session, `403` for a
 * session that does not hold `price.edit` (a client, an operator, or a staff address not yet confirmed), and the route's own
 * answer for an administrator. The store's actor check is defence in depth only, so a refused request reaches no store and
 * leaves no row. The table is written out, not derived from `isCapabilityHeld`, so a change to who may edit prices has to be
 * made here on purpose.
 */

let world: AccountWorld;
let staffWorld: StaffWorld;
let prices: PriceDashboardWorld;

beforeEach(async () => {
  world = freshAccountWorld();
  staffWorld = freshStaffWorld();
  prices = await freshPriceDashboardWorld();
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

type CallerName =
  | "anonymous"
  | "a malformed cookie"
  | "a client with a confirmed address"
  | "a client with an unconfirmed address"
  | "an operator"
  | "an operator with an unconfirmed address"
  | "an administrator"
  | "an administrator with an unconfirmed address"
  | "an administrator idle past twelve hours"
  | "an administrator whose session was revoked";

type Expected = "admitted" | 401 | 403;

const EXPECTED: readonly [CallerName, Expected][] = [
  ["anonymous", 401],
  ["a malformed cookie", 401],
  ["a client with a confirmed address", 403],
  ["a client with an unconfirmed address", 403],
  ["an operator", 403],
  ["an operator with an unconfirmed address", 403],
  ["an administrator", "admitted"],
  ["an administrator with an unconfirmed address", 403],
  ["an administrator idle past twelve hours", 401],
  ["an administrator whose session was revoked", 401],
];

const CALLERS_WITH_A_SESSION: Readonly<
  Partial<Record<CallerName, StaffCaller>>
> = {
  "a client with a confirmed address": { role: "client" },
  "a client with an unconfirmed address": { role: "client", isVerified: false },
  "an operator": { role: "operator" },
  "an operator with an unconfirmed address": {
    role: "operator",
    isVerified: false,
  },
  "an administrator": { role: "administrator" },
  "an administrator with an unconfirmed address": {
    role: "administrator",
    isVerified: false,
  },
  "an administrator idle past twelve hours": { role: "administrator" },
  "an administrator whose session was revoked": { role: "administrator" },
};

async function cookieOf(name: CallerName): Promise<string | undefined> {
  if (name === "anonymous") return undefined;
  if (name === "a malformed cookie") return cookieOfValue("short");
  const caller = CALLERS_WITH_A_SESSION[name];
  if (caller === undefined) throw new Error(`no caller for ${name}`);
  const { account, session } = await signedInAs(
    caller,
    `${name.replaceAll(/[^a-z]+/g, "-")}@example.test`,
  );
  if (name === "an administrator idle past twelve hours") {
    world.advance(12 * 60 * 60 * 1000 + 1000);
  }
  if (name === "an administrator whose session was revoked") {
    await world.sessions.revokeAllForAccount(account.id);
  }
  return session.cookie;
}

function draftRowsHeld(): number {
  return prices.ledger
    .heldEvents()
    .filter(({ action }) => action !== "price-published").length;
}

describe.each(DASHBOARD_ROUTES)("$name", (route) => {
  it.each(EXPECTED)("answers %s with %s", async (name, expected) => {
    const cookie = await cookieOf(name);

    const answer = await route.ask(cookie);

    if (expected === "admitted") {
      expect(answer.status).toBe(route.admittedStatus);
      return;
    }
    expect(answer.status).toBe(expected);
    expect(await jsonOf(answer)).toEqual({
      status: expected === 401 ? "unauthenticated" : "forbidden",
    });
    expect(priceStoreAsks.count).toBe(0);
    expect(draftRowsHeld()).toBe(0);
    expect(staffWorld.audit.heldEvents()).toEqual([]);
  });

  it("asks for price.edit, and for no other capability", async () => {
    const { session } = await signedInAs({ role: "administrator" });
    capabilitiesAsked.length = 0;

    await route.ask(session.cookie);

    expect(capabilitiesAsked).toEqual([route.capability]);
  });
});

describe("a header that names a role, a capability or an account", () => {
  it("changes nothing: an operator claiming to be an administrator is still refused", async () => {
    const operator = await signedInAs({ role: "operator" });

    const answer = await readState({
      cookie: operator.session.cookie,
      headers: {
        "x-role": "administrator",
        "x-capabilities": "price.edit",
        "x-account-id": operator.account.id,
        authorization: `Bearer ${operator.account.id}`,
      },
    });

    expect(answer.status).toBe(403);
    expect(priceStoreAsks.count).toBe(0);
  });
});

describe("a body member that names an account, a role or a capability", () => {
  it("gives an operator 403 before the body is read, and writes nothing", async () => {
    const operator = await signedInAs({ role: "operator" });

    const answer = await changeDraft({
      cookie: operator.session.cookie,
      json: {
        expectedDraftRevision: await currentDraftRevision(),
        change: { address: { kind: "provisional" }, value: false },
        role: "administrator",
        capabilities: ["price.edit"],
        accountId: operator.account.id,
      },
    });

    expect(answer.status).toBe(403);
    expect(draftRowsHeld()).toBe(0);
  });
});

describe("the audit rows of every route (R-c)", () => {
  const PUBLISHED_LABEL = "Version 1";

  it("leaves exactly one row for each request that reads or writes, under its action's closed key list, and none holds a label, a note or a value", async () => {
    const { session } = await signedInAs({ role: "administrator" });

    for (const route of DASHBOARD_ROUTES) {
      const ledgerBefore = prices.ledger.heldEvents().length;
      const staffBefore = staffWorld.audit.heldEvents().length;

      const answer = await route.ask(session.cookie);

      const ledgerRows = prices.ledger.heldEvents().length - ledgerBefore;
      const staffRows = staffWorld.audit.heldEvents().length - staffBefore;
      const isRead = route.event === "staff-prices";
      const isWritten = !isRead && answer.status === 200;
      expect([route.name, ledgerRows, staffRows]).toEqual([
        route.name,
        isWritten ? 1 : 0,
        isRead ? 1 : 0,
      ]);
    }

    const rows = [
      ...prices.ledger
        .heldEvents()
        .filter(({ action }) => action !== "price-published"),
      ...staffWorld.audit.heldEvents(),
    ];
    expect(rows.map(({ action }) => action).sort()).toEqual([
      "price-bulk-changed",
      "price-catalogue-viewed",
      "price-draft-changed",
      "price-draft-reverted",
    ]);
    for (const { action, detail } of rows) {
      const closedKeys: readonly string[] =
        DASHBOARD_DETAIL_KEYS[action as keyof typeof DASHBOARD_DETAIL_KEYS];
      expect(detail).not.toBeNull();
      expect(
        Object.keys(detail ?? {}).every((key) => closedKeys.includes(key)),
      ).toBe(true);
      expect(JSON.stringify(detail)).not.toContain(PUBLISHED_LABEL);
    }
  });
});
