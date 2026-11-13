import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  applyChanges,
  type DraftChange,
  type ItemRef,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { PUT } from "@/app/api/staff/prices/draft/route";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  captureConsole,
  freshAccountWorld,
  jsonOf,
} from "../../../support/account-world";
import {
  CLASS_WORDS,
  createClassAs,
  ratesOf,
  revertAs,
  storedChangesOf,
} from "../../../support/creation-world";
import {
  putDefaults,
  saveBody,
} from "../../../support/kitchen-defaults-route-world";
import { deleting, plantDraft } from "../../../support/planted-draft";
import {
  changeRequest,
  currentDraftRevision,
  publishBody,
  publishDraft,
} from "../../../support/price-dashboard-requests";
import {
  freshPriceDashboardWorld,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import { freshStaffWorld, signedInAs } from "../../../support/staff-world";
import { linkedAccessory } from "../../../support/wide-price-book";

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
 * Adversarial QA of R4c2's races and of what a deletion does to a draft over time: two deletions at once, a design saved
 * or a default saved between the count and the write (the check-then-write residual, which publish's guard still
 * closes), a publish landing while a count is in flight, the 20-class cap, and the audit row of each write.
 */

const BOOK: PriceBook = {
  ...SAMPLE_PRICE_BOOK,
  linkedAccessories: [linkedAccessory("plinth-light")],
};
const VENEER: ItemRef = { kind: "material", tierId: "material.veneer" };
const PAINTED: ItemRef = { kind: "material", tierId: "material.painted-mdf" };
const PREMIUM: ItemRef = { kind: "hardware", tierId: "hardware.premium" };
const SOFT_CLOSE: ItemRef = { kind: "hardware", tierId: "hardware.soft-close" };
const PLINTH: ItemRef = { kind: "accessory", accessoryId: "plinth-light" };

let prices: PriceDashboardWorld;
let cookie: string;
let tokenHash: string;
let designCount = 0;

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld({ book: BOOK });
  captureConsole();
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

function deletion(item: ItemRef) {
  return { address: { kind: "item-deleted", item }, value: true };
}

async function deleteRow(item: ItemRef, revision?: string): Promise<Response> {
  return PUT(
    changeRequest({
      cookie,
      json: {
        expectedDraftRevision: revision ?? (await currentDraftRevision()),
        change: deletion(item),
      },
    }),
  );
}

function aDesignNaming(item: ItemRef): void {
  designCount += 1;
  prices.designs.plant({
    designId: `design-${String(designCount)}`,
    uses: [item],
    isDeletedByClient: false,
  });
}

function auditRowsOf(action: string) {
  return prices.ledger.heldEvents().filter((row) => row.action === action);
}

async function draftChanges(): Promise<readonly DraftChange[]> {
  const { changes } = await prices.stores.priceBook.readDraft();
  return changes as readonly DraftChange[];
}

async function versionsHeld(): Promise<number> {
  return (await prices.stores.priceBook.listVersions({ page: 1 })).total;
}

/** A count that waits for `release`, then answers what `answerAt` decides at that moment. */
function countHeldUntilReleased(answerAt: (item: ItemRef) => number = () => 0) {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const spy = vi
    .spyOn(prices.defaults, "countEach")
    .mockImplementationOnce(async (asked) => {
      await gate;
      return {
        counts: asked.map(({ item }) => ({
          item,
          designCount: answerAt(item),
        })),
        unreadableDesigns: 0,
      };
    });
  return { release, spy };
}

async function untilAsked(spy: { mock: { calls: unknown[] } }) {
  for (
    let turns = 0;
    turns < 2_000 && spy.mock.calls.length === 0;
    turns += 1
  ) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
  expect(spy.mock.calls.length).toBeGreaterThan(0);
}

describe("two deletions at the same revision", () => {
  it("of the same row: one is stored, the other is 409 changed-meanwhile, and one audit row names it", async () => {
    const revision = await currentDraftRevision();
    const rowsBefore = auditRowsOf("price-draft-changed").length;

    const answers = await Promise.all([
      deleteRow(VENEER, revision),
      deleteRow(VENEER, revision),
    ]);

    expect(answers.map(({ status }) => status).sort()).toEqual([200, 409]);
    const refused = answers.find(({ status }) => status === 409);
    expect(await jsonOf(refused ?? answers[0])).toEqual({
      status: "changed-meanwhile",
    });
    expect(await draftChanges()).toEqual(deleting(VENEER));
    expect(auditRowsOf("price-draft-changed")).toHaveLength(rowsBefore + 1);
  });

  it("of two rows: the draft holds exactly one of them, never both and never neither, and one row is audited", async () => {
    const revision = await currentDraftRevision();
    const rowsBefore = auditRowsOf("price-draft-changed").length;

    const answers = await Promise.all([
      deleteRow(PREMIUM, revision),
      deleteRow(PAINTED, revision),
    ]);

    expect(answers.map(({ status }) => status).sort()).toEqual([200, 409]);
    const held = await draftChanges();
    expect(held).toHaveLength(1);
    expect([deleting(PREMIUM), deleting(PAINTED)]).toContainEqual(held);
    expect(auditRowsOf("price-draft-changed")).toHaveLength(rowsBefore + 1);
  });
});

describe("a design saved after the count and before the write (the check-then-write residual)", () => {
  it("is stored (200): the route cannot see a design saved after its count, and that is the recorded residual", async () => {
    const { release, spy } = countHeldUntilReleased();

    const answering = deleteRow(VENEER);
    await untilAsked(spy);
    aDesignNaming(VENEER);
    release();
    const answer = await answering;

    expect(answer.status).toBe(200);
    expect(await draftChanges()).toEqual(deleting(VENEER));
  });

  it("is still refused by publish: item-in-use naming the row, nothing published, the draft kept", async () => {
    const { release, spy } = countHeldUntilReleased();
    const answering = deleteRow(VENEER);
    await untilAsked(spy);
    aDesignNaming(VENEER);
    release();
    await answering;
    const storeAsked = vi.spyOn(prices.stores.priceBook, "publish");
    const versions = await versionsHeld();

    const answer = await publishDraft({ cookie, json: await publishBody() });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({
      status: "item-in-use",
      items: [VENEER],
    });
    expect(storeAsked).not.toHaveBeenCalled();
    expect(await versionsHeld()).toBe(versions);
    expect(await draftChanges()).toEqual(deleting(VENEER));
  });

  it("is refused by the store's own guard when the publish's count had answered 0 as well (the third arm)", async () => {
    const { release, spy } = countHeldUntilReleased();
    const answering = deleteRow(VENEER);
    await untilAsked(spy);
    aDesignNaming(VENEER);
    release();
    await answering;
    vi.spyOn(prices.defaults, "countEach").mockImplementation((asked) =>
      Promise.resolve({
        counts: asked.map(({ item }) => ({ item, designCount: 0 })),
        unreadableDesigns: 0,
      }),
    );
    const versions = await versionsHeld();

    const answer = await publishDraft({ cookie, json: await publishBody() });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({
      status: "item-in-use",
      items: [VENEER],
    });
    expect(await versionsHeld()).toBe(versions);
  });

  it("is seen by a count that reads the designs when it answers, so the window is the reader's own snapshot only", async () => {
    const { release, spy } = countHeldUntilReleased((item) =>
      item.kind === "material" ? 1 : 0,
    );

    const answering = deleteRow(VENEER);
    await untilAsked(spy);
    release();
    const answer = await answering;

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "change", code: "ITEM_IN_USE" }],
    });
    expect(await draftChanges()).toEqual([]);
  });

  it("is not a design a repeat of the same deletion lets through: the repeat counts again, 400, and the first deletion stays", async () => {
    expect((await deleteRow(VENEER)).status).toBe(200);
    aDesignNaming(VENEER);

    const answer = await deleteRow(VENEER);

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "change", code: "ITEM_IN_USE" }],
    });
    expect(await draftChanges()).toEqual(deleting(VENEER));
  });
});

