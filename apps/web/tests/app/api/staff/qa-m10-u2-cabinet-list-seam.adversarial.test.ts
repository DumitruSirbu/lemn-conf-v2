// Adversarial QA of M10 wave U2, the cabinet list's seam to the dashboard's read (`cabinet-list-source.ts`).
// `cabinet-list-source.test.ts` hands the source a handful of answers; the world tests run it over the real route.
// Neither asks what the seam does with every status a read could come back with, with a `200` whose body is almost the state,
// or with a `200` that carries more than the wire is allowed to (the R2 row: the wire sent to the client screen stays minimal).
// The service is replaced by a function that answers as the test says; the seam, its limiter wrapper and the facts are real.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deriveCabinetList } from "@/price-dashboard/cabinet-list-facts";
import { readCabinetList } from "@/price-dashboard/cabinet-list-source";

import { captureConsole } from "../../../support/account-world";
import { readRequest } from "../../../support/price-dashboard-requests";
import { stateOf } from "../../../price-dashboard/dashboard-state-fixture";

const service = vi.hoisted(() => ({
  read: undefined as undefined | (() => Promise<Response>),
}));

vi.mock(
  "@/lib/server/price-dashboard/price-dashboard-service",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/lib/server/price-dashboard/price-dashboard-service")
    >()),
    readDashboardForStaff: () => {
      if (service.read === undefined) throw new Error("no answer set");
      return service.read();
    },
  }),
);

beforeEach(() => {
  captureConsole();
});

afterEach(() => {
  service.read = undefined;
  vi.restoreAllMocks();
});

const request = () => {
  const { cookies, headers } = readRequest({});
  return { cookies, headers };
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status });

describe("an answer of the read that is not a 200", () => {
  const STATUSES = [
    201, 202, 203, 206, 301, 302, 304, 307, 400, 401, 403, 404, 405, 409, 410,
    413, 422, 429, 500, 501, 502, 503, 504,
  ];

  it.each(STATUSES)(
    "is unavailable for a %i, even when its body is a perfectly good state",
    async (status) => {
      service.read = () => Promise.resolve(json(status, stateOf()));

      expect(await readCabinetList(request())).toEqual({ kind: "unavailable" });
    },
  );

  it("is unavailable when the read throws, rejects with something that is not an Error, or gives a body that cannot be read", async () => {
    for (const read of [
      () => {
        throw new Error("secret connection string postgres://user:pw@host");
      },
      () => Promise.reject(new Error("socket hang up")),
      () => Promise.reject(new Error("a string")),
      () => Promise.reject(new Error("")),
      () =>
        Promise.resolve({
          status: 200,
          json: () => Promise.reject(new SyntaxError("Unexpected end")),
        } as unknown as Response),
    ]) {
      service.read = read as () => Promise<Response>;

      await expect(readCabinetList(request())).resolves.toEqual({
        kind: "unavailable",
      });
    }
  });
});

describe("a 200 that is almost the state", () => {
  const good = stateOf();
  const MALFORMED: readonly (readonly [string, unknown])[] = [
    ["null", null],
    ["an array", [good]],
    ["a string", "state"],
    ["an empty object", {}],
    ["no draft", { active: good.active }],
    ["no active", { draft: good.draft }],
    [
      "a revision that is a number",
      { ...good, draft: { ...good.draft, draftRevision: 3 } },
    ],
    [
      "changes that are not a list",
      { ...good, draft: { ...good.draft, changes: {} } },
    ],
    [
      "a change without an address",
      { ...good, draft: { ...good.draft, changes: [{ value: 1 }] } },
    ],
    [
      "an active with no book",
      { ...good, active: { ...good.active, book: undefined } },
    ],
    [
      "an active with no availability",
      { ...good, active: { ...good.active, availability: undefined } },
    ],
    [
      "an active whose label is a number",
      { ...good, active: { ...good.active, label: 4 } },
    ],
    [
      "an active whose sequence is a string",
      { ...good, active: { ...good.active, sequenceNumber: "1" } },
    ],
    [
      "a draft that names an address the book does not hold",
      {
        ...good,
        draft: {
          ...good.draft,
          changes: [
            {
              address: {
                kind: "cabinet",
                ruleId: "no.such",
                field: "anchorMinor",
              },
              value: 1,
            },
          ],
        },
      },
    ],
    [
      "a draft that sets a price to a negative amount",
      {
        ...good,
        draft: {
          ...good.draft,
          changes: [
            {
              address: {
                kind: "cabinet",
                ruleId: "cabinet.base-cabinet",
                field: "anchorMinor",
              },
              value: -1_000,
            },
          ],
        },
      },
    ],
  ];

  it.each(MALFORMED)(
    "is unavailable for %s, and the list is never half drawn",
    async (_name, body) => {
      service.read = () => Promise.resolve(json(200, body));

      expect(await readCabinetList(request())).toEqual({ kind: "unavailable" });
    },
  );

  it("is the page for a good state, and a page the browser can derive the same list from", async () => {
    service.read = () => Promise.resolve(json(200, good));

    const read = await readCabinetList(request());

    expect(read.kind).toBe("ready");
    if (read.kind === "ready") {
      expect(deriveCabinetList(read.page).kind).toBe("ready");
    }
  });
});

describe("a 200 that carries more than the wire allows", () => {
  const WIRE_ACTIVE_KEYS = [
    "availability",
    "book",
    "label",
    "publishedAt",
    "sequenceNumber",
    "versionId",
  ];

  it("(defence in depth) hands the browser only the members of the wire: no author, no account, no member the route was not specified to send", async () => {
    const state = stateOf();
    const withExtras = {
      active: {
        ...state.active,
        publishedByEmail: "publisher@example.test",
        publishedByAccountId: "acct-123",
      },
      draft: {
        ...state.draft,
        lastEditorEmail: "editor@example.test",
        changes: [
          {
            address: {
              kind: "cabinet",
              ruleId: "cabinet.base-cabinet",
              field: "anchorMinor",
            },
            value: 400_000,
            authorEmail: "author@example.test",
            actorAccountId: "acct-456",
          },
        ],
      },
      sessionTokenHash: "deadbeef",
    };
    service.read = () => Promise.resolve(json(200, withExtras));

    const read = await readCabinetList(request());

    expect(read.kind).toBe("ready");
    if (read.kind !== "ready") return;
    const shipped = JSON.stringify(read.page);
    for (const secret of [
      "publisher@example.test",
      "acct-123",
      "editor@example.test",
      "author@example.test",
      "acct-456",
      "deadbeef",
    ]) {
      expect(shipped, secret).not.toContain(secret);
    }
    expect(Object.keys(read.page.state).sort()).toEqual(["active", "draft"]);
    expect(Object.keys(read.page.state.active).sort()).toEqual(
      WIRE_ACTIVE_KEYS,
    );
  });
});
