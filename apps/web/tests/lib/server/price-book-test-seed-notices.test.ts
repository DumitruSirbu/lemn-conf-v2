import { SAMPLE_PRICE_BOOK } from "@lemnaria/configurator-domain";
import { NEVER_RECORDED, type AcknowledgedPrices } from "@lemnaria/persistence";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IDLE_LIFETIME_SECONDS_BY_ROLE } from "@/lib/server/account/session-lifetimes";
import { seedFakePriceStores } from "@/lib/server/price-book-test-seed";
import type { PriceStores } from "@/lib/server/price-stores";

import { aDesignId, freshAccountWorld } from "../../support/account-world";
import { signedInAs } from "../../support/staff-world";

// The seeded world's notice store judges an acknowledgement against the versions and the availability head the editor
// prices under (R5a-b, R5a-c): one fake price book, wrapped for the reader and read raw by the notice store, never a second
// one. A second version published through the seeded `priceBook` is therefore known to the notice store.

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);

const A_VERSION_ID_THAT_WAS_NEVER_PUBLISHED = "N".repeat(21);

let stores: PriceStores;
let designId: string;

beforeEach(async () => {
  freshAccountWorld();
  stores = await seedFakePriceStores();
  designId = aDesignId();
});

async function activeVersionId(): Promise<string> {
  const active = await stores.priceBook.readActive();
  if (active.kind !== "found") throw new Error("the seed holds no version");
  return active.version.versionId;
}

async function currentPair(): Promise<AcknowledgedPrices> {
  const { revision } = await stores.availability.readCurrent();
  return {
    versionId: await activeVersionId(),
    availabilityRevision: revision,
  };
}

async function publishSecondVersion(): Promise<string> {
  const publisher = await signedInAs(
    { role: "administrator" },
    "second-publisher@example.test",
  );
  const draft = await stores.priceBook.readDraft();
  const { revision } = await stores.availability.readCurrent();
  const published = await stores.priceBook.publish({
    expectedDraftRevision: draft.draftRevision,
    expectedActiveSequence: 1,
    expectedAvailabilityRevision: revision,
    createdItems: [],
    deletedItems: [],
    label: "Version 2",
    note: "",
    book: SAMPLE_PRICE_BOOK,
    changeSummary: [],
    audit: {
      session: {
        sessionTokenHash: publisher.session.tokenHash,
        idleLifetimeSeconds: IDLE_LIFETIME_SECONDS_BY_ROLE,
      },
      entry: {
        action: "price-published",
        detail: { provisional: SAMPLE_PRICE_BOOK.amountsProvisional },
      },
    },
  });
  if (published.kind !== "ok") throw new Error("seed: second publish refused");
  return published.versionId;
}

describe("an acknowledgement in the seeded world", () => {
  it("naming the active version and the availability head is ok, and is then what the design reads back", async () => {
    const pair = await currentPair();

    const answer = await stores.notices.recordAcknowledged(designId, pair);

    expect(answer).toEqual({ kind: "ok" });
    expect(await stores.notices.readAcknowledged(designId)).toEqual({
      kind: "recorded",
      acknowledged: pair,
    });
  });

  it("naming a version published after the world was seeded is ok too, through the same price book", async () => {
    const secondVersionId = await publishSecondVersion();
    const { revision } = await stores.availability.readCurrent();

    const answer = await stores.notices.recordAcknowledged(designId, {
      versionId: secondVersionId,
      availabilityRevision: revision,
    });

    expect(await activeVersionId()).toBe(secondVersionId);
    expect(answer).toEqual({ kind: "ok" });
  });

  it("naming a version nothing published is unknown-version", async () => {
    const { availabilityRevision } = await currentPair();

    const answer = await stores.notices.recordAcknowledged(designId, {
      versionId: A_VERSION_ID_THAT_WAS_NEVER_PUBLISHED,
      availabilityRevision,
    });

    expect(answer).toEqual({ kind: "unknown-version" });
  });

  it("naming the head plus one is revision-ahead", async () => {
    const { versionId, availabilityRevision } = await currentPair();
    const aheadOfTheHead = String(BigInt(availabilityRevision) + 1n);

    const answer = await stores.notices.recordAcknowledged(designId, {
      versionId,
      availabilityRevision: aheadOfTheHead,
    });

    expect(answer).toEqual({ kind: "revision-ahead" });
  });

  it.each([
    [
      "an unknown version",
      (pair: AcknowledgedPrices) => ({
        ...pair,
        versionId: A_VERSION_ID_THAT_WAS_NEVER_PUBLISHED,
      }),
    ],
    [
      "a revision ahead of the head",
      (pair: AcknowledgedPrices) => ({
        ...pair,
        availabilityRevision: String(BigInt(pair.availabilityRevision) + 1n),
      }),
    ],
  ])(
    "refused for %s changes nothing the design reads back, whether it held a marker or not",
    async (_description, refusedPairOf) => {
      const pair = await currentPair();

      await stores.notices.recordAcknowledged(designId, refusedPairOf(pair));
      expect(await stores.notices.readAcknowledged(designId)).toBe(
        NEVER_RECORDED,
      );

      await stores.notices.recordIfAbsent(designId, pair);
      await stores.notices.recordAcknowledged(designId, refusedPairOf(pair));
      expect(await stores.notices.readAcknowledged(designId)).toEqual({
        kind: "recorded",
        acknowledged: pair,
      });
    },
  );
});
