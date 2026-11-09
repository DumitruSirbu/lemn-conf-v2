import {
  SAMPLE_PRICE_BOOK,
  type ItemRef,
  type LinkedAccessoryRule,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  readSource,
  sourceFilesMatching,
} from "../../../lib/server/server-source-support";
import {
  administrator,
  allRows,
  writeWithoutJudgement,
  type Administrator,
} from "../../../support/availability-route-world";
import {
  freshAccountWorld,
  limiterLedger,
} from "../../../support/account-world";
import {
  freshPriceDashboardWorld,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import {
  NOTICE_DESIGN_ID,
  OWNER_WRITE_COOKIE,
  OWNER_WRITE_TOKEN_HASH,
  freshEditableDesigns,
  makePriceStoresReject,
  type StubEditableDesigns,
} from "../../../support/price-notice-stubs";
import { acknowledge, readNotice } from "../../../support/price-notice-world";

/**
 * The seen side of the price notice. `price-notice.ts` reads the pair the customer last saw, which is
 * an archived version once a newer one is published, and ADR 0178 (F10, A-15) says an archive is never SERVED on a route
 * that is not staff's. These tests hold what that read may and may not reach:
 *
 * - nothing of the seen version but the `authoredName` of a linked accessory and a boolean reaches either route's answer or
 *   the log (a canary in every text field, in the label, the note and the change summary, and a distinctive amount);
 * - the draft is never read or written, and nothing is published;
 * - exactly these store methods are asked, and the only version the GET reads is the one the marker names;
 * - the source census that keeps the allowance the R3 pin makes for the two modules from widening.
 */

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/price-stores", () =>
  import("../../../support/price-notice-stubs").then((world) =>
    world.rejectablePriceStoresModule(),
  ),
);
vi.mock("@/lib/server/repository", () =>
  import("../../../support/price-notice-stubs").then((world) =>
    world.editableRepositoryModule(),
  ),
);

const REMOVED_ACCESSORY_ID = "accessory.shelf-removed";
const KEPT_ACCESSORY_ID = "accessory.shelf-kept";
const REMOVED_NAME = "CNRY-removed-name";
const KEPT_NAME = "CNRY-kept-name";
const VERSION_LABEL = "CNRY-label-of-the-seen-version";
const VERSION_NOTE = "CNRY-note-of-the-seen-version";
const SUMMARY_TEXT = "CNRY-summary-of-the-seen-version";
const SEEN_AMOUNT_MINOR = 777_771;
const NUMERIC_CANARY = String(SEEN_AMOUNT_MINOR);

const removedItem: ItemRef = {
  kind: "accessory",
  accessoryId: REMOVED_ACCESSORY_ID,
};

let priceWorld: PriceDashboardWorld;
let editable: StubEditableDesigns;
let staff: Administrator;
const textCanaries: string[] = [];

/** Every `name` and `description` the book states, replaced by a string that cannot be mistaken for anything else. */
function withCanaryText(value: unknown, path = "book"): unknown {
  if (Array.isArray(value)) {
    return value.map((entry, index) =>
      withCanaryText(entry, `${path}.${String(index)}`),
    );
  }
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, member]) => {
      if (
        (key === "name" || key === "description") &&
        typeof member === "string"
      ) {
        const canary = `CNRY-${path}.${key}`;
        textCanaries.push(canary);
        return [key, canary];
      }
      return [key, withCanaryText(member, `${path}.${key}`)];
    }),
  );
}

function linked(accessoryId: string, name: string): LinkedAccessoryRule {
  return {
    accessoryId,
    ruleId: `rule.${accessoryId}`,
    linkedBuildId: "base-3drawer",
    perUnitMinor: SEEN_AMOUNT_MINOR,
    name,
    description: `CNRY-description-of-${accessoryId}`,
  };
}

