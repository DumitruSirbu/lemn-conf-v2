import { fc, test as propertyTest } from "@fast-check/vitest";
import { afterEach, beforeEach, expect, vi } from "vitest";

import {
  HARDWARE_RATE_FIELDS,
  MAX_PRICE_COEFFICIENT_MINOR,
  SAMPLE_PRICE_BOOK,
  applyChanges,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import { jsonOf } from "../../../support/account-world";
import {
  ACCESSORY_VALUE,
  CLASS_WORDS,
  createAccessoryAs,
  createClassAs,
  mintedIdOf,
  ratesOf,
  revertAs,
  startCreationWorld,
  storedChangesOf,
  type CreationWorld,
} from "../../../support/creation-world";
import { readState } from "../../../support/price-dashboard-requests";

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

// Whatever a client puts in a creation, the route answers 200, 400 or 409 and nothing else. A refusal leaves the draft and
// the audit log as they were; an acceptance leaves a draft the domain still makes a book of, one new row under an id of the
// shape a minted id has, no deletion, and a draft the dashboard reads back. The row is then taken back by its creation.

const MINTED_ID = /^[A-Za-z0-9]{21}$/;

let world: CreationWorld;

beforeEach(async () => {
  world = await startCreationWorld(SAMPLE_PRICE_BOOK);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const RUNS = 200;
const ANSWERS_OF_A_CREATION = [200, 400, 409];

const anyCodeUnit = fc
  .integer({ min: 0, max: 0xffff })
  .map((unit) => String.fromCharCode(unit));
const wildText = fc.oneof(
  fc.string({ maxLength: 120 }),
  fc.string({ unit: anyCodeUnit, maxLength: 120 }),
  fc.string({ unit: "binary", maxLength: 120 }),
  fc.constantFrom(
    "",
    " ",
    "GTV Economic",
    "Café",
    "a‮b",
    "500 lei",
    "x".repeat(81),
    "x".repeat(241),
    "\u{1F600}".repeat(41),
  ),
);
// Most draws are well-formed, so that a good share of the requests are accepted and the acceptance side is exercised too.
const WELL_FORMED_WEIGHT = 12;
const goodText = fc.stringMatching(/^[A-Za-z][A-Za-z ]{0,38}[A-Za-z]$/);
const wildValue = fc.oneof(
  { weight: WELL_FORMED_WEIGHT, arbitrary: goodText },
  wildText,
  fc.integer(),
  fc.constant(null),
  fc.boolean(),
  fc.array(fc.string(), { maxLength: 2 }),
);
const wildAmount = fc.oneof(
  {
    weight: WELL_FORMED_WEIGHT,
    arbitrary: fc.integer({ min: 1, max: 5_000_000 }),
  },
  fc.integer({ min: -3, max: 3 }),
  fc.double(),
  fc.constantFrom(
    0,
    -0,
    MAX_PRICE_COEFFICIENT_MINOR,
    MAX_PRICE_COEFFICIENT_MINOR + 1,
    Number.MAX_SAFE_INTEGER,
  ),
  fc.string({ maxLength: 4 }),
  fc.constant(null),
  fc.boolean(),
);
const extraMembers = fc.oneof(
  { weight: WELL_FORMED_WEIGHT, arbitrary: fc.constant({}) },
  fc.dictionary(
    fc.constantFrom("id", "tierId", "ruleId", "nameKey", "kind", "__proto__"),
    fc.string({ maxLength: 8 }),
    { maxKeys: 2 },
  ),
);

const classValue = fc
  .record({ name: wildValue, description: wildValue, extra: extraMembers })
  .map(({ extra, ...words }) => ({ ...extra, ...words }));
const classRates = fc.record(
  Object.fromEntries(HARDWARE_RATE_FIELDS.map((field) => [field, wildAmount])),
  { requiredKeys: [] },
);
const accessoryValue = fc
  .record({
    linkedBuildId: fc.oneof(
      {
        weight: WELL_FORMED_WEIGHT,
        arbitrary: fc.constantFrom(
          ...SAMPLE_PRICE_BOOK.cabinetRules.map(({ buildId }) => buildId),
        ),
      },
      wildText,
    ),
    perUnitMinor: wildAmount,
    name: wildValue,
    description: fc.oneof(
      { weight: WELL_FORMED_WEIGHT, arbitrary: fc.constant(undefined) },
      wildValue,
    ),
    extra: extraMembers,
  })
  .map(({ extra, ...members }) => ({ ...extra, ...members }));

interface Before {
  readonly changes: readonly DraftChange[];
  readonly audits: number;
}

async function snapshot(): Promise<Before> {
  return {
    changes: await storedChangesOf(world.prices),
    audits: world.prices.ledger.heldEvents().length,
  };
}

async function expectUntouched(before: Before): Promise<void> {
  expect(await storedChangesOf(world.prices)).toEqual(before.changes);
  expect(world.prices.ledger.heldEvents()).toHaveLength(before.audits);
}

async function expectCoherentAfterAccepting(
  before: Before,
  expectedAddedChanges: number,
): Promise<void> {
  const changes = await storedChangesOf(world.prices);
  expect(changes).toHaveLength(before.changes.length + expectedAddedChanges);
  expect(applyChanges(SAMPLE_PRICE_BOOK, changes).ok).toBe(true);
  expect(changes.some(({ address }) => address.kind === "item-deleted")).toBe(
    false,
  );
  expect(world.prices.ledger.heldEvents()).toHaveLength(before.audits + 1);
  const read = await readState({ cookie: world.cookie });
  expect(read.status).toBe(200);
  expect(
    ((await jsonOf(read)) as { draft: { changes: unknown } }).draft.changes,
  ).toEqual(changes);
}

async function takeBackByCreation(
  creation: DraftChange["address"],
): Promise<void> {
  const answer = await revertAs(world.cookie, {
    kind: "change",
    address: creation,
  });
  expect(answer.status).toBe(200);
  expect(await storedChangesOf(world.prices)).toEqual([]);
}

propertyTest.prop([classValue, classRates], { numRuns: RUNS })(
  "a class created from any words and any rates is refused without a trace or accepted whole",
  async (value, rates) => {
    const before = await snapshot();

    const answer = await createClassAs(world.cookie, { value, rates });

    expect(ANSWERS_OF_A_CREATION).toContain(answer.status);
    if (answer.status !== 200) return expectUntouched(before);
    const tierId = await mintedIdOf(answer);
    expect(tierId).toMatch(MINTED_ID);
    await expectCoherentAfterAccepting(before, 1 + HARDWARE_RATE_FIELDS.length);
    return takeBackByCreation({ kind: "hardware-tier-created", tierId });
  },
);

propertyTest.prop([accessoryValue], { numRuns: RUNS })(
  "an accessory created from any words, price and link is refused without a trace or accepted whole",
  async (value) => {
    const before = await snapshot();

    const answer = await createAccessoryAs(world.cookie, { value });

    expect(ANSWERS_OF_A_CREATION).toContain(answer.status);
    if (answer.status !== 200) return expectUntouched(before);
    const accessoryId = await mintedIdOf(answer);
    expect(accessoryId).toMatch(MINTED_ID);
    await expectCoherentAfterAccepting(before, 1);
    return takeBackByCreation({ kind: "accessory-created", accessoryId });
  },
);

propertyTest.prop(
  [fc.array(fc.constantFrom("class", "accessory"), { maxLength: 12 })],
  { numRuns: 25 },
)(
  "any sequence of creations leaves every id different and every class with all its rates",
  async (kinds) => {
    world = await startCreationWorld(SAMPLE_PRICE_BOOK);
    const ids: string[] = [];
    for (const kind of kinds) {
      const answer =
        kind === "class"
          ? await createClassAs(world.cookie, {
              value: CLASS_WORDS,
              rates: ratesOf(1_000),
            })
          : await createAccessoryAs(world.cookie, { value: ACCESSORY_VALUE });
      expect(answer.status).toBe(200);
      ids.push(await mintedIdOf(answer));
    }

    expect(new Set(ids).size).toBe(ids.length);
    const changes = await storedChangesOf(world.prices);
    expect(applyChanges(SAMPLE_PRICE_BOOK, changes).ok).toBe(true);
    const classes = kinds.filter((kind) => kind === "class").length;
    expect(changes).toHaveLength(
      kinds.length + classes * HARDWARE_RATE_FIELDS.length,
    );
    for (const { address } of changes) {
      if (address.kind === "hardware") {
        expect(ids).toContain(address.tierId);
      }
    }
  },
);
