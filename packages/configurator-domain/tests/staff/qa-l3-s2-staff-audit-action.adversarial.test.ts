// Wave L3-S2 adversarial QA, plan P-L3-3 and P-L3-8. `staff-audit-action.test.ts` and `request-status.test.ts`
// pin the listed examples; their "holds only from and to" test hands over a plain `{ from, to }`, which a reader
// that returned the caller's own object would also pass. This file adds: the stored detail is rebuilt and so
// cannot carry what the caller hid in it (non-enumerable, symbol, accessor, Proxy), a detail on an action that
// takes none is refused for every kind of value, the codes fit the database's shape checks, and the entry
// survives the JSON column it is written to.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  INITIAL_REQUEST_STATUS,
  REQUEST_STATUSES,
  isRequestStatus,
  shownRequestStatus,
} from "../../src/staff/request-status.js";
import {
  STAFF_AUDIT_ACTIONS,
  isStaffAuditAction,
  readStaffAuditEntry,
  type StaffAuditEntry,
} from "../../src/staff/staff-audit-action.js";

const MIGRATIONS_DIRECTORY = join(
  import.meta.dirname,
  "../../../persistence/src/migrations",
);

function entryOf(action: unknown, detail: unknown): StaffAuditEntry {
  const reading = readStaffAuditEntry(action, detail);
  if (!reading.ok) {
    throw new Error(`expected an entry, refused as ${reading.code}`);
  }
  return reading.entry;
}

function detailOf(entry: StaffAuditEntry): object {
  if (entry.detail === null) throw new Error("expected a detail");
  return entry.detail;
}

function sqlShapeOf(migrationSuffix: string, column: string): RegExp {
  const file = readdirSync(MIGRATIONS_DIRECTORY).find((name) =>
    name.endsWith(migrationSuffix),
  );
  if (file === undefined)
    throw new Error(`no migration ends ${migrationSuffix}`);
  const sql = readFileSync(join(MIGRATIONS_DIRECTORY, file), "utf8");
  const match = new RegExp(`check \\(${column} ~ '([^']+)'\\)`).exec(sql);
  if (match?.[1] === undefined) throw new Error(`no shape check on ${column}`);
  return new RegExp(match[1]);
}

describe("the stored detail is rebuilt from the two codes, never the caller's object", () => {
  it("is not the object that was passed in, and changing the input afterwards changes nothing", () => {
    const input = { from: "new", to: "closed" };

    const detail = detailOf(entryOf("status-changed", input));
    input.to = "contacted";

    expect(detail).not.toBe(input);
    expect(detail).toEqual({ from: "new", to: "closed" });
  });

  it("drops a non-enumerable member the caller hid a note's text in", () => {
    const input = { from: "new", to: "closed" };
    Object.defineProperty(input, "text", {
      value: "client called about the oven",
      enumerable: false,
    });

    const detail = detailOf(entryOf("status-changed", input));

    expect(Reflect.ownKeys(detail)).toEqual(["from", "to"]);
    expect(JSON.stringify(detail)).not.toContain("oven");
  });

  it("drops a symbol-keyed member", () => {
    const input = { from: "new", to: "closed", [Symbol("note")]: "oven" };

    const detail = detailOf(entryOf("status-changed", input));

    expect(Reflect.ownKeys(detail)).toEqual(["from", "to"]);
  });

  it("reads each code once: an accessor that gives a status first and a note's text afterwards stores the status", () => {
    let reads = 0;
    const input = {
      get from() {
        reads += 1;
        return reads === 1 ? "new" : "client called about the oven";
      },
      to: "closed",
    };

    const entry = entryOf("status-changed", input);

    expect(detailOf(entry)).toEqual({ from: "new", to: "closed" });
    expect(detailOf(entry)).toEqual({ from: "new", to: "closed" });
    expect(reads).toBe(1);
  });

  it("stores plain data when a Proxy answers: no trap's value survives past the two statuses", () => {
    const target = { from: "new", to: "closed" };
    const proxy = new Proxy(target, {
      get: (_target, name) =>
        name === "from" || name === "to" ? Reflect.get(target, name) : "oven",
      ownKeys: () => ["from", "to"],
      getOwnPropertyDescriptor: (_target, name) => ({
        value: Reflect.get(target, name) as unknown,
        enumerable: true,
        configurable: true,
      }),
    });

    const detail = detailOf(entryOf("status-changed", proxy));

    expect(detail).not.toBe(proxy);
    expect(Reflect.ownKeys(detail)).toEqual(["from", "to"]);
    expect(Object.getPrototypeOf(detail)).toBe(Object.prototype);
  });

  it("accepts a detail made with no prototype, as a JSON reviver may make one, and stores an ordinary object", () => {
    const input = Object.assign(Object.create(null) as object, {
      from: "closed",
      to: "new",
    });

    const detail = detailOf(entryOf("status-changed", input));

    expect(Object.getPrototypeOf(detail)).toBe(Object.prototype);
  });

  it("refuses a class instance, a frozen array of the two codes, and an own key set to undefined", () => {
    class Change {
      from = "new";
      to = "closed";
    }
    const refusals = [
      new Change(),
      Object.freeze(["new", "closed"]),
      { from: "new", to: "closed", note: undefined },
      { from: undefined, to: "closed" },
    ].map((detail) => readStaffAuditEntry("status-changed", detail));

    expect(refusals).toEqual(
      Array.from({ length: 4 }, () => ({ ok: false, code: "INVALID_DETAIL" })),
    );
  });

  it("refuses a status that is a String object, an array of one status, or a status with an edge character", () => {
    const wrong = [
      new String("new"),
      ["new"],
      "new\n",
      "new\u0000",
      "\u200Bnew",
      "NEW",
      "new ",
    ];

    for (const status of wrong) {
      expect(
        readStaffAuditEntry("status-changed", { from: status, to: "new" }),
      ).toEqual({
        ok: false,
        code: "INVALID_DETAIL",
      });
      expect(
        readStaffAuditEntry("status-changed", { from: "new", to: status }),
      ).toEqual({
        ok: false,
        code: "INVALID_DETAIL",
      });
    }
  });
});

