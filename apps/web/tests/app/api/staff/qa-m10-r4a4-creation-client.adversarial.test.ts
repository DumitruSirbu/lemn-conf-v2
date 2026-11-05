import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HARDWARE_RATE_FIELDS,
  SAMPLE_PRICE_BOOK,
} from "@lemnaria/configurator-domain";

import { POST as CREATE_ACCESSORY } from "@/app/api/staff/prices/draft/accessory/route";
import { POST as CREATE_HARDWARE_CLASS } from "@/app/api/staff/prices/draft/hardware-class/route";
import { readDraftChangeCreatedWire } from "@/price-dashboard/price-dashboard-wire-reading";
import { FETCHING_PRICE_DRAFT_CLIENT } from "@/price-dashboard/price-draft-client";

import { accountRequest } from "../../../support/account-world";
import {
  ACCESSORY_VALUE,
  CLASS_WORDS,
  plantDraft,
  ratesOf,
  startCreationWorld,
  storedChangesOf,
  type CreationWorld,
} from "../../../support/creation-world";
import { currentDraftRevision } from "../../../support/price-dashboard-requests";

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

// The browser's client over the creation routes of the tree: the request it builds is the one the routes read, every
// refusal a route can give is one the client reads as a refusal with that code, and a request is made once.

let world: CreationWorld;
let sent: string[];

