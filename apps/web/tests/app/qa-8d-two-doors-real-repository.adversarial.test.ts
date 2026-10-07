// The editor's page and the review's page, asked through the real repository with only the database's socket
// replaced: every request the driver would send is counted here, whichever repository method or module sent it.
// A mock of one repository method cannot see a query issued by another, and that is what these tests are for.
import { createHash } from "node:crypto";

import {
  CURRENT_SCHEMA_VERSION,
  KITCHEN_L_DESIGN,
  type Design,
} from "@lemnaria/configurator-domain";
import { neonConfig } from "@neondatabase/serverless";
import { isValidElement } from "react";
import {
  afterAll,
  afterEach,
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

const VISITOR_COOKIE_NAME = "__Host-lemnaria_visitor";
const OWNER_VALUE = "O".repeat(43);
const UNROUTABLE_DATABASE_URL =
  "postgresql://qa_user:qa_password@qa-8d-two-doors.invalid/qa_database";

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

const originalFetchFunction: unknown = neonConfig.fetchFunction;

beforeAll(() => {
  vi.stubEnv("DATABASE_URL", UNROUTABLE_DATABASE_URL);
  vi.stubGlobal("fetch", (input: unknown) => {
    requestsPastTheDriver.push(String(input));
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
  neonConfig.fetchFunction = (
    _url: string,
    init: RequestInit,
  ): Promise<Response> => {
    sentQueries.push(
      JSON.parse(typeof init.body === "string" ? init.body : "{}") as SentQuery,
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
  };
});

afterEach(() => {
  neonConfig.fetchFunction = originalFetchFunction as typeof fetch;
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

const DESIGN_IDS: readonly string[] = [
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
];
/* eslint-enable no-restricted-syntax */

describe("a request that carries no well-formed visitor cookie", () => {
  it.each(COOKIES_THAT_ARE_NOT_A_VISITOR)(
    "with %s: neither door sends anything to the database, for any design id",
    async (_name, cookies) => {
      for (const [name, value] of cookies) state.cookies.set(name, value);

      for (const door of DOORS) {
        for (const id of DESIGN_IDS) {
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

    for (const door of DOORS) await renderDoor(door, "owned");

    expect(sentQueries).toHaveLength(DOORS.length);
    expect(requestsPastTheDriver).toEqual([]);
  });
});

describe("a visitor's request, as each door sends it to the database", () => {
  beforeEach(() => {
    state.cookies.set(VISITOR_COOKIE_NAME, OWNER_VALUE);
  });

  it.each(DESIGN_IDS)(
    "for the id %j: both doors send the same single statement, with the id and the cookie's hash as parameters and neither in its text",
    async (id) => {
      const [editorQuery, reviewQuery] = await sentBy(id);

      expect(reviewQuery).toEqual(editorQuery);
      expect(editorQuery?.params).toEqual([id, sha256Hex(OWNER_VALUE)]);
      expect(editorQuery?.query).toMatch(
        /where id = \$1 and visitor_hash = \$2/,
      );
    },
  );

  it("sends one statement text whatever the id", async () => {
    const texts = new Set<string>();
    for (const id of DESIGN_IDS) {
      for (const sent of await sentBy(id)) texts.add(sent.query);
    }

    expect(texts.size).toBe(1);
  });

  it("never sends the cookie's own value, only its hash", async () => {
    await sentBy("owned");

    expect(JSON.stringify(sentQueries)).not.toContain(OWNER_VALUE);
  });

  async function sentBy(id: string): Promise<readonly SentQuery[]> {
    sentQueries.length = 0;
    for (const door of DOORS) await renderDoor(door, id);
    expect(sentQueries).toHaveLength(DOORS.length);
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

    const editor = await renderDoor("editor", "owned");
    const review = await renderDoor("review", "owned");

    if (!isValidElement(editor) || !isValidElement(review))
      throw new Error("a door answered no element");
    expect(editor.type).toBe(hydrateAndConfigure);
    expect(review.type).toBe(hydrateAndReview);
    expect(review.props).toEqual(editor.props);
    expect(review.props).toEqual({
      design: KITCHEN_L_DESIGN,
      designId: "owned",
      revision: "7",
    });
  });

  it("is the invalid page on both doors when it names a body the catalogue does not hold, and nothing is thrown", async () => {
    socketAnswer = storedRowOf(
      designNamingAnUnknownBody(),
      CURRENT_SCHEMA_VERSION,
    );

    const editor = await renderDoor("editor", "owned");
    const review = await renderDoor("review", "owned");

    expect(refusalOf(review)).toEqual({ reason: "invalid" });
    expect(review).toEqual(editor);
    expect(hydrateAndReview).not.toHaveBeenCalled();
  });

  it.each(STORED_ROWS_THE_SEAM_MAY_REFUSE)(
    "holding %s: the review answers what the editor answers, and neither throws",
    async (_name, row) => {
      socketAnswer = row;

      const editor = await answerOf("editor", "owned");
      const review = await answerOf("review", "owned");

      expect(review).toEqual(editor);
      expect(refusalOf(review)).toEqual({ reason: "invalid" });
    },
  );

  it("is one refusal for a row that matched nothing, whichever door asked", async () => {
    socketAnswer = { kind: "rows", rows: [] };

    for (const door of DOORS)
      expect(refusalOf(await renderDoor(door, "owned"))).toEqual({
        reason: "unavailable",
      });
  });
});

describe("a database that does not answer", () => {
  it("fails both doors alike, and neither turns it into a refusal page", async () => {
    state.cookies.set(VISITOR_COOKIE_NAME, OWNER_VALUE);
    socketAnswer = { kind: "failure", message: "the socket was replaced" };

    const editor = await answerOf("editor", "owned");
    const review = await answerOf("review", "owned");

    expect(isValidElement(review)).toBe(false);
    expect(review).toEqual(editor);
    expect(JSON.stringify(review)).not.toContain("qa_password");
  });
});
