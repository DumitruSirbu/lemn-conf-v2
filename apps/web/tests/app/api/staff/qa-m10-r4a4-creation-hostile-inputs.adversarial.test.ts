import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ACCESSORY_IDS,
  HARDWARE_RATE_FIELDS,
  HandleSchema,
  MAX_PRICE_COEFFICIENT_MINOR,
  NEVER_ZERO_HARDWARE_RATES,
  PALETTE_ENTRY_IDS,
  SAMPLE_PRICE_BOOK,
  applyChanges,
  readDashboardAuditEntry,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import { STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY } from "@/lib/server/rate-limit/limit-policy";

import { jsonOf, limiterLedger } from "../../../support/account-world";
import {
  ACCESSORY_VALUE,
  CLASS_WORDS,
  LINKED_BUILD_ID,
  createAccessoryAs,
  createClassAs,
  ratesOf,
  startCreationWorld,
  storedChangesOf,
  type CreationWorld,
} from "../../../support/creation-world";
import {
  createAccessoryInDraft,
  createHardwareClassInDraft,
  currentDraftRevision,
} from "../../../support/price-dashboard-requests";
import { priceStoreAsks } from "../../../support/price-dashboard-world";
import { signedInAs } from "../../../support/staff-world";

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

// What a hostile or confused client can put in a creation's words, rates, price, link and members. Each request is
// answered by the closed code the domain gives it, or accepted; a refusal writes nothing and audits nothing.

let world: CreationWorld;

