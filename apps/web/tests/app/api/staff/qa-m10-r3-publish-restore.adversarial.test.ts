import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  readEditableFields,
  parsePriceBook,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { readActivePriceBook } from "@/lib/server/active-price-book";
import {
  STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY,
  STAFF_PRICES_READ_BY_ACCOUNT_POLICY,
} from "@/lib/server/rate-limit/limit-policy";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  captureConsole,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
} from "../../../support/account-world";
import {
  changeDraft,
  currentDraftRevision,
  publishBody,
  publishDraft,
  readVersion,
  restoreVersion,
  revertDraft,
} from "../../../support/price-dashboard-requests";
import {
  freshPriceDashboardWorld,
  priceStoreAsks,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import {
  ANCHOR_ADDRESS,
  VERSIONED_BOOK,
  publishAnchor,
  publishWithLabel,
  putChange,
} from "../../../support/price-versions";
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
 * Publish and restore: refusals come in the order the plan names, a competing write between the route's read and the
 * store's compare-and-set loses, a restore then a publish reproduces the archive, a mixed race has one winner and one
 * audit row, both writes spend the draft bucket, no shape of path id reaches a store, and no typed text is anywhere
 * but the version row.
 */

let staffWorld: StaffWorld;
let prices: PriceDashboardWorld;
let console_: ReturnType<typeof captureConsole>;

beforeEach(async () => {
  freshAccountWorld();
  staffWorld = freshStaffWorld();
  prices = await freshPriceDashboardWorld({ book: VERSIONED_BOOK });
  console_ = captureConsole();
  limiterLedger.reset();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const NEW_ANCHOR_MINOR = 500_000;
const DEPTH_RULE_ADDRESS = { kind: "depth-rule" } as const;
const STEEP_NARROWING = {
  kind: "cabinet",
  ruleId: ANCHOR_ADDRESS.ruleId,
  field: "perStepNarrowerMinor",
} as const;
const STALE_AVAILABILITY = "41";

async function administrator(email = "administrator@example.test") {
  const { session, account } = await signedInAs(
    { role: "administrator" },
    email,
  );
  return { cookie: session.cookie, accountId: account.id, email };
}

function auditRowCount(): number {
  return prices.ledger.heldEvents().length;
}

async function worldFacts() {
  const active = await prices.stores.priceBook.readActive();
  return {
    versions: (await prices.stores.priceBook.listVersions({ page: 1 })).total,
    activeSequence: active.kind === "found" ? active.version.sequenceNumber : 0,
    draft: await prices.stores.priceBook.readDraft(),
    availability: (await prices.stores.availability.readCurrent()).revision,
    auditRows: auditRowCount(),
    staffAuditRows: staffWorld.audit.heldEvents().length,
  };
}

function editableValuesOf(book: PriceBook) {
  return readEditableFields(book).map(({ address, value }) => ({
    address,
    value,
  }));
}

async function archivedBook(versionId: string): Promise<PriceBook> {
  const read = await prices.stores.priceBook.readVersion(versionId);
  if (read.kind !== "found") throw new Error("no such version");
  const parsed = parsePriceBook(read.version.book);
  if (!parsed.ok) throw new Error("the stored book does not parse");
  return parsed.book;
}

async function activeBook(): Promise<PriceBook> {
  const root = await readActivePriceBook(prices.stores);
  if (root.kind !== "active") throw new Error("no active book");
  return root.book;
}

function firstVersionId(): string {
  const { versionId } = prices;
  if (versionId === undefined) throw new Error("the world has no version");
  return versionId;
}

async function restore(cookie: string, id: string) {
  return restoreVersion(id, {
    cookie,
    json: { expectedDraftRevision: await currentDraftRevision() },
  });
}

describe("the order a publish is judged in (recorded behaviour: the store's availability compare-and-set is last)", () => {
  it("answers a bad label 400 before any store is read, even when every revision is stale", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);
    priceStoreAsks.count = 0;

    const answer = await publishDraft({
      cookie,
      json: await publishBody({
        label: "",
        expectedDraftRevision: "7",
        expectedActiveSequence: 9,
        expectedAvailabilityRevision: STALE_AVAILABILITY,
      }),
    });

    expect(answer.status).toBe(400);
    expect(priceStoreAsks.count).toBe(0);
  });

  it("answers a stale draft revision changed-meanwhile before an empty draft or a stale availability head", async () => {
    const { cookie } = await administrator();
    const before = await worldFacts();

    const answer = await publishDraft({
      cookie,
      json: await publishBody({
        expectedDraftRevision: "7",
        expectedAvailabilityRevision: STALE_AVAILABILITY,
      }),
    });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "changed-meanwhile" });
    expect(await worldFacts()).toEqual(before);
  });

  it("answers a stale active sequence changed-meanwhile before a refused candidate", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, STEEP_NARROWING, 90_000);

    const answer = await publishDraft({
      cookie,
      json: await publishBody({ expectedActiveSequence: 5 }),
    });

    expect(await jsonOf(answer)).toEqual({ status: "changed-meanwhile" });
  });

  it("answers an empty draft nothing-to-publish even when the availability head is stale", async () => {
    const { cookie } = await administrator();

    const answer = await publishDraft({
      cookie,
      json: await publishBody({
        expectedAvailabilityRevision: STALE_AVAILABILITY,
      }),
    });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "nothing-to-publish" });
  });

  it("answers a refused candidate candidate-refused even when the availability head is stale", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, STEEP_NARROWING, 90_000);
    const before = await worldFacts();

    const answer = await publishDraft({
      cookie,
      json: await publishBody({
        expectedAvailabilityRevision: STALE_AVAILABILITY,
      }),
    });

    expect(await jsonOf(answer)).toEqual({
      status: "candidate-refused",
      refusals: [expect.objectContaining({ code: "PRICE_NOT_POSITIVE" })],
    });
    expect(await worldFacts()).toEqual(before);
  });
});

