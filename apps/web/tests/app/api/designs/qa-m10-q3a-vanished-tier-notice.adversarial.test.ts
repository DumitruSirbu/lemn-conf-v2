import {
  KITCHEN_L_DESIGN,
  SAMPLE_PRICE_BOOK,
  paletteFinish,
  type Design,
  type ItemRef,
  type LinkedAccessoryRule,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

/**
 * M10 Q3a through `GET /api/designs/[id]/price-notice`: a stored kitchen naming a material or hardware tier the active
 * book does not hold is a replacement row, never an unknown tier (ADR 0178, Amendment of 2026-11-04), and a linked
 * accessory the kitchen earned and a later version deleted is a removed accessory shown until acknowledged. Every kitchen
 * here is one the save route accepts, since that route checks the shape of a tier id and not that a book holds it.
 */

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
  readonly pricesChanged: boolean;
  readonly current: { versionId: string; availabilityRevision: string };
  readonly replacementsRequired: readonly {
    item: ItemRef;
    remaining: ItemRef[];
  }[];
  readonly removedAccessories: readonly {
    accessoryId: string;
    authoredName?: string;
  }[];
}

const MATERIAL_TIER_IDS = SAMPLE_PRICE_BOOK.material.tiers.map(
  ({ tierId }) => tierId,
);
const HARDWARE_TIER_IDS = SAMPLE_PRICE_BOOK.hardware.tiers.map(
  ({ tierId }) => tierId,
);
const GHOST_MATERIAL: ItemRef = { kind: "material", tierId: "material.ghost" };
const GHOST_HARDWARE: ItemRef = { kind: "hardware", tierId: "hardware.ghost" };

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

function kitchenWith(settings: NonNullable<Design["settings"]>): Design {
  return {
    ...KITCHEN_L_DESIGN,
    settings: { ...KITCHEN_L_DESIGN.settings, ...settings },
  };
}

function store(design: Design): void {
  editable.plant({ id: NOTICE_DESIGN_ID, design });
}

async function open(): Promise<Notice> {
  const answer = await readNotice({ cookie: OWNER_WRITE_COOKIE });
  expect(answer.status).toBe(200);
  return (await answer.json()) as Notice;
}

function marker() {
  return priceWorld.stores.notices.readAcknowledged(NOTICE_DESIGN_ID);
}

async function publish(book: PriceBook): Promise<void> {
  const published = await publishNextVersion(staff, book);
  if (published.kind !== "ok") throw new Error("the next version was refused");
}

async function switchOff(...items: readonly ItemRef[]): Promise<void> {
  for (const item of items) await writeWithoutJudgement(staff, item, false);
}

function tierItems(
  kind: "material" | "hardware",
  tierIds: readonly string[],
): ItemRef[] {
  return tierIds.map((tierId) => ({ kind, tierId }));
}

function withoutMaterialTier(book: PriceBook, tierId: string): PriceBook {
  return {
    ...book,
    material: {
      ...book.material,
      tiers: book.material.tiers.filter((tier) => tier.tierId !== tierId),
    },
  };
}

function noticeLines(): readonly unknown[] {
  const written: readonly unknown[][] = vi.mocked(console.error).mock.calls;
  return written
    .filter(([label]) => label === "[price-notice]")
    .map(([, line]): unknown => line);
}

