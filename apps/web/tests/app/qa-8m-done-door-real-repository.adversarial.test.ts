// Wave 8M criteria 2, 9 and 15 against the real repository AND the real contact store: the confirmation page beside the
// editor's, the review's and the contact page's. Only the network is replaced. The test stands at the global `fetch`,
// where the Neon driver sends, and sorts every request: a `POST` to the driver's SQL endpoint for this test's own
// unroutable host is a query, counted and read by its text, so a query is seen whichever module, repository method or
// copy of the driver sent it, which a mock of one method cannot do; anything else is a request past the driver and is
// refused. Proved: a refused door sends no query to `contact_submissions` (nor any to `designs` when the id is not a
// design id's shape); the owner's door sends exactly one read of the contact store, for the id and the revision the owned
// load answered, with `notified_at is not null` in its text and nothing personal among the columns it names; and what the
// page hands its client is a reference or a kind, whatever the store answered, whatever a driver said.
import {
  CURRENT_SCHEMA_VERSION,
  KITCHEN_L_DESIGN,
  type Design,
} from "@lemnaria/configurator-domain";
import { isValidElement } from "react";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import DonePage from "../../src/app/[locale]/d/[id]/done/page";
import ContactPage from "../../src/app/[locale]/d/[id]/contact/page";
import DesignPage from "../../src/app/[locale]/d/[id]/page";
import ReviewPage from "../../src/app/[locale]/d/[id]/review/page";
import { DesignLoadError } from "../../src/app/d/[id]/design-load-error";

const VISITOR_COOKIE_NAME = "__Host-lemnaria_visitor";
const OWNER_VALUE = "O".repeat(43);
/** A well-formed design id (`isDesignId`, 8L.13): 21 characters of `A-Za-z0-9_-`. Only such an id reaches a query. */
const OWNED_ID = "owned-000000000000000";
const STORED_REVISION = "7";
const UNROUTABLE_DATABASE_URL =
  "postgresql://qa_user:qa_password@qa-8m-done-door.invalid/qa_database";
const SQL_ENDPOINT = "https://api.invalid/sql";
const A_REFERENCE = "LM-7K3Q9ZXA";

const DOORS = ["editor", "review", "contact", "done"] as const;
type Door = (typeof DOORS)[number];

const state = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
}));
const hydrators = vi.hoisted(() => ({
  editor: vi.fn(() => null),
  review: vi.fn(() => null),
  contact: vi.fn(() => null),
  done: vi.fn(() => null),
}));

vi.mock("@/app/d/[id]/hydrate-and-configure", () => ({
  HydrateAndConfigure: hydrators.editor,
}));
vi.mock("@/app/d/[id]/review/hydrate-and-review", () => ({
  HydrateAndReview: hydrators.review,
}));
vi.mock("@/app/d/[id]/contact/hydrate-and-contact", () => ({
  HydrateAndContact: hydrators.contact,
}));
vi.mock("@/app/d/[id]/done/hydrate-and-done", () => ({
  HydrateAndDone: hydrators.done,
}));
vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => {
        const value = state.cookies.get(name);
        return value === undefined ? undefined : { value };
      },
    }),
}));

interface SentQuery {
  readonly query: string;
  readonly params: readonly unknown[];
}

type SocketAnswer =
  | { readonly kind: "rows"; readonly rows: readonly (readonly string[])[] }
  | { readonly kind: "failure"; readonly message: string };

const sentQueries: SentQuery[] = [];
const requestsPastTheDriver: string[] = [];
let designsAnswer: SocketAnswer = { kind: "rows", rows: [] };
let contactAnswer: SocketAnswer = { kind: "rows", rows: [] };

const DESIGN_ROW_FIELDS = [
  { name: "schema_version", dataTypeID: 23 },
  { name: "document", dataTypeID: 3802 },
  { name: "revision", dataTypeID: 25 },
];
const CONTACT_ROW_FIELDS = [{ name: "reference", dataTypeID: 25 }];

function addressOf(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (input instanceof Request) return input.url;
  return String(input);
}