describe("a default saved after the count and before the write", () => {
  it("is stored (200) as the residual, and publish refuses it as item-is-default with nothing published", async () => {
    const { release, spy } = countHeldUntilReleased();
    const answering = deleteRow(PREMIUM);
    await untilAsked(spy);
    const saved = await putDefaults({
      cookie,
      json: await saveBody({ hardwareTierId: PREMIUM.tierId }),
    });
    expect(saved.status).toBe(200);
    release();
    const answer = await answering;
    const versions = await versionsHeld();

    const published = await publishDraft({ cookie, json: await publishBody() });

    expect(answer.status).toBe(200);
    expect(published.status).toBe(409);
    expect(await jsonOf(published)).toEqual({
      status: "item-is-default",
      item: PREMIUM,
    });
    expect(await versionsHeld()).toBe(versions);
  });
});

describe("a publish that lands while the count is in flight", () => {
  it("makes the deletion 409 changed-meanwhile, writes nothing and leaves the published draft empty", async () => {
    await plantDraft(tokenHash, deleting(PREMIUM));
    const revision = await currentDraftRevision();
    const { release, spy } = countHeldUntilReleased();
    const answering = deleteRow(VENEER, revision);
    await untilAsked(spy);

    const published = await publishDraft({ cookie, json: await publishBody() });
    release();
    const answer = await answering;

    expect(published.status).toBe(200);
    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "changed-meanwhile" });
    expect(await draftChanges()).toEqual([]);
    expect(auditRowsOf("price-draft-changed")).toHaveLength(1);
  });

  it("is a deletion that lands first: the publish the page built before it is 409 changed-meanwhile and publishes nothing", async () => {
    await plantDraft(tokenHash, deleting(PREMIUM));
    const body = await publishBody();
    const versions = await versionsHeld();

    const deleted = await deleteRow(VENEER);
    const published = await publishDraft({ cookie, json: body });

    expect(deleted.status).toBe(200);
    expect(published.status).toBe(409);
    expect(await jsonOf(published)).toEqual({ status: "changed-meanwhile" });
    expect(await versionsHeld()).toBe(versions);
    expect(await draftChanges()).toEqual(deleting(PREMIUM, VENEER));
  });
});

