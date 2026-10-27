import "server-only";

import { randomBytes } from "node:crypto";

import { SAMPLE_PRICE_BOOK } from "@lemnaria/configurator-domain";
import {
  FakeCatalogueAvailabilityStore,
  FakeDashboardAuditLedger,
  FakePriceBookStore,
  FakeRevisionHead,
  FakeSessionStore,
  generateAccountId,
  type ActivePriceVersion,
  type PriceBookStore,
} from "@lemnaria/persistence";

import type { PriceStores } from "@/lib/server/price-stores";

// The test-only seeding helper (A-10, ADR 0151): the one module in this application that names `SAMPLE_PRICE_BOOK`. Dev,
// test and e2e runs read their book from fake stores seeded here, as a published version 1, through the same port
// production reads (`PriceBookStore`). `price-stores.ts` loads this module only for `NODE_ENV` development or test, or the
// e2e flag, so a production build never reaches the sample.

const SEEDING_PUBLISHER_PASSWORD_HASH = `$argon2id$v=19$m=19456,t=2,p=1$${"A".repeat(22)}$${"B".repeat(43)}`;
const SESSION_IDLE_LIFETIMES_SECONDS = {
  client: 2_592_000,
  operator: 43_200,
  administrator: 43_200,
};
const SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000;
const SEED_LABEL = "Sample book";
const SEED_NOTE = "The sample book, seeded for a run that has no database.";
const INITIAL_REVISION = "0";
const FIRST_SEQUENCE_EXPECTED = 0;

/**
 * Fake stores holding the sample book as published version 1. A publisher is a fake administrator with a live fake
 * session, because the fake store, like the real one, takes the actor of a write from a live session.
 */
export async function seedFakePriceStores(): Promise<PriceStores> {
  const accountId = generateAccountId();
  const sessions = new FakeSessionStore({
    accountOf: (id) =>
      id === accountId
        ? {
            id,
            email: "seed-publisher@example.invalid",
            role: "administrator",
            isEmailVerified: true,
          }
        : undefined,
    passwordHashOf: (id) =>
      id === accountId ? SEEDING_PUBLISHER_PASSWORD_HASH : undefined,
    passwordChangedAtOf: (id) => (id === accountId ? new Date(0) : undefined),
  });
  const sessionTokenHash = randomBytes(32).toString("hex");
  await sessions.create({
    tokenHash: sessionTokenHash,
    accountId,
    expectedPasswordHash: SEEDING_PUBLISHER_PASSWORD_HASH,
    absoluteExpiresAt: new Date(Date.now() + SESSION_LIFETIME_MS),
  });
  const ledger = new FakeDashboardAuditLedger({ sessions });
  const availability = new FakeCatalogueAvailabilityStore({
    head: new FakeRevisionHead(),
    ledger,
  });
  const priceBook = new FakePriceBookStore({ ledger, availability });
  const published = await priceBook.publish({
    expectedDraftRevision: INITIAL_REVISION,
    expectedActiveSequence: FIRST_SEQUENCE_EXPECTED,
    expectedAvailabilityRevision: INITIAL_REVISION,
    createdItems: [],
    label: SEED_LABEL,
    note: SEED_NOTE,
    book: SAMPLE_PRICE_BOOK,
    changeSummary: [],
    audit: {
      session: {
        sessionTokenHash,
        idleLifetimeSeconds: SESSION_IDLE_LIFETIMES_SECONDS,
      },
      entry: {
        action: "price-published",
        detail: { provisional: SAMPLE_PRICE_BOOK.amountsProvisional },
      },
    },
  });
  if (published.kind !== "ok") {
    throw new Error(`The sample book could not be seeded: ${published.kind}`);
  }
  return { priceBook: stampedWithItsVersionId(priceBook), availability };
}

/**
 * Every stored version's book states its own `version` as its version's id, so the id a request digests, the version
 * pricing is asked for and the version a stored submission records are one identity (`readActivePriceBook` refuses a book
 * that does not). The fake store mints the id when it publishes, after the book is fixed, so this world stamps it on the
 * way out. A store that stamps on the way in makes this redundant. Reads only: nothing the fake holds is changed.
 */
function stampedWithItsVersionId(store: FakePriceBookStore): PriceBookStore {
  return {
    readActive: async () => {
      const read = await store.readActive();
      return read.kind === "found"
        ? { kind: "found", version: stamped(read.version) }
        : read;
    },
    readVersion: async (versionId) => {
      const read = await store.readVersion(versionId);
      return read.kind === "found"
        ? { kind: "found", version: stamped(read.version) }
        : read;
    },
    listVersions: (request) => store.listVersions(request),
    readDraft: () => store.readDraft(),
    writeDraft: (request) => store.writeDraft(request),
    publish: (request) => store.publish(request),
  };
}

function stamped<Version extends ActivePriceVersion>(
  version: Version,
): Version {
  const book = version.book as Record<string, unknown>;
  return { ...version, book: { ...book, version: version.versionId } };
}