describe("a write that lands between the route's read and the store's compare-and-set loses", () => {
  it("is changed-meanwhile for a publish when a draft change slips in, and the slipped-in change is the only write", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);
    const body = await publishBody({ label: "SLIPPED-PAST-LABEL" });
    const original = prices.stores.priceBook.publish.bind(
      prices.stores.priceBook,
    );
    vi.spyOn(prices.stores.priceBook, "publish").mockImplementationOnce(
      async (request) => {
        await putChange(cookie, DEPTH_RULE_ADDRESS, 25);
        return original(request);
      },
    );

    const answer = await publishDraft({ cookie, json: body });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "changed-meanwhile" });
    const facts = await worldFacts();
    expect(facts.versions).toBe(1);
    expect(facts.draft.changes).toHaveLength(2);
    expect(
      prices.ledger
        .heldEvents()
        .filter(({ action }) => action === "price-published")
        .map(({ detail }) => detail),
    ).toEqual([{ provisional: true, sequenceNumber: 1, changeCount: 0 }]);
  });

  it("is changed-meanwhile for a publish when another publish slips in, and exactly two versions exist", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);
    const body = await publishBody({ label: "Late" });
    const original = prices.stores.priceBook.publish.bind(
      prices.stores.priceBook,
    );
    vi.spyOn(prices.stores.priceBook, "publish").mockImplementationOnce(
      async (request) => {
        await publishWithLabel(cookie, "First in");
        return original(request);
      },
    );

    const answer = await publishDraft({ cookie, json: body });

    expect(answer.status).toBe(409);
    const listed = await prices.stores.priceBook.listVersions({ page: 1 });
    expect(listed.versions.map(({ label }) => label)).toEqual([
      "First in",
      "Version 1",
    ]);
  });

  it("is changed-meanwhile for a restore when a publish slips in: the plan made against the old active book is never written over the new draft", async () => {
    const { cookie } = await administrator();
    await publishAnchor(cookie, 510_000, "Second");
    await putChange(cookie, DEPTH_RULE_ADDRESS, 30);
    const body = { expectedDraftRevision: await currentDraftRevision() };
    const original = prices.stores.priceBook.writeDraft.bind(
      prices.stores.priceBook,
    );
    vi.spyOn(prices.stores.priceBook, "writeDraft").mockImplementationOnce(
      async (request) => {
        await publishWithLabel(cookie, "Slipped in");
        return original(request);
      },
    );

    const answer = await restoreVersion(firstVersionId(), {
      cookie,
      json: body,
    });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "changed-meanwhile" });
    expect((await prices.stores.priceBook.readDraft()).changes).toEqual([]);
    expect(
      prices.ledger
        .heldEvents()
        .filter(({ action }) => action === "price-restored-to-draft"),
    ).toEqual([]);
  });
});