beforeEach(async () => {
  world = await startCreationWorld(SAMPLE_PRICE_BOOK);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const THE_DRAFT_BUCKET = STAFF_PRICE_DRAFT_BY_ACCOUNT_POLICY.name;
const NAME_BOUND = 80;
const DESCRIPTION_BOUND = 240;
const ASTRAL = "\u{1F600}";
const NO_PUSH_RUNNER_RATE = HARDWARE_RATE_FIELDS.filter(
  (field) => !NEVER_ZERO_HARDWARE_RATES.includes(field),
);

type Field = "name" | "description";
type Creation = "class" | "accessory";

interface TextCase {
  readonly label: string;
  readonly text: string;
  readonly code: string;
}

const FORBIDDEN = "TEXT_FORBIDDEN_CHARACTER";
const REFUSED_TEXTS: readonly TextCase[] = [
  { label: "decomposed (not NFC)", text: "Café", code: FORBIDDEN },
  { label: "a NUL", text: "a\u0000b", code: FORBIDDEN },
  { label: "a tab", text: "a\tb", code: FORBIDDEN },
  { label: "a line feed", text: "a\nb", code: FORBIDDEN },
  { label: "a carriage return", text: "a\rb", code: FORBIDDEN },
  { label: "DEL", text: "a\u007fb", code: FORBIDDEN },
  { label: "NEL (C1)", text: "a\u0085b", code: FORBIDDEN },
  { label: "a right-to-left override", text: "a‮b", code: FORBIDDEN },
  { label: "a left-to-right isolate", text: "a⁦b", code: FORBIDDEN },
  { label: "a left-to-right mark", text: "a‎b", code: FORBIDDEN },
  { label: "an Arabic letter mark", text: "a؜b", code: FORBIDDEN },
  { label: "a lone high surrogate", text: "a\uD800b", code: FORBIDDEN },
  { label: "a lone low surrogate", text: "a\uDC00b", code: FORBIDDEN },
  { label: "a line separator", text: "a b", code: FORBIDDEN },
  { label: "a paragraph separator", text: "a b", code: FORBIDDEN },
  {
    label: "an amount in lei",
    text: "Soclu 500 lei",
    code: "TEXT_STATES_AN_AMOUNT",
  },
  {
    label: "an amount in euro signs",
    text: "Soclu €5",
    code: "TEXT_STATES_AN_AMOUNT",
  },
  {
    label: "an amount hidden by a zero-width space",
    text: "500 l​ei",
    code: "TEXT_STATES_AN_AMOUNT",
  },
  {
    label: "an amount said in thousands",
    text: "5 mii de lei",
    code: "TEXT_STATES_AN_AMOUNT",
  },
  {
    label: "a percent sign",
    text: "Reducere 5%",
    code: "TEXT_STATES_AN_AMOUNT",
  },
  {
    label: "a fullwidth percent sign",
    text: "Reducere 5％",
    code: "TEXT_STATES_AN_AMOUNT",
  },
  {
    label: "a percentage in words",
    text: "cinci la suta",
    code: "TEXT_STATES_AN_AMOUNT",
  },
  {
    label: "an inclusion word",
    text: "Montaj inclus",
    code: "TEXT_STATES_AN_AMOUNT",
  },
];

const BOUNDS: Readonly<Record<Field, number>> = {
  name: NAME_BOUND,
  description: DESCRIPTION_BOUND,
};

async function create(
  kind: Creation,
  value: Readonly<Record<string, unknown>>,
): Promise<Response> {
  return kind === "class"
    ? createClassAs(world.cookie, { value })
    : createAccessoryAs(world.cookie, { value });
}

function validValue(kind: Creation): Record<string, unknown> {
  return kind === "class" ? { ...CLASS_WORDS } : { ...ACCESSORY_VALUE };
}

function auditCount(): number {
  return world.prices.ledger.heldEvents().length;
}

const KINDS: readonly Creation[] = ["class", "accessory"];

describe("created words that the text rule refuses", () => {
  const cases = KINDS.flatMap((kind) =>
    (["name", "description"] as const).flatMap((field) =>
      REFUSED_TEXTS.map((refused) => ({ kind, field, ...refused })),
    ),
  );

  it.each(cases)(
    "refuses $label in the $field of a $kind with $code, writes nothing and audits nothing",
    async ({ kind, field, text, code }) => {
      const rowsBefore = auditCount();

      const answer = await create(kind, { ...validValue(kind), [field]: text });

      expect({ status: answer.status, body: await jsonOf(answer) }).toEqual({
        status: 400,
        body: { status: "invalid-input", issues: [{ field: "change", code }] },
      });
      expect(await storedChangesOf(world.prices)).toEqual([]);
      expect(auditCount()).toBe(rowsBefore);
    },
  );
});

describe("created words at their bounds, counted in UTF-16 units", () => {
  const FIELDS = ["name", "description"] as const;

  it.each(KINDS.flatMap((kind) => FIELDS.map((field) => ({ kind, field }))))(
    "takes the $field of a $kind at exactly its bound and refuses one unit more with TEXT_TOO_LONG",
    async ({ kind, field }) => {
      const bound = BOUNDS[field];

      const atBound = await create(kind, {
        ...validValue(kind),
        [field]: "a".repeat(bound),
      });
      const pastBound = await create(kind, {
        ...validValue(kind),
        [field]: "a".repeat(bound + 1),
      });

      expect(atBound.status).toBe(200);
      expect({
        status: pastBound.status,
        body: await jsonOf(pastBound),
      }).toEqual({
        status: 400,
        body: {
          status: "invalid-input",
          issues: [{ field: "change", code: "TEXT_TOO_LONG" }],
        },
      });
    },
  );

  it.each(KINDS.flatMap((kind) => FIELDS.map((field) => ({ kind, field }))))(
    "counts a pair of units as two in the $field of a $kind: half the bound in astral characters fits, one more does not",
    async ({ kind, field }) => {
      const half = BOUNDS[field] / 2;

      const fits = await create(kind, {
        ...validValue(kind),
        [field]: ASTRAL.repeat(half),
      });
      const tooLong = await create(kind, {
        ...validValue(kind),
        [field]: ASTRAL.repeat(half + 1),
      });

      expect(fits.status).toBe(200);
      expect(tooLong.status).toBe(400);
    },
  );

  it("measures the bound on the trimmed text: a full name with spaces round it fits, and the book it makes holds it trimmed", async () => {
    const answer = await create("class", {
      ...CLASS_WORDS,
      name: `  ${"a".repeat(NAME_BOUND)}  `,
    });

    expect(answer.status).toBe(200);
    const made = applyChanges(
      SAMPLE_PRICE_BOOK,
      await storedChangesOf(world.prices),
    );
    expect(made.ok && made.book.hardware.tiers.at(-1)?.name).toBe(
      "a".repeat(NAME_BOUND),
    );
  });
});

describe("created words that say nothing or are not words", () => {
  it.each([
    ["spaces only", "   "],
    ["a zero-width space only", "​"],
    ["a byte-order mark and joiners only", "﻿‍⁠"],
    ["a Hangul filler only", "ㅤ"],
    ["the empty string", ""],
  ])("refuses a name of %s with TEXT_EMPTY on both routes", async (_, text) => {
    for (const kind of KINDS) {
      const answer = await create(kind, { ...validValue(kind), name: text });

      expect(await jsonOf(answer), kind).toEqual({
        status: "invalid-input",
        issues: [{ field: "change", code: "TEXT_EMPTY" }],
      });
    }
    expect(await storedChangesOf(world.prices)).toEqual([]);
  });

  it.each([
    ["a number", 5],
    ["null", null],
    ["a boolean", true],
    ["a list", ["Soclu"]],
    ["an object", { text: "Soclu" }],
  ])(
    "refuses a name that is %s with MISSING_VALUE on both routes",
    async (_, name) => {
      for (const kind of KINDS) {
        const answer = await create(kind, { ...validValue(kind), name });

        expect(await jsonOf(answer), kind).toEqual({
          status: "invalid-input",
          issues: [{ field: "change", code: "MISSING_VALUE" }],
        });
      }
    },
  );

  it("refuses a class with no description, which a class owes, and takes an accessory with none", async () => {
    const { description, ...withoutDescription } = CLASS_WORDS;
    void description;

    const classAnswer = await create("class", withoutDescription);
    const accessoryAnswer = await create("accessory", ACCESSORY_VALUE);

    expect(classAnswer.status).toBe(400);
    expect(accessoryAnswer.status).toBe(200);
  });

  it("refuses an accessory description that is null rather than reading it as absent", async () => {
    const answer = await create("accessory", {
      ...ACCESSORY_VALUE,
      description: null,
    });

    expect(answer.status).toBe(400);
  });

  it.each([
    ["null", "null"],
    ["a list", "[]"],
    ["a string", '"Soclu"'],
    ["a number", "7"],
  ])(
    "refuses a value that is %s with 400 before the bucket is spent",
    async (_, text) => {
      limiterLedger.counted.length = 0;
      const revision = await currentDraftRevision();

      for (const route of [
        createHardwareClassInDraft,
        createAccessoryInDraft,
      ]) {
        const answer = await route({
          cookie: world.cookie,
          json: `{"expectedDraftRevision":"${revision}","value":${text},"rates":{}}`,
        });

        expect(answer.status).toBe(400);
      }
      expect(
        limiterLedger.counted.filter((name) => name === THE_DRAFT_BUCKET),
      ).toHaveLength(0);
    },
  );

  it("makes a book that holds the words trimmed, so a name with edge spaces is not a different name", async () => {
    await create("accessory", {
      ...ACCESSORY_VALUE,
      name: "  Soclu luminos \u00a0",
    });

    const made = applyChanges(
      SAMPLE_PRICE_BOOK,
      await storedChangesOf(world.prices),
    );
    expect(made.ok && made.book.linkedAccessories.at(-1)?.name).toBe(
      "Soclu luminos",
    );
  });
});

describe("the audit row of a creation, whatever the words and the price", () => {
  it.each(KINDS)(
    "holds neither the name nor the price of a created %s, and the closed reader accepts it",
    async (kind) => {
      const rowsBefore = auditCount();
      const marker = "Zorilas";

      const answer = await create(kind, {
        ...validValue(kind),
        name: marker,
        ...(kind === "accessory" ? { perUnitMinor: 987_654 } : {}),
      });

      expect(answer.status).toBe(200);
      const written = world.prices.ledger.heldEvents().slice(rowsBefore);
      const [row] = written;
      const detail = JSON.stringify(row?.detail);
      expect(written).toHaveLength(1);
      expect(detail).not.toContain(marker);
      expect(detail).not.toContain("987654");
      expect(readDashboardAuditEntry(row?.action, row?.detail).ok).toBe(true);
    },
  );
});

describe("the rates of a created class", () => {
  async function createWith(rates: string): Promise<Response> {
    return createHardwareClassInDraft({
      cookie: world.cookie,
      json: `{"expectedDraftRevision":"${await currentDraftRevision()}","value":${JSON.stringify(CLASS_WORDS)},"rates":${rates}}`,
    });
  }

  function ratesText(field: string, literal: string): string {
    const others = Object.fromEntries(
      HARDWARE_RATE_FIELDS.filter((other) => other !== field).map((other) => [
        other,
        2_000,
      ]),
    );
    return `{${JSON.stringify(field).concat(":", literal)},${Object.entries(
      others,
    )
      .map(([name, amount]) => `${JSON.stringify(name)}:${String(amount)}`)
      .join(",")}}`;
  }

  const REFUSED: readonly (readonly [string, string, string])[] = [
    ["a negative amount", "-1", "NEGATIVE"],
    ["negative zero", "-0", "NEGATIVE"],
    ["a fraction", "1.5", "NOT_A_WHOLE_NUMBER"],
    ["a value past what a double holds", "1e309", "NOT_A_WHOLE_NUMBER"],
    ["a string of digits", '"5"', "NOT_A_WHOLE_NUMBER"],
    ["a boolean", "true", "NOT_A_WHOLE_NUMBER"],
    ["a list", "[5]", "NOT_A_WHOLE_NUMBER"],
    ["an object", "{}", "NOT_A_WHOLE_NUMBER"],
    ["null", "null", "MISSING_VALUE"],
    [
      "one past the largest coefficient",
      String(MAX_PRICE_COEFFICIENT_MINOR + 1),
      "TOO_LARGE",
    ],
    ["the largest safe integer", String(Number.MAX_SAFE_INTEGER), "TOO_LARGE"],
  ];

  it.each(
    HARDWARE_RATE_FIELDS.flatMap((field) =>
      REFUSED.map(([label, literal, code]) => ({
        field,
        label,
        literal,
        code,
      })),
    ),
  )(
    "refuses $label for $field with $code and writes nothing",
    async ({ field, literal, code }) => {
      const rowsBefore = auditCount();

      const answer = await createWith(ratesText(field, literal));

      expect(await jsonOf(answer)).toEqual({
        status: "invalid-input",
        issues: [{ field: "change", code }],
      });
      expect(await storedChangesOf(world.prices)).toEqual([]);
      expect(auditCount()).toBe(rowsBefore);
    },
  );

  it("takes the largest coefficient on every rate, and the draft still makes a book", async () => {
    const answer = await createClassAs(world.cookie, {
      rates: ratesOf(MAX_PRICE_COEFFICIENT_MINOR),
    });

    expect(answer.status).toBe(200);
  });

  it.each(NEVER_ZERO_HARDWARE_RATES)(
    "refuses a zero for %s with ZERO, the mechanism that is never free",
    async (field) => {
      const answer = await createClassAs(world.cookie, {
        rates: { ...ratesOf(2_000), [field]: 0 },
      });

      expect(await jsonOf(answer)).toEqual({
        status: "invalid-input",
        issues: [{ field: "change", code: "ZERO" }],
      });
    },
  );

  it.each(NO_PUSH_RUNNER_RATE)(
    "takes a zero for %s, which may be free",
    async (field) => {
      const answer = await createClassAs(world.cookie, {
        rates: { ...ratesOf(2_000), [field]: 0 },
      });

      expect(answer.status).toBe(200);
    },
  );

  it("answers ZERO, not a missing rate, when a zero push-runner rate and a missing rate come together", async () => {
    const { perHingeMinor, ...others } = ratesOf(2_000);
    void perHingeMinor;

    const answer = await createClassAs(world.cookie, {
      rates: { ...others, perPushRunnerMinor: 0 },
    });

    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "change", code: "ZERO" }],
    });
  });

  it("names the missing rate when that alone is wrong", async () => {
    const { perHingeMinor, ...others } = ratesOf(2_000);
    void perHingeMinor;

    const answer = await createClassAs(world.cookie, { rates: others });

    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "change", code: "CREATED_TIER_RATES_MISSING" }],
    });
  });

  it("refuses a class with no rates at all", async () => {
    const answer = await createClassAs(world.cookie, { rates: {} });

    expect(answer.status).toBe(400);
    expect(await storedChangesOf(world.prices)).toEqual([]);
  });

  it.each([
    ["__proto__ as an own member", '{"__proto__":{"perHingeMinor":5}}'],
    ["constructor", '{"constructor":1}'],
    ["a member in another case", '{"PERHINGEMINOR":5}'],
    ["a member with a trailing space", '{"perHingeMinor ":5}'],
    ["a list", "[]"],
    ["null", "null"],
  ])("refuses rates with %s before the bucket is spent", async (_, rates) => {
    limiterLedger.counted.length = 0;

    const answer = await createWith(rates);

    expect(answer.status).toBe(400);
    expect(
      limiterLedger.counted.filter((name) => name === THE_DRAFT_BUCKET),
    ).toHaveLength(0);
    expect(await storedChangesOf(world.prices)).toEqual([]);
  });
});