/** The seen version's book: canary text in every field, two linked accessories, a distinctive amount. */
function seenBook(): PriceBook {
  const texted = withCanaryText(SAMPLE_PRICE_BOOK) as PriceBook;
  return {
    ...texted,
    linkedAccessories: [
      linked(REMOVED_ACCESSORY_ID, REMOVED_NAME),
      linked(KEPT_ACCESSORY_ID, KEPT_NAME),
    ],
  };
}

/** The newest book: the sample's, with the accessory the customer had gone from it (deleted) or stated under a new name. */
function newestBook(stated: "without-removed" | "removed-renamed"): PriceBook {
  return {
    ...SAMPLE_PRICE_BOOK,
    linkedAccessories:
      stated === "without-removed"
        ? [{ ...linked(KEPT_ACCESSORY_ID, "Raft pastrat"), perUnitMinor: 1 }]
        : [
            { ...linked(REMOVED_ACCESSORY_ID, "Nume nou"), perUnitMinor: 1 },
            { ...linked(KEPT_ACCESSORY_ID, "Raft pastrat"), perUnitMinor: 1 },
          ],
  };
}

async function publishWithText(book: PriceBook, withCanaries: boolean) {
  const { priceBook, stores } = priceWorld;
  const active = await priceBook.readActive();
  if (active.kind !== "found") throw new Error("nothing to publish after");
  const published = await priceBook.publish({
    expectedDraftRevision: (await priceBook.readDraft()).draftRevision,
    expectedActiveSequence: active.version.sequenceNumber,
    expectedAvailabilityRevision: (await stores.availability.readCurrent())
      .revision,
    createdItems: [],
    deletedItems: [],
    label: withCanaries ? VERSION_LABEL : "Next",
    note: withCanaries ? VERSION_NOTE : "",
    book,
    changeSummary: withCanaries ? [{ text: SUMMARY_TEXT }] : [],
    audit: {
      session: {
        sessionTokenHash: staff.tokenHash,
        idleLifetimeSeconds: { client: 60, operator: 60, administrator: 60 },
      },
      entry: {
        action: "price-published",
        detail: { provisional: book.amountsProvisional },
      },
    },
  });
  if (published.kind !== "ok") {
    throw new Error(`publish refused: ${published.kind}`);
  }
  return published.versionId;
}

async function headNow(): Promise<string> {
  return (await priceWorld.stores.availability.readCurrent()).revision;
}

interface Corpus {
  readonly seenVersionId: string;
  readonly newestVersionId: string;
}

/**
 * v2 (canary text) is published, the kitchen is opened (the marker is v2), then the newest version is published and the
 * linked accessory the kitchen earned is switched off.
 */
async function setUpSeenArchive(
  stated: "without-removed" | "removed-renamed",
): Promise<Corpus> {
  const seenVersionId = await publishWithText(seenBook(), true);
  const opened = await readNotice({ cookie: OWNER_WRITE_COOKIE });
  expect(opened.status).toBe(200);
  expect(
    await priceWorld.stores.notices.readAcknowledged(NOTICE_DESIGN_ID),
  ).toEqual({
    kind: "recorded",
    acknowledged: {
      versionId: seenVersionId,
      availabilityRevision: await headNow(),
    },
  });
  const newestVersionId = await publishWithText(newestBook(stated), false);
  await writeWithoutJudgement(staff, removedItem, false);
  return { seenVersionId, newestVersionId };
}

async function startWorld(): Promise<void> {
  textCanaries.length = 0;
  freshAccountWorld();
  limiterLedger.subjects.push({
    kind: "write-credential",
    subject: OWNER_WRITE_TOKEN_HASH,
  });
  priceWorld = await freshPriceDashboardWorld({ book: SAMPLE_PRICE_BOOK });
  editable = freshEditableDesigns();
  makePriceStoresReject(undefined);
  staff = await administrator();
}

