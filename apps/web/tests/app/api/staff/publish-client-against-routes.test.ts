// The publish screens' fetching client against the routes it talks to. A stub of `fetch` hands the client's request to
// the real route handlers over the persistence package's fake stores, so what the client sends is what the routes read
// and what the routes answer is what the client sorts. Each wire outcome the screens tell apart is reached through a
// route.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SAMPLE_PRICE_BOOK } from "@lemnaria/configurator-domain";

import { DELETE, PUT } from "@/app/api/staff/prices/draft/route";
import { POST as PUBLISH } from "@/app/api/staff/prices/publish/route";
import { GET } from "@/app/api/staff/prices/route";
import { POST as RESTORE } from "@/app/api/staff/prices/versions/[id]/restore/route";
import { GET as VERSIONS } from "@/app/api/staff/prices/versions/route";
import { IDLE_LIFETIME_SECONDS_BY_ROLE } from "@/lib/server/account/session-lifetimes";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { FETCHING_PUBLISH_CLIENT } from "@/price-dashboard/fetching-publish-client";
import {
  getStaffSessionExpiry,
  resetStaffSessionExpiryForTests,
} from "@/staff/staff-session-expiry";

import {
  accountRequest,
  captureConsole,
  freshAccountWorld,
} from "../../../support/account-world";
import {
  freshPriceDashboardWorld,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import {
  ANCHOR_ADDRESS,
  publishAnchor,
  putChange,
} from "../../../support/price-versions";
import { saveDefaults } from "../../../support/availability-route-world";
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
vi.mock("@/lib/server/price-stores", () =>
  import("../../../support/price-dashboard-world").then((world) =>
    world.priceStoresModule(),
  ),
);

const NETWORK = { "x-forwarded-for": "192.0.2.10" };
const OTHER_ANCHOR_MINOR = 500_000;
const STEEP_NARROWING = {
  kind: "cabinet",
  ruleId: "cabinet.base-3drawer",
  field: "perStepNarrowerMinor",
} as const;
const STALE_CHANGE = {
  address: { kind: "cabinet", ruleId: "cabinet.gone", field: "anchorMinor" },
  value: 5_000,
} as const;

let cookie: string | undefined;
let tokenHash = "";
let prices: PriceDashboardWorld;

/** `fetch` as the browser does it, answered by the route handlers: the request the client built, byte for byte. */
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
  const path = address.split("?")[0] ?? address;
  if (path === "/api/staff/prices") return GET(request);
  if (path === "/api/staff/prices/draft") {
    return method === "PUT" ? PUT(request) : DELETE(request);
  }
  if (path === "/api/staff/prices/publish") return PUBLISH(request);
  if (path === "/api/staff/prices/versions") return VERSIONS(request);
  const restore = /^\/api\/staff\/prices\/versions\/([^/]+)\/restore$/.exec(
    path,
  );
  if (restore?.[1] !== undefined) {
    const id = decodeURIComponent(restore[1]);
    return RESTORE(request, { params: Promise.resolve({ id }) });
  }
  throw new Error(
    `the client asked for an address no route answers: ${address}`,
  );
}

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld({ book: SAMPLE_PRICE_BOOK });
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  vi.stubGlobal("fetch", routeFetch);
  resetStaffSessionExpiryForTests();
  const { session } = await signedInAs({ role: "administrator" });
  cookie = session.cookie;
  tokenHash = session.tokenHash;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function stateRead() {
  const state = await FETCHING_PUBLISH_CLIENT.readState();
  if (state === undefined) throw new Error("the state cannot be read");
  return state;
}

function publishRequestOf(
  state: Awaited<ReturnType<typeof stateRead>>,
  overrides: { label?: string; note?: string } = {},
) {
  return {
    expectedDraftRevision: state.draft.draftRevision,
    expectedActiveSequence: state.active.sequenceNumber,
    expectedAvailabilityRevision: state.active.availability.revision,
    label: "Autumn prices",
    note: "",
    ...overrides,
  };
}

