import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyChanges,
  parsePriceBook,
  readEditableFields,
  restoreChanges,
  type DraftChange,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { readActivePriceBook } from "@/lib/server/active-price-book";
import { STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY } from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  DRIVER_FAILURE_MARKER,
  captureConsole,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
  type AccountWorld,
} from "../../../support/account-world";
import {
  currentDraftRevision,
  restoreVersion,
} from "../../../support/price-dashboard-requests";
import {
  freshPriceDashboardWorld,
  priceStoreAsks,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import {
  ANCHOR_ADDRESS,
  SAMPLE_ANCHOR_MINOR,
  VERSIONED_BOOK,
  publishAnchor,
  publishWithLabel,
  putChange,
} from "../../../support/price-versions";
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

/**
 * `POST /api/staff/prices/versions/{id}/restore` (M10 R3, ruling U5-Q6, 2026-10-27). A restore puts an archived version's
 * prices in the draft and publishes nothing. `restoreChanges(archived, active)` is exact only relative to its second
 * argument, so the server makes the plan against the candidate the draft makes: a pending value of a field the archived book
 * states is replaced, and the candidate then reproduces the archived book (D8C).
 */

let world: AccountWorld;
let prices: PriceDashboardWorld;
let console_: ReturnType<typeof captureConsole>;

beforeEach(async () => {
  world = freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld({ book: VERSIONED_BOOK });
  console_ = captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const DEPTH_RULE_ADDRESS = { kind: "depth-rule" } as const;
const OTHER_ANCHOR_MINOR = 500_000;
const PENDING_ANCHOR_MINOR = 620_000;

async function administrator() {
  const { session, account } = await signedInAs({ role: "administrator" });
  return { cookie: session.cookie, accountId: account.id };
}

function versionOne(): string {
  const { versionId } = prices;
  if (versionId === undefined) throw new Error("the world has no version");
  return versionId;
}

async function restore(
  cookie: string,
  id: string,
  overrides: Record<string, unknown> = {},
) {
  return restoreVersion(id, {
    cookie,
    json: { expectedDraftRevision: await currentDraftRevision(), ...overrides },
  });
}

async function storedDraft() {
  return prices.stores.priceBook.readDraft();
}

function restoreRows() {
  return prices.ledger
    .heldEvents()
    .filter(({ action }) => action === "price-restored-to-draft");
}

async function activeBook(): Promise<PriceBook> {
  const root = await readActivePriceBook(prices.stores);
  if (root.kind !== "active") throw new Error("no active book");
  return root.book;
}

async function archivedBook(id: string): Promise<PriceBook> {
  const read = await prices.stores.priceBook.readVersion(id);
  if (read.kind !== "found") throw new Error("no such version");
  const parsed = parsePriceBook(read.version.book);
  if (!parsed.ok) throw new Error("the stored book does not parse");
  return parsed.book;
}

/** The book the stored draft makes over the active one: what a publish would store. */
async function candidateOfStoredDraft(): Promise<PriceBook> {
  const applied = applyChanges(
    await activeBook(),
    (await storedDraft()).changes as readonly DraftChange[],
  );
  if (!applied.ok) throw new Error("the stored draft does not apply");
  return applied.book;
}

interface Snapshot {
  readonly versions: number;
  readonly draft: unknown;
  readonly auditRows: number;
}

async function snapshot(): Promise<Snapshot> {
  return {
    versions: (await prices.stores.priceBook.listVersions({ page: 1 })).total,
    draft: await storedDraft(),
    auditRows: prices.ledger.heldEvents().length,
  };
}

describe("a restore with an empty draft", () => {
  it("puts the archived prices in the draft, answers the draft and the count it added, and publishes nothing", async () => {
    const { cookie } = await administrator();
    await publishAnchor(cookie, OTHER_ANCHOR_MINOR);
    const versionsBefore = (await snapshot()).versions;

    const answer = await restore(cookie, versionOne());

    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
    const stored = await storedDraft();
    expect(await jsonOf(answer)).toEqual({
      draft: { draftRevision: stored.draftRevision, changes: stored.changes },
      addedChangeCount: 1,
    });
    expect(stored.changes).toEqual([
      { address: ANCHOR_ADDRESS, value: SAMPLE_ANCHOR_MINOR },
    ]);
    expect((await snapshot()).versions).toBe(versionsBefore);
    const active = await prices.stores.priceBook.readActive();
    expect(active.kind === "found" && active.version.sequenceNumber).toBe(2);
  });

  it("records one price-restored-to-draft row naming the version and the count, and no value or text", async () => {
    const { cookie, accountId } = await administrator();
    await publishAnchor(cookie, OTHER_ANCHOR_MINOR, "ETIQUETTE-7731");

    await restore(cookie, versionOne());

    expect(
      restoreRows().map(({ detail, actorAccountId }) => ({
        detail,
        actorAccountId,
      })),
    ).toEqual([
      {
        detail: { fromSequenceNumber: 1, changeCount: 1 },
        actorAccountId: accountId,
      },
    ]);
    expect(JSON.stringify(prices.ledger.heldEvents())).not.toContain(
      "ETIQUETTE-7731",
    );
  });
});

describe("a restore against a draft that already edits a field (ruling U5-Q6)", () => {
  it("reproduces the archived value when the draft edits a field the active book already holds (active 100, draft 120, archived 100)", async () => {
    const { cookie } = await administrator();
    // Version 2 changes the depth rule only, so its anchor equals version 1's: against the active book alone the restore
    // would emit nothing for the anchor, and the draft's pending value would survive.
    await putChange(cookie, DEPTH_RULE_ADDRESS, 20);
    await publishWithLabel(cookie, "Second");
    await putChange(cookie, ANCHOR_ADDRESS, PENDING_ANCHOR_MINOR);
    const archived = await archivedBook(versionOne());

    const answer = await restore(cookie, versionOne());

    expect(answer.status).toBe(200);
    const candidate = await candidateOfStoredDraft();
    expect(restoreChanges(archived, candidate)).toEqual([]);
    expect(editableValuesOf(candidate)).toEqual(editableValuesOf(archived));
    const stored = (await storedDraft()).changes as readonly DraftChange[];
    expect(
      stored.some(
        ({ address }) =>
          address.kind === "cabinet" && address.field === "anchorMinor",
      ),
    ).toBe(false);
  });

  it("replaces a pending value of a field the active book holds differently from the archived one", async () => {
    const { cookie } = await administrator();
    await publishAnchor(cookie, OTHER_ANCHOR_MINOR);
    await putChange(cookie, ANCHOR_ADDRESS, PENDING_ANCHOR_MINOR);
    const archived = await archivedBook(versionOne());

    const answer = await restore(cookie, versionOne());

    expect(answer.status).toBe(200);
    expect((await storedDraft()).changes).toEqual([
      { address: ANCHOR_ADDRESS, value: SAMPLE_ANCHOR_MINOR },
    ]);
    expect(editableValuesOf(await candidateOfStoredDraft())).toEqual(
      editableValuesOf(archived),
    );
  });

  it("puts the archive back whatever the draft held, so the candidate is the archived book field for field", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, DEPTH_RULE_ADDRESS, 20);
    await publishAnchor(cookie, OTHER_ANCHOR_MINOR);
    await putChange(cookie, ANCHOR_ADDRESS, PENDING_ANCHOR_MINOR);
    await putChange(cookie, DEPTH_RULE_ADDRESS, 35);
    await putChange(cookie, { kind: "provisional" }, false);
    const archived = await archivedBook(versionOne());

    const answer = await restore(cookie, versionOne());

    expect(answer.status).toBe(200);
    expect(editableValuesOf(await candidateOfStoredDraft())).toEqual(
      editableValuesOf(archived),
    );
    expect(
      ((await jsonOf(answer)) as { addedChangeCount: number }).addedChangeCount,
    ).toBe(restoreChanges(archived, await activeBook()).length);
  });

  it("counts what the restore adds to the active book in the audit row, not the draft's size", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, DEPTH_RULE_ADDRESS, 20);
    await publishWithLabel(cookie, "Second");
    await putChange(cookie, ANCHOR_ADDRESS, PENDING_ANCHOR_MINOR);

    await restore(cookie, versionOne());

    expect(restoreRows().at(-1)?.detail).toEqual({
      fromSequenceNumber: 1,
      changeCount: 1,
    });
  });
});

