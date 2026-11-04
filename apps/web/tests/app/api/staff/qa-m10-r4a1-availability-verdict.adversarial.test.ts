import { fc } from "@fast-check/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PALETTE_ENTRY_IDS,
  fixedDefaultItemsOf,
  freeColourFinish,
  isItemDisabled,
  isItemStated,
  isSameItem,
  judgeAvailabilityChange,
  paletteFinish,
  savedDefaultItemsOf,
  type CatalogueAvailability,
  type ItemRef,
  type NewKitchenSettings,
} from "@lemnaria/configurator-domain";

import { readActivePriceBook } from "@/lib/server/active-price-book";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  captureConsole,
  freshAccountWorld,
  jsonOf,
} from "../../../support/account-world";
import {
  STATED_ITEMS,
  SWITCHABLE_GROUPS,
  UNSTATED_ITEMS,
  activationRows,
  administrator,
  disabledNow,
  saveDefaults,
  switchItem,
  writeWithoutJudgement,
} from "../../../support/availability-route-world";
import {
  ANCHORED_BOOK,
  currentPriceDashboardWorld,
  freshPriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import { freshStaffWorld } from "../../../support/staff-world";

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
 * `POST /api/staff/prices/availability`, over a generated world: the answer is the domain's verdict for the state the route
 * read, a write moves the head by exactly one and leaves exactly one row, and a refusal leaves nothing. The states are
 * reached with unjudged writes too, so the route is asked about a default that is already off and a group with nothing on.
 */

const PAINTED: ItemRef = { kind: "material", tierId: "material.painted-mdf" };
const VENEER: ItemRef = { kind: "material", tierId: "material.veneer" };
const MELAMINE: ItemRef = { kind: "material", tierId: "material.melamine" };
const AN_UNSTATED_ITEM: ItemRef = {
  kind: "material",
  tierId: "material.unheard-of",
};
const SOFT_CLOSE: ItemRef = { kind: "hardware", tierId: "hardware.soft-close" };
const SINK_COVER: ItemRef = {
  kind: "accessory",
  accessoryId: "sinkProtectiveCover",
};

interface Operation {
  item: ItemRef;
  active: boolean;
  isStale: boolean;
}
type Scenario = [
  NewKitchenSettings,
  { item: ItemRef; active: boolean }[],
  Operation[],
];

const off = (item: ItemRef, isStale = false): Operation => ({
  item,
  active: false,
  isStale,
});

/** One scenario for every word the route can answer, so the run reaches each whatever the generator draws. */
const EVERY_ANSWER: Scenario[] = [
  [
    { materialTierId: "material.veneer" },
    [],
    [
      off(MELAMINE),
      off(SINK_COVER),
      off(AN_UNSTATED_ITEM),
      off(VENEER),
      off(PAINTED),
      off(PAINTED),
      off(PAINTED, true),
      off(SOFT_CLOSE, true),
    ],
  ],
  [
    {},
    [
      { item: PAINTED, active: false },
      { item: VENEER, active: false },
    ],
    [off(MELAMINE)],
  ],
];

const RUNS = { numRuns: 40 };
const TIMEOUT_MS = 60_000;

beforeEach(() => {
  captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function aFreshWorld() {
  freshAccountWorld();
  freshStaffWorld();
  await freshPriceDashboardWorld();
  return administrator();
}

const itemArbitrary = fc.constantFrom<ItemRef>(
  ...STATED_ITEMS,
  ...UNSTATED_ITEMS,
);
const statedItemArbitrary = fc.constantFrom<ItemRef>(...STATED_ITEMS);

const MATERIAL_IDS = ANCHORED_BOOK.material.tiers.map(({ tierId }) => tierId);
const HARDWARE_IDS = ANCHORED_BOOK.hardware.tiers.map(({ tierId }) => tierId);

const defaultsArbitrary: fc.Arbitrary<NewKitchenSettings> = fc.record(
  {
    materialTierId: fc.constantFrom(...MATERIAL_IDS, "material.unheard-of"),
    hardwareTierId: fc.constantFrom(...HARDWARE_IDS, "hardware.unheard-of"),
    handle: fc.constantFrom("black", "steel", "push"),
    topRowHandle: fc.constantFrom("black", "steel", "push"),
    finish: fc.oneof(
      fc.constantFrom(...PALETTE_ENTRY_IDS).map(paletteFinish),
      fc.constant(freeColourFinish("#8d9a84")),
    ),
  },
  { requiredKeys: [] },
);

function expectNothingWritten(
  after: CatalogueAvailability,
  before: CatalogueAvailability,
  rowsBefore: number,
  label: string,
): void {
  expect(after, label).toEqual(before);
  expect(activationRows().length, label).toBe(rowsBefore);
}

async function saveUnlessEmpty(
  admin: Awaited<ReturnType<typeof administrator>>,
  defaults: NewKitchenSettings,
): Promise<void> {
  if (Object.keys(defaults).length > 0) await saveDefaults(admin, defaults);
}

describe("the route's answer is the domain's verdict for the state it read", () => {
  const answersSeen = new Set<string>();
  const noOpsSeen = { fresh: 0, stale: 0 };

  it(
    "holds for any defaults, any unjudged prefix and any sequence of switches: a write leaves one row and one step, and a switch to the state an item is in leaves nothing",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          defaultsArbitrary,
          fc.array(
            fc.record({ item: statedItemArbitrary, active: fc.boolean() }),
            {
              maxLength: 6,
            },
          ),
          fc.array(
            fc.record({
              item: itemArbitrary,
              active: fc.boolean(),
              isStale: fc.boolean(),
            }),
            { minLength: 1, maxLength: 10 },
          ),
          async (defaults, prefix, operations) => {
            const admin = await aFreshWorld();
            await saveUnlessEmpty(admin, defaults);
            for (const { item, active } of prefix) {
              await writeWithoutJudgement(admin, item, active);
            }

            for (const operation of operations) {
              const { stores } = currentPriceDashboardWorld();
              const availability = await stores.availability.readCurrent();
              const rowsBefore = activationRows().length;
              const stale = String(BigInt(availability.revision) + 1n);
              const verdict = judgeAvailabilityChange(operation, {
                book: ANCHORED_BOOK,
                availability,
                defaults,
              });

              const answer = await switchItem(
                admin.cookie,
                operation.item,
                operation.active,
                operation.isStale ? stale : availability.revision,
              );

              const label = JSON.stringify({ operation, availability });
              const after = await stores.availability.readCurrent();
              const body = (await jsonOf(answer)) as { status?: string };
              answersSeen.add(
                answer.status === 200 ? "set" : String(body.status),
              );
              const isNoOp =
                isItemStated(operation.item, ANCHORED_BOOK) &&
                isItemDisabled(availability, operation.item) ===
                  !operation.active;
              if (isNoOp) {
                noOpsSeen[operation.isStale ? "stale" : "fresh"] += 1;
                expect(answer.status, label).toBe(200);
                expect(body, label).toEqual({
                  revision: availability.revision,
                });
                expectNothingWritten(after, availability, rowsBefore, label);
              } else if (operation.isStale) {
                expect(answer.status, label).toBe(409);
                expect(body, label).toEqual({ status: "changed-meanwhile" });
                expectNothingWritten(after, availability, rowsBefore, label);
              } else if (verdict.kind === "allowed") {
                expect(answer.status, label).toBe(200);
                expect(body, label).toEqual({ revision: after.revision });
                expect(BigInt(after.revision), label).toBe(
                  BigInt(availability.revision) + 1n,
                );
                expect(activationRows().length, label).toBe(rowsBefore + 1);
                expect(isItemDisabled(after, operation.item), label).toBe(
                  !operation.active,
                );
              } else {
                expect(answer.status, label).toBe(409);
                expect(body, label).toMatchObject({ status: verdict.code });
                expectNothingWritten(after, availability, rowsBefore, label);
              }
            }
          },
        ),
        { ...RUNS, examples: EVERY_ANSWER },
      );

      expect([...answersSeen]).toEqual(
        expect.arrayContaining([
          "set",
          "changed-meanwhile",
          "item-not-in-active-book",
          "item-is-fixed-default",
          "item-is-default",
          "item-always-present",
          "last-active-option",
        ]),
      );
      expect(noOpsSeen.fresh).toBeGreaterThan(10);
      expect(noOpsSeen.stale).toBeGreaterThan(10);
    },
    TIMEOUT_MS,
  );
});

