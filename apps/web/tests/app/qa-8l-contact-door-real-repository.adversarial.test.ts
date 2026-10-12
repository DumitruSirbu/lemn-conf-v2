// Wave 8L criterion 15 and 16 against the real repository: the contact page beside the editor's and the review's. The
// design's three doors are asked through the real repository with only the network replaced: the
// test stands at the global `fetch`, where the driver sends, and sorts every request. A `POST` to the driver's SQL
// endpoint for this test's own unroutable host is a query and is counted; anything else is a request past the driver
// and is refused. So a query is seen whichever repository method, module or copy of the driver sent it, which a mock
// of one repository method cannot do, and the driver itself is never named here.
import { createHash } from "node:crypto";

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

import DesignPage from "../../src/app/[locale]/d/[id]/page";
import ContactPage from "../../src/app/[locale]/d/[id]/contact/page";
import ReviewPage from "../../src/app/[locale]/d/[id]/review/page";
import { DesignLoadError } from "../../src/app/d/[id]/design-load-error";

const VISITOR_COOKIE_NAME = "__Host-lemnaria_visitor";
const OWNER_VALUE = "O".repeat(43);
/** A well-formed design id (`isDesignId`, 8L.13): 21 characters of `A-Za-z0-9_-`. Only such an id reaches a query. */
const OWNED_ID = "owned-000000000000000";
const UNROUTABLE_DATABASE_URL =
  "postgresql://qa_user:qa_password@qa-8d-two-doors.invalid/qa_database";
/** Where the driver posts a query for that host: it swaps the host's first label for `api.`. */
const SQL_ENDPOINT = "https://api.invalid/sql";

const DOORS = ["editor", "review", "contact"] as const;
type Door = (typeof DOORS)[number];

const state = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
}));
const hydrateAndConfigure = vi.hoisted(() => vi.fn(() => null));
const hydrateAndReview = vi.hoisted(() => vi.fn(() => null));
const hydrateAndContact = vi.hoisted(() => vi.fn(() => null));

