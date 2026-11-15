import { randomBytes } from "node:crypto";

import {
  CURRENT_SCHEMA_VERSION,
  KITCHEN_L_DESIGN,
  MAX_IDENTIFIER_LENGTH,
  MAX_PLACEMENTS,
  type StaffKitchenQuery,
} from "@lemnaria/configurator-domain";
import type { Client } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { NeonStaffKitchenReader } from "../src/neon-staff-kitchen-reader.js";
import { openDatabaseSession } from "../src/open-database.js";
import { staffKitchenStatement } from "../src/staff-kitchen-statements.js";
import type { StaffKitchenDetail } from "../src/staff-kitchen-reader.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { holdSharedTestSchemaLock } from "./support/test-schema-lock.js";

// Shared, not exclusive: every write is inside a transaction this file rolls back, and nothing here pages an unfiltered
// list or counts a whole table (the one search below names a string only its own planted account holds).
holdSharedTestSchemaLock();

/**
 * Adversarial QA of M12 wave W6d, the kitchen statement's projection of `contact_submissions.priced` and of
 * `accounts.address`, on a real Postgres (the live TEST database only). The production statements run unchanged over a
 * WebSocket session in which a transaction is open and rolled back after each test; the session is the test
 * database's owner, so this file shows what the statement does with rows, not what the application role may select.
 *
 * What the implementer's live contract cannot see, and this file does: the reader slices the statement's answer to
 * `MAX_PLACEMENTS` again, so a statement that lost its `limit` still passes every behavioural case; the raw answer of
 * the statement is read here. Likewise the shape of each projected element, its order against the snapshot's, a hostile
 * snapshot (lines of every JSON type, nested, huge), numbers outside what a JavaScript number holds, two requests of
 * one instant, and an address-only search.
 */
const SUITE_NAME =
  "staff kitchen reader, W6d statements on a real Postgres (live test database)";
if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

const PASSWORD_HASH = `$argon2id$v=19$m=19456,t=2,p=1$${"A".repeat(22)}$${"B".repeat(43)}`;
const DESIGN_ID_LENGTH = 21;
const ERA = "3600-01-01T00:00:00.000Z";
const RLO = String.fromCodePoint(0x202e);
const PDI = String.fromCodePoint(0x2069);
const ASTRAL = String.fromCodePoint(0x1f3e0);
const COMBINING_ACUTE = String.fromCodePoint(0x301);

type Row = Record<string, unknown>;

let client: Client;
let nextNumber = 0;

function textOf(strings: TemplateStringsArray): string {
  return strings.reduce(
    (built, part, index) =>
      `${built}${index === 0 ? "" : `$${String(index)}`}${part}`,
    "",
  );
}

