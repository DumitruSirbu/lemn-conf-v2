import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyChanges,
  type DraftChange,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { readActivePriceBook } from "@/lib/server/active-price-book";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  captureConsole,
  freshAccountWorld,
  jsonOf,
} from "../../../support/account-world";
import {
  currentDraftRevision,
  publishBody,
  publishDraft,
  restoreVersion,
} from "../../../support/price-dashboard-requests";
import {
  freshPriceDashboardWorld,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import {
  ANCHOR_ADDRESS,
  VERSIONED_BOOK,
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
 * Adversarial QA of M10 wave R3, the acceptance the developer's and the earlier QA suites leave to inference: that R3
 * hands the store the candidate book as the stored draft makes it and does not stamp `book.version` (R-a: the store
 * does, once it has minted the id), that the book the candidate is made from is the stored book parsed and projected
 * and never the raw row, and that the note's bound and character rule hold at the route as they do in the domain (the
 * label's are pinned in `price-dashboard-publish-route.test.ts`).
 */

const NEW_ANCHOR_MINOR = 500_000;
const ASTRAL = "\u{1F373}";
const COMBINING_ACUTE = "́";

let prices: PriceDashboardWorld;

beforeEach(async () => {
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  await seedWorldPublishing(VERSIONED_BOOK);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** A world of its own: the seed's publisher account is taken once per account world, so a second seed needs a new one. */
async function seedWorldPublishing(book: PriceBook): Promise<void> {
  freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld({ book });
}

async function administratorCookie(): Promise<string> {
  const { session } = await signedInAs({ role: "administrator" });
  return session.cookie;
}

async function activeBook(): Promise<PriceBook> {
  const root = await readActivePriceBook(prices.stores);
  if (root.kind !== "active") throw new Error("no active book");
  return root.book;
}

function bookOf(request: { readonly book: unknown }): Record<string, unknown> {
  return request.book as Record<string, unknown>;
}

describe("R3 does not stamp book.version (R-a: the store mints the id inside publish())", () => {
  it("hands the store the candidate the draft makes, whole, still naming the version it was made from", async () => {
    const cookie = await administratorCookie();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);
    const draft = await prices.stores.priceBook.readDraft();
    const expected = applyChanges(
      await activeBook(),
      draft.changes as readonly DraftChange[],
    );
    if (!expected.ok) throw new Error("the draft does not apply");
    const publishSpy = vi.spyOn(prices.priceBook, "publish");

    const answer = await publishDraft({
      cookie,
      json: await publishBody({ label: "Unstamped" }),
    });

    expect(answer.status).toBe(200);
    const [request] = publishSpy.mock.calls[0] ?? [];
    if (request === undefined) throw new Error("the store was not asked");
    const { versionId } = (await jsonOf(answer)) as { versionId: string };
    expect(bookOf(request).version).toBe(prices.versionId);
    expect(bookOf(request).version).not.toBe(versionId);
    expect(request.book).toEqual(expected.book);
  });

  it("is not told otherwise by the person: a version or a book in the body is refused, and the store is never asked", async () => {
    const cookie = await administratorCookie();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);
    const publishSpy = vi.spyOn(prices.priceBook, "publish");

    for (const extra of [
      { version: "chosen-by-the-caller" },
      { book: { ...VERSIONED_BOOK, version: "chosen-by-the-caller" } },
    ]) {
      const answer = await publishDraft({
        cookie,
        json: await publishBody(extra),
      });
      expect(answer.status).toBe(400);
    }

    expect(publishSpy).not.toHaveBeenCalled();
  });
});

describe("the stored active book is untrusted before a publish is made from it", () => {
  it("publishes the declared members only: a member the stored active book was never declared to hold is not in the next version", async () => {
    await seedWorldPublishing({
      ...VERSIONED_BOOK,
      undeclaredMember: "STORED-JUNK-9913",
      formulaNotes: { nested: ["STORED-JUNK-9913"] },
    } as unknown as PriceBook);
    const cookie = await administratorCookie();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);

    const answer = await publishDraft({
      cookie,
      json: await publishBody({ label: "Clean" }),
    });

    expect(answer.status).toBe(200);
    const { versionId } = (await jsonOf(answer)) as { versionId: string };
    const stored = await prices.priceBook.readVersion(versionId);
    expect(JSON.stringify(stored)).not.toContain("STORED-JUNK-9913");
  });
});

describe("restoring the active version", () => {
  it("is nothing-differs even over a pending edit, and leaves that edit in the draft: a restore is no way to discard", async () => {
    const cookie = await administratorCookie();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);
    const draftBefore = await prices.stores.priceBook.readDraft();
    const rowsBefore = prices.ledger.heldEvents().length;

    const answer = await restoreVersion(prices.versionId ?? "never", {
      cookie,
      json: { expectedDraftRevision: draftBefore.draftRevision },
    });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "nothing-differs" });
    expect(await prices.stores.priceBook.readDraft()).toEqual(draftBefore);
    expect(prices.ledger.heldEvents()).toHaveLength(rowsBefore);
  });

  it("is nothing-differs for the newest version after a later publish moved it to the head", async () => {
    const cookie = await administratorCookie();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);
    const published = await publishDraft({
      cookie,
      json: await publishBody({ label: "Head" }),
    });
    const { versionId } = (await jsonOf(published)) as { versionId: string };
    await putChange(cookie, ANCHOR_ADDRESS, 530_000);

    const answer = await restoreVersion(versionId, {
      cookie,
      json: { expectedDraftRevision: await currentDraftRevision() },
    });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "nothing-differs" });
  });
});

