import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HARDWARE_RATE_FIELDS,
  readDashboardAuditEntry,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import { IDLE_LIFETIME_SECONDS_BY_ROLE } from "@/lib/server/account/session-lifetimes";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import { freshAccountWorld, jsonOf } from "../../../support/account-world";
import {
  changeDraft,
  currentDraftRevision,
  readState,
  revertDraft,
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

// A revert of a created or deleted row, and a stored draft that names a field no row has: what leaves the draft, what the
// audit row says left, and what a planted draft is answered with.

let prices: PriceDashboardWorld;
let cookie: string;
let tokenHash: string;

beforeEach(async () => {
  freshAccountWorld();
  freshStaffWorld();
  prices = await freshPriceDashboardWorld();
  vi.stubEnv(CLIENT_NETWORK_SOURCE_VARIABLE, "vercel");
  const { session } = await signedInAs(
    { role: "administrator" },
    "administrator@example.test",
  );
  cookie = session.cookie;
  tokenHash = session.tokenHash;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const CLASS_ID = "hardware.economic";
const CLASS = { kind: "hardware", tierId: CLASS_ID } as const;
const PLINTH_ID = "plinth-light";
const PLINTH = { kind: "accessory", accessoryId: PLINTH_ID } as const;

const CLASS_CREATION: DraftChange = {
  address: { kind: "hardware-tier-created", tierId: CLASS_ID },
  value: { name: "GTV Economic", description: "" },
};
const CLASS_RATES: readonly DraftChange[] = HARDWARE_RATE_FIELDS.map(
  (field): DraftChange => ({
    address: { kind: "hardware", tierId: CLASS_ID, field },
    value: 2_000,
  }),
);
const CREATED_CLASS: readonly DraftChange[] = [CLASS_CREATION, ...CLASS_RATES];
const PLINTH_CREATION: DraftChange = {
  address: { kind: "accessory-created", accessoryId: PLINTH_ID },
  value: { linkedBuildId: "base-3drawer", perUnitMinor: 1_000, name: "Soclu" },
};

async function plant(changes: readonly unknown[]): Promise<void> {
  const written = await prices.priceBook.writeDraft({
    expectedDraftRevision: await currentDraftRevision(),
    changes: changes as readonly DraftChange[],
    audit: {
      session: {
        sessionTokenHash: tokenHash,
        idleLifetimeSeconds: IDLE_LIFETIME_SECONDS_BY_ROLE,
      },
      entry: {
        action: "price-draft-changed",
        detail: { changeKind: "provisional" },
      },
    },
  });
  if (written.kind !== "ok") throw new Error("seed: the draft not written");
}

async function storedChanges() {
  return (await prices.stores.priceBook.readDraft()).changes;
}

function auditRows() {
  return prices.ledger.heldEvents();
}

async function sendChange(change: unknown) {
  return changeDraft({
    cookie,
    json: { expectedDraftRevision: await currentDraftRevision(), change },
  });
}

async function sendRevert(target: unknown) {
  return revertDraft({
    cookie,
    json: { expectedDraftRevision: await currentDraftRevision(), target },
  });
}

function revertOf(address: unknown) {
  return sendRevert({ kind: "change", address });
}

function issue(field: string, code: string) {
  return { status: "invalid-input", issues: [{ field, code }] };
}

async function snapshot() {
  return { changes: await storedChanges(), rows: auditRows().length };
}

const SOFT_CLOSE = { kind: "hardware", tierId: "hardware.soft-close" } as const;
const RATE = HARDWARE_RATE_FIELDS[0];
const NAME_ADDRESS = {
  kind: "created-row-text",
  item: CLASS,
  field: "name",
} as const;
const RENAME: DraftChange = { address: NAME_ADDRESS, value: "GTV Max" };
const DESCRIPTION: DraftChange = {
  address: { ...NAME_ADDRESS, field: "description" },
  value: "Mecanisme simple",
};
const CLASS_DELETION: DraftChange = {
  address: { kind: "item-deleted", item: CLASS },
  value: true,
};
const PLINTH_PRICE: DraftChange = {
  address: { kind: "accessory", accessoryId: PLINTH_ID, field: "perUnitMinor" },
  value: 2_000,
};
const PLINTH_RENAME: DraftChange = {
  address: { kind: "created-row-text", item: PLINTH, field: "name" },
  value: "Soclu cu LED",
};
const UNRELATED: DraftChange = { address: { kind: "depth-rule" }, value: 9 };

function lastAuditDetail(rowsBefore: number) {
  const written = auditRows().slice(rowsBefore);
  expect(written).toHaveLength(1);
  const [row] = written;
  expect(readDashboardAuditEntry(row?.action, row?.detail).ok).toBe(true);
  return row?.detail as Record<string, unknown>;
}

describe("a revert of a field of an item the draft deletes", () => {
  const RATE_OF_SOFT_CLOSE: DraftChange = {
    address: { kind: "hardware", tierId: SOFT_CLOSE.tierId, field: RATE },
    value: 2_000,
  };
  const DELETION: DraftChange = {
    address: { kind: "item-deleted", item: SOFT_CLOSE },
    value: true,
  };

  it("is refused as not editable when the draft holds the field's change and the deletion, which stay", async () => {
    await plant([RATE_OF_SOFT_CLOSE, DELETION]);
    const before = await snapshot();

    const answer = await revertOf(RATE_OF_SOFT_CLOSE.address);

    expect({ status: answer.status, body: await jsonOf(answer) }).toEqual({
      status: 400,
      body: issue("address", "NOT_EDITABLE"),
    });
    expect(await storedChanges()).toEqual(before.changes);
    expect(auditRows()).toHaveLength(before.rows);
  });

  it("is refused as not editable for a created row that is deleted afterwards, whichever field it names", async () => {
    const stored = [...CREATED_CLASS, RENAME, CLASS_DELETION];
    for (const address of [CLASS_RATES[0]?.address, NAME_ADDRESS]) {
      await plant(stored);
      const before = await snapshot();

      const answer = await revertOf(address);

      expect({ status: answer.status, body: await jsonOf(answer) }).toEqual({
        status: 400,
        body: issue("address", "NOT_EDITABLE"),
      });
      expect(await storedChanges()).toEqual(before.changes);
      expect(auditRows()).toHaveLength(before.rows);
    }
  });

  it("still lets the creation of a row the draft then deletes be reverted, taking the rates, words and deletion", async () => {
    const stored = [UNRELATED, ...CREATED_CLASS, RENAME, CLASS_DELETION];
    await plant(stored);
    const before = await snapshot();

    const answer = await revertOf(CLASS_CREATION.address);

    expect(answer.status).toBe(200);
    expect(await storedChanges()).toEqual([UNRELATED]);
    expect(lastAuditDetail(before.rows)).toEqual({
      changeKind: "hardware-tier-created",
      itemKind: "hardware",
      itemId: CLASS_ID,
      revertedCount: stored.length - 1,
    });
  });

  it("does not take the deletion of a book item back by naming the deletion, whatever else is held", async () => {
    await plant([RATE_OF_SOFT_CLOSE, DELETION]);
    const before = await snapshot();

    const answer = await revertOf(DELETION.address);

    expect({ status: answer.status, body: await jsonOf(answer) }).toEqual({
      status: 400,
      body: issue("address", "NOT_EDITABLE"),
    });
    expect(await storedChanges()).toEqual(before.changes);
  });
});

describe("the audit row of a revert counts what left the draft", () => {
  const CASES: readonly [string, readonly DraftChange[], unknown, object][] = [
    [
      "a created class's creation with its rates and both words",
      [UNRELATED, ...CREATED_CLASS, RENAME, DESCRIPTION],
      CLASS_CREATION.address,
      {
        changeKind: "hardware-tier-created",
        itemKind: "hardware",
        itemId: CLASS_ID,
      },
    ],
    [
      "a created class's creation with no words",
      CREATED_CLASS,
      CLASS_CREATION.address,
      {
        changeKind: "hardware-tier-created",
        itemKind: "hardware",
        itemId: CLASS_ID,
      },
    ],
    [
      "a created accessory's creation with its price and name",
      [PLINTH_CREATION, PLINTH_PRICE, PLINTH_RENAME, UNRELATED],
      PLINTH_CREATION.address,
      {
        changeKind: "accessory-created",
        itemKind: "accessory",
        itemId: PLINTH_ID,
      },
    ],
    [
      "a created accessory's creation alone",
      [PLINTH_CREATION],
      PLINTH_CREATION.address,
      {
        changeKind: "accessory-created",
        itemKind: "accessory",
        itemId: PLINTH_ID,
      },
    ],
    [
      "a held rate of a created class, which takes the class and is recorded as its creation",
      [...CREATED_CLASS, RENAME],
      CLASS_RATES[0]?.address,
      {
        changeKind: "hardware-tier-created",
        itemKind: "hardware",
        itemId: CLASS_ID,
      },
    ],
    [
      "a held rename of a created class",
      [...CREATED_CLASS, RENAME, DESCRIPTION],
      NAME_ADDRESS,
      {
        changeKind: "created-row-text",
        itemKind: "hardware",
        itemId: CLASS_ID,
        field: "name",
      },
    ],
    [
      "a held price of a created accessory",
      [PLINTH_CREATION, PLINTH_PRICE, PLINTH_RENAME],
      PLINTH_PRICE.address,
      {
        changeKind: "accessory",
        itemKind: "accessory",
        itemId: PLINTH_ID,
        field: "perUnitMinor",
      },
    ],
    [
      "a plain price",
      [UNRELATED, ...CREATED_CLASS],
      UNRELATED.address,
      { changeKind: "depth-rule" },
    ],
  ];

  it.each(CASES)(
    "is exact for %s",
    async (_name, stored, address, expected) => {
      await plant(stored);
      const before = await snapshot();

      const answer = await revertOf(address);

      expect(answer.status).toBe(200);
      const after = await storedChanges();
      const removed = before.changes.length - after.length;
      expect(removed).toBeGreaterThan(0);
      expect(lastAuditDetail(before.rows)).toEqual({
        ...expected,
        revertedCount: removed,
      });
    },
  );

  it.each([
    ["a rename", "created-row-text", 2],
    ["a price", "accessory", 3],
    ["a depth rule", "depth-rule", 2],
  ])(
    "refuses an audit row of %s that counts more than one change",
    (_name, changeKind, count) => {
      const detail =
        changeKind === "created-row-text"
          ? {
              changeKind,
              itemKind: "hardware",
              itemId: CLASS_ID,
              field: "name",
              revertedCount: count,
            }
          : changeKind === "accessory"
            ? {
                changeKind,
                itemKind: "accessory",
                itemId: PLINTH_ID,
                field: "perUnitMinor",
                revertedCount: count,
              }
            : { changeKind, revertedCount: count };

      expect(readDashboardAuditEntry("price-draft-reverted", detail).ok).toBe(
        false,
      );
    },
  );

  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1, "3", null])(
    "refuses a creation's audit row that counts %s",
    (revertedCount) => {
      const detail = {
        changeKind: "hardware-tier-created",
        itemKind: "hardware",
        itemId: CLASS_ID,
        revertedCount,
      };

      expect(readDashboardAuditEntry("price-draft-reverted", detail).ok).toBe(
        false,
      );
    },
  );

  it.each([1, 2, 7, Number.MAX_SAFE_INTEGER])(
    "accepts a creation's audit row that counts %s",
    (revertedCount) => {
      const detail = {
        changeKind: "accessory-created",
        itemKind: "accessory",
        itemId: PLINTH_ID,
        revertedCount,
      };

      expect(readDashboardAuditEntry("price-draft-reverted", detail).ok).toBe(
        true,
      );
    },
  );
});

describe("a stored draft that names a field no row has", () => {
  const PLANTED = [
    [
      "a cabinet",
      { kind: "cabinet", ruleId: "cabinet.base-3drawer", field: "bogus" },
    ],
    [
      "a hardware class",
      { kind: "hardware", tierId: "hardware.soft-close", field: "bogus" },
    ],
    [
      "a material",
      { kind: "material", tierId: "material.veneer", field: "bogus" },
    ],
    [
      "an accessory",
      { kind: "accessory", accessoryId: PLINTH_ID, field: "bogus" },
    ],
    [
      "a created row's words",
      { kind: "created-row-text", item: CLASS, field: "bogus" },
    ],
    [
      "a cabinet with a numeric field",
      { kind: "cabinet", ruleId: "cabinet.base-3drawer", field: 1 },
    ],
    [
      "a hardware class with no field",
      { kind: "hardware", tierId: "hardware.soft-close" },
    ],
    [
      "a hardware class with a field of the accessories",
      {
        kind: "hardware",
        tierId: "hardware.soft-close",
        field: "perUnitMinor",
      },
    ],
    [
      "an accessory with a rate as its field",
      { kind: "accessory", accessoryId: PLINTH_ID, field: RATE },
    ],
    [
      "a material with a rate as its field",
      { kind: "material", tierId: "material.veneer", field: RATE },
    ],
  ] as const;

  it.each(PLANTED)(
    "makes the draft unreadable whole: %s",
    async (_name, address) => {
      await plant([UNRELATED, { address, value: 5 }]);

      const state = await readState({ cookie });

      expect(state.status).toBe(409);
      expect(await jsonOf(state)).toMatchObject({ status: "draft-unreadable" });
    },
  );

  it.each(PLANTED)(
    "is answered on both writes as an unreadable draft, which neither changes nor audits: %s",
    async (_name, address) => {
      await plant([UNRELATED, { address, value: 5 }]);
      const before = await snapshot();

      const viaChange = await sendChange({
        address: { kind: "provisional" },
        value: true,
      });
      const viaRevert = await revertOf(UNRELATED.address);

      expect(viaChange.status).toBe(409);
      expect(viaRevert.status).toBe(409);
      expect(await storedChanges()).toEqual(before.changes);
      expect(auditRows()).toHaveLength(before.rows);
    },
  );

  it.each(PLANTED)(
    "is given up whole by a discard, which reads nothing: %s",
    async (_name, address) => {
      await plant([UNRELATED, { address, value: 5 }]);
      const revision = await currentDraftRevision();

      const answer = await revertDraft({
        cookie,
        json: { expectedDraftRevision: revision, scope: "all" },
      });

      expect(answer.status).toBe(200);
      expect(await storedChanges()).toEqual([]);
    },
  );

  it("reads every field each kind's own list names, so a draft the routes could write is still readable", async () => {
    const readable: DraftChange[] = [
      {
        address: {
          kind: "cabinet",
          ruleId: "cabinet.base-3drawer",
          field: "anchorMinor",
        },
        value: 500_000,
      },
      {
        address: {
          kind: "hardware",
          tierId: "hardware.soft-close",
          field: RATE,
        },
        value: 2_000,
      },
      {
        address: {
          kind: "material",
          tierId: "material.veneer",
          field: "percentOfCabinets",
        },
        value: 12,
      },
      {
        address: {
          kind: "accessory",
          accessoryId: PLINTH_ID,
          field: "perUnitMinor",
        },
        value: 100,
      },
      {
        address: {
          kind: "cabinet-size",
          ruleId: "cabinet.base-3drawer",
          widthMm: 600,
        },
        value: 100,
      },
      UNRELATED,
    ];
    await plant(readable);

    const state = await readState({ cookie });

    expect(state.status).toBe(200);
  });
});