function tagOverTransaction(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<Row[]> {
  return client
    .query(textOf(strings), values as never[])
    .then((reply) => reply.rows as Row[]);
}

function readerOverTransaction(): NeonStaffKitchenReader {
  const reader = new NeonStaffKitchenReader(liveTestDatabaseUrl);
  Object.assign(reader, { sql: tagOverTransaction });
  return reader;
}

async function run(text: string, values: readonly unknown[] = []) {
  const reply = await client.query(text, [...values] as never[]);
  return reply.rows as Row[];
}

function aDesignId(): string {
  nextNumber += 1;
  return `QA6D${String(nextNumber).padStart(5, "0")}`.padEnd(
    DESIGN_ID_LENGTH,
    "Z",
  );
}

async function plantAccount(address: string | null): Promise<string> {
  const id = nanoid();
  const email = `qa-w6d-${randomBytes(6).toString("hex")}@example.invalid`;
  await run(
    `insert into accounts (id, email, email_normal_form, password_hash, role, locale, privacy_notice_version,
       phone, phone_normal_form, address, name)
     values ($1, $2, $2, $3, 'client', 'ro', '1', null, null, $4, null)`,
    [id, email, PASSWORD_HASH, address],
  );
  return id;
}

async function plantSentKitchen(accountId: string | null): Promise<string> {
  const id = aDesignId();
  await run(
    `insert into designs (id, schema_version, document, account_id, name, sent_at, updated_at)
     values ($1, $2::int, $3::jsonb, $4, null, $5::timestamptz, $5::timestamptz)`,
    [
      id,
      CURRENT_SCHEMA_VERSION,
      JSON.stringify(KITCHEN_L_DESIGN),
      accountId,
      ERA,
    ],
  );
  return id;
}

interface PlantedRequest {
  readonly clientRequestId: string;
  readonly createdAt?: string;
  readonly priced: unknown;
  /** The JSON text of `priced`, for a snapshot `JSON.stringify` cannot be trusted to write (a huge number). */
  readonly pricedText?: string;
}

async function plantRequest(
  designId: string,
  request: PlantedRequest,
): Promise<void> {
  await run(
    `insert into contact_submissions (client_request_id, reference, design_id, design_revision, payload_digest,
       created_at, name, phone, phone_normal_form, locality, channel, email, consent_text_version, locale,
       design_document, priced)
     values ($1, $2, $3, 1, $4, $5::timestamptz, 'n', '+37360777666', '+37360777666', 'l', 'c', null, '1', 'ro',
       '{}'::jsonb, $6::jsonb)`,
    [
      request.clientRequestId,
      `QA6D-${randomBytes(6).toString("hex").toUpperCase()}`,
      designId,
      randomBytes(32).toString("hex"),
      request.createdAt ?? ERA,
      request.pricedText ?? JSON.stringify(request.priced),
    ],
  );
}

async function plantCopy(
  clientRequestId: string,
  placementCount: number,
): Promise<void> {
  await run(
    `insert into contact_submission_views (token_hash, client_request_id, schema_version, design_document, created_at)
     values ($1, $2, $3::int, $4::jsonb, $5::timestamptz)`,
    [
      randomBytes(32).toString("hex"),
      clientRequestId,
      CURRENT_SCHEMA_VERSION,
      JSON.stringify({
        ...KITCHEN_L_DESIGN,
        placements: KITCHEN_L_DESIGN.placements.slice(0, placementCount),
      }),
      ERA,
    ],
  );
}

function aRequestId(): string {
  return `qa6d-${randomBytes(8).toString("hex")}`;
}

async function keptLinesOf(priced: unknown, pricedText?: string) {
  const account = await plantAccount(null);
  const designId = await plantSentKitchen(account);
  await plantRequest(designId, {
    clientRequestId: aRequestId(),
    priced,
    ...(pricedText === undefined ? {} : { pricedText }),
  });
  return (await foundKitchen(designId)).sentCabinetLines;
}

async function foundKitchen(designId: string): Promise<StaffKitchenDetail> {
  const reading = await readerOverTransaction().readOne(designId);
  if (reading.kind !== "found") throw new Error("the kitchen was not found");
  return reading.kitchen;
}

function cabinet(placementId: unknown, amountMinor: unknown) {
  return { kind: "cabinet", placementId, amountMinor };
}

describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  beforeAll(async () => {
    client = openDatabaseSession(liveTestDatabaseUrl, "TEST_DATABASE_URL");
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  beforeEach(async () => {
    await client.query("begin");
  });

  afterEach(async () => {
    await client.query("rollback");
  });

  describe("what the statement itself answers, before the reader reads it", () => {
    async function rawLinesOf(priced: unknown): Promise<unknown> {
      const designId = await plantSentKitchen(null);
      await plantRequest(designId, { clientRequestId: aRequestId(), priced });
      const rows = await staffKitchenStatement(tagOverTransaction, designId);
      expect(rows).toHaveLength(1);
      return rows[0]?.["priced_cabinet_lines"];
    }

    it("is cut to MAX_PLACEMENTS in SQL, whatever the snapshot holds, with the first ones in the snapshot's order", async () => {
      const lines = Array.from({ length: MAX_PLACEMENTS * 3 }, (_, index) =>
        cabinet(`p${String(index)}`, index),
      );

      const raw = (await rawLinesOf({ lines })) as { placementId: string }[];

      expect(raw).toHaveLength(MAX_PLACEMENTS);
      expect(raw.map((pair) => pair.placementId)).toEqual(
        lines.slice(0, MAX_PLACEMENTS).map((line) => line.placementId),
      );
    });

    it("counts the bound after the other kinds of line are set aside, in SQL", async () => {
      const others = Array.from({ length: 40 }, (_, index) => ({
        kind: "depth",
        placementId: `d${String(index)}`,
        amountMinor: 1,
      }));
      const cabinets = Array.from({ length: MAX_PLACEMENTS + 7 }, (_, index) =>
        cabinet(`c${String(index)}`, 1),
      );

      const raw = (await rawLinesOf({
        lines: [...others, ...cabinets],
      })) as unknown[];

      expect(raw).toHaveLength(MAX_PLACEMENTS);
    });

    it("projects each pair to exactly the two members, and never the rest of a line", async () => {
      const raw = (await rawLinesOf({
        lines: [
          {
            ...cabinet("a", 5),
            suppliedBy: "SECRET-SUPPLIER",
            label: { ro: "SECRET-LABEL" },
            ruleId: "SECRET-RULE",
            lineId: "SECRET-LINE",
          },
        ],
      })) as object[];

      expect(raw.map((pair) => Object.keys(pair).sort())).toEqual([
        ["amountMinor", "placementId"],
      ]);
      expect(JSON.stringify(raw)).not.toContain("SECRET");
    });

    it("answers an empty array, not null, for every shape of lines that is not an array", async () => {
      for (const lines of ["cabinet", { kind: "cabinet" }, 7, null, true]) {
        expect(await rawLinesOf({ lines }), JSON.stringify(lines)).toEqual([]);
      }
      expect(await rawLinesOf({})).toEqual([]);
    });

    it("does not fail on an element that is not an object, and sets it aside", async () => {
      const raw = await rawLinesOf({
        lines: ["cabinet", 7, null, true, [cabinet("nested", 1)], [], {}],
      });

      expect(raw).toEqual([]);
    });
  });

  describe("the lines the reader keeps of a hostile snapshot", () => {
    it("keeps the readable pair and drops each unreadable one beside it, for every JSON type of id and amount", async () => {
      const lines = await keptLinesOf({
        lines: [
          cabinet({ nested: "x" }, 1),
          cabinet(["a"], 1),
          cabinet(true, 1),
          cabinet("a", { nested: 1 }),
          cabinet("a", [1]),
          cabinet("a", true),
          cabinet("a", "1"),
          cabinet("a", null),
          { kind: "cabinet" },
          { kind: ["cabinet"], placementId: "wrong-kind", amountMinor: 1 },
          { kind: "CABINET", placementId: "wrong-case", amountMinor: 1 },
          { kind: "cabinet ", placementId: "wrong-space", amountMinor: 1 },
          cabinet("kept", 4),
        ],
      });

      expect(lines).toEqual([{ placementId: "kept", amountMinor: 4 }]);
    });

    it("drops a number past what a JavaScript number holds exactly, and a fraction, and keeps 100.0 as 100", async () => {
      const lines = await keptLinesOf(
        undefined,
        `{"lines":[
          {"kind":"cabinet","placementId":"past-safe","amountMinor":9007199254740993},
          {"kind":"cabinet","placementId":"safe-edge","amountMinor":9007199254740991},
          {"kind":"cabinet","placementId":"huge","amountMinor":1e400},
          {"kind":"cabinet","placementId":"fraction","amountMinor":0.5},
          {"kind":"cabinet","placementId":"negative","amountMinor":-1},
          {"kind":"cabinet","placementId":"minus-zero","amountMinor":-0},
          {"kind":"cabinet","placementId":"decimal-whole","amountMinor":100.0},
          {"kind":"cabinet","placementId":"exponent-whole","amountMinor":1e3}
        ]}`,
      );

      expect(lines.map((line) => line.placementId)).toEqual([
        "safe-edge",
        "minus-zero",
        "decimal-whole",
        "exponent-whole",
      ]);
      expect(
        lines.find((line) => line.placementId === "decimal-whole"),
      ).toEqual({
        placementId: "decimal-whole",
        amountMinor: 100,
      });
      expect(
        lines.find((line) => line.placementId === "exponent-whole")
          ?.amountMinor,
      ).toBe(1000);
    });

    it("keeps an id of exactly MAX_IDENTIFIER_LENGTH characters of astral letters, and drops one more", async () => {
      const atBound = ASTRAL.repeat(MAX_IDENTIFIER_LENGTH / 2);
      const pastBound = `${atBound}x`;

      const lines = await keptLinesOf({
        lines: [cabinet(pastBound, 1), cabinet(atBound, 2)],
      });

      // The bound is the one `String.length` measures, as the web reader's and the domain's schema measure it.
      expect(lines.map((line) => line.amountMinor)).toEqual([2]);
    });

    it("carries ids with bidi controls, combining marks, quotes, and prototype names as plain text, in order", async () => {
      const ids = [
        `${RLO}evil${PDI}`,
        `e${COMBINING_ACUTE}`,
        `"quoted" \\ back`,
        "__proto__",
        "constructor",
        "toString",
        "hasOwnProperty",
        "",
      ];

      const lines = await keptLinesOf({
        lines: ids.map((id, index) => cabinet(id, index)),
      });

      expect(lines.map((line) => line.placementId)).toEqual(ids);
      expect(Object.getPrototypeOf(lines[3])).toBe(Object.prototype);
      expect(Object.prototype).not.toHaveProperty("placementId");
    });

    it("answers a kitchen with a deeply nested, huge snapshot without failing, and reads its cabinet lines", async () => {
      const depth = 200;
      const nested = `${'{"a":'.repeat(depth)}1${"}".repeat(depth)}`;
      const filler = Array.from({ length: 4000 }, () => nested).join(",");

      const lines = await keptLinesOf(
        undefined,
        `{"lines":[${filler},{"kind":"cabinet","placementId":"after-4000","amountMinor":3}]}`,
      );

      expect(lines).toEqual([{ placementId: "after-4000", amountMinor: 3 }]);
    }, 60_000);

    it("keeps the snapshot's order for a reversed run of ids, not the ids' or the amounts'", async () => {
      const lines = await keptLinesOf({
        lines: Array.from({ length: 60 }, (_, index) =>
          cabinet(`z${String(59 - index).padStart(2, "0")}`, (index * 37) % 11),
        ),
      });

      expect(lines.map((line) => line.placementId)).toEqual(
        Array.from(
          { length: 60 },
          (_, index) => `z${String(59 - index).padStart(2, "0")}`,
        ),
      );
    });

    it("keeps a stored zero for the reader to carry, which only the page sets aside", async () => {
      expect(await keptLinesOf({ lines: [cabinet("free", 0)] })).toEqual([
        { placementId: "free", amountMinor: 0 },
      ]);
    });
  });

  describe("which request the lines, the total and the sent copy come from", () => {
    it("takes all three from one request when two share an instant, the larger client request id", async () => {
      const designId = await plantSentKitchen(null);
      const smaller = "qa6d-0000000000000001";
      const larger = "qa6d-0000000000000002";
      await plantRequest(designId, {
        clientRequestId: smaller,
        priced: {
          totalMinor: 111,
          currency: "MDL",
          lines: [cabinet("from-smaller", 1)],
        },
      });
      await plantRequest(designId, {
        clientRequestId: larger,
        priced: {
          totalMinor: 222,
          currency: "MDL",
          lines: [cabinet("from-larger", 2)],
        },
      });
      await plantCopy(smaller, 3);
      await plantCopy(larger, 5);

      const kitchen = await foundKitchen(designId);

      expect(kitchen.sentTotal).toEqual({ totalMinor: 222, currency: "MDL" });
      expect(kitchen.sentCabinetLines).toEqual([
        { placementId: "from-larger", amountMinor: 2 },
      ]);
      expect(kitchen.asSent?.placements).toHaveLength(5);
    });

    it("never mixes in an older request's lines when the newest request stored none", async () => {
      const designId = await plantSentKitchen(null);
      await plantRequest(designId, {
        clientRequestId: aRequestId(),
        createdAt: "3600-01-01T00:00:00.000Z",
        priced: { totalMinor: 1, currency: "MDL", lines: [cabinet("old", 1)] },
      });
      await plantRequest(designId, {
        clientRequestId: aRequestId(),
        createdAt: "3600-01-02T00:00:00.000Z",
        priced: { totalMinor: 2, currency: "MDL" },
      });

      expect((await foundKitchen(designId)).sentCabinetLines).toEqual([]);
    });
  });

  describe("the postal address", () => {
    const NOT_TRIMMED = `  Str. ${RLO}Pacii${PDI} 1 ${ASTRAL}e${COMBINING_ACUTE} `;

    it("arrives exactly as stored: untrimmed, bidi controls, astral and combining characters, whitespace alone, 200 characters", async () => {
      for (const address of [
        NOT_TRIMMED,
        "   ",
        "\t",
        "a".repeat(200),
        ASTRAL.repeat(100),
      ]) {
        const account = await plantAccount(address);
        const designId = await plantSentKitchen(account);

        const kitchen = await foundKitchen(designId);

        expect(kitchen.client?.address).toBe(address);
        expect(Array.from(kitchen.client?.address ?? "")).toEqual(
          Array.from(address),
        );
      }
    });

    it("is null for a profile with none, and the kitchen has no client at all when no account owns it", async () => {
      const without = await plantSentKitchen(await plantAccount(null));
      const unowned = await plantSentKitchen(null);

      expect((await foundKitchen(without)).client?.address).toBeNull();
      expect((await foundKitchen(unowned)).client).toBeNull();
    });

    it("is read by the kitchen's statement and by no statement the list sends, and no search finds a kitchen by it", async () => {
      const marker = `ZQW-${randomBytes(8).toString("hex")}`;
      const account = await plantAccount(`Strada ${marker} 9`);
      await plantSentKitchen(account);
      const reader = readerOverTransaction();
      const sent: string[] = [];
      const recording = (
        strings: TemplateStringsArray,
        ...values: unknown[]
      ) => {
        sent.push(textOf(strings));
        return tagOverTransaction(strings, ...values);
      };
      Object.assign(reader, { sql: recording });
      const query: StaffKitchenQuery = {
        segment: "all",
        status: null,
        search: marker,
        page: 1,
      };

      const found = await reader.listPage(query);
      await reader.countChanged();

      expect(found.total).toBe(0);
      expect(found.kitchens).toEqual([]);
      expect(sent.length).toBeGreaterThan(0);
      for (const text of sent) expect(text).not.toMatch(/address/i);
    });
  });
});
