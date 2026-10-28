import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyChanges,
  buildKitchenLBodyCatalog,
  DEFAULT_CABINET_DEPTH_MM,
  judgeBookAgainstCatalog,
  SAMPLE_PRICE_BOOK,
  type DraftChange,
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
  changeDraft,
  currentDraftRevision,
  publishBody,
  publishDraft,
} from "../../../support/price-dashboard-requests";
import {
  freshPriceDashboardWorld,
  priceStoreAsks,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
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
 * `POST /api/staff/prices/publish` (M10 R3, ADR 0178 A-15, F7, F10). The route is called with `Request` objects over the
 * persistence package's price-book fake, which commits a publish with its audit row or not at all; the session, the
 * capability, the limiter, `applyChanges` and `judgeBookAgainstCatalog` are the real ones. The book is computed from the
 * stored draft, so the body carries only the revisions a page read and the version's label and note.
 */

let world: AccountWorld;
let prices: PriceDashboardWorld;
let console_: ReturnType<typeof captureConsole>;

beforeEach(async () => {
  world = freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld({ book: PUBLISHED_BOOK });
  console_ = captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// The sample book, the one book of the tests that passes the catalogue's judgement as it is: the publish judges the whole
// candidate, so the world publishes a book that is publishable. Its row `cabinet.base-3drawer` is priced from an anchor.
const PUBLISHED_BOOK = SAMPLE_PRICE_BOOK;
const ANCHORED_RULE_ID = "cabinet.base-3drawer";
const NEW_ANCHOR_MINOR = 500_000;

const ANCHOR_ADDRESS = {
  kind: "cabinet",
  ruleId: ANCHORED_RULE_ID,
  field: "anchorMinor",
} as const;

const ASTRAL_CHARACTER = "\u{1F373}";
const COMBINING_ACUTE = "́";
const ZERO_WIDTH_SPACE = "​";
const RIGHT_TO_LEFT_OVERRIDE = "‮";
const LINE_SEPARATOR = " ";
const LONE_HIGH_SURROGATE = "\uD800";

async function administrator(email = "administrator@example.test") {
  const { session, account } = await signedInAs(
    { role: "administrator" },
    email,
  );
  return { cookie: session.cookie, accountId: account.id };
}

async function putChange(cookie: string, address: unknown, value: unknown) {
  const answer = await changeDraft({
    cookie,
    json: {
      expectedDraftRevision: await currentDraftRevision(),
      change: { address, value },
    },
  });
  expect(answer.status).toBe(200);
}

async function publish(
  cookie: string,
  overrides: Record<string, unknown> = {},
) {
  return publishDraft({ cookie, json: await publishBody(overrides) });
}

async function versionCount(): Promise<number> {
  return (await prices.stores.priceBook.listVersions({ page: 1 })).total;
}

function publishedRows() {
  return prices.ledger
    .heldEvents()
    .filter(({ action }) => action === "price-published");
}

/** The state a refused publish must leave as it found it. */
interface Snapshot {
  readonly versions: number;
  readonly draft: unknown;
  readonly auditRows: number;
  readonly availabilityRevision: string;
}

async function snapshot(): Promise<Snapshot> {
  return {
    versions: await versionCount(),
    draft: await prices.stores.priceBook.readDraft(),
    auditRows: prices.ledger.heldEvents().length,
    availabilityRevision: (await prices.stores.availability.readCurrent())
      .revision,
  };
}

async function expectNothingWritten(before: Snapshot): Promise<void> {
  expect(await snapshot()).toEqual(before);
}

describe("a publish that is accepted", () => {
  it("stores the book the draft makes as the next version, resets the draft, and answers what went live", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);
    const draftBefore = await prices.stores.priceBook.readDraft();

    const answer = await publish(cookie, { label: "Autumn prices" });

    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toBe("private, no-store");
    const published = (await jsonOf(answer)) as {
      versionId: string;
      sequenceNumber: number;
      availabilityRevision: string;
    };
    expect(published.sequenceNumber).toBe(2);
    expect(Object.keys(published).sort()).toEqual([
      "availabilityRevision",
      "sequenceNumber",
      "versionId",
    ]);
    const active = await prices.stores.priceBook.readActive();
    expect(active.kind === "found" && active.version.versionId).toBe(
      published.versionId,
    );
    const draftAfter = await prices.stores.priceBook.readDraft();
    expect(draftAfter.changes).toEqual([]);
    expect(draftAfter.draftRevision).not.toBe(draftBefore.draftRevision);
    expect(await versionCount()).toBe(2);
  });

  it("prices the next customer at the new version: the active book root names it, with the draft's prices", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);

    const answer = await publish(cookie);
    const { versionId } = (await jsonOf(answer)) as { versionId: string };

    const root = await readActivePriceBook(prices.stores);
    expect(root.kind).toBe("active");
    if (root.kind !== "active") return;
    expect(root.versionId).toBe(versionId);
    expect(root.versionId).not.toBe(prices.versionId);
    expect(root.book.version).toBe(versionId);
    const rule = root.book.cabinetRules.find(
      ({ ruleId }) => ruleId === ANCHORED_RULE_ID,
    );
    expect(rule?.formula).toMatchObject({ anchorMinor: NEW_ANCHOR_MINOR });
  });

  it("stores the change summary as the draft held it, the label and note in their stored form, and the actor", async () => {
    const { cookie, accountId } = await administrator();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);
    await putChange(cookie, { kind: "depth-rule" }, 20);
    const held = (await prices.stores.priceBook.readDraft()).changes;

    const answer = await publish(cookie, {
      label: `  Pri${ZERO_WIDTH_SPACE}ces${RIGHT_TO_LEFT_OVERRIDE}  `,
      note: `e${COMBINING_ACUTE}`,
    });
    const { versionId } = (await jsonOf(answer)) as { versionId: string };

    const stored = await prices.stores.priceBook.readVersion(versionId);
    expect(stored.kind).toBe("found");
    if (stored.kind !== "found") return;
    expect(stored.version.changeSummary).toEqual(held);
    expect(stored.version.label).toBe("Prices");
    expect(stored.version.note).toBe("é");
    expect(publishedRows().at(-1)?.actorAccountId).toBe(accountId);
  });

  it("records one audit row with the sequence, the change count and the provisional flag, and no text", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);
    await putChange(cookie, { kind: "depth-rule" }, 20);
    const rowsBefore = publishedRows().length;

    await publish(cookie, {
      label: "ETIQUETTE-7731",
      note: "NOTE-9912",
    });

    const rows = publishedRows();
    expect(rows).toHaveLength(rowsBefore + 1);
    expect(rows.at(-1)?.detail).toEqual({
      sequenceNumber: 2,
      changeCount: 2,
      provisional: PUBLISHED_BOOK.amountsProvisional,
    });
    const everything = JSON.stringify(prices.ledger.heldEvents());
    expect(everything).not.toContain("ETIQUETTE-7731");
    expect(everything).not.toContain("NOTE-9912");
  });

  it("takes the provisional flag from the draft's own change, never from the request", async () => {
    const { cookie } = await administrator();
    await putChange(
      cookie,
      { kind: "provisional" },
      !PUBLISHED_BOOK.amountsProvisional,
    );

    const answer = await publish(cookie);

    expect(answer.status).toBe(200);
    expect(publishedRows().at(-1)?.detail).toMatchObject({
      provisional: !PUBLISHED_BOOK.amountsProvisional,
    });
    const root = await readActivePriceBook(prices.stores);
    expect(root.kind === "active" && root.book.amountsProvisional).toBe(
      !PUBLISHED_BOOK.amountsProvisional,
    );
  });

  it("is a first and a second publish in turn: the second names the sequence and revision the first left", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);
    await publish(cookie, { label: "First" });
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR + 10_000);

    const answer = await publish(cookie, { label: "Second" });

    expect(answer.status).toBe(200);
    expect(
      ((await jsonOf(answer)) as { sequenceNumber: number }).sequenceNumber,
    ).toBe(3);
  });

  it("leaves the availability head where a publish with no created rows moves it: once", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);
    const headBefore = (await prices.stores.availability.readCurrent())
      .revision;

    const answer = await publish(cookie);

    const { availabilityRevision } = (await jsonOf(answer)) as {
      availabilityRevision: string;
    };
    expect(availabilityRevision).not.toBe(headBefore);
    expect((await prices.stores.availability.readCurrent()).revision).toBe(
      availabilityRevision,
    );
  });
});