function isAQuery(input: unknown, init: RequestInit | undefined): boolean {
  const method =
    init?.method ?? (input instanceof Request ? input.method : "GET");
  return method.toUpperCase() === "POST" && addressOf(input) === SQL_ENDPOINT;
}

function isForTheContactStore(query: SentQuery): boolean {
  return query.query.includes("contact_submissions");
}

function answerTheQuery(init: RequestInit | undefined): Promise<Response> {
  const query = JSON.parse(
    typeof init?.body === "string" ? init.body : "{}",
  ) as SentQuery;
  sentQueries.push(query);
  const forContact = isForTheContactStore(query);
  const answer = forContact ? contactAnswer : designsAnswer;
  if (answer.kind === "failure")
    return Promise.reject(new TypeError(answer.message));
  return Promise.resolve(
    Response.json({
      fields: forContact ? CONTACT_ROW_FIELDS : DESIGN_ROW_FIELDS,
      rows: answer.rows,
      command: "SELECT",
      rowCount: answer.rows.length,
      rowAsArray: true,
    }),
  );
}

beforeAll(() => {
  vi.stubEnv("DATABASE_URL", UNROUTABLE_DATABASE_URL);
  vi.stubGlobal("fetch", (input: unknown, init?: RequestInit) => {
    if (isAQuery(input, init)) return answerTheQuery(init);
    requestsPastTheDriver.push(addressOf(input));
    return Promise.reject(new TypeError("no request may leave this test"));
  });
});

afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  sentQueries.length = 0;
  requestsPastTheDriver.length = 0;
  designsAnswer = { kind: "rows", rows: [] };
  contactAnswer = { kind: "rows", rows: [] };
  state.cookies.clear();
  for (const hydrator of Object.values(hydrators)) hydrator.mockClear();
});

function storedRowOf(document: unknown, schemaVersion: number): SocketAnswer {
  return {
    kind: "rows",
    rows: [[String(schemaVersion), JSON.stringify(document), STORED_REVISION]],
  };
}

function designNamingAnUnknownBody(): Design {
  const [first, ...rest] = KITCHEN_L_DESIGN.placements;
  if (first === undefined) throw new Error("the fixture holds no placement");
  return {
    ...KITCHEN_L_DESIGN,
    placements: [
      {
        ...first,
        body: { ...first.body, buildId: "no-such-body-in-catalogue" },
      },
      ...rest,
    ],
  };
}

async function renderDoor(door: Door, id: string): Promise<unknown> {
  const params = Promise.resolve({ locale: "ro", id });
  switch (door) {
    case "editor":
      return DesignPage({ params });
    case "review":
      return ReviewPage({ params });
    case "contact":
      return ContactPage({ params });
    case "done":
      return DonePage({ params });
  }
}

async function answerOf(door: Door, id: string): Promise<unknown> {
  try {
    return await renderDoor(door, id);
  } catch (error) {
    return { thrown: (error as Error).name, message: (error as Error).message };
  }
}

function refusalOf(answer: unknown): unknown {
  if (!isValidElement<{ reason: string }>(answer))
    throw new Error(`the page answered no element: ${JSON.stringify(answer)}`);
  if (answer.type !== DesignLoadError)
    throw new Error(
      "the page answered something other than the load-error page",
    );
  return answer.props;
}

function propsOfTheDonePage(answer: unknown): Record<string, unknown> {
  if (!isValidElement<Record<string, unknown>>(answer))
    throw new Error("the done door answered no element");
  expect(answer.type).toBe(hydrators.done);
  return answer.props;
}

const contactQueries = (): SentQuery[] =>
  sentQueries.filter(isForTheContactStore);
const designQueries = (): SentQuery[] =>
  sentQueries.filter((query) => !isForTheContactStore(query));

