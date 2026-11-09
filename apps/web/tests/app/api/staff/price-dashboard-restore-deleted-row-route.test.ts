import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyChanges } from "@lemnaria/configurator-domain";

import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  captureConsole,
  freshAccountWorld,
  jsonOf,
} from "../../../support/account-world";
import { VENEER } from "../../../support/restore-book-fixtures";
import {
  activeBookOfWorld,
  restoreAuditRows,
  restoreVersionOne,
  storedDraftChanges,
} from "../../../support/restore-route-world";
import {
  freshPriceDashboardWorld,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import { deleting, plantDraft } from "../../../support/planted-draft";
import {
  ANCHOR_ADDRESS,
  SAMPLE_ANCHOR_MINOR,
  VERSIONED_BOOK,
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

// Restoring a version that priced a row the draft deletes keeps the deletion and changes nothing on that row. The
// stored draft is planted, since no route writes a deletion yet.

const VENEER_PERCENT_ADDRESS = {
  kind: "material",
  tierId: VENEER.tierId,
  field: "percentOfCabinets",
} as const;
const VENEER_PERCENT_LATER = 45;
const ANCHOR_LATER_MINOR = 500_000;

let prices: PriceDashboardWorld;

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld({ book: VERSIONED_BOOK });
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function administrator() {
  const { session } = await signedInAs({ role: "administrator" });
  return session;
}

async function activeBookAppliesStoredDraft(): Promise<boolean> {
  return applyChanges(await activeBookOfWorld(), await storedDraftChanges()).ok;
}

/** Version two prices the veneer and an anchor differently from version one, and is published. */
async function publishVersionTwo(
  cookie: string,
  { movesAnchor }: { movesAnchor: boolean },
): Promise<void> {
  await putChange(cookie, VENEER_PERCENT_ADDRESS, VENEER_PERCENT_LATER);
  if (movesAnchor) await putChange(cookie, ANCHOR_ADDRESS, ANCHOR_LATER_MINOR);
  await publishWithLabel(cookie, "Second");
}

describe("a restore while the draft deletes a row the restored version prices", () => {
  it("answers 200, keeps the deletion and writes no change addressed to the row", async () => {
    const session = await administrator();
    await publishVersionTwo(session.cookie, { movesAnchor: true });
    await plantDraft(session.tokenHash, deleting(VENEER));

    const answer = await restoreVersionOne(session.cookie);

    expect(answer.status).toBe(200);
    const stored = await storedDraftChanges();
    expect(await jsonOf(answer)).toEqual({
      draft: {
        draftRevision: (await prices.stores.priceBook.readDraft())
          .draftRevision,
        changes: stored,
      },
      addedChangeCount: 1,
    });
    expect(stored).toEqual([
      ...deleting(VENEER),
      { address: ANCHOR_ADDRESS, value: SAMPLE_ANCHOR_MINOR },
    ]);
    expect(await activeBookAppliesStoredDraft()).toBe(true);
  });

  it("records one restore row that counts the changes the draft took, not the row's", async () => {
    const session = await administrator();
    await publishVersionTwo(session.cookie, { movesAnchor: true });
    await plantDraft(session.tokenHash, deleting(VENEER));

    await restoreVersionOne(session.cookie);

    expect(restoreAuditRows().map(({ detail }) => detail)).toEqual([
      { fromSequenceNumber: 1, changeCount: 1 },
    ]);
  });

  it("is nothing-differs when the deleted row is the only thing version one prices differently, and writes nothing", async () => {
    const session = await administrator();
    await publishVersionTwo(session.cookie, { movesAnchor: false });
    await plantDraft(session.tokenHash, deleting(VENEER));
    const before = await prices.stores.priceBook.readDraft();
    const rowsBefore = prices.ledger.heldEvents().length;

    const answer = await restoreVersionOne(session.cookie);

    expect({ status: answer.status, body: await jsonOf(answer) }).toEqual({
      status: 409,
      body: { status: "nothing-differs" },
    });
    expect(await prices.stores.priceBook.readDraft()).toEqual(before);
    expect(prices.ledger.heldEvents()).toHaveLength(rowsBefore);
  });
});
