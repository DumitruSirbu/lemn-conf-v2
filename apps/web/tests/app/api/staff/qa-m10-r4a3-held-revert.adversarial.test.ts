import { fc, test as propertyTest } from "@fast-check/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HARDWARE_RATE_FIELDS,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import { IDLE_LIFETIME_SECONDS_BY_ROLE } from "@/lib/server/account/session-lifetimes";
import { CLIENT_NETWORK_SOURCE_VARIABLE } from "@/lib/server/rate-limit/network-source";

import { freshAccountWorld, jsonOf } from "../../../support/account-world";
import {
  changeDraft,
  currentDraftRevision,
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

// The draft route's revert once it refuses an address the draft does not hold: the identity of an address, the creation
// put again, the retry of a lost answer, and a client-controlled `field` on either route.

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

async function sendRawRevert(targetText: string) {
  const revision = await currentDraftRevision();
  return revertDraft({
    cookie,
    json: `{"expectedDraftRevision":"${revision}","target":${targetText}}`,
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

const NAME_ADDRESS = {
  kind: "created-row-text",
  item: CLASS,
  field: "name",
} as const;
const RENAME: DraftChange = { address: NAME_ADDRESS, value: "GTV Max" };

describe("the identity of a held address", () => {
  it("reverts a rename named with its members in another order", async () => {
    await plant([...CREATED_CLASS, RENAME]);

    const answer = await sendRawRevert(
      '{"kind":"change","address":{"field":"name","item":{"tierId":"hardware.economic","kind":"hardware"},"kind":"created-row-text"}}',
    );

    expect(answer.status).toBe(200);
    expect(await storedChanges()).toEqual(CREATED_CLASS);
  });

  it("reverts a creation named with its members in another order, taking its rate and words", async () => {
    await plant([...CREATED_CLASS, RENAME]);

    const answer = await sendRawRevert(
      '{"kind":"change","address":{"tierId":"hardware.economic","kind":"hardware-tier-created"}}',
    );

    expect(answer.status).toBe(200);
    expect(await storedChanges()).toEqual([]);
  });

  it.each([
    ["a rename with an extra member", { ...NAME_ADDRESS, extra: true }],
    [
      "a rename whose item has an extra member",
      { ...NAME_ADDRESS, item: { ...CLASS, extra: true } },
    ],
    [
      "a creation with an extra member",
      { ...CLASS_CREATION.address, extra: true },
    ],
  ])(
    "refuses %s as a request it does not read, and removes nothing",
    async (_name, address) => {
      await plant([...CREATED_CLASS, RENAME]);
      const before = await snapshot();

      const answer = await revertOf(address);

      expect(answer.status).toBe(400);
      expect(await storedChanges()).toEqual(before.changes);
      expect(auditRows()).toHaveLength(before.rows);
    },
  );

  it.each([
    [
      "a tier of another kind",
      { ...NAME_ADDRESS, item: { kind: "accessory", accessoryId: CLASS_ID } },
    ],
    [
      "a tier of the same id in another case",
      {
        ...NAME_ADDRESS,
        item: { kind: "hardware", tierId: "Hardware.Economic" },
      },
    ],
    [
      "the other word of the same row",
      { ...NAME_ADDRESS, field: "description" },
    ],
    [
      "the id with a trailing space",
      {
        ...NAME_ADDRESS,
        item: { kind: "hardware", tierId: "hardware.economic " },
      },
    ],
  ])("does not take %s for the held rename", async (_name, address) => {
    await plant([...CREATED_CLASS, RENAME]);
    const before = await snapshot();

    const answer = await revertOf(address);

    expect(answer.status).toBe(400);
    expect(await storedChanges()).toEqual(before.changes);
    expect(auditRows()).toHaveLength(before.rows);
  });
});

describe("the retry of an answer that was lost, and a revert racing a change", () => {
  it("answers the second revert of one rename as an address the draft does not hold, leaving the class", async () => {
    await plant([...CREATED_CLASS, RENAME]);
    const first = await revertOf(NAME_ADDRESS);
    expect(first.status).toBe(200);
    const before = await snapshot();

    const retry = await revertOf(NAME_ADDRESS);

    expect({ status: retry.status, body: await jsonOf(retry) }).toEqual({
      status: 400,
      body: issue("address", "UNKNOWN_ADDRESS"),
    });
    expect(await storedChanges()).toEqual(CREATED_CLASS);
    expect(auditRows()).toHaveLength(before.rows);
  });

  it("answers a revert that names a revision before the rename as changed meanwhile, and keeps the rename", async () => {
    await plant(CREATED_CLASS);
    const staleRevision = await currentDraftRevision();
    const renamed = await sendChange({
      address: NAME_ADDRESS,
      value: "GTV Max",
    });
    expect(renamed.status).toBe(200);
    const before = await snapshot();

    const answer = await revertDraft({
      cookie,
      json: {
        expectedDraftRevision: staleRevision,
        target: { kind: "change", address: NAME_ADDRESS },
      },
    });

    expect({ status: answer.status, body: await jsonOf(answer) }).toEqual({
      status: 409,
      body: { status: "changed-meanwhile" },
    });
    expect(await storedChanges()).toEqual(before.changes);
    expect(auditRows()).toHaveLength(before.rows);
  });

  it("lets only one of a rename and a revert of that rename win when both name the same revision, and never loses the class", async () => {
    await plant([...CREATED_CLASS, RENAME]);
    const revision = await currentDraftRevision();

    const [changed, reverted] = await Promise.all([
      changeDraft({
        cookie,
        json: {
          expectedDraftRevision: revision,
          change: { address: NAME_ADDRESS, value: "GTV Plus" },
        },
      }),
      revertDraft({
        cookie,
        json: {
          expectedDraftRevision: revision,
          target: { kind: "change", address: NAME_ADDRESS },
        },
      }),
    ]);

    expect([changed.status, reverted.status].sort()).toEqual([200, 409]);
    const left = await storedChanges();
    expect(left.slice(0, CREATED_CLASS.length)).toEqual(CREATED_CLASS);
  });

  it("lets only one of two reverts of the same rename win, and leaves the class", async () => {
    await plant([...CREATED_CLASS, RENAME]);
    const revision = await currentDraftRevision();
    const send = () =>
      revertDraft({
        cookie,
        json: {
          expectedDraftRevision: revision,
          target: { kind: "change", address: NAME_ADDRESS },
        },
      });

    const answers = await Promise.all([send(), send()]);

    expect(answers.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(await storedChanges()).toEqual(CREATED_CLASS);
  });
});

describe("a creation put again and then reverted", () => {
  it("is held by its address, whatever it carries, and takes the row's rates and words", async () => {
    await plant([...CREATED_CLASS, RENAME]);
    const revised: DraftChange = {
      address: CLASS_CREATION.address,
      value: { name: "GTV Plus", description: "Nou" },
    };
    await plant([revised, ...CLASS_RATES, RENAME]);

    const answer = await revertOf(CLASS_CREATION.address);

    expect(answer.status).toBe(200);
    expect(await storedChanges()).toEqual([]);
  });
});

describe("a field a client controls", () => {
  const HOSTILE_FIELDS = [
    "",
    "bogus",
    "name ",
    "NAME",
    "__proto__",
    "constructor",
    "toString",
    "‮name",
    "na\u0000me",
    "\u{1F373}",
    "f".repeat(64),
    "f".repeat(65),
    "perUnitMinor",
    HARDWARE_RATE_FIELDS[0],
  ];
  const KINDS_WITH_FIELD = [
    (field: unknown) => ({ kind: "created-row-text", item: CLASS, field }),
    (field: unknown) => ({ kind: "created-row-text", item: PLINTH, field }),
    (field: unknown) => ({ kind: "hardware", tierId: CLASS_ID, field }),
    (field: unknown) => ({
      kind: "material",
      tierId: "material.veneer",
      field,
    }),
    (field: unknown) => ({ kind: "accessory", accessoryId: PLINTH_ID, field }),
    (field: unknown) => ({
      kind: "cabinet",
      ruleId: "cabinet.base-3drawer",
      field,
    }),
  ];

  async function plantedWorld() {
    await plant([...CREATED_CLASS, RENAME, PLINTH_CREATION]);
    return snapshot();
  }

  function answersOutsideAnOutage(status: number): boolean {
    return status === 200 || status === 400 || status === 409;
  }

  it.each(HOSTILE_FIELDS.map((field) => [JSON.stringify(field), field]))(
    "answers %s as the field of every kind on the revert route with a 4xx, never removing a row the address does not name",
    async (_name, field) => {
      for (const addressOf of KINDS_WITH_FIELD) {
        const before = await plantedWorld();

        const answer = await revertOf(addressOf(field));

        expect(
          answersOutsideAnOutage(answer.status),
          JSON.stringify(addressOf(field)),
        ).toBe(true);
        if (answer.status !== 200) {
          expect(await storedChanges()).toEqual(before.changes);
          expect(auditRows()).toHaveLength(before.rows);
        }
      }
    },
  );

  it.each(HOSTILE_FIELDS.map((field) => [JSON.stringify(field), field]))(
    "answers %s as the field of every kind on the change route with a 4xx, writing nothing",
    async (_name, field) => {
      for (const addressOf of KINDS_WITH_FIELD) {
        const before = await plantedWorld();

        const answer = await sendChange({
          address: addressOf(field),
          value: 5,
        });

        expect(
          answersOutsideAnOutage(answer.status),
          JSON.stringify(addressOf(field)),
        ).toBe(true);
        if (answer.status !== 200) {
          expect(await storedChanges()).toEqual(before.changes);
          expect(auditRows()).toHaveLength(before.rows);
        }
      }
    },
  );

  propertyTest.prop(
    [fc.string({ maxLength: 70 }), fc.constantFrom(...KINDS_WITH_FIELD.keys())],
    {
      numRuns: 120,
    },
  )(
    "never answers 5xx or removes a change it does not name, for any text as the field of a revert",
    async (field, which) => {
      const before = await plantedWorld();
      const address = KINDS_WITH_FIELD[which]?.(field);

      const answer = await revertOf(address);

      expect(answer.status).toBeLessThan(500);
      if (answer.status !== 200) {
        expect(await storedChanges()).toEqual(before.changes);
        expect(auditRows()).toHaveLength(before.rows);
      }
    },
  );

  it("removes a row only for an address the draft holds: a held rate of a created class takes the class", async () => {
    await plantedWorld();

    const answer = await revertOf({
      kind: "hardware",
      tierId: CLASS_ID,
      field: HARDWARE_RATE_FIELDS[0],
    });

    expect(answer.status).toBe(200);
    expect(JSON.stringify(await storedChanges())).not.toContain(CLASS_ID);
  });
});