describe("a restore that has nothing to do is 409 nothing-differs, with nothing written", () => {
  it("for the active version", async () => {
    const { cookie } = await administrator();
    const active = await publishAnchor(cookie, OTHER_ANCHOR_MINOR);
    const before = await snapshot();

    const answer = await restore(cookie, active);

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "nothing-differs" });
    expect(await snapshot()).toEqual(before);
  });

  it("for an archived version whose prices the active book holds again", async () => {
    const { cookie } = await administrator();
    await publishAnchor(cookie, OTHER_ANCHOR_MINOR);
    await publishAnchor(cookie, SAMPLE_ANCHOR_MINOR);
    const before = await snapshot();

    const answer = await restore(cookie, versionOne());

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "nothing-differs" });
    expect(await snapshot()).toEqual(before);
  });

  it("is not judged against the active book alone: a draft that already holds the archived value is nothing to restore", async () => {
    const { cookie } = await administrator();
    await publishAnchor(cookie, OTHER_ANCHOR_MINOR);
    await putChange(cookie, ANCHOR_ADDRESS, SAMPLE_ANCHOR_MINOR);
    const before = await snapshot();

    const answer = await restore(cookie, versionOne());

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "nothing-differs" });
    expect(await snapshot()).toEqual(before);
  });
});