describe("the label and the note are the contact fields' text rule", () => {
  it("accepts a label of exactly 80 code points, counted as code points and not UTF-16 units", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);
    const label = ASTRAL_CHARACTER.repeat(80);

    const answer = await publish(cookie, { label });

    expect(answer.status).toBe(200);
    const { versionId } = (await jsonOf(answer)) as { versionId: string };
    const stored = await prices.stores.priceBook.readVersion(versionId);
    expect(stored.kind === "found" && stored.version.label).toBe(label);
  });

  it("refuses 81 code points, naming the member and a code and never the text", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);
    const before = await snapshot();
    const label = `LABEL-SECRET-${"a".repeat(80)}`;

    const answer = await publish(cookie, { label });

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "label", code: "TEXT_TOO_LONG" }],
    });
    expect(await answer.clone().text()).not.toContain("LABEL-SECRET");
    await expectNothingWritten(before);
  });

  it("composes a decomposed label to NFC before it counts it: 80 decomposed letters fit, 81 do not", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);
    const before = await snapshot();

    const refused = await publish(cookie, {
      label: `e${COMBINING_ACUTE}`.repeat(81),
    });
    expect(refused.status).toBe(400);
    await expectNothingWritten(before);

    const accepted = await publish(cookie, {
      label: `e${COMBINING_ACUTE}`.repeat(80),
    });
    expect(accepted.status).toBe(200);
    const { versionId } = (await jsonOf(accepted)) as { versionId: string };
    const stored = await prices.stores.priceBook.readVersion(versionId);
    expect(stored.kind === "found" && stored.version.label).toBe(
      "é".repeat(80),
    );
  });

  it.each([
    ["absent", undefined],
    ["empty", ""],
    ["spaces", "   "],
    ["format characters only", `${ZERO_WIDTH_SPACE}${RIGHT_TO_LEFT_OVERRIDE}`],
  ])("requires a label: %s is TEXT_EMPTY", async (_title, label) => {
    const { cookie } = await administrator();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);
    const before = await snapshot();
    const body = await publishBody();
    const { label: _kept, ...withoutLabel } = body;
    void _kept;

    const answer = await publishDraft({
      cookie,
      json: label === undefined ? withoutLabel : { ...body, label },
    });

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "label", code: "TEXT_EMPTY" }],
    });
    await expectNothingWritten(before);
  });

  it.each([
    ["a line feed", "Prices\nnew"],
    ["a NUL", "Prices\u0000"],
    ["a line separator", `Prices${LINE_SEPARATOR}new`],
    ["a lone surrogate", `Prices${LONE_HIGH_SURROGATE}`],
  ])("refuses a label with %s", async (_title, label) => {
    const { cookie } = await administrator();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);
    const before = await snapshot();

    const answer = await publish(cookie, { label });

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "label", code: "TEXT_FORBIDDEN_CHARACTER" }],
    });
    await expectNothingWritten(before);
  });

  it("accepts an empty note and an absent one, and bounds a note at 240 code points", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);
    const body = await publishBody();
    const { note: _kept, ...withoutNote } = body;
    void _kept;

    const tooLong = await publish(cookie, { note: "a".repeat(241) });
    expect(tooLong.status).toBe(400);
    expect(await jsonOf(tooLong)).toEqual({
      status: "invalid-input",
      issues: [{ field: "note", code: "TEXT_TOO_LONG" }],
    });

    const absent = await publishDraft({ cookie, json: withoutNote });
    expect(absent.status).toBe(200);
  });

  it("names a refused label and a refused note together", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);

    const answer = await publish(cookie, { label: "", note: "a\nb" });

    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [
        { field: "label", code: "TEXT_EMPTY" },
        { field: "note", code: "TEXT_FORBIDDEN_CHARACTER" },
      ],
    });
  });
});

