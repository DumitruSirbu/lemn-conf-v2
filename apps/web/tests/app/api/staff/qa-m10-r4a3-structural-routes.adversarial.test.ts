import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HARDWARE_RATE_FIELDS,
  SAMPLE_PRICE_BOOK,
  applyChanges,
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

// The structural kinds against the draft route as the tree has it: a draft planted in the store (no route makes a
// creation or a deletion yet), then the requests a hostile or confused client could send. The assertions state what a
// route must answer; a red test names a request that gets another answer.

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
const SOFT_CLOSE = { kind: "hardware", tierId: "hardware.soft-close" } as const;

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

async function sendRawChange(changeText: string) {
  const revision = await currentDraftRevision();
  return changeDraft({
    cookie,
    json: `{"expectedDraftRevision":"${revision}","change":${changeText}}`,
  });
}

function revertOf(address: unknown) {
  return sendRevert({ kind: "change", address });
}

function issue(field: string, code: string) {
  return { status: "invalid-input", issues: [{ field, code }] };
}

async function expectRefusedAndUntouched(
  answer: Response,
  expected: { status: number; body: unknown },
  before: { changes: unknown; rows: number },
) {
  expect({ status: answer.status, body: await jsonOf(answer) }).toEqual(
    expected,
  );
  expect(await storedChanges()).toEqual(before.changes);
  expect(auditRows()).toHaveLength(before.rows);
}

async function snapshot() {
  return { changes: await storedChanges(), rows: auditRows().length };
}

describe("a revert of words the draft does not hold", () => {
  const NAME_OF_CLASS = {
    kind: "created-row-text",
    item: CLASS,
    field: "name",
  };

  it("leaves a created class standing: undoing a rename that was never made removes nothing", async () => {
    await plant(CREATED_CLASS);
    const before = await snapshot();

    const answer = await revertOf(NAME_OF_CLASS);

    await expectRefusedAndUntouched(
      answer,
      { status: 400, body: issue("address", "UNKNOWN_ADDRESS") },
      before,
    );
  });

  it("leaves a created class standing when the description was never reworded", async () => {
    await plant([
      ...CREATED_CLASS,
      { address: NAME_OF_CLASS, value: "GTV Max" },
    ]);
    const before = await snapshot();

    const answer = await revertOf({ ...NAME_OF_CLASS, field: "description" });

    await expectRefusedAndUntouched(
      answer,
      { status: 400, body: issue("address", "UNKNOWN_ADDRESS") },
      before,
    );
  });

  it("leaves a created accessory standing when its words were never reworded", async () => {
    await plant([PLINTH_CREATION]);
    const before = await snapshot();

    const answer = await revertOf({
      kind: "created-row-text",
      item: PLINTH,
      field: "name",
    });

    await expectRefusedAndUntouched(
      answer,
      { status: 400, body: issue("address", "UNKNOWN_ADDRESS") },
      before,
    );
  });

  const UNKNOWN_FIELDS = [
    ["a field no created row has", "bogus"],
    ["a direction override", "\u202Ename"],
    ["a control character", "na\u0007me"],
    ["a field as long as an id may be", "f".repeat(64)],
  ] as const;

  it.each(UNKNOWN_FIELDS)(
    "answers %s as the field a refusal of the address, never an outage",
    async (_name, field) => {
      await plant(CREATED_CLASS);

      const answer = await revertOf({ ...NAME_OF_CLASS, field });

      expect({ status: answer.status, body: await jsonOf(answer) }).toEqual({
        status: 400,
        body: issue("address", "UNKNOWN_ADDRESS"),
      });
    },
  );

  it.each(UNKNOWN_FIELDS)(
    "leaves a created class standing for %s as the field",
    async (_name, field) => {
      await plant(CREATED_CLASS);
      const before = await snapshot();

      await revertOf({ ...NAME_OF_CLASS, field });

      expect(await storedChanges()).toEqual(before.changes);
      expect(auditRows()).toHaveLength(before.rows);
    },
  );

  it("never writes an audit row that names a field no row has", async () => {
    await plant(CREATED_CLASS);
    const before = await snapshot();

    await revertOf({ ...NAME_OF_CLASS, field: "bogus" });

    const written = auditRows().slice(before.rows);
    expect(JSON.stringify(written)).not.toContain("bogus");
  });

  it("leaves a created accessory standing when its price was never changed", async () => {
    await plant([PLINTH_CREATION]);
    const before = await snapshot();

    const answer = await revertOf({
      kind: "accessory",
      accessoryId: PLINTH_ID,
      field: "perUnitMinor",
    });

    await expectRefusedAndUntouched(
      answer,
      { status: 400, body: issue("address", "UNKNOWN_ADDRESS") },
      before,
    );
  });

  it("leaves a created class standing when a rate field it has no such change for is named", async () => {
    await plant(CREATED_CLASS);
    const before = await snapshot();

    const answer = await revertOf({
      kind: "hardware",
      tierId: CLASS_ID,
      field: "bogus",
    });

    await expectRefusedAndUntouched(
      answer,
      { status: 400, body: issue("address", "UNKNOWN_ADDRESS") },
      before,
    );
  });

  it("answers the audit row it writes in a form the audit log reads, whatever the draft becomes", async () => {
    await plant(CREATED_CLASS);
    const before = await snapshot();

    const answer = await revertOf(NAME_OF_CLASS);

    const [row] = auditRows().slice(before.rows);
    if (answer.status === 200 && row !== undefined) {
      expect(readDashboardAuditEntry(row.action, row.detail).ok).toBe(true);
    }
  });
});