describe("a version that cannot be restored", () => {
  it.each([
    ["an unknown id", "no-such-version"],
    ["an id longer than any id", "x".repeat(500)],
    ["an id with a path in it", "../../x"],
  ])(
    "answers %s with 404, echoing nothing, and writes nothing",
    async (_title, id) => {
      const { cookie } = await administrator();
      const before = await snapshot();

      const answer = await restore(cookie, id);

      expect(answer.status).toBe(404);
      expect(await jsonOf(answer)).toEqual({ status: "version-not-found" });
      expect(await snapshot()).toEqual(before);
    },
  );

  it("asks no store and spends no bucket for an id that cannot be an id", async () => {
    const { cookie } = await administrator();
    limiterLedger.counted.length = 0;
    priceStoreAsks.count = 0;

    await restore(cookie, "x".repeat(500));

    expect(priceStoreAsks.count).toBe(0);
    expect(limiterLedger.counted).not.toContain(
      STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY.name,
    );
  });

  it("is 503 when the stored book is not a book, and writes nothing", async () => {
    const { cookie } = await administrator();
    await publishAnchor(cookie, OTHER_ANCHOR_MINOR);
    const before = await snapshot();
    const real = prices.stores.priceBook.readVersion.bind(
      prices.stores.priceBook,
    );
    vi.spyOn(prices.stores.priceBook, "readVersion").mockImplementation(
      async (id) => {
        const read = await real(id);
        return read.kind === "found"
          ? {
              kind: "found",
              version: { ...read.version, book: { STORED: "JUNK-3341" } },
            }
          : read;
      },
    );

    const answer = await restore(cookie, versionOne());

    expect(answer.status).toBe(503);
    expect(console_.everything()).not.toContain("JUNK-3341");
    vi.restoreAllMocks();
    expect(await snapshot()).toEqual(before);
  });
});

describe("a restore is a write against the draft revision the page read", () => {
  it("is 409 changed-meanwhile when the draft moved, and restores nothing", async () => {
    const { cookie } = await administrator();
    await publishAnchor(cookie, OTHER_ANCHOR_MINOR);
    const seen = await currentDraftRevision();
    await putChange(cookie, DEPTH_RULE_ADDRESS, 20);
    const before = await snapshot();

    const answer = await restore(cookie, versionOne(), {
      expectedDraftRevision: seen,
    });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "changed-meanwhile" });
    expect(await snapshot()).toEqual(before);
  });

  it("lets exactly one of two restores made at once through", async () => {
    const { cookie } = await administrator();
    await publishAnchor(cookie, OTHER_ANCHOR_MINOR);
    const seen = await currentDraftRevision();

    const answers = await Promise.all([
      restore(cookie, versionOne(), { expectedDraftRevision: seen }),
      restore(cookie, versionOne(), { expectedDraftRevision: seen }),
    ]);

    expect(answers.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(restoreRows()).toHaveLength(1);
  });

  it("is 409 no-active-version before the first publish", async () => {
    prices = await freshPriceDashboardWorld({
      isPublished: false,
      book: VERSIONED_BOOK,
    });
    const { cookie } = await administrator();

    const answer = await restore(cookie, "anything", {
      expectedDraftRevision: "0",
    });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "no-active-version" });
  });

  it("is 409 draft-unreadable over a stored draft that is not what a draft holds", async () => {
    const { cookie } = await administrator();
    await publishAnchor(cookie, OTHER_ANCHOR_MINOR);
    vi.spyOn(prices.stores.priceBook, "readDraft").mockResolvedValue({
      draftRevision: "9",
      changes: [{ address: { kind: "cabinet" }, value: "STORED-JUNK-4471" }],
    });
    const write = vi.spyOn(prices.stores.priceBook, "writeDraft");

    const answer = await restore(cookie, versionOne(), {
      expectedDraftRevision: "9",
    });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({
      status: "draft-unreadable",
      draftRevision: "9",
    });
    expect(write).not.toHaveBeenCalled();
    expect(console_.everything()).not.toContain("STORED-JUNK-4471");
  });

  it("is 409 candidate-refused when a stale pending change still cannot apply after the restore, and writes nothing", async () => {
    const { cookie } = await administrator();
    await publishAnchor(cookie, OTHER_ANCHOR_MINOR);
    const revision = await currentDraftRevision();
    vi.spyOn(prices.stores.priceBook, "readDraft").mockResolvedValue({
      draftRevision: revision,
      changes: [
        {
          address: {
            kind: "cabinet",
            ruleId: "cabinet.gone",
            field: "anchorMinor",
          },
          value: 5_000,
        },
      ],
    });
    const write = vi.spyOn(prices.stores.priceBook, "writeDraft");

    const answer = await restore(cookie, versionOne(), {
      expectedDraftRevision: revision,
    });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "candidate-refused" });
    expect(write).not.toHaveBeenCalled();
    expect(restoreRows()).toEqual([]);
  });
});