function holdUnreadableDraft(draftRevision: string): void {
  vi.spyOn(prices.stores.priceBook, "readDraft").mockResolvedValue({
    draftRevision,
    changes: [{ address: { kind: "cabinet" }, value: "STORED-JUNK" }],
  });
}

/** Replaces the stored draft wholesale, as a store would hold it after a book change made some of its changes stale. */
async function storeDraft(changes: readonly unknown[]): Promise<string> {
  const current = await prices.stores.priceBook.readDraft();
  const written = await prices.priceBook.writeDraft({
    expectedDraftRevision: current.draftRevision,
    changes: changes as never,
    audit: {
      session: {
        sessionTokenHash: tokenHash,
        idleLifetimeSeconds: IDLE_LIFETIME_SECONDS_BY_ROLE,
      },
      entry: {
        action: "price-draft-changed",
        detail: { changeKind: "provisional" },
      },
    },
  });
  if (written.kind !== "ok") throw new Error("seed: the draft was not written");
  return written.draftRevision;
}

const DEFAULT_HARDWARE = {
  kind: "hardware",
  tierId: SAMPLE_PRICE_BOOK.hardware.defaultTierId,
} as const;
const DELETES_DEFAULT = {
  address: { kind: "item-deleted", item: DEFAULT_HARDWARE },
  value: true,
} as const;

describe("reading and writing the draft", () => {
  it("reads the state, writes a change, and takes it out again, each as the draft the route holds", async () => {
    const before = await stateRead();

    const written = await FETCHING_PUBLISH_CLIENT.change({
      expectedDraftRevision: before.draft.draftRevision,
      change: { address: ANCHOR_ADDRESS, value: OTHER_ANCHOR_MINOR },
    });
    expect(written.kind).toBe("changed");
    if (written.kind !== "changed") return;
    expect((await stateRead()).draft).toEqual(written.draft);

    const reverted = await FETCHING_PUBLISH_CLIENT.revert({
      expectedDraftRevision: written.draft.draftRevision,
      target: { kind: "change", address: ANCHOR_ADDRESS },
    });
    expect(reverted).toMatchObject({
      kind: "changed",
      draft: { changes: [] },
    });
  });

  it("is told a session that has ended is one, on a write and on a read, and the read raises the frame's sheet", async () => {
    cookie = undefined;

    const written = await FETCHING_PUBLISH_CLIENT.change({
      expectedDraftRevision: "0",
      change: { address: ANCHOR_ADDRESS, value: OTHER_ANCHOR_MINOR },
    });
    expect(getStaffSessionExpiry()).toBeUndefined();
    const read = await FETCHING_PUBLISH_CLIENT.readState();

    expect(written).toEqual({ kind: "session-ended" });
    expect(read).toBeUndefined();
    expect(getStaffSessionExpiry()).toEqual({ keepsTypedText: true });
  });

  it("reads a draft that cannot be read as that refusal, at the revision the route named, and no version as its own", async () => {
    holdUnreadableDraft("9");
    const unreadable = await FETCHING_PUBLISH_CLIENT.readStateOrRefusal();
    const plain = await FETCHING_PUBLISH_CLIENT.readState();
    vi.restoreAllMocks();
    prices = await freshPriceDashboardWorld({ isPublished: false });
    const unpublished = await FETCHING_PUBLISH_CLIENT.readStateOrRefusal();

    expect(plain, "the plain read keeps its answer").toBeUndefined();
    expect(unreadable).toEqual({
      kind: "draft-unreadable",
      draftRevision: "9",
    });
    expect(unpublished).toEqual({ kind: "no-active-version" });
  });

  it("answers a publish whose 200 cannot be read as an answer nobody can read, not as a failure", async () => {
    await putChange(cookie ?? "", ANCHOR_ADDRESS, OTHER_ANCHOR_MINOR);
    const request = publishRequestOf(await stateRead());
    vi.stubGlobal("fetch", () =>
      Promise.resolve(new Response("not json", { status: 200 })),
    );

    expect(await FETCHING_PUBLISH_CLIENT.publish(request)).toEqual({
      kind: "answer-unreadable",
    });
  });
});

