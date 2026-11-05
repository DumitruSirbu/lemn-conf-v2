// The publish page's facts about the deletions its draft holds, over the dashboard's fake world: how many saved designs use
// each deleted row and the saved defaults, so that the page's judgement can block. A render writes nothing and spends
// nothing, and its counts are for display only.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  type ItemRef,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import {
  DashboardStoreError,
  type ItemUsageProbe,
} from "@lemnaria/persistence";

import { USAGE_READ_DEADLINE_MS } from "@/lib/server/price-dashboard/item-usage-read";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { judgePendingDeletions } from "@/price-dashboard/publish-deletions";
import { readPublishPage } from "@/price-dashboard/publish-source";

import {
  captureConsole,
  freshAccountWorld,
  limiterLedger,
  type AccountWorld,
} from "../../../support/account-world";
import { saveDefaults } from "../../../support/availability-route-world";
import { deleting, plantDraft } from "../../../support/planted-draft";
import {
  freshPriceDashboardWorld,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
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

const BOOK: PriceBook = {
  ...SAMPLE_PRICE_BOOK,
  linkedAccessories: [
    {
      accessoryId: "plinth-light",
      ruleId: "accessory.plinth-light",
      linkedBuildId: "base-3drawer",
      perUnitMinor: 1_000,
      name: "Soclu luminos",
    },
  ],
};
const VENEER: ItemRef = { kind: "material", tierId: "material.veneer" };
const PLINTH: ItemRef = { kind: "accessory", accessoryId: "plinth-light" };
const NOT_IN_THE_BOOK: ItemRef = { kind: "material", tierId: "material.gone" };

let accountWorld: AccountWorld;
let staffWorld: StaffWorld;
let prices: PriceDashboardWorld;
let tokenHash: string;

beforeEach(async () => {
  accountWorld = freshAccountWorld();
  staffWorld = freshStaffWorld();
  prices = await freshPriceDashboardWorld({ book: BOOK });
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  tokenHash = (await signedInAs({ role: "administrator" })).session.tokenHash;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function judgedOnThePage() {
  const read = await readPublishPage();
  if (read.kind !== "ready") throw new Error("the page was not ready");
  const { state, deletionFacts } = read.input;
  return {
    deletionFacts,
    judgement: judgePendingDeletions({
      book: state.active.book,
      changes: state.draft.changes,
      facts: deletionFacts,
    }),
  };
}

describe("the publish page over a draft that deletes a row", () => {
  it("blocks the publish as in use when a saved design names the row", async () => {
    await plantDraft(tokenHash, deleting(VENEER));
    prices.designs.plant({
      designId: "d-1",
      uses: [VENEER],
      isDeletedByClient: false,
    });

    const { judgement } = await judgedOnThePage();

    expect(judgement).toEqual({
      kind: "blocked",
      block: { kind: "in-use", items: [VENEER] },
    });
  });

  it("blocks the publish as the default when the saved defaults name the row", async () => {
    await plantDraft(tokenHash, deleting(VENEER));
    await saveDefaults({ tokenHash }, { materialTierId: VENEER.tierId });

    const { judgement } = await judgedOnThePage();

    expect(judgement).toEqual({
      kind: "blocked",
      block: { kind: "is-default", item: VENEER },
    });
  });

  it("allows the deletion of rows no saved design uses and no default names", async () => {
    await plantDraft(tokenHash, deleting(VENEER, PLINTH));

    const { judgement } = await judgedOnThePage();

    expect(judgement).toEqual({ kind: "none" });
  });

  it("asks only about the rows it deletes that the book states, and only in SQL", async () => {
    await plantDraft(tokenHash, deleting(VENEER, NOT_IN_THE_BOOK, PLINTH));
    const asked: ItemUsageProbe[][] = [];
    vi.spyOn(prices.defaults, "countEach").mockImplementation((probes) => {
      asked.push([...probes]);
      return Promise.resolve({
        counts: probes.map(({ item }) => ({ item, designCount: 0 })),
        unreadableDesigns: 0,
      });
    });

    await readPublishPage();

    expect(asked).toHaveLength(1);
    expect(asked[0]?.map(({ item, via }) => ({ item, via }))).toEqual([
      { item: VENEER, via: "settings-tier" },
      { item: PLINTH, via: "placed-bodies" },
    ]);
  });

  it("reads nothing for a draft that deletes nothing", async () => {
    const counting = vi.spyOn(prices.defaults, "countEach");
    const reading = vi.spyOn(prices.defaults, "read");

    const { deletionFacts } = await judgedOnThePage();

    expect(counting).not.toHaveBeenCalled();
    expect(reading).not.toHaveBeenCalled();
    expect(deletionFacts).toEqual({ usage: [], defaults: {} });
  });
});

describe("the publish page when the facts cannot be had", () => {
  async function expectDrawnButNotJudged(): Promise<void> {
    const { deletionFacts, judgement } = await judgedOnThePage();

    expect(deletionFacts).toBeUndefined();
    expect(judgement).toEqual({ kind: "cannot-judge" });
  }

  it("is drawn, and judges nothing, when the usage reader fails", async () => {
    await plantDraft(tokenHash, deleting(VENEER));
    vi.spyOn(prices.defaults, "countEach").mockRejectedValue(
      new DashboardStoreError(
        "count the kitchens using an item",
        "unavailable",
      ),
    );

    await expectDrawnButNotJudged();
  });

  it("is drawn, and judges nothing, when the saved defaults are not settings", async () => {
    await plantDraft(tokenHash, deleting(VENEER));
    await saveDefaults({ tokenHash }, {
      materialTierId: 7,
    } as unknown as Parameters<typeof saveDefaults>[1]);

    await expectDrawnButNotJudged();
  });

  it("is drawn, and judges nothing, when the count passes its deadline", async () => {
    await plantDraft(tokenHash, deleting(VENEER));
    vi.spyOn(prices.defaults, "countEach").mockReturnValue(
      new Promise(() => undefined),
    );
    vi.useFakeTimers();

    const read = judgedOnThePage();
    await vi.advanceTimersByTimeAsync(USAGE_READ_DEADLINE_MS);

    expect(await read).toMatchObject({
      deletionFacts: undefined,
      judgement: { kind: "cannot-judge" },
    });
  });
});

describe("the publish page over a draft that deletes a row", () => {
  it("leaves no audit row, touches no session and counts no limiter bucket", async () => {
    await plantDraft(tokenHash, deleting(VENEER, PLINTH));
    prices.designs.plant({
      designId: "d-1",
      uses: [VENEER],
      isDeletedByClient: false,
    });
    const rowsBefore = prices.ledger.heldEvents().length;
    const callsBefore = accountWorld.calls.length;
    const bucketsBefore = limiterLedger.counted.length;
    staffWorld.auditBehaviour = "reject";

    expect((await readPublishPage()).kind).toBe("ready");

    expect(staffWorld.audit.heldEvents()).toEqual([]);
    expect(prices.ledger.heldEvents()).toHaveLength(rowsBefore);
    expect(accountWorld.calls.slice(callsBefore)).toEqual([]);
    expect(limiterLedger.counted.slice(bucketsBefore)).toEqual([]);
  });
});