describe("a deletion beside the 20-class cap", () => {
  const MOST_CLASSES = 20;

  function createdClass(index: number): DraftChange[] {
    const tierId = `createdclass${String(index)}`;
    return [
      {
        address: { kind: "hardware-tier-created", tierId },
        value: CLASS_WORDS,
      } as unknown as DraftChange,
      ...Object.entries(ratesOf(2_000)).map(
        ([field, value]) =>
          ({
            address: { kind: "hardware", tierId, field },
            value,
          }) as unknown as DraftChange,
      ),
    ];
  }

  it("takes a deletion at the cap, lets a class be made in its place, and refuses to take the deletion back past it, with the draft untouched", async () => {
    const kept = BOOK.hardware.tiers.length;
    const created = Array.from({ length: MOST_CLASSES - kept }, (_, index) =>
      createdClass(index),
    ).flat();
    await plantDraft(tokenHash, created);
    expect(applyChanges(BOOK, created).ok).toBe(true);

    const deleted = await deleteRow(PREMIUM);
    const made = await createClassAs(cookie);
    const heldBefore = await prices.stores.priceBook.readDraft();
    const rowsBefore = auditRowsOf("price-draft-reverted").length;
    const taken = await revertAs(cookie, {
      kind: "change",
      address: { kind: "item-deleted", item: PREMIUM },
    });

    expect([deleted.status, made.status]).toEqual([200, 200]);
    expect({ status: taken.status, body: await jsonOf(taken) }).toEqual({
      status: 409,
      body: { status: "candidate-refused" },
    });
    expect(await prices.stores.priceBook.readDraft()).toEqual(heldBefore);
    expect(auditRowsOf("price-draft-reverted")).toHaveLength(rowsBefore);
  });

  it("takes the deletion back once the class made in its place is taken back", async () => {
    const kept = BOOK.hardware.tiers.length;
    await plantDraft(
      tokenHash,
      Array.from({ length: MOST_CLASSES - kept }, (_, index) =>
        createdClass(index),
      ).flat(),
    );
    await deleteRow(PREMIUM);
    const made = await createClassAs(cookie);
    const { created } = (await jsonOf(made)) as { created: ItemRef };

    const first = await revertAs(cookie, {
      kind: "change",
      address: {
        kind: "hardware-tier-created",
        tierId: (created as { tierId: string }).tierId,
      },
    });
    const second = await revertAs(cookie, {
      kind: "change",
      address: { kind: "item-deleted", item: PREMIUM },
    });

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(
      (await storedChangesOf(prices)).some(
        ({ address }) => address.kind === "item-deleted",
      ),
    ).toBe(false);
  });
});

