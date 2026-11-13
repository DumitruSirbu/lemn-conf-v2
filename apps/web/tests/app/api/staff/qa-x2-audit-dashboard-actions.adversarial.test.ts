import { DASHBOARD_AUDIT_ACTIONS } from "@lemnaria/configurator-domain";
import type { DashboardAuditAction } from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  accountRequest,
  captureConsole,
  freshAccountWorld,
  jsonOf,
} from "../../../support/account-world";
import {
  freshAuditPageWorld,
  plantEvent,
  type AuditPageWorld,
} from "../../../support/staff-audit-world";
import { signedInAs } from "../../../support/staff-world";

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/staff/staff-audit-store-instance", () =>
  import("../../../support/staff-audit-world").then((world) =>
    world.staffAuditPageStoreModule(),
  ),
);

const route = await import("@/app/api/staff/audit/route");

// Wave X2 (adversarial QA): `GET /api/staff/audit` over rows of the nine dashboard actions. The route, the query
// parser, the limiters and the response builders are the real ones, over the persistence package's audit store fake.

const SECRET = "SECRET-FREE-TEXT-ana@example.ro";

const VALID_DETAILS: Readonly<
  Record<DashboardAuditAction, Readonly<Record<string, unknown>>>
> = {
  "price-draft-changed": { changeKind: "depth-rule" },
  "price-draft-reverted": { changeKind: "bulk-group", revertedCount: 3 },
  "price-bulk-changed": {
    scope: "group",
    groupCode: "tall",
    percent: -4,
    ruleCount: 2,
    amountCount: 8,
  },
  "price-published": { sequenceNumber: 5, changeCount: 0, provisional: true },
  "price-restored-to-draft": { fromSequenceNumber: 4, changeCount: 6 },
  "catalogue-item-active-changed": {
    itemKind: "accessory",
    itemId: "dishDryingRack",
    active: false,
    availabilityRevision: "17",
  },
  "kitchen-defaults-saved": { changedFields: ["topRowHandle"] },
  "kitchen-seen": {},
  "price-catalogue-viewed": { section: "accessories" },
};

interface EntryWire {
  readonly kind: string;
  readonly action: string;
  readonly detail?: unknown;
}

let auditWorld: AuditPageWorld;

