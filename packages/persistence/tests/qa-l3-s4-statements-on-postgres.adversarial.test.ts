import { randomBytes } from "node:crypto";

import { fc } from "@fast-check/vitest";
import {
  CURRENT_SCHEMA_VERSION,
  KITCHEN_L_DESIGN,
  STAFF_KITCHEN_PAGE_SIZE,
  readStaffKitchenQuery,
  staffKitchenOffsetOf,
} from "@lemnaria/configurator-domain";
import type {
  RequestStatus,
  StaffKitchenQuery,
} from "@lemnaria/configurator-domain";
import { Client, neon } from "@neondatabase/serverless";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FakeStaffKitchenReader } from "../src/fake-staff-kitchen-reader.js";
import { NeonStaffKitchenReader } from "../src/neon-staff-kitchen-reader.js";
import { openDatabaseSession } from "../src/open-database.js";
import { StaffKitchenReaderError } from "../src/staff-kitchen-reader.js";
import type {
  StaffKitchenDetail,
  StaffKitchenReader,
  StaffListedKitchen,
} from "../src/staff-kitchen-reader.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { rejectionOf } from "./support/rejection-of.js";
import { holdSharedTestSchemaLock } from "./support/test-schema-lock.js";

// Shared: every write below happens inside a transaction that is rolled back, so the file needs the schema intact and
// leaves nothing behind.
holdSharedTestSchemaLock();

/**
 * Adversarial QA of the staff kitchen reader, against the statements it really sends, on a real Postgres.
 *
 * **How the production SQL runs here.** `NeonStaffKitchenReader` takes its `sql` from the driver's tagged template. This
 * file swaps in a tag of its own that sends the same text (built from the same strings array) and parameters over a
 * WebSocket session on which a transaction is open, so the statements tested are the ones the reader sends and nothing a
 * test writes survives. The transaction is `repeatable read`: a `total` read before rows are planted and one read after
 * differ by exactly the rows planted, whatever other writers commit meanwhile. Every planted row sits in the year 3500
 * (later than any other row in the database), so it heads each list it belongs to.
 *
 * The session is the test database's **owner**: this file shows what the statements do with rows, not what the
 * application role may select (its grants are not applied on this database; `qa-l3-s4-statement-inventory` checks the
 * columns the statements name against the migration headers instead).
 *
 * **Mutation proof.** Each assertion here was shown to fail against the statement text with one change (a predicate
 * dropped, a column added to the search, an order key dropped, a cast widened, a write added); the record is in the
 * commit message.
 */
const SUITE_NAME =
  "staff kitchen reader statements on a real Postgres (live test database)";
if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

const PASSWORD_HASH = `$argon2id$v=19$m=19456,t=2,p=1$${"A".repeat(22)}$${"B".repeat(43)}`;
const ONE_MINUTE_MICROS = 60_000_000n;
const ONE_DAY_MICROS = 86_400_000_000n;
const ERA_MICROS = BigInt(Date.UTC(3500, 0, 1)) * 1000n;
const PAGE = STAFF_KITCHEN_PAGE_SIZE;
const LAST_COUNTABLE_PAGE = Math.floor(Number.MAX_SAFE_INTEGER / PAGE);
const DESIGN_ID_LENGTH = 21;
const SEGMENTS = ["sent", "drafts", "all"] as const;
const FILTERABLE_STATUSES: readonly RequestStatus[] = [
  "new",
  "contacted",
  "offer-sent",
  "closed",
];
const UNKNOWN_STATUS = "from-a-later-build";
const UNDEFINED_TABLE = "42P01";
const NONE = { kind: "none" } as const;

/** Letters named by code point, so the source holds no Romanian literal and no invisible character. */
const S_COMMA_BELOW_UPPER = String.fromCodePoint(0x218);
const S_COMMA_BELOW_LOWER = String.fromCodePoint(0x219);
const S_CEDILLA_UPPER = String.fromCodePoint(0x15e);
const S_CEDILLA_LOWER = String.fromCodePoint(0x15f);
const I_DOT_ABOVE_UPPER = String.fromCodePoint(0x130);
const SHARP_S = String.fromCodePoint(0xdf);
const A_DIAERESIS_UPPER = String.fromCodePoint(0xc4);
const A_DIAERESIS_LOWER = String.fromCodePoint(0xe4);
const E_ACUTE = String.fromCodePoint(0xe9);
const COMBINING_COMMA_BELOW = String.fromCodePoint(0x326);

type Row = Record<string, unknown>;
type Segment = (typeof SEGMENTS)[number];

let client: Client;
let sentStatements: string[] = [];
let nextDesignNumber = 0;

// ---------------------------------------------------------------------------------------------------------------------
// The harness: the production statements over a transaction that is rolled back
// ---------------------------------------------------------------------------------------------------------------------

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
  const text = textOf(strings);
  sentStatements.push(text);
  return client
    .query(text, values as never[])
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

async function beginSnapshotTransaction(): Promise<void> {
  await client.query("begin isolation level repeatable read");
}

async function endTransaction(): Promise<void> {
  await client.query("rollback");
}

function forgetStatements(): void {
  sentStatements = [];
}

// ---------------------------------------------------------------------------------------------------------------------
// Planting
// ---------------------------------------------------------------------------------------------------------------------

interface PlantedAccount {
  readonly id: string;
  readonly email: string;
  readonly emailNormalForm: string;
  readonly role: "client" | "operator";
  readonly name: string | null;
  readonly phone: string | null;
  readonly address: string | null;
}

interface PlantedDesign {
  readonly id: string;
  readonly accountId: string | null;
  readonly name: string | null;
  readonly sentAt: bigint | null;
  readonly updatedAt: bigint;
  readonly isHidden: boolean;
  readonly isDeleted: boolean;
}

interface PlantedRequest {
  readonly clientRequestId: string;
  readonly reference: string;
  readonly designId: string;
  readonly createdAt: bigint;
}

interface PlantedStatus {
  readonly designId: string;
  readonly status: string;
  readonly changedBy: string;
  readonly changedAt: bigint;
}

