// The editor's page and the review's page, asked through the real repository with only the network replaced: the
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
import ReviewPage from "../../src/app/[locale]/d/[id]/review/page";
import { DesignLoadError } from "../../src/app/d/[id]/design-load-error";
import {
  priceBookRootOf,
  withoutPriceBook,
} from "../support/price-book-wrapper";

const VISITOR_COOKIE_NAME = "__Host-lemnaria_visitor";
const OWNER_VALUE = "O".repeat(43);
/** A well-formed design id (`isDesignId`, 8L.13): 21 characters of `A-Za-z0-9_-`. Only such an id reaches a query. */
const OWNED_ID = "owned-000000000000000";
const UNROUTABLE_DATABASE_URL =
  "postgresql://qa_user:qa_password@qa-8d-two-doors.invalid/qa_database";
/** Where the driver posts a query for that host: it swaps the host's first label for `api.`. */
const SQL_ENDPOINT = "https://api.invalid/sql";

/** A browser with no session reads as its visitor alone: `loadOwned` binds the account arm as `null` (ADR 0172 D9),
 *  twice (the owner flag and the `where`), and `account_id = null` matches no row. */
const NO_ACCOUNT = null;

const DOORS = ["editor", "review"] as const;
type Door = (typeof DOORS)[number];

const state = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
}));
const hydrateAndConfigure = vi.hoisted(() => vi.fn(() => null));
const hydrateAndReview = vi.hoisted(() => vi.fn(() => null));