beforeEach(async () => {
  world = await startCreationWorld(SAMPLE_PRICE_BOOK);
  sent = [];
  vi.stubGlobal("fetch", answerFromTheRoutes);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const NETWORK = { "x-forwarded-for": "192.0.2.10" };

async function answerFromTheRoutes(
  address: string,
  init: RequestInit = {},
): Promise<Response> {
  sent.push(address);
  const request = accountRequest(address, {
    method: init.method ?? "GET",
    cookie: world.cookie,
    headers: NETWORK,
    ...(typeof init.body === "string" ? { json: init.body } : {}),
  });
  if (address === "/api/staff/prices/draft/hardware-class") {
    return CREATE_HARDWARE_CLASS(request);
  }
  if (address === "/api/staff/prices/draft/accessory") {
    return CREATE_ACCESSORY(request);
  }
  return new Response(null, { status: 404 });
}

function createClass(
  overrides: Readonly<Record<string, unknown>> = {},
): Promise<
  Awaited<
    ReturnType<
      NonNullable<typeof FETCHING_PRICE_DRAFT_CLIENT.createHardwareClass>
    >
  >
> {
  return currentDraftRevision().then((expectedDraftRevision) =>
    requireMethod(FETCHING_PRICE_DRAFT_CLIENT.createHardwareClass)({
      expectedDraftRevision,
      value: CLASS_WORDS,
      rates: ratesOf(2_000),
      ...overrides,
    } as never),
  );
}

function createAccessory(
  overrides: Readonly<Record<string, unknown>> = {},
): Promise<
  Awaited<
    ReturnType<NonNullable<typeof FETCHING_PRICE_DRAFT_CLIENT.createAccessory>>
  >
> {
  return currentDraftRevision().then((expectedDraftRevision) =>
    requireMethod(FETCHING_PRICE_DRAFT_CLIENT.createAccessory)({
      expectedDraftRevision,
      value: ACCESSORY_VALUE,
      ...overrides,
    } as never),
  );
}

function requireMethod<Method>(method: Method | undefined): Method {
  if (method === undefined) throw new Error("the client has no such method");
  return method;
}

describe("a creation through the browser's client", () => {
  it("is the draft and the row the server minted, for a class and for an accessory", async () => {
    const madeClass = await createClass();
    const madeAccessory = await createAccessory();

    expect(madeClass.kind).toBe("changed");
    expect(madeAccessory.kind).toBe("changed");
    if (madeClass.kind !== "changed" || madeAccessory.kind !== "changed")
      return;
    expect(madeClass.written.created.kind).toBe("hardware");
    expect(madeAccessory.written.created.kind).toBe("accessory");
    expect(madeAccessory.written.draft.changes).toEqual(
      await storedChangesOf(world.prices),
    );
  });

  it("is sent once: a lost answer is failed, not sent again, and the draft holds what the first request made", async () => {
    const revision = await currentDraftRevision();
    vi.stubGlobal("fetch", async (address: string, init: RequestInit) => {
      const answer = await answerFromTheRoutes(address, init);
      void answer;
      throw new TypeError("the answer was lost");
    });

    const outcome = await requireMethod(
      FETCHING_PRICE_DRAFT_CLIENT.createHardwareClass,
    )({
      expectedDraftRevision: revision,
      value: CLASS_WORDS,
      rates: ratesOf(2_000),
    });

    expect(outcome).toEqual({ kind: "failed" });
    expect(sent).toEqual(["/api/staff/prices/draft/hardware-class"]);
    expect(
      (await storedChangesOf(world.prices)).filter(
        ({ address }) => address.kind === "hardware-tier-created",
      ),
    ).toHaveLength(1);
  });

  it("is a conflict when the same request is made again by the person after its answer was lost, and the draft keeps one class", async () => {
    const request = {
      expectedDraftRevision: await currentDraftRevision(),
      value: CLASS_WORDS,
      rates: ratesOf(2_000),
    };
    const create = requireMethod(
      FETCHING_PRICE_DRAFT_CLIENT.createHardwareClass,
    );
    await create(request);

    const again = await create(request);

    expect(again).toEqual({ kind: "conflict" });
    expect(
      (await storedChangesOf(world.prices)).filter(
        ({ address }) => address.kind === "hardware-tier-created",
      ),
    ).toHaveLength(1);
  });

  it("is a conflict, not a failure, when the draft moved between the page's read and the request", async () => {
    const outcome = await createAccessory({ expectedDraftRevision: "99999" });

    expect(outcome).toEqual({ kind: "conflict" });
  });

  it("is a candidate-refused for an accessory on a draft that no longer makes a book", async () => {
    await plantDraft(world, [
      {
        address: {
          kind: "cabinet",
          ruleId: "cabinet.gone",
          field: "anchorMinor",
        },
        value: 5_000,
      },
    ]);

    const outcome = await createAccessory();

    expect(outcome).toEqual({ kind: "candidate-refused" });
  });
});

describe("every refusal a creation route can give, read by the client", () => {
  const classRefusals: readonly (readonly [
    string,
    Record<string, unknown>,
    string,
  ])[] = [
    [
      "a name that is not NFC",
      { value: { ...CLASS_WORDS, name: "Café" } },
      "TEXT_FORBIDDEN_CHARACTER",
    ],
    [
      "a name with a direction override",
      { value: { ...CLASS_WORDS, name: "a‮b" } },
      "TEXT_FORBIDDEN_CHARACTER",
    ],
    ["an empty name", { value: { ...CLASS_WORDS, name: " " } }, "TEXT_EMPTY"],
    [
      "a name past its bound",
      { value: { ...CLASS_WORDS, name: "x".repeat(81) } },
      "TEXT_TOO_LONG",
    ],
    [
      "an amount in the words",
      { value: { ...CLASS_WORDS, description: "500 lei" } },
      "TEXT_STATES_AN_AMOUNT",
    ],
    [
      "a name that is not text",
      { value: { ...CLASS_WORDS, name: 5 } },
      "MISSING_VALUE",
    ],
    [
      "a zero push-runner rate",
      { rates: { ...ratesOf(2_000), perPushRunnerMinor: 0 } },
      "ZERO",
    ],
    [
      "a negative rate",
      { rates: { ...ratesOf(2_000), perHingeMinor: -1 } },
      "NEGATIVE",
    ],
    [
      "a fractional rate",
      { rates: { ...ratesOf(2_000), perHingeMinor: 1.5 } },
      "NOT_A_WHOLE_NUMBER",
    ],
    [
      "an enormous rate",
      { rates: { ...ratesOf(2_000), perHingeMinor: Number.MAX_SAFE_INTEGER } },
      "TOO_LARGE",
    ],
    [
      "a missing rate",
      {
        rates: Object.fromEntries(
          HARDWARE_RATE_FIELDS.slice(1).map((field) => [field, 1]),
        ),
      },
      "CREATED_TIER_RATES_MISSING",
    ],
  ];
  const accessoryRefusals: readonly (readonly [
    string,
    Record<string, unknown>,
    string,
  ])[] = [
    [
      "a link to no row",
      { value: { ...ACCESSORY_VALUE, linkedBuildId: "nowhere" } },
      "LINK_TARGET_UNKNOWN",
    ],
    [
      "a name with an amount",
      { value: { ...ACCESSORY_VALUE, name: "Soclu 5 lei" } },
      "TEXT_STATES_AN_AMOUNT",
    ],
    [
      "a negative price",
      { value: { ...ACCESSORY_VALUE, perUnitMinor: -1 } },
      "NEGATIVE",
    ],
    [
      "a price that is a fraction",
      { value: { ...ACCESSORY_VALUE, perUnitMinor: 0.5 } },
      "NOT_A_WHOLE_NUMBER",
    ],
    [
      "a missing link",
      { value: { perUnitMinor: 1, name: "Soclu" } },
      "MISSING_VALUE",
    ],
  ];

  it.each(classRefusals)(
    "reads %s as a refusal with %s's code, not as a failure",
    async (_, overrides, code) => {
      const outcome = await createClass(overrides);

      expect(outcome).toEqual({ kind: "refused", code });
    },
  );

  it.each(accessoryRefusals)(
    "reads %s as a refusal with %s's code, not as a failure",
    async (_, overrides, code) => {
      const outcome = await createAccessory(overrides);

      expect(outcome).toEqual({ kind: "refused", code });
    },
  );

  it("reads the customer-supplied link as a refusal with its code", async () => {
    const customerRow = SAMPLE_PRICE_BOOK.cabinetRules.find(
      ({ suppliedBy }) => suppliedBy === "customer",
    );

    const outcome = await createAccessory({
      value: { ...ACCESSORY_VALUE, linkedBuildId: customerRow?.buildId },
    });

    expect(outcome).toEqual({
      kind: "refused",
      code: "LINK_TARGET_CUSTOMER_SUPPLIED",
    });
  });
});

describe("the reader of a creation's answer", () => {
  const DRAFT = { draftRevision: "3", changes: [] };

  it.each([
    ["no draft", { created: { kind: "hardware", tierId: "x" } }],
    ["no created row", { draft: DRAFT }],
    [
      "a created row that is no kind",
      { draft: DRAFT, created: { kind: "finish", finishId: "x" } },
    ],
    ["a class with no id", { draft: DRAFT, created: { kind: "hardware" } }],
    [
      "a class whose id is a number",
      { draft: DRAFT, created: { kind: "hardware", tierId: 5 } },
    ],
    [
      "an accessory with a class's member",
      { draft: DRAFT, created: { kind: "accessory", tierId: "x" } },
    ],
    ["a body that is a list", [DRAFT]],
    ["null", null],
  ])("reads %s as no answer", (_, body) => {
    expect(readDraftChangeCreatedWire(body)).toBeUndefined();
  });

  it("hands on the kind and the one id of the row, and nothing else the answer carried", () => {
    const read = readDraftChangeCreatedWire({
      draft: DRAFT,
      created: {
        kind: "hardware",
        tierId: "x",
        extra: 1,
        __proto__: { polluted: true },
      },
      more: true,
    });

    expect(read).toEqual({
      draft: DRAFT,
      created: { kind: "hardware", tierId: "x" },
    });
    expect(Object.keys(read?.created ?? {})).toEqual(["kind", "tierId"]);
  });

  it("is not moved by a prototype carrying the members the reader asks for", () => {
    const inherited = Object.create({
      kind: "hardware",
      tierId: "x",
    }) as object;

    expect(
      readDraftChangeCreatedWire({ draft: DRAFT, created: inherited }),
    ).toBeUndefined();
  });

  it("does not take a class's answer for an accessory's: the route's kind is the one believed", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            draft: DRAFT,
            created: { kind: "accessory", accessoryId: "x" },
          }),
          { status: 200 },
        ),
      ),
    );

    const outcome = await createClass();

    expect(outcome).toEqual({ kind: "failed" });
  });
});
