// Adversarial reading of what the audit page believes of the log (wave L3-U6): the reader is total over any JSON a server or
// a proxy could send, never throws, never gives back a member the contract does not name, never drops a row whose action it
// does not know, and never echoes a detail it did not accept. Properties run over bodies with one leaf replaced at every depth.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { STAFF_AUDIT_ACTIONS } from "@lemnaria/configurator-domain";

import { staffAuditPageFrom } from "@/staff/staff-audit-wire-reading";

import { required } from "./qa-l3-u6-required.adversarial";
import {
  auditAccountIdOf,
  wireAuditEvent,
  wireAuditPage,
} from "../support/staff-audit-wire";

const SECRET = "SECRET-7c1e-note-text";
const ACCOUNT_ID_LENGTH = 21;

type Path = readonly (string | number)[];

function leafPaths(value: unknown, prefix: Path = []): Path[] {
  if (typeof value !== "object" || value === null) return [prefix];
  const members: [string | number, unknown][] = Array.isArray(value)
    ? value.map((member, index) => [index, member])
    : Object.entries(value);
  if (members.length === 0) return [prefix];
  return members.flatMap(([key, member]) =>
    leafPaths(member, [...prefix, key]),
  );
}

function cloneJson<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
}

function withLeafReplaced(body: unknown, path: Path, replacement: unknown) {
  const copy = cloneJson(body) as Record<string | number, unknown>;
  if (path.length === 0) return replacement;
  let holder: Record<string | number, unknown> = copy;
  for (const key of path.slice(0, -1)) {
    holder = holder[key] as Record<string | number, unknown>;
  }
  const last = required(path.at(-1));
  if (replacement === undefined) {
    Reflect.deleteProperty(holder, last);
  } else {
    holder[last] = replacement;
  }
  return copy;
}

function validBody(): Record<string, unknown> {
  return wireAuditPage(
    [
      wireAuditEvent(1),
      wireAuditEvent(2, {
        entry: {
          kind: "recognised",
          action: "status-changed",
          detail: { from: "new", to: "closed" },
        },
      }),
      wireAuditEvent(3, {
        entry: {
          kind: "recognised",
          action: "audit-viewed",
          detail: {
            page: 2,
            rowCount: 25,
            hasActorFilter: true,
            hasActionFilter: false,
            hasDateFilter: true,
          },
        },
        kitchen: null,
        subject: null,
      }),
      wireAuditEvent(4, { entry: { kind: "unrecognised", action: "x" } }),
    ],
    { total: 99 },
  );
}

/** What a page the reader gave back must be, whatever it was given. */
function expectWellFormed(page: ReturnType<typeof staffAuditPageFrom>): void {
  if (page === undefined) return;
  expect(Number.isSafeInteger(page.total) && page.total >= 0).toBe(true);
  expect(Number.isSafeInteger(page.page) && page.page >= 1).toBe(true);
  expect(Number.isSafeInteger(page.pageSize) && page.pageSize >= 1).toBe(true);
  expect(page.events.length).toBeLessThanOrEqual(page.pageSize);
  const ids = page.events.map(({ id }) => id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(Object.keys(page).sort()).toEqual([
    "events",
    "page",
    "pageSize",
    "total",
  ]);
  for (const event of page.events) {
    expect(Object.keys(event).sort()).toEqual([
      "actor",
      "entry",
      "id",
      "kitchen",
      "occurredAt",
      "subject",
    ]);
    expect(event.id).not.toBe("");
    expect(new Date(event.occurredAt).toISOString()).toBe(event.occurredAt);
    expect(event.actor.id).toHaveLength(ACCOUNT_ID_LENGTH);
    expect(["string", "object"]).toContain(typeof event.actor.email);
    expect(["recognised", "unrecognised"]).toContain(event.entry.kind);
    expect(typeof event.entry.action).toBe("string");
    if (event.entry.kind === "unrecognised") {
      expect(Object.keys(event.entry).sort()).toEqual(["action", "kind"]);
    } else {
      expect(STAFF_AUDIT_ACTIONS).toContain(event.entry.action);
    }
  }
}

describe("the reader is total", () => {
  it("never throws, and gives back a well-formed page or nothing, for any JSON at all", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (body) => {
        expectWellFormed(staffAuditPageFrom(body));
      }),
      { numRuns: 500 },
    );
  });

  it("never throws, and gives back a well-formed page or nothing, for any value at all, functions and symbols included", () => {
    fc.assert(
      fc.property(
        fc.anything({
          withBigInt: true,
          withDate: true,
          withMap: true,
          withSet: true,
          withNullPrototype: true,
          withTypedArray: true,
          withSparseArray: true,
          withObjectString: true,
          withBoxedValues: true,
        }),
        (body) => {
          expectWellFormed(staffAuditPageFrom(body));
        },
      ),
      { numRuns: 500 },
    );
  });

  it("holds for the valid body as written, with every row kept", () => {
    const page = staffAuditPageFrom(validBody());

    expectWellFormed(page);
    expect(page?.events).toHaveLength(4);
  });

  it("never throws for the valid body with any one leaf replaced by any value, or left out, at any depth", () => {
    const paths = leafPaths(validBody());

    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: paths.length - 1 }),
        fc.oneof(
          fc.constant(undefined),
          fc.jsonValue(),
          fc.constantFrom(
            -1,
            0,
            1.5,
            Number.MAX_SAFE_INTEGER,
            2 ** 53,
            1e300,
            -0,
            "",
            "__proto__",
            "constructor",
          ),
        ),
        (index, replacement) => {
          const path = required(paths[index]);
          const body = withLeafReplaced(validBody(), path, replacement);

          expectWellFormed(staffAuditPageFrom(body));
        },
      ),
      { numRuns: 1000 },
    );
  });

  it("reads a member named __proto__ that JSON.parse made an own member as a member like any other", () => {
    const text =
      '{"total":1,"page":1,"pageSize":25,"events":[],"__proto__":{"total":9}}';

    const page = staffAuditPageFrom(JSON.parse(text));

    expect(page?.total).toBe(1);
    expect(Object.getPrototypeOf(page)).toBe(Object.prototype);
    expect(Object.hasOwn(Object.prototype, "total")).toBe(false);
  });

  it.each(["actor", "subject", "kitchen", "entry"])(
    "does not let a polluting __proto__ in a row's %s stand for a member the row does not have",
    (member) => {
      const polluted = JSON.parse(
        `{"__proto__":${JSON.stringify(wireAuditEvent(1)[member])}}`,
      ) as unknown;
      const body = wireAuditPage([wireAuditEvent(1, { [member]: polluted })]);

      expect(staffAuditPageFrom(body)).toBeUndefined();
    },
  );
});

