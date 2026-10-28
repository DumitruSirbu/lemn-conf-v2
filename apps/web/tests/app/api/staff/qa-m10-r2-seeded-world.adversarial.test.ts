import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  captureConsole,
  cookieOfValue,
  freshAccountWorld,
  jsonOf,
} from "../../../support/account-world";
import {
  changeDraft,
  readState,
  revertDraft,
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
 * Adversarial QA of the seeded fake price world (M10 R2 ruling Q1). The world judges a write's actor against the app's own
 * sessions, so only a live staff session reaches it. These attack the seam that joins the two: a caller the route refuses
 * must never be found in the seed's private store, and the seed's own publisher is no one a request can be.
 */

beforeEach(() => {
  freshAccountWorld();
  freshStaffWorld();
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  seeded.stores = undefined;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

interface StateWire {
  draft: { draftRevision: string; changes: unknown[] };
}

const CHANGE = { address: { kind: "provisional" }, value: false };

describe("a caller that is not a live administrator in the seeded world", () => {
  it.each([
    ["an operator", { role: "operator" } as const, 403],
    ["a client", { role: "client" } as const, 403],
    [
      "an administrator with an unconfirmed address",
      { role: "administrator", isVerified: false } as const,
      403,
    ],
  ])(
    "%s is refused %i on a write and a revert, and the draft stays empty",
    async (_title, caller, status) => {
      const administrator = await signedInAs({ role: "administrator" });
      const state = (await jsonOf(
        await readState({ cookie: administrator.session.cookie }),
      )) as StateWire;
      const other = await signedInAs(caller, "other@example.test");

      const written = await changeDraft({
        cookie: other.session.cookie,
        json: {
          expectedDraftRevision: state.draft.draftRevision,
          change: CHANGE,
        },
      });
      const reverted = await revertDraft({
        cookie: other.session.cookie,
        json: {
          expectedDraftRevision: state.draft.draftRevision,
          scope: "all",
        },
      });

      expect(written.status).toBe(status);
      expect(reverted.status).toBe(status);
      const after = (await jsonOf(
        await readState({ cookie: administrator.session.cookie }),
      )) as StateWire;
      expect(after.draft).toEqual(state.draft);
    },
  );

  it.each([
    ["no cookie", undefined],
    ["a cookie no session answers to", cookieOfValue("A".repeat(43))],
    ["a malformed cookie", cookieOfValue("short")],
  ])(
    "with %s is 401 on every operation and writes nothing",
    async (_title, cookie) => {
      const administrator = await signedInAs({ role: "administrator" });
      const state = (await jsonOf(
        await readState({ cookie: administrator.session.cookie }),
      )) as StateWire;
      const sent = cookie === undefined ? {} : { cookie };

      const answers = [
        await readState(sent),
        await changeDraft({
          ...sent,
          json: {
            expectedDraftRevision: state.draft.draftRevision,
            change: CHANGE,
          },
        }),
        await revertDraft({
          ...sent,
          json: {
            expectedDraftRevision: state.draft.draftRevision,
            scope: "all",
          },
        }),
      ];

      expect(answers.map(({ status }) => status)).toEqual([401, 401, 401]);
      const after = (await jsonOf(
        await readState({ cookie: administrator.session.cookie }),
      )) as StateWire;
      expect(after.draft).toEqual(state.draft);
    },
  );
});

describe("two administrators in the seeded world", () => {
  it("share one draft: the second one's write against the first one's revision is 409, and a discard moves it for both", async () => {
    const first = await signedInAs(
      { role: "administrator" },
      "first@example.test",
    );
    const second = await signedInAs(
      { role: "administrator" },
      "second@example.test",
    );
    const state = (await jsonOf(
      await readState({ cookie: first.session.cookie }),
    )) as StateWire;
    const revision = state.draft.draftRevision;

    const written = await changeDraft({
      cookie: first.session.cookie,
      json: { expectedDraftRevision: revision, change: CHANGE },
    });
    const stale = await changeDraft({
      cookie: second.session.cookie,
      json: { expectedDraftRevision: revision, change: CHANGE },
    });
    const discardedWithStale = await revertDraft({
      cookie: second.session.cookie,
      json: { expectedDraftRevision: revision, scope: "all" },
    });

    expect(written.status).toBe(200);
    expect(stale.status).toBe(409);
    expect(discardedWithStale.status).toBe(409);
    const seen = (await jsonOf(
      await readState({ cookie: second.session.cookie }),
    )) as StateWire;
    expect(seen.draft.changes).toHaveLength(1);
  });
});
