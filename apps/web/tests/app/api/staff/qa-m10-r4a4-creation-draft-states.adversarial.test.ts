import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HARDWARE_RATE_FIELDS,
  SAMPLE_PRICE_BOOK,
  applyChanges,
  type DraftChange,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import type * as CreatedIdsModule from "@/lib/server/price-dashboard/created-ids";

import { jsonOf } from "../../../support/account-world";
import {
  ACCESSORY_VALUE,
  CLASS_WORDS,
  createAccessoryAs,
  createClassAs,
  mintedIdOf,
  plantDraft,
  putChangeAs,
  ratesOf,
  revertAs,
  startCreationWorld,
  storedChangesOf,
  type CreationWorld,
} from "../../../support/creation-world";
import {
  publishBody,
  publishDraft,
} from "../../../support/price-dashboard-requests";

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
vi.mock("@/lib/server/price-dashboard/created-ids", async (original) => {
  const real = await original<typeof CreatedIdsModule>();
  return { ...real, mintCreatedId: vi.fn(real.mintCreatedId) };
});

const created = await import("@/lib/server/price-dashboard/created-ids");
const realMint = (
  await vi.importActual<typeof CreatedIdsModule>(
    "@/lib/server/price-dashboard/created-ids",
  )
).mintCreatedId;

// A creation against drafts and books that are not the ordinary one: a draft the book no longer makes, a book from before
// linked accessories, a draft holding a deletion, and ids that differ from a held one only in their case.

let world: CreationWorld;

beforeEach(async () => {
  world = await startCreationWorld(SAMPLE_PRICE_BOOK);
  vi.mocked(created.mintCreatedId).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const STALE: DraftChange = {
  address: { kind: "cabinet", ruleId: "cabinet.gone", field: "anchorMinor" },
  value: 5_000,
} as DraftChange;

const SOFT_CLOSE = { kind: "hardware", tierId: "hardware.soft-close" } as const;
const DELETES_SOFT_CLOSE = {
  address: { kind: "item-deleted", item: SOFT_CLOSE },
  value: true,
} as DraftChange;

function drawing(first: Uint8Array, ...later: readonly Uint8Array[]): void {
  const draws = [first, ...later];
  let next = 0;
  vi.mocked(created.mintCreatedId).mockImplementationOnce((taken) =>
    realMint(taken, () => draws[Math.min(next++, draws.length - 1)] ?? first),
  );
}

const aDrawOf = (start: number): Uint8Array =>
  Uint8Array.from({ length: 21 }, (_, offset) => start + offset);
const idDrawnFrom = (draw: Uint8Array): string =>
  realMint(new Set(), () => draw);

describe("a creation on a draft the book no longer makes", () => {
  it("writes nothing for an accessory: the link cannot be judged without a candidate, so it is 409 candidate-refused", async () => {
    await plantDraft(world, [STALE]);

    const answer = await createAccessoryAs(world.cookie);

    expect({ status: answer.status, body: await jsonOf(answer) }).toEqual({
      status: 409,
      body: { status: "candidate-refused" },
    });
    expect(await storedChangesOf(world.prices)).toEqual([STALE]);
  });

  it("goes through for a class, which the domain judges change by change and leaves the stale change where it stood", async () => {
    await plantDraft(world, [STALE]);

    const answer = await createClassAs(world.cookie);

    expect(answer.status).toBe(200);
    const [first, second] = await storedChangesOf(world.prices);
    expect(first).toEqual(STALE);
    expect(second?.address.kind).toBe("hardware-tier-created");
  });

  it("cannot be published afterwards, so a class made beside a stale change does not reach a customer", async () => {
    await plantDraft(world, [STALE]);
    await createClassAs(world.cookie);
    const versionsBefore = (
      await world.prices.stores.priceBook.listVersions({ page: 1 })
    ).total;

    const answer = await publishDraft({
      cookie: world.cookie,
      json: await publishBody(),
    });

    expect(answer.status).not.toBe(200);
    expect(
      (await world.prices.stores.priceBook.listVersions({ page: 1 })).total,
    ).toBe(versionsBefore);
  });

  it("is refused ZERO, not blamed on the stale change, when a class with a zero push-runner rate is made beside one", async () => {
    await plantDraft(world, [STALE]);

    const answer = await createClassAs(world.cookie, {
      rates: {
        ...Object.fromEntries(HARDWARE_RATE_FIELDS.map((f) => [f, 1])),
        perPushRunnerMinor: 0,
      },
    });

    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "change", code: "ZERO" }],
    });
  });

  it("lets the stale change be taken back after the class was made beside it, and the class stays whole", async () => {
    await plantDraft(world, [STALE]);
    await createClassAs(world.cookie);

    const answer = await revertAs(world.cookie, {
      kind: "change",
      address: STALE.address,
    });

    expect(answer.status).toBe(200);
    const changes = await storedChangesOf(world.prices);
    expect(applyChanges(SAMPLE_PRICE_BOOK, changes).ok).toBe(true);
    expect(changes).toHaveLength(1 + HARDWARE_RATE_FIELDS.length);
  });
});