describe("a write that finds the draft unreadable, or no version", () => {
  it("is told so for a change and a revert, with the revision to give the draft up at", async () => {
    holdUnreadableDraft("9");

    const change = await FETCHING_PUBLISH_CLIENT.change({
      expectedDraftRevision: "9",
      change: { address: ANCHOR_ADDRESS, value: OTHER_ANCHOR_MINOR },
    });
    const revert = await FETCHING_PUBLISH_CLIENT.revert({
      expectedDraftRevision: "9",
      target: { kind: "change", address: ANCHOR_ADDRESS },
    });

    expect(change).toEqual({ kind: "draft-unreadable", draftRevision: "9" });
    expect(revert).toEqual({ kind: "draft-unreadable", draftRevision: "9" });
  });

  it("is told so for a restore, and a dashboard with no version for a change", async () => {
    const versionId = prices.versionId ?? "";
    holdUnreadableDraft("9");
    const restore = await FETCHING_PUBLISH_CLIENT.restore(versionId, {
      expectedDraftRevision: "9",
    });
    vi.restoreAllMocks();
    prices = await freshPriceDashboardWorld({ isPublished: false });
    const change = await FETCHING_PUBLISH_CLIENT.change({
      expectedDraftRevision: "0",
      change: { address: ANCHOR_ADDRESS, value: OTHER_ANCHOR_MINOR },
    });

    expect(restore).toEqual({ kind: "draft-unreadable", draftRevision: "9" });
    expect(change).toEqual({ kind: "no-active-version" });
  });
});

describe("giving the draft up", () => {
  it("empties it, and a draft that cannot be read is given up at the revision the route named", async () => {
    await putChange(cookie ?? "", ANCHOR_ADDRESS, OTHER_ANCHOR_MINOR);
    const state = await stateRead();
    holdUnreadableDraft(state.draft.draftRevision);

    const outcome = await FETCHING_PUBLISH_CLIENT.discardDraft({
      expectedDraftRevision: state.draft.draftRevision,
      scope: "all",
    });

    expect(outcome).toMatchObject({ kind: "changed", draft: { changes: [] } });
    vi.restoreAllMocks();
    expect((await prices.stores.priceBook.readDraft()).changes).toEqual([]);
  });

  it("is a conflict at a revision the draft has moved past, and a signed-out request is session-ended", async () => {
    const stale = (await stateRead()).draft.draftRevision;
    await putChange(cookie ?? "", ANCHOR_ADDRESS, OTHER_ANCHOR_MINOR);

    const conflict = await FETCHING_PUBLISH_CLIENT.discardDraft({
      expectedDraftRevision: stale,
      scope: "all",
    });
    cookie = undefined;
    const signedOut = await FETCHING_PUBLISH_CLIENT.discardDraft({
      expectedDraftRevision: stale,
      scope: "all",
    });

    expect(conflict).toEqual({ kind: "conflict" });
    expect(signedOut).toEqual({ kind: "session-ended" });
  });
});