describe("a deletion in the draft and a revert of a field of the deleted item", () => {
  const DELETION: DraftChange = {
    address: { kind: "item-deleted", item: SOFT_CLOSE },
    value: true,
  };

  it.each([
    [
      "a rate of the deleted class",
      {
        kind: "hardware",
        tierId: SOFT_CLOSE.tierId,
        field: HARDWARE_RATE_FIELDS[0],
      },
    ],
    [
      "the words of the deleted class",
      { kind: "created-row-text", item: SOFT_CLOSE, field: "name" },
    ],
  ])(
    "refuses the revert of %s as an address the draft does not hold, and leaves the deletion and writes no audit row",
    async (_name, address) => {
      await plant([DELETION]);
      const before = await snapshot();

      const answer = await revertOf(address);

      await expectRefusedAndUntouched(
        answer,
        { status: 400, body: issue("address", "UNKNOWN_ADDRESS") },
        before,
      );
    },
  );

  it("is taken back by its own address (R4c2), which leaves the draft without it and writes one reverted row", async () => {
    await plant([DELETION]);
    const rowsBefore = auditRows().length;

    const answer = await revertOf(DELETION.address);

    expect(answer.status).toBe(200);
    expect(await storedChanges()).toEqual([]);
    expect(auditRows()).toHaveLength(rowsBefore + 1);
    expect(auditRows().at(-1)?.action).toBe("price-draft-reverted");
  });
});