describe("the note at the route (an optional text of at most 240 code points, in its stored form)", () => {
  async function publishWithNote(note: unknown) {
    const cookie = await administratorCookie();
    await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);
    return publishDraft({ cookie, json: await publishBody({ note }) });
  }

  async function storedNoteOf(answer: Response): Promise<string | undefined> {
    const { versionId } = (await jsonOf(answer)) as { versionId: string };
    const stored = await prices.priceBook.readVersion(versionId);
    return stored.kind === "found" ? stored.version.note : undefined;
  }

  it("accepts exactly 240 code points, astral ones included, and refuses the 241st", async () => {
    const atBound = await publishWithNote(ASTRAL.repeat(240));
    expect(atBound.status).toBe(200);
    expect(await storedNoteOf(atBound)).toBe(ASTRAL.repeat(240));

    await seedWorldPublishing(VERSIONED_BOOK);
    const pastBound = await publishWithNote(ASTRAL.repeat(241));
    expect(pastBound.status).toBe(400);
    expect(await jsonOf(pastBound)).toEqual({
      status: "invalid-input",
      issues: [{ field: "note", code: "TEXT_TOO_LONG" }],
    });
  });

  it("counts the composed form: 240 decomposed letters fit, 241 do not", async () => {
    const fits = await publishWithNote(`e${COMBINING_ACUTE}`.repeat(240));
    expect(fits.status).toBe(200);
    expect(await storedNoteOf(fits)).toBe("é".repeat(240));

    await seedWorldPublishing(VERSIONED_BOOK);
    const overflows = await publishWithNote(`e${COMBINING_ACUTE}`.repeat(241));
    expect(overflows.status).toBe(400);
  });

  it("trims a note, strips format characters from it, and keeps a note of only those as the empty note", async () => {
    const trimmed = await publishWithNote("  ​Spring­  ");
    expect(trimmed.status).toBe(200);
    expect(await storedNoteOf(trimmed)).toBe("Spring");

    await seedWorldPublishing(VERSIONED_BOOK);
    const onlyFormat = await publishWithNote("​­  ");
    expect(onlyFormat.status).toBe(200);
    expect(await storedNoteOf(onlyFormat)).toBe("");
  });

  it.each([
    ["a NUL", "a\u0000b"],
    ["a line feed", "a\nb"],
    ["a carriage return", "a\rb"],
    ["a tab", "a\tb"],
    ["a DEL", "a\u007fb"],
    ["a C1 control", "a\u0085b"],
    ["a line separator", "a b"],
    ["a paragraph separator", "a b"],
    ["a lone high surrogate", "a\ud800b"],
    ["a lone low surrogate", "a\udc00b"],
    ["a right-to-left mark", "a‏b"],
    ["an isolate", "a⁦b"],
  ])(
    "refuses a note with %s as TEXT_FORBIDDEN_CHARACTER, naming only the note, and stores nothing",
    async (_title, note) => {
      const cookie = await administratorCookie();
      await putChange(cookie, ANCHOR_ADDRESS, NEW_ANCHOR_MINOR);
      const before = (await prices.priceBook.listVersions({ page: 1 })).total;

      const answer = await publishDraft({
        cookie,
        json: await publishBody({ note }),
      });

      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({
        status: "invalid-input",
        issues: [{ field: "note", code: "TEXT_FORBIDDEN_CHARACTER" }],
      });
      expect((await prices.priceBook.listVersions({ page: 1 })).total).toBe(
        before,
      );
    },
  );
});
