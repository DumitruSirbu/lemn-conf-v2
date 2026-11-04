import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SAMPLE_PRICE_BOOK } from "@lemnaria/configurator-domain";
import { PRICE_VERSION_PAGE_SIZE } from "@lemnaria/persistence";

import * as publishRoute from "@/app/api/staff/prices/publish/route";
import * as restoreRoute from "@/app/api/staff/prices/versions/[id]/restore/route";
import * as versionRoute from "@/app/api/staff/prices/versions/[id]/route";
import * as versionsRoute from "@/app/api/staff/prices/versions/route";
import { readActivePriceBook } from "@/lib/server/active-price-book";
import { IDLE_LIFETIME_SECONDS_BY_ROLE } from "@/lib/server/account/session-lifetimes";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  captureConsole,
  freshAccountWorld,
  jsonOf,
  limiterLedger,
} from "../../../support/account-world";
import {
  currentDraftRevision,
  publishBody,
  publishDraft,
  readVersion,
  readVersions,
  restoreVersion,
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
 * The history's paging, a stored version that is not what the store declares, the routes' methods and headers on every
 * status, and that a draft or an archive reaches no customer.
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

async function administrator() {
  const { session, account } = await signedInAs({ role: "administrator" });
  return {
    cookie: session.cookie,
    tokenHash: session.tokenHash,
    accountId: account.id,
  };
}

interface Page {
  total: number;
  page: number;
  pageSize: number;
  versions: { sequenceNumber: number; versionId: string; state: string }[];
}

describe("the history's page", () => {
  it("is the first when the query names none, whatever else it names", async () => {
    const { cookie } = await administrator();
    await publishAnchor(cookie, 510_000, "Second");

    const answer = await readVersions({
      cookie,
      search: "?pageSize=1&limit=1&offset=5&PAGE=2&Page=2&p=2",
    });

    const body = (await jsonOf(answer)) as Page;
    expect(answer.status).toBe(200);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(PRICE_VERSION_PAGE_SIZE);
    expect(body.versions.map(({ sequenceNumber }) => sequenceNumber)).toEqual([
      2, 1,
    ]);
  });

  it("accepts page 10000 as an empty list and refuses 10001, at the bound and one past it", async () => {
    const { cookie } = await administrator();

    const atBound = await readVersions({ cookie, search: "?page=10000" });
    const pastBound = await readVersions({ cookie, search: "?page=10001" });

    expect(atBound.status).toBe(200);
    expect(((await jsonOf(atBound)) as Page).versions).toEqual([]);
    expect(pastBound.status).toBe(400);
  });

  it("is a page the store lists or a closed 400, for any text, and a refused page reaches no store and writes no row", async () => {
    const { cookie } = await administrator();
    const textArbitrary = fc.oneof(
      fc.string({ unit: "binary", maxLength: 12 }),
      fc.integer({ min: 0, max: 20_000 }).map(String),
      fc.stringMatching(/^[0-9]{1,24}$/u),
      fc.constantFrom("1 ", " 1", "+1", "1e2", "0x10", "١٢", "１", "01", "1.0"),
    );
    let accepted = 0;
    await fc.assert(
      fc.asyncProperty(textArbitrary, async (text) => {
        priceStoreAsks.count = 0;
        const rowsBefore = staffWorld.audit.heldEvents().length;

        const answer = await readVersions({
          cookie,
          search: `?page=${encodeURIComponent(text)}`,
        });

        const isShape = /^[1-9][0-9]*$/.test(text);
        const isExpected = isShape && Number(text) <= 10_000;
        expect(answer.status).toBe(isExpected ? 200 : 400);
        if (isExpected) {
          accepted += 1;
          expect(((await jsonOf(answer)) as Page).page).toBe(Number(text));
        } else {
          expect(priceStoreAsks.count).toBe(0);
          expect(staffWorld.audit.heldEvents().length).toBe(rowsBefore);
        }
      }),
      { numRuns: 120 },
    );
    expect(accepted).toBeGreaterThan(5);
  });

  it("lists every version once, newest first, across pages, with one active at the head", async () => {
    const { cookie } = await administrator();
    const published = PRICE_VERSION_PAGE_SIZE + 3;
    for (let index = 1; index < published; index += 1) {
      await publishAnchor(
        cookie,
        500_000 + index * 10,
        `Anchor ${String(index)}`,
      );
    }

    const first = (await jsonOf(await readVersions({ cookie }))) as Page & {
      versions: { state: string }[];
    };
    const second = (await jsonOf(
      await readVersions({ cookie, search: "?page=2" }),
    )) as Page & { versions: { state: string }[] };
    const third = (await jsonOf(
      await readVersions({ cookie, search: "?page=3" }),
    )) as Page;

    const sequences = [...first.versions, ...second.versions].map(
      ({ sequenceNumber }) => sequenceNumber,
    );
    expect(first.total).toBe(published);
    expect(sequences).toEqual(
      Array.from({ length: published }, (_, index) => published - index),
    );
    expect(third.versions).toEqual([]);
    expect(first.versions.map(({ state }) => state)[0]).toBe("active");
    expect(
      [...first.versions, ...second.versions].filter(
        ({ state }) => state === "active",
      ),
    ).toHaveLength(1);
  });
});

describe("a stored version that is not what the store declares", () => {
  async function storeVersion(
    tokenHash: string,
    stored: { book: unknown; changeSummary: unknown; label?: string },
  ): Promise<void> {
    const active = await prices.stores.priceBook.readActive();
    if (active.kind !== "found") throw new Error("no active version");
    const published = await prices.priceBook.publish({
      expectedDraftRevision: await currentDraftRevision(),
      expectedActiveSequence: active.version.sequenceNumber,
      expectedAvailabilityRevision: (
        await prices.stores.availability.readCurrent()
      ).revision,
      createdItems: [],
      label: stored.label ?? "Hand-stored",
      note: "",
      book: stored.book as never,
      changeSummary: stored.changeSummary as never,
      audit: {
        session: {
          sessionTokenHash: tokenHash,
          idleLifetimeSeconds: IDLE_LIFETIME_SECONDS_BY_ROLE,
        },
        entry: { action: "price-published", detail: { provisional: false } },
      },
    });
    if (published.kind !== "ok")
      throw new Error("the hand-stored publish failed");
  }

  async function newestVersionId(): Promise<string> {
    const active = await prices.stores.priceBook.readActive();
    if (active.kind !== "found") throw new Error("no active version");
    return active.version.versionId;
  }

  const BOOK_WITH_EXTRA_MEMBERS = {
    ...SAMPLE_PRICE_BOOK,
    secretMargin: "EXTRA-BOOK-MARKER-31",
    cabinetRules: SAMPLE_PRICE_BOOK.cabinetRules.map((rule) => ({
      ...rule,
      internalNote: "EXTRA-RULE-MARKER-32",
    })),
  };
  const SUMMARY_WITH_EXTRA_MEMBER = [
    {
      address: ANCHOR_ADDRESS,
      value: 500_000,
      authorEmail: "EXTRA-CHANGE-MARKER-33",
    },
  ];

  it("serves a book with members the store never declared projected onto the declared ones, and says nothing of the extras", async () => {
    const { cookie, tokenHash } = await administrator();
    await storeVersion(tokenHash, {
      book: BOOK_WITH_EXTRA_MEMBERS,
      changeSummary: [],
    });
    const id = await newestVersionId();

    const detail = await readVersion(id, { cookie });
    const list = await readVersions({ cookie });

    expect(detail.status).toBe(200);
    const text = `${await detail.text()}${await list.text()}${console_.everything()}`;
    expect(text).not.toContain("EXTRA-BOOK-MARKER-31");
    expect(text).not.toContain("EXTRA-RULE-MARKER-32");
  });

  it("serves a change summary whose changes carry an undeclared member with the member left out", async () => {
    const { cookie, tokenHash } = await administrator();
    await storeVersion(tokenHash, {
      book: SAMPLE_PRICE_BOOK,
      changeSummary: SUMMARY_WITH_EXTRA_MEMBER,
    });
    const id = await newestVersionId();

    const detail = await readVersion(id, { cookie });

    expect(detail.status).toBe(200);
    const text = `${await detail.text()}${console_.everything()}`;
    expect(text).not.toContain("EXTRA-CHANGE-MARKER-33");
  });

  it("whose change summary is a list holding a change with a script for a value is a 503 with no detail on the detail", async () => {
    const { cookie, tokenHash } = await administrator();
    await storeVersion(tokenHash, {
      book: SAMPLE_PRICE_BOOK,
      changeSummary: [
        { address: ANCHOR_ADDRESS, value: "<script>STORED-XSS-41</script>" },
      ],
    });
    const id = await newestVersionId();
    expect(id).not.toBe(prices.versionId);

    const detail = await readVersion(id, { cookie });

    expect(detail.status).toBe(503);
    expect(await detail.text()).not.toContain("STORED-XSS-41");
    expect(console_.everything()).not.toContain("STORED-XSS-41");
  });

  // The store refuses a summary of numbers at a publish, but the table has no check on an entry's shape, so a row written
  // out of band can hold one: the reader is shown it by a store that answers with the row, as the versions route's own
  // test does.
  it("whose change summary is a list of numbers is a 503 with no detail on the detail", async () => {
    const { cookie, tokenHash } = await administrator();
    await storeVersion(tokenHash, {
      book: SAMPLE_PRICE_BOOK,
      changeSummary: [],
    });
    const id = await newestVersionId();
    const real = prices.stores.priceBook.readVersion.bind(
      prices.stores.priceBook,
    );
    vi.spyOn(prices.stores.priceBook, "readVersion").mockImplementation(
      async (versionId) => {
        const read = await real(versionId);
        return read.kind === "found"
          ? {
              kind: "found",
              version: { ...read.version, changeSummary: [1, 2, 3] },
            }
          : read;
      },
    );

    const detail = await readVersion(id, { cookie });

    expect(detail.status).toBe(503);
    expect(await detail.text()).not.toContain("[1,2,3]");
    expect(console_.everything()).not.toContain("[1,2,3]");
  });

  it("whose book is unparseable is a 503 on the detail and the restore, with no row written by either", async () => {
    const { cookie, tokenHash } = await administrator();
    await storeVersion(tokenHash, {
      book: { not: "a book" },
      changeSummary: [],
    });
    const brokenId = await newestVersionId();
    await storeVersion(tokenHash, {
      book: SAMPLE_PRICE_BOOK,
      changeSummary: [],
    });
    const rowsBefore =
      prices.ledger.heldEvents().length + staffWorld.audit.heldEvents().length;

    const detail = await readVersion(brokenId, { cookie });
    const restore = await restoreVersion(brokenId, {
      cookie,
      json: { expectedDraftRevision: await currentDraftRevision() },
    });

    expect(detail.status).toBe(503);
    expect(restore.status).toBe(503);
    expect(await detail.text()).not.toContain("not");
    expect(
      prices.ledger.heldEvents().length + staffWorld.audit.heldEvents().length,
    ).toBe(rowsBefore);
  });

  it("shows no price of an unparseable book in the history list, which names it and nothing of its book", async () => {
    const { cookie, tokenHash } = await administrator();
    await storeVersion(tokenHash, {
      book: { not: "a book", leak: "LISTED-BOOK-MARKER-9" },
      changeSummary: [],
      label: "Broken",
    });

    const list = await readVersions({ cookie });

    expect(list.status).toBe(200);
    expect(await list.text()).not.toContain("LISTED-BOOK-MARKER-9");
  });
});

describe("the routes' own methods and headers", () => {
  it("export exactly the handlers each route is for", () => {
    const handlers = (route: object) =>
      Object.keys(route)
        .filter((name) => /^[A-Z]+$/.test(name))
        .sort();

    expect(handlers(publishRoute)).toEqual(["POST"]);
    expect(handlers(restoreRoute)).toEqual(["POST"]);
    expect(handlers(versionsRoute)).toEqual(["GET", "HEAD"]);
    expect(handlers(versionRoute)).toEqual(["GET", "HEAD"]);
    for (const route of [
      publishRoute,
      restoreRoute,
      versionsRoute,
      versionRoute,
    ]) {
      expect(route.runtime).toBe("nodejs");
      expect(route.dynamic).toBe("force-dynamic");
    }
  });

  it("answer every status they have with no-store, private, and a JSON body", async () => {
    const admin = await administrator();
    const operator = await signedInAs({ role: "operator" });
    const client = await signedInAs({ role: "client" });
    await putChange(admin.cookie, ANCHOR_ADDRESS, 500_000);
    const goodPublish = await publishBody();
    const restoreJson = { expectedDraftRevision: await currentDraftRevision() };
    const asked: [string, Promise<Response>][] = [
      ["publish 401", publishDraft({ json: goodPublish })],
      [
        "publish 403 operator",
        publishDraft({ cookie: operator.session.cookie, json: goodPublish }),
      ],
      [
        "publish 403 client",
        publishDraft({ cookie: client.session.cookie, json: goodPublish }),
      ],
      [
        "publish 400",
        publishDraft({
          cookie: admin.cookie,
          json: { ...goodPublish, label: "" },
        }),
      ],
      [
        "publish 415",
        publishDraft({
          cookie: admin.cookie,
          json: "{}",
          contentType: "text/plain",
        }),
      ],
      [
        "publish 403 cross-site",
        publishDraft({
          cookie: admin.cookie,
          json: goodPublish,
          secFetchSite: "cross-site",
        }),
      ],
      [
        "restore 401",
        restoreVersion(prices.versionId ?? "", { json: restoreJson }),
      ],
      [
        "restore 404",
        restoreVersion("x".repeat(500), {
          cookie: admin.cookie,
          json: restoreJson,
        }),
      ],
      [
        "restore 409",
        restoreVersion(prices.versionId ?? "", {
          cookie: admin.cookie,
          json: restoreJson,
        }),
      ],
      ["versions 401", readVersions({})],
      ["versions 403", readVersions({ cookie: operator.session.cookie })],
      [
        "versions 400",
        readVersions({ cookie: admin.cookie, search: "?page=x" }),
      ],
      ["version 404", readVersion("nope", { cookie: admin.cookie })],
      ["version 401", readVersion(prices.versionId ?? "", {})],
      [
        "version cross-site",
        readVersion(prices.versionId ?? "", {
          cookie: admin.cookie,
          secFetchSite: "cross-site",
        }),
      ],
      [
        "publish 200",
        publishDraft({ cookie: admin.cookie, json: goodPublish }),
      ],
    ];

    const answers = await Promise.all(asked.map(([, answer]) => answer));

    answers.forEach((answer, index) => {
      const title = asked[index]?.[0] ?? "";
      expect(answer.headers.get("cache-control"), title).toBe(
        "private, no-store",
      );
      expect(answer.headers.get("content-type"), title).toMatch(/json/);
    });
    expect(answers.map(({ status }) => status)).toEqual([
      401, 403, 403, 400, 415, 403, 401, 404, 409, 401, 403, 400, 404, 401, 403,
      200,
    ]);
  });

  it("answer a signed-out caller without telling an id that exists from one that does not", async () => {
    const real = await readVersion(prices.versionId ?? "", {});
    const unreal = await readVersion("no-such-version", {});

    expect(real.status).toBe(unreal.status);
    expect(await real.text()).toBe(await unreal.text());
    expect(priceStoreAsks.count).toBe(0);
  });
});

describe("a draft or an archive reaches no customer (R-d)", () => {
  const ARCHIVE_LABEL = "ARCHIVE-LABEL-MARKER-77";
  const ARCHIVE_NOTE = "ARCHIVE-NOTE-MARKER-78";
  const PENDING_ANCHOR = 777_770;

  it("is in nothing the customer-side root holds: not the archive's id, label or note, and not a pending price", async () => {
    const { cookie } = await administrator();
    await putChange(cookie, ANCHOR_ADDRESS, 520_000);
    const archivedAnswer = await publishDraft({
      cookie,
      json: await publishBody({ label: ARCHIVE_LABEL, note: ARCHIVE_NOTE }),
    });
    const { versionId: archivedId } = (await jsonOf(archivedAnswer)) as {
      versionId: string;
    };
    await publishAnchor(cookie, 540_000, "Newest");
    await putChange(cookie, ANCHOR_ADDRESS, PENDING_ANCHOR);

    const root = await readActivePriceBook(prices.stores);

    expect(root.kind).toBe("active");
    const customerText = JSON.stringify(root);
    expect(customerText).not.toContain(archivedId);
    expect(customerText).not.toContain(prices.versionId ?? "never");
    expect(customerText).not.toContain(ARCHIVE_LABEL);
    expect(customerText).not.toContain(ARCHIVE_NOTE);
    expect(customerText).not.toContain(String(PENDING_ANCHOR));
    expect(customerText).not.toContain('"draft');
  });

  it("is read by no module of the application outside the staff price routes and their service", async () => {
    const { sourceFilesMatching } = await import(
      "../../../lib/server/server-source-support"
    );
    const READS_DRAFT_OR_ARCHIVE =
      /\.(?:readVersion|listVersions|readDraft|writeDraft)\b|\bversion-wire\b|\breadVersionBook\b|\bpriceBook\.publish\b|lib\/server\/price-dashboard\//;
    const ALLOWED = [
      /^app\/api\/staff\/prices\//,
      /^lib\/server\/price-dashboard\//,
      /^lib\/server\/price-book-test-seed\.ts$/,
      // The availability route's module: it reads the active version and the availability head, never the draft or the
      // archive, and it takes the dashboard's request readers and answers from the directory above.
      /^lib\/server\/catalogue-availability\.ts$/,
      // The one read the staff cabinets and hardware sources share: the dashboard's state in process, after each page's
      // own `price.edit` gate, with no audit row. It is named by those two sources and by nothing a customer reaches
      // (`qa-m10-u4a-sources`).
      /^price-dashboard\/admitted-state-read\.ts$/,
    ];

    const readers = sourceFilesMatching(READS_DRAFT_OR_ARCHIVE).filter(
      (path) => !ALLOWED.some((allowed) => allowed.test(path)),
    );

    expect(readers).toEqual([]);
  });
});
