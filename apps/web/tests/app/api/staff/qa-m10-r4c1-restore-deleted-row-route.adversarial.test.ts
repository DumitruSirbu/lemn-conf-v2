import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  applyChanges,
  deletedItemsOf,
  restoreChanges,
  type DraftChange,
  type ItemRef,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { judgeDraft } from "@/price-dashboard/draft-judgement";

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
  PREMIUM,
  VENEER,
  isOnRow,
} from "../../../support/restore-book-fixtures";
import {
  activeBookOfWorld,
  archivedBookOne,
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

// The restore route beside a draft that deletes a row. Version one prices three deletable rows (a material, a hardware
// class and a linked accessory) and version two moves all three and an anchor; the stored draft is planted to delete one,
// as no route writes a deletion yet. Every arm asserts what the store holds afterwards, not only the status. The mocks
// above are each file's own: `vi.mock` is hoisted per file, so a shared module cannot register them.

const DISTINCT_ACCESSORY_ID = "QaDistinctAcc7731";
const ACCESSORY: ItemRef = {
  kind: "accessory",
  accessoryId: DISTINCT_ACCESSORY_ID,
};

const BOOK_ONE: PriceBook = {
  ...SAMPLE_PRICE_BOOK,
  linkedAccessories: [
    {
      accessoryId: DISTINCT_ACCESSORY_ID,
      ruleId: `accessory.${DISTINCT_ACCESSORY_ID}`,
      linkedBuildId: "base-3drawer",
      perUnitMinor: 1_000,
      name: "Soclu luminos",
    },
  ],
};

const VERSION_TWO_CHANGES: readonly [unknown, number][] = [
  [{ kind: "material", tierId: VENEER.tierId, field: "percentOfCabinets" }, 45],
  [{ kind: "hardware", tierId: PREMIUM.tierId, field: "perHingeMinor" }, 9_100],
  [
    {
      kind: "accessory",
      accessoryId: DISTINCT_ACCESSORY_ID,
      field: "perUnitMinor",
    },
    2_500,
  ],
  [ANCHOR_ADDRESS, 500_000],
];

let prices: PriceDashboardWorld;
let console_: ReturnType<typeof captureConsole>;

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld({ book: BOOK_ONE });
  console_ = captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function administratorWithVersionTwo() {
  const { session } = await signedInAs({ role: "administrator" });
  for (const [address, value] of VERSION_TWO_CHANGES) {
    await putChange(session.cookie, address, value);
  }
  await publishWithLabel(session.cookie, "Second");
  return session;
}

async function worldState() {
  return {
    draft: await prices.stores.priceBook.readDraft(),
    auditRows: prices.ledger.heldEvents().length,
    active: await prices.stores.priceBook.readActive(),
    availability: (await prices.stores.availability.readCurrent()).revision,
  };
}

describe.each([
  ["a material", VENEER],
  ["a hardware class", PREMIUM],
  ["a linked accessory", ACCESSORY],
] as const)(
  "restoring version one while the draft deletes %s",
  (_name, item) => {
    async function expectedRestoreChanges(): Promise<readonly DraftChange[]> {
      return restoreChanges(
        await archivedBookOne(),
        await activeBookOfWorld(),
      ).filter(
        (change) => !isOnRow(change as DraftChange, item),
      ) as readonly DraftChange[];
    }

    it("writes [deletion, the restore's changes to the other rows] and moves the draft revision once", async () => {
      const session = await administratorWithVersionTwo();
      await plantDraft(session.tokenHash, deleting(item));
      const revisionBefore = await currentDraftRevision();
      const expected = [...deleting(item), ...(await expectedRestoreChanges())];
      expect(expected).toHaveLength(4);

      const answer = await restoreVersionOne(session.cookie);

      expect(answer.status).toBe(200);
      const stored = await storedDraftChanges();
      expect(stored).toEqual(expected);
      expect(Number(await currentDraftRevision())).toBe(
        Number(revisionBefore) + 1,
      );
      expect(await jsonOf(answer)).toEqual({
        draft: { draftRevision: await currentDraftRevision(), changes: stored },
        addedChangeCount: 3,
      });
    });

    it("records one audit row counting the three fields it changed, and its detail holds no row id", async () => {
      const session = await administratorWithVersionTwo();
      await plantDraft(session.tokenHash, deleting(item));
      const rowsBefore = prices.ledger.heldEvents().length;

      await restoreVersionOne(session.cookie);

      expect(restoreAuditRows().map(({ detail }) => detail)).toEqual([
        { fromSequenceNumber: 1, changeCount: 3 },
      ]);
      expect(prices.ledger.heldEvents()).toHaveLength(rowsBefore + 1);
      expect(JSON.stringify(restoreAuditRows())).not.toContain(
        DISTINCT_ACCESSORY_ID,
      );
    });

    it("leaves a stored draft the active book applies, and the draft judge allows", async () => {
      const session = await administratorWithVersionTwo();
      await plantDraft(session.tokenHash, deleting(item));
      const before = await storedDraftChanges();

      await restoreVersionOne(session.cookie);

      const stored = await storedDraftChanges();
      const active = await activeBookOfWorld();
      expect(applyChanges(active, stored).ok).toBe(true);
      expect(
        judgeDraft({
          book: active,
          changes: stored,
          stored: before,
          firstNewIndex: stored.length,
        }).kind,
      ).toBe("applies");
      expect(deletedItemsOf(stored)).toEqual([item]);
    });

    it("keeps a change the draft made to the row before deleting it, and adds none", async () => {
      const session = await administratorWithVersionTwo();
      const pending = (item.kind === "material"
        ? {
            address: {
              kind: "material",
              tierId: item.tierId,
              field: "percentOfCabinets",
            },
            value: 31,
          }
        : item.kind === "hardware"
          ? {
              address: {
                kind: "hardware",
                tierId: item.tierId,
                field: "perHingeMinor",
              },
              value: 9_900,
            }
          : {
              address: {
                kind: "accessory",
                accessoryId: item.accessoryId,
                field: "perUnitMinor",
              },
              value: 3_300,
            }) as unknown as DraftChange;
      await plantDraft(session.tokenHash, [pending, ...deleting(item)]);

      const answer = await restoreVersionOne(session.cookie);

      expect(answer.status).toBe(200);
      const stored = await storedDraftChanges();
      expect(stored.slice(0, 2)).toEqual([pending, ...deleting(item)]);
      expect(stored.filter((change) => isOnRow(change, item))).toEqual([
        pending,
      ]);
      expect(applyChanges(await activeBookOfWorld(), stored).ok).toBe(true);
    });

    it("restoring again answers nothing-differs and writes nothing", async () => {
      const session = await administratorWithVersionTwo();
      await plantDraft(session.tokenHash, deleting(item));
      await restoreVersionOne(session.cookie);
      const before = await worldState();

      const again = await restoreVersionOne(session.cookie);

      expect({ status: again.status, body: await jsonOf(again) }).toEqual({
        status: 409,
        body: { status: "nothing-differs" },
      });
      expect(await worldState()).toEqual(before);
    });
  },
);

describe("restoring while the draft deletes every row version one prices differently", () => {
  it("is nothing-differs when only the deleted rows differ, writing no row, revision or audit", async () => {
    const { session } = await signedInAs({ role: "administrator" });
    for (const [address, value] of VERSION_TWO_CHANGES.slice(0, 3)) {
      await putChange(session.cookie, address, value);
    }
    await publishWithLabel(session.cookie, "Second");
    await plantDraft(session.tokenHash, deleting(VENEER, PREMIUM, ACCESSORY));
    const before = await worldState();

    const answer = await restoreVersionOne(session.cookie);

    expect({ status: answer.status, body: await jsonOf(answer) }).toEqual({
      status: 409,
      body: { status: "nothing-differs" },
    });
    expect(await worldState()).toEqual(before);
    expect(console_.everything()).not.toContain(DISTINCT_ACCESSORY_ID);
  });
});

describe("restoring beside a draft that creates and deletes rows", () => {
  const CREATED_CLASS_ID = "QaRouteCreatedClass01";
  const CREATED_ACCESSORY_ID = "QaRouteCreatedAccessory01";
  const created = [
    {
      address: { kind: "hardware-tier-created", tierId: CREATED_CLASS_ID },
      value: { name: "GTV", description: "Mecanisme" },
    },
    ...[
      "perHingeMinor",
      "perDrawerMinor",
      "perPushToOpenMinor",
      "perLiftMinor",
      "perPushRunnerMinor",
    ].map((field) => ({
      address: { kind: "hardware", tierId: CREATED_CLASS_ID, field },
      value: 2_000,
    })),
    {
      address: { kind: "accessory-created", accessoryId: CREATED_ACCESSORY_ID },
      value: {
        linkedBuildId: "base-3drawer",
        perUnitMinor: 1_500,
        name: "Soclu",
      },
    },
  ] as unknown as DraftChange[];

  it("keeps the creations and their deletions untouched and adds the restore's prices after them", async () => {
    const session = await administratorWithVersionTwo();
    const draft = [
      ...created,
      ...deleting(
        { kind: "hardware", tierId: CREATED_CLASS_ID },
        { kind: "accessory", accessoryId: CREATED_ACCESSORY_ID },
      ),
    ];
    await plantDraft(session.tokenHash, draft);

    const answer = await restoreVersionOne(session.cookie);

    expect(answer.status).toBe(200);
    const stored = await storedDraftChanges();
    expect(stored.slice(0, draft.length)).toEqual(draft);
    expect(stored).toHaveLength(draft.length + 4);
    expect(applyChanges(await activeBookOfWorld(), stored).ok).toBe(true);
  });

  it("answers candidate-refused and writes nothing when the draft deletes a created id and creates it again", async () => {
    const session = await administratorWithVersionTwo();
    const [creation] = created;
    if (creation === undefined) throw new Error("no creation");
    const rates = created.slice(1, 6);
    const draft = [
      creation,
      ...rates,
      ...deleting({ kind: "hardware", tierId: CREATED_CLASS_ID }),
      creation,
      ...rates,
    ];
    await plantDraft(session.tokenHash, draft);
    const before = await worldState();

    const answer = await restoreVersionOne(session.cookie);

    expect({ status: answer.status, body: await jsonOf(answer) }).toEqual({
      status: 409,
      body: { status: "candidate-refused" },
    });
    expect(await worldState()).toEqual(before);
    expect(console_.everything()).not.toContain(CREATED_CLASS_ID);
  });

  it("answers candidate-refused, not a 5xx and not a write, for a stored draft that deletes a row and then prices it", async () => {
    const session = await administratorWithVersionTwo();
    await plantDraft(session.tokenHash, [
      ...deleting(ACCESSORY),
      {
        address: {
          kind: "accessory",
          accessoryId: DISTINCT_ACCESSORY_ID,
          field: "perUnitMinor",
        },
        value: 4_444,
      } as unknown as DraftChange,
    ]);
    const before = await worldState();

    const answer = await restoreVersionOne(session.cookie);

    expect({ status: answer.status, body: await jsonOf(answer) }).toEqual({
      status: 409,
      body: { status: "candidate-refused" },
    });
    expect(await worldState()).toEqual(before);
    expect(console_.everything()).not.toContain(DISTINCT_ACCESSORY_ID);
  });
});

describe("restoring a version identical to the active one", () => {
  it("is nothing-differs whatever the draft deletes, and the active version itself too", async () => {
    const session = await administratorWithVersionTwo();
    const active = await prices.stores.priceBook.readActive();
    if (active.kind !== "found") throw new Error("no active version");
    await plantDraft(session.tokenHash, deleting(VENEER));
    const before = await worldState();

    const answer = await restoreVersion(active.version.versionId, {
      cookie: session.cookie,
      json: { expectedDraftRevision: await currentDraftRevision() },
    });

    expect({ status: answer.status, body: await jsonOf(answer) }).toEqual({
      status: 409,
      body: { status: "nothing-differs" },
    });
    expect(await worldState()).toEqual(before);
  });
});

describe("a publish landing between the restore's plan and its write", () => {
  it("answers changed-meanwhile and leaves the stored draft the publish made", async () => {
    const session = await administratorWithVersionTwo();
    await plantDraft(session.tokenHash, deleting(VENEER));
    const real = prices.stores.priceBook.readVersion.bind(
      prices.stores.priceBook,
    );
    let hasPublished = false;
    vi.spyOn(prices.stores.priceBook, "readVersion").mockImplementation(
      async (id) => {
        const read = await real(id);
        if (!hasPublished) {
          hasPublished = true;
          const published = await publishDraft({
            cookie: session.cookie,
            json: await publishBody({ label: "Raced" }),
          });
          expect(published.status).toBe(200);
        }
        return read;
      },
    );
    const rowsBefore = restoreAuditRows().length;

    const answer = await restoreVersionOne(session.cookie);

    expect({ status: answer.status, body: await jsonOf(answer) }).toEqual({
      status: 409,
      body: { status: "changed-meanwhile" },
    });
    vi.restoreAllMocks();
    expect(await storedDraftChanges()).toEqual([]);
    expect(restoreAuditRows()).toHaveLength(rowsBefore);
    expect(deletedItemsOf(await storedDraftChanges())).toEqual([]);
    const active = await activeBookOfWorld();
    expect(
      active.material.tiers.some(({ tierId }) => tierId === VENEER.tierId),
    ).toBe(false);
  });
});

describe("the precedence of a stale availability revision over a deleting publish", () => {
  const STALE_REVISION = "41";

  async function publishDeletingVeneerWithStaleHead(cookie: string) {
    return publishDraft({
      cookie,
      json: await publishBody({ expectedAvailabilityRevision: STALE_REVISION }),
    });
  }

  it("answers availability-changed-meanwhile, not item-in-use, when the only design names an item the draft does not delete", async () => {
    const { session } = await signedInAs({ role: "administrator" });
    await plantDraft(session.tokenHash, deleting(VENEER));
    prices.designs.plant({
      designId: "design-other",
      uses: [PREMIUM],
      isDeletedByClient: false,
    });

    const answer = await publishDeletingVeneerWithStaleHead(session.cookie);

    expect({ status: answer.status, body: await jsonOf(answer) }).toEqual({
      status: 409,
      body: { status: "availability-changed-meanwhile" },
    });
  });

  it("answers item-in-use ahead of the stale head for a design that names the deleted item, and the design's owner is not named", async () => {
    const { session } = await signedInAs({ role: "administrator" });
    await plantDraft(session.tokenHash, deleting(VENEER));
    prices.designs.plant({
      designId: "design-owner-secret-91",
      uses: [VENEER],
      isDeletedByClient: false,
    });
    const before = await worldState();

    const answer = await publishDeletingVeneerWithStaleHead(session.cookie);

    const body = await jsonOf(answer);
    expect({ status: answer.status, body }).toEqual({
      status: 409,
      body: { status: "item-in-use", items: [VENEER] },
    });
    expect(JSON.stringify(body)).not.toContain("design-owner-secret-91");
    expect(await worldState()).toEqual(before);
  });

  it("ignores a design its client deleted: the stale head then answers", async () => {
    const { session } = await signedInAs({ role: "administrator" });
    await plantDraft(session.tokenHash, deleting(VENEER));
    prices.designs.plant({
      designId: "design-gone",
      uses: [VENEER],
      isDeletedByClient: true,
    });

    const answer = await publishDeletingVeneerWithStaleHead(session.cookie);

    expect(await jsonOf(answer)).toEqual({
      status: "availability-changed-meanwhile",
    });
  });
});