describe("a deletion, which no route of this build writes", () => {
  it("is refused by the change route as NOT_EDITABLE, before and after a creation", async () => {
    const before = await putChangeAs(world.cookie, DELETES_SOFT_CLOSE);
    await createClassAs(world.cookie);
    const after = await putChangeAs(world.cookie, DELETES_SOFT_CLOSE);

    for (const answer of [before, after]) {
      expect({ status: answer.status, body: await jsonOf(answer) }).toEqual({
        status: 400,
        body: {
          status: "invalid-input",
          issues: [{ field: "address", code: "NOT_EDITABLE" }],
        },
      });
    }
    expect(
      (await storedChangesOf(world.prices)).some(
        ({ address }) => address.kind === "item-deleted",
      ),
    ).toBe(false);
  });

  it("is refused by the change route for a row the draft created, so a created row cannot be deleted through the draft either", async () => {
    const tierId = await mintedIdOf(await createClassAs(world.cookie));

    const answer = await putChangeAs(world.cookie, {
      address: {
        kind: "item-deleted",
        item: { kind: "hardware", tierId },
      },
      value: true,
    });

    expect(answer.status).toBe(400);
  });

  it("is refused by the revert route as NOT_EDITABLE when named as the target", async () => {
    await plantDraft(world, [DELETES_SOFT_CLOSE]);

    const answer = await revertAs(world.cookie, {
      kind: "change",
      address: DELETES_SOFT_CLOSE.address,
    });

    expect({ status: answer.status, body: await jsonOf(answer) }).toEqual({
      status: 400,
      body: {
        status: "invalid-input",
        issues: [{ field: "address", code: "NOT_EDITABLE" }],
      },
    });
    expect(await storedChangesOf(world.prices)).toEqual([DELETES_SOFT_CLOSE]);
  });

  it("is not written by either creation route whatever the value names", async () => {
    await createClassAs(world.cookie);
    await createAccessoryAs(world.cookie);

    expect(
      (await storedChangesOf(world.prices)).some(
        ({ address }) => address.kind === "item-deleted",
      ),
    ).toBe(false);
  });
});

describe("ids that differ from a held id only in their case", () => {
  it("is made when the draw differs from a held id in case alone, since ids are compared as they are written", async () => {
    const drawn = idDrawnFrom(aDrawOf(0));
    const held = drawn.toLowerCase();
    expect(held).not.toBe(drawn);
    const [firstTier] = SAMPLE_PRICE_BOOK.hardware.tiers;
    if (firstTier === undefined) throw new Error("the book has no class");
    const bookHoldingTheLowerCase: PriceBook = {
      ...SAMPLE_PRICE_BOOK,
      hardware: {
        ...SAMPLE_PRICE_BOOK.hardware,
        tiers: [
          ...SAMPLE_PRICE_BOOK.hardware.tiers,
          { ...firstTier, tierId: held, ruleId: held },
        ],
      },
    };
    world = await startCreationWorld(bookHoldingTheLowerCase);
    drawing(aDrawOf(0));

    const answer = await createClassAs(world.cookie);

    expect(answer.status).toBe(200);
    expect(await mintedIdOf(answer)).toBe(drawn);
    const made = applyChanges(
      bookHoldingTheLowerCase,
      await storedChangesOf(world.prices),
    );
    expect(
      made.ok && made.book.hardware.tiers.map((tier) => tier.tierId),
    ).toEqual(expect.arrayContaining([held, drawn]));
  });
});

describe("two creations with the same words", () => {
  it("get different ids, neither derived from the words", async () => {
    const first = await mintedIdOf(await createClassAs(world.cookie));
    const second = await mintedIdOf(await createClassAs(world.cookie));
    const accessory = await mintedIdOf(
      await createAccessoryAs(world.cookie, {
        value: { ...ACCESSORY_VALUE, name: CLASS_WORDS.name },
      }),
    );

    expect(new Set([first, second, accessory]).size).toBe(3);
    for (const id of [first, second, accessory]) {
      expect(id.toLowerCase()).not.toContain("gtv");
      expect(id.toLowerCase()).not.toContain("economic");
    }
  });
});

describe("a rate for a mechanism the active book's classes do not state", () => {
  function withoutHingeRate(): PriceBook {
    const strip = <Tier extends object>(tier: Tier): Tier =>
      Object.fromEntries(
        Object.entries(tier).filter(([member]) => member !== "perHingeMinor"),
      ) as Tier;
    return {
      ...SAMPLE_PRICE_BOOK,
      hardware: {
        ...SAMPLE_PRICE_BOOK.hardware,
        tiers: SAMPLE_PRICE_BOOK.hardware.tiers.map(strip),
      },
    };
  }

  it("is dropped without being judged, so a hostile amount for it still makes a class (a client cannot tell it was ignored)", async () => {
    world = await startCreationWorld(withoutHingeRate());

    const answer = await createClassAs(world.cookie, {
      rates: { ...ratesOf(2_000), perHingeMinor: -1 },
    });

    expect(answer.status).toBe(200);
    const stored = await storedChangesOf(world.prices);
    expect(
      stored.some(
        ({ address }) =>
          "field" in address && address.field === "perHingeMinor",
      ),
    ).toBe(false);
  });
});
