import { fc } from "@fast-check/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { encodeKitchenCursor } from "@/lib/server/account/kitchen-cursor";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  DRIVER_FAILURE_MARKER,
  READ_POLICY_NAME,
  accountRequest,
  captureConsole,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
  seedKitchen,
  seedSession,
  seedUnverifiedAccount,
  seedVerifiedAccount,
  wireOf,
  type AccountWorld,
  expectAWaitWithinTheWindowOf,
} from "../../../support/account-world";

vi.mock("@/lib/server/account/account-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.accountStoreModule(),
  ),
);
vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/account/account-kitchen-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.accountKitchenStoreModule(),
  ),
);

const { GET } = await import("@/app/api/account/kitchens/route");

/**
 * `GET /api/account/kitchens` (M8B Lot 2, E1; plan section 2.2 and criteria 5 and 13). The route is called with
 * `Request` objects over the persistence package's fakes; the session lookup, the capability check, the limiter's
 * decision and the response builders are the real ones.
 */

const PAGE_SIZE = 12;
const NEWEST = new Date("2026-10-19T12:00:00.000Z");

let world: AccountWorld;

beforeEach(() => {
  world = freshAccountWorld();
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function listRequest(init: Parameters<typeof accountRequest>[1] = {}) {
  return accountRequest("/api/account/kitchens", {
    ...init,
    headers: { "x-forwarded-for": "192.0.2.10", ...init.headers },
  });
}

function hide(id: string): void {
  const held = world.kitchens.held(id);
  if (held === undefined) throw new Error("no such kitchen");
  world.kitchens.seed({
    id: held.id,
    accountId: held.accountId,
    design: held.design,
    updatedAt: held.updatedAt,
    hiddenAt: NEWEST,
  });
}

async function signedInClient(email = "client@example.test") {
  const account = await seedVerifiedAccount({ email });
  const session = await seedSession(account);
  return { account, session };
}

interface PageWire {
  readonly total: number;
  readonly kitchens: readonly { readonly id: string }[];
  readonly nextCursor: string | null;
}

async function readPage(cookie: string, cursor?: string): Promise<PageWire> {
  const answer = await GET(
    listRequest({
      cookie,
      search: cursor === undefined ? "" : `?cursor=${cursor}`,
    }),
  );
  expect(answer.status).toBe(200);
  return (await jsonOf(answer)) as PageWire;
}

async function readEveryPage(cookie: string): Promise<PageWire[]> {
  const pages: PageWire[] = [];
  let cursor: string | undefined;
  do {
    const page = await readPage(cookie, cursor);
    pages.push(page);
    cursor = page.nextCursor ?? undefined;
    expect(pages.length).toBeLessThan(100);
  } while (cursor !== undefined);
  return pages;
}

describe("the order of the checks", () => {
  it("refuses a cross-site request first: nothing is counted, no session is read, no store is asked", async () => {
    const { session } = await signedInClient();
    world.calls.length = 0;

    for (const secFetchSite of ["cross-site", "same-site", "none"]) {
      const answer = await GET(
        listRequest({ cookie: session.cookie, secFetchSite }),
      );

      expect(answer.status).toBe(403);
      expect(await jsonOf(answer)).toEqual({ status: "cross-site" });
    }
    expect(world.calls).toEqual([]);
    expect(limiterLedger.counted).toEqual([]);
  });

  it("refuses a foreign Origin when the browser sent no Sec-Fetch-Site", async () => {
    const { session } = await signedInClient();
    world.calls.length = 0;

    const answer = await GET(
      listRequest({
        cookie: session.cookie,
        secFetchSite: null,
        headers: { origin: "https://evil.example" },
      }),
    );

    expect(answer.status).toBe(403);
    expect(world.calls).toEqual([]);
  });

  it("counts the read limit before it reads the session, so a refusal is the same for every caller", async () => {
    const { session } = await signedInClient();
    limiterLedger.refusing.set(READ_POLICY_NAME, 120);
    world.calls.length = 0;

    const signedIn = await GET(listRequest({ cookie: session.cookie }));
    const anonymous = await GET(listRequest());
    const garbage = await GET(
      listRequest({ cookie: "__Host-lemnaria_session=not-a-session" }),
    );

    for (const answer of [signedIn, anonymous, garbage]) {
      expect(answer.status).toBe(429);
      expectAWaitWithinTheWindowOf(answer, READ_POLICY_NAME);
      expect(await jsonOf(answer)).toEqual({ status: "rate-limited" });
    }
    expect(await wireOf(signedIn)).toBe(await wireOf(anonymous));
    expect(await wireOf(signedIn)).toBe(await wireOf(garbage));
    expect(world.calls).toEqual([]);
  });

  it("serves a read the limiter could not judge: a read fails open", async () => {
    const { session } = await signedInClient();
    limiterLedger.unavailable.add(READ_POLICY_NAME);

    const answer = await GET(listRequest({ cookie: session.cookie }));

    expect(answer.status).toBe(200);
  });

  it("answers 401 for no cookie, a malformed cookie, an unknown session and a revoked session, and reads no kitchen", async () => {
    const { account, session } = await signedInClient();
    const revoked = await seedSession(account);
    await world.sessions.revokeAllForAccount(account.id);
    world.calls.length = 0;

    const cookies = [
      undefined,
      "__Host-lemnaria_session=short",
      `__Host-lemnaria_session=${"A".repeat(43)}`,
      revoked.cookie,
      session.cookie,
    ];
    for (const cookie of cookies) {
      const answer = await GET(listRequest(cookie ? { cookie } : {}));

      expect(answer.status).toBe(401);
      expect(await jsonOf(answer)).toEqual({ status: "unauthenticated" });
    }
    expect(world.calls).not.toContain("kitchens.listPage");
  });

  it("answers 403 to a live session without design.read.own, a staff account, and reads no kitchen", async () => {
    for (const role of ["operator", "administrator"] as const) {
      world = freshAccountWorld();
      const staff = await seedVerifiedAccount({
        email: `${role}@example.test`,
        role,
      });
      const session = await seedSession(staff);
      world.calls.length = 0;

      const answer = await GET(listRequest({ cookie: session.cookie }));

      expect(answer.status).toBe(403);
      expect(await jsonOf(answer)).toEqual({ status: "forbidden" });
      expect(world.calls).not.toContain("kitchens.listPage");
    }
  });

  it("answers 403 to a live session whose address is not confirmed", async () => {
    const unconfirmed = await seedUnverifiedAccount("unconfirmed@example.test");
    const unconfirmedSession = await seedSession(unconfirmed);
    world.calls.length = 0;

    const answer = await GET(
      listRequest({ cookie: unconfirmedSession.cookie }),
    );

    expect(answer.status).toBe(403);
    expect(world.calls).not.toContain("kitchens.listPage");
  });

  it("checks the capability before the cursor: an anonymous caller with a bad cursor is 401, not 400", async () => {
    const answer = await GET(listRequest({ search: "?cursor=!!!" }));

    expect(answer.status).toBe(401);
  });

  it("answers 400 invalid-request for a cursor it did not issue, before any kitchen is read", async () => {
    const { session } = await signedInClient();
    world.calls.length = 0;

    const answer = await GET(
      listRequest({ cookie: session.cookie, search: "?cursor=not-a-cursor" }),
    );

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({ status: "invalid-request" });
    expect(world.calls).not.toContain("kitchens.listPage");
  });

  it("answers 503, never 401, when the session store cannot be read", async () => {
    const { session } = await signedInClient();
    const console_ = captureConsole();
    world.failOn("sessions.findLive");

    const answer = await GET(listRequest({ cookie: session.cookie }));

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(console_.accountLines()).toContainEqual({
      event: "kitchens",
      outcome: "unavailable",
    });
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
  });

  it("answers 503 with no cause when the kitchen store fails", async () => {
    const { session } = await signedInClient();
    const console_ = captureConsole();
    world.failOn("kitchens.listPage");

    const answer = await GET(listRequest({ cookie: session.cookie }));

    expect(answer.status).toBe(503);
    expect(await answer.clone().text()).not.toContain(DRIVER_FAILURE_MARKER);
    expect(answer.headers.get("retry-after")).toBeNull();
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
  });
});

describe("what a page holds", () => {
  it("answers private, no-store, with a body of exactly total, kitchens and nextCursor", async () => {
    const { account, session } = await signedInClient();
    seedKitchen({ accountId: account.id, updatedAt: NEWEST });

    const answer = await GET(listRequest({ cookie: session.cookie }));

    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
    const body = (await jsonOf(answer)) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      "kitchens",
      "nextCursor",
      "total",
    ]);
    expect(body.nextCursor).toBeNull();
  });

  it("describes a kitchen by id, name, instant, sent flag, summary and document alone, and no owner or credential", async () => {
    const { account, session } = await signedInClient();
    const id = seedKitchen({
      accountId: account.id,
      name: "My own kitchen",
      updatedAt: NEWEST,
      sentAt: new Date("2026-10-19T11:00:00.000Z"),
    });

    const answer = await GET(listRequest({ cookie: session.cookie }));
    const { kitchens } = (await jsonOf(answer)) as {
      kitchens: Record<string, unknown>[];
    };

    expect(kitchens).toHaveLength(1);
    expect(Object.keys(kitchens[0] ?? {}).sort()).toEqual([
      "document",
      "id",
      "isSent",
      "name",
      "summary",
      "updatedAt",
    ]);
    expect(kitchens[0]).toMatchObject({
      id,
      name: "My own kitchen",
      isSent: true,
      updatedAt: "2026-10-19T12:00:00.000Z",
    });
    const text = JSON.stringify(kitchens);
    expect(text).not.toContain(account.id);
    expect(text).not.toMatch(
      /accountId|visitorHash|writeToken|hiddenAt|deletedAt|sentAt/,
    );
  });

  it("answers an unnamed kitchen with a null name and an unsent one as not sent", async () => {
    const { account, session } = await signedInClient();
    seedKitchen({ accountId: account.id, updatedAt: NEWEST });

    const { kitchens } = (await jsonOf(
      await GET(listRequest({ cookie: session.cookie })),
    )) as { kitchens: { name: unknown; isSent: unknown }[] };

    expect(kitchens[0]).toMatchObject({ name: null, isSent: false });
  });

  it("answers an account with no kitchen an empty page, total 0 and no cursor", async () => {
    const { session } = await signedInClient();

    const answer = await GET(listRequest({ cookie: session.cookie }));

    expect(await jsonOf(answer)).toEqual({
      total: 0,
      kitchens: [],
      nextCursor: null,
    });
  });

  it("never shows another account's kitchen, or a hidden or deleted one, and counts only what it shows", async () => {
    const { account, session } = await signedInClient();
    const other = await seedVerifiedAccount({ email: "other@example.test" });
    const mine = seedKitchen({ accountId: account.id, updatedAt: NEWEST });
    seedKitchen({
      accountId: other.id,
      updatedAt: new Date(NEWEST.getTime() + 5_000),
    });
    seedKitchen({ accountId: account.id, hiddenAt: NEWEST, updatedAt: NEWEST });
    seedKitchen({
      accountId: account.id,
      deletedAt: NEWEST,
      updatedAt: NEWEST,
    });

    const page = await readPage(session.cookie);

    expect(page.kitchens.map(({ id }) => id)).toEqual([mine]);
    expect(page.total).toBe(1);
  });

  it("ignores every request member that tries to name an account, a role or a page size", async () => {
    const { account, session } = await signedInClient();
    const other = await seedVerifiedAccount({ email: "other@example.test" });
    for (let index = 0; index < 15; index += 1) {
      seedKitchen({
        accountId: account.id,
        updatedAt: new Date(NEWEST.getTime() - index * 1000),
      });
    }
    const theirs = seedKitchen({ accountId: other.id, updatedAt: NEWEST });

    const answer = await GET(
      listRequest({
        cookie: session.cookie,
        search: `?accountId=${other.id}&account=${other.id}&role=administrator&limit=50&pageSize=50&size=50`,
        headers: {
          "x-account-id": other.id,
          "x-role": "administrator",
          authorization: `Bearer ${other.id}`,
        },
      }),
    );
    const page = (await jsonOf(answer)) as PageWire;

    expect(answer.status).toBe(200);
    expect(page.kitchens).toHaveLength(PAGE_SIZE);
    expect(page.kitchens.map(({ id }) => id)).not.toContain(theirs);
    expect(page.total).toBe(15);
  });
});

