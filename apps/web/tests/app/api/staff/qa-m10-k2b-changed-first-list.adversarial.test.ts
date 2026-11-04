import { fc, test as propertyTest } from "@fast-check/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  accountRequest,
  captureConsole,
  freshAccountWorld,
  jsonOf,
} from "../../../support/account-world";
import {
  freshStaffWorld,
  plantClient,
  plantKitchen,
  signedInAs,
  type StaffWorld,
} from "../../../support/staff-world";

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/staff/staff-kitchen-reader-instance", () =>
  import("../../../support/staff-world").then((world) =>
    world.staffKitchenReaderModule(),
  ),
);
vi.mock("@/lib/server/staff/staff-audit-store-instance", () =>
  import("../../../support/staff-world").then((world) =>
    world.staffAuditStoreModule(),
  ),
);

const { GET: LIST } = await import("@/app/api/staff/kitchens/route");
const { GET: COUNT } = await import(
  "@/app/api/staff/kitchens/changed-count/route"
);

/**
 * The menu's number, the list's `changedCount` and the rows that `onlyChanged` returns are three ways of reading one
 * set of kitchens: every sent kitchen its client has not deleted whose revision is not the one staff last saw. The
 * `onlyChanged` flag is the text `true` and nothing else, and every list view names whether it asked for it.
 */

const PAGE_SIZE = 20;
const COUNT_PATH = "/api/staff/kitchens/changed-count";

let staffWorld: StaffWorld;