describe("item-deleted through every request path", () => {
  const DELETION_ADDRESS = { kind: "item-deleted", item: SOFT_CLOSE };
  const RAW_REPEATED_KIND_DELETION =
    '{"address":{"kind":"depth-rule","kind":"item-deleted","item":{"kind":"hardware","tierId":"hardware.soft-close"}},"value":true}';

  it("is stored by the change route as a well-formed deletion of an unused row, with one audit row naming it", async () => {
    const rowsBefore = auditRows().length;

    const answer = await sendChange({ address: DELETION_ADDRESS, value: true });

    expect(answer.status).toBe(200);
    expect(await storedChanges()).toEqual([
      { address: DELETION_ADDRESS, value: true },
    ]);
    expect(auditRows()).toHaveLength(rowsBefore + 1);
    expect(auditRows().at(-1)).toMatchObject({
      action: "price-draft-changed",
      detail: { changeKind: "item-deleted", itemKind: "hardware" },
    });
  });

  it.each([
    [
      "a deletion with an extra member",
      { ...DELETION_ADDRESS, extra: 1 },
      { status: "invalid-request" },
    ],
    [
      "a deletion with no item",
      { kind: "item-deleted" },
      issue("address", "UNKNOWN_ADDRESS"),
    ],
    [
      "a deletion of an item of no kind",
      { kind: "item-deleted", item: {} },
      issue("address", "UNKNOWN_ADDRESS"),
    ],
    [
      "a deletion of a colour, which is not a deletable kind",
      { kind: "item-deleted", item: { kind: "colour", colourId: "walnut" } },
      issue("address", "UNKNOWN_ADDRESS"),
    ],
    [
      "a deletion of an accessory the book does not state",
      { kind: "item-deleted", item: PLINTH },
      issue("change", "UNKNOWN_ITEM"),
    ],
  ])("is refused on the change route: %s", async (_name, address, body) => {
    const before = await snapshot();

    const answer = await sendChange({ address, value: true });

    await expectRefusedAndUntouched(answer, { status: 400, body }, before);
  });

  it.each([
    [
      "a deletion the draft does not hold",
      DELETION_ADDRESS,
      issue("address", "UNKNOWN_ADDRESS"),
    ],
    [
      "a deletion with an extra member",
      { ...DELETION_ADDRESS, extra: 1 },
      { status: "invalid-request" },
    ],
    [
      "a deletion with no item",
      { kind: "item-deleted" },
      issue("address", "UNKNOWN_ADDRESS"),
    ],
  ])("is refused on the revert route: %s", async (_name, address, body) => {
    const before = await snapshot();

    const answer = await revertOf(address);

    await expectRefusedAndUntouched(answer, { status: 400, body }, before);
  });

  it.each([
    [
      "an item reference that names the deletion kind",
      {
        kind: "created-row-text",
        item: { kind: "item-deleted", item: SOFT_CLOSE },
        field: "name",
      },
    ],
    [
      "an address nested in the address",
      { kind: "created-row-text", item: DELETION_ADDRESS, field: "name" },
    ],
    [
      "a deletion under a prototype key",
      JSON.parse('{"__proto__":{"kind":"item-deleted"}}') as unknown,
    ],
  ])("is not reached through %s", async (_name, address) => {
    const before = await snapshot();

    const viaChange = await sendChange({ address, value: "x" });
    const viaRevert = await revertOf(address);

    expect(viaChange.status).toBe(400);
    expect(viaRevert.status).toBe(400);
    expect(await storedChanges()).toEqual(before.changes);
    expect(auditRows()).toHaveLength(before.rows);
  });

  it("is refused when the revert target is a group named like a deletion", async () => {
    await plant([{ address: DELETION_ADDRESS, value: true }]);
    const before = await snapshot();

    const answer = await sendRevert({ kind: "group", groupId: "item-deleted" });

    expect(answer.status).toBe(400);
    expect(await storedChanges()).toEqual(before.changes);
  });

  // JSON takes the later of two equal keys, so this body IS a deletion: it must be stored as exactly the canonical one,
  // and it must meet the same count as any other (a design using the class refuses it), never reach a field of a rule.
  it("is read as the deletion its later kind makes, canonical in the draft, in a raw body whose address repeats the kind", async () => {
    const answer = await sendRawChange(RAW_REPEATED_KIND_DELETION);

    expect(answer.status).toBe(200);
    expect(await storedChanges()).toEqual([
      { address: DELETION_ADDRESS, value: true },
    ]);
  });

  it("meets the count all the same, in a raw body whose address repeats the kind", async () => {
    prices.designs.plant({ designId: "d-1", uses: [SOFT_CLOSE] });
    const before = await snapshot();

    const answer = await sendRawChange(RAW_REPEATED_KIND_DELETION);

    await expectRefusedAndUntouched(
      answer,
      { status: 400, body: issue("change", "ITEM_IN_USE") },
      before,
    );
  });
});

describe("a creation through the change route", () => {
  it.each([
    [
      "a class",
      {
        address: { kind: "hardware-tier-created", tierId: "hardware.fresh" },
        value: { name: "Fresh", description: "" },
      },
    ],
    [
      "an accessory",
      {
        address: { kind: "accessory-created", accessoryId: "fresh" },
        value: { linkedBuildId: "base-3drawer", perUnitMinor: 1, name: "X" },
      },
    ],
    [
      "a class over one the draft holds",
      {
        address: CLASS_CREATION.address,
        value: { name: "GTV Plus", description: "" },
      },
    ],
  ])("is refused: %s", async (_name, change) => {
    await plant(CREATED_CLASS);
    const before = await snapshot();

    const answer = await sendChange(change);

    await expectRefusedAndUntouched(
      answer,
      { status: 400, body: issue("address", "NOT_EDITABLE") },
      before,
    );
  });

  it("is refused even when the address names a member it does not take", async () => {
    const before = await snapshot();

    const answer = await sendChange({
      address: { kind: "hardware-tier-created", tierId: "x", extra: true },
      value: { name: "X", description: "" },
    });

    expect(answer.status).toBe(400);
    expect(await storedChanges()).toEqual(before.changes);
  });
});