describe("a stored kitchen naming a tier the active book does not hold", () => {
  it("asks for a replacement offering the group's active tiers, never the unknown-tier failure, and prices no change", async () => {
    store(kitchenWith({ materialTierId: "material.ghost" }));

    const notice = await open();

    expect(notice.pricesChanged).toBe(false);
    expect(notice.replacementsRequired).toEqual([
      {
        item: GHOST_MATERIAL,
        remaining: tierItems("material", MATERIAL_TIER_IDS),
      },
    ]);
    expect(Object.keys(notice.replacementsRequired[0] ?? {}).sort()).toEqual([
      "item",
      "remaining",
    ]);
    expect(noticeLines()).toEqual([]);
  });

  it("asks for both groups at once, material before hardware, each offering only its own group's tiers", async () => {
    store(
      kitchenWith({
        materialTierId: "material.ghost",
        hardwareTierId: "hardware.ghost",
      }),
    );

    const notice = await open();

    expect(notice.replacementsRequired).toEqual([
      {
        item: GHOST_MATERIAL,
        remaining: tierItems("material", MATERIAL_TIER_IDS),
      },
      {
        item: GHOST_HARDWARE,
        remaining: tierItems("hardware", HARDWARE_TIER_IDS),
      },
    ]);
  });

  it("asks for a switched-off sibling beside the vanished tier, and offers neither the sibling nor the vanished one", async () => {
    store(
      kitchenWith({
        materialTierId: "material.ghost",
        hardwareTierId: "hardware.premium",
      }),
    );
    const premium: ItemRef = { kind: "hardware", tierId: "hardware.premium" };
    await switchOff(premium);

    const notice = await open();

    expect(notice.replacementsRequired.map(({ item }) => item)).toEqual([
      GHOST_MATERIAL,
      premium,
    ]);
    for (const { remaining } of notice.replacementsRequired) {
      expect(remaining).not.toContainEqual(premium);
      expect(remaining).not.toContainEqual(GHOST_MATERIAL);
    }
  });

  it("does not offer a switched-off tier of the vanished tier's group", async () => {
    store(kitchenWith({ materialTierId: "material.ghost" }));
    await switchOff({ kind: "material", tierId: "material.veneer" });

    const [row] = (await open()).replacementsRequired;

    expect(row?.remaining).toEqual(
      tierItems(
        "material",
        MATERIAL_TIER_IDS.filter((tierId) => tierId !== "material.veneer"),
      ),
    );
  });

  it("asks for the tier a publish deleted after the customer last looked, and acknowledges nothing by being read", async () => {
    store(kitchenWith({ materialTierId: "material.veneer" }));
    const first = await open();
    expect(first.replacementsRequired).toEqual([]);
    const seen = await marker();
    await publish(withoutMaterialTier(SAMPLE_PRICE_BOOK, "material.veneer"));

    const notice = await open();

    expect(notice.replacementsRequired.map(({ item }) => item)).toEqual([
      { kind: "material", tierId: "material.veneer" },
    ]);
    expect(notice.pricesChanged).toBe(false);
    expect(notice.current.versionId).not.toBe(first.current.versionId);
    expect(await marker()).toEqual(seen);
  });

  it("answers 500 with a closed body, one line and no marker when the group has nothing active to offer", async () => {
    store(kitchenWith({ materialTierId: "material.ghost" }));
    await switchOff(...tierItems("material", MATERIAL_TIER_IDS));

    const answer = await readNotice({ cookie: OWNER_WRITE_COOKIE });

    expect(answer.status).toBe(500);
    expect(await jsonOf(answer)).toEqual({ status: "unexpected" });
    expect(noticeLines()).toEqual([{ event: "no-replacement-option" }]);
    expect(await marker()).toEqual({ kind: "never-recorded" });
  });
});