vi.mock("@/app/d/[id]/hydrate-and-configure", () => ({
  HydrateAndConfigure: hydrateAndConfigure,
}));
vi.mock("@/app/d/[id]/review/hydrate-and-review", () => ({
  HydrateAndReview: hydrateAndReview,
}));
vi.mock("@/app/d/[id]/contact/hydrate-and-contact", () => ({
  HydrateAndContact: hydrateAndContact,
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
let socketAnswer: SocketAnswer = { kind: "rows", rows: [] };

const DESIGN_ROW_FIELDS = [
  { name: "schema_version", dataTypeID: 23 },
  { name: "document", dataTypeID: 3802 },
  { name: "revision", dataTypeID: 25 },
];

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

function answerTheQuery(init: RequestInit | undefined): Promise<Response> {
  sentQueries.push(
    JSON.parse(typeof init?.body === "string" ? init.body : "{}") as SentQuery,
  );
  if (socketAnswer.kind === "failure")
    return Promise.reject(new TypeError(socketAnswer.message));
  return Promise.resolve(
    Response.json({
      fields: DESIGN_ROW_FIELDS,
      rows: socketAnswer.rows,
      command: "SELECT",
      rowCount: socketAnswer.rows.length,
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
  socketAnswer = { kind: "rows", rows: [] };
  state.cookies.clear();
  hydrateAndConfigure.mockClear();
  hydrateAndReview.mockClear();
  hydrateAndContact.mockClear();
});

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function storedRowOf(document: unknown, schemaVersion: number): SocketAnswer {
  return {
    kind: "rows",
    rows: [[String(schemaVersion), JSON.stringify(document), "7"]],
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
  if (door === "editor") return DesignPage({ params });
  return door === "review" ? ReviewPage({ params }) : ContactPage({ params });
}

/** What a door answered, with a thrown error kept as an answer so two doors can be compared on it. */
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

/** Segments that are not a design id's shape (8L.13). */
const HOSTILE_IDS: readonly string[] = [
  "",
  "..",
  "review",
  "contact",
  "a/b",
  "'; drop table designs; --",
  "x".repeat(20),
  "x".repeat(22),
  `${"x".repeat(20)}\n`,
  // eslint-disable-next-line no-restricted-syntax -- a segment of the right length in the wrong alphabet: the input under test, not copy.
  "ș".repeat(21),
];

const WELL_FORMED_ID = "wellFormed____-_____1";

describe("a request with no usable visitor cookie, for any segment", () => {
  it.each(COOKIE_CASES)(
    "with %s: all three doors answer unavailable and send no query",
    async (_name, cookies) => {
      for (const [name, value] of cookies) state.cookies.set(name, value);

      for (const door of DOORS)
        for (const id of [...HOSTILE_IDS, OWNED_ID, WELL_FORMED_ID])
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
    "for the segment %j: every door sends no query and answers what it answers for an id nothing matched",
    async (id) => {
      for (const door of DOORS) {
        sentQueries.length = 0;
        const hostile = await answerOf(door, id);
        expect(sentQueries, `${door} queried for ${id}`).toEqual([]);
        const unknown = await answerOf(door, OWNED_ID);
        expect(sentQueries).toHaveLength(1);
        expect(hostile).toEqual(unknown);
        expect(refusalOf(hostile)).toEqual({ reason: "unavailable" });
      }
      expect(requestsPastTheDriver).toEqual([]);
    },
  );

  it("for a well-formed id: the contact door sends the very statement the review sends, with the id and the cookie's hash as parameters", async () => {
    await renderDoor("review", WELL_FORMED_ID);
    await renderDoor("contact", WELL_FORMED_ID);

    expect(sentQueries).toHaveLength(2);
    expect(sentQueries[1]).toEqual(sentQueries[0]);
    expect(sentQueries[1]?.params).toEqual([
      WELL_FORMED_ID,
      sha256Hex(OWNER_VALUE),
    ]);
  });

  it("a row the load seam refuses is the invalid page on all three doors, through one function", async () => {
    socketAnswer = storedRowOf(
      designNamingAnUnknownBody(),
      CURRENT_SCHEMA_VERSION,
    );

    const answers = await Promise.all(
      DOORS.map((door) => answerOf(door, OWNED_ID)),
    );

    for (const answer of answers)
      expect(refusalOf(answer)).toEqual({ reason: "invalid" });
    expect(answers[1]).toEqual(answers[0]);
    expect(answers[2]).toEqual(answers[0]);
    expect(hydrateAndContact).not.toHaveBeenCalled();
  });

  it("a row that matched nothing is one refusal on all three", async () => {
    socketAnswer = { kind: "rows", rows: [] };

    for (const door of DOORS)
      expect(refusalOf(await renderDoor(door, OWNED_ID))).toEqual({
        reason: "unavailable",
      });
  });

  it("an owned row opens the contact door on the stored design, its revision, its id and one boolean, and nothing else", async () => {
    socketAnswer = storedRowOf(KITCHEN_L_DESIGN, CURRENT_SCHEMA_VERSION);

    const contact = await renderDoor("contact", OWNED_ID);

    if (!isValidElement<Record<string, unknown>>(contact))
      throw new Error("the contact door answered no element");
    expect(contact.type).toBe(hydrateAndContact);
    expect(Object.keys(contact.props).sort()).toEqual([
      "design",
      "designId",
      "isSendable",
      "revision",
    ]);
    expect(contact.props.designId).toBe(OWNED_ID);
    expect(contact.props.revision).toBe("7");
    expect(typeof contact.props.isSendable).toBe("boolean");
  });

  it("a database that does not answer fails all three doors alike and turns none into a refusal page", async () => {
    socketAnswer = { kind: "failure", message: "the socket was replaced" };

    const answers = await Promise.all(
      DOORS.map((door) => answerOf(door, OWNED_ID)),
    );

    expect(requestsPastTheDriver).toEqual([]);
    expect(sentQueries).toHaveLength(DOORS.length);
    for (const answer of answers) expect(isValidElement(answer)).toBe(false);
    expect(answers[1]).toEqual(answers[0]);
    expect(answers[2]).toEqual(answers[0]);
    expect(JSON.stringify(answers)).not.toContain("qa_password");
  });
});