describe("the revert of a creation", () => {
  it("takes a created class with its rates and words, and one change of the same id under another kind survives", async () => {
    const material: DraftChange = {
      address: { kind: "depth-rule" },
      value: 7,
    };
    const rename: DraftChange = {
      address: { kind: "created-row-text", item: CLASS, field: "name" },
      value: "GTV Max",
    };
    await plant([material, ...CREATED_CLASS, rename]);

    const answer = await revertOf(CLASS_CREATION.address);

    expect(answer.status).toBe(200);
    expect(await storedChanges()).toEqual([material]);
  });

  it("takes a created accessory with its price change and words", async () => {
    const price: DraftChange = {
      address: {
        kind: "accessory",
        accessoryId: PLINTH_ID,
        field: "perUnitMinor",
      },
      value: 2_000,
    };
    const rename: DraftChange = {
      address: { kind: "created-row-text", item: PLINTH, field: "name" },
      value: "Soclu cu LED",
    };
    await plant([PLINTH_CREATION, price, rename]);

    const answer = await revertOf(PLINTH_CREATION.address);

    expect(answer.status).toBe(200);
    const left = await storedChanges();
    expect(JSON.stringify(left)).not.toContain(PLINTH_ID);
    expect(left).toEqual([]);
  });

  it("writes one audit row the audit log reads, naming the row", async () => {
    await plant(CREATED_CLASS);
    const before = await snapshot();

    await revertOf(CLASS_CREATION.address);

    const written = auditRows().slice(before.rows);
    expect(written).toHaveLength(1);
    const [row] = written;
    expect(readDashboardAuditEntry(row?.action, row?.detail).ok).toBe(true);
    expect(row?.detail).toEqual({
      changeKind: "hardware-tier-created",
      itemKind: "hardware",
      itemId: CLASS_ID,
      revertedCount: CREATED_CLASS.length,
    });
  });

  it("answers a creation the draft does not hold as an address it does not know, and writes nothing", async () => {
    const before = await snapshot();

    const answer = await revertOf(CLASS_CREATION.address);

    await expectRefusedAndUntouched(
      answer,
      { status: 400, body: issue("address", "UNKNOWN_ADDRESS") },
      before,
    );
  });
});