describe("paging: 12 to a page, newest first, ties broken by id", () => {
  it.each([
    [0, [0]],
    [1, [1]],
    [11, [11]],
    [12, [12]],
    [13, [12, 1]],
    [24, [12, 12]],
    [25, [12, 12, 1]],
    [30, [12, 12, 6]],
  ])("splits %i kitchens into pages of %j", async (count, expectedSizes) => {
    const { account, session } = await signedInClient();
    for (let index = 0; index < count; index += 1) {
      seedKitchen({
        accountId: account.id,
        updatedAt: new Date(NEWEST.getTime() - index * 1000),
      });
    }

    const pages = await readEveryPage(session.cookie);

    expect(pages.map((page) => page.kitchens.length)).toEqual(
      count === 0 ? [0] : expectedSizes,
    );
    expect(pages.at(-1)?.nextCursor).toBeNull();
    for (const page of pages.slice(0, -1)) {
      expect(page.nextCursor).not.toBeNull();
    }
    expect(new Set(pages.map((page) => page.total))).toEqual(new Set([count]));
  });

  it("walks kitchens that share one instant in id order, none twice and none skipped across the tie", async () => {
    const { account, session } = await signedInClient();
    const ids = Array.from({ length: 30 }, () =>
      seedKitchen({ accountId: account.id, updatedAt: NEWEST }),
    );

    const walked = (await readEveryPage(session.cookie)).flatMap((page) =>
      page.kitchens.map(({ id }) => id),
    );

    expect(walked).toEqual(
      [...ids].sort((first, second) => (first < second ? 1 : -1)),
    );
  });

  it("holds for any rows, ties and exclusions: every eligible id exactly once, in (updated_at desc, id desc) order", async () => {
    const rowArbitrary = fc.record({
      tick: fc.integer({ min: 0, max: 4 }),
      state: fc.constantFrom(
        "listed",
        "listed",
        "listed",
        "hidden",
        "deleted",
        "foreign",
      ),
      sent: fc.boolean(),
    });

    await fc.assert(
      fc.asyncProperty(
        fc.array(rowArbitrary, { maxLength: 60 }),
        async (rows) => {
          world = freshAccountWorld();
          const { account, session } = await signedInClient();
          const other = await seedVerifiedAccount({
            email: "other@example.test",
          });
          const eligible: { id: string; at: number }[] = [];
          for (const row of rows) {
            const at = NEWEST.getTime() - row.tick * 1000;
            const id = seedKitchen({
              accountId: row.state === "foreign" ? other.id : account.id,
              updatedAt: new Date(at),
              ...(row.sent ? { sentAt: NEWEST } : {}),
              ...(row.state === "hidden" ? { hiddenAt: NEWEST } : {}),
              ...(row.state === "deleted" ? { deletedAt: NEWEST } : {}),
            });
            if (row.state === "listed") eligible.push({ id, at });
          }
          const expected = [...eligible]
            .sort((first, second) =>
              first.at !== second.at
                ? second.at - first.at
                : first.id < second.id
                  ? 1
                  : -1,
            )
            .map(({ id }) => id);

          const pages = await readEveryPage(session.cookie);

          expect(
            pages.flatMap((page) => page.kitchens.map(({ id }) => id)),
          ).toEqual(expected);
          expect(pages.every((page) => page.kitchens.length <= PAGE_SIZE)).toBe(
            true,
          );
          expect(pages.every((page) => page.total === expected.length)).toBe(
            true,
          );
          expect(pages.length).toBe(
            Math.max(1, Math.ceil(expected.length / PAGE_SIZE)),
          );
        },
      ),
      { numRuns: 40 },
    );
  });

  it("lets a cursor that names another account's row move the page and reach none of that account's rows", async () => {
    const { account, session } = await signedInClient();
    const other = await seedVerifiedAccount({ email: "other@example.test" });
    const mine = Array.from({ length: 5 }, (_, index) =>
      seedKitchen({
        accountId: account.id,
        updatedAt: new Date(NEWEST.getTime() - index * 1000),
      }),
    );
    const theirs = Array.from({ length: 5 }, (_, index) =>
      seedKitchen({
        accountId: other.id,
        updatedAt: new Date(NEWEST.getTime() - index * 1000 - 500),
      }),
    );
    const forged = encodeKitchenCursor({
      updatedAt: `${new Date(NEWEST.getTime() - 1500).toISOString().replace(/Z$/, "")}000Z`,
      id: theirs[0] ?? "",
    });

    const page = await readPage(session.cookie, forged);

    expect(page.kitchens.map(({ id }) => id)).toEqual(mine.slice(2));
    expect(page.total).toBe(5);
  });

  it("resumes after a cursor whose row has since been hidden, losing neither neighbour", async () => {
    const { account, session } = await signedInClient();
    const ids = Array.from({ length: 14 }, (_, index) =>
      seedKitchen({
        accountId: account.id,
        updatedAt: new Date(NEWEST.getTime() - index * 1000),
      }),
    );
    const first = await readPage(session.cookie);
    hide(ids[11] ?? "");

    const second = await readPage(session.cookie, first.nextCursor ?? "");

    expect(second.kitchens.map(({ id }) => id)).toEqual(ids.slice(12));
    expect(first.kitchens.map(({ id }) => id)).toEqual(ids.slice(0, 12));
  });
});