interface PlantedNote {
  readonly id: string;
  readonly designId: string;
  readonly authorId: string;
  readonly body: string;
  readonly createdAt: bigint;
}

/** A timestamptz literal with the microseconds a `Date` cannot hold. */
function instantOf(micros: bigint): string {
  const milliseconds = new Date(Number(micros / 1000n)).toISOString();
  const remainder = (micros % 1000n).toString().padStart(3, "0");
  return milliseconds.replace("Z", `${remainder}Z`);
}

function column<Item, Value>(
  items: readonly Item[],
  pick: (item: Item) => Value,
): Value[] {
  return items.map(pick);
}

async function plantAccounts(accounts: readonly PlantedAccount[]) {
  await run(
    `insert into accounts (id, email, email_normal_form, password_hash, role, locale, privacy_notice_version,
       phone, phone_normal_form, address, name)
     select t.id, t.email, t.normal_form, $1, t.role, 'ro', '1', t.phone, t.phone, t.address, t.name
     from unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[])
       as t(id, email, normal_form, role, phone, address, name)`,
    [
      PASSWORD_HASH,
      column(accounts, (a) => a.id),
      column(accounts, (a) => a.email),
      column(accounts, (a) => a.emailNormalForm),
      column(accounts, (a) => a.role),
      column(accounts, (a) => a.phone),
      column(accounts, (a) => a.address),
      column(accounts, (a) => a.name),
    ],
  );
}

async function plantDesigns(designs: readonly PlantedDesign[]) {
  await run(
    `insert into designs (id, schema_version, document, account_id, name, sent_at, updated_at,
       hidden_by_client_at, deleted_by_client_at)
     select t.id, $1::int, $2::jsonb, t.account_id, t.name, t.sent_at, t.updated_at,
       case when t.is_hidden then now() end, case when t.is_deleted then now() end
     from unnest($3::text[], $4::text[], $5::text[], $6::timestamptz[], $7::timestamptz[], $8::boolean[],
       $9::boolean[]) as t(id, account_id, name, sent_at, updated_at, is_hidden, is_deleted)`,
    [
      CURRENT_SCHEMA_VERSION,
      JSON.stringify(KITCHEN_L_DESIGN),
      column(designs, (d) => d.id),
      column(designs, (d) => d.accountId),
      column(designs, (d) => d.name),
      column(designs, (d) => (d.sentAt === null ? null : instantOf(d.sentAt))),
      column(designs, (d) => instantOf(d.updatedAt)),
      column(designs, (d) => d.isHidden),
      column(designs, (d) => d.isDeleted),
    ],
  );
}

interface RequestTypedText {
  readonly name: string;
  readonly phone: string;
  readonly locality: string;
  readonly channel: string;
  readonly email: string;
}

const PLAIN_REQUEST_TEXT: RequestTypedText = {
  name: "Request Typed Name",
  phone: "+37360777666",
  locality: "Request Typed Locality",
  channel: "Request Typed Channel",
  email: "typed-in-request@example.invalid",
};

async function plantRequests(
  requests: readonly PlantedRequest[],
  typed: RequestTypedText = PLAIN_REQUEST_TEXT,
) {
  await run(
    `insert into contact_submissions (client_request_id, reference, design_id, design_revision, payload_digest,
       created_at, name, phone, phone_normal_form, locality, channel, email, consent_text_version, locale,
       design_document, priced)
     select t.crid, t.reference, t.design_id, 1, t.digest, t.created_at, $1, $2, $2, $3, $4, $5, '1', 'ro',
       '{}'::jsonb, '{}'::jsonb
     from unnest($6::text[], $7::text[], $8::text[], $9::text[], $10::timestamptz[])
       as t(crid, reference, design_id, digest, created_at)`,
    [
      typed.name,
      typed.phone,
      typed.locality,
      typed.channel,
      typed.email,
      column(requests, (r) => r.clientRequestId),
      column(requests, (r) => r.reference),
      column(requests, (r) => r.designId),
      column(requests, () => randomBytes(32).toString("hex")),
      column(requests, (r) => instantOf(r.createdAt)),
    ],
  );
}

async function plantStatuses(statuses: readonly PlantedStatus[]) {
  await run(
    `insert into design_request_states (design_id, status, changed_by_account_id, changed_at)
     select * from unnest($1::text[], $2::text[], $3::text[], $4::timestamptz[])`,
    [
      column(statuses, (s) => s.designId),
      column(statuses, (s) => s.status),
      column(statuses, (s) => s.changedBy),
      column(statuses, (s) => instantOf(s.changedAt)),
    ],
  );
}

async function plantNotes(notes: readonly PlantedNote[]) {
  await run(
    `insert into design_notes (id, design_id, author_account_id, body, created_at)
     select * from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::timestamptz[])`,
    [
      column(notes, (n) => n.id),
      column(notes, (n) => n.designId),
      column(notes, (n) => n.authorId),
      column(notes, (n) => n.body),
      column(notes, (n) => instantOf(n.createdAt)),
    ],
  );
}

function randomToken(): string {
  return randomBytes(6).toString("hex");
}

function anAccount(spec: Partial<PlantedAccount> = {}): PlantedAccount {
  const email = spec.email ?? `qa-l3-s4-${randomToken()}@Example.INVALID`;
  return {
    id: nanoid(),
    email,
    emailNormalForm: email.toLowerCase(),
    role: "client",
    name: null,
    phone: null,
    address: null,
    ...spec,
  };
}

/** `QA4` + a letter naming the group + a number, padded with `Z` to the 21 characters the status and note tables check. */
function aDesignId(group: string): string {
  nextDesignNumber += 1;
  const head = `QA4${group}${String(nextDesignNumber).padStart(5, "0")}`;
  return head.padEnd(DESIGN_ID_LENGTH, "Z");
}

function aKitchen(
  spec: Partial<PlantedDesign> & Pick<PlantedDesign, "id" | "updatedAt">,
): PlantedDesign {
  return {
    accountId: null,
    name: null,
    sentAt: null,
    isHidden: false,
    isDeleted: false,
    ...spec,
  };
}

function aReference(): string {
  return `QA4-${randomToken().toUpperCase()}`;
}

