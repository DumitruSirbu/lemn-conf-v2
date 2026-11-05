import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SAMPLE_PRICE_BOOK,
  applyChanges,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { jsonOf } from "../../../support/account-world";
import {
  ACCESSORY_VALUE,
  CLASS_WORDS,
  LINKED_BUILD_ID,
  activeBookOf,
  createAccessoryAs,
  createClassAs,
  mintedIdOf,
  putChangeAs,
  readStateAs,
  revertAs,
  startCreationWorld,
  storedChangesOf,
  type CreationWorld,
} from "../../../support/creation-world";
import {
  publishBody,
  publishDraft,
} from "../../../support/price-dashboard-requests";

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

// The words of a created row, on the creation routes and on the rename route alike: the same characters are refused, the
// same text is stored, and a row whose words the parser accepted before (a format character inside them) is still read,
// renamed and taken back.

let world: CreationWorld;

beforeEach(async () => {
  world = await startCreationWorld(SAMPLE_PRICE_BOOK);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const FORBIDDEN = "TEXT_FORBIDDEN_CHARACTER";
const ZERO_WIDTH_SPACE = "\u200B";

const FORMAT_CHARACTERS = [
  ["a zero-width space", "\u200B"],
  ["a zero-width non-joiner", "\u200C"],
  ["a zero-width joiner", "\u200D"],
  ["a word joiner", "\u2060"],
  ["a soft hyphen", "\u00AD"],
  ["a byte-order mark", "\uFEFF"],
  ["an invisible times", "\u2062"],
  ["a Mongolian vowel separator", "\u180E"],
  ["a language tag", "\u{E0041}"],
  ["an interlinear annotation anchor", "\uFFF9"],
] as const;

const LINE_BREAKS = [
  ["a line feed", "\n"],
  ["a carriage return", "\r"],
  ["a line separator", "\u2028"],
  ["a paragraph separator", "\u2029"],
  ["a next line", "\u0085"],
  ["a vertical tab", "\u000B"],
  ["a form feed", "\f"],
] as const;

const PLACES = [
  ["inside", (mark: string) => `So${mark}clu`],
  ["at the start", (mark: string) => `${mark}Soclu`],
  ["at the end", (mark: string) => `Soclu${mark}`],
  ["between spaces", (mark: string) => ` ${mark} Soclu`],
] as const;

type Field = "name" | "description";
const FIELDS: readonly Field[] = ["name", "description"];

interface Surface {
  readonly label: string;
  readonly send: (field: Field, text: string) => Promise<Response>;
}

async function createdAccessoryId(): Promise<string> {
  return mintedIdOf(await createAccessoryAs(world.cookie));
}

async function createdClassId(): Promise<string> {
  return mintedIdOf(await createClassAs(world.cookie));
}

function renameOf(item: unknown, field: Field, value: string) {
  return putChangeAs(world.cookie, {
    address: { kind: "created-row-text", item, field },
    value,
  });
}

function surfaces(): readonly Surface[] {
  return [
    {
      label: "the class creation",
      send: (field, text) =>
        createClassAs(world.cookie, {
          value: { ...CLASS_WORDS, [field]: text },
        }),
    },
    {
      label: "the accessory creation",
      send: (field, text) =>
        createAccessoryAs(world.cookie, {
          value: { ...ACCESSORY_VALUE, [field]: text },
        }),
    },
    {
      label: "the rename of a created class",
      send: async (field, text) =>
        renameOf(
          { kind: "hardware", tierId: await createdClassId() },
          field,
          text,
        ),
    },
    {
      label: "the rename of a created accessory",
      send: async (field, text) =>
        renameOf(
          { kind: "accessory", accessoryId: await createdAccessoryId() },
          field,
          text,
        ),
    },
  ];
}

async function expectRefusedAs(answer: Response, code: string): Promise<void> {
  const body = await jsonOf(answer);
  expect({ status: answer.status, code: issueCodeOf(body) }).toEqual({
    status: 400,
    code,
  });
}

function issueCodeOf(body: unknown): unknown {
  const { issues } = body as { issues?: readonly { code?: unknown }[] };
  return issues?.[0]?.code;
}

describe("a format character in created words", () => {
  const cases = surfaces().flatMap((surface, surfaceIndex) =>
    FIELDS.flatMap((field) =>
      FORMAT_CHARACTERS.flatMap(([what, mark]) =>
        PLACES.map(([where, place]) => ({
          surfaceIndex,
          field,
          what,
          where,
          text: place(mark),
        })),
      ),
    ),
  );

  it.each(cases)(
    "is refused TEXT_FORBIDDEN_CHARACTER: $what $where, in the $field, surface $surfaceIndex",
    async ({ surfaceIndex, field, text }) => {
      const surface = surfaces()[surfaceIndex];
      if (surface === undefined) throw new Error("no such surface");

      const answer = await surface.send(field, text);

      await expectRefusedAs(answer, FORBIDDEN);
      const after = await storedChangesOf(world.prices);
      expect(JSON.stringify(after)).not.toContain(
        JSON.stringify(text).slice(1, -1),
      );
    },
  );
});

describe("a line break in created words", () => {
  const cases = surfaces().flatMap((surface, surfaceIndex) =>
    FIELDS.flatMap((field) =>
      LINE_BREAKS.flatMap(([what, mark]) =>
        PLACES.map(([where, place]) => ({
          surfaceIndex,
          field,
          what,
          where,
          text: place(mark),
        })),
      ),
    ),
  );

  it.each(cases)(
    "is refused TEXT_FORBIDDEN_CHARACTER: $what $where, in the $field, surface $surfaceIndex",
    async ({ surfaceIndex, field, text }) => {
      const surface = surfaces()[surfaceIndex];
      if (surface === undefined) throw new Error("no such surface");

      const answer = await surface.send(field, text);

      await expectRefusedAs(answer, FORBIDDEN);
    },
  );
});

describe("the order of refusals for a format character", () => {
  it.each([
    [
      "an amount hidden by a zero-width space",
      "500 l\u200Bei",
      "TEXT_STATES_AN_AMOUNT",
    ],
    ["an amount and a soft hyphen", "500 le\u00ADi", "TEXT_STATES_AN_AMOUNT"],
    ["an empty name of format characters", "\u200B\u2060", "TEXT_EMPTY"],
    [
      "a name past the bound with a format character",
      `${"a".repeat(80)}\u200B`,
      "TEXT_TOO_LONG",
    ],
  ])(
    "answers %s with %s's code, not the format character's",
    async (_, text, code) => {
      const creation = await createClassAs(world.cookie, {
        value: { ...CLASS_WORDS, name: text },
      });
      const rename = await renameOf(
        { kind: "accessory", accessoryId: await createdAccessoryId() },
        "name",
        text,
      );

      await expectRefusedAs(creation, code);
      await expectRefusedAs(rename, code);
    },
  );

  it("takes a description of nothing but format characters as an empty description, with no mark stored", async () => {
    const answer = await createAccessoryAs(world.cookie, {
      value: { ...ACCESSORY_VALUE, description: "\u200B\u200D" },
    });

    expect(answer.status).toBe(200);
    expect(JSON.stringify(await storedChangesOf(world.prices))).not.toMatch(
      /\u200B|\u200D/,
    );
  });
});

describe("the words as the draft keeps them", () => {
  const WORDS_WITH_EDGES = [
    "  Soclu luminos  ",
    "\u00A0Soclu luminos\u2003",
    "\tSoclu luminos",
  ];

  it.each(WORDS_WITH_EDGES.filter((text) => !/[\t]/.test(text)))(
    "stores %j trimmed on a creation and on a rename",
    async (text) => {
      const created = await createAccessoryAs(world.cookie, {
        value: { ...ACCESSORY_VALUE, name: text },
      });
      const accessoryId = await mintedIdOf(created);
      const renamed = await renameOf(
        { kind: "accessory", accessoryId },
        "description",
        text,
      );

      expect([created.status, renamed.status]).toEqual([200, 200]);
      const stored = JSON.stringify(await storedChangesOf(world.prices));
      expect(stored).toContain('"Soclu luminos"');
      expect(stored).not.toContain("\u00A0");
      expect(stored).not.toContain("  Soclu");
    },
  );

  it("measures the bound on the trimmed text on a creation and a rename: 80 and 240 with edges fit, one more does not", async () => {
    const accessoryId = await createdAccessoryId();
    const item = { kind: "accessory", accessoryId } as const;

    const fits = [
      await createClassAs(world.cookie, {
        value: {
          name: ` ${"n".repeat(80)} `,
          description: ` ${"d".repeat(240)} `,
        },
      }),
      await renameOf(item, "name", ` ${"n".repeat(80)} `),
      await renameOf(item, "description", ` ${"d".repeat(240)} `),
    ];
    const tooLong = [
      await createClassAs(world.cookie, {
        value: { name: ` ${"n".repeat(81)} `, description: "" },
      }),
      await renameOf(item, "name", ` ${"n".repeat(81)} `),
      await renameOf(item, "description", ` ${"d".repeat(241)} `),
    ];

    expect(fits.map(({ status }) => status)).toEqual([200, 200, 200]);
    expect(tooLong.map(({ status }) => status)).toEqual([400, 400, 400]);
    const stored = (await storedChangesOf(world.prices)).map(
      ({ value }) => value,
    );
    expect(stored).toContainEqual({
      name: "n".repeat(80),
      description: "d".repeat(240),
    });
  });

  it("makes a rename of a created class refused for a format character leave the stored rename as it was", async () => {
    const tierId = await createdClassId();
    const item = { kind: "hardware", tierId } as const;
    await renameOf(item, "name", "Prima");
    const before = await storedChangesOf(world.prices);

    const refused = await renameOf(item, "name", `A${ZERO_WIDTH_SPACE}B`);

    expect(refused.status).toBe(400);
    expect(await storedChangesOf(world.prices)).toEqual(before);
  });
});

describe("a row the book already holds with a format character in its words", () => {
  function bookWithMarkedRows(): PriceBook {
    const [standard] = SAMPLE_PRICE_BOOK.hardware.tiers;
    if (standard === undefined) throw new Error("the book has no class");
    const {
      nameKey: _nameKey,
      descriptionKey: _descriptionKey,
      ...bare
    } = standard;
    void _nameKey;
    void _descriptionKey;
    return {
      ...SAMPLE_PRICE_BOOK,
      hardware: {
        ...SAMPLE_PRICE_BOOK.hardware,
        tiers: [
          ...SAMPLE_PRICE_BOOK.hardware.tiers,
          {
            ...bare,
            tierId: "hardware.marked",
            ruleId: "hardware.marked",
            name: `Cl${ZERO_WIDTH_SPACE}asa`,
            description: `Des${ZERO_WIDTH_SPACE}criere`,
          },
        ],
      },
      linkedAccessories: [
        {
          accessoryId: "marked-accessory",
          ruleId: "accessory.marked-accessory",
          linkedBuildId: LINKED_BUILD_ID,
          perUnitMinor: 1_000,
          name: `So${ZERO_WIDTH_SPACE}clu`,
        },
      ],
    };
  }

  const MARKED_CLASS = { kind: "hardware", tierId: "hardware.marked" } as const;
  const MARKED_ACCESSORY = {
    kind: "accessory",
    accessoryId: "marked-accessory",
  } as const;

  beforeEach(async () => {
    world = await startCreationWorld(bookWithMarkedRows());
  });

  it("is read: the dashboard's state answers 200 and a creation beside it is made", async () => {
    const state = await readStateAs(world.cookie);
    const created = await createAccessoryAs(world.cookie);

    expect(state.status).toBe(200);
    expect(created.status).toBe(200);
  });

  it.each([
    ["class", MARKED_CLASS, "name"],
    ["class", MARKED_CLASS, "description"],
    ["accessory", MARKED_ACCESSORY, "name"],
  ] as const)(
    "lets the %s be renamed to clean words in its %s, and the rename taken back again",
    async (_, item, field) => {
      const renamed = await renameOf(item, field, "Cuvinte curate");
      const reverted = await revertAs(world.cookie, {
        kind: "change",
        address: { kind: "created-row-text", item, field },
      });

      expect([renamed.status, reverted.status]).toEqual([200, 200]);
      expect(await storedChangesOf(world.prices)).toEqual([]);
    },
  );

  it("refuses a rename that keeps the mark, since the words are new words", async () => {
    const answer = await renameOf(
      MARKED_ACCESSORY,
      "name",
      `So${ZERO_WIDTH_SPACE}clu`,
    );

    await expectRefusedAs(answer, FORBIDDEN);
  });

  it("publishes a draft whose only change renames a marked row to clean words, and the new book holds them", async () => {
    await renameOf(MARKED_ACCESSORY, "name", "Soclu curat");

    const answer = await publishDraft({
      cookie: world.cookie,
      json: await publishBody(),
    });

    expect(answer.status).toBe(200);
    const book = await activeBookOf(world.prices);
    expect(book.linkedAccessories.map(({ name }) => name)).toEqual([
      "Soclu curat",
    ]);
  });

  it("stays a book the draft makes when a draft that holds nothing about the marked row is applied", async () => {
    const created = await createClassAs(world.cookie);

    expect(created.status).toBe(200);
    const made = applyChanges(
      await activeBookOf(world.prices),
      await storedChangesOf(world.prices),
    );
    expect(made.ok).toBe(true);
  });
});