describe("publishing", () => {
  it("publishes the draft as the next version, and the state read afterwards is that version with an empty draft", async () => {
    await putChange(cookie ?? "", ANCHOR_ADDRESS, OTHER_ANCHOR_MINOR);
    const state = await stateRead();

    const outcome = await FETCHING_PUBLISH_CLIENT.publish(
      publishRequestOf(state),
    );

    expect(outcome).toMatchObject({
      kind: "published",
      published: { sequenceNumber: 2 },
    });
    const after = await stateRead();
    expect(after.active.sequenceNumber).toBe(2);
    expect(after.active.label).toBe("Autumn prices");
    expect(after.draft.changes).toEqual([]);
  });

  it.each([
    [
      "a draft revision the draft has moved past",
      { expectedDraftRevision: "1" },
    ],
    [
      "an availability head that has moved (availability-changed-meanwhile)",
      { expectedAvailabilityRevision: "999" },
    ],
  ])("is a conflict for %s", async (_name, stale) => {
    await putChange(cookie ?? "", ANCHOR_ADDRESS, OTHER_ANCHOR_MINOR);
    const state = await stateRead();

    const outcome = await FETCHING_PUBLISH_CLIENT.publish({
      ...publishRequestOf(state),
      ...stale,
    });

    expect(outcome).toEqual({ kind: "conflict" });
  });

  it("is a conflict for a draft that was emptied meanwhile (nothing-to-publish)", async () => {
    const outcome = await FETCHING_PUBLISH_CLIENT.publish(
      publishRequestOf(await stateRead()),
    );

    expect(outcome).toEqual({ kind: "conflict" });
  });

  it.each([
    ["no name", "", "TEXT_EMPTY"],
    ["a name past the limit", "x".repeat(81), "TEXT_TOO_LONG"],
    ["a control character", "bell\u0007", "TEXT_FORBIDDEN_CHARACTER"],
    ["a direction override", "ab\u202Ecd", "TEXT_FORBIDDEN_CHARACTER"],
    ["a name that shows nothing", "\u2800\u2800", "TEXT_EMPTY"],
  ] as const)(
    "is invalid, with the code the field words, for %s",
    async (_name, label, code) => {
      await putChange(cookie ?? "", ANCHOR_ADDRESS, OTHER_ANCHOR_MINOR);

      const outcome = await FETCHING_PUBLISH_CLIENT.publish(
        publishRequestOf(await stateRead(), { label }),
      );

      expect(outcome).toEqual({ kind: "invalid", code });
    },
  );

  it("names the reasons when the catalogue refuses the book, and the draft stays", async () => {
    await putChange(cookie ?? "", STEEP_NARROWING, 90_000);

    const outcome = await FETCHING_PUBLISH_CLIENT.publish(
      publishRequestOf(await stateRead()),
    );

    expect(outcome).toEqual({
      kind: "candidate-refused",
      refusals: [
        {
          source: "catalogue",
          code: "PRICE_NOT_POSITIVE",
          ruleId: "cabinet.base-3drawer",
          buildId: "base-3drawer",
          widthMm: 300,
          heightMm: 860,
          field: "perStepNarrowerMinor",
        },
      ],
    });
    expect((await stateRead()).draft.changes).toHaveLength(1);
  });

  it("names the stale change when the draft holds one that no longer applies", async () => {
    await putChange(cookie ?? "", ANCHOR_ADDRESS, OTHER_ANCHOR_MINOR);
    const state = await stateRead();
    vi.spyOn(prices.stores.priceBook, "readDraft").mockResolvedValue({
      draftRevision: state.draft.draftRevision,
      changes: [...state.draft.changes, STALE_CHANGE],
    });

    const outcome = await FETCHING_PUBLISH_CLIENT.publish(
      publishRequestOf(state),
    );

    expect(outcome).toEqual({
      kind: "candidate-refused",
      refusals: [{ source: "changes", index: 1, code: "UNKNOWN_RULE" }],
    });
  });

  it("says the draft cannot be read, at the revision the route named, and that no version has been published", async () => {
    const state = await stateRead();
    holdUnreadableDraft("9");
    const unreadable = await FETCHING_PUBLISH_CLIENT.publish(
      publishRequestOf(state),
    );
    vi.restoreAllMocks();
    prices = await freshPriceDashboardWorld({ isPublished: false });
    const unpublished = await FETCHING_PUBLISH_CLIENT.publish(
      publishRequestOf(state),
    );

    expect(unreadable).toEqual({
      kind: "draft-unreadable",
      draftRevision: "9",
    });
    expect(unpublished).toEqual({ kind: "no-active-version" });
  });

  it("is session-ended for a signed-out request and a failure for an account without the capability", async () => {
    const state = await stateRead();
    cookie = undefined;
    const signedOut = await FETCHING_PUBLISH_CLIENT.publish(
      publishRequestOf(state),
    );
    cookie = (await signedInAs({ role: "operator" })).session.cookie;
    const operator = await FETCHING_PUBLISH_CLIENT.publish(
      publishRequestOf(state),
    );

    expect(signedOut).toEqual({ kind: "session-ended" });
    expect(operator).toEqual({ kind: "failed" });
  });
});