describe("a row whose action this build does not know", () => {
  const ACTIONS = fc.oneof(
    fc.constantFrom(
      "constructor",
      "__proto__",
      "toString",
      "hasOwnProperty",
      "valueOf",
      "__defineGetter__",
      "",
      " ",
      "kitchen-opened ",
      "KITCHEN-OPENED",
    ),
    fc.string({ maxLength: 40 }),
    fc.constantFrom(...STAFF_AUDIT_ACTIONS),
  );
  const DETAILS = fc.oneof(
    fc.constant(undefined),
    fc.constant(null),
    fc.jsonValue(),
    fc.record({ note: fc.constant(SECRET), text: fc.constant(SECRET) }),
    fc.record({
      from: fc.constant("new"),
      to: fc.constant("closed"),
      extra: fc.constant(SECRET),
    }),
    fc.record({
      page: fc.constant(1),
      rowCount: fc.constant(1),
      x: fc.constant(SECRET),
    }),
  );

  it("is a row all the same, never dropped and never a failure of the page, and carries nothing of a detail it did not accept", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("recognised", "unrecognised"),
        ACTIONS,
        DETAILS,
        (kind, action, detail) => {
          const entry = { kind, action, detail, note: SECRET };
          const page = staffAuditPageFrom(
            wireAuditPage([wireAuditEvent(1, { entry }), wireAuditEvent(2)]),
          );

          expect(page?.events).toHaveLength(2);
          const [row] = page?.events ?? [];
          expect(row?.entry.action).toBe(action);
          expect(JSON.stringify(page)).not.toContain(SECRET);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it.each([
    [
      "an extra key beside a good status change",
      {
        action: "status-changed",
        detail: { from: "new", to: "closed", note: SECRET },
      },
    ],
    [
      "a status change whose members are not strings",
      {
        action: "status-changed",
        detail: { from: 1, to: [SECRET] },
      },
    ],
    [
      "a listed page with a segment that is not one",
      {
        action: "kitchens-listed",
        detail: {
          segment: SECRET,
          status: null,
          page: 1,
          rowCount: 1,
          hasSearch: false,
        },
      },
    ],
    [
      "a viewed page whose filter flags are text",
      {
        action: "audit-viewed",
        detail: {
          page: 1,
          rowCount: 1,
          hasActorFilter: SECRET,
          hasActionFilter: false,
          hasDateFilter: false,
        },
      },
    ],
    [
      "an opened kitchen that carries a detail",
      {
        action: "kitchen-opened",
        detail: SECRET,
      },
    ],
    [
      "a detail that is an array",
      {
        action: "status-changed",
        detail: [SECRET],
      },
    ],
  ])(
    "is told as unrecognised, with its code and not its detail, for %s",
    (_label, entry) => {
      const page = staffAuditPageFrom(
        wireAuditPage([
          wireAuditEvent(1, { entry: { kind: "recognised", ...entry } }),
        ]),
      );

      expect(page?.events[0]?.entry).toEqual({
        kind: "unrecognised",
        action: entry.action,
      });
      expect(JSON.stringify(page)).not.toContain(SECRET);
    },
  );

  it("keeps the fifteen listed actions with the details the domain accepts for each, and no detail for the three Lot 3 actions that carry none", () => {
    const details: Record<string, unknown> = {
      "kitchen-opened": null,
      "note-added": null,
      "status-changed": { from: "new", to: "offer-sent" },
      "kitchen-unhidden": null,
      "kitchens-listed": {
        segment: "sent",
        status: "closed",
        page: 3,
        rowCount: 20,
        hasSearch: true,
      },
      "audit-viewed": {
        page: 1,
        rowCount: 25,
        hasActorFilter: false,
        hasActionFilter: true,
        hasDateFilter: false,
      },
      "price-draft-changed": { changeKind: "depth-rule" },
      "price-draft-reverted": { changeKind: "provisional", revertedCount: 1 },
      "price-bulk-changed": {
        scope: "group",
        groupCode: "wall",
        percent: -5,
        ruleCount: 12,
        amountCount: 40,
      },
      "price-published": {
        sequenceNumber: 2,
        changeCount: 3,
        provisional: false,
      },
      "price-restored-to-draft": { fromSequenceNumber: 1, changeCount: 2 },
      "catalogue-item-active-changed": {
        itemKind: "material",
        itemId: "material.painted-mdf",
        active: true,
        availabilityRevision: "4",
      },
      "kitchen-defaults-saved": { changedFields: ["finish", "handle"] },
      "kitchen-seen": {},
      "price-catalogue-viewed": { section: "history" },
    };

    for (const action of STAFF_AUDIT_ACTIONS) {
      const page = staffAuditPageFrom(
        wireAuditPage([
          wireAuditEvent(1, {
            entry: { kind: "recognised", action, detail: details[action] },
          }),
        ]),
      );

      expect(page?.events[0]?.entry, action).toEqual({
        kind: "recognised",
        action,
        detail: details[action],
      });
    }
  });
});

describe("the numbers of the page", () => {
  it.each([
    ["a total beyond what a number holds exactly", { total: 2 ** 53 }],
    ["a total that is null", { total: null }],
    ["a total that is the text NaN", { total: "NaN" }],
    ["a negative page", { page: -1 }],
    ["a fractional page size", { pageSize: 25.5 }],
    ["a page size that is text", { pageSize: "25" }],
    ["a negative zero page", { page: -0 }],
  ])("refuses %s", (_label, overrides) => {
    expect(
      staffAuditPageFrom(wireAuditPage([wireAuditEvent(1)], overrides)),
    ).toBeUndefined();
  });

  it("takes the largest total a number holds exactly", () => {
    const page = staffAuditPageFrom(
      wireAuditPage([wireAuditEvent(1)], { total: Number.MAX_SAFE_INTEGER }),
    );

    expect(page?.total).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("takes a page size that is not twenty-five, as the contract of the list does, and holds the rows to it", () => {
    expect(
      staffAuditPageFrom(wireAuditPage([wireAuditEvent(1)], { pageSize: 1 }))
        ?.events,
    ).toHaveLength(1);
    expect(
      staffAuditPageFrom(
        wireAuditPage([wireAuditEvent(1), wireAuditEvent(2)], { pageSize: 1 }),
      ),
    ).toBeUndefined();
  });

  it("holds twenty-six rows against the page size of twenty-five the log is served in", () => {
    const rows = Array.from({ length: 26 }, (_, index) =>
      wireAuditEvent(index + 1),
    );

    expect(
      staffAuditPageFrom(wireAuditPage(rows, { total: 26 })),
    ).toBeUndefined();
  });
});

describe("the account of a row", () => {
  it.each([
    ["twenty characters", "a".repeat(20)],
    ["twenty-two characters", "a".repeat(22)],
    ["twenty-one characters with a space", `${"a".repeat(20)} `],
    ["twenty-one characters of the wrong alphabet", "é".repeat(21)],
    ["an empty id", ""],
  ])("is not an account whose id is %s", (_label, id) => {
    expect(
      staffAuditPageFrom(
        wireAuditPage([wireAuditEvent(1, { actor: { id, email: "a@b.md" } })]),
      ),
    ).toBeUndefined();
  });

  it("is an account whose id is the shape of one, whatever its address says", () => {
    const page = staffAuditPageFrom(
      wireAuditPage([
        wireAuditEvent(1, {
          actor: { id: auditAccountIdOf(5), email: "" },
        }),
      ]),
    );

    expect(page?.events[0]?.actor).toEqual({
      id: auditAccountIdOf(5),
      email: "",
    });
  });
});