describe("the words of a created row, on both routes", () => {
  const NAME = { kind: "created-row-text", item: CLASS, field: "name" };
  const DESCRIPTION = { ...NAME, field: "description" };

  async function maxLengthOf(field: "name" | "description") {
    for (let length = 1; length < 5_000; length += 1) {
      const answer = await sendChange({
        address: field === "name" ? NAME : DESCRIPTION,
        value: "a".repeat(length),
      });
      if (answer.status !== 200) return length - 1;
    }
    throw new Error("no bound");
  }

  it.each([
    ["not in composed form", "Café"],
    ["a right-to-left override", "GTV ‮evil"],
    ["a left-to-right isolate", "GTV ⁦x⁩"],
    ["a line separator", "GTV x"],
    ["a line feed", "GTV\nx"],
    ["a tab", "GTV\tx"],
    ["a null", "GTV\u0000x"],
    ["an escape", "GTV\u001Bx"],
    ["a lone surrogate", "GTV\uD800x"],
    ["a delete character", "GTV\u007Fx"],
  ])(
    "refuses a name %s on the change route, and writes nothing",
    async (_name, value) => {
      await plant(CREATED_CLASS);
      const before = await snapshot();

      const answer = await sendChange({ address: NAME, value });

      await expectRefusedAndUntouched(
        answer,
        { status: 400, body: issue("change", "TEXT_FORBIDDEN_CHARACTER") },
        before,
      );
    },
  );

  it.each([
    ["an empty name", "", "TEXT_EMPTY"],
    ["a blank name", "   ", "TEXT_EMPTY"],
    ["an invisible name", "​​", "TEXT_EMPTY"],
    ["a sum in lei", "GTV 500 lei", "TEXT_STATES_AN_AMOUNT"],
    [
      "a sum hidden by a zero-width space",
      "GTV 500 l​ei",
      "TEXT_STATES_AN_AMOUNT",
    ],
    ["a sum in euro signs", "GTV €500", "TEXT_STATES_AN_AMOUNT"],
    ["a percentage", "GTV 10%", "TEXT_STATES_AN_AMOUNT"],
    ["a percentage in words", "GTV zece la suta", "TEXT_STATES_AN_AMOUNT"],
    ["an inclusion", "GTV montaj inclus", "TEXT_STATES_AN_AMOUNT"],
  ])(
    "refuses %s on the change route with the rule's code",
    async (_name, value, code) => {
      await plant(CREATED_CLASS);
      const before = await snapshot();

      const answer = await sendChange({ address: NAME, value });

      await expectRefusedAndUntouched(
        answer,
        { status: 400, body: issue("change", code) },
        before,
      );
    },
  );

  it.each([
    ["null", null],
    ["a number", 5],
    ["a list", ["GTV"]],
    ["an object", { text: "GTV" }],
    ["true", true],
  ])("refuses %s as a name, and a missing value too", async (_name, value) => {
    await plant(CREATED_CLASS);
    const before = await snapshot();

    const answer = await sendChange({ address: NAME, value });

    await expectRefusedAndUntouched(
      answer,
      { status: 400, body: issue("change", "MISSING_VALUE") },
      before,
    );
  });

  it("refuses a change with no value member", async () => {
    await plant(CREATED_CLASS);
    const before = await snapshot();

    const answer = await sendChange({ address: NAME });

    await expectRefusedAndUntouched(
      answer,
      { status: 400, body: issue("change", "MISSING_VALUE") },
      before,
    );
  });

  it("takes a name of exactly the bound and refuses one unit more", async () => {
    await plant(CREATED_CLASS);

    const bound = await maxLengthOf("name");

    expect(bound).toBeGreaterThan(0);
    const tooLong = await sendChange({
      address: NAME,
      value: "a".repeat(bound + 1),
    });
    expect(await jsonOf(tooLong)).toEqual(issue("change", "TEXT_TOO_LONG"));
  });

  it("takes an empty description, which a name may not be", async () => {
    await plant(CREATED_CLASS);

    const answer = await sendChange({ address: DESCRIPTION, value: "" });

    expect(answer.status).toBe(200);
  });

  it("builds a candidate whose name is the trimmed text", async () => {
    await plant(CREATED_CLASS);

    const answer = await sendChange({ address: NAME, value: "  GTV Max  " });

    expect(answer.status).toBe(200);
    const applied = applyChanges(
      SAMPLE_PRICE_BOOK,
      (await storedChanges()) as readonly DraftChange[],
    );
    if (!applied.ok) throw new Error("the draft does not apply");
    const tier = applied.book.hardware.tiers.find(
      ({ tierId }) => tierId === CLASS_ID,
    );
    expect(tier?.name).toBe("GTV Max");
  });

  it("refuses words that carry a value on the revert route, since a revert names no value", async () => {
    await plant([...CREATED_CLASS, { address: NAME, value: "GTV Max" }]);
    const before = await snapshot();

    const answer = await sendRawRevert(
      '{"kind":"change","address":{"kind":"created-row-text","item":{"kind":"hardware","tierId":"hardware.economic"},"field":"name","value":"x"}}',
    );

    expect(answer.status).toBe(400);
    expect(await storedChanges()).toEqual(before.changes);
    expect(auditRows()).toHaveLength(before.rows);
  });

  it("refuses a name of a keyed class, which has the catalogue's words", async () => {
    const before = await snapshot();

    const answer = await sendChange({
      address: { ...NAME, item: SOFT_CLOSE },
      value: "Another",
    });

    expect(answer.status).toBe(400);
    expect(await storedChanges()).toEqual(before.changes);
  });
});

describe("a stored draft that holds a structural kind", () => {
  it.each([
    ["a creation of a class", CREATED_CLASS],
    ["a creation of an accessory", [PLINTH_CREATION]],
    [
      "a rename",
      [
        ...CREATED_CLASS,
        {
          address: { kind: "created-row-text", item: CLASS, field: "name" },
          value: "GTV Max",
        },
      ],
    ],
  ])("is read and served by the state route: %s", async (_name, changes) => {
    await plant(changes);

    const answer = await readState({ cookie });

    expect(answer.status).toBe(200);
    const body = (await jsonOf(answer)) as { draft?: { changes?: unknown } };
    expect(body.draft?.changes).toEqual(changes);
  });

  it.each([
    ["a bulk without a group", { bulk: { percent: 5, scope: "all" } }],
    ["a group without a bulk", { groupId: "g" }],
  ])("is unreadable whole when a creation carries %s", async (_name, extra) => {
    await plant([{ ...CLASS_CREATION, ...extra }]);

    const answer = await readState({ cookie });

    expect(answer.status).toBe(409);
    expect(await jsonOf(answer)).toMatchObject({ status: "draft-unreadable" });
  });
});