describe("a created accessory's price", () => {
  it.each([
    ["a negative", -1, "NEGATIVE"],
    ["a fraction", 0.5, "NOT_A_WHOLE_NUMBER"],
    ["a string", "10", "NOT_A_WHOLE_NUMBER"],
    ["null", null, "MISSING_VALUE"],
    [
      "past the largest coefficient",
      MAX_PRICE_COEFFICIENT_MINOR + 1,
      "TOO_LARGE",
    ],
  ])("refuses %s with %s's code", async (_, perUnitMinor, code) => {
    const answer = await createAccessoryAs(world.cookie, {
      value: { ...ACCESSORY_VALUE, perUnitMinor },
    });

    expect(await jsonOf(answer)).toEqual({
      status: "invalid-input",
      issues: [{ field: "change", code }],
    });
    expect(await storedChangesOf(world.prices)).toEqual([]);
  });

  it("refuses a price left out", async () => {
    const { perUnitMinor, ...withoutPrice } = ACCESSORY_VALUE;
    void perUnitMinor;

    const answer = await createAccessoryAs(world.cookie, {
      value: withoutPrice,
    });

    expect(answer.status).toBe(400);
  });

  it.each([0, 1, MAX_PRICE_COEFFICIENT_MINOR])(
    "takes a price of %i",
    async (perUnitMinor) => {
      const answer = await createAccessoryAs(world.cookie, {
        value: { ...ACCESSORY_VALUE, perUnitMinor },
      });

      expect(answer.status).toBe(200);
    },
  );
});