describe("the history and a restore", () => {
  it("lists the versions newest first, and a page the route refuses is a failure", async () => {
    await publishAnchor(cookie ?? "", OTHER_ANCHOR_MINOR, "Second");

    const first = await FETCHING_PUBLISH_CLIENT.readVersionPage(1);
    const refused = await FETCHING_PUBLISH_CLIENT.readVersionPage(0);

    expect(first.kind).toBe("listed");
    if (first.kind === "listed") {
      expect(first.list.versions.map(({ label }) => label)).toEqual([
        "Second",
        "Version 1",
      ]);
      expect(first.list.total).toBe(2);
    }
    expect(refused).toEqual({ kind: "failed" });
  });

  it("is session-ended for a signed-out page request", async () => {
    cookie = undefined;

    expect(await FETCHING_PUBLISH_CLIENT.readVersionPage(1)).toEqual({
      kind: "session-ended",
    });
  });

  it("puts the archived prices in the draft, and says how many changes it added", async () => {
    await publishAnchor(cookie ?? "", OTHER_ANCHOR_MINOR, "Second");
    const state = await stateRead();

    const outcome = await FETCHING_PUBLISH_CLIENT.restore(
      prices.versionId ?? "",
      { expectedDraftRevision: state.draft.draftRevision },
    );

    expect(outcome.kind).toBe("restored");
    if (outcome.kind !== "restored") return;
    expect(outcome.addedChangeCount).toBeGreaterThan(0);
    expect(outcome.draft.changes).toHaveLength(outcome.addedChangeCount);
    expect((await stateRead()).draft).toEqual(outcome.draft);
  });

  it("sorts the other answers: a moved draft, an unknown version, nothing to differ, a refused candidate", async () => {
    await publishAnchor(cookie ?? "", OTHER_ANCHOR_MINOR, "Second");
    const state = await stateRead();
    const active = state.active.versionId;

    const conflict = await FETCHING_PUBLISH_CLIENT.restore(
      prices.versionId ?? "",
      { expectedDraftRevision: "1" },
    );
    const unknown = await FETCHING_PUBLISH_CLIENT.restore("A".repeat(21), {
      expectedDraftRevision: state.draft.draftRevision,
    });
    const nothingDiffers = await FETCHING_PUBLISH_CLIENT.restore(active, {
      expectedDraftRevision: state.draft.draftRevision,
    });
    vi.spyOn(prices.stores.priceBook, "readDraft").mockResolvedValue({
      draftRevision: state.draft.draftRevision,
      changes: [STALE_CHANGE],
    });
    const refused = await FETCHING_PUBLISH_CLIENT.restore(
      prices.versionId ?? "",
      { expectedDraftRevision: state.draft.draftRevision },
    );

    expect(conflict).toEqual({ kind: "conflict" });
    expect(unknown).toEqual({ kind: "version-not-found" });
    expect(nothingDiffers).toEqual({ kind: "nothing-differs" });
    expect(refused).toEqual({ kind: "candidate-refused" });
  });

  it("is session-ended for a signed-out restore", async () => {
    cookie = undefined;

    expect(
      await FETCHING_PUBLISH_CLIENT.restore(prices.versionId ?? "", {
        expectedDraftRevision: "1",
      }),
    ).toEqual({ kind: "session-ended" });
  });
});