describe("a vanished tier beside a colour the kitchen wears", () => {
  it("asks for the vanished material alone, not its switched-off colour (ADR 0057 resets it), and answers 200", async () => {
    store(
      kitchenWith({
        materialTierId: "material.veneer",
        finish: paletteFinish("veneer.nuc"),
      }),
    );
    await open();
    await publish(withoutMaterialTier(SAMPLE_PRICE_BOOK, "material.veneer"));
    await switchOff({ kind: "finish", finishId: "veneer.nuc" });

    const notice = await open();

    expect(notice.replacementsRequired.map(({ item }) => item)).toEqual([
      { kind: "material", tierId: "material.veneer" },
    ]);
    for (const { remaining } of notice.replacementsRequired) {
      expect(remaining.length).toBeGreaterThan(0);
    }
  });

  // FINDING Q3a-F1 (QA, 2026-11-09). A stored kitchen naming a material no declaration holds (an id the book never
  // held, or a created class) and a palette colour switched off is refused REPLACEMENT_REQUIRED by the price, but the
  // sheet cannot offer the colour a replacement (the colour group is the palette of a material nothing declares) and
  // `replacementsRequired` throws `NoReplacementOptionError`: this route answers 500, writes no marker, and the customer
  // reaches no sheet. Before Q3a the vanished material hid the colour row and the answer was a 200 with no rows. Resolved
  // by the ruling: a colour is not listed while its material has vanished (ADR 0057; Q5 owns the reset).
  it("FINDING Q3a-F1: answers 200 with rows when the kitchen names a vanished undeclared material and a switched-off palette colour", async () => {
    store(
      kitchenWith({
        materialTierId: "material.ghost",
        finish: paletteFinish("pal.antracit"),
      }),
    );
    await switchOff({ kind: "finish", finishId: "pal.antracit" });

    const answer = await readNotice({ cookie: OWNER_WRITE_COOKIE });

    expect(answer.status).toBe(200);
  });
});

describe("a linked accessory the kitchen earned and a later version deleted", () => {
  const SHELF: LinkedAccessoryRule = {
    accessoryId: "accessory.shelf",
    ruleId: "rule.shelf",
    linkedBuildId: "base-3drawer",
    perUnitMinor: 12_000,
    name: "Raft vechi",
  };
  const SHELF_ITEM: ItemRef = {
    kind: "accessory",
    accessoryId: SHELF.accessoryId,
  };
  const bookWith = (...rules: LinkedAccessoryRule[]): PriceBook => ({
    ...SAMPLE_PRICE_BOOK,
    linkedAccessories: rules,
  });

  it("shows its info row once, named from the seen book, and never again after the answer's pair is acknowledged", async () => {
    await startWorld(bookWith(SHELF));
    await open();
    await publish(bookWith());

    const shown = await open();
    const acknowledged = await acknowledge({
      cookie: OWNER_WRITE_COOKIE,
      json: shown.current,
    });
    const afterwards = await open();

    expect(shown.removedAccessories).toEqual([
      { accessoryId: SHELF.accessoryId, authoredName: "Raft vechi" },
    ]);
    expect(acknowledged.status).toBe(200);
    expect(afterwards.removedAccessories).toEqual([]);
  });

  it("is listed once when availability had switched it off after the customer looked, as well as the book deleting it", async () => {
    await startWorld(bookWith(SHELF));
    await open();
    await switchOff(SHELF_ITEM);
    await publish(bookWith());

    expect((await open()).removedAccessories).toEqual([
      { accessoryId: SHELF.accessoryId, authoredName: "Raft vechi" },
    ]);
  });

  it("is not listed when it was already switched off at the customer's last look", async () => {
    await startWorld(bookWith(SHELF));
    await switchOff(SHELF_ITEM);
    await open();
    await publish(bookWith());

    expect((await open()).removedAccessories).toEqual([]);
  });

  it("is not listed when the kitchen never earned it: its linked row is not among the kitchen's bodies", async () => {
    const placed = new Set(
      KITCHEN_L_DESIGN.placements.map(({ body }) => body.buildId),
    );
    const unplacedRow = SAMPLE_PRICE_BOOK.cabinetRules.find(
      (rule) => rule.suppliedBy !== "customer" && !placed.has(rule.buildId),
    );
    if (unplacedRow === undefined) throw new Error("every row is placed");
    const notEarned = { ...SHELF, linkedBuildId: unplacedRow.buildId };
    await startWorld(bookWith(notEarned));
    await open();
    await publish(bookWith());

    expect((await open()).removedAccessories).toEqual([]);
  });

  it("is not listed when the next version still states it", async () => {
    await startWorld(bookWith(SHELF));
    await open();
    await publish(bookWith({ ...SHELF, name: "Raft nou" }));

    expect((await open()).removedAccessories).toEqual([]);
  });
});