beforeEach(async () => {
  await startWorld();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function logText(): string {
  return JSON.stringify(vi.mocked(console.error).mock.calls);
}

// ---------------------------------------------------------------------------------------------------------------------
// (a) what of the seen version reaches a customer

describe("no text of the seen version reaches a customer", () => {
  it("answers the GET of a deleted accessory with no canary but that accessory's own name, no seen id and no seen amount", async () => {
    const { seenVersionId, newestVersionId } =
      await setUpSeenArchive("without-removed");
    expect(textCanaries.length).toBeGreaterThan(5);

    const answer = await readNotice({ cookie: OWNER_WRITE_COOKIE });
    const text = await answer.clone().text();

    expect(answer.status).toBe(200);
    for (const forbidden of [
      ...textCanaries,
      KEPT_NAME,
      VERSION_LABEL,
      VERSION_NOTE,
      SUMMARY_TEXT,
      NUMERIC_CANARY,
      seenVersionId,
      "CNRY",
    ]) {
      expect(text, forbidden).not.toContain(forbidden);
    }
    expect(text).toContain(newestVersionId);
    expect(logText()).not.toContain("CNRY");
    expect(logText()).not.toContain(seenVersionId);
    // Proof the canary book was read, not skipped: an unreadable seen side writes a line.
    expect(logText()).not.toContain("seen-side-unreadable");
    expect(logText()).not.toContain("book-unparseable");
  });

  it("names a removed linked accessory from the active book, never the seen one's text, and holds no canary", async () => {
    const { seenVersionId } = await setUpSeenArchive("removed-renamed");

    const text = await (
      await readNotice({ cookie: OWNER_WRITE_COOKIE })
    ).text();

    expect(
      (JSON.parse(text) as { removedAccessories: unknown }).removedAccessories,
    ).toEqual([
      { accessoryId: REMOVED_ACCESSORY_ID, authoredName: "Nume nou" },
    ]);
    expect(text).not.toContain("CNRY");
    expect(text).not.toContain(REMOVED_NAME);
    expect(text).not.toContain(seenVersionId);
  });

  it("leaves the seen id and every canary out of the acknowledgement's refusals and the log", async () => {
    const { seenVersionId } = await setUpSeenArchive("without-removed");
    const head = await headNow();
    const corpus: string[] = [];
    for (const json of [
      {
        versionId: seenVersionId,
        availabilityRevision: String(Number(head) + 1),
      },
      { versionId: "A".repeat(21), availabilityRevision: head },
      { versionId: "A".repeat(20), availabilityRevision: head },
      [],
      { versionId: seenVersionId },
    ]) {
      const answer = await acknowledge({ cookie: OWNER_WRITE_COOKIE, json });
      corpus.push(await answer.text());
    }

    const text = corpus.join("\n");

    expect(text).not.toContain("CNRY");
    expect(text).not.toContain(seenVersionId);
    expect(logText()).not.toContain("CNRY");
  });

  it("keeps every canary out of the 503s and the 404 a failure or a stranger gets", async () => {
    await setUpSeenArchive("without-removed");
    const corpus: string[] = [];
    corpus.push(await (await readNotice({})).text());
    makePriceStoresReject(new Error("CNRY-driver"));
    corpus.push(
      await (await readNotice({ cookie: OWNER_WRITE_COOKIE })).text(),
    );
    makePriceStoresReject(undefined);
    editable.rejection = new Error("CNRY-load");
    corpus.push(
      await (await readNotice({ cookie: OWNER_WRITE_COOKIE })).text(),
    );

    const text = corpus.join("\n");

    expect(text).not.toContain("CNRY");
    expect(logText()).not.toContain("CNRY");
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// (b) and (c) what is read and what is asked

type Method = (...args: never[]) => unknown;

function methodNamesOf(store: object): string[] {
  const names = new Set<string>();
  for (
    let level: object | null = store;
    level !== null && level !== Object.prototype;
    level = Object.getPrototypeOf(level) as object | null
  ) {
    for (const name of Object.getOwnPropertyNames(level)) {
      const member = (store as Record<string, unknown>)[name];
      if (name !== "constructor" && typeof member === "function") {
        names.add(name);
      }
    }
  }
  return [...names];
}

/** Every method of every store the routes are handed, recorded as `store.method`. The fakes' own helpers are left out. */
interface Watched {
  readonly asked: string[];
  readonly argumentsOf: Map<string, unknown[][]>;
}

function watchEveryStoreMethod(): Watched {
  const asked: string[] = [];
  const argumentsOf = new Map<string, unknown[][]>();
  const stores: Record<string, object> = {
    priceBook: priceWorld.stores.priceBook,
    availability: priceWorld.stores.availability,
    defaults: priceWorld.stores.defaults,
    notices: priceWorld.stores.notices,
  };
  const seen = new Set<object>();
  for (const [label, store] of Object.entries(stores)) {
    if (seen.has(store)) continue;
    seen.add(store);
    for (const name of methodNamesOf(store)) {
      const original = Reflect.get(store, name) as Method;
      vi.spyOn(store as Record<string, Method>, name).mockImplementation(
        function (this: unknown, ...args: never[]) {
          asked.push(`${label}.${name}`);
          argumentsOf.set(`${label}.${name}`, [
            ...(argumentsOf.get(`${label}.${name}`) ?? []),
            args,
          ]);
          return original.apply(this, args);
        },
      );
    }
  }
  return { asked, argumentsOf };
}

/** What a fake calls on itself while it answers: not a port method, and not asked by a route. */
const FAKE_INTERNALS = new Set(["availability.heldDisabled"]);

function portMethodsAsked(asked: readonly string[]): Set<string> {
  return new Set(asked.filter((entry) => !FAKE_INTERNALS.has(entry)));
}

const NEVER_ASKED = [
  "readDraft",
  "writeDraft",
  "listVersions",
  "publish",
  "setActive",
  "save",
  "read",
];

describe("what the two routes ask of the stores", () => {
  it("reads the version the marker names, once, and the head, and never a draft, a listing, a publish or a write", async () => {
    const { seenVersionId } = await setUpSeenArchive("without-removed");
    const { asked, argumentsOf } = watchEveryStoreMethod();

    const answer = await readNotice({ cookie: OWNER_WRITE_COOKIE });

    expect(answer.status).toBe(200);
    expect(portMethodsAsked(asked)).toEqual(
      new Set([
        "priceBook.readActive",
        "priceBook.readVersion",
        "availability.readCurrent",
        "availability.readAt",
        "notices.readAcknowledged",
      ]),
    );
    expect(argumentsOf.get("priceBook.readVersion")).toEqual([[seenVersionId]]);
    for (const name of NEVER_ASKED) {
      expect(asked.filter((entry) => entry.endsWith(`.${name}`))).toEqual([]);
    }
  });

  it("asks only the first-open insert and the head of a kitchen that has no marker", async () => {
    await publishWithText(seenBook(), true);
    const { asked } = watchEveryStoreMethod();

    await readNotice({ cookie: OWNER_WRITE_COOKIE });

    expect(portMethodsAsked(asked)).toEqual(
      new Set([
        "priceBook.readActive",
        "availability.readCurrent",
        "notices.readAcknowledged",
        "notices.recordIfAbsent",
      ]),
    );
  });

  it("asks the acknowledgement's route for recordAcknowledged alone", async () => {
    const { asked } = watchEveryStoreMethod();
    const head = await headNow();
    const active = await priceWorld.stores.priceBook.readActive();
    if (active.kind !== "found") throw new Error("no active version");
    asked.length = 0;

    const answer = await acknowledge({
      cookie: OWNER_WRITE_COOKIE,
      json: {
        versionId: active.version.versionId,
        availabilityRevision: head,
      },
    });

    expect(answer.status).toBe(200);
    expect(asked).toEqual(["notices.recordAcknowledged"]);
  });

  it("writes no audit row and moves no availability head, whatever either route does", async () => {
    await setUpSeenArchive("without-removed");
    const rows = allRows().length;
    const head = await headNow();

    await readNotice({ cookie: OWNER_WRITE_COOKIE });
    await acknowledge({
      cookie: OWNER_WRITE_COOKIE,
      json: { versionId: "A".repeat(21), availabilityRevision: head },
    });

    expect(allRows()).toHaveLength(rows);
    expect(await headNow()).toBe(head);
  });

  it("leaves the draft exactly as it was across a GET and a POST", async () => {
    await setUpSeenArchive("without-removed");
    const draftBefore = JSON.stringify(await priceWorld.priceBook.readDraft());

    await readNotice({ cookie: OWNER_WRITE_COOKIE });
    await acknowledge({
      cookie: OWNER_WRITE_COOKIE,
      json: { versionId: "A".repeat(21), availabilityRevision: "0" },
    });

    expect(JSON.stringify(await priceWorld.priceBook.readDraft())).toBe(
      draftBefore,
    );
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The source census: who may read a version, and who calls the notice store

describe("the allowance the R3 pin makes for the notice modules cannot widen unseen", () => {
  const READS_DRAFT_OR_ARCHIVE_BUT_THE_VERSION =
    /\.(?:listVersions|readDraft|writeDraft)\b|\bversion-wire\b|\breadVersionBook\b|\bpriceBook\.publish\b/;
  const READS_A_VERSION = /\.readVersion\b/;

  it("lets price-notice.ts read a version and nothing else of the draft or the archive", () => {
    const hits = sourceFilesMatching(READS_DRAFT_OR_ARCHIVE_BUT_THE_VERSION);

    expect(hits).not.toContain("lib/server/price-notice.ts");
    expect(hits).not.toContain("lib/server/price-notice-request.ts");
    expect(hits).not.toContain("app/api/designs/[id]/price-notice/route.ts");
    expect(hits).not.toContain(
      "app/api/designs/[id]/price-notice/acknowledge/route.ts",
    );
  });

  it("lets only price-notice.ts of the notice modules read a version", () => {
    const readers = sourceFilesMatching(READS_A_VERSION).filter((path) =>
      path.includes("price-notice"),
    );

    expect(readers).toEqual(["lib/server/price-notice.ts"]);
  });

  it("lets price-notice-request.ts import exactly three modules of the dashboard's directory, all request parsers and answers", () => {
    const specifiers = [
      ...readSource("lib/server/price-notice-request.ts").matchAll(
        /"@\/lib\/server\/price-dashboard\/([a-z-]+)"/g,
      ),
    ].map(([, module]) => module);

    expect([...new Set(specifiers)].sort()).toEqual([
      "dashboard-responses",
      "draft-requests",
      "revision-shape",
    ]);
  });

  it("lets no other notice module import anything of the dashboard's directory", () => {
    const importers = sourceFilesMatching(
      /@\/lib\/server\/price-dashboard\//,
    ).filter((path) => path.includes("price-notice"));

    expect(importers).toEqual(["lib/server/price-notice-request.ts"]);
  });

  it("is called through the notice store by price-notice.ts alone, which only the two routes import", () => {
    const callers = sourceFilesMatching(
      /\.(?:recordAcknowledged|recordIfAbsent|readAcknowledged)\b/,
    );
    const importers = sourceFilesMatching(
      /["'][^"']*\/price-notice(?:-request)?["']/,
    ).sort();

    expect(callers).toEqual(["lib/server/price-notice.ts"]);
    expect(importers).toEqual([
      "app/api/designs/[id]/price-notice/acknowledge/route.ts",
      "app/api/designs/[id]/price-notice/route.ts",
      "lib/server/price-notice-request.ts",
    ]);
  });
});