function accountRefOf(account: PlantedAccount) {
  return { id: account.id, email: account.email, name: account.name };
}

function clientOf(account: PlantedAccount) {
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    phone: account.phone,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------------------------------

function queryOf(
  overrides: Partial<StaffKitchenQuery> = {},
): StaffKitchenQuery {
  return { segment: "sent", status: null, search: null, page: 1, ...overrides };
}

function idsOf(kitchens: readonly StaffListedKitchen[]): string[] {
  return kitchens.map((kitchen) => kitchen.id);
}

/** Every page until one is short or empty. A page of one's own rows heads the list, so a few pages are enough. */
async function walkedPagesOf(
  reader: StaffKitchenReader,
  query: StaffKitchenQuery,
  maxPages = 8,
): Promise<{ kitchens: StaffListedKitchen[]; totals: number[] }> {
  const kitchens: StaffListedKitchen[] = [];
  const totals: number[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const reading = await reader.listPage({ ...query, page });
    totals.push(reading.total);
    kitchens.push(...reading.kitchens);
    if (reading.kitchens.length < PAGE) break;
  }
  return { kitchens, totals };
}

async function foundKitchen(
  reader: StaffKitchenReader,
  designId: string,
): Promise<StaffKitchenDetail> {
  const reading = await reader.readOne(designId);
  if (reading.kind !== "found") throw new Error("the kitchen was not found");
  return reading.kitchen;
}

async function totalsOf(
  reader: StaffKitchenReader,
): Promise<Record<Segment, number>> {
  const [sent, drafts, all] = await Promise.all(
    SEGMENTS.map((segment) => reader.listPage(queryOf({ segment }))),
  );
  return {
    sent: sent?.total ?? NaN,
    drafts: drafts?.total ?? NaN,
    all: all?.total ?? NaN,
  };
}

const QA_PREFIX = "QA4";

describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  beforeAll(async () => {
    client = openDatabaseSession(liveTestDatabaseUrl, "TEST_DATABASE_URL");
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  // -------------------------------------------------------------------------------------------------------------------
  describe("the harness", () => {
    it("builds statement text from the same strings the driver reads, so a backslash escape means the same in both", async () => {
      const pattern = "%a\\\\b%";
      const viaDriver = await neon(
        liveTestDatabaseUrl,
      )`select ('a\\b' ilike ${pattern}::text escape '\\') as hit`;
      const viaTag =
        await tagOverTransaction`select ('a\\b' ilike ${pattern}::text escape '\\') as hit`;

      expect(viaDriver).toEqual([{ hit: true }]);
      expect(viaTag).toEqual(viaDriver);
    });
  });

  // -------------------------------------------------------------------------------------------------------------------
  describe("every combination of owner, sent, hidden, deleted and stored status", () => {
    type Owner = "live" | "dangling" | "none";
    type Stored = "absent" | "contacted" | typeof UNKNOWN_STATUS;

    interface Cell {
      readonly id: string;
      readonly owner: Owner;
      readonly isSent: boolean;
      readonly isHidden: boolean;
      readonly isDeleted: boolean;
      readonly stored: Stored;
      readonly updatedAt: bigint;
      readonly sentAt: bigint | null;
      readonly hasRequest: boolean;
      readonly reference: string;
    }

    const OWNERS: readonly Owner[] = ["live", "dangling", "none"];
    const STOREDS: readonly Stored[] = ["absent", "contacted", UNKNOWN_STATUS];
    const BOOLEANS = [false, true] as const;
    const CELL_COUNT = OWNERS.length * 8 * STOREDS.length;
    const CHANGED_AT = ERA_MICROS + 400n * ONE_DAY_MICROS;

    const owner = anAccount({
      name: "Matrix Client",
      phone: "+37360111000",
      address: "Strada Secreta 17 (matrix marker)",
    });
    const staff = anAccount({ role: "operator", name: "Matrix Staff" });
    const danglingAccountId = nanoid();
    const cells: Cell[] = [];
    let baseline: Record<Segment, number>;

    function accountIdOf(cell: Cell): string | null {
      if (cell.owner === "live") return owner.id;
      return cell.owner === "dangling" ? danglingAccountId : null;
    }

    function isListedIn(cell: Cell, segment: Segment): boolean {
      if (cell.isDeleted) return false;
      if (segment === "sent") return cell.isSent;
      if (segment === "drafts") return !cell.isSent && cell.owner !== "none";
      return cell.isSent || cell.owner !== "none";
    }

    function shownStatusOf(cell: Cell): string | null {
      if (!cell.isSent) return null;
      if (cell.stored === "absent") return "new";
      return cell.stored === "contacted" ? "contacted" : "unrecognised";
    }

    function effectiveStatusOf(cell: Cell): string {
      return cell.stored === "absent" ? "new" : cell.stored;
    }

    function sortedAt(cell: Cell, segment: Segment): bigint {
      return segment === "sent" ? (cell.sentAt ?? 0n) : cell.updatedAt;
    }

    function expectedIds(segment: Segment, status: RequestStatus | null) {
      return cells
        .filter((cell) => isListedIn(cell, segment))
        .filter((cell) => status === null || effectiveStatusOf(cell) === status)
        .sort((left, right) => {
          const byTime = sortedAt(right, segment) - sortedAt(left, segment);
          if (byTime !== 0n) return byTime > 0n ? 1 : -1;
          return left.id < right.id ? 1 : -1;
        })
        .map((cell) => cell.id);
    }

    function isReadable(cell: Cell): boolean {
      return !cell.isDeleted && (cell.isSent || cell.owner !== "none");
    }

    beforeAll(async () => {
      for (const ownerKind of OWNERS) {
        for (const isSent of BOOLEANS) {
          for (const isHidden of BOOLEANS) {
            for (const isDeleted of BOOLEANS) {
              for (const stored of STOREDS) {
                const index = cells.length;
                const needsRequest = isSent || ownerKind === "none";
                cells.push({
                  id: aDesignId("M"),
                  owner: ownerKind,
                  isSent,
                  isHidden,
                  isDeleted,
                  stored,
                  updatedAt: ERA_MICROS + BigInt(index) * ONE_MINUTE_MICROS,
                  sentAt: isSent
                    ? ERA_MICROS +
                      BigInt((index * 7 + 1) % CELL_COUNT) * ONE_MINUTE_MICROS +
                      5_000_000n
                    : null,
                  hasRequest: needsRequest,
                  reference: aReference(),
                });
              }
            }
          }
        }
      }
      await beginSnapshotTransaction();
      baseline = await totalsOf(readerOverTransaction());
      await plantAccounts([owner, staff]);
      await plantDesigns(
        cells.map((cell) =>
          aKitchen({
            id: cell.id,
            accountId: accountIdOf(cell),
            name: `Kitchen ${cell.id.slice(3, 10)}`,
            sentAt: cell.sentAt,
            updatedAt: cell.updatedAt,
            isHidden: cell.isHidden,
            isDeleted: cell.isDeleted,
          }),
        ),
      );
      await plantRequests(
        cells
          .filter((cell) => cell.hasRequest)
          .map((cell) => ({
            clientRequestId: nanoid(),
            reference: cell.reference,
            designId: cell.id,
            createdAt: cell.updatedAt,
          })),
      );
      await plantStatuses(
        cells
          .filter((cell) => cell.stored !== "absent")
          .map((cell) => ({
            designId: cell.id,
            status: cell.stored,
            changedBy: staff.id,
            changedAt: CHANGED_AT,
          })),
      );
      await plantNotes(
        cells.map((cell) => ({
          id: nanoid(),
          designId: cell.id,
          authorId: staff.id,
          body: `note of ${cell.id}`,
          createdAt: CHANGED_AT,
        })),
      );
    }, 120_000);

    afterAll(endTransaction);

    it("lists in each segment exactly the kitchens it is defined to hold, in its order, with the total of the segment", async () => {
      const reader = readerOverTransaction();

      for (const segment of SEGMENTS) {
        const expected = expectedIds(segment, null);
        const { kitchens, totals } = await walkedPagesOf(
          reader,
          queryOf({ segment }),
        );
        const ids = idsOf(kitchens);
        const mine = ids.filter((id) => id.startsWith(QA_PREFIX));
        const lastOfMine = ids.lastIndexOf(mine.at(-1) ?? "");

        expect(mine, segment).toEqual(expected);
        expect(lastOfMine, `${segment}: foreign rows only after mine`).toBe(
          mine.length - 1,
        );
        expect(
          new Set(totals).size,
          `${segment}: one total on every page`,
        ).toBe(1);
        expect((totals[0] ?? NaN) - baseline[segment], segment).toBe(
          expected.length,
        );
      }
    }, 60_000);

    it("lists a visitor's unsent draft under no segment and no status filter, with a request, a status row and notes attached", async () => {
      const reader = readerOverTransaction();
      const visitorDrafts = cells
        .filter(
          (cell) => cell.owner === "none" && !cell.isSent && !cell.isDeleted,
        )
        .map((cell) => cell.id);
      const queries = [
        ...SEGMENTS.map((segment) => queryOf({ segment })),
        ...FILTERABLE_STATUSES.map((status) => queryOf({ status })),
      ];

      expect(visitorDrafts).toHaveLength(6);
      for (const query of queries) {
        const { kitchens } = await walkedPagesOf(reader, query);
        for (const id of visitorDrafts)
          expect(idsOf(kitchens)).not.toContain(id);
      }
    }, 60_000);

    it("filters the sent segment by every status, counting no saved status as new and a stored text outside the list as no status", async () => {
      const reader = readerOverTransaction();

      for (const status of FILTERABLE_STATUSES) {
        const { kitchens } = await walkedPagesOf(reader, queryOf({ status }));
        const mine = idsOf(kitchens).filter((id) => id.startsWith(QA_PREFIX));

        expect(mine, status).toEqual(expectedIds("sent", status));
      }
    }, 60_000);

    it("shows each listed kitchen's status, badges and client as the facts say, and a client for a live account alone", async () => {
      const reader = readerOverTransaction();
      const { kitchens } = await walkedPagesOf(
        reader,
        queryOf({ segment: "all" }),
      );

      for (const listed of kitchens.filter((kitchen) =>
        kitchen.id.startsWith(QA_PREFIX),
      )) {
        const cell = cells.find((candidate) => candidate.id === listed.id);
        expect(cell).toBeDefined();
        expect(
          {
            isSent: listed.isSent,
            isHidden: listed.isHidden,
            requestStatus: listed.requestStatus,
            client: listed.client,
          },
          listed.id,
        ).toStrictEqual({
          isSent: cell?.isSent,
          isHidden: cell?.isHidden,
          requestStatus: cell === undefined ? "?" : shownStatusOf(cell),
          client: cell?.owner === "live" ? clientOf(owner) : null,
        });
      }
    }, 60_000);

    it("reads exactly the kitchens that are not client-deleted and are sent or owned, and answers every other id with the one nothing", async () => {
      const reader = readerOverTransaction();

      for (const cell of cells) {
        const reading = await reader.readOne(cell.id);
        expect(reading.kind, cell.id).toBe(isReadable(cell) ? "found" : "none");
        if (reading.kind === "none")
          expect(reading, cell.id).toStrictEqual(NONE);
      }
    }, 120_000);

    it("reads a found kitchen's badges, client, request, status and notes as the facts say", async () => {
      const reader = readerOverTransaction();

      for (const cell of cells.filter(isReadable)) {
        const detail = await foundKitchen(reader, cell.id);
        expect(
          {
            isSent: detail.isSent,
            isHidden: detail.isHidden,
            client: detail.client,
            request: detail.request?.reference ?? null,
            status: detail.status?.value ?? null,
            changedBy: detail.status?.change?.by ?? null,
            notes: detail.notes.map((note) => note.text),
            hasDocument: detail.design !== null,
          },
          cell.id,
        ).toStrictEqual({
          isSent: cell.isSent,
          isHidden: cell.isHidden,
          client: cell.owner === "live" ? clientOf(owner) : null,
          request: cell.hasRequest ? cell.reference : null,
          status: shownStatusOf(cell),
          changedBy:
            shownStatusOf(cell) !== null && cell.stored !== "absent"
              ? accountRefOf(staff)
              : null,
          notes: [`note of ${cell.id}`],
          hasDocument: true,
        });
      }
    }, 120_000);

    it("answers the same list and the same kitchen twice from one snapshot", async () => {
      const reader = readerOverTransaction();
      const query = queryOf({ segment: "all" });
      const sample = cells.find(isReadable)?.id ?? "";

      const firstList = await walkedPagesOf(reader, query);
      const secondList = await walkedPagesOf(reader, query);
      const firstKitchen = await reader.readOne(sample);
      const secondKitchen = await reader.readOne(sample);

      expect(secondList).toStrictEqual(firstList);
      expect(secondKitchen).toStrictEqual(firstKitchen);
    }, 60_000);

    it("sends one statement, the same text, for an unknown id, a client-deleted kitchen and a visitor's draft, and none for a malformed id", async () => {
      const reader = readerOverTransaction();
      const deleted = cells.find((cell) => cell.isDeleted && cell.isSent);
      const deletedWithNotes = cells.find(
        (cell) => cell.isDeleted && cell.owner === "live",
      );
      const visitorDraft = cells.find(
        (cell) =>
          cell.owner === "none" &&
          !cell.isSent &&
          !cell.isDeleted &&
          cell.stored !== "absent",
      );
      const unknown = `QA4U${"Z".repeat(17)}`;
      const refused = [
        unknown,
        deleted?.id,
        deletedWithNotes?.id,
        visitorDraft?.id,
      ];
      const texts: string[][] = [];

      for (const id of refused) {
        forgetStatements();
        const reading = await reader.readOne(id ?? "");
        texts.push([...sentStatements]);
        expect(reading, String(id)).toStrictEqual(NONE);
      }
      forgetStatements();
      const malformed = await reader.readOne("a b");

      expect(refused.every((id) => id !== undefined)).toBe(true);
      expect(texts.map((sent) => sent.length)).toEqual([1, 1, 1, 1]);
      expect(new Set(texts.map((sent) => sent[0])).size).toBe(1);
      expect(malformed).toStrictEqual(NONE);
      expect(sentStatements).toEqual([]);
    }, 60_000);

    it("sends the notes statement once and only for a kitchen it found", async () => {
      const reader = readerOverTransaction();
      const readable = cells.find(isReadable)?.id ?? "";
      forgetStatements();

      await foundKitchen(reader, readable);

      expect(sentStatements).toHaveLength(2);
      expect(sentStatements[1]).toContain("from design_notes");
    });

    it("runs every list and every reading inside a read-only transaction, so no path writes, and the control write is refused", async () => {
      const reader = readerOverTransaction();
      await run("savepoint read_only");
      await run("set local transaction_read_only = on");
      try {
        for (const segment of SEGMENTS) {
          await reader.listPage(queryOf({ segment, search: "qa-l3-s4" }));
          await reader.listPage(
            queryOf({ segment, page: LAST_COUNTABLE_PAGE }),
          );
        }
        for (const status of FILTERABLE_STATUSES) {
          await reader.listPage(queryOf({ status, search: "%_\\'" }));
        }
        for (const cell of cells) await reader.readOne(cell.id);
        const control = await rejectionOf(
          run(
            "insert into design_notes (id, design_id, author_account_id, body) values ($1, $1, $1, 'x')",
            [nanoid()],
          ),
        );

        expect((control as { code?: string }).code).toBe("25006");
      } finally {
        await run("rollback to savepoint read_only");
      }
    }, 120_000);
  });

  // -------------------------------------------------------------------------------------------------------------------
  describe("ties and the end of the list", () => {
    const GROUP_SIZES: readonly number[] = [0, 1, 19, 20, 21, 40, 41];
    const clock = ERA_MICROS + 10n * ONE_DAY_MICROS;
    const clientOfGroup = new Map<
      number,
      { account: PlantedAccount; token: string; ids: string[] }
    >();
    const leadIds: string[] = [];
    const leadInstant = clock + 60n * ONE_DAY_MICROS;
    let baseline: Record<Segment, number>;

    beforeAll(async () => {
      for (const size of GROUP_SIZES) {
        const token = `grp${String(size)}x${randomToken()}`;
        const account = anAccount({ name: `Tie ${token}` });
        const ids = Array.from({ length: size }, () => aDesignId("T"));
        clientOfGroup.set(size, { account, token, ids });
      }
      for (let lead = 0; lead < 25; lead += 1) leadIds.push(aDesignId("L"));
      await beginSnapshotTransaction();
      baseline = await totalsOf(readerOverTransaction());
      await plantAccounts(
        [...clientOfGroup.values()].map((group) => group.account),
      );
      const drafts: PlantedDesign[] = [...clientOfGroup.entries()].flatMap(
        ([size, group]) =>
          group.ids.map((id) =>
            aKitchen({
              id,
              accountId: group.account.id,
              updatedAt: clock + BigInt(size) * ONE_DAY_MICROS,
            }),
          ),
      );
      const leads = leadIds.map((id) =>
        aKitchen({ id, sentAt: leadInstant, updatedAt: leadInstant }),
      );
      await plantDesigns([...drafts, ...leads]);
    }, 120_000);

    afterAll(endTransaction);

    it.each(GROUP_SIZES)(
      "pages %i kitchens of one instant by id, larger first, with the same total on every page and an empty page past the end",
      async (size) => {
        const reader = readerOverTransaction();
        const group = clientOfGroup.get(size);
        const query = queryOf({
          segment: "drafts",
          search: group?.token ?? "",
        });
        const pageCount = Math.ceil(size / PAGE);
        const planted = [...(group?.ids ?? [])].sort().reverse();

        const pages = [];
        for (let page = 1; page <= pageCount + 1; page += 1) {
          pages.push(await reader.listPage({ ...query, page }));
        }

        expect(pages.map((reading) => reading.total)).toEqual(
          pages.map(() => size),
        );
        expect(pages.flatMap((reading) => idsOf(reading.kitchens))).toEqual(
          planted,
        );
        expect(pages.at(-1)?.kitchens).toEqual([]);
        expect(
          pages.slice(0, pageCount).map((reading) => reading.kitchens.length),
        ).toEqual(
          Array.from({ length: pageCount }, (_, page) =>
            Math.min(PAGE, size - page * PAGE),
          ),
        );
      },
      60_000,
    );

    it("pages 25 sent kitchens no account owns, all sent at one instant, in the sent and the all segments alike", async () => {
      const reader = readerOverTransaction();
      const descending = [...leadIds].sort().reverse();

      for (const segment of ["sent", "all"] as const) {
        const first = await reader.listPage(queryOf({ segment, page: 1 }));
        const second = await reader.listPage(queryOf({ segment, page: 2 }));

        expect(idsOf(first.kitchens), segment).toEqual(
          descending.slice(0, PAGE),
        );
        expect(idsOf(second.kitchens).slice(0, 5), segment).toEqual(
          descending.slice(PAGE),
        );
        expect(second.total - baseline[segment], segment).toBe(
          segment === "sent" ? leadIds.length : leadIds.length + totalDrafts(),
        );
      }
    });

    function totalDrafts(): number {
      return GROUP_SIZES.reduce((sum, size) => sum + size, 0);
    }

    it("lists no kitchen of a group with no kitchen, and counts it as nothing", async () => {
      const reader = readerOverTransaction();
      const group = clientOfGroup.get(0);

      const reading = await reader.listPage(
        queryOf({ segment: "all", search: group?.token ?? "" }),
      );

      expect(reading).toMatchObject({
        total: 0,
        kitchens: [],
        page: 1,
        pageSize: PAGE,
      });
    });

    it("answers the last countable page as an empty page with the segment's total, and refuses the page after it", async () => {
      const reader = readerOverTransaction();
      const first = await reader.listPage(queryOf({ segment: "all" }));

      const last = await reader.listPage(
        queryOf({ segment: "all", page: LAST_COUNTABLE_PAGE }),
      );
      const beyond = await rejectionOf(
        reader.listPage(
          queryOf({ segment: "all", page: LAST_COUNTABLE_PAGE + 1 }),
        ),
      );

      expect(staffKitchenOffsetOf(LAST_COUNTABLE_PAGE)).toBeLessThanOrEqual(
        Number.MAX_SAFE_INTEGER,
      );
      expect(last).toMatchObject({
        kitchens: [],
        total: first.total,
        page: LAST_COUNTABLE_PAGE,
      });
      expect(beyond).toBeInstanceOf(StaffKitchenReaderError);
      expect((beyond as StaffKitchenReaderError).failure).toBe("invalid-query");
    });

    it("orders by the microsecond, not by the millisecond a client is shown, before the id breaks a tie", async () => {
      const reader = readerOverTransaction();
      const instant = ERA_MICROS + 30n * ONE_DAY_MICROS;
      const account = anAccount({ name: `Micro ${randomToken()}` });
      const earlierWithLargerId = aDesignId("Y");
      const laterWithSmallerId = aDesignId("X");
      const middle = aDesignId("W");
      await run("savepoint micros");
      try {
        await plantAccounts([account]);
        await plantDesigns(
          [
            [earlierWithLargerId, instant + 1n],
            [laterWithSmallerId, instant + 3n],
            [middle, instant + 2n],
          ].map(([id, sentAt]) =>
            aKitchen({
              id: id as string,
              accountId: account.id,
              sentAt: sentAt as bigint,
              updatedAt: sentAt as bigint,
            }),
          ),
        );

        const reading = await reader.listPage(
          queryOf({ search: account.name ?? "" }),
        );

        expect(idsOf(reading.kitchens)).toEqual([
          laterWithSmallerId,
          middle,
          earlierWithLargerId,
        ]);
        expect(
          new Set(reading.kitchens.map((kitchen) => kitchen.sentAt?.getTime()))
            .size,
        ).toBe(1);
      } finally {
        await run("rollback to savepoint micros");
      }
    });
  });

  // -------------------------------------------------------------------------------------------------------------------
  describe("what the search reads", () => {
    const token = (label: string) => `${label}${randomToken()}`;
    const words = {
      normalEmail: token("nrm"),
      typedEmail: token("typ"),
      name: token("nam"),
      phone: `+3736${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`,
      address: token("adr"),
      kitchenName: token("kit"),
      requestName: token("rqn"),
      requestEmail: token("rqe"),
      requestPhone: `+3736${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`,
      requestLocality: token("rql"),
      requestChannel: token("rqc"),
      staffName: token("stf"),
      noteBody: token("not"),
    };
    const owner = anAccount({
      email: `Typed.${words.typedEmail}@Example.INVALID`,
      emailNormalForm: `normal.${words.normalEmail}@example.invalid`,
      name: `Owner ${words.name}`,
      phone: words.phone,
      address: `Strada ${words.address} 17`,
    });
    const staff = anAccount({
      role: "operator",
      name: `Staff ${words.staffName}`,
      email: `qa-l3-s4-staff-${randomToken()}@Example.INVALID`,
    });
    const kitchenId = aDesignId("S");
    const reference = aReference();
    const idToken = kitchenId.toLowerCase();

    beforeAll(async () => {
      await beginSnapshotTransaction();
      await plantAccounts([owner, staff]);
      const sentAt = ERA_MICROS + 50n * ONE_DAY_MICROS;
      await plantDesigns([
        aKitchen({
          id: kitchenId,
          accountId: owner.id,
          name: `Cucina ${words.kitchenName}`,
          sentAt,
          updatedAt: sentAt,
        }),
      ]);
      await plantRequests(
        [
          {
            clientRequestId: nanoid(),
            reference,
            designId: kitchenId,
            createdAt: sentAt,
          },
        ],
        {
          name: `Req ${words.requestName}`,
          phone: words.requestPhone,
          locality: `Loc ${words.requestLocality}`,
          channel: `Chan ${words.requestChannel}`,
          email: `${words.requestEmail}@example.invalid`,
        },
      );
      await plantStatuses([
        {
          designId: kitchenId,
          status: "contacted",
          changedBy: staff.id,
          changedAt: sentAt,
        },
      ]);
      await plantNotes([
        {
          id: nanoid(),
          designId: kitchenId,
          authorId: staff.id,
          body: `Body ${words.noteBody}`,
          createdAt: sentAt,
        },
      ]);
    });

    afterAll(endTransaction);

    async function matchesOf(search: string): Promise<string[]> {
      const reader = readerOverTransaction();
      const lists = await Promise.all(
        SEGMENTS.map((segment) =>
          reader.listPage(queryOf({ segment, search })),
        ),
      );
      return lists.flatMap((reading) => idsOf(reading.kitchens));
    }

    it("finds the kitchen by the account's stored normal-form address and by its profile name", async () => {
      expect(await matchesOf(words.normalEmail)).toEqual([
        kitchenId,
        kitchenId,
      ]);
      expect(await matchesOf(words.name.toUpperCase())).toEqual([
        kitchenId,
        kitchenId,
      ]);
    });

    it.each([
      [
        "the e-mail as typed, which differs from the normal form in more than case",
        "typedEmail",
      ],
      ["the kitchen's own name", "kitchenName"],
      ["the profile phone", "phone"],
      ["the postal address", "address"],
      ["the name the client typed in the request", "requestName"],
      ["the e-mail the client typed in the request", "requestEmail"],
      ["the phone the client typed in the request", "requestPhone"],
      ["the locality the client typed in the request", "requestLocality"],
      ["the channel the client typed in the request", "requestChannel"],
      [
        "the name of the staff member who set the status and wrote the note",
        "staffName",
      ],
      ["the text of a note", "noteBody"],
    ] as const)("does not find the kitchen by %s", async (_label, key) => {
      expect(await matchesOf(words[key])).toEqual([]);
    });

    it("does not find the kitchen by its request reference or by its own id", async () => {
      expect(await matchesOf(reference)).toEqual([]);
      expect(await matchesOf(reference.toLowerCase())).toEqual([]);
      expect(await matchesOf(idToken)).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------------------------------------------------
  describe("a search that holds pattern characters, quotes and backslashes", () => {
    const SEARCH_ALPHABET = [
      "%",
      "_",
      "\\",
      "'",
      '"',
      "a",
      "B",
      "x",
      " ",
      "-",
      ";",
      E_ACUTE,
    ];
    const searchArbitrary = fc.string({
      unit: fc.constantFrom(...SEARCH_ALPHABET),
      minLength: 1,
      maxLength: 24,
    });
    const METACHARACTER = /[%_\\]/g;
    let clock = ERA_MICROS + 100n * ONE_DAY_MICROS;

    beforeAll(beginSnapshotTransaction);
    afterAll(endTransaction);

    it("finds the name that holds the search, never raises on a trailing backslash, and does not read % _ or \\ as a pattern", async () => {
      const reader = readerOverTransaction();

      await fc.assert(
        fc.asyncProperty(searchArbitrary, async (search) => {
          clock += ONE_MINUTE_MICROS;
          const holder = anAccount({ name: `m${search}m` });
          const lookalikeSearch = search.replace(METACHARACTER, "x");
          const lookalike = anAccount({ name: `m${lookalikeSearch}m` });
          const holderKitchen = aDesignId("P");
          const lookalikeKitchen = aDesignId("Q");
          await plantAccounts([holder, lookalike]);
          await plantDesigns([
            aKitchen({
              id: holderKitchen,
              accountId: holder.id,
              sentAt: clock,
              updatedAt: clock,
            }),
            aKitchen({
              id: lookalikeKitchen,
              accountId: lookalike.id,
              sentAt: clock + 1n,
              updatedAt: clock + 1n,
            }),
          ]);

          const reading = await reader.listPage(queryOf({ search }));

          expect(idsOf(reading.kitchens)).toContain(holderKitchen);
          if (lookalikeSearch !== search) {
            expect(idsOf(reading.kitchens)).not.toContain(lookalikeKitchen);
          }
        }),
        { numRuns: 25 },
      );
    }, 120_000);

    it.each([
      "%",
      "_",
      "\\",
      "\\\\",
      "\\%",
      "%\\",
      "'",
      "' or true --",
      '"; delete from designs; --',
    ])(
      "answers the search %j with the kitchens whose name holds it as typed",
      async (search) => {
        const reader = readerOverTransaction();
        const account = anAccount({ name: `lit ${search} lit` });
        const kitchen = aDesignId("R");
        clock += ONE_MINUTE_MICROS;
        await plantAccounts([account]);
        await plantDesigns([
          aKitchen({
            id: kitchen,
            accountId: account.id,
            sentAt: clock,
            updatedAt: clock,
          }),
        ]);

        const reading = await reader.listPage(queryOf({ search }));

        expect(idsOf(reading.kitchens)[0]).toBe(kitchen);
      },
    );
  });

  // -------------------------------------------------------------------------------------------------------------------
  describe("how letters fold, on this database and on the fake", () => {
    interface FoldCase {
      readonly stored: string;
      readonly typed: string;
      readonly isFoundByDatabase: boolean;
    }

    /** The comma-below and cedilla forms of S and T are folded to each other; no other letter folds beyond case. */
    const FOLDS: readonly FoldCase[] = [
      {
        stored: `${S_COMMA_BELOW_UPPER}tefan`,
        typed: `${S_COMMA_BELOW_LOWER}tefan`,
        isFoundByDatabase: true,
      },
      {
        stored: `${S_COMMA_BELOW_LOWER}tefan`,
        typed: `${S_COMMA_BELOW_UPPER}TEFAN`,
        isFoundByDatabase: true,
      },
      {
        stored: `${S_CEDILLA_UPPER}tefan`,
        typed: `${S_CEDILLA_LOWER}tefan`,
        isFoundByDatabase: true,
      },
      {
        stored: `${S_COMMA_BELOW_UPPER}tefan`,
        typed: `${S_CEDILLA_LOWER}tefan`,
        isFoundByDatabase: true,
      },
      {
        stored: `${S_COMMA_BELOW_UPPER}tefan`,
        typed: "Stefan",
        isFoundByDatabase: false,
      },
      { stored: `Stra${SHARP_S}e`, typed: "STRASSE", isFoundByDatabase: false },
      {
        stored: `${A_DIAERESIS_UPPER}ngel`,
        typed: `${A_DIAERESIS_LOWER}NGEL`,
        isFoundByDatabase: true,
      },
      {
        stored: `${I_DOT_ABOVE_UPPER}stanbul`,
        typed: "istanbul",
        isFoundByDatabase: true,
      },
    ];
    const observed: string[] = [];

    beforeAll(beginSnapshotTransaction);
    afterAll(endTransaction);

    it.each(FOLDS)(
      "finds $stored by $typed on the database: $isFoundByDatabase",
      async ({ stored, typed, isFoundByDatabase }) => {
        const marker = randomToken();
        const account = anAccount({ name: `${stored} ${marker}` });
        const kitchen = aDesignId("F");
        const sentAt = ERA_MICROS + 200n * ONE_DAY_MICROS;
        await plantAccounts([account]);
        await plantDesigns([
          aKitchen({
            id: kitchen,
            accountId: account.id,
            sentAt,
            updatedAt: sentAt,
          }),
        ]);
        const fake = new FakeStaffKitchenReader();
        fake.plantAccount({
          id: account.id,
          email: account.email,
          name: account.name,
          phone: null,
        });
        fake.plantKitchen({
          id: kitchen,
          name: null,
          design: KITCHEN_L_DESIGN,
          accountId: account.id,
          sentAt: new Date(0),
          updatedAt: new Date(0),
          isHidden: false,
          isDeletedByClient: false,
        });
        const search = `${typed} ${marker}`;

        const real = await readerOverTransaction().listPage(
          queryOf({ search }),
        );
        const faked = await fake.listPage(queryOf({ search }));

        expect(idsOf(real.kitchens).includes(kitchen)).toBe(isFoundByDatabase);
        observed.push(
          `${JSON.stringify(stored)} / ${JSON.stringify(typed)}: database ${String(real.kitchens.length === 1)}, fake ${String(faked.kitchens.length === 1)}`,
        );
      },
    );

    it("reports where the fake and the database disagree (the fake's header disclaims case folding)", () => {
      const disagreements = observed.filter((line) => {
        const [, database, fake] =
          /database (\w+), fake (\w+)/.exec(line) ?? [];
        return database !== fake;
      });
      console.info(`[qa-l3-s4 fold table]\n${observed.join("\n")}`);
      console.info(
        `[qa-l3-s4 fold disagreements] ${String(disagreements.length)}\n${disagreements.join("\n")}`,
      );

      expect(observed).toHaveLength(FOLDS.length);
    });
  });

  // -------------------------------------------------------------------------------------------------------------------
  describe("a search typed in decomposed form, through the domain's reading of the query", () => {
    const owner = anAccount({ name: `${S_COMMA_BELOW_UPPER}tefan Decomposed` });
    const kitchen = aDesignId("D");

    beforeAll(async () => {
      await beginSnapshotTransaction();
      await plantAccounts([owner]);
      const sentAt = ERA_MICROS + 300n * ONE_DAY_MICROS;
      await plantDesigns([
        aKitchen({
          id: kitchen,
          accountId: owner.id,
          sentAt,
          updatedAt: sentAt,
        }),
      ]);
    });

    afterAll(endTransaction);

    it("finds the composed name when the typed S and the comma below arrive as two code points, because the query is composed first", async () => {
      const reading = readStaffKitchenQuery({
        q: `S${COMBINING_COMMA_BELOW}tefan Decomposed`,
      });
      if (!reading.ok) throw new Error("the query was refused");

      const page = await readerOverTransaction().listPage(reading.query);

      expect(reading.query.search).toBe(
        `${S_COMMA_BELOW_UPPER}tefan Decomposed`,
      );
      expect(idsOf(page.kitchens)[0]).toBe(kitchen);
    });
  });

  // -------------------------------------------------------------------------------------------------------------------
  describe("a database that fails", () => {
    beforeAll(beginSnapshotTransaction);
    afterAll(endTransaction);

    it("answers a table the statement cannot find, as the server reports it, as unavailable with a cause of a type name and a state alone", async () => {
      const reader = readerOverTransaction();
      await run("savepoint missing");
      await run("set local search_path to pg_catalog");
      try {
        const onList = await rejectionOf(reader.listPage(queryOf()));
        await run("rollback to savepoint missing");
        await run("savepoint missing");
        await run("set local search_path to pg_catalog");
        const onOne = await rejectionOf(
          reader.readOne(`QA4E${"Z".repeat(17)}`),
        );

        for (const failure of [onList, onOne]) {
          expect(failure).toBeInstanceOf(StaffKitchenReaderError);
          const error = failure as StaffKitchenReaderError;
          expect(error.failure).toBe("unavailable");
          expect(Object.keys(error.cause as object).sort()).toEqual([
            "code",
            "name",
          ]);
          expect((error.cause as { code?: string }).code).toBe(UNDEFINED_TABLE);
          expect(
            `${error.message} ${JSON.stringify(error.cause)} ${error.stack ?? ""}`,
          ).not.toMatch(/designs|accounts|relation|does not exist|QA4E/i);
        }
      } finally {
        await run("rollback to savepoint missing");
      }
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe.skipIf(!isLiveTestDatabaseConfigured)(
  "the staff kitchen reader's qa leaves nothing behind (HTTP, outside every transaction)",
  () => {
    it("holds no design, account, request, status, note or copy of the qa fixtures", async () => {
      const sql = neon(liveTestDatabaseUrl);

      const [leftover] = await sql`
        select
          (select count(1)::int from designs where id like 'QA4%') as designs,
          (select count(1)::int from accounts where email like 'qa-l3-s4-%' or email_normal_form like 'normal.nrm%') as accounts,
          (select count(1)::int from contact_submissions where reference like 'QA4-%') as requests,
          (select count(1)::int from design_request_states where design_id like 'QA4%') as statuses,
          (select count(1)::int from design_notes where design_id like 'QA4%') as notes
      `;

      expect(leftover).toEqual({
        designs: 0,
        accounts: 0,
        requests: 0,
        statuses: 0,
        notes: 0,
      });
    });
  },
);