describe("an action that takes no detail refuses every kind of value that is not absent", () => {
  const ACTIONS_WITHOUT_DETAIL = STAFF_AUDIT_ACTIONS.filter(
    (action) => action !== "status-changed",
  );

  it.each([
    ["false", false],
    ["the empty string", ""],
    ["NaN", Number.NaN],
    ["a function", () => null],
    ["a symbol", Symbol("detail")],
    ["a bigint", 0n],
    ["an array holding null", [null]],
    ["an object holding null", { text: null }],
    ["a nested object", { status: { from: "new", to: "closed" } }],
    [
      "a valid status change, on the wrong action",
      { from: "new", to: "closed" },
    ],
    ["a Proxy over an empty object", new Proxy({}, {})],
    ["a String object", new String("")],
  ])("%s", (_label, detail) => {
    for (const action of ACTIONS_WITHOUT_DETAIL) {
      expect(readStaffAuditEntry(action, detail)).toEqual({
        ok: false,
        code: "INVALID_DETAIL",
      });
    }
  });

  propertyTest.prop(
    [fc.anything({ withNullPrototype: true, withBigInt: true })],
    {
      numRuns: 3000,
    },
  )("refuses any value at all unless it is null or undefined", (detail) => {
    fc.pre(detail !== null && detail !== undefined);

    for (const action of ACTIONS_WITHOUT_DETAIL) {
      expect(readStaffAuditEntry(action, detail)).toEqual({
        ok: false,
        code: "INVALID_DETAIL",
      });
    }
  });

  it("stores null, not undefined, for an absent detail", () => {
    for (const action of ACTIONS_WITHOUT_DETAIL) {
      expect(Object.hasOwn(entryOf(action, undefined), "detail")).toBe(true);
      expect(entryOf(action, undefined).detail).toBeNull();
    }
  });
});