const COOKIE_CASES: readonly (readonly [
  string,
  ReadonlyMap<string, string>,
])[] = [
  ["no cookie at all", new Map()],
  ["an empty value", new Map([[VISITOR_COOKIE_NAME, ""]])],
  ["42 characters", new Map([[VISITOR_COOKIE_NAME, "O".repeat(42)]])],
  [
    "a trailing line feed",
    new Map([[VISITOR_COOKIE_NAME, `${OWNER_VALUE}\n`]]),
  ],
  [
    "the owner's value under a lower-case name",
    new Map([["__host-lemnaria_visitor", OWNER_VALUE]]),
  ],
];

const HOSTILE_IDS: readonly string[] = [
  "",
  "..",
  "done",
  "a/b",
  "'; select reference from contact_submissions; --",
  "x".repeat(20),
  "x".repeat(22),
  `${"x".repeat(20)}\n`,
  // eslint-disable-next-line no-restricted-syntax -- a segment of the right length in the wrong alphabet: the input under test, not copy.
  "ș".repeat(21),
];

describe("a request with no usable visitor cookie, for any segment", () => {
  it.each(COOKIE_CASES)(
    "with %s: all four doors answer unavailable, and no query of any table is sent",
    async (_name, cookies) => {
      for (const [name, value] of cookies) state.cookies.set(name, value);

      for (const door of DOORS)
        for (const id of [...HOSTILE_IDS, OWNED_ID])
          expect(refusalOf(await renderDoor(door, id))).toEqual({
            reason: "unavailable",
          });

      expect(sentQueries).toEqual([]);
      expect(requestsPastTheDriver).toEqual([]);
    },
  );
});