describe("a draft that also holds a change that can no longer be applied", () => {
  it("takes the valid change back out on its own, the refused one staying to be taken back in its turn", async () => {
    const valid = { address: ANCHOR_ADDRESS, value: OTHER_ANCHOR_MINOR };
    const revision = await storeDraft([valid, STALE_CHANGE]);

    const first = await FETCHING_PUBLISH_CLIENT.revert({
      expectedDraftRevision: revision,
      target: { kind: "change", address: ANCHOR_ADDRESS },
    });
    expect(first).toMatchObject({
      kind: "changed",
      draft: { changes: [STALE_CHANGE] },
    });
    if (first.kind !== "changed") return;

    const second = await FETCHING_PUBLISH_CLIENT.revert({
      expectedDraftRevision: first.draft.draftRevision,
      target: { kind: "change", address: STALE_CHANGE.address },
    });
    expect(second).toMatchObject({ kind: "changed", draft: { changes: [] } });
  });
});

describe("the draft routes and a deletion (R4c2)", () => {
  it("takes a deletion back out of the draft through the revert route", async () => {
    const revision = await storeDraft([DELETES_DEFAULT]);

    const outcome = await FETCHING_PUBLISH_CLIENT.revert({
      expectedDraftRevision: revision,
      target: { kind: "change", address: DELETES_DEFAULT.address },
    });

    expect(outcome).toMatchObject({
      kind: "changed",
      draft: { changes: [] },
    });
  });

  // Ruling 9 retires the old pin that a publish names a deleted fixed default as `is-default`: the change route refuses
  // the deletion itself, so no draft written through the app holds one.
  it("refuses a deletion of the default hardware class at the change route as ITEM_IS_DEFAULT, and the draft holds none", async () => {
    const revision = await storeDraft([]);

    const outcome = await FETCHING_PUBLISH_CLIENT.change({
      expectedDraftRevision: revision,
      change: DELETES_DEFAULT,
    });

    expect(outcome).toEqual({ kind: "refused", code: "ITEM_IS_DEFAULT" });
    expect((await stateRead()).draft.changes).toEqual([]);
  });

  it("refuses a publish of a deletion of the default hardware class stored out of band as candidate-refused, and publishes nothing", async () => {
    const state = await stateRead();
    const revision = await storeDraft([DELETES_DEFAULT]);

    const outcome = await FETCHING_PUBLISH_CLIENT.publish({
      ...publishRequestOf(state),
      expectedDraftRevision: revision,
    });

    expect(outcome).toEqual({
      kind: "candidate-refused",
      refusals: [{ code: "ITEM_IS_DEFAULT", index: 0, source: "changes" }],
    });
    expect((await stateRead()).active.sequenceNumber).toBe(
      state.active.sequenceNumber,
    );
  });
});

describe("a publish that deletes a row the request's judgement refuses, read by the fetching client", () => {
  const PREMIUM = { kind: "hardware", tierId: "hardware.premium" } as const;
  const DELETES_PREMIUM = {
    address: { kind: "item-deleted", item: PREMIUM },
    value: true,
  } as const;

  async function publishDeletingPremium() {
    const state = await stateRead();
    const revision = await storeDraft([DELETES_PREMIUM]);
    return FETCHING_PUBLISH_CLIENT.publish({
      ...publishRequestOf(state),
      expectedDraftRevision: revision,
    });
  }

  it("reads the saved default the draft deletes as the page's own block, naming it", async () => {
    await saveDefaults({ tokenHash }, { hardwareTierId: PREMIUM.tierId });

    expect(await publishDeletingPremium()).toEqual({
      kind: "blocked",
      block: { kind: "is-default", item: PREMIUM },
    });
  });

  it("reads the use the draft deletes as the page's own block, naming the item", async () => {
    prices.designs.plant({
      designId: "d-1",
      uses: [PREMIUM],
      isDeletedByClient: false,
    });

    expect(await publishDeletingPremium()).toEqual({
      kind: "blocked",
      block: { kind: "in-use", items: [PREMIUM] },
    });
  });
});