describe("the body", () => {
  it.each([
    ["text that is not JSON", "{nope"],
    ["an array", "[]"],
    ["an empty object", "{}"],
    ["a member it does not take", '{"expectedDraftRevision":"0","book":{}}'],
    ["a revision with a leading zero", '{"expectedDraftRevision":"01"}'],
    ["a revision sent as a number", '{"expectedDraftRevision":0}'],
    [
      "a revision past a bigint",
      '{"expectedDraftRevision":"9223372036854775808"}',
    ],
  ])("refuses %s with 400, and writes nothing", async (_title, text) => {
    const { cookie } = await administrator();
    await publishAnchor(cookie, OTHER_ANCHOR_MINOR);
    const before = await snapshot();

    const answer = await restoreVersion(versionOne(), { cookie, json: text });

    expect(answer.status).toBe(400);
    expect(await snapshot()).toEqual(before);
  });

  it("refuses a cross-site request before the session is read, and a body that is not JSON with 415", async () => {
    const { cookie } = await administrator();

    const crossSite = await restoreVersion(versionOne(), {
      secFetchSite: "cross-site",
      json: { expectedDraftRevision: "0" },
    });
    const notJson = await restoreVersion(versionOne(), {
      cookie,
      contentType: "text/plain",
      json: "{}",
    });

    expect(crossSite.status).toBe(403);
    expect(await jsonOf(crossSite)).toEqual({ status: "cross-site" });
    expect(notJson.status).toBe(415);
    expect(priceStoreAsks.count).toBe(0);
  });
});

describe("a restore and its audit row are one thing", () => {
  it("answers 503 with no detail when the audit row cannot be staged, and the draft is unchanged", async () => {
    const { cookie } = await administrator();
    await publishAnchor(cookie, OTHER_ANCHOR_MINOR);
    const before = await snapshot();
    vi.spyOn(prices.ledger, "stage").mockRejectedValue(
      new Error(DRIVER_FAILURE_MARKER),
    );

    const answer = await restore(cookie, versionOne());

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
    vi.restoreAllMocks();
    expect(await snapshot()).toEqual(before);
  });

  it("answers 401 when the session ended between the route's read and the store's write, and writes nothing", async () => {
    const { cookie, accountId } = await administrator();
    await publishAnchor(cookie, OTHER_ANCHOR_MINOR);
    const before = await snapshot();
    const realStage = prices.ledger.stage.bind(prices.ledger);
    vi.spyOn(prices.ledger, "stage").mockImplementation(async (request) => {
      await world.sessions.revokeAllForAccount(accountId);
      return realStage(request);
    });

    const answer = await restore(cookie, versionOne());

    expect(answer.status).toBe(401);
    vi.restoreAllMocks();
    expect(await snapshot()).toEqual(before);
  });

  it("is counted in the draft bucket, refused with 429 above it, and fails closed", async () => {
    const { cookie } = await administrator();
    await publishAnchor(cookie, OTHER_ANCHOR_MINOR);
    const before = await snapshot();
    limiterLedger.refusing.set(STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY.name, 5);

    const limited = await restore(cookie, versionOne());
    limiterLedger.refusing.clear();
    limiterLedger.unavailable.add(STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY.name);
    const failedClosed = await restore(cookie, versionOne());

    expect(limited.status).toBe(429);
    expect(failedClosed.status).toBe(503);
    expect(await snapshot()).toEqual(before);
  });
});

/** The value of every editable field of a book, by the field's address: what "the same prices" means. */
function editableValuesOf(book: PriceBook): unknown {
  return readEditableFields(book).map(({ address, value }) => [
    JSON.stringify(address),
    value,
  ]);
}