describe("an action that is not one of the four", () => {
  it.each([
    ["a String object", new String("kitchen-opened")],
    ["an array holding an action", ["kitchen-opened"]],
    [
      "an object whose toString names an action",
      { toString: (): string => "kitchen-opened" },
    ],
    ["an action with an edge space", "kitchen-opened "],
    ["an action with a zero-width character", "kitchen\u200B-opened"],
    ["an action in capitals", "NOTE-ADDED"],
    ["a symbol", Symbol("kitchen-opened")],
    ["a bigint", 1n],
  ])("%s is UNKNOWN_ACTION", (_label, action) => {
    expect(readStaffAuditEntry(action, null)).toEqual({
      ok: false,
      code: "UNKNOWN_ACTION",
    });
  });

  propertyTest.prop(
    [fc.anything({ withNullPrototype: true, withBigInt: true }), fc.anything()],
    { numRuns: 3000 },
  )(
    "answers any pair without throwing, and an entry is only ever one of the four shapes",
    (action, detail) => {
      const reading = readStaffAuditEntry(action, detail);

      if (!reading.ok) {
        expect(["UNKNOWN_ACTION", "INVALID_DETAIL"]).toContain(reading.code);
        return;
      }
      expect(STAFF_AUDIT_ACTIONS).toContain(reading.entry.action);
      expect(Object.keys(reading.entry).sort()).toEqual(["action", "detail"]);
      if (reading.entry.detail !== null) {
        expect(Object.keys(reading.entry.detail).sort()).toEqual([
          "from",
          "to",
        ]);
        expect(REQUEST_STATUSES).toContain(reading.entry.detail.from);
        expect(REQUEST_STATUSES).toContain(reading.entry.detail.to);
      }
    },
  );
});

describe("the entry as the database holds it", () => {
  it("reads back as itself after the JSON column", () => {
    const entries: StaffAuditEntry[] = [
      ...STAFF_AUDIT_ACTIONS.filter(
        (action) => action !== "status-changed",
      ).map((action) => entryOf(action, null)),
      ...REQUEST_STATUSES.flatMap((from) =>
        REQUEST_STATUSES.map((to) => entryOf("status-changed", { from, to })),
      ),
    ];

    for (const entry of entries) {
      const stored: unknown = JSON.parse(JSON.stringify(entry.detail));
      expect(readStaffAuditEntry(entry.action, stored)).toEqual({
        ok: true,
        entry,
      });
    }
  });

  it("holds an action that passes the table's shape check, for every action", () => {
    const shape = sqlShapeOf("_create_staff_audit_events.sql", "action");

    for (const action of STAFF_AUDIT_ACTIONS) {
      expect(action).toMatch(shape);
    }
    expect("Kitchen_Opened").not.toMatch(shape);
  });

  it("holds a status that passes the table's shape check, for every status", () => {
    const shape = sqlShapeOf("_create_design_request_states.sql", "status");

    for (const status of REQUEST_STATUSES) {
      expect(status).toMatch(shape);
    }
    expect("offer_sent").not.toMatch(shape);
  });
});

describe("request status, hostile lookups", () => {
  it.each([
    ["a String object", new String("new")],
    ["a symbol", Symbol("new")],
    ["hasOwnProperty", "hasOwnProperty"],
    ["valueOf", "valueOf"],
    ["__defineGetter__", "__defineGetter__"],
    ["length", "length"],
    ["an array index", "0"],
    [
      "an object whose toString names a status",
      { toString: (): string => "new" },
    ],
    ["a status with a zero-width character", "ne\u200Bw"],
    ["a status with a trailing line feed", "closed\n"],
  ])("isRequestStatus refuses %s", (_label, value) => {
    expect(isRequestStatus(value)).toBe(false);
  });

  propertyTest.prop(
    [fc.anything({ withNullPrototype: true, withBigInt: true })],
    {
      numRuns: 3000,
    },
  )("isRequestStatus holds only for the four codes", (value) => {
    expect(isRequestStatus(value)).toBe(
      typeof value === "string" &&
        REQUEST_STATUSES.some((status) => status === value),
    );
  });

  it("isStaffAuditAction is the same for any value", () => {
    fc.assert(
      fc.property(
        fc.anything({ withNullPrototype: true, withBigInt: true }),
        (value) => {
          expect(isStaffAuditAction(value)).toBe(
            typeof value === "string" &&
              STAFF_AUDIT_ACTIONS.some((action) => action === value),
          );
        },
      ),
    );
  });

  it("shows exactly new for a sent kitchen, and nothing for a draft, whatever is saved", () => {
    expect(shownRequestStatus({ isSent: true, recorded: null })).toBe(
      INITIAL_REQUEST_STATUS,
    );
    for (const recorded of [null, ...REQUEST_STATUSES]) {
      expect(shownRequestStatus({ isSent: false, recorded })).toBeNull();
    }
  });
});