describe("the link of a created accessory", () => {
  const supplied = SAMPLE_PRICE_BOOK.cabinetRules.filter(
    ({ suppliedBy }) => suppliedBy !== "customer",
  );
  const customerSupplied = SAMPLE_PRICE_BOOK.cabinetRules.filter(
    ({ suppliedBy }) => suppliedBy === "customer",
  );

  const NOT_A_BUILD_ID = [
    ...ACCESSORY_IDS,
    ...PALETTE_ENTRY_IDS,
    ...HandleSchema.options,
    ...SAMPLE_PRICE_BOOK.hardware.tiers.map(({ tierId }) => tierId),
    ...SAMPLE_PRICE_BOOK.material.tiers.map(({ tierId }) => tierId),
    ...SAMPLE_PRICE_BOOK.cabinetRules.map(({ ruleId }) => ruleId),
    "__proto__",
    "constructor",
    "toString",
    "hasOwnProperty",
    "",
    " ",
    `${LINKED_BUILD_ID} `,
    ` ${LINKED_BUILD_ID}`,
    LINKED_BUILD_ID.toUpperCase(),
    `${LINKED_BUILD_ID}\u0000`,
    "new",
  ];

  it.each(NOT_A_BUILD_ID)(
    "refuses %j as the link: it is no cabinet row the book prices, and nothing is stored",
    async (linkedBuildId) => {
      const answer = await createAccessoryAs(world.cookie, {
        value: { ...ACCESSORY_VALUE, linkedBuildId },
      });

      expect(await jsonOf(answer)).toEqual({
        status: "invalid-input",
        issues: [{ field: "change", code: "LINK_TARGET_UNKNOWN" }],
      });
      expect(await storedChangesOf(world.prices)).toEqual([]);
    },
  );

  it.each(customerSupplied.map(({ buildId }) => buildId))(
    "refuses the customer's row %s with LINK_TARGET_CUSTOMER_SUPPLIED",
    async (linkedBuildId) => {
      const answer = await createAccessoryAs(world.cookie, {
        value: { ...ACCESSORY_VALUE, linkedBuildId },
      });

      expect(await jsonOf(answer)).toEqual({
        status: "invalid-input",
        issues: [{ field: "change", code: "LINK_TARGET_CUSTOMER_SUPPLIED" }],
      });
    },
  );

  it("takes every manufacturer row of the book as a link, each of them for one accessory", async () => {
    const statuses: number[] = [];
    for (const { buildId } of supplied) {
      const answer = await createAccessoryAs(world.cookie, {
        value: { ...ACCESSORY_VALUE, linkedBuildId: buildId },
      });
      statuses.push(answer.status);
    }

    expect(supplied.length).toBeGreaterThan(0);
    expect(statuses.filter((status) => status !== 200)).toEqual([]);
  });

  it.each([
    ["a number", 5],
    ["null", null],
    ["a list", [LINKED_BUILD_ID]],
    ["an object", { buildId: LINKED_BUILD_ID }],
  ])(
    "refuses a link that is %s with MISSING_VALUE",
    async (_, linkedBuildId) => {
      const answer = await createAccessoryAs(world.cookie, {
        value: { ...ACCESSORY_VALUE, linkedBuildId },
      });

      expect(await jsonOf(answer)).toEqual({
        status: "invalid-input",
        issues: [{ field: "change", code: "MISSING_VALUE" }],
      });
    },
  );
});