describe("a visitor's request", () => {
  beforeEach(() => {
    state.cookies.set(VISITOR_COOKIE_NAME, OWNER_VALUE);
  });

  it.each(HOSTILE_IDS)(
    "for the segment %j: the done door sends no query at all and answers what the other three answer for it",
    async (id) => {
      const answers = new Map<Door, unknown>();
      for (const door of DOORS) {
        sentQueries.length = 0;
        answers.set(door, await answerOf(door, id));
        expect(sentQueries, `${door} queried for ${id}`).toEqual([]);
      }
      for (const door of DOORS)
        expect(answers.get(door), door).toEqual(answers.get("editor"));
      expect(refusalOf(answers.get("done"))).toEqual({ reason: "unavailable" });
      expect(requestsPastTheDriver).toEqual([]);
    },
  );

  it("an id nothing matched: one query of the designs and none of the contact store, the refusal the other doors give", async () => {
    designsAnswer = { kind: "rows", rows: [] };

    const done = await answerOf("done", OWNED_ID);

    expect(refusalOf(done)).toEqual({ reason: "unavailable" });
    expect(designQueries()).toHaveLength(1);
    expect(contactQueries()).toEqual([]);
    for (const door of ["editor", "review", "contact"] as const)
      expect(await answerOf(door, OWNED_ID)).toEqual(done);
  });

  it("a row the load seam refuses is the invalid page on the done door as on the others, and the contact store is not read", async () => {
    designsAnswer = storedRowOf(
      designNamingAnUnknownBody(),
      CURRENT_SCHEMA_VERSION,
    );
    contactAnswer = { kind: "rows", rows: [[A_REFERENCE]] };

    const answers = await Promise.all(
      DOORS.map((door) => answerOf(door, OWNED_ID)),
    );

    for (const answer of answers)
      expect(refusalOf(answer)).toEqual({ reason: "invalid" });
    expect(contactQueries()).toEqual([]);
    expect(hydrators.done).not.toHaveBeenCalled();
  });

  it("a database that does not answer the design's query fails the done door as it fails the others, and the contact store is not read", async () => {
    designsAnswer = { kind: "failure", message: "the socket was replaced" };

    const answers = await Promise.all(
      DOORS.map((door) => answerOf(door, OWNED_ID)),
    );

    for (const answer of answers) expect(isValidElement(answer)).toBe(false);
    for (const answer of answers) expect(answer).toEqual(answers[0]);
    expect(contactQueries()).toEqual([]);
    expect(JSON.stringify(answers)).not.toContain("qa_password");
  });

  describe("an owned design", () => {
    beforeEach(() => {
      designsAnswer = storedRowOf(KITCHEN_L_DESIGN, CURRENT_SCHEMA_VERSION);
    });

    it("is read once from the contact store, for the id and the revision the owned load answered, by a statement that asks for notified rows and names no personal column", async () => {
      contactAnswer = { kind: "rows", rows: [[A_REFERENCE]] };

      await renderDoor("done", OWNED_ID);

      expect(designQueries()).toHaveLength(1);
      const [read, ...others] = contactQueries();
      if (read === undefined) throw new Error("no read of the contact store");
      expect(others).toEqual([]);
      expect(read.params).toEqual([OWNED_ID, STORED_REVISION]);
      const statement = read.query.replace(/\s+/g, " ").trim().toLowerCase();
      expect(statement).toContain("notified_at is not null");
      expect(statement).toMatch(
        /where design_id = \$1 and design_revision = \$2::bigint/,
      );
      expect(statement).toMatch(/^select reference from contact_submissions/);
      expect(statement).not.toMatch(
        /\b(name|phone|phone_normal_form|locality|email|payload_digest|design_document|priced|intent)\b/,
      );
      expect(statement).toContain("order by notified_at desc, reference");
      expect(statement).toMatch(/limit 1$/);
      // The query runs after the designs' own, never before it.
      expect(sentQueries.indexOf(read)).toBe(sentQueries.length - 1);
    });

    it("hands its client the design, the id, the revision and the reference string, and nothing else", async () => {
      contactAnswer = { kind: "rows", rows: [[A_REFERENCE]] };

      const props = propsOfTheDonePage(await renderDoor("done", OWNED_ID));

      expect(Object.keys(props).sort()).toEqual([
        "design",
        "designId",
        "revision",
        "sentReference",
      ]);
      expect(props.designId).toBe(OWNED_ID);
      expect(props.revision).toBe(STORED_REVISION);
      expect(props.sentReference).toEqual({
        kind: "sent",
        reference: A_REFERENCE,
      });
    });

    it("says none when the store holds no notified request for this design at this revision", async () => {
      contactAnswer = { kind: "rows", rows: [] };

      const props = propsOfTheDonePage(await renderDoor("done", OWNED_ID));

      expect(props.sentReference).toEqual({ kind: "none" });
    });

    it.each([
      [
        "a store that fails",
        { kind: "failure", message: "ECONNRESET qa_password" },
      ],
      [
        "two rows where one was asked for",
        { kind: "rows", rows: [[A_REFERENCE], ["LM-7K3Q9ZXB"]] },
      ],
      [
        "a reference that is markup",
        { kind: "rows", rows: [["<img src=x onerror=alert(1)>"]] },
      ],
      ["an empty reference", { kind: "rows", rows: [[""]] }],
      [
        "a reference with a line feed",
        { kind: "rows", rows: [[`${A_REFERENCE}\n`]] },
      ],
      [
        "a reference of the right shape in the wrong case",
        { kind: "rows", rows: [[A_REFERENCE.toLowerCase()]] },
      ],
    ] as const)(
      "is `unknown` for %s, with no text of the failure and no row anywhere in what the client is handed",
      async (_name, answer) => {
        contactAnswer = answer;

        const props = propsOfTheDonePage(await renderDoor("done", OWNED_ID));

        expect(props.sentReference).toEqual({ kind: "unknown" });
        const handed = JSON.stringify(props);
        expect(handed).not.toContain("qa_password");
        expect(handed).not.toContain("ECONNRESET");
        expect(handed).not.toContain("<img");
        expect(requestsPastTheDriver).toEqual([]);
      },
    );

    it("makes the read on every render, never caches it between two requests", async () => {
      contactAnswer = { kind: "rows", rows: [[A_REFERENCE]] };
      await renderDoor("done", OWNED_ID);
      contactAnswer = { kind: "rows", rows: [] };

      const props = propsOfTheDonePage(await renderDoor("done", OWNED_ID));

      expect(contactQueries()).toHaveLength(2);
      expect(props.sentReference).toEqual({ kind: "none" });
    });
  });
});
