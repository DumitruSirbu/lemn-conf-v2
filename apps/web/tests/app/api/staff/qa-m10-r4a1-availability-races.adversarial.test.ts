import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isSameItem,
  savedDefaultItemsOf,
  type ItemRef,
  type NewKitchenSettings,
} from "@lemnaria/configurator-domain";

import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import {
  captureConsole,
  freshAccountWorld,
  jsonOf,
  type AccountWorld,
} from "../../../support/account-world";
import {
  activationRows,
  administrator,
  allRows,
  availabilityHead,
  defaultsRevision,
  disabledNow,
  publishNextVersion,
  trySaveDefaults,
  switchItem,
} from "../../../support/availability-route-world";
import {
  ANCHORED_BOOK,
  freshPriceDashboardWorld,
  type PriceDashboardWorld,
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
 * Two writers at once, and a write that changes nothing, against `POST /api/staff/prices/availability`. The fakes commit a
 * write and its audit row together or neither, and compare the head as the Neon statements do, so what is asked here is
 * what the route does with the answers it is given.
 */

const PAINTED: ItemRef = { kind: "material", tierId: "material.painted-mdf" };
const VENEER: ItemRef = { kind: "material", tierId: "material.veneer" };
const SOFT_CLOSE: ItemRef = { kind: "hardware", tierId: "hardware.soft-close" };

let world: AccountWorld;
let prices: PriceDashboardWorld;
let console_: ReturnType<typeof captureConsole>;

beforeEach(async () => {
  world = freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld();
  console_ = captureConsole();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function statusesOf(answers: Promise<Response>[]): Promise<number[]> {
  return (await Promise.all(answers)).map(({ status }) => status);
}

describe("writers at the same instant against one head", () => {
  it("lets exactly one of two switches through, and the other is changed-meanwhile with nothing written", async () => {
    const { cookie } = await administrator();
    const shared = await availabilityHead();

    const answers = await Promise.all([
      switchItem(cookie, PAINTED, false, shared),
      switchItem(cookie, VENEER, false, shared),
    ]);

    expect(answers.map(({ status }) => status).sort()).toEqual([200, 409]);
    const loser = answers.find(({ status }) => status === 409);
    expect(await jsonOf(loser as Response)).toEqual({
      status: "changed-meanwhile",
    });
    expect(await disabledNow()).toHaveLength(1);
    expect(activationRows()).toHaveLength(1);
  });

  it("lets exactly one of eight switches through whatever order they land in", async () => {
    const { cookie } = await administrator();
    const shared = await availabilityHead();
    const items: ItemRef[] = [PAINTED, VENEER, SOFT_CLOSE];

    const statuses = await statusesOf(
      Array.from({ length: 8 }, (_, index) =>
        switchItem(cookie, items[index % items.length], false, shared),
      ),
    );

    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(7);
    expect(activationRows()).toHaveLength(1);
    expect(await disabledNow()).toHaveLength(1);
  });

  it("lets exactly one of the same switch twice through, and the log holds one row", async () => {
    const { cookie } = await administrator();
    const shared = await availabilityHead();

    const statuses = await statusesOf([
      switchItem(cookie, PAINTED, false, shared),
      switchItem(cookie, PAINTED, false, shared),
    ]);

    expect(statuses.sort()).toEqual([200, 409]);
    expect(activationRows()).toHaveLength(1);
  });

  it.each([
    ["the save first", true],
    ["the switch first", false],
  ])(
    "never leaves an item both the saved default and switched off, with %s",
    async (_description, isSaveFirst) => {
      const admin = await administrator();
      const save = () =>
        trySaveDefaults(admin, { materialTierId: VENEER.tierId });
      const switchOff = () => switchItem(admin.cookie, VENEER, false);

      await Promise.all(
        isSaveFirst ? [save(), switchOff()] : [switchOff(), save()],
      );

      const saved = await prices.defaults.read();
      const isSavedDefault =
        saved.kind === "saved" &&
        savedDefaultItemsOf(saved.saved.defaults as NewKitchenSettings).some(
          (item) => isSameItem(item, VENEER),
        );
      const isOff = (await disabledNow()).some((item) =>
        isSameItem(item, VENEER),
      );
      expect({ isSavedDefault, isOff }).not.toEqual({
        isSavedDefault: true,
        isOff: true,
      });
    },
  );

  it("leaves a defaults save refused when a switch landed after the save read the head", async () => {
    const admin = await administrator();
    const staleHead = await availabilityHead();
    const staleDefaults = await defaultsRevision();
    await switchItem(admin.cookie, PAINTED, false);

    const saved = await prices.defaults.save({
      expectedRevision: staleDefaults,
      expectedAvailabilityRevision: staleHead,
      defaults: { materialTierId: PAINTED.tierId },
      audit: {
        session: {
          sessionTokenHash: admin.tokenHash,
          idleLifetimeSeconds: { client: 60, operator: 60, administrator: 60 },
        },
        entry: {
          action: "kitchen-defaults-saved",
          detail: { changedFields: ["material"] },
        },
      },
    });

    expect(saved.kind).toBe("availability-changed-meanwhile");
    expect((await prices.defaults.read()).kind).toBe("none-saved");
  });
});

describe("a publish landing between the route's reads and its write", () => {
  it("makes the write changed-meanwhile, even for an item the new book makes a fixed default", async () => {
    const admin = await administrator();
    const realSetActive = prices.stores.availability.setActive.bind(
      prices.stores.availability,
    );
    const newBook = {
      ...ANCHORED_BOOK,
      material: {
        ...ANCHORED_BOOK.material,
        defaultTierId: "material.painted-mdf",
      },
    };
    vi.spyOn(prices.stores.availability, "setActive").mockImplementation(
      async (request) => {
        const published = await publishNextVersion(admin, newBook);
        expect(published.kind).toBe("ok");
        return realSetActive(request);
      },
    );

    const answer = await switchItem(admin.cookie, PAINTED, false);

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "changed-meanwhile" });
    expect(await disabledNow()).toEqual([]);
    expect(activationRows()).toEqual([]);
  });
});

describe("a switch that changes nothing (the behaviour as built)", () => {
  function activationRowsFor(item: ItemRef, active: boolean) {
    return activationRows().filter(
      ({ detail }) =>
        detail.itemKind === item.kind &&
        detail.active === active &&
        Object.values(detail).includes(
          item.kind === "material" ? item.tierId : "",
        ),
    );
  }

  it("is a 200 that moves the head and writes a row when the item is already on", async () => {
    const { cookie } = await administrator();
    const before = await availabilityHead();

    const answer = await switchItem(cookie, PAINTED, true);

    expect(answer.status).toBe(200);
    expect(await availabilityHead()).not.toBe(before);
    expect(await disabledNow()).toEqual([]);
    expect(activationRowsFor(PAINTED, true)).toHaveLength(1);
  });

  it("is a 200 that moves the head and writes a row when the item is already off", async () => {
    const { cookie } = await administrator();
    await switchItem(cookie, PAINTED, false);
    const before = await availabilityHead();

    const answer = await switchItem(cookie, PAINTED, false);

    expect(answer.status).toBe(200);
    expect(BigInt(await availabilityHead())).toBe(BigInt(before) + 1n);
    expect(await disabledNow()).toEqual([PAINTED]);
    expect(activationRowsFor(PAINTED, false)).toHaveLength(2);
  });

  it("makes another administrator's pending switch changed-meanwhile though nothing on sale changed", async () => {
    const first = await administrator("first@example.test");
    const second = await administrator("second@example.test");
    const pageRead = await availabilityHead();

    await switchItem(first.cookie, PAINTED, true);
    const answer = await switchItem(second.cookie, VENEER, false, pageRead);

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toEqual({ status: "changed-meanwhile" });
    expect(await disabledNow()).toEqual([]);
  });

  it("makes a publish prepared before it availability-changed-meanwhile", async () => {
    const admin = await administrator();
    const active = await prices.stores.priceBook.readActive();
    if (active.kind !== "found") throw new Error("no active version");
    const preparedAgainst = await availabilityHead();

    await switchItem(admin.cookie, PAINTED, true);
    const publish = await prices.priceBook.publish({
      expectedDraftRevision: (await prices.stores.priceBook.readDraft())
        .draftRevision,
      expectedActiveSequence: active.version.sequenceNumber,
      expectedAvailabilityRevision: preparedAgainst,
      createdItems: [],
      label: "Next",
      note: "",
      book: ANCHORED_BOOK,
      changeSummary: [],
      audit: {
        session: {
          sessionTokenHash: admin.tokenHash,
          idleLifetimeSeconds: { client: 60, operator: 60, administrator: 60 },
        },
        entry: { action: "price-published", detail: { provisional: false } },
      },
    });

    expect(publish.kind).toBe("availability-changed-meanwhile");
  });

  it("writes one audit row per request, so a run of them up to the hourly bucket grows the log by that many", async () => {
    const { cookie } = await administrator();
    const rowsBefore = allRows().length;

    for (let request = 0; request < 25; request += 1) {
      await switchItem(cookie, PAINTED, true);
    }

    expect(allRows().length - rowsBefore).toBe(25);
    expect(await disabledNow()).toEqual([]);
  });
});

describe("a write and its audit row", () => {
  it("records exactly the item, the flag and the revision it created, and nothing of the session", async () => {
    const { cookie, accountId, tokenHash } = await administrator();

    const answer = await switchItem(cookie, SOFT_CLOSE, false);

    const { revision } = (await jsonOf(answer)) as { revision: string };
    const [row] = activationRows();
    expect(row?.actorAccountId).toBe(accountId);
    expect(row?.detail).toStrictEqual({
      itemKind: "hardware",
      itemId: "hardware.soft-close",
      active: false,
      availabilityRevision: revision,
    });
    const everythingHeld = JSON.stringify(allRows());
    expect(everythingHeld).not.toContain(tokenHash);
    expect(everythingHeld).not.toContain(cookie);
    expect(console_.everything()).not.toContain(tokenHash);
    expect(console_.everything()).not.toContain(cookie);
  });
});

describe("a store that answers what it should not", () => {
  it("does not read the stored draft: a draft that cannot be read does not stop a switch", async () => {
    const { cookie } = await administrator();
    const readDraft = vi
      .spyOn(prices.stores.priceBook, "readDraft")
      .mockRejectedValue(new Error("the draft is unreadable"));

    const answer = await switchItem(cookie, PAINTED, false);

    expect(answer.status).toBe(200);
    expect(readDraft).not.toHaveBeenCalled();
  });

  it.each([
    ["a book that is not one", { version: "x", book: { nonsense: true } }],
    ["a book that is text", { version: "x", book: "nonsense" }],
  ])(
    "answers 503 and writes nothing when the active version holds %s",
    async (_description, version) => {
      const { cookie } = await administrator();
      vi.spyOn(prices.stores.priceBook, "readActive").mockResolvedValue({
        kind: "found",
        version,
      } as never);
      const headBefore = await availabilityHead();

      const answer = await switchItem(cookie, PAINTED, false);

      expect(answer.status).toBe(503);
      expect(await jsonOf(answer)).toEqual({ status: "unavailable" });
      expect(await availabilityHead()).toBe(headBefore);
      expect(activationRows()).toEqual([]);
    },
  );

  it.each([
    [
      "a list of disabled items that is not a list",
      { revision: "5", disabled: "x" },
    ],
    [
      "a disabled item of a kind that does not exist",
      { revision: "5", disabled: [{ kind: "cabinet", tierId: "x" }] },
    ],
    [
      "a disabled item whose id is past the bound",
      {
        revision: "5",
        disabled: [{ kind: "material", tierId: "x".repeat(65) }],
      },
    ],
    [
      "more disabled items than a book can state",
      {
        revision: "5",
        disabled: Array.from({ length: 501 }, (_, index) => ({
          kind: "accessory",
          accessoryId: `accessory.${String(index)}`,
        })),
      },
    ],
    ["no answer at all", undefined],
  ])(
    "answers 503 and writes nothing when the availability store answers %s",
    async (_description, answer) => {
      const { cookie } = await administrator();
      const headBefore = (await prices.stores.availability.readCurrent())
        .revision;
      const setActive = vi.spyOn(prices.stores.availability, "setActive");
      vi.spyOn(prices.stores.availability, "readCurrent").mockResolvedValue(
        answer as never,
      );

      const response = await switchItem(cookie, PAINTED, false, headBefore);

      expect(response.status).toBe(503);
      expect(setActive).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["a saved row with no row inside it", { kind: "saved" }],
    ["no answer at all", undefined],
    ["an answer of a kind that does not exist", { kind: "elsewhere" }],
  ])(
    "answers 503 and writes nothing when the defaults store answers %s",
    async (_description, answer) => {
      const { cookie } = await administrator();
      vi.spyOn(prices.defaults, "read").mockResolvedValue(answer as never);
      const headBefore = await availabilityHead();

      const response = await switchItem(cookie, VENEER, false);

      expect(response.status).toBe(503);
      expect(await availabilityHead()).toBe(headBefore);
      expect(activationRows()).toEqual([]);
    },
  );

  it("never has the session end mid-write answer anything but 401, with the row and the change both absent", async () => {
    const { cookie, accountId } = await administrator();
    const headBefore = await availabilityHead();
    const realStage = prices.ledger.stage.bind(prices.ledger);
    vi.spyOn(prices.ledger, "stage").mockImplementation(async (request) => {
      await world.sessions.revokeAllForAccount(accountId);
      return realStage(request);
    });

    const answer = await switchItem(cookie, PAINTED, false);

    expect(answer.status).toBe(401);
    expect(await availabilityHead()).toBe(headBefore);
    expect(activationRows()).toEqual([]);
  });
});