describe("a restore followed by a publish", () => {
  it("makes the active book equal to the archived one on every field it states, as a new version at the head of the history", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, DEPTH_RULE_ADDRESS, 20);
    await publishAnchor(cookie, 510_000, "Second");
    await publishAnchor(cookie, 530_000, "Third");
    const archived = await archivedBook(firstVersionId());
    expect(editableValuesOf(await activeBook())).not.toEqual(
      editableValuesOf(archived),
    );

    expect((await restore(cookie, firstVersionId())).status).toBe(200);
    const published = await publishDraft({
      cookie,
      json: await publishBody({ label: "Back to the first" }),
    });

    expect(published.status).toBe(200);
    const { versionId, sequenceNumber } = (await jsonOf(published)) as {
      versionId: string;
      sequenceNumber: number;
    };
    expect(sequenceNumber).toBe(4);
    expect(editableValuesOf(await activeBook())).toEqual(
      editableValuesOf(archived),
    );
    const root = await readActivePriceBook(prices.stores);
    expect(root.kind === "active" && root.versionId).toBe(versionId);
    const listed = await prices.stores.priceBook.listVersions({ page: 1 });
    expect(listed.versions.map(({ state }) => state)).toEqual([
      "active",
      "archived",
      "archived",
      "archived",
    ]);
  });

  it("is nothing to restore straight afterwards: the active book holds the archived values", async () => {
    const { cookie } = await administrator();
    await publishAnchor(cookie, 510_000, "Second");
    await restore(cookie, firstVersionId());
    await publishDraft({
      cookie,
      json: await publishBody({ label: "Back to the first" }),
    });
    const before = await worldFacts();

    const answer = await restore(cookie, firstVersionId());

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "nothing-differs" });
    expect(await worldFacts()).toEqual(before);
  });

  it("publishes nothing, moves neither the active sequence nor the availability head, and writes exactly one audit row", async () => {
    const { cookie } = await administrator();
    await publishAnchor(cookie, 510_000, "Second");
    const before = await worldFacts();

    const answer = await restore(cookie, firstVersionId());

    expect(answer.status).toBe(200);
    const after = await worldFacts();
    expect(after.versions).toBe(before.versions);
    expect(after.activeSequence).toBe(before.activeSequence);
    expect(after.availability).toBe(before.availability);
    expect(after.auditRows).toBe(before.auditRows + 1);
    expect(after.draft.draftRevision).not.toBe(before.draft.draftRevision);
    expect(prices.ledger.heldEvents().at(-1)?.action).toBe(
      "price-restored-to-draft",
    );
  });
});

