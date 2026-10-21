import { fc } from "@fast-check/vitest";
import {
  REQUEST_STATUSES,
  STAFF_AUDIT_ACTIONS,
  judgeNoteText,
  readStaffAuditEntry,
} from "@lemnaria/configurator-domain";
import type { Client } from "@neondatabase/serverless";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { runMigrations } from "../src/migrate.js";
import { checksumOfMigration } from "../src/migration-checksum.js";
import { readMigrationFiles } from "../src/migration-files.js";
import type { MigrationFile } from "../src/migration-files.js";
import { openDatabaseSession } from "../src/open-database.js";
import {
  announceSkippedLiveSuite,
  isLiveTestDatabaseConfigured,
  liveTestDatabaseUrl,
} from "./support/live-test-database.js";
import { readMigrationLedger } from "./support/migration-ledger-probe.js";
import { holdSharedTestSchemaLock } from "./support/test-schema-lock.js";

// Shared: every statement here runs inside a transaction that is rolled back, and the file creates only temporary
// objects of its own, so it needs the schema intact and changes none.
holdSharedTestSchemaLock();

/**
 * Adversarial QA of the staff tables (migrations `0020` to `0022`), on a real Postgres. The migration tests read
 * the migration files as text and stand a JavaScript regular expression in for the server's; what they cannot show is
 * what the server does with a row. Every probe below is an `insert` inside `begin` ... `rollback`, sent over the
 * owner's test-database connection, so a table is left exactly as it was found.
 *
 * Four kinds of evidence, each with its own control:
 * - an accept/refuse table asserted on the SQLSTATE **and** the constraint's name, so a row refused by the wrong check
 *   does not pass for the right one;
 * - differential sweeps of the server's shape checks against an oracle written here by hand, over strings that mix the
 *   alphabet with look-alikes (accents, full-width, Kelvin sign, astral, bidi) and lengths on both sides of each bound;
 * - the domain's own closed lists and note rule fed through the server's checks;
 * - the upper bound on what the application role holds, asked of the catalog from the owner's connection.
 *
 * **Mutation controls live in the file.** A weakened twin of a table is built from the migration's own text with one
 * replacement (a temporary table, never a change to a real one) and the same probes run against it; each must report a
 * mismatch, which shows the probe has teeth.
 */
const SUITE_NAME =
  "staff tables 0020-0022 on a real Postgres (live test database)";
if (!isLiveTestDatabaseConfigured) announceSkippedLiveSuite(SUITE_NAME);

type RowValues = Record<string, string | null>;

const ID = "Ab3_-".repeat(4) + "Z";
const OTHER_ID = "Zz9_-".repeat(4) + "A";
const STAMP = "2026-10-21T09:00:00Z";
const CHECK_VIOLATION = "23514";
const NOT_NULL_VIOLATION = "23502";
const UNIQUE_VIOLATION = "23505";

interface TableUnderProbe {
  readonly table: string;
  readonly migrationPrefix: string;
  /** A row every check accepts, the stamped column included, so that a probe changes one field at a time. */
  readonly validRow: RowValues;
}