describe("members a creation request must not carry", () => {
  const SMUGGLED_INTO_VALUE = [
    ["id", { id: "mine" }],
    ["tierId", { tierId: "hardware.mine" }],
    ["accessoryId", { accessoryId: "plinth-mine" }],
    ["ruleId", { ruleId: "cabinet.base-3drawer" }],
    ["nameKey", { nameKey: "catalogue.name" }],
    ["descriptionKey", { descriptionKey: "catalogue.description" }],
    ["a Russian name", { nameRu: "Soclu" }],
    ["address", { address: { kind: "item-deleted" } }],
    ["kind", { kind: "hardware" }],
    [
      "__proto__ as an own member",
      JSON.parse('{"__proto__":{"id":"mine"}}') as Record<string, unknown>,
    ],
  ] as const;

  const INTO_THE_BODY = [
    ["id", { id: "mine" }],
    ["tierId", { tierId: "hardware.mine" }],
    ["accessoryId", { accessoryId: "plinth-mine" }],
    ["address", { address: { kind: "item-deleted" } }],
    ["change", { change: { address: { kind: "item-deleted" }, value: true } }],
    ["created", { created: { kind: "hardware", tierId: "mine" } }],
  ] as const;

  it.each(
    KINDS.flatMap((kind) =>
      SMUGGLED_INTO_VALUE.map(([label, extra]) => ({ kind, label, extra })),
    ),
  )(
    "refuses $label inside the value of a $kind, and no row is made under an id the client chose",
    async ({ kind, extra }) => {
      const answer = await create(kind, { ...validValue(kind), ...extra });

      expect(answer.status).toBe(400);
      expect(await storedChangesOf(world.prices)).toEqual([]);
    },
  );

  it.each(
    KINDS.flatMap((kind) =>
      INTO_THE_BODY.map(([label, extra]) => ({ kind, label, extra })),
    ),
  )(
    "refuses $label beside the value of a $kind with 400 before the bucket is spent or an id is minted",
    async ({ kind, extra }) => {
      limiterLedger.counted.length = 0;
      const rowsBefore = auditCount();
      const route =
        kind === "class" ? createHardwareClassInDraft : createAccessoryInDraft;

      const answer = await route({
        cookie: world.cookie,
        json: {
          expectedDraftRevision: await currentDraftRevision(),
          value: validValue(kind),
          ...(kind === "class" ? { rates: ratesOf(2_000) } : {}),
          ...extra,
        },
      });

      expect(answer.status).toBe(400);
      expect(
        limiterLedger.counted.filter((name) => name === THE_DRAFT_BUCKET),
      ).toHaveLength(0);
      expect(auditCount()).toBe(rowsBefore);
      expect(await storedChangesOf(world.prices)).toEqual([]);
    },
  );

  it("refuses rates sent to the accessory route, which takes none", async () => {
    const answer = await createAccessoryInDraft({
      cookie: world.cookie,
      json: {
        expectedDraftRevision: await currentDraftRevision(),
        value: ACCESSORY_VALUE,
        rates: ratesOf(2_000),
      },
    });

    expect(answer.status).toBe(400);
  });

  it("refuses an expectedDraftRevision that is not a string, with 400", async () => {
    for (const revision of [0, 1, null, true, [], {}]) {
      const answer = await createClassAs(world.cookie, {
        expectedDraftRevision: revision,
      });

      expect(answer.status, JSON.stringify(revision)).toBe(400);
    }
    expect(await storedChangesOf(world.prices)).toEqual([]);
  });

  it("never lets the client's headers or cookies move the id: the id is the server's whatever the request carries", async () => {
    const answer = await createAccessoryInDraft({
      cookie: world.cookie,
      headers: { "x-created-id": "mine", "idempotency-key": "mine" },
      json: {
        expectedDraftRevision: await currentDraftRevision(),
        value: ACCESSORY_VALUE,
      },
    });

    const body = (await jsonOf(answer)) as {
      created: { accessoryId: string };
    };
    expect(answer.status).toBe(200);
    expect(body.created.accessoryId).not.toBe("mine");
  });
});