vi.mock("@/app/d/[id]/hydrate-and-configure", () => ({
  HydrateAndConfigure: hydrateAndConfigure,
}));
vi.mock("@/app/d/[id]/review/hydrate-and-review", () => ({
  HydrateAndReview: hydrateAndReview,
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
  return door === "editor" ? DesignPage({ params }) : ReviewPage({ params });
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

/* eslint-disable no-restricted-syntax -- cookie values a browser could send, written out whole: they are the inputs under test, not copy. */
const COOKIES_THAT_ARE_NOT_A_VISITOR: readonly (readonly [
  string,
  ReadonlyMap<string, string>,
])[] = [
  ["no cookie at all", new Map()],
  ["an empty value", new Map([[VISITOR_COOKIE_NAME, ""]])],
  ["42 characters", new Map([[VISITOR_COOKIE_NAME, "O".repeat(42)]])],
  ["44 characters", new Map([[VISITOR_COOKIE_NAME, "O".repeat(44)]])],
  ["a full stop", new Map([[VISITOR_COOKIE_NAME, `${"O".repeat(42)}.`]])],
  ["a plus sign", new Map([[VISITOR_COOKIE_NAME, `${"O".repeat(42)}+`]])],
  ["a slash", new Map([[VISITOR_COOKIE_NAME, `${"O".repeat(42)}/`]])],
  ["padding", new Map([[VISITOR_COOKIE_NAME, `${"O".repeat(42)}=`]])],
  ["a trailing space", new Map([[VISITOR_COOKIE_NAME, `${OWNER_VALUE} `]])],
  [
    "a trailing line feed",
    new Map([[VISITOR_COOKIE_NAME, `${OWNER_VALUE}\n`]]),
  ],
  ["a leading space", new Map([[VISITOR_COOKIE_NAME, ` ${"O".repeat(42)}`]])],
  [
    "a percent escape",
    new Map([[VISITOR_COOKIE_NAME, `${"O".repeat(40)}%4F`]]),
  ],
  [
    "a letter outside ASCII",
    new Map([[VISITOR_COOKIE_NAME, `${"O".repeat(42)}é`]]),
  ],
  [
    "a quote and a statement",
    new Map([
      [VISITOR_COOKIE_NAME, "' or visitor_hash is not null --".padEnd(43, "x")],
    ]),
  ],
  [
    "the owner's value under a lower-case name",
    new Map([["__host-lemnaria_visitor", OWNER_VALUE]]),
  ],
  [
    "the owner's value under the unprefixed name",
    new Map([["lemnaria_visitor", OWNER_VALUE]]),
  ],
  [
    "the owner's value under the write token's name",
    new Map([["lemnaria_write_token_owned", OWNER_VALUE]]),
  ],
];

/** Ids a door must not send to the database (8L.13): every one is a segment the shared load refuses before a query. */
const HOSTILE_DESIGN_IDS: readonly string[] = [
  "owned",
  "",
  " ",
  "review",
  "..",
  "a/b",
  "a%2Fb",
  "'; drop table designs; --",
  "ș".repeat(8),
  "x".repeat(4096),
  // One character off the shape on each side, and the shape's own characters in the wrong count or company.
  "x".repeat(20),
  "x".repeat(22),
  `${"x".repeat(20)}\n`,
  `${"x".repeat(20)} `,
  `${"x".repeat(20)}ș`,
  `${"x".repeat(19)}%2F`,
];

/** Ids of the generator's shape, the boundary characters included: each one reaches exactly one query per door. */
const WELL_FORMED_DESIGN_IDS: readonly string[] = [
  OWNED_ID,
  "A".repeat(21),
  "-".repeat(21),
  "_".repeat(21),
  "0123456789abcdefghijk",
  "ZYXWVUTSRQPONMLKJIHGF",
];
/* eslint-enable no-restricted-syntax */

describe("a request that carries no well-formed visitor cookie", () => {
  it.each(COOKIES_THAT_ARE_NOT_A_VISITOR)(
    "with %s: neither door sends anything to the database, for any design id",
    async (_name, cookies) => {
      for (const [name, value] of cookies) state.cookies.set(name, value);

      for (const door of DOORS) {
        for (const id of [...HOSTILE_DESIGN_IDS, ...WELL_FORMED_DESIGN_IDS]) {
          expect(refusalOf(await renderDoor(door, id))).toEqual({
            reason: "unavailable",
          });
        }
      }

      expect(sentQueries).toEqual([]);
      expect(requestsPastTheDriver).toEqual([]);
    },
  );

  it("is told apart from a visitor's by the same count: a well-formed cookie sends exactly one query per door", async () => {
    state.cookies.set(VISITOR_COOKIE_NAME, OWNER_VALUE);

    for (const door of DOORS) await renderDoor(door, OWNED_ID);

    expect(sentQueries).toHaveLength(DOORS.length);
    expect(requestsPastTheDriver).toEqual([]);
  });
});

describe("a visitor's request, as each door sends it to the database", () => {
  beforeEach(() => {
    state.cookies.set(VISITOR_COOKIE_NAME, OWNER_VALUE);
  });

  it.each(WELL_FORMED_DESIGN_IDS)(
    "for the id %j: both doors send the same single statement, with the id and the cookie's hash as parameters, no account bound, and neither in its text",
    async (id) => {
      const [editorQuery, reviewQuery] = await sentBy(id);

      expect(reviewQuery).toEqual(editorQuery);
      expect(editorQuery?.params).toEqual([
        NO_ACCOUNT,
        id,
        sha256Hex(OWNER_VALUE),
        NO_ACCOUNT,
      ]);
      expect(editorQuery?.query).toMatch(
        /where id = \$2 and \(visitor_hash = \$3 or account_id = \$4\)/,
      );
    },
  );

  it("sends one statement text whatever the id", async () => {
    const texts = new Set<string>();
    for (const id of WELL_FORMED_DESIGN_IDS) {
      for (const sent of await sentBy(id)) texts.add(sent.query);
    }

    expect(texts.size).toBe(1);
  });

  it("never sends the cookie's own value, only its hash", async () => {
    await sentBy(OWNED_ID);

    expect(JSON.stringify(sentQueries)).not.toContain(OWNER_VALUE);
  });

  describe("with a segment that is not a design id's shape (8L.13)", () => {
    it.each(HOSTILE_DESIGN_IDS)(
      "for the id %j: neither door sends a query, and each answers exactly what it answers for an id nothing matched",
      async (id) => {
        socketAnswer = { kind: "rows", rows: [] };
        const answerForUnknownId = await answerOf("review", OWNED_ID);
        sentQueries.length = 0;

        for (const door of DOORS) {
          expect(refusalOf(await renderDoor(door, id))).toEqual({
            reason: "unavailable",
          });
          expect(await renderDoor(door, id)).toEqual(
            await answerOf(door, OWNED_ID),
          );
        }

        expect(refusalOf(answerForUnknownId)).toEqual({
          reason: "unavailable",
        });
        expect(sentQueries).toHaveLength(DOORS.length);
        expect(requestsPastTheDriver).toEqual([]);
      },
    );

    it("refuses a hostile id as unavailable even when the database would have answered with a row", async () => {
      socketAnswer = storedRowOf(KITCHEN_L_DESIGN, CURRENT_SCHEMA_VERSION);

      for (const id of HOSTILE_DESIGN_IDS)
        for (const door of DOORS)
          expect(refusalOf(await renderDoor(door, id))).toEqual({
            reason: "unavailable",
          });

      expect(sentQueries).toEqual([]);
    });
  });

  async function sentBy(id: string): Promise<readonly SentQuery[]> {
    sentQueries.length = 0;
    for (const door of DOORS) await renderDoor(door, id);
    expect(sentQueries).toHaveLength(DOORS.length);
    expect(requestsPastTheDriver).toEqual([]);
    return [...sentQueries];
  }
});

const STORED_ROWS_THE_SEAM_MAY_REFUSE: readonly (readonly [
  string,
  SocketAnswer,
])[] = [
  [
    "a body the catalogue does not hold",
    storedRowOf(designNamingAnUnknownBody(), CURRENT_SCHEMA_VERSION),
  ],
  [
    "a schema version from the future",
    storedRowOf(KITCHEN_L_DESIGN, CURRENT_SCHEMA_VERSION + 100),
  ],
  ["a schema version of zero", storedRowOf(KITCHEN_L_DESIGN, 0)],
  ["an empty object", storedRowOf({}, CURRENT_SCHEMA_VERSION)],
  ["a null document", storedRowOf(null, CURRENT_SCHEMA_VERSION)],
  ["a list", storedRowOf([], CURRENT_SCHEMA_VERSION)],
  ["a string", storedRowOf("a kitchen", CURRENT_SCHEMA_VERSION)],
  [
    "no placements field",
    storedRowOf(
      { ...KITCHEN_L_DESIGN, placements: undefined },
      CURRENT_SCHEMA_VERSION,
    ),
  ],
  [
    "a room with no shape",
    storedRowOf(
      {
        ...KITCHEN_L_DESIGN,
        room: { ...KITCHEN_L_DESIGN.room, shape: undefined },
      },
      CURRENT_SCHEMA_VERSION,
    ),
  ],
  [
    "a room of a shape nobody sells",
    storedRowOf(
      { ...KITCHEN_L_DESIGN, room: { ...KITCHEN_L_DESIGN.room, shape: "Z" } },
      CURRENT_SCHEMA_VERSION,
    ),
  ],
];

describe("a stored row, read through the real load seam", () => {
  beforeEach(() => {
    state.cookies.set(VISITOR_COOKIE_NAME, OWNER_VALUE);
  });

  it("opens both doors on the stored design when the seam accepts it", async () => {
    socketAnswer = storedRowOf(KITCHEN_L_DESIGN, CURRENT_SCHEMA_VERSION);

    const editorPage = await renderDoor("editor", OWNED_ID);
    const reviewPage = await renderDoor("review", OWNED_ID);
    const editor = withoutPriceBook(editorPage);
    const review = withoutPriceBook(reviewPage);

    if (!isValidElement(editor) || !isValidElement(review))
      throw new Error("a door answered no element");
    expect(priceBookRootOf(reviewPage)).toEqual(priceBookRootOf(editorPage));
    expect(editor.type).toBe(hydrateAndConfigure);
    expect(review.type).toBe(hydrateAndReview);
    expect(review.props).toEqual(editor.props);
    expect(review.props).toEqual({
      design: KITCHEN_L_DESIGN,
      designId: OWNED_ID,
      revision: "7",
    });
  });

  it.each(STORED_ROWS_THE_SEAM_MAY_REFUSE)(
    "holding %s: the review answers what the editor answers, and neither throws",
    async (_name, row) => {
      socketAnswer = row;

      const editor = await answerOf("editor", OWNED_ID);
      const review = await answerOf("review", OWNED_ID);

      expect(review).toEqual(editor);
      expect(refusalOf(review)).toEqual({ reason: "invalid" });
    },
  );

  it("is one refusal for a row that matched nothing, whichever door asked", async () => {
    socketAnswer = { kind: "rows", rows: [] };

    for (const door of DOORS)
      expect(refusalOf(await renderDoor(door, OWNED_ID))).toEqual({
        reason: "unavailable",
      });
  });
});

describe("a database that does not answer", () => {
  it("fails both doors alike, and neither turns it into a refusal page", async () => {
    state.cookies.set(VISITOR_COOKIE_NAME, OWNER_VALUE);
    socketAnswer = { kind: "failure", message: "the socket was replaced" };

    const editor = await answerOf("editor", OWNED_ID);
    const review = await answerOf("review", OWNED_ID);

    // The failure the doors met is the database's, sent as a query each: not the refusal this test gives a request
    // it does not recognise, which would fail both doors alike too.
    expect(requestsPastTheDriver).toEqual([]);
    expect(sentQueries).toHaveLength(DOORS.length);
    expect(isValidElement(review)).toBe(false);
    expect(review).toEqual(editor);
    expect(JSON.stringify(review)).not.toContain("qa_password");
  });
});