describe("requests that race for one draft revision", () => {
  type Kind = "publish" | "restore" | "change" | "discard";
  const ACTION_OF: Record<Kind, string> = {
    publish: "price-published",
    restore: "price-restored-to-draft",
    change: "price-draft-changed",
    discard: "price-draft-reverted",
  };

  async function raceInOrder(cookie: string, order: readonly Kind[]) {
    const revision = await currentDraftRevision();
    const publishJson = await publishBody({ label: "Race" });
    const ask: Record<Kind, () => Promise<Response>> = {
      publish: () => publishDraft({ cookie, json: publishJson }),
      restore: () =>
        restoreVersion(firstVersionId(), {
          cookie,
          json: { expectedDraftRevision: revision },
        }),
      change: () =>
        changeDraft({
          cookie,
          json: {
            expectedDraftRevision: revision,
            change: { address: ANCHOR_ADDRESS, value: 640_000 },
          },
        }),
      discard: () =>
        revertDraft({
          cookie,
          json: { expectedDraftRevision: revision, scope: "all" },
        }),
    };
    const answers = await Promise.all(order.map((kind) => ask[kind]()));
    return order.map((kind, index) => ({
      kind,
      status: answers[index]?.status,
    }));
  }

  const RACES: readonly (readonly Kind[])[] = [
    ["publish", "restore", "change", "discard"],
    ["discard", "change", "restore", "publish"],
    ["publish", "restore", "change"],
    ["change", "restore", "publish"],
    ["publish", "restore"],
    ["restore", "publish"],
    ["publish", "change"],
    ["change", "publish"],
    ["restore", "change"],
    ["change", "restore"],
  ];

  it.each(RACES)(
    "let exactly one of %s through, with one audit row and the winner's draft",
    async (...order) => {
      const { cookie } = await administrator();
      await publishAnchor(cookie, 510_000, "Second");
      await putChange(cookie, DEPTH_RULE_ADDRESS, 30);
      const before = await worldFacts();

      const results = await raceInOrder(cookie, order);

      const won = results.filter(({ status }) => status === 200);
      expect(won).toHaveLength(1);
      expect(results.filter(({ status }) => status === 409)).toHaveLength(
        order.length - 1,
      );
      const winner = won[0]?.kind ?? "publish";
      const after = await worldFacts();
      expect(after.auditRows).toBe(before.auditRows + 1);
      expect(prices.ledger.heldEvents().at(-1)?.action).toBe(ACTION_OF[winner]);
      expect(after.versions).toBe(
        before.versions + (winner === "publish" ? 1 : 0),
      );
      if (winner === "publish" || winner === "discard") {
        expect(after.draft.changes).toEqual([]);
      }
      if (winner === "change") expect(after.draft.changes).toHaveLength(2);
    },
  );
});

describe("the draft bucket both writes spend", () => {
  it("is spent by a 409 publish and a 409 restore, and by nothing a 400 or a 404 refuses", async () => {
    const { cookie } = await administrator();
    limiterLedger.counted.length = 0;

    await publishDraft({
      cookie,
      json: await publishBody({ label: "" }),
    });
    await restoreVersion("x".repeat(500), {
      cookie,
      json: { expectedDraftRevision: await currentDraftRevision() },
    });
    await restoreVersion(firstVersionId(), { cookie, json: { nope: 1 } });
    const spentOnRefusals = limiterLedger.counted.filter(
      (name) => name === STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY.name,
    );

    const publishConflict = await publishDraft({
      cookie,
      json: await publishBody(),
    });
    const restoreConflict = await restore(cookie, firstVersionId());
    const spent = limiterLedger.counted.filter(
      (name) => name === STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY.name,
    );

    expect(publishConflict.status).toBe(409);
    expect(restoreConflict.status).toBe(409);
    expect(spentOnRefusals).toEqual([]);
    expect(spent).toHaveLength(2);
  });

  it("refuses a publish and a restore alike with 429 once it is spent, before any store is read", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);
    const publishJson = await publishBody();
    const restoreJson = { expectedDraftRevision: await currentDraftRevision() };
    limiterLedger.refusing.set(STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY.name, 1);
    priceStoreAsks.count = 0;
    const before = await worldFacts();
    priceStoreAsks.count = 0;

    const publishAnswer = await publishDraft({ cookie, json: publishJson });
    const restoreAnswer = await restoreVersion(firstVersionId(), {
      cookie,
      json: restoreJson,
    });

    expect(publishAnswer.status).toBe(429);
    expect(restoreAnswer.status).toBe(429);
    expect(priceStoreAsks.count).toBe(0);
    expect(await worldFacts()).toEqual(before);
  });

  it("is not the read bucket: a read does not spend it and a write does not spend the read bucket", async () => {
    const { cookie } = await administrator();
    limiterLedger.counted.length = 0;

    await readVersion(firstVersionId(), { cookie });
    await publishDraft({ cookie, json: await publishBody() });
    const counted = new Set(limiterLedger.counted);

    expect(counted.has(STAFF_PRICES_READ_BY_ACCOUNT_POLICY.name)).toBe(true);
    expect(
      limiterLedger.counted.filter(
        (name) => name === STAFF_PRICES_READ_BY_ACCOUNT_POLICY.name,
      ),
    ).toHaveLength(1);
  });
});