beforeEach(() => {
  freshAccountWorld();
  staffWorld = freshStaffWorld();
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function operatorCookie(): Promise<string> {
  return (await signedInAs({ role: "operator" })).session.cookie;
}

function listAs(cookie: string, search: string) {
  return LIST(
    accountRequest("/api/staff/kitchens", {
      cookie,
      search,
      headers: { "x-forwarded-for": "192.0.2.10" },
    }),
  );
}

interface ListedBody {
  readonly total: number;
  readonly changedCount: number;
  readonly kitchens: { id: string; changedAfterSeen: boolean }[];
}

async function listedBody(cookie: string, search = ""): Promise<ListedBody> {
  const answer = await listAs(cookie, search);
  expect(answer.status).toBe(200);
  return (await jsonOf(answer)) as ListedBody;
}

function plantChangedKitchen(): string {
  const { id } = plantKitchen({ revision: "2" });
  plantRequestAt(id, "1");
  return id;
}

function plantUnchangedKitchen(): string {
  const { id } = plantKitchen({ revision: "2" });
  plantRequestAt(id, "2");
  return id;
}

function plantRequestAt(designId: string, designRevision: string): void {
  staffWorld.reader.plantRequest({
    clientRequestId: designId,
    designId,
    reference: `REF-${designId.slice(0, 6)}`,
    createdAt: new Date("2026-10-18T09:00:00.000Z"),
    designRevision,
  });
}

describe("onlyChanged is the text true and nothing else", () => {
  it.each(["false", "yes", "True", " true", "true ", "0", "null", "true,true"])(
    "refuses onlyChanged=%j with the code for an unknown value, and writes neither a row nor a read",
    async (value) => {
      const cookie = await operatorCookie();
      plantChangedKitchen();

      const answer = await listAs(
        cookie,
        `?onlyChanged=${encodeURIComponent(value)}`,
      );

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({
        status: "invalid-input",
        issues: [{ field: "onlyChanged", code: "UNKNOWN_VALUE" }],
      });
      expect(staffWorld.audit.heldEvents()).toEqual([]);
      expect(staffWorld.calls).toEqual([]);
    },
  );

  it("names every wrong member of one query, the filter among them", async () => {
    const cookie = await operatorCookie();

    const answer = await listAs(cookie, "?segment=nonsense&onlyChanged=false");

    expect(answer.status).toBe(400);
    const { issues } = (await jsonOf(answer)) as {
      issues: { field: string }[];
    };
    expect(issues.map(({ field }) => field).sort()).toEqual([
      "onlyChanged",
      "segment",
    ]);
  });

  it("writes onlyChanged true on the row of a changed-only view that found nothing", async () => {
    const cookie = await operatorCookie();

    const body = await listedBody(cookie, "?onlyChanged=true");

    expect(body.kitchens).toEqual([]);
    expect(
      staffWorld.audit
        .heldEvents()
        .map(({ action, detail }) => [action, detail]),
    ).toEqual([
      [
        "kitchens-listed",
        {
          segment: "sent",
          status: null,
          page: 1,
          rowCount: 0,
          hasSearch: false,
          onlyChanged: true,
        },
      ],
    ]);
  });

  it("writes onlyChanged false, a member that is present, on every row of a view that did not ask", async () => {
    const cookie = await operatorCookie();

    await listedBody(cookie);
    await listedBody(cookie, "?segment=all&q=zzz&page=3");

    for (const { detail } of staffWorld.audit.heldEvents()) {
      expect(Object.hasOwn(detail as object, "onlyChanged")).toBe(true);
      expect((detail as { onlyChanged: unknown }).onlyChanged).toBe(false);
    }
  });
});

describe("the count is global, whatever the list is narrowed to", () => {
  it.each([
    ["a status that no kitchen holds", "?segment=sent&status=closed"],
    ["a page past the last one", "?page=99"],
    [
      "a search that matches nothing beside the changed filter",
      "?q=Zorila-Quasar-9917&onlyChanged=true",
    ],
    ["the drafts segment", "?segment=drafts"],
    ["the changed filter on a late page", "?onlyChanged=true&page=2"],
  ])("carries the whole count for %s", async (_label, search) => {
    const cookie = await operatorCookie();
    plantChangedKitchen();
    plantChangedKitchen();
    plantUnchangedKitchen();

    const body = await listedBody(cookie, search);

    expect(body.changedCount).toBe(2);
  });

  it("counts a kitchen that is changed but hidden by its client, as the badge does", async () => {
    const cookie = await operatorCookie();
    const { id } = plantKitchen({ revision: "2", isHidden: true });
    plantRequestAt(id, "1");

    const poll = await COUNT(
      accountRequest(COUNT_PATH, {
        cookie,
        headers: { "x-forwarded-for": "192.0.2.10" },
      }),
    );
    const body = await listedBody(cookie);

    expect(await jsonOf(poll)).toEqual({
      count: body.changedCount,
    });
  });
});

describe("one set of kitchens read three ways", () => {
  type Kind = "changed" | "unchanged" | "draft" | "deleted" | "held-unsent";

  const KINDS: readonly Kind[] = [
    "changed",
    "unchanged",
    "draft",
    "deleted",
    "held-unsent",
  ];

  function plantKind(kind: Kind): string {
    switch (kind) {
      case "changed":
        return plantChangedKitchen();
      case "unchanged":
        return plantUnchangedKitchen();
      case "draft":
        return plantKitchen({ isSent: false, revision: "3" }).id;
      case "deleted": {
        const { id } = plantKitchen({ revision: "2", isDeletedByClient: true });
        plantRequestAt(id, "1");
        return id;
      }
      case "held-unsent":
        return plantKitchen({
          isSent: false,
          revision: "2",
          accountId: plantClient().id,
        }).id;
    }
  }

  async function everyPageOf(
    cookie: string,
    search: string,
  ): Promise<ListedBody[]> {
    const first = await listedBody(cookie, search);
    const pageCount = Math.max(1, Math.ceil(first.total / PAGE_SIZE));
    const rest: ListedBody[] = [];
    for (let page = 2; page <= pageCount; page += 1) {
      rest.push(await listedBody(cookie, `${search}&page=${String(page)}`));
    }
    return [first, ...rest];
  }

  propertyTest(
    "agree on the count for any mix of kitchens, over every page, and put the changed ones first",
    async () => {
      const cookie = await operatorCookie();
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.constantFrom(...KINDS), { minLength: 0, maxLength: 52 }),
          async (kinds) => {
            staffWorld = freshStaffWorld();
            const planted = kinds.map(
              (kind) => [kind, plantKind(kind)] as const,
            );
            const changedIds = planted
              .filter(([kind]) => kind === "changed")
              .map(([, id]) => id)
              .sort();

            const changedPages = await everyPageOf(cookie, "?onlyChanged=true");
            const allPages = await everyPageOf(cookie, "?segment=all");
            const poll = await COUNT(
              accountRequest(COUNT_PATH, {
                cookie,
                headers: { "x-forwarded-for": "192.0.2.10" },
              }),
            );

            const changedRows = changedPages.flatMap(
              ({ kitchens }) => kitchens,
            );
            expect(changedRows.map(({ id }) => id).sort()).toEqual(changedIds);
            for (const page of [...changedPages, ...allPages]) {
              expect(page.changedCount).toBe(changedIds.length);
            }
            expect(await jsonOf(poll)).toEqual({
              count: changedIds.length,
            });
            const flags = allPages
              .flatMap(({ kitchens }) => kitchens)
              .map(({ changedAfterSeen }) => changedAfterSeen);
            expect(flags).toEqual(
              [...flags].sort((a, b) => Number(b) - Number(a)),
            );
          },
        ),
        { numRuns: 25 },
      );
    },
    120_000,
  );
});
