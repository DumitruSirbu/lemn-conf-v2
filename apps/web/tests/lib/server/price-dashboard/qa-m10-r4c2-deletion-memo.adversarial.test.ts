import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  type ItemRef,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { DELETE, PUT } from "@/app/api/staff/prices/draft/route";
import {
  DELETION_FACTS_MEMO_TTL_MS,
  forgetRememberedDeletionFacts,
  readDeletionFactsOfPage,
  type DeletionMemoKey,
} from "@/lib/server/price-dashboard/deletion-facts";
import { USAGE_READ_DEADLINE_MS } from "@/lib/server/price-dashboard/item-usage-read";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";
import { readPublishPage } from "@/price-dashboard/publish-source";

import {
  freshAccountWorld,
  limiterLedger,
} from "../../../support/account-world";
import {
  putDefaults,
  saveBody,
} from "../../../support/kitchen-defaults-route-world";
import { deleting, plantDraft } from "../../../support/planted-draft";
import {
  changeRequest,
  revertRequest,
  currentDraftRevision,
} from "../../../support/price-dashboard-requests";
import {
  freshPriceDashboardWorld,
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
 * Adversarial QA of the publish page's count memo (R4c2, ruling 11), over the price world's stores: one latest entry, the
 * key's parts, the clock, what a failed or late read leaves, and what a page's figure does when the facts move without
 * moving a key (a design saved, a default saved).
 */

const BOOK: PriceBook = SAMPLE_PRICE_BOOK;
const VENEER: ItemRef = { kind: "material", tierId: "material.veneer" };
const PREMIUM: ItemRef = { kind: "hardware", tierId: "hardware.premium" };
const KEY: DeletionMemoKey = {
  draftRevision: "4",
  activeSequence: 2,
  availabilityRevision: "9",
};

let prices: PriceDashboardWorld;
let cookie: string;
let tokenHash: string;

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld({ book: BOOK });
  forgetRememberedDeletionFacts();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  const { session } = await signedInAs(
    { role: "administrator" },
    "administrator@example.test",
  );
  cookie = session.cookie;
  tokenHash = session.tokenHash;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function countsOfTheReader() {
  return vi.spyOn(prices.defaults, "countEach");
}

function renderAt(key: DeletionMemoKey) {
  return readDeletionFactsOfPage({
    book: BOOK,
    changes: deleting(VENEER),
    memoKey: key,
  });
}

function aDesignNaming(item: ItemRef): void {
  prices.designs.plant({
    designId: `design-of-${item.kind}`,
    uses: [item],
    isDeletedByClient: false,
  });
}

describe("the one latest entry", () => {
  it("costs a count for each of the keys A, B, A, since B took A's place", async () => {
    const counting = countsOfTheReader();
    const keyA = KEY;
    const keyB = { ...KEY, draftRevision: "5" };

    await renderAt(keyA);
    await renderAt(keyB);
    await renderAt(keyA);

    expect(counting).toHaveBeenCalledTimes(3);
  });

  it("costs one count for A, A, A and a count again for the first render at B", async () => {
    const counting = countsOfTheReader();

    for (let render = 0; render < 5; render += 1) await renderAt(KEY);
    await renderAt({ ...KEY, activeSequence: 3 });

    expect(counting).toHaveBeenCalledTimes(2);
  });

  it("is not made to hold the figures of a key by a render that asked another draft's rows at the same key's neighbour", async () => {
    const counting = countsOfTheReader();
    aDesignNaming(PREMIUM);

    const first = await readDeletionFactsOfPage({
      book: BOOK,
      changes: deleting(PREMIUM),
      memoKey: KEY,
    });
    const second = await readDeletionFactsOfPage({
      book: BOOK,
      changes: deleting(PREMIUM),
      memoKey: { ...KEY, draftRevision: "5" },
    });

    expect(counting).toHaveBeenCalledTimes(2);
    expect(second).toEqual(first);
  });
});

describe("the clock", () => {
  it("serves nothing past the TTL, at the millisecond it ends", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const counting = countsOfTheReader();
    await renderAt(KEY);

    vi.setSystemTime(Date.now() + DELETION_FACTS_MEMO_TTL_MS - 1);
    await renderAt(KEY);
    vi.setSystemTime(Date.now() + 1);
    await renderAt(KEY);

    expect(counting).toHaveBeenCalledTimes(2);
  });

  it("serves nothing after the clock is set back, however far: an entry read in the future is not a fresh one", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const counting = countsOfTheReader();
    await renderAt(KEY);

    vi.setSystemTime(Date.now() - 3_600_000);
    await renderAt(KEY);

    expect(counting).toHaveBeenCalledTimes(2);
  });
});

describe("a read that is not a whole answer leaves no entry, and leaves the entry that was", () => {
  it("is not kept when the saved defaults are not settings: the next render asks again", async () => {
    const counting = countsOfTheReader();
    const reading = vi.spyOn(prices.defaults, "read");
    reading.mockResolvedValueOnce({
      kind: "saved",
      saved: { revision: "3", defaults: { materialTierId: 7 } },
    } as never);

    await expect(renderAt(KEY)).rejects.toBeDefined();
    await renderAt(KEY);

    expect(counting).toHaveBeenCalledTimes(1);
    expect(reading).toHaveBeenCalledTimes(2);
  });

  it("does not replace a whole answer for the key it was read at when a later render at another key is late", async () => {
    const counting = countsOfTheReader();
    await renderAt(KEY);
    counting.mockReturnValueOnce(new Promise(() => undefined));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    const late = renderAt({ ...KEY, draftRevision: "5" });
    await vi.advanceTimersByTimeAsync(USAGE_READ_DEADLINE_MS);
    expect(await late).toBeUndefined();
    vi.useRealTimers();
    await renderAt(KEY);

    expect(counting).toHaveBeenCalledTimes(2);
  });
});