describe("a path id that no store could hold", () => {
  // The fake store mints nanoid ids (A-Za-z0-9_-) and a Postgres text column cannot hold a NUL, so a control character, a
  // separator or a space in a path id is not an id of any store: it must be a 404 that asks no store and spends no bucket,
  // like the over-long id. `isIdentifier` bounds only the length, so each of these reaches the store today.
  const UNHOLDABLE_IDS = [
    ["a NUL", "\u0000"],
    ["a NUL inside an id", "abc\u0000def"],
    ["a line feed", "abc\ndef"],
    ["a DEL", "\u007f"],
    ["a C1 control", "\u0085"],
    ["a path", "../etc/passwd"],
    ["a space", "a b"],
  ] as const;

  it("is a 404 on the restore that asks no store and spends no bucket, whatever of these it holds", async () => {
    const { cookie } = await administrator();
    const reachedAStore: string[] = [];
    const spentABucket: string[] = [];
    for (const [title, id] of UNHOLDABLE_IDS) {
      limiterLedger.counted.length = 0;
      priceStoreAsks.count = 0;

      const answer = await restoreVersion(id, {
        cookie,
        json: { expectedDraftRevision: await currentDraftRevision() },
      });

      expect(answer.status).toBe(404);
      if (priceStoreAsks.count > 0) reachedAStore.push(title);
      if (
        limiterLedger.counted.includes(STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY.name)
      ) {
        spentABucket.push(title);
      }
    }

    expect({ reachedAStore, spentABucket }).toEqual({
      reachedAStore: [],
      spentABucket: [],
    });
  });

  it("is a 404 on the version read that asks no store, spends no bucket and writes no audit row, whatever of these it holds", async () => {
    const { cookie } = await administrator();
    const reachedAStore: string[] = [];
    const spentABucket: string[] = [];
    for (const [title, id] of UNHOLDABLE_IDS) {
      limiterLedger.counted.length = 0;
      priceStoreAsks.count = 0;

      const answer = await readVersion(id, { cookie });

      expect(answer.status).toBe(404);
      if (priceStoreAsks.count > 0) reachedAStore.push(title);
      if (
        limiterLedger.counted.includes(STAFF_PRICES_READ_BY_ACCOUNT_POLICY.name)
      ) {
        spentABucket.push(title);
      }
    }

    expect({ reachedAStore, spentABucket }).toEqual({
      reachedAStore: [],
      spentABucket: [],
    });
    expect(staffWorld.audit.heldEvents()).toEqual([]);
  });

  it("is judged at the identifier bound: 64 characters reach the store and are not found, 65 do not reach it", async () => {
    const { cookie } = await administrator();

    priceStoreAsks.count = 0;
    const atBound = await readVersion("a".repeat(64), { cookie });
    const asksAtBound = priceStoreAsks.count;
    priceStoreAsks.count = 0;
    const pastBound = await readVersion("a".repeat(65), { cookie });

    expect(atBound.status).toBe(404);
    expect(asksAtBound).toBeGreaterThan(0);
    expect(pastBound.status).toBe(404);
    expect(priceStoreAsks.count).toBe(0);
  });
});

