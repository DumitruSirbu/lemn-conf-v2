import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  captureConsole,
  freshAccountWorld,
  jsonOf,
} from "../../../support/account-world";
import {
  changeDraft,
  readState,
} from "../../../support/price-dashboard-requests";
import { freshStaffWorld, signedInAs } from "../../../support/staff-world";

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
// The routes read the stores `seedFakePriceStores` makes, as a development server or an end-to-end run does: the world is
// built here once, with the session store the app itself uses (the account world's, in a test), never a private one.
const seeded = vi.hoisted(() => ({
  stores: undefined as Promise<unknown> | undefined,
}));
vi.mock("@/lib/server/price-stores", () => ({
  getPriceStores: () => {
    seeded.stores ??= import("@/lib/server/price-book-test-seed").then(
      ({ seedFakePriceStores }) => seedFakePriceStores(),
    );
    return seeded.stores;
  },
}));

/**
 * The seeded fake price world shares the app's own sessions (M10 R2 ruling Q1, 2026-10-27). A real staff cookie is the actor
 * of a draft write and its audit row, and a write is judged as it is in production: a session that is not live is refused.
 */

beforeEach(() => {
  freshAccountWorld();
  freshStaffWorld();
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

interface DraftWire {
  draftRevision: string;
  changes: unknown[];
}

describe("a real staff cookie in the seeded world", () => {
  it("is the actor of a draft write: the change is stored and answered, never refused as having no live session", async () => {
    const { session } = await signedInAs({ role: "administrator" });
    const state = (await jsonOf(
      await readState({ cookie: session.cookie }),
    )) as { draft: DraftWire };

    const answer = await changeDraft({
      cookie: session.cookie,
      json: {
        expectedDraftRevision: state.draft.draftRevision,
        change: { address: { kind: "provisional" }, value: false },
      },
    });

    expect(answer.status).toBe(200);
    const written = (await jsonOf(answer)) as DraftWire;
    expect(written.changes).toEqual([
      { address: { kind: "provisional" }, value: false },
    ]);
  });

  it("is refused 401, and writes nothing, once its session is no longer live when the store acts", async () => {
    const { session, account } = await signedInAs(
      { role: "administrator" },
      "second-administrator@example.test",
    );
    const state = (await jsonOf(
      await readState({ cookie: session.cookie }),
    )) as { draft: DraftWire };
    const { currentAccountWorld } = await import(
      "../../../support/account-world"
    );
    const world = currentAccountWorld();
    const realFindLive = world.tracedSessions.findLive.bind(
      world.tracedSessions,
    );
    let isRouteRead = true;
    vi.spyOn(world.tracedSessions, "findLive").mockImplementation(
      async (request) => {
        const found = await realFindLive(request);
        if (isRouteRead) {
          isRouteRead = false;
          await world.sessions.revokeAllForAccount(account.id);
        }
        return found;
      },
    );

    const answer = await changeDraft({
      cookie: session.cookie,
      json: {
        expectedDraftRevision: state.draft.draftRevision,
        change: { address: { kind: "provisional" }, value: true },
      },
    });

    expect(answer.status).toBe(401);
  });
});