describe("a request carrying more than the page may send is refused whole (F10, m4)", () => {
  it.each([
    ["a book", { book: PUBLISHED_BOOK }],
    ["the provisional flag", { provisional: false }],
    ["a version id", { versionId: "x" }],
    ["a role", { role: "administrator" }],
  ])("refuses %s with 400, and writes nothing", async (_title, extra) => {
    const { cookie } = await administrator();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);
    const before = await snapshot();

    const answer = await publish(cookie, extra);

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({ status: "invalid-request" });
    await expectNothingWritten(before);
  });

  it.each([
    ["a sequence sent as text", { expectedActiveSequence: "1" }],
    ["a fractional sequence", { expectedActiveSequence: 1.5 }],
    ["a negative sequence", { expectedActiveSequence: -1 }],
    ["a draft revision with a leading zero", { expectedDraftRevision: "01" }],
    ["a draft revision sent as a number", { expectedDraftRevision: 1 }],
    [
      "a draft revision past a bigint",
      { expectedDraftRevision: "9223372036854775808" },
    ],
    [
      "an availability revision with a sign",
      { expectedAvailabilityRevision: "-1" },
    ],
    ["a label that is a number", { label: 12 }],
    ["a note that is a list", { note: ["x"] }],
  ])("refuses %s with 400, and writes nothing", async (_title, overrides) => {
    const { cookie } = await administrator();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);
    const before = await snapshot();

    const answer = await publish(cookie, overrides);

    expect(answer.status).toBe(400);
    await expectNothingWritten(before);
  });

  it.each([
    ["text that is not JSON", "{nope"],
    ["an array", "[]"],
    ["an empty object", "{}"],
  ])("refuses %s with 400", async (_title, text) => {
    const { cookie } = await administrator();

    const answer = await publishDraft({ cookie, json: text });

    expect(answer.status).toBe(400);
    expect(await versionCount()).toBe(1);
  });
});