describe("a draft that must stay readable after any creation that was accepted", () => {
  it("is applied by the domain and read by the dashboard after a class with the widest words and the largest rates", async () => {
    const answer = await createClassAs(world.cookie, {
      value: {
        name: ASTRAL.repeat(NAME_BOUND / 2),
        description: "d".repeat(DESCRIPTION_BOUND),
      },
      rates: ratesOf(MAX_PRICE_COEFFICIENT_MINOR),
    });

    expect(answer.status).toBe(200);
    const draft = await storedChangesOf(world.prices);
    expect(draft.length).toBe(1 + HARDWARE_RATE_FIELDS.length);
    const read = await world.prices.stores.priceBook.readDraft();
    expect(read.changes as readonly DraftChange[]).toEqual(draft);
  });
});

describe("a revision, a nesting and a role that a creation must not be moved by", () => {
  const WEIRD_REVISIONS = [
    "",
    " ",
    "-1",
    "-0",
    "1e3",
    "0x10",
    "01",
    " 1",
    "1 ",
    "NaN",
    "Infinity",
    "9".repeat(4_000),
    "\u0000",
    "0\u0000",
    "__proto__",
  ];

  it.each(WEIRD_REVISIONS)(
    "answers a revision of %j with 400 or 409 on both routes, and writes nothing",
    async (expectedDraftRevision) => {
      const rowsBefore = auditCount();

      for (const kind of KINDS) {
        const answer =
          kind === "class"
            ? await createClassAs(world.cookie, { expectedDraftRevision })
            : await createAccessoryAs(world.cookie, { expectedDraftRevision });

        expect([400, 409], kind).toContain(answer.status);
      }
      expect(await storedChangesOf(world.prices)).toEqual([]);
      expect(auditCount()).toBe(rowsBefore);
    },
  );

  it("answers a name nested thousands of levels deep, within the body's bound, with 400 and no failure of the server", async () => {
    const depth = 6_000;
    const nested = `${"[".repeat(depth)}${"]".repeat(depth)}`;
    const revision = await currentDraftRevision();

    for (const route of [createHardwareClassInDraft, createAccessoryInDraft]) {
      const answer = await route({
        cookie: world.cookie,
        json: `{"expectedDraftRevision":"${revision}","value":{"name":${nested},"description":"d","linkedBuildId":"${LINKED_BUILD_ID}","perUnitMinor":1},"rates":{}}`,
      });

      expect([400, 413]).toContain(answer.status);
    }
    expect(await storedChangesOf(world.prices)).toEqual([]);
  });

  it("refuses an operator with 403 before any store is read or id is minted, on both routes", async () => {
    const { session } = await signedInAs(
      { role: "operator" },
      "op@example.test",
    );
    priceStoreAsks.count = 0;

    for (const route of [createHardwareClassInDraft, createAccessoryInDraft]) {
      const answer = await route({
        cookie: session.cookie,
        json: {
          expectedDraftRevision: "0",
          value: CLASS_WORDS,
          rates: ratesOf(1),
        },
      });

      expect(answer.status).toBe(403);
    }
    expect(priceStoreAsks.count).toBe(0);
    expect(await storedChangesOf(world.prices)).toEqual([]);
  });
});