describe("what a person typed stays in the version row", () => {
  const LABEL_MARKER = "LABEL-MARKER-7731";
  const NOTE_MARKER = "NOTE-MARKER-5519";

  it("is in no audit row, no staff audit row, no log line and no response but the version's own", async () => {
    const { cookie, accountId, email } = await administrator();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);
    const published = await publishDraft({
      cookie,
      json: await publishBody({ label: LABEL_MARKER, note: NOTE_MARKER }),
    });
    const { versionId } = (await jsonOf(published)) as { versionId: string };
    await publishAnchor(cookie, 520_000, "Third");
    await restore(cookie, versionId);
    const answers = await Promise.all([
      readVersion(versionId, { cookie }),
      readVersion("nothing-here", { cookie }),
    ]);
    const bodies = await Promise.all(answers.map((answer) => answer.text()));

    const leaky = JSON.stringify([
      prices.ledger.heldEvents(),
      staffWorld.audit.heldEvents(),
      console_.everything(),
      await publishedAnswerText(published),
    ]);
    expect(leaky).not.toContain(LABEL_MARKER);
    expect(leaky).not.toContain(NOTE_MARKER);
    expect(bodies[0]).toContain(LABEL_MARKER);
    expect(bodies[0]).toContain(NOTE_MARKER);
    expect(bodies[0]).not.toContain(accountId);
    expect(bodies[0]).not.toContain(email);
    expect(bodies[1]).not.toContain(LABEL_MARKER);
  });

  it("leaves every price audit row inside its closed key list", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);
    await publishWithLabel(cookie, LABEL_MARKER);
    await publishAnchor(cookie, 520_000, "Third");
    await restore(cookie, firstVersionId());
    await readVersion(firstVersionId(), { cookie });

    const closedKeys: Record<string, readonly string[]> = {
      "price-published": ["sequenceNumber", "changeCount", "provisional"],
      "price-restored-to-draft": ["fromSequenceNumber", "changeCount"],
    };
    const writes = prices.ledger
      .heldEvents()
      .filter(({ action }) => action in closedKeys);
    expect(writes.length).toBeGreaterThanOrEqual(3);
    for (const row of writes) {
      const allowed = closedKeys[row.action] ?? [];
      expect(Object.keys(row.detail).sort()).toEqual([...allowed].sort());
      for (const value of Object.values(row.detail)) {
        expect(["number", "boolean"]).toContain(typeof value);
      }
    }
    const reads = staffWorld.audit.heldEvents();
    expect(reads.length).toBeGreaterThan(0);
    for (const row of reads) {
      expect(row.action).toBe("price-catalogue-viewed");
      expect(Object.keys(row.detail ?? {})).toEqual(["section"]);
    }
  });
});

async function publishedAnswerText(answer: Response): Promise<string> {
  return answer.clone().text();
}