describe("a publish is a state of the data: 409, and nothing written", () => {
  it("is changed-meanwhile when the draft moved since the page read it", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);
    const seen = await publishBody();
    await putChange(cookie, { kind: "depth-rule" }, 20);
    const before = await snapshot();

    const answer = await publishDraft({ cookie, json: seen });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "changed-meanwhile" });
    await expectNothingWritten(before);
  });

  it("is changed-meanwhile for a stale active sequence, ahead of it or behind it", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);
    const before = await snapshot();

    for (const expectedActiveSequence of [0, 2, 99]) {
      const answer = await publish(cookie, { expectedActiveSequence });
      expect(answer.status).toBe(409);
      expect(await jsonOf(answer)).toEqual({ status: "changed-meanwhile" });
    }
    await expectNothingWritten(before);
  });

  it("is availability-changed-meanwhile for a stale availability head", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);
    const before = await snapshot();

    const answer = await publish(cookie, {
      expectedAvailabilityRevision: "41",
    });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({
      status: "availability-changed-meanwhile",
    });
    await expectNothingWritten(before);
  });

  it("is nothing-to-publish for an empty draft", async () => {
    const { cookie } = await administrator();
    const before = await snapshot();

    const answer = await publish(cookie);

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "nothing-to-publish" });
    await expectNothingWritten(before);
  });

  it("is no-active-version before the first publish, which the owner-run seed makes", async () => {
    prices = await freshPriceDashboardWorld({
      isPublished: false,
      book: PUBLISHED_BOOK,
    });
    const { cookie } = await administrator();

    const answer = await publishDraft({
      cookie,
      json: {
        expectedDraftRevision: "0",
        expectedActiveSequence: 0,
        expectedAvailabilityRevision: "0",
        label: "First",
        note: "",
      },
    });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "no-active-version" });
    expect(await versionCount()).toBe(0);
  });

  it("is draft-unreadable over a stored draft that is not what a draft holds, and names no stored value", async () => {
    const { cookie } = await administrator();
    vi.spyOn(prices.stores.priceBook, "readDraft").mockResolvedValue({
      draftRevision: "3",
      changes: [{ address: { kind: "cabinet" }, value: "STORED-JUNK-5521" }],
    });
    const publishSpy = vi.spyOn(prices.stores.priceBook, "publish");

    const answer = await publishDraft({
      cookie,
      json: await publishBody({ expectedDraftRevision: "3" }),
    });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({
      status: "draft-unreadable",
      draftRevision: "3",
    });
    expect(publishSpy).not.toHaveBeenCalled();
    expect(console_.everything()).not.toContain("STORED-JUNK-5521");
  });

  it("lets exactly one of two publishes made at once through, and stores one version", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);
    const seen = await publishBody();

    const answers = await Promise.all([
      publishDraft({ cookie, json: seen }),
      publishDraft({ cookie, json: seen }),
    ]);

    expect(answers.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(await versionCount()).toBe(2);
    expect(publishedRows()).toHaveLength(2);
  });

  it("refuses a repeat of a publish that already went through", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);
    const seen = await publishBody();
    await publishDraft({ cookie, json: seen });
    const before = await snapshot();

    const answer = await publishDraft({ cookie, json: seen });

    expect(answer.status).toBe(409);
    await expectNothingWritten(before);
  });
});