describe("whatever is asked through the route, the customer is never left without an option", () => {
  it(
    "keeps one active option in every group, every default on, and the book readable by customers",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          defaultsArbitrary,
          fc.array(fc.record({ item: itemArbitrary, active: fc.boolean() }), {
            minLength: 1,
            maxLength: 40,
          }),
          async (defaults, operations) => {
            const admin = await aFreshWorld();
            await saveUnlessEmpty(admin, defaults);

            for (const { item, active } of operations) {
              await switchItem(admin.cookie, item, active);
            }

            const disabled = await disabledNow();
            const availability = { revision: "0", disabled };
            const label = JSON.stringify(disabled);
            for (const group of SWITCHABLE_GROUPS) {
              expect(
                group.some((option) => !isItemDisabled(availability, option)),
                label,
              ).toBe(true);
            }
            const mustStayOn = [
              ...fixedDefaultItemsOf(ANCHORED_BOOK),
              ...savedDefaultItemsOf(defaults),
              {
                kind: "accessory",
                accessoryId: "sinkProtectiveCover",
              } as const,
            ];
            for (const item of mustStayOn) {
              expect(
                disabled.some((off) => isSameItem(off, item)),
                label,
              ).toBe(false);
            }
            expect((await readActivePriceBook()).kind, label).toBe("active");
          },
        ),
        RUNS,
      );
    },
    TIMEOUT_MS,
  );

  it("switches every switchable item off in turn without ever making the book unreadable", async () => {
    const admin = await aFreshWorld();

    for (const item of STATED_ITEMS) {
      await switchItem(admin.cookie, item, false);
    }

    expect((await readActivePriceBook()).kind).toBe("active");
    expect((await disabledNow()).length).toBeLessThan(STATED_ITEMS.length);
  });
});