beforeEach(() => {
  freshAccountWorld();
  auditWorld = freshAuditPageWorld();
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function signedInAdministrator() {
  return signedInAs({ role: "administrator" }, "administrator@example.test");
}

async function entriesFor(
  cookie: string,
  search: string,
): Promise<{ status: number; entries: EntryWire[]; text: string }> {
  const answer = await route.GET(
    accountRequest("/api/staff/audit", {
      cookie,
      search,
      headers: { "x-forwarded-for": "192.0.2.10" },
    }),
  );
  const text = await answer.clone().text();
  if (answer.status !== 200)
    return { status: answer.status, entries: [], text };
  const body = (await jsonOf(answer)) as { events: { entry: EntryWire }[] };
  return {
    status: answer.status,
    entries: body.events.map(({ entry }) => entry),
    text,
  };
}

function plantOneRowPerDashboardAction(actorAccountId: string): void {
  DASHBOARD_AUDIT_ACTIONS.forEach((action, index) => {
    plantEvent(auditWorld, {
      actorAccountId,
      action,
      detail: VALID_DETAILS[action],
      designId: null,
      occurredAt: new Date(Date.UTC(2026, 9, 19, 9, index)),
    });
  });
}

describe("the action filter over the nine dashboard actions", () => {
  it.each(DASHBOARD_AUDIT_ACTIONS)(
    "?action=%s answers that action's row alone, recognised and holding its detail",
    async (action) => {
      const { session, account } = await signedInAdministrator();
      plantOneRowPerDashboardAction(account.id);
      plantEvent(auditWorld, { actorAccountId: account.id });

      const { status, entries } = await entriesFor(
        session.cookie,
        `?action=${action}`,
      );

      expect(status).toBe(200);
      expect(entries).toEqual([
        { kind: "recognised", action, detail: VALID_DETAILS[action] },
      ]);
    },
  );

  it("lists all nine as recognised when no action is asked for", async () => {
    const { session, account } = await signedInAdministrator();
    plantOneRowPerDashboardAction(account.id);

    const { entries } = await entriesFor(session.cookie, "");

    const planted = entries.filter(({ action }) =>
      DASHBOARD_AUDIT_ACTIONS.some((known) => known === action),
    );
    expect(planted).toHaveLength(9);
    expect(planted.every(({ kind }) => kind === "recognised")).toBe(true);
  });

  it.each([
    [
      "the first spelling of the availability action",
      "catalogue-item-activation-changed",
    ],
    ["a dashboard action in capitals", "PRICE-PUBLISHED"],
    ["a dashboard action with a trailing space", "price-published%20"],
    ["a 33-character code", "a".repeat(33)],
  ])("refuses %s as an unknown action", async (_label, action) => {
    const { session } = await signedInAdministrator();

    const { status, text } = await entriesFor(
      session.cookie,
      `?action=${action}`,
    );

    expect(status).toBe(400);
    expect(text).toContain("UNKNOWN_VALUE");
  });
});

describe("a stored dashboard row the build refuses", () => {
  it.each(DASHBOARD_AUDIT_ACTIONS)(
    "%s with a free-text member is served as unrecognised, its code and none of its detail",
    async (action) => {
      const { session, account } = await signedInAdministrator();
      plantEvent(auditWorld, {
        actorAccountId: account.id,
        action,
        detail: { ...VALID_DETAILS[action], note: SECRET },
      });

      const { entries, text } = await entriesFor(
        session.cookie,
        `?action=${action}`,
      );

      expect(entries).toEqual([{ kind: "unrecognised", action }]);
      expect(text).not.toContain("SECRET");
    },
  );

  it.each(
    DASHBOARD_AUDIT_ACTIONS.filter((action) => action !== "kitchen-seen"),
  )("%s with no detail at all is served as unrecognised", async (action) => {
    const { session, account } = await signedInAdministrator();
    plantEvent(auditWorld, {
      actorAccountId: account.id,
      action,
      detail: null,
    });

    const { entries } = await entriesFor(session.cookie, `?action=${action}`);

    expect(entries).toEqual([{ kind: "unrecognised", action }]);
  });
});

describe("the response is shaped from the domain's reading, member by member", () => {
  it.each(DASHBOARD_AUDIT_ACTIONS)(
    "%s carries no member the port's reading holds beyond its closed key list",
    async (action) => {
      const { session, account } = await signedInAdministrator();
      plantEvent(auditWorld, {
        actorAccountId: account.id,
        action,
        detail: VALID_DETAILS[action],
      });
      auditWorld.decoratePage = (page) => ({
        ...page,
        events: page.events.map((row) =>
          row.reading.kind === "recognised" &&
          row.reading.entry.action === action
            ? {
                ...row,
                reading: {
                  kind: "recognised",
                  entry: {
                    action,
                    detail: { ...row.reading.entry.detail, leaked: SECRET },
                  },
                },
              }
            : row,
        ) as typeof page.events,
      });

      const { text } = await entriesFor(session.cookie, `?action=${action}`);

      expect(text).not.toContain("SECRET");
    },
  );

  it.each(DASHBOARD_AUDIT_ACTIONS)(
    "%s carries no member of the port's entry beyond its action and detail",
    async (action) => {
      const { session, account } = await signedInAdministrator();
      plantEvent(auditWorld, {
        actorAccountId: account.id,
        action,
        detail: VALID_DETAILS[action],
      });
      auditWorld.decoratePage = (page) => ({
        ...page,
        events: page.events.map((row) =>
          row.reading.kind === "recognised"
            ? {
                ...row,
                reading: {
                  kind: "recognised",
                  entry: { ...row.reading.entry, leaked: SECRET },
                },
              }
            : row,
        ) as typeof page.events,
      });

      const { text } = await entriesFor(session.cookie, `?action=${action}`);

      expect(text).not.toContain("SECRET");
    },
  );
});