describe("a draft that deletes a book row and re-creates its id (planted: creation mints its own ids)", () => {
  const RECREATED: DraftChange[] = [
    {
      address: { kind: "hardware-tier-created", tierId: PREMIUM.tierId },
      value: CLASS_WORDS,
    } as unknown as DraftChange,
    ...Object.entries(ratesOf(2_000)).map(
      ([field, value]) =>
        ({
          address: { kind: "hardware", tierId: PREMIUM.tierId, field },
          value,
        }) as unknown as DraftChange,
    ),
  ];

  it("is no book, and publish refuses it as candidate-refused with nothing published", async () => {
    await plantDraft(tokenHash, [...deleting(PREMIUM), ...RECREATED]);
    expect(applyChanges(BOOK, [...deleting(PREMIUM), ...RECREATED]).ok).toBe(
      false,
    );
    const versions = await versionsHeld();

    const answer = await publishDraft({ cookie, json: await publishBody() });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toMatchObject({ status: "candidate-refused" });
    expect(await versionsHeld()).toBe(versions);
  });

  it("does not make the row one the draft created: a creation of the book's own id leaves the count in force, so a used row is still refused", async () => {
    await plantDraft(tokenHash, RECREATED);
    aDesignNaming(PREMIUM);
    const before = await prices.stores.priceBook.readDraft();

    const answer = await deleteRow(PREMIUM);

    expect(answer.status).toBe(400);
    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "change", code: "ITEM_IN_USE" }],
    });
    expect(await prices.stores.priceBook.readDraft()).toEqual(before);
  });

  it("is a stale creation the route tolerates beside a further deletion (the draft already refused it), which publish then refuses", async () => {
    await plantDraft(tokenHash, RECREATED);

    const answer = await deleteRow(PREMIUM);
    const published = await publishDraft({ cookie, json: await publishBody() });

    expect(answer.status).toBe(200);
    expect(published.status).toBe(409);
    expect(await jsonOf(published)).toMatchObject({
      status: "candidate-refused",
    });
  });
});

describe("every row a book can lose", () => {
  const ALL_DELETABLE = [PAINTED, VENEER, PREMIUM, SOFT_CLOSE, PLINTH];

  it("is deleted one after the other, the draft applying at each step, until only the fixed defaults are left, which are then refused", async () => {
    for (const item of ALL_DELETABLE) {
      const answer = await deleteRow(item);
      expect(answer.status, JSON.stringify(item)).toBe(200);
      expect(applyChanges(BOOK, await draftChanges()).ok).toBe(true);
    }
    const candidate = applyChanges(BOOK, await draftChanges());
    if (!candidate.ok) throw new Error("the draft no longer applies");
    expect(candidate.book.linkedAccessories).toEqual([]);
    expect(candidate.book.material.tiers.map(({ tierId }) => tierId)).toEqual([
      BOOK.material.defaultTierId,
    ]);
    expect(candidate.book.hardware.tiers.map(({ tierId }) => tierId)).toEqual([
      BOOK.hardware.defaultTierId,
    ]);

    for (const fixed of [
      { kind: "material", tierId: BOOK.material.defaultTierId },
      { kind: "hardware", tierId: BOOK.hardware.defaultTierId },
    ] as const) {
      const answer = await deleteRow(fixed);
      expect(answer.status).toBe(400);
      expect(await jsonOf(answer)).toEqual({
        status: "invalid-input",
        issues: [{ field: "change", code: "ITEM_IS_DEFAULT" }],
      });
    }
  });

  it("is published away when all of it is unused, leaving a book that reads", async () => {
    for (const item of ALL_DELETABLE) await deleteRow(item);

    const answer = await publishDraft({ cookie, json: await publishBody() });

    expect(answer.status).toBe(200);
  });
});

