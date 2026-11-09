import {
  KITCHEN_L_DESIGN,
  SAMPLE_PRICE_BOOK,
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  pricesChangedBetween,
  type CatalogueAvailability,
  type ItemRef,
  type LinkedAccessoryRule,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import { DashboardStoreError } from "@lemnaria/persistence";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { pricesChangedFor, type Kitchen } from "@/lib/server/price-notice";
import { shippedDeepeningRows } from "@/price/deepening-rows";

import {
  freshAccountWorld,
  jsonOf,
  limiterLedger,
} from "../../../support/account-world";
import {
  administrator,
  publishNextVersion,
  writeWithoutJudgement,
  type Administrator,
} from "../../../support/availability-route-world";
import {
  freshPriceDashboardWorld,
  type PriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import {
  NOTICE_DESIGN_ID,
  OWNER_WRITE_COOKIE,
  OWNER_WRITE_TOKEN_HASH,
  freshEditableDesigns,
  makePriceStoresReject,
  type StubEditableDesigns,
} from "../../../support/price-notice-stubs";
import { acknowledge, readNotice } from "../../../support/price-notice-world";

/** The notice judgement over the seeded world, one test per row of its table. */

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/price-stores", () =>
  import("../../../support/price-notice-stubs").then((world) =>
    world.rejectablePriceStoresModule(),
  ),
);
vi.mock("@/lib/server/repository", () =>
  import("../../../support/price-notice-stubs").then((world) =>
    world.editableRepositoryModule(),
  ),
);

interface Notice {
  readonly kind: string;
  readonly isSent: boolean;
  readonly current: { versionId: string; availabilityRevision: string };
  readonly pricesChanged: boolean;
  readonly replacementsRequired: readonly {
    item: ItemRef;
    remaining: ItemRef[];
  }[];
  readonly removedAccessories: readonly {
    accessoryId: string;
    authoredName?: string;
  }[];
}

const DEFAULT_MATERIAL: ItemRef = {
  kind: "material",
  tierId: SAMPLE_PRICE_BOOK.material.defaultTierId,
};
const DISH_RACK: ItemRef = { kind: "accessory", accessoryId: "dishDryingRack" };

let priceWorld: PriceDashboardWorld;
let editable: StubEditableDesigns;
let staff: Administrator;

async function startWorld(book: PriceBook = SAMPLE_PRICE_BOOK): Promise<void> {
  freshAccountWorld();
  limiterLedger.subjects.push({
    kind: "write-credential",
    subject: OWNER_WRITE_TOKEN_HASH,
  });
  priceWorld = await freshPriceDashboardWorld({ book });
  editable = freshEditableDesigns();
  makePriceStoresReject(undefined);
  staff = await administrator();
}

beforeEach(async () => {
  await startWorld();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function open(): Promise<Notice> {
  const answer = await readNotice({ cookie: OWNER_WRITE_COOKIE });
  expect(answer.status).toBe(200);
  return (await answer.json()) as Notice;
}

function marker() {
  return priceWorld.stores.notices.readAcknowledged(NOTICE_DESIGN_ID);
}

async function headNow(): Promise<string> {
  return (await priceWorld.stores.availability.readCurrent()).revision;
}

async function pairNow() {
  return {
    versionId: await versionNow(),
    availabilityRevision: await headNow(),
  };
}

async function versionNow(): Promise<string> {
  const active = await priceWorld.stores.priceBook.readActive();
  if (active.kind !== "found") throw new Error("no active version");
  return active.version.versionId;
}

async function publish(book: PriceBook): Promise<string> {
  const published = await publishNextVersion(staff, book);
  if (published.kind !== "ok") throw new Error("the next version was refused");
  return published.versionId;
}

async function switchOff(...items: readonly ItemRef[]): Promise<void> {
  for (const item of items) await writeWithoutJudgement(staff, item, false);
}

/** The `[price-notice]` lines written since the spy was made. */
function noticeLines(): readonly unknown[] {
  const written: readonly unknown[][] = vi.mocked(console.error).mock.calls;
  return written
    .filter(([label]) => label === "[price-notice]")
    .map(([, line]): unknown => line);
}

/** The same book with every hinge dearer: a price that moves with no change to availability. */
function dearerHinges(book: PriceBook): PriceBook {
  return {
    ...book,
    hardware: {
      ...book.hardware,
      tiers: book.hardware.tiers.map((tier) => ({
        ...tier,
        perHingeMinor: tier.perHingeMinor + 5_000,
      })),
    },
  };
}

/** The same prices under another version: only the flag nobody pays for differs. */
function sameAmountsOtherVersion(book: PriceBook): PriceBook {
  return { ...book, amountsProvisional: !book.amountsProvisional };
}

// ---------------------------------------------------------------------------------------------------------------------

describe("no active version", () => {
  beforeEach(async () => {
    priceWorld = await freshPriceDashboardWorld({ isPublished: false });
  });

  it("answers the arm with isSent alone and calls no marker method", async () => {
    const read = vi.spyOn(priceWorld.stores.notices, "readAcknowledged");
    const record = vi.spyOn(priceWorld.stores.notices, "recordIfAbsent");

    const body = await jsonOf(await readNotice({ cookie: OWNER_WRITE_COOKIE }));

    expect(body).toEqual({ kind: "no-active-version", isSent: false });
    expect(read).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it("answers a sent design's arm with isSent true", async () => {
    editable.plant({ id: NOTICE_DESIGN_ID, isSent: true });

    const body = await jsonOf(await readNotice({ cookie: OWNER_WRITE_COOKIE }));

    expect(body).toEqual({ kind: "no-active-version", isSent: true });
  });
});

describe("isSent is the port's, on both arms and under both credentials", () => {
  it.each([true, false])(
    "reads %s from a token on the active arm",
    async (isSent) => {
      editable.plant({ id: NOTICE_DESIGN_ID, isSent });

      expect((await open()).isSent).toBe(isSent);
    },
  );

  it("reads true from the owning account's session for a design sent and then edited", async () => {
    const { seedSession, seedVerifiedAccount } = await import(
      "../../../support/account-world"
    );
    const owner = await seedVerifiedAccount({ email: "owner@example.test" });
    const session = await seedSession(owner);
    editable.plant({
      id: NOTICE_DESIGN_ID,
      writeTokenHash: undefined,
      accountId: owner.id,
      isSent: true,
    });

    const answer = await readNotice({ cookie: session.cookie });

    expect(((await answer.json()) as Notice).isSent).toBe(true);
  });
});

describe("the judgement table", () => {
  it("answers false with no marker read of the seen side when the marker is the pair in force", async () => {
    await open();
    const readVersion = vi.spyOn(priceWorld.stores.priceBook, "readVersion");
    const readAt = vi.spyOn(priceWorld.stores.availability, "readAt");

    const notice = await open();

    expect(notice.pricesChanged).toBe(false);
    expect(notice.removedAccessories).toEqual([]);
    expect(readVersion).not.toHaveBeenCalled();
    expect(readAt).not.toHaveBeenCalled();
  });

  it("answers false for equal prices under a different pair, and names the pair in force", async () => {
    await open();
    const next = await publish(sameAmountsOtherVersion(SAMPLE_PRICE_BOOK));

    const notice = await open();

    expect(notice.pricesChanged).toBe(false);
    expect(notice.current.versionId).toBe(next);
  });

  it("answers true for different prices", async () => {
    await open();
    await publish(dearerHinges(SAMPLE_PRICE_BOOK));

    expect((await open()).pricesChanged).toBe(true);
  });

  it("answers false, with the sheet, for an active REPLACEMENT_REQUIRED", async () => {
    await open();
    await switchOff(DEFAULT_MATERIAL);

    const notice = await open();

    expect(notice.pricesChanged).toBe(false);
    expect(notice.replacementsRequired.map(({ item }) => item)).toEqual([
      DEFAULT_MATERIAL,
    ]);
    const [row] = notice.replacementsRequired;
    expect(row?.remaining).not.toContainEqual(DEFAULT_MATERIAL);
    expect(row?.remaining.length).toBeGreaterThan(0);
  });

  it("answers false, and never true, for an ordinary refusal of the active side", async () => {
    await open();
    await publish({
      ...SAMPLE_PRICE_BOOK,
      cabinetRules: SAMPLE_PRICE_BOOK.cabinetRules.filter(
        (rule) => rule.suppliedBy === "customer",
      ),
    });

    const notice = await open();

    expect(notice.pricesChanged).toBe(false);
    expect(notice.replacementsRequired).toEqual([]);
  });

  it("answers true when the seen side was refused and the active side prices, and heals when that pair is acknowledged", async () => {
    await switchOff(DEFAULT_MATERIAL);
    await priceWorld.stores.notices.recordIfAbsent(
      NOTICE_DESIGN_ID,
      await pairNow(),
    );
    await writeWithoutJudgement(staff, DEFAULT_MATERIAL, true);

    const first = await open();
    const acknowledged = await acknowledge({
      cookie: OWNER_WRITE_COOKIE,
      json: first.current,
    });
    const second = await open();

    expect(first.pricesChanged).toBe(true);
    expect(first.replacementsRequired).toEqual([]);
    expect(acknowledged.status).toBe(200);
    expect(second.pricesChanged).toBe(false);
  });

  it("answers true, with one log line, when the seen version is not found", async () => {
    await priceWorld.stores.notices.recordIfAbsent(NOTICE_DESIGN_ID, {
      versionId: "A".repeat(21),
      availabilityRevision: await headNow(),
    });

    const notice = await open();

    expect(notice.pricesChanged).toBe(true);
    expect(notice.removedAccessories).toEqual([]);
    expect(noticeLines()).toEqual([
      { event: "seen-side-unreadable", cause: "version-not-found" },
    ]);
    expect(vi.mocked(console.error)).toHaveBeenCalledTimes(1);
  });

  it("answers true, with one line, when the seen version does not parse", async () => {
    const seen = await pairNow();
    await priceWorld.stores.notices.recordIfAbsent(NOTICE_DESIGN_ID, seen);
    await publish(SAMPLE_PRICE_BOOK);
    const real = priceWorld.stores.priceBook.readVersion.bind(
      priceWorld.stores.priceBook,
    );
    vi.spyOn(priceWorld.stores.priceBook, "readVersion").mockImplementation(
      async (versionId) => {
        const read = await real(versionId);
        return read.kind === "found"
          ? {
              kind: "found",
              version: { ...read.version, book: { nonsense: 1 } },
            }
          : read;
      },
    );
    vi.mocked(console.error).mockClear();

    const notice = await open();

    expect(notice.pricesChanged).toBe(true);
    expect(vi.mocked(console.error)).toHaveBeenCalledTimes(1);
  });

  it.each(["readVersion", "readAt"] as const)(
    "answers 503 and writes nothing when %s fails, and never reads the failure as an unreadable pair",
    async (method) => {
      const seen = await pairNow();
      await priceWorld.stores.notices.recordIfAbsent(NOTICE_DESIGN_ID, seen);
      await publish(dearerHinges(SAMPLE_PRICE_BOOK));
      const failure = new DashboardStoreError(
        "read a design's acknowledged prices",
        "unavailable",
      );
      const owner =
        method === "readVersion"
          ? priceWorld.stores.priceBook
          : priceWorld.stores.availability;
      vi.spyOn(owner, method as never).mockRejectedValue(failure as never);
      const record = vi.spyOn(priceWorld.stores.notices, "recordIfAbsent");

      const answer = await readNotice({ cookie: OWNER_WRITE_COOKIE });

      expect(answer.status).toBe(503);
      expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
      expect(record).not.toHaveBeenCalled();
      expect(await marker()).toEqual({ kind: "recorded", acknowledged: seen });
    },
  );
});

describe("a seen availability the projection refuses", () => {
  it("answers true and no removed accessories, with one log line", async () => {
    await open();
    await switchOff(DISH_RACK);
    vi.spyOn(priceWorld.stores.availability, "readAt").mockResolvedValue({
      kind: "found",
      availability: { revision: "1", disabled: "not a list" },
    } as never);
    vi.mocked(console.error).mockClear();

    const notice = await open();

    expect(notice.pricesChanged).toBe(true);
    expect(notice.removedAccessories).toEqual([]);
    expect(noticeLines()).toEqual([
      { event: "seen-side-unreadable", cause: "availability-unreadable" },
    ]);
  });

  it("answers false, a sheet and the removed accessory when the active side wants a replacement and an earned accessory went off", async () => {
    await open();
    await switchOff(DEFAULT_MATERIAL, DISH_RACK);

    const notice = await open();

    expect(notice.pricesChanged).toBe(false);
    expect(notice.replacementsRequired.length).toBeGreaterThan(0);
    expect(notice.removedAccessories).toEqual([
      { accessoryId: "dishDryingRack" },
    ]);
  });
});

describe("the accessories removed since the marker", () => {
  const SHELF: LinkedAccessoryRule = {
    accessoryId: "accessory.shelf",
    ruleId: "rule.shelf",
    linkedBuildId: "base-3drawer",
    perUnitMinor: 12_000,
    name: "Raft vechi",
  };
  const bookWith = (rule: LinkedAccessoryRule): PriceBook => ({
    ...SAMPLE_PRICE_BOOK,
    linkedAccessories: [rule],
  });
  const shelfItem: ItemRef = {
    kind: "accessory",
    accessoryId: SHELF.accessoryId,
  };

  it("names a linked row from the active book and a built-in from nothing, and sets no key to undefined", async () => {
    await startWorld(bookWith(SHELF));
    await open();
    await publish(bookWith({ ...SHELF, name: "Raft nou" }));
    await switchOff(shelfItem, DISH_RACK);

    const notice = await open();

    expect(
      notice.removedAccessories.map(({ accessoryId }) => accessoryId).sort(),
    ).toEqual(["accessory.shelf", "dishDryingRack"]);
    const shelf = notice.removedAccessories.find(
      ({ accessoryId }) => accessoryId === SHELF.accessoryId,
    );
    const rack = notice.removedAccessories.find(
      ({ accessoryId }) => accessoryId === "dishDryingRack",
    );
    expect(shelf).toEqual({
      accessoryId: SHELF.accessoryId,
      authoredName: "Raft nou",
    });
    expect(Object.keys(rack ?? {})).toEqual(["accessoryId"]);
  });

  it("lists the ids of removedAccessoriesSince alone, whatever the active side answered", async () => {
    await open();
    await switchOff(DISH_RACK);

    const notice = await open();

    expect(notice.removedAccessories).toEqual([
      { accessoryId: "dishDryingRack" },
    ]);
  });

  it("does not list an accessory the customer never had: one switched off before the marker", async () => {
    await switchOff(DISH_RACK);
    await open();

    expect((await open()).removedAccessories).toEqual([]);
  });
});

describe("a state the domain forbids", () => {
  it("answers 500 with a closed body and one line, and writes no marker", async () => {
    await switchOff(
      ...SAMPLE_PRICE_BOOK.hardware.tiers.map(
        ({ tierId }): ItemRef => ({
          kind: "hardware",
          tierId,
        }),
      ),
    );

    const answer = await readNotice({ cookie: OWNER_WRITE_COOKIE });

    expect(answer.status).toBe(500);
    expect(await jsonOf(answer)).toEqual({ status: "unexpected" });
    expect(noticeLines()).toEqual([{ event: "no-replacement-option" }]);
    expect(await marker()).toEqual({ kind: "never-recorded" });
  });
});

describe("what the answer never holds", () => {
  it("names the pair in force and not the pair the customer saw, nor any version the history archived", async () => {
    const first = await versionNow();
    await open();
    await publish(dearerHinges(SAMPLE_PRICE_BOOK));

    const text = await (
      await readNotice({ cookie: OWNER_WRITE_COOKIE })
    ).text();

    expect(text).not.toContain(first);
    expect(text).toContain(await versionNow());
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The property: the route adds no rule of its own

describe("pricesChanged equals pricesChangedBetween for a design priceable under both pairs", () => {
  const COVER_AND_RACK: readonly ItemRef[] = [
    { kind: "accessory", accessoryId: "sinkProtectiveCover" },
    DISH_RACK,
  ];
  const aBook = fc
    .record({
      hingeRise: fc.integer({ min: 0, max: 20_000 }),
      isProvisional: fc.boolean(),
    })
    .map(({ hingeRise, isProvisional }): PriceBook => {
      const dearer = dearerHingesBy(SAMPLE_PRICE_BOOK, hingeRise);
      return { ...dearer, amountsProvisional: isProvisional };
    });
  const anAvailability = fc
    .subarray([...COVER_AND_RACK])
    .map((disabled): CatalogueAvailability => ({ revision: "1", disabled }));

  it("holds over generated books and availabilities", () => {
    const design = KITCHEN_L_DESIGN;
    const catalog = buildKitchenLBodyCatalog(cabinetDepthMmOf(design));
    fc.assert(
      fc.property(
        aBook,
        anAvailability,
        aBook,
        anAvailability,
        (seenBook, seenAvailability, activeBook, activeAvailability) => {
          const kitchen: Kitchen = {
            design,
            catalog,
            active: {
              kind: "active",
              versionId: "A".repeat(21),
              book: activeBook,
              availability: activeAvailability,
            },
          };

          const answer = pricesChangedFor(kitchen, {
            kind: "readable",
            book: seenBook,
            availability: seenAvailability,
          });

          expect(answer).toBe(
            pricesChangedBetween({
              design,
              catalog,
              deepeningRows: shippedDeepeningRows(),
              seenBook,
              seenAvailability,
              activeBook,
              currentAvailability: activeAvailability,
            }),
          );
        },
      ),
    );
  });
});

function dearerHingesBy(book: PriceBook, rise: number): PriceBook {
  return {
    ...book,
    hardware: {
      ...book.hardware,
      tiers: book.hardware.tiers.map((tier) => ({
        ...tier,
        perHingeMinor: tier.perHingeMinor + rise,
      })),
    },
  };
}