describe("the whole candidate is judged before anything is stored (A-7, M2's judgement)", () => {
  // `applyChanges` accepts it: the step is a bounded whole amount. The catalogue's grid does not: at the narrowest
  // buildable width the row prices below zero, which the D3C frame words as "0 sau negativ".
  const STEEP_NARROWING = {
    kind: "cabinet",
    ruleId: ANCHORED_RULE_ID,
    field: "perStepNarrowerMinor",
  } as const;

  it("refuses a candidate that parses and prices at or below zero over its grid, 409 candidate-refused, and stores nothing", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, STEEP_NARROWING, 90_000);
    const before = await snapshot();

    const answer = await publish(cookie);

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "candidate-refused" });
    await expectNothingWritten(before);
  });

  it("is the judgement's PRICE_NOT_POSITIVE that refuses it, naming the row and the field that drives the price: D3C's error, which the 409 does not carry", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, STEEP_NARROWING, 90_000);
    const stored = (await prices.stores.priceBook.readDraft())
      .changes as readonly DraftChange[];
    const root = await readActivePriceBook(prices.stores);
    if (root.kind !== "active") throw new Error("no active book");

    const applied = applyChanges(root.book, stored);

    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const judged = judgeBookAgainstCatalog(
      applied.book,
      buildKitchenLBodyCatalog(DEFAULT_CABINET_DEPTH_MM),
    );
    expect(judged.ok).toBe(false);
    expect(judged.ok ? [] : judged.refusals).toContainEqual(
      expect.objectContaining({
        code: "PRICE_NOT_POSITIVE",
        ruleId: ANCHORED_RULE_ID,
        field: "perStepNarrowerMinor",
      }),
    );
  });

  it("keeps the draft, so the person corrects the change and publishes again", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, STEEP_NARROWING, 90_000);
    await publish(cookie);
    await putChange(cookie, STEEP_NARROWING, 1_000);

    const answer = await publish(cookie);

    expect(answer.status).toBe(200);
  });

  it("refuses a stored draft that no longer applies to the active book, and stores nothing", async () => {
    const { cookie } = await administrator();
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
    const before = await snapshot();

    const answer = await publish(cookie);

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "candidate-refused" });
    await expectNothingWritten(before);
  });
});

describe("a publish and its audit row are one thing", () => {
  it("answers 503 with no detail when the audit row cannot be staged, and nothing is visible", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);
    const before = await snapshot();
    vi.spyOn(prices.ledger, "stage").mockRejectedValue(
      new Error(DRIVER_FAILURE_MARKER),
    );

    const answer = await publish(cookie, { label: "ETIQUETTE-7731" });

    expect(answer.status).toBe(503);
    expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
    expect(console_.everything()).not.toContain("ETIQUETTE-7731");
    vi.restoreAllMocks();
    await expectNothingWritten(before);
  });

  it("answers 503 when the store fails, with no second attempt and no cause in the log", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);
    const store = vi
      .spyOn(prices.stores.priceBook, "publish")
      .mockRejectedValue(new Error(DRIVER_FAILURE_MARKER));

    const answer = await publish(cookie);

    expect(answer.status).toBe(503);
    expect(store).toHaveBeenCalledTimes(1);
    expect(console_.everything()).not.toContain(DRIVER_FAILURE_MARKER);
  });

  it("answers 401 when the session ended between the route's read and the store's write, and writes nothing", async () => {
    const { cookie, accountId } = await administrator();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);
    const before = await snapshot();
    const realStage = prices.ledger.stage.bind(prices.ledger);
    vi.spyOn(prices.ledger, "stage").mockImplementation(async (request) => {
      await world.sessions.revokeAllForAccount(accountId);
      return realStage(request);
    });

    const answer = await publish(cookie);

    expect(answer.status).toBe(401);
    vi.restoreAllMocks();
    await expectNothingWritten(before);
  });
});

describe("the guards and the account's bucket", () => {
  it("refuses a cross-site request before the session is read", async () => {
    const answer = await publishDraft({
      secFetchSite: "cross-site",
      json: await publishBody(),
    });

    expect(answer.status).toBe(403);
    expect(await jsonOf(answer)).toEqual({ status: "cross-site" });
    expect(priceStoreAsks.count).toBe(0);
  });

  it("refuses a body that is not JSON with 415, and one past its bound with 413", async () => {
    const { cookie } = await administrator();

    const notJson = await publishDraft({
      cookie,
      contentType: "text/plain",
      json: "{}",
    });
    const tooLarge = await publishDraft({
      cookie,
      json: JSON.stringify({ label: "x".repeat(20_000) }),
    });

    expect(notJson.status).toBe(415);
    expect(tooLarge.status).toBe(413);
    expect(await versionCount()).toBe(1);
  });

  it("counts a publish in the draft bucket and refuses with 429 above it, without asking a store", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);
    limiterLedger.counted.length = 0;
    const body = await publishBody();
    limiterLedger.refusing.set(STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY.name, 5);
    priceStoreAsks.count = 0;

    const answer = await publishDraft({ cookie, json: body });

    expect(answer.status).toBe(429);
    expect(await jsonOf(answer)).toEqual({ status: "rate-limited" });
    expect(priceStoreAsks.count).toBe(0);
    expect(await versionCount()).toBe(1);
  });

  it("fails closed: a bucket that cannot be counted publishes nothing", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);
    limiterLedger.unavailable.add(STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY.name);

    const answer = await publish(cookie);

    expect(answer.status).toBe(503);
    expect(await versionCount()).toBe(1);
  });
});