describe("what counts as using a row", () => {
  it("is not a design its client deleted, and is a design that is still kept, however many of the first there are", async () => {
    for (let index = 0; index < 5; index += 1) {
      prices.designs.plant({
        designId: `gone-${String(index)}`,
        uses: [VENEER],
        isDeletedByClient: true,
      });
    }
    const allowed = await deleteRow(VENEER);
    prices.designs.plant({
      designId: "kept",
      uses: [VENEER],
      isDeletedByClient: false,
    });
    const refused = await deleteRow(VENEER);

    expect(allowed.status).toBe(200);
    expect(refused.status).toBe(400);
  });

  it("is a design the product cannot open when it names a tier or a linked accessory, read as written", async () => {
    prices.designs.plant({
      designId: "unreadable-1",
      uses: [PREMIUM, PLINTH, PAINTED],
      isDeletedByClient: false,
      isUnreadable: true,
    });

    const answers = await Promise.all(
      [PREMIUM, PLINTH, PAINTED].map((item) => deleteRow(item)),
    );

    expect(answers.filter(({ status }) => status === 400)).toHaveLength(
      answers.filter(({ status }) => status !== 409).length,
    );
    for (const item of [PREMIUM, PLINTH, PAINTED]) {
      const answer = await deleteRow(item);
      expect(answer.status, JSON.stringify(item)).toBe(400);
    }
  });

  it("is a design using another row not at all: an unused row is deleted whatever else is in use", async () => {
    aDesignNaming(PREMIUM);
    aDesignNaming(PAINTED);
    aDesignNaming(PLINTH);

    const answer = await deleteRow(VENEER);

    expect(answer.status).toBe(200);
  });
});

describe("the audit rows of the draft writes", () => {
  it("is one price-draft-changed row per accepted deletion and one price-draft-reverted row per revert, none for any refusal", async () => {
    aDesignNaming(PAINTED);
    const start = prices.ledger.heldEvents().length;

    const accepted = [await deleteRow(VENEER), await deleteRow(PREMIUM)];
    const refused = [
      await deleteRow(PAINTED),
      await deleteRow({ kind: "hardware", tierId: "hardware.ghost" }),
      await deleteRow({
        kind: "material",
        tierId: BOOK.material.defaultTierId,
      }),
    ];
    const afterDeletions = prices.ledger.heldEvents().length;
    const reverted = await revertAs(cookie, {
      kind: "change",
      address: { kind: "item-deleted", item: VENEER },
    });
    const unknownRevert = await revertAs(cookie, {
      kind: "change",
      address: { kind: "item-deleted", item: VENEER },
    });

    expect(accepted.map(({ status }) => status)).toEqual([200, 200]);
    expect(refused.map(({ status }) => status)).toEqual([400, 400, 400]);
    expect(afterDeletions - start).toBe(2);
    expect(reverted.status).toBe(200);
    expect(unknownRevert.status).toBe(400);
    expect(prices.ledger.heldEvents().length - afterDeletions).toBe(1);
    const detailOfLast = prices.ledger.heldEvents().at(-1);
    expect(detailOfLast?.action).toBe("price-draft-reverted");
  });

  it("is staged in the write's own transaction: a draft that is not written leaves no row, and a row that is not staged leaves no draft", async () => {
    const before = {
      draft: await prices.stores.priceBook.readDraft(),
      rows: prices.ledger.heldEvents().length,
    };
    vi.spyOn(prices.stores.priceBook, "writeDraft").mockRejectedValueOnce(
      new Error("driver down"),
    );

    const answer = await deleteRow(VENEER);

    expect(answer.status).toBe(503);
    expect(prices.ledger.heldEvents()).toHaveLength(before.rows);
    expect(await prices.stores.priceBook.readDraft()).toEqual(before.draft);
  });
});
