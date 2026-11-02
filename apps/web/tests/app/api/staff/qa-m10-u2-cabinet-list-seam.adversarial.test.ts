// Adversarial QA of M10 wave U2, the cabinet list's seam to the dashboard's state (`cabinet-list-source.ts`).
// `cabinet-list-source.test.ts` hands the source a handful of answers; the world tests run it over the real service.
// Neither asks what the seam does with a state that is almost one, or with one that carries more than the wire is
// allowed to (the R2 row: the wire sent to the client screen stays minimal). The service's read is replaced by a
// function that answers as the test says; the seam and the facts are real.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deriveCabinetList } from "@/price-dashboard/cabinet-list-facts";
import { readCabinetList } from "@/price-dashboard/cabinet-list-source";

import { captureConsole } from "../../../support/account-world";
import { stateOf } from "../../../price-dashboard/dashboard-state-fixture";

const service = vi.hoisted(() => ({
  read: undefined as undefined | (() => Promise<unknown>),
}));

vi.mock(
  "@/lib/server/price-dashboard/price-dashboard-service",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/lib/server/price-dashboard/price-dashboard-service")
    >()),
    readDashboardStateForAdmittedPage: () => {
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

const giving = (body: unknown): Promise<unknown> => Promise.resolve(body);

describe("a read that gives no state", () => {
  it("is unavailable when the read throws or rejects", async () => {
    for (const read of [
      () => {
        throw new Error("secret connection string postgres://user:pw@host");
      },
      () => Promise.reject(new Error("socket hang up")),
      () => Promise.reject(new Error("")),
    ]) {
      service.read = read;

      await expect(readCabinetList()).resolves.toEqual({
        kind: "unavailable",
      });
    }
  });

  it("is unavailable when there is no active version or the draft cannot be read", async () => {
    service.read = () => giving(undefined);

    expect(await readCabinetList()).toEqual({ kind: "unavailable" });
  });
});

describe("a state that is almost the state", () => {
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
      service.read = () => giving(body);

      expect(await readCabinetList()).toEqual({ kind: "unavailable" });
    },
  );

  it("is the page for a good state, and a page the browser can derive the same list from", async () => {
    service.read = () => giving(good);

    const read = await readCabinetList();

    expect(read.kind).toBe("ready");
    if (read.kind === "ready") {
      expect(deriveCabinetList(read.page).kind).toBe("ready");
    }
  });
});

describe("a state that carries more than the wire allows", () => {
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
    service.read = () => giving(withExtras);

    const read = await readCabinetList();

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