describe("a page that renders beside the draft route's deletion check", () => {
  async function deleteViaRoute(item: ItemRef): Promise<Response> {
    return PUT(
      changeRequest({
        cookie,
        json: {
          expectedDraftRevision: await currentDraftRevision(),
          change: {
            address: { kind: "item-deleted", item },
            value: true,
          },
        },
      }),
    );
  }

  it("does not feed the check: a page that remembered 0 does not make a used row deletable, and the check counts afresh", async () => {
    await plantDraft(tokenHash, deleting(PREMIUM));
    const page = await readPublishPage();
    expect(page.kind).toBe("ready");
    aDesignNaming(VENEER);
    const counting = countsOfTheReader();

    const answer = await deleteViaRoute(VENEER);

    expect(answer.status).toBe(400);
    expect(counting).toHaveBeenCalledTimes(1);
  });

  it("is not fed by the check: a deletion the route counted does not leave its figure for the page, which counts for itself", async () => {
    expect((await deleteViaRoute(VENEER)).status).toBe(200);
    aDesignNaming(VENEER);
    const counting = countsOfTheReader();

    const page = await readPublishPage();

    expect(page.kind).toBe("ready");
    expect(counting).toHaveBeenCalledTimes(1);
    if (page.kind !== "ready") return;
    expect(
      page.input.deletionFacts?.usage.map(({ designCount }) => designCount),
    ).toEqual([1]);
  });

  it("moves with the draft: a deletion made through the route is counted at the page's next render, a revert of it leaves nothing to count", async () => {
    const counting = countsOfTheReader();
    await readPublishPage();
    await deleteViaRoute(VENEER);
    counting.mockClear();

    const withDeletion = await readPublishPage();
    const callsForTheDeletion = counting.mock.calls.length;
    await DELETE(
      revertRequest({
        cookie,
        json: {
          expectedDraftRevision: await currentDraftRevision(),
          target: {
            kind: "change",
            address: { kind: "item-deleted", item: VENEER },
          },
        },
      }),
    );
    counting.mockClear();
    const afterTheRevert = await readPublishPage();

    expect(callsForTheDeletion).toBe(1);
    expect(counting).not.toHaveBeenCalled();
    expect(withDeletion.kind).toBe("ready");
    expect(afterTheRevert.kind).toBe("ready");
    if (withDeletion.kind !== "ready" || afterTheRevert.kind !== "ready") {
      return;
    }
    expect(withDeletion.input.deletionFacts?.usage).toHaveLength(1);
    expect(afterTheRevert.input.deletionFacts?.usage).toEqual([]);
  });

  it("only reads: a render of the page writes no audit row, moves no revision and spends no bucket", async () => {
    await plantDraft(tokenHash, deleting(VENEER));
    const before = {
      rows: prices.ledger.heldEvents().length,
      draft: await prices.stores.priceBook.readDraft(),
      availability: (await prices.stores.availability.readCurrent()).revision,
      buckets: limiterLedger.counted.length,
    };

    await readPublishPage();
    await readPublishPage();

    expect(prices.ledger.heldEvents()).toHaveLength(before.rows);
    expect(await prices.stores.priceBook.readDraft()).toEqual(before.draft);
    expect((await prices.stores.availability.readCurrent()).revision).toBe(
      before.availability,
    );
    expect(limiterLedger.counted).toHaveLength(before.buckets);
  });

  it("is a figure that may be a TTL old when a design is saved without moving a key (accepted by ruling 11), which the check and publish do not share", async () => {
    await plantDraft(tokenHash, deleting(VENEER));
    const first = await readPublishPage();
    aDesignNaming(VENEER);

    const second = await readPublishPage();

    expect(first.kind).toBe("ready");
    expect(second.kind).toBe("ready");
    if (first.kind !== "ready" || second.kind !== "ready") return;
    expect(second.input.deletionFacts).toEqual(first.input.deletionFacts);
    expect(
      second.input.deletionFacts?.usage.map(({ designCount }) => designCount),
    ).toEqual([0]);
  });

  it("follows a saved default naming the deleted row, since saving the defaults moves a key the page is read at", async () => {
    await plantDraft(tokenHash, deleting(PREMIUM));
    const first = await readPublishPage();
    const saved = await putDefaults({
      cookie,
      json: await saveBody({ hardwareTierId: PREMIUM.tierId }),
    });
    expect(saved.status).toBe(200);

    const second = await readPublishPage();

    expect(first.kind).toBe("ready");
    expect(second.kind).toBe("ready");
    if (second.kind !== "ready") return;
    expect(second.input.deletionFacts?.defaults).toMatchObject({
      hardwareTierId: PREMIUM.tierId,
    });
  });
});