describe("the words of a created row, per field and per owner", () => {
  const TEXT_ADDRESSES = [
    [
      "a class's name",
      { kind: "created-row-text", item: CLASS, field: "name" },
    ],
    [
      "a class's description",
      { kind: "created-row-text", item: CLASS, field: "description" },
    ],
    [
      "an accessory's name",
      { kind: "created-row-text", item: PLINTH, field: "name" },
    ],
    [
      "an accessory's description",
      { kind: "created-row-text", item: PLINTH, field: "description" },
    ],
  ] as const;

  async function plantBoth() {
    await plant([...CREATED_CLASS, PLINTH_CREATION]);
  }

  it.each(TEXT_ADDRESSES)(
    "refuses an amount in %s and a direction override in it, writing nothing",
    async (_name, address) => {
      await plantBoth();
      const before = await snapshot();

      const amount = await sendChange({ address, value: "Montaj 500 lei" });
      const override = await sendChange({ address, value: "x‮y" });

      expect(await jsonOf(amount)).toEqual(
        issue("change", "TEXT_STATES_AN_AMOUNT"),
      );
      expect(await jsonOf(override)).toEqual(
        issue("change", "TEXT_FORBIDDEN_CHARACTER"),
      );
      expect(await storedChanges()).toEqual(before.changes);
      expect(auditRows()).toHaveLength(before.rows);
    },
  );

  it.each(TEXT_ADDRESSES)(
    "records %s as one audit row the log reads, naming the row and the field and no words",
    async (_name, address) => {
      await plantBoth();
      const before = await snapshot();

      const answer = await sendChange({ address, value: "Cuvinte noi" });

      expect(answer.status).toBe(200);
      const written = auditRows().slice(before.rows);
      expect(written).toHaveLength(1);
      const [row] = written;
      expect(readDashboardAuditEntry(row?.action, row?.detail).ok).toBe(true);
      expect(row?.detail).toEqual({
        changeKind: "created-row-text",
        itemKind: address.item.kind,
        itemId:
          address.item.kind === "hardware"
            ? address.item.tierId
            : address.item.accessoryId,
        field: address.field,
      });
      expect(JSON.stringify(row)).not.toContain("Cuvinte noi");
    },
  );

  it.each(TEXT_ADDRESSES)(
    "takes %s back alone once it was reworded, and records the revert as one change",
    async (_name, address) => {
      await plantBoth();
      await sendChange({ address, value: "Cuvinte noi" });
      const before = await snapshot();

      const answer = await revertOf(address);

      expect(answer.status).toBe(200);
      const left = await storedChanges();
      expect(left).toEqual(before.changes.slice(0, -1));
      const written = auditRows().slice(before.rows);
      expect(written).toHaveLength(1);
      const [row] = written;
      expect(readDashboardAuditEntry(row?.action, row?.detail).ok).toBe(true);
      expect(row?.detail).toMatchObject({
        changeKind: "created-row-text",
        field: address.field,
        revertedCount: 1,
      });
    },
  );

  it.each(["sinkProtectiveCover", "dishDryingRack"])(
    "refuses the words of the built-in accessory %s, which code and the catalogue own",
    async (accessoryId) => {
      const before = await snapshot();

      const answer = await sendChange({
        address: {
          kind: "created-row-text",
          item: { kind: "accessory", accessoryId },
          field: "name",
        },
        value: "Alt nume",
      });

      expect(answer.status).toBe(400);
      expect(await storedChanges()).toEqual(before.changes);
    },
  );

  it.each([
    ["a material", { kind: "material", tierId: "material.veneer" }],
    ["a finish", { kind: "finish", id: "f" }],
    ["a handle", { kind: "handle", id: "h" }],
  ])(
    "refuses the words of %s as an address it does not read",
    async (_name, item) => {
      const before = await snapshot();

      const viaChange = await sendChange({
        address: { kind: "created-row-text", item, field: "name" },
        value: "Alt nume",
      });
      const viaRevert = await revertOf({
        kind: "created-row-text",
        item,
        field: "name",
      });

      expect(await jsonOf(viaChange)).toEqual(
        issue("address", "UNKNOWN_ADDRESS"),
      );
      expect(await jsonOf(viaRevert)).toEqual(
        issue("address", "UNKNOWN_ADDRESS"),
      );
      expect(await storedChanges()).toEqual(before.changes);
    },
  );
});