const AUDIT: TableUnderProbe = {
  table: "staff_audit_events",
  migrationPrefix: "0020_",
  validRow: {
    id: ID,
    occurred_at: STAMP,
    actor_account_id: ID,
    action: "kitchen-opened",
    design_id: null,
    subject_account_id: null,
    detail: null,
  },
};
const NOTES: TableUnderProbe = {
  table: "design_notes",
  migrationPrefix: "0021_",
  validRow: {
    id: ID,
    design_id: ID,
    author_account_id: ID,
    body: "a note",
    created_at: STAMP,
  },
};
const REQUEST_STATES: TableUnderProbe = {
  table: "design_request_states",
  migrationPrefix: "0022_",
  validRow: {
    design_id: ID,
    status: "new",
    changed_by_account_id: ID,
    changed_at: STAMP,
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// The session and the probe
// ---------------------------------------------------------------------------------------------------------------------

let client: Client;

function failureDescription(failure: unknown): string {
  const { code, constraint, column } = failure as {
    code?: string;
    constraint?: string;
    column?: string;
  };
  return `${code ?? "no-sqlstate"} ${constraint ?? column ?? ""}`.trim();
}

type DatabaseRow = Record<string, unknown>;

/** The rows a statement answers, typed by the caller: the driver types them `any`. */
async function rowsOf<Row extends object = DatabaseRow>(
  text: string,
  values: readonly unknown[] = [],
): Promise<Row[]> {
  const answer = await client.query(text, [...values]);
  return answer.rows as Row[];
}

/**
 * Inserts each row inside a plpgsql block that always rolls the insert back, and answers `accepted` or the SQLSTATE
 * with the constraint (or column) the server names. One round trip for any number of rows, and the transaction stays
 * usable whatever the server says. Values travel as text and are quoted by the server, so a document of JSON `null`
 * reaches the column as `'null'::jsonb` and not as SQL null.
 */
const OUTCOME_FUNCTION = `
  create function pg_temp.qa_outcome(target text, row_values jsonb) returns text language plpgsql as $fn$
  declare
    column_list text;
    value_list text;
    failed_constraint text;
    failed_column text;
  begin
    select string_agg(quote_ident(e.key), ', ' order by e.key),
           string_agg(quote_nullable(e.value) || case when e.key = 'detail' then '::jsonb' else '' end, ', ' order by e.key)
      into column_list, value_list
      from jsonb_each_text(row_values) as e;
    execute format('insert into %s (%s) values (%s)', target, column_list, value_list);
    raise exception 'accepted' using errcode = 'QA001';
  exception
    when sqlstate 'QA001' then return 'accepted';
    when others then
      get stacked diagnostics failed_constraint = constraint_name, failed_column = column_name;
      return btrim(sqlstate || ' ' || coalesce(nullif(failed_constraint, ''), nullif(failed_column, ''), ''));
  end
  $fn$
`;

async function outcomesOf(
  table: string,
  rows: readonly RowValues[],
): Promise<string[]> {
  const answers = await rowsOf<{ outcome: string }>(
    `select pg_temp.qa_outcome($1, row_values) as outcome
       from jsonb_array_elements($2::jsonb) with ordinality as r(row_values, position)
      order by position`,
    [table, JSON.stringify(rows)],
  );
  return answers.map((row) => row.outcome);
}

async function insertOutcome(table: string, row: RowValues): Promise<string> {
  const [outcome] = await outcomesOf(table, [row]);
  return outcome ?? "no answer";
}

// ---------------------------------------------------------------------------------------------------------------------
// The accept/refuse table
// ---------------------------------------------------------------------------------------------------------------------

interface ProbeCase {
  readonly label: string;
  readonly row: RowValues;
  readonly outcome: string;
}

function refusedBy(table: string, constraint: string): string {
  return `${CHECK_VIOLATION} ${table}_${constraint}`;
}

/** A 21-character id with one character, or its length, changed. */
const BAD_IDS: readonly (readonly [string, string])[] = [
  ["empty", ""],
  ["20 characters", ID.slice(1)],
  ["22 characters", `${ID}A`],
  ["a trailing line feed", `${ID.slice(1)}\n`],
  ["an accented letter", `\u00E9${ID.slice(1)}`],
  ["a full-width letter", `\uFF21${ID.slice(1)}`],
  ["a dotless i", `\u0131${ID.slice(1)}`],
  ["an astral character", `\u{1F600}${ID.slice(2)}`],
  ["a right-to-left override", `\u202E${ID.slice(1)}`],
  ["a space", `${ID.slice(0, 10)} ${ID.slice(11)}`],
  ["210 characters", "x".repeat(210)],
];

const GOOD_IDS: readonly (readonly [string, string])[] = [
  ["a mixed 21-character id", ID],
  ["21 underscores", "_".repeat(21)],
  ["21 hyphens", "-".repeat(21)],
  ["21 digits", "0".repeat(21)],
];

function idColumnCases(
  probed: TableUnderProbe,
  column: string,
  isNullable: boolean,
): ProbeCase[] {
  const at = (value: string | null): RowValues => ({
    ...probed.validRow,
    [column]: value,
  });
  const label = (what: string) => `${probed.table}.${column}: ${what}`;
  return [
    ...GOOD_IDS.map(([what, value]) => ({
      label: label(what),
      row: at(value),
      outcome: "accepted",
    })),
    ...BAD_IDS.map(([what, value]) => ({
      label: label(what),
      row: at(value),
      outcome: refusedBy(probed.table, `${column}_shape`),
    })),
    {
      label: label("null"),
      row: at(null),
      outcome: isNullable ? "accepted" : `${NOT_NULL_VIOLATION} ${column}`,
    },
  ];
}

function shapeCases(
  probed: TableUnderProbe,
  column: string,
  accepted: readonly string[],
  refused: readonly string[],
): ProbeCase[] {
  const at = (value: string): RowValues => ({
    ...probed.validRow,
    [column]: value,
  });
  const describeValue = (value: string) =>
    `${probed.table}.${column}: ${JSON.stringify(value.length > 40 ? `${value.slice(0, 8)}...(${String(value.length)})` : value)}`;
  return [
    ...accepted.map((value) => ({
      label: describeValue(value),
      row: at(value),
      outcome: "accepted",
    })),
    ...refused.map((value) => ({
      label: describeValue(value),
      row: at(value),
      outcome: refusedBy(probed.table, `${column}_shape`),
    })),
  ];
}

function bodyCases(): ProbeCase[] {
  const at = (body: string): RowValues => ({ ...NOTES.validRow, body });
  const accepted = [
    ["1 character", "x"],
    ["2000 characters", "x".repeat(2000)],
    ["2000 astral characters", "\u{1F600}".repeat(2000)],
    [
      "2000 code points of base letter and combining mark",
      "e\u0301".repeat(1000),
    ],
    ["2000 accented letters", "\u00E9".repeat(2000)],
    ["only a space", " "],
    ["only a line feed", "\n"],
    ["lines", "a\nb"],
  ] as const;
  const refused = [
    ["empty", ""],
    ["2001 characters", "x".repeat(2001)],
    ["2001 astral characters", "\u{1F600}".repeat(2001)],
    ["2001 code points of combining marks", `${"e\u0301".repeat(1000)}x`],
  ] as const;
  return [
    ...accepted.map(([what, body]) => ({
      label: `design_notes.body: ${what}`,
      row: at(body),
      outcome: "accepted",
    })),
    ...refused.map(([what, body]) => ({
      label: `design_notes.body: ${what}`,
      row: at(body),
      outcome: refusedBy("design_notes", "body_length"),
    })),
  ];
}

function detailCases(): ProbeCase[] {
  const at = (detail: string | null): RowValues => ({
    ...AUDIT.validRow,
    detail,
  });
  const accepted = [
    ["SQL null", null],
    ["an empty object", "{}"],
    ["codes", '{"from":"new","to":"closed"}'],
    ["nested values", '{"a":{"b":[1,2]},"c":null}'],
  ] as const;
  const refused = [
    ["an empty array", "[]"],
    ["an array of objects", '[{"a":1}]'],
    ["a number", "1"],
    ["a string", '"x"'],
    ["JSON null", "null"],
    ["a boolean", "true"],
    ["a document encoded twice", JSON.stringify('{"a":1}')],
  ] as const;
  return [
    ...accepted.map(([what, detail]) => ({
      label: `staff_audit_events.detail: ${what}`,
      row: at(detail),
      outcome: "accepted",
    })),
    ...refused.map(([what, detail]) => ({
      label: `staff_audit_events.detail: ${what}`,
      row: at(detail),
      outcome: refusedBy("staff_audit_events", "detail_is_an_object"),
    })),
  ];
}

function notNullCases(
  probed: TableUnderProbe,
  columns: readonly string[],
): ProbeCase[] {
  return columns.map((column) => ({
    label: `${probed.table}.${column}: null`,
    row: { ...probed.validRow, [column]: null },
    outcome: `${NOT_NULL_VIOLATION} ${column}`,
  }));
}

const ACTION_CASES = shapeCases(
  AUDIT,
  "action",
  ["a", "a".repeat(32), "-", "0-9", "kitchen-opened", "note-added"],
  [
    "",
    "a".repeat(33),
    "Kitchen-opened",
    "a_b",
    "a b",
    "abc\n",
    "caf\u00E9",
    "\u0430bc",
    "\u212Abc",
  ],
);

const STATUS_CASES = shapeCases(
  REQUEST_STATES,
  "status",
  ["new", "offer-sent", "a".repeat(32), "-"],
  [
    "",
    "a".repeat(33),
    "New",
    "new1",
    "offer_sent",
    "offer sent",
    "new\n",
    "caf\u00E9",
  ],
);

function auditCases(): ProbeCase[] {
  return [
    ...idColumnCases(AUDIT, "id", false),
    ...idColumnCases(AUDIT, "actor_account_id", false),
    ...idColumnCases(AUDIT, "design_id", true),
    ...idColumnCases(AUDIT, "subject_account_id", true),
    ...ACTION_CASES,
    ...detailCases(),
    ...notNullCases(AUDIT, ["occurred_at", "action"]),
    {
      label: "staff_audit_events: a valid row",
      row: AUDIT.validRow,
      outcome: "accepted",
    },
  ];
}

function noteCases(): ProbeCase[] {
  return [
    ...idColumnCases(NOTES, "id", false),
    ...idColumnCases(NOTES, "design_id", false),
    ...idColumnCases(NOTES, "author_account_id", false),
    ...bodyCases(),
    ...notNullCases(NOTES, ["body", "created_at"]),
    {
      label: "design_notes: a valid row",
      row: NOTES.validRow,
      outcome: "accepted",
    },
  ];
}

function requestStateCases(): ProbeCase[] {
  return [
    ...idColumnCases(REQUEST_STATES, "design_id", false),
    ...idColumnCases(REQUEST_STATES, "changed_by_account_id", false),
    ...STATUS_CASES,
    ...notNullCases(REQUEST_STATES, ["status", "changed_at"]),
    {
      label: "design_request_states: a valid row",
      row: REQUEST_STATES.validRow,
      outcome: "accepted",
    },
  ];
}

function casesOf(probed: TableUnderProbe): ProbeCase[] {
  if (probed === AUDIT) return auditCases();
  if (probed === NOTES) return noteCases();
  return requestStateCases();
}

interface Disagreement {
  readonly label: string;
  readonly expected: string;
  readonly actual: string;
}

async function disagreementsOn(
  table: string,
  cases: readonly ProbeCase[],
): Promise<Disagreement[]> {
  const actuals = await outcomesOf(
    table,
    cases.map((probe) => probe.row),
  );
  return cases.flatMap((probe, index) =>
    actuals[index] === probe.outcome
      ? []
      : [
          {
            label: probe.label,
            expected: probe.outcome,
            actual: actuals[index] ?? "no answer",
          },
        ],
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Weakened twins, derived from the migration's own text
// ---------------------------------------------------------------------------------------------------------------------

function migrationNamed(prefix: string): MigrationFile {
  const found = readMigrationFiles().find((migration) =>
    migration.fileName.startsWith(prefix),
  );
  if (found === undefined)
    throw new Error(`no migration starts with ${prefix}`);
  return found;
}

/** The statements of a file, comments removed. Every statement in 0020-0022 ends in a semicolon and none has one inside. */
function statementsOfFile(migration: MigrationFile): string[] {
  return migration.sql
    .split("\n")
    .filter((line) => !line.startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement !== "");
}

interface Replacement {
  readonly from: string;
  readonly to: string;
}

function replaceExactly(
  text: string,
  replacements: readonly Replacement[],
): string {
  return replacements.reduce((current, { from, to }) => {
    if (!current.includes(from)) {
      throw new Error(
        `the migration no longer contains ${JSON.stringify(from)}`,
      );
    }
    return current.replace(from, () => to);
  }, text);
}

/** A temporary table of the migration's own definition, with `replacements` applied; returns its qualified name. */
async function createTwin(
  probed: TableUnderProbe,
  replacements: readonly Replacement[],
): Promise<string> {
  const [createTable] = statementsOfFile(
    migrationNamed(probed.migrationPrefix),
  );
  const twinName = "pg_temp.qa_twin";
  const definition = replaceExactly(createTable ?? "", [
    {
      from: `create table if not exists ${probed.table}`,
      to: `create temp table qa_twin`,
    },
    ...replacements,
  ]);
  await client.query(definition);
  return twinName;
}

// ---------------------------------------------------------------------------------------------------------------------
// Differential sweep support: one round trip per property run
// ---------------------------------------------------------------------------------------------------------------------

const ACCEPTANCE_FUNCTION = `
  create function pg_temp.qa_accepts(target regclass, base jsonb, field text, candidate jsonb)
  returns boolean language plpgsql as $fn$
  begin
    execute format(
      'insert into %s select * from jsonb_populate_record(null::%s, $1 || jsonb_build_object(%L, $2))',
      target, target, field
    ) using base, candidate;
    raise exception 'accepted' using errcode = 'QA001';
  exception
    when check_violation then return false;
    when sqlstate 'QA001' then return true;
  end
  $fn$
`;

interface SweepSpec {
  readonly label: string;
  readonly probed: TableUnderProbe;
  readonly field: string;
}

interface SweepVerdict {
  readonly label: string;
  readonly candidate: string;
  readonly accepted: boolean;
}

async function serverVerdicts(
  specs: readonly SweepSpec[],
  candidates: readonly string[],
): Promise<SweepVerdict[]> {
  const specDocuments = specs.map((spec) => ({
    label: spec.label,
    target: spec.probed.table,
    base: spec.probed.validRow,
    field: spec.field,
  }));
  const result = await client.query(
    `select spec->>'label' as label, c.value #>> '{}' as candidate,
            pg_temp.qa_accepts((spec->>'target')::regclass, spec->'base', spec->>'field', c.value) as accepted
       from jsonb_array_elements($1::jsonb) as spec
      cross join jsonb_array_elements($2::jsonb) as c(value)`,
    [JSON.stringify(specDocuments), JSON.stringify(candidates)],
  );
  return result.rows as SweepVerdict[];
}

const ALPHABET_LETTERS = "abcdefghijklmnopqrstuvwxyz";
const LETTERS = Array.from(ALPHABET_LETTERS);
const ID_ALPHABET = [
  ...LETTERS,
  ...Array.from(ALPHABET_LETTERS.toUpperCase()),
  ...Array.from("0123456789_-"),
];
const ACTION_ALPHABET = [...LETTERS, ...Array.from("0123456789-")];
const STATUS_ALPHABET = [...LETTERS, "-"];
/** The first and last character of each range an alphabet uses, and the two symbols: written out here, apart from the
 *  alphabets, so a character an oracle forgets is still generated. */
const EDGE_CHARACTERS = ["-", "_", "0", "9", "A", "Z", "a", "z"];
/** Look-alikes and neighbours of the alphabets: none belongs in a shape, several would in a case-folding or a
 *  locale-collated range. The right-to-left override and the zero-width space are escapes on purpose. */
const FOREIGN_CHARACTERS = [
  "\u00E9",
  "\uFF21",
  "\u0131",
  "\u{1F600}",
  "\n",
  " ",
  "\t",
  "\u202E",
  "\u200B",
  "\u0430",
  "\u212A",
  "\u017F",
  "\u00A0",
  "@",
  "[",
  "`",
  "{",
  "/",
  ":",
];

const anyCodePoint: fc.Arbitrary<string> = fc
  .integer({ min: 1, max: 0x10ffff })
  .filter((codePoint) => codePoint < 0xd800 || codePoint > 0xdfff)
  .map((codePoint) => String.fromCodePoint(codePoint));

interface ShapeSweep {
  readonly alphabet: readonly string[];
  readonly lengths: { readonly min: number; readonly max: number };
}

/**
 * Mostly in-alphabet strings with lengths on both sides of the bound, some with one character swapped in. The swapped
 * character comes from the neighbouring alphabets (every id character, so a digit in a status or an upper-case letter
 * in an action is tried) and from the look-alikes, never from the alphabet under test alone: otherwise an oracle that
 * forgot a character would also forget to generate it, and agree with the server by construction.
 */
function shapeCandidate(sweep: ShapeSweep): fc.Arbitrary<string> {
  const inside = fc.constantFrom(...sweep.alphabet);
  const stranger = fc.oneof(
    { weight: 6, arbitrary: fc.constantFrom(...EDGE_CHARACTERS) },
    { weight: 3, arbitrary: fc.constantFrom(...ID_ALPHABET) },
    { weight: 3, arbitrary: fc.constantFrom(...FOREIGN_CHARACTERS) },
    { weight: 1, arbitrary: anyCodePoint },
  );
  const aroundTheBound = fc.array(inside, {
    minLength: sweep.lengths.min,
    maxLength: sweep.lengths.max,
  });
  return fc.oneof(
    {
      weight: 4,
      arbitrary: aroundTheBound.map((characters) => characters.join("")),
    },
    {
      weight: 4,
      arbitrary: fc
        .tuple(aroundTheBound, stranger, fc.nat())
        .map(([characters, swappedIn, at]) => {
          const swapped = [...characters];
          if (swapped.length > 0) swapped[at % swapped.length] = swappedIn;
          return swapped.join("");
        }),
    },
    {
      weight: 1,
      arbitrary: fc
        .array(fc.oneof(inside, stranger), { maxLength: 6 })
        .map((characters) => characters.join("")),
    },
  );
}

function matchesShape(
  candidate: string,
  alphabet: readonly string[],
  bounds: { min: number; max: number },
): boolean {
  const characters = Array.from(candidate);
  return (
    characters.length >= bounds.min &&
    characters.length <= bounds.max &&
    characters.every((character) => alphabet.includes(character))
  );
}

const ID_BOUNDS = { min: 21, max: 21 };
const ID_SPECS: readonly SweepSpec[] = [
  { label: "audit.id", probed: AUDIT, field: "id" },
  { label: "audit.actor", probed: AUDIT, field: "actor_account_id" },
  { label: "audit.design", probed: AUDIT, field: "design_id" },
  { label: "audit.subject", probed: AUDIT, field: "subject_account_id" },
  { label: "notes.id", probed: NOTES, field: "id" },
  { label: "notes.design", probed: NOTES, field: "design_id" },
  { label: "notes.author", probed: NOTES, field: "author_account_id" },
  { label: "state.design", probed: REQUEST_STATES, field: "design_id" },
  {
    label: "state.changed_by",
    probed: REQUEST_STATES,
    field: "changed_by_account_id",
  },
];

interface SweepTally {
  accepted: number;
  refused: number;
}

async function expectServerAgreesWithOracle(
  specs: readonly SweepSpec[],
  candidateArbitrary: fc.Arbitrary<string>,
  oracle: (candidate: string) => boolean,
): Promise<SweepTally> {
  const tally: SweepTally = { accepted: 0, refused: 0 };
  await fc.assert(
    fc.asyncProperty(
      fc.array(candidateArbitrary, { minLength: 25, maxLength: 25 }),
      async (candidates) => {
        const verdicts = await serverVerdicts(specs, candidates);
        const wrong = verdicts.filter(
          (v) => v.accepted !== oracle(v.candidate),
        );
        expect(wrong).toEqual([]);
        for (const verdict of verdicts)
          tally[verdict.accepted ? "accepted" : "refused"] += 1;
      },
    ),
    { numRuns: 20 },
  );
  return tally;
}

// ---------------------------------------------------------------------------------------------------------------------
// The tests
// ---------------------------------------------------------------------------------------------------------------------

interface AuditEntryCandidate {
  readonly action: string;
  readonly detail: { readonly from: string; readonly to: string } | null;
}

describe.skipIf(!isLiveTestDatabaseConfigured)(SUITE_NAME, () => {
  beforeAll(async () => {
    await runMigrations(liveTestDatabaseUrl);
    client = openDatabaseSession(liveTestDatabaseUrl, "TEST_DATABASE_URL");
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  beforeEach(async () => {
    await client.query("begin");
    await client.query(OUTCOME_FUNCTION);
    await client.query(ACCEPTANCE_FUNCTION);
  });

  afterEach(async () => {
    await client.query("rollback");
  });

  describe("the checks, row by row, with the SQLSTATE and the constraint named", () => {
    it("staff_audit_events accepts and refuses exactly what the plan says", async () => {
      expect(await disagreementsOn(AUDIT.table, auditCases())).toEqual([]);
    });

    it("design_notes accepts and refuses exactly what the plan says, counting astral and combined characters as one each", async () => {
      expect(await disagreementsOn(NOTES.table, noteCases())).toEqual([]);
    });

    it("design_request_states accepts and refuses exactly what the plan says", async () => {
      expect(
        await disagreementsOn(REQUEST_STATES.table, requestStateCases()),
      ).toEqual([]);
    });

    it.each([
      [AUDIT.table, AUDIT.validRow],
      [NOTES.table, NOTES.validRow],
      [REQUEST_STATES.table, REQUEST_STATES.validRow],
    ] as const)(
      "%s refuses a second row with the same primary key",
      async (table, row) => {
        const columns = Object.keys(row);
        const insert = `insert into ${table} (${columns.join(", ")}) values (${columns.map((_, i) => `$${String(i + 1)}`).join(", ")})`;
        await client.query(
          insert,
          columns.map((column) => row[column]),
        );

        const second = await client
          .query(
            insert,
            columns.map((column) => row[column]),
          )
          .then(() => "accepted", failureDescription);

        expect(second).toBe(`${UNIQUE_VIOLATION} ${table}_pkey`);
      },
    );
  });

  describe("each probe has teeth: the same table, weakened by one replacement in the migration's text, disagrees", () => {
    const WEAKENINGS: readonly {
      readonly name: string;
      readonly probed: TableUnderProbe;
      readonly replacements: readonly Replacement[];
      readonly cases: () => ProbeCase[];
      readonly mustDisagreeOn: string;
    }[] = [
      {
        name: "an id check that also lets 20 characters through",
        probed: NOTES,
        replacements: [
          {
            from: "check (id ~ '^[A-Za-z0-9_-]{21}$')",
            to: "check (id ~ '^[A-Za-z0-9_-]{20,21}$')",
          },
        ],
        cases: noteCases,
        mustDisagreeOn: "design_notes.id: 20 characters",
      },
      {
        name: "a body check that lets an empty body through",
        probed: NOTES,
        replacements: [
          { from: "between 1 and 2000", to: "between 0 and 2000" },
        ],
        cases: noteCases,
        mustDisagreeOn: "design_notes.body: empty",
      },
      {
        name: "a body check one character too wide",
        probed: NOTES,
        replacements: [
          { from: "between 1 and 2000", to: "between 1 and 2001" },
        ],
        cases: noteCases,
        mustDisagreeOn: "design_notes.body: 2001 characters",
      },
      {
        name: "a body check that counts bytes (the 2000 accented letters are 4000 bytes)",
        probed: NOTES,
        replacements: [{ from: "char_length(body)", to: "octet_length(body)" }],
        cases: noteCases,
        mustDisagreeOn: "design_notes.body: 2000 accented letters",
      },
      {
        name: "an action check that lets upper case through",
        probed: AUDIT,
        replacements: [
          { from: "'^[a-z0-9-]{1,32}$'", to: "'^[a-zA-Z0-9-]{1,32}$'" },
        ],
        cases: auditCases,
        mustDisagreeOn: 'staff_audit_events.action: "Kitchen-opened"',
      },
      {
        name: "an action check with the length bound moved by one",
        probed: AUDIT,
        replacements: [{ from: "{1,32}", to: "{1,33}" }],
        cases: auditCases,
        mustDisagreeOn: `staff_audit_events.action: "${"a".repeat(33)}"`,
      },
      {
        name: "a detail check that lets an array through",
        probed: AUDIT,
        replacements: [{ from: "= 'object'", to: "in ('object', 'array')" }],
        cases: auditCases,
        mustDisagreeOn: "staff_audit_events.detail: an empty array",
      },
      {
        name: "a status check that lets digits through",
        probed: REQUEST_STATES,
        replacements: [{ from: "'^[a-z-]{1,32}$'", to: "'^[a-z0-9-]{1,32}$'" }],
        cases: requestStateCases,
        mustDisagreeOn: 'design_request_states.status: "new1"',
      },
    ];

    it.each(WEAKENINGS)(
      "notices $name",
      async ({ probed, replacements, cases, mustDisagreeOn }) => {
        const twin = await createTwin(probed, replacements);

        const disagreements = await disagreementsOn(twin, cases());

        expect(disagreements.map((d) => d.label)).toContain(mustDisagreeOn);
      },
    );

    it.each([AUDIT, NOTES, REQUEST_STATES])(
      "finds no disagreement on an unweakened twin of $table (the control)",
      async (probed) => {
        const twin = await createTwin(probed, []);

        const disagreements = await disagreementsOn(twin, casesOf(probed));

        expect(disagreements).toEqual([]);
      },
    );

    it("refuses to build a twin from a replacement the migration does not contain", async () => {
      await expect(
        createTwin(NOTES, [{ from: "no such text", to: "x" }]),
      ).rejects.toThrow(/no longer contains/);
    });
  });

  describe("the server and a hand-written oracle agree over swept strings", () => {
    it("on all nine id columns: exactly 21 characters of A-Z, a-z, 0-9, underscore and hyphen", async () => {
      const tally = await expectServerAgreesWithOracle(
        ID_SPECS,
        shapeCandidate({
          alphabet: ID_ALPHABET,
          lengths: { min: 19, max: 23 },
        }),
        (candidate) => matchesShape(candidate, ID_ALPHABET, ID_BOUNDS),
      );

      expect(tally.accepted).toBeGreaterThan(0);
      expect(tally.refused).toBeGreaterThan(0);
    });

    it("on the action: 1 to 32 characters of a-z, 0-9 and hyphen", async () => {
      const tally = await expectServerAgreesWithOracle(
        [{ label: "audit.action", probed: AUDIT, field: "action" }],
        shapeCandidate({
          alphabet: ACTION_ALPHABET,
          lengths: { min: 30, max: 34 },
        }),
        (candidate) =>
          matchesShape(candidate, ACTION_ALPHABET, { min: 1, max: 32 }),
      );

      expect(tally.accepted).toBeGreaterThan(0);
      expect(tally.refused).toBeGreaterThan(0);
    });

    it("on the status: 1 to 32 characters of a-z and hyphen", async () => {
      const tally = await expectServerAgreesWithOracle(
        [{ label: "state.status", probed: REQUEST_STATES, field: "status" }],
        shapeCandidate({
          alphabet: STATUS_ALPHABET,
          lengths: { min: 30, max: 34 },
        }),
        (candidate) =>
          matchesShape(candidate, STATUS_ALPHABET, { min: 1, max: 32 }),
      );

      expect(tally.accepted).toBeGreaterThan(0);
      expect(tally.refused).toBeGreaterThan(0);
    });

    it("on the body: 1 to 2000 code points, whatever their width in bytes or in what a reader sees", async () => {
      const unit = fc.constantFrom(
        "x",
        "\u00E9",
        "\u{1F600}",
        "e\u0301",
        "\n",
        "\u4E2D",
      );
      const bodyOfLength = fc
        .tuple(
          unit,
          fc.oneof(
            fc.integer({ min: 0, max: 5 }),
            fc.integer({ min: 995, max: 1005 }),
            fc.integer({ min: 1995, max: 2005 }),
          ),
        )
        .map(([piece, count]) => piece.repeat(count));
      const codePoints = (text: string) => Array.from(text).length;

      const tally = await expectServerAgreesWithOracle(
        [{ label: "notes.body", probed: NOTES, field: "body" }],
        bodyOfLength,
        (candidate) =>
          codePoints(candidate) >= 1 && codePoints(candidate) <= 2000,
      );

      expect(tally.accepted).toBeGreaterThan(0);
      expect(tally.refused).toBeGreaterThan(0);
    });
  });

  describe("the domain's closed lists and note rule pass through the server's checks", () => {
    it("every audit action the domain lists is accepted by the action check", async () => {
      const refused: string[] = [];
      for (const action of STAFF_AUDIT_ACTIONS) {
        const outcome = await insertOutcome(AUDIT.table, {
          ...AUDIT.validRow,
          action,
        });
        if (outcome !== "accepted") refused.push(`${action}: ${outcome}`);
      }

      expect(STAFF_AUDIT_ACTIONS.length).toBeGreaterThan(0);
      expect(refused).toEqual([]);
    });

    it("every request status the domain lists is accepted by the status check", async () => {
      const refused: string[] = [];
      for (const status of REQUEST_STATUSES) {
        const outcome = await insertOutcome(REQUEST_STATES.table, {
          ...REQUEST_STATES.validRow,
          status,
        });
        if (outcome !== "accepted") refused.push(`${status}: ${outcome}`);
      }

      expect(REQUEST_STATUSES.length).toBeGreaterThan(0);
      expect(refused).toEqual([]);
    });

    it("every entry the domain reads as valid (each action, each from-to pair) is stored with its detail as it is", async () => {
      const entries = STAFF_AUDIT_ACTIONS.flatMap(
        (action): AuditEntryCandidate[] =>
          action === "status-changed"
            ? REQUEST_STATUSES.flatMap((from) =>
                REQUEST_STATUSES.map((to) => ({
                  action,
                  detail: { from, to },
                })),
              )
            : [{ action, detail: null }],
      );

      for (const [index, candidate] of entries.entries()) {
        const reading = readStaffAuditEntry(candidate.action, candidate.detail);
        expect(reading.ok, JSON.stringify(candidate)).toBe(true);
        const id = String(index).padStart(21, "0");
        const detail =
          candidate.detail === null ? null : JSON.stringify(candidate.detail);
        const outcome = await insertOutcome(AUDIT.table, {
          ...AUDIT.validRow,
          id,
          action: candidate.action,
          detail,
        });
        expect(outcome, JSON.stringify(candidate)).toBe("accepted");
      }
    });

    it("every note the domain accepts is accepted by the server too", async () => {
      const unit = fc.oneof(
        fc.constantFrom(
          "a",
          "Z",
          " ",
          "\n",
          "\u00E9",
          "\u{1F600}",
          "e\u0301",
          "\u212B",
          "\u200B",
          "\uFFFE",
          "\u{10FFFF}",
          "\u4E2D",
        ),
        anyCodePoint,
      );
      const rawNote = fc.array(unit, { maxLength: 60 }).map((p) => p.join(""));
      let acceptedByDomain = 0;
      await fc.assert(
        fc.asyncProperty(
          fc.array(rawNote, { minLength: 40, maxLength: 40 }),
          async (raws) => {
            const stored = raws.flatMap((raw) => {
              const judged = judgeNoteText(raw);
              return judged.ok ? [judged.text] : [];
            });
            acceptedByDomain += stored.length;

            const outcomes = await outcomesOf(
              NOTES.table,
              stored.map((body) => ({ ...NOTES.validRow, body })),
            );

            expect(
              outcomes.filter((outcome) => outcome !== "accepted"),
            ).toEqual([]);
          },
        ),
        { numRuns: 30 },
      );
      expect(acceptedByDomain).toBeGreaterThan(100);
    });

    it.each([
      ["astral characters", "\u{1F600}".repeat(2000)],
      ["a base letter and a combining mark", "e\u0301".repeat(1000)],
      ["lines", "first\nsecond\n\nfourth"],
      ["a non-character the domain allows", "a\uFFFEb\u{10FFFF}"],
      [
        "the Angstrom sign, which the domain composes to its own form",
        "\u212B",
      ],
    ])(
      "a note with %s comes back from the server as the text the domain judged, in the same number of characters",
      async (_what, raw) => {
        const judged = judgeNoteText(raw);
        expect(judged.ok).toBe(true);
        if (!judged.ok) return;

        const stored = await client.query(
          "insert into design_notes (id, design_id, author_account_id, body) values ($1, $1, $1, $2) returning body, char_length(body) as characters",
          [ID, judged.text],
        );

        expect(stored.rows[0]).toEqual({
          body: judged.text,
          characters: Array.from(judged.text).length,
        });
      },
    );

    it.each(["x", "\u00E9", "\u{1F600}", "\u4E2D"])(
      "agrees with the server at the 2000-character ceiling for %s: 2000 stored, 2001 refused by both",
      async (piece) => {
        const atCeiling = judgeNoteText(piece.repeat(2000));
        const pastCeiling = judgeNoteText(piece.repeat(2001));

        expect(atCeiling.ok).toBe(true);
        expect(pastCeiling.ok).toBe(false);
        expect(
          await insertOutcome(NOTES.table, {
            ...NOTES.validRow,
            body: piece.repeat(2000),
          }),
        ).toBe("accepted");
        expect(
          await insertOutcome(NOTES.table, {
            ...NOTES.validRow,
            body: piece.repeat(2001),
          }),
        ).toBe(refusedBy(NOTES.table, "body_length"));
      },
    );
  });

  describe("re-applying the migrations", () => {
    const FILES = [AUDIT, NOTES, REQUEST_STATES].map((probed) =>
      migrationNamed(probed.migrationPrefix),
    );

    async function catalogAndRows(): Promise<string> {
      const catalog = await rowsOf(`
        select 'constraint' as kind, conrelid::regclass::text as owner, conname as name, pg_get_constraintdef(oid) as definition
          from pg_constraint
         where conrelid in ('staff_audit_events'::regclass, 'design_notes'::regclass, 'design_request_states'::regclass)
        union all
        select 'index', tablename, indexname, indexdef from pg_indexes
         where schemaname = 'public' and tablename in ('staff_audit_events', 'design_notes', 'design_request_states')
        union all
        select 'column', table_name, column_name, data_type || ' ' || is_nullable || ' ' || coalesce(column_default, '')
          from information_schema.columns
         where table_schema = 'public' and table_name in ('staff_audit_events', 'design_notes', 'design_request_states')
        union all
        select 'acl', relname, '', coalesce(relacl::text, '') from pg_class
         where relname in ('staff_audit_events', 'design_notes', 'design_request_states') and relkind = 'r'
        order by 1, 2, 3`);
      const rows = await Promise.all(
        [AUDIT, NOTES, REQUEST_STATES].map((probed) =>
          rowsOf(`select * from ${probed.table} order by 1`),
        ),
      );
      return JSON.stringify([catalog, rows]);
    }

    async function seedOneRowPerTable(): Promise<void> {
      for (const probed of [AUDIT, NOTES, REQUEST_STATES]) {
        expect(await insertOutcomeKept(probed)).toBe("accepted");
      }
    }

    async function insertOutcomeKept(probed: TableUnderProbe): Promise<string> {
      const columns = Object.keys(probed.validRow);
      await client.query(
        `insert into ${probed.table} (${columns.join(", ")}) values (${columns.map((_, i) => `$${String(i + 1)}`).join(", ")})`,
        columns.map((column) => probed.validRow[column]),
      );
      return "accepted";
    }

    it("running the three files twice over tables that hold rows changes no row, constraint, index, column or privilege", async () => {
      await seedOneRowPerTable();
      const before = await catalogAndRows();

      for (const pass of [1, 2]) {
        for (const file of FILES) {
          await client.query(file.sql);
        }
        expect(await catalogAndRows(), `after pass ${String(pass)}`).toBe(
          before,
        );
      }
    });

    it("the runner run again is a no-op and the ledger still records the bytes of the files on disk", async () => {
      const ledgerBefore = await readMigrationLedger(liveTestDatabaseUrl);

      await runMigrations(liveTestDatabaseUrl);
      const ledgerAfter = await readMigrationLedger(liveTestDatabaseUrl);

      expect(ledgerAfter).toEqual(ledgerBefore);
      const onDisk = readMigrationFiles();
      expect(ledgerAfter.map((row) => row.version)).toEqual(
        onDisk.map((file) => file.version),
      );
      for (const file of FILES) {
        expect(ledgerAfter.find((row) => row.version === file.version)).toEqual(
          {
            version: file.version,
            file_name: file.fileName,
            checksum: checksumOfMigration(file.sql),
          },
        );
      }
    });
  });

  describe("the upsert, the primary keys and the order of ties", () => {
    const UPSERT = `
      insert into design_request_states (design_id, status, changed_by_account_id) values ($1, $2, $3)
      on conflict (design_id) do update set status = excluded.status,
        changed_by_account_id = excluded.changed_by_account_id, changed_at = now()
      returning design_id, status, changed_by_account_id, changed_at`;
    const LONG_AGO = "2020-01-01T00:00:00Z";

    it("a first upsert inserts, a second changes the one row's status, staff account and time and nothing else", async () => {
      await client.query(UPSERT, [ID, "new", ID]);
      await client.query("update design_request_states set changed_at = $1", [
        LONG_AGO,
      ]);

      const [second] = await rowsOf<{ changed_at: Date }>(UPSERT, [
        ID,
        "contacted",
        OTHER_ID,
      ]);

      const rows = await rowsOf(
        "select design_id, status, changed_by_account_id, changed_at from design_request_states",
      );
      expect(rows).toHaveLength(1);
      expect(second).toMatchObject({
        design_id: ID,
        status: "contacted",
        changed_by_account_id: OTHER_ID,
      });
      expect(
        new Date(second?.changed_at ?? LONG_AGO).getTime(),
      ).toBeGreaterThan(new Date(LONG_AGO).getTime());
    });

    it("an upsert with a status the check refuses leaves the existing row as it was", async () => {
      await client.query(UPSERT, [ID, "contacted", ID]);

      const refused = await client
        .query("savepoint qa_upsert")
        .then(() => client.query(UPSERT, [ID, "BAD", OTHER_ID]))
        .then(() => "accepted", failureDescription);
      await client.query("rollback to savepoint qa_upsert");

      expect(refused).toBe(refusedBy("design_request_states", "status_shape"));
      const row = await rowsOf(
        "select status, changed_by_account_id from design_request_states",
      );
      expect(row).toEqual([{ status: "contacted", changed_by_account_id: ID }]);
    });

    it("two kitchens keep two rows: the key is the design", async () => {
      await client.query(UPSERT, [ID, "new", ID]);
      await client.query(UPSERT, [OTHER_ID, "closed", ID]);

      const rows = await rowsOf(
        "select design_id, status from design_request_states order by status",
      );

      expect(rows).toEqual([
        { design_id: OTHER_ID, status: "closed" },
        { design_id: ID, status: "new" },
      ]);
    });

    it("audit rows written in one transaction share a time, and the newest-first order then follows the id, descending", async () => {
      const ids = ["B", "A", "C"].map((letter) => letter.repeat(21));
      for (const id of ids) {
        await client.query(
          "insert into staff_audit_events (id, actor_account_id, action) values ($1, $1, 'kitchen-opened')",
          [id],
        );
      }

      const rows = await rowsOf<{ id: string; occurred_at: string }>(
        "select id, occurred_at::text as occurred_at from staff_audit_events order by staff_audit_events.occurred_at desc, id desc",
      );

      expect(new Set(rows.map((row) => row.occurred_at)).size).toBe(1);
      expect(rows.map((row) => row.id)).toEqual(
        ["C", "B", "A"].map((letter) => letter.repeat(21)),
      );
    });
  });

  describe("the indexes serve the newest-first reads", () => {
    const AUDIT_PAGE =
      "select * from staff_audit_events order by occurred_at desc, id desc limit 20";
    const AUDIT_NEXT_PAGE =
      "select * from staff_audit_events where (occurred_at, id) < ('2026-02-01T00:00:00Z'::timestamptz, 'x') order by occurred_at desc, id desc limit 20";
    const NOTES_OF_A_KITCHEN = `select * from design_notes where design_id = '${"0".repeat(20)}7' order by created_at desc limit 50`;

    /** A few hundred rows: planner switches, not statistics, decide the plan, so nothing is analysed and a rolled-back
     *  run leaves next to nothing for the database to clean up. */
    const SEEDED_ROWS = 300;

    async function seed(table: string): Promise<void> {
      const columns =
        table === "design_notes"
          ? "id, design_id, author_account_id, body, created_at"
          : "id, occurred_at, actor_account_id, action, design_id";
      const values =
        table === "design_notes"
          ? "lpad(g::text, 21, '0'), lpad((g % 20)::text, 21, '0'), repeat('a', 21), 'n', timestamptz '2026-01-01' + g * interval '1 minute'"
          : "lpad(g::text, 21, '0'), timestamptz '2026-01-01' + (g % 3000) * interval '1 minute', repeat('a', 21), 'kitchen-opened', lpad((g % 20)::text, 21, '0')";
      await client.query(
        `insert into ${table} (${columns}) select ${values} from generate_series(1, ${String(SEEDED_ROWS)}) as g`,
      );
    }

    /** Planner switches that leave an index scan as the only way to deliver the order without a sort node. */
    async function planOf(query: string): Promise<string> {
      await client.query("set local enable_seqscan = off");
      await client.query("set local enable_bitmapscan = off");
      await client.query("set local enable_sort = off");
      const plan = await rowsOf<{ "QUERY PLAN": string }>(
        `explain (costs off) ${query}`,
      );
      return plan.map((row) => row["QUERY PLAN"]).join("\n");
    }

    it.each([
      [
        "the first page of the audit log",
        AUDIT_PAGE,
        "staff_audit_events",
        "staff_audit_events_newest_first_idx",
      ],
      [
        "the next page, by the (time, id) of the last row seen",
        AUDIT_NEXT_PAGE,
        "staff_audit_events",
        "staff_audit_events_newest_first_idx",
      ],
      [
        "a kitchen's notes",
        NOTES_OF_A_KITCHEN,
        "design_notes",
        "design_notes_by_design_newest_idx",
      ],
    ])(
      "%s reads in order from its index, with no sort",
      async (_name, query, table, indexName) => {
        await seed(table);

        const plan = await planOf(query);

        expect(plan).toContain(`Index Scan using ${indexName}`);
        expect(plan).not.toMatch(/\bSort\b/);
      },
    );

    it("the same read without the index plans a sort (the control)", async () => {
      const [createTable] = statementsOfFile(migrationNamed("0020_"));
      await client.query(
        (createTable ?? "").replace(
          "create table if not exists staff_audit_events",
          "create temp table qa_unindexed",
        ),
      );
      await client.query(
        "insert into qa_unindexed (id, occurred_at, actor_account_id, action) select lpad(g::text, 21, '0'), timestamptz '2026-01-01' + g * interval '1 minute', repeat('a', 21), 'kitchen-opened' from generate_series(1, 300) as g",
      );
      await client.query("analyze qa_unindexed");

      const plan = await planOf(
        "select * from qa_unindexed order by occurred_at desc, id desc limit 20",
      );

      expect(plan).toMatch(/\bSort\b/);
    });
  });

  describe("what the application role holds on the three tables is at most what the runbook grants", () => {
    interface AllowedGrant {
      readonly table: string;
      readonly tableLevel: readonly string[];
      readonly insertColumns: readonly string[];
      readonly updateColumns: readonly string[];
    }

    const AUDIT_ALLOWED: AllowedGrant = {
      table: "public.staff_audit_events",
      tableLevel: ["SELECT"],
      insertColumns: [
        "id",
        "actor_account_id",
        "action",
        "design_id",
        "subject_account_id",
        "detail",
      ],
      updateColumns: [],
    };
    const NOTES_ALLOWED: AllowedGrant = {
      table: "public.design_notes",
      tableLevel: ["SELECT"],
      insertColumns: ["id", "design_id", "author_account_id", "body"],
      updateColumns: [],
    };
    const REQUEST_STATES_ALLOWED: AllowedGrant = {
      table: "public.design_request_states",
      tableLevel: ["SELECT"],
      insertColumns: ["design_id", "status", "changed_by_account_id"],
      updateColumns: ["status", "changed_by_account_id", "changed_at"],
    };
    const ALLOWED: readonly AllowedGrant[] = [
      AUDIT_ALLOWED,
      NOTES_ALLOWED,
      REQUEST_STATES_ALLOWED,
    ];

    const COLUMN_PRIVILEGES = ["SELECT", "INSERT", "UPDATE", "REFERENCES"];

    interface PrivilegeAnswer {
      readonly privilege: string;
      readonly held: boolean;
      readonly grantable: boolean;
    }

    async function tablePrivilegesTheServerDefines(): Promise<string[]> {
      const rows = await rowsOf<{ privilege: string }>(
        "select distinct (aclexplode(acldefault('r', oid))).privilege_type as privilege from pg_roles where rolname = current_user",
      );
      return rows.map((row) => row.privilege);
    }

    async function tableLevelExcess(
      role: string,
      grant: AllowedGrant,
    ): Promise<string[]> {
      const answers = await rowsOf<PrivilegeAnswer>(
        `select p as privilege,
                has_table_privilege($1::name, $2::regclass, p) as held,
                has_table_privilege($1::name, $2::regclass, p || ' WITH GRANT OPTION') as grantable
           from unnest($3::text[]) as p`,
        [role, grant.table, await tablePrivilegesTheServerDefines()],
      );
      return answers.flatMap((row) => [
        ...(row.held && !grant.tableLevel.includes(row.privilege)
          ? [`table ${row.privilege}`]
          : []),
        ...(row.grantable ? [`table ${row.privilege} with grant option`] : []),
      ]);
    }

    function allowedColumnsFor(
      privilege: string,
      grant: AllowedGrant,
      everyColumn: readonly string[],
    ): readonly string[] {
      if (privilege === "SELECT") return everyColumn;
      if (privilege === "INSERT") return grant.insertColumns;
      if (privilege === "UPDATE") return grant.updateColumns;
      return [];
    }

    async function columnLevelExcess(
      role: string,
      grant: AllowedGrant,
    ): Promise<string[]> {
      const answers = await rowsOf<PrivilegeAnswer & { name: string }>(
        `select p as privilege, a.attname::text as name,
                has_column_privilege($1::name, $2::regclass, a.attnum, p) as held,
                has_column_privilege($1::name, $2::regclass, a.attnum, p || ' WITH GRANT OPTION') as grantable
           from unnest($3::text[]) as p
          cross join pg_attribute as a
          where a.attrelid = $2::regclass and a.attnum > 0 and not a.attisdropped`,
        [role, grant.table, COLUMN_PRIVILEGES],
      );
      const everyColumn = [...new Set(answers.map((row) => row.name))];
      return answers.flatMap((row) => [
        ...(row.held &&
        !allowedColumnsFor(row.privilege, grant, everyColumn).includes(row.name)
          ? [`column ${row.privilege} (${row.name})`]
          : []),
        ...(row.grantable
          ? [`column ${row.privilege} (${row.name}) with grant option`]
          : []),
      ]);
    }

    async function grantsToPublic(grant: AllowedGrant): Promise<string[]> {
      const [answer] = await rowsOf<{ granted: number }>(
        "select count(a.grantee)::int as granted from pg_class c left join lateral aclexplode(c.relacl) a on a.grantee = 0 where c.oid = $1::regclass",
        [grant.table],
      );
      return (answer?.granted ?? 0) > 0 ? ["a grant to PUBLIC"] : [];
    }

    /** Everything `role` holds on the table beyond the allowance, as readable strings; empty when within it. */
    async function excessHeldBy(
      role: string,
      grant: AllowedGrant,
    ): Promise<string[]> {
      return [
        ...(await tableLevelExcess(role, grant)),
        ...(await columnLevelExcess(role, grant)),
        ...(await grantsToPublic(grant)),
      ];
    }

    async function hasRole(name: string): Promise<boolean> {
      const found = await rowsOf("select 1 from pg_roles where rolname = $1", [
        name,
      ]);
      return found.length > 0;
    }

    it.for(ALLOWED)(
      "app_designs holds nothing on $table beyond select, the prescribed insert and update columns, a grant option or PUBLIC",
      async (grant, { skip }) => {
        skip(
          !(await hasRole("app_designs")),
          "no app_designs role on this database",
        );

        expect(await excessHeldBy("app_designs", grant)).toEqual([]);
      },
    );

    it.each(ALLOWED)(
      "the probe sees an over-privileged role: the owner's connection holds more than the allowance on $table (the control)",
      async (grant) => {
        const [owner] = await rowsOf<{ name: string }>(
          "select current_user as name",
        );

        const excess = await excessHeldBy(owner?.name ?? "", grant);

        expect(excess).toEqual(
          expect.arrayContaining([
            "table DELETE",
            "table UPDATE",
            "table TRUNCATE",
          ]),
        );
        expect(excess.some((held) => held.startsWith("column INSERT ("))).toBe(
          true,
        );
        expect(excess.some((held) => held.startsWith("column UPDATE ("))).toBe(
          true,
        );
      },
    );

    it("an unknown role is an error and not an empty answer (a typo cannot pass the bound)", async () => {
      await expect(excessHeldBy("app_designz", AUDIT_ALLOWED)).rejects.toThrow(
        /does not exist/,
      );
    });
  });
});