describe("a hostile publish or restore body", () => {
  async function withADraftChange() {
    const { cookie } = await administrator();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);
    return cookie;
  }

  it.each([
    "__proto__",
    "constructor",
    "toString",
    "hasOwnProperty",
    "prototype",
  ])(
    "names a member called %s: the request is not read, and nothing is stored",
    async (name) => {
      const cookie = await withADraftChange();
      const before = await worldFacts();
      const base = JSON.stringify(await publishBody());
      const withMember = `${base.slice(0, -1)},${JSON.stringify(name)}:{"label":"x"}}`;

      const answer = await publishDraft({ cookie, json: withMember });

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({ status: "invalid-request" });
      expect(await worldFacts()).toEqual(before);
    },
  );

  it("reads nothing a polluted Object.prototype supplies: an absent label stays absent and an absent note stays empty", async () => {
    const cookie = await withADraftChange();
    const { label: _label, note: _note, ...withoutText } = await publishBody();
    void _label;
    void _note;
    const prototype = Object.prototype as Record<string, unknown>;
    try {
      prototype.label = "POLLUTED-LABEL";
      prototype.note = "POLLUTED-NOTE";

      const refused = await publishDraft({ cookie, json: withoutText });
      expect(refused.status).toBe(400);
      expect(await jsonOf(refused)).toEqual({
        status: "invalid-input",
        issues: [{ field: "label", code: "TEXT_EMPTY" }],
      });

      const accepted = await publishDraft({
        cookie,
        json: { ...withoutText, label: "Own label" },
      });
      expect(accepted.status).toBe(200);
    } finally {
      delete prototype.label;
      delete prototype.note;
    }
    const active = await prices.stores.priceBook.readActive();
    expect(active.kind === "found" && active.version.label).toBe("Own label");
    const read = await prices.stores.priceBook.readVersion(
      active.kind === "found" ? active.version.versionId : "",
    );
    expect(read.kind === "found" && read.version.note).toBe("");
  });

  it.each([
    [
      "a sequence past the safe integers",
      '"expectedActiveSequence":9007199254740993',
      400,
    ],
    ["a sequence of 1e400 (Infinity)", '"expectedActiveSequence":1e400', 400],
    ["a sequence written 1.0", '"expectedActiveSequence":1.0', 200],
    ["a sequence written 1e0", '"expectedActiveSequence":1e0', 200],
    ["a sequence of null", '"expectedActiveSequence":null', 400],
    ["a sequence of true", '"expectedActiveSequence":true', 400],
  ])("%s is %s", async (_title, member, status) => {
    const cookie = await withADraftChange();
    const body = JSON.stringify({
      ...(await publishBody()),
      expectedActiveSequence: "SEQUENCE",
    }).replace('"expectedActiveSequence":"SEQUENCE"', member);

    const answer = await publishDraft({ cookie, json: body });

    expect(answer.status).toBe(status);
    expect((await worldFacts()).versions).toBe(status === 200 ? 2 : 1);
  });

  it("takes the last of a member written twice, as JSON does, and judges that one", async () => {
    const cookie = await withADraftChange();
    const body = JSON.stringify(await publishBody()).replace(
      '"label":"Autumn prices"',
      '"label":"","label":"Written twice"',
    );

    const answer = await publishDraft({ cookie, json: body });

    expect(answer.status).toBe(200);
    const active = await prices.stores.priceBook.readActive();
    expect(active.kind === "found" && active.version.label).toBe(
      "Written twice",
    );
  });

  it("refuses a restore whose body names a version, and restores only the path's", async () => {
    const { cookie } = await administrator();
    await publishAnchor(cookie, 510_000, "Second");
    const before = await worldFacts();

    for (const extra of [
      { versionId: firstVersionId() },
      { expectedActiveSequence: 2 },
      { label: "x" },
    ]) {
      const answer = await restoreVersion(firstVersionId(), {
        cookie,
        json: { expectedDraftRevision: await currentDraftRevision(), ...extra },
      });
      expect(answer.status).toBe(400);
    }

    expect(await worldFacts()).toEqual(before);
  });
});

describe("the order a restore is judged in (recorded behaviour)", () => {
  it("is 404 for an unknown well-formed version even when the draft revision is stale", async () => {
    const { cookie } = await administrator();

    const answer = await restoreVersion("no-such-version", {
      cookie,
      json: { expectedDraftRevision: "7" },
    });

    expect(answer.status).toBe(404);
    expect(await jsonOf(answer)).toEqual({ status: "version-not-found" });
  });

  it("is changed-meanwhile for a known version with a stale draft revision, ahead of nothing-differs", async () => {
    const { cookie } = await administrator();

    const answer = await restoreVersion(firstVersionId(), {
      cookie,
      json: { expectedDraftRevision: "7" },
    });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "changed-meanwhile" });
  });

  it("is no-active-version before the first publish whatever id the path names, and reads no version", async () => {
    const { cookie } = await administrator();
    prices = await freshPriceDashboardWorld({ isPublished: false });
    const readVersionSpy = vi.spyOn(prices.stores.priceBook, "readVersion");

    const answer = await restoreVersion("any-id", {
      cookie,
      json: { expectedDraftRevision: await currentDraftRevision() },
    });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "no-active-version" });
    expect(readVersionSpy).not.toHaveBeenCalled();
  });

  it("never reports a version's existence to a refused caller: an operator is 403 for a real id and an unknown one alike", async () => {
    const operator = await signedInAs({ role: "operator" });
    const json = { expectedDraftRevision: await currentDraftRevision() };

    const real = await restoreVersion(firstVersionId(), {
      cookie: operator.session.cookie,
      json,
    });
    const unknown = await restoreVersion("no-such-version", {
      cookie: operator.session.cookie,
      json,
    });

    expect(real.status).toBe(403);
    expect(unknown.status).toBe(403);
    expect(await real.text()).toBe(await unknown.text());
  });
});
