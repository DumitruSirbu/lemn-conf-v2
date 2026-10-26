// M10 X2 re-check (adversarial QA): the closed key lists are complete (a key of a detail type that its list lacks fails
// here, which `satisfies` alone cannot see), the changed-fields list is read once and stored as checked, and the
// activation action is named once.
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  CATALOGUE_ACTIVATION_AUDIT_ACTION,
  DASHBOARD_AUDIT_ACTIONS,
  DASHBOARD_DETAIL_KEYS,
  KITCHEN_DEFAULTS_FIELDS,
  readDashboardAuditEntry,
  type DashboardAuditAction,
  type DashboardAuditDetailByAction,
} from "../../src/staff/dashboard-audit-action.js";
import * as barrel from "../../src/index.js";
import { STAFF_AUDIT_ACTIONS } from "../../src/staff/staff-audit-action.js";

const FREE_TEXT = "Ana, tel 069 000 000";

/** The fullest detail the reader accepts for each action: every optional member present where the rules allow it. */
const FULL_DETAILS: Readonly<Record<DashboardAuditAction, object>> = {
  "price-draft-changed": {
    changeKind: "cabinet-size",
    itemKind: "cabinet",
    itemId: "base-1",
    field: "anchorMinor",
    widthMm: 600,
  },
  "price-draft-reverted": {
    changeKind: "cabinet-size",
    itemKind: "cabinet",
    itemId: "base-1",
    field: "anchorMinor",
    widthMm: 600,
    revertedCount: 1,
  },
  "price-bulk-changed": {
    scope: "group",
    groupCode: "base",
    percent: 5,
    ruleCount: 1,
    amountCount: 2,
  },
  "price-published": { sequenceNumber: 1, changeCount: 1, provisional: false },
  "price-restored-to-draft": { fromSequenceNumber: 1, changeCount: 1 },
  "catalogue-item-active-changed": {
    itemKind: "material",
    itemId: "material.painted-mdf",
    active: true,
    availabilityRevision: "1",
  },
  "kitchen-defaults-saved": { changedFields: ["material", "depth"] },
  "kitchen-seen": {},
  "price-catalogue-viewed": { section: "history" },
};

function withHoleAt(list: string[], index: number): string[] {
  Reflect.deleteProperty(list, index);
  return list;
}

function readFields(changedFields: unknown) {
  return readDashboardAuditEntry("kitchen-defaults-saved", { changedFields });
}

function storedFieldsOf(reading: ReturnType<typeof readFields>): unknown[] {
  if (!reading.ok) throw new Error("expected an entry");
  const { detail } = reading.entry as unknown as {
    detail: { changedFields: unknown[] };
  };
  return detail.changedFields;
}

/** What a reading may hold when it is accepted: a non-empty, distinct list of the listed fields, as a frozen plain array. */
function expectStoredAsChecked(reading: ReturnType<typeof readFields>): void {
  if (!reading.ok) return;
  const stored = storedFieldsOf(reading);
  expect(stored.length).toBeGreaterThanOrEqual(1);
  expect(new Set(stored).size).toBe(stored.length);
  for (const field of stored) {
    expect(KITCHEN_DEFAULTS_FIELDS as readonly unknown[]).toContain(field);
  }
  expect(Object.isFrozen(stored)).toBe(true);
  expect(Object.getPrototypeOf(stored)).toBe(Array.prototype);
  expect(Reflect.ownKeys(stored).sort()).toEqual(
    [...stored.keys()].map(String).concat("length").sort(),
  );
  expect(JSON.stringify(reading.entry)).not.toContain("Ana");
  expect(JSON.stringify(reading.entry)).not.toContain("null");
}

describe("the closed key lists are complete", () => {
  it.each(DASHBOARD_AUDIT_ACTIONS)(
    "%s lists exactly the keys of its fullest accepted detail, and the reader returns each of them",
    (action) => {
      const reading = readDashboardAuditEntry(action, FULL_DETAILS[action]);
      if (!reading.ok) throw new Error(`${action} was refused`);

      expect(Object.keys(reading.entry.detail).sort()).toEqual(
        [...DASHBOARD_DETAIL_KEYS[action]].sort(),
      );
      expect(Object.keys(FULL_DETAILS[action]).sort()).toEqual(
        [...DASHBOARD_DETAIL_KEYS[action]].sort(),
      );
    },
  );

  it("lists each key once", () => {
    for (const action of DASHBOARD_AUDIT_ACTIONS) {
      const keys: readonly string[] = DASHBOARD_DETAIL_KEYS[action];
      expect(new Set(keys).size, action).toBe(keys.length);
    }
  });

  it("names a list for exactly the nine actions", () => {
    expect(Object.keys(DASHBOARD_DETAIL_KEYS).sort()).toEqual(
      [...DASHBOARD_AUDIT_ACTIONS].sort(),
    );
  });

  it("is checked in both directions by the compiler: a list's keys are exactly its detail type's keys", () => {
    type ListedKeys<Action extends DashboardAuditAction> =
      (typeof DASHBOARD_DETAIL_KEYS)[Action][number];
    type DetailKeys<Action extends DashboardAuditAction> =
      keyof DashboardAuditDetailByAction[Action];

    expectTypeOf<ListedKeys<"price-draft-changed">>().toEqualTypeOf<
      DetailKeys<"price-draft-changed">
    >();
    expectTypeOf<ListedKeys<"price-draft-reverted">>().toEqualTypeOf<
      DetailKeys<"price-draft-reverted">
    >();
    expectTypeOf<ListedKeys<"price-bulk-changed">>().toEqualTypeOf<
      DetailKeys<"price-bulk-changed">
    >();
    expectTypeOf<ListedKeys<"price-published">>().toEqualTypeOf<
      DetailKeys<"price-published">
    >();
    expectTypeOf<ListedKeys<"price-restored-to-draft">>().toEqualTypeOf<
      DetailKeys<"price-restored-to-draft">
    >();
    expectTypeOf<ListedKeys<"catalogue-item-active-changed">>().toEqualTypeOf<
      DetailKeys<"catalogue-item-active-changed">
    >();
    expectTypeOf<ListedKeys<"kitchen-defaults-saved">>().toEqualTypeOf<
      DetailKeys<"kitchen-defaults-saved">
    >();
    // `kitchen-seen` is left out: its detail type is `Record<string, never>`, whose keys are `string`, so the compiler
    // cannot hold its (empty) list to anything. The runtime tests above guard it: its list and its fullest detail
    // have no key.
    expectTypeOf<ListedKeys<"price-catalogue-viewed">>().toEqualTypeOf<
      DetailKeys<"price-catalogue-viewed">
    >();
  });
});

describe("the activation action is named once", () => {
  it("is the 29-character code, one of the nine, one of the fifteen, and in the barrel", () => {
    expect(CATALOGUE_ACTIVATION_AUDIT_ACTION).toBe(
      "catalogue-item-active-changed",
    );
    expect(CATALOGUE_ACTIVATION_AUDIT_ACTION).toHaveLength(29);
    expect(DASHBOARD_AUDIT_ACTIONS).toContain(
      CATALOGUE_ACTIVATION_AUDIT_ACTION,
    );
    expect(STAFF_AUDIT_ACTIONS).toContain(CATALOGUE_ACTIVATION_AUDIT_ACTION);
    expect(barrel.CATALOGUE_ACTIVATION_AUDIT_ACTION).toBe(
      CATALOGUE_ACTIVATION_AUDIT_ACTION,
    );
    expect(barrel.DASHBOARD_DETAIL_KEYS).toBe(DASHBOARD_DETAIL_KEYS);
  });
});

describe("the changed-fields list is read once and stored as checked", () => {
  it("stores a plain frozen copy of a plain list, in its order", () => {
    const input = ["handle", "material"];

    const reading = readFields(input);

    expect(storedFieldsOf(reading)).toEqual(["handle", "material"]);
    expect(storedFieldsOf(reading)).not.toBe(input);
    expectStoredAsChecked(reading);
  });

  it("accepts a frozen list and does not mutate it", () => {
    const input = Object.freeze(["finish", "depth"]);

    const reading = readFields(input);

    expect(storedFieldsOf(reading)).toEqual(["finish", "depth"]);
    expect(input).toEqual(["finish", "depth"]);
  });

  it("is not changed afterwards by the caller's list", () => {
    const input = ["finish"];
    const reading = readFields(input);

    input.push(FREE_TEXT);
    input[0] = FREE_TEXT;

    expect(storedFieldsOf(reading)).toEqual(["finish"]);
  });

  it("stores what the one read gave when an index getter answers differently the second time", () => {
    const input = ["finish"];
    let reads = 0;
    Object.defineProperty(input, 0, {
      enumerable: true,
      get: () => {
        reads += 1;
        return reads === 1 ? "finish" : FREE_TEXT;
      },
    });

    const reading = readFields(input);

    expect(reads).toBe(1);
    expect(storedFieldsOf(reading)).toEqual(["finish"]);
    expectStoredAsChecked(reading);
  });

  it("refuses a list whose first read is free text, however the later reads answer", () => {
    const input = ["finish"];
    let reads = 0;
    Object.defineProperty(input, 0, {
      enumerable: true,
      get: () => {
        reads += 1;
        return reads === 1 ? FREE_TEXT : "finish";
      },
    });

    expect(readFields(input).ok).toBe(false);
  });

  it.each([
    ["a hole first", withHoleAt(["x", "finish"], 0)],
    ["a hole between", withHoleAt(["finish", "x", "depth"], 1)],
    ["a hole last", withHoleAt(["finish", "depth", "x"], 2)],
    ["only holes", new Array<string>(3)],
    ["undefined", ["finish", undefined]],
    ["null", ["finish", null]],
  ])("refuses %s, so no null or undefined is stored", (_label, input) => {
    const reading = readFields(input);

    expect(reading.ok).toBe(false);
  });

  it("refuses a list that grows a hole through a length larger than its entries", () => {
    const input = ["finish"];
    input.length = 3;

    expect(readFields(input).ok).toBe(false);
  });

  it("keeps a toJSON on the caller's list out of the stored one", () => {
    const input = Object.assign(["finish"], {
      toJSON: () => [FREE_TEXT],
    });

    const reading = readFields(input);

    expect(JSON.stringify(storedFieldsOf(reading))).toBe('["finish"]');
    expect(JSON.stringify(reading.ok ? reading.entry : null)).not.toContain(
      "Ana",
    );
    expectStoredAsChecked(reading);
  });

  it("keeps an extra own property on the caller's list out of the stored one", () => {
    const input = Object.assign(["finish"], { note: FREE_TEXT });

    const reading = readFields(input);

    expect(Reflect.ownKeys(storedFieldsOf(reading))).not.toContain("note");
    expectStoredAsChecked(reading);
  });

  describe("a Proxy over an array", () => {
    it("is read once per index even when its length answers differently each time", () => {
      let lengthReads = 0;
      const input = new Proxy(["finish", "depth"], {
        get: (target, key, receiver) => {
          if (key === "length") {
            lengthReads += 1;
            return lengthReads === 1 ? 1 : 2;
          }
          return Reflect.get(target, key, receiver) as unknown;
        },
      });

      const reading = readFields(input);

      expectStoredAsChecked(reading);
      expect(JSON.stringify(reading.ok ? reading.entry : null)).not.toContain(
        FREE_TEXT,
      );
    });

    it("stores nothing but listed fields when each read of an index answers a different word", () => {
      const words = [...KITCHEN_DEFAULTS_FIELDS];
      let cursor = 0;
      const input = new Proxy(["finish", "depth"], {
        get: (target, key, receiver) => {
          if (typeof key === "string" && /^\d+$/u.test(key)) {
            cursor += 1;
            return cursor % 7 === 0 ? FREE_TEXT : words[cursor % words.length];
          }
          return Reflect.get(target, key, receiver) as unknown;
        },
      });

      expectStoredAsChecked(readFields(input));
    });

    it("is refused when a read answers free text", () => {
      const input = new Proxy(["finish"], {
        get: (target, key, receiver) =>
          key === "0"
            ? FREE_TEXT
            : (Reflect.get(target, key, receiver) as unknown),
      });

      expect(readFields(input).ok).toBe(false);
    });

    it("propagates a read that throws, as the Lot 3 readers do, and stores nothing", () => {
      const input = new Proxy(["finish"], {
        get: (target, key, receiver) => {
          if (key === "0") throw new Error("read refused");
          return Reflect.get(target, key, receiver) as unknown;
        },
      });

      expect(() => readFields(input)).toThrow("read refused");
    });

    it("never copies a list that claims a billion entries", () => {
      let indexReads = 0;
      const input = new Proxy(["finish"], {
        get: (target, key, receiver) => {
          if (key === "length") return 1_000_000_000;
          if (typeof key === "string" && /^\d+$/u.test(key)) {
            indexReads += 1;
            if (indexReads > 100) throw new Error("copied a huge list");
            return "finish";
          }
          return Reflect.get(target, key, receiver) as unknown;
        },
      });

      const read = () => readFields(input);

      expect(read).not.toThrow();
      expect(read().ok).toBe(false);
      expect(indexReads).toBeLessThanOrEqual(
        2 * KITCHEN_DEFAULTS_FIELDS.length,
      );
    });
  });

  describe("an array subclass", () => {
    class Fields extends Array<unknown> {}

    it("is stored as a plain array of the listed fields", () => {
      const input = Fields.from(["finish", "handle"]);

      const reading = readFields(input);

      expect(storedFieldsOf(reading)).toEqual(["finish", "handle"]);
      expectStoredAsChecked(reading);
    });

    it("is refused when its iterator answers free text, and stores no word its entries do not hold", () => {
      const input = Fields.from(["finish"]);
      Object.defineProperty(input, Symbol.iterator, {
        value: function* () {
          yield FREE_TEXT;
        },
      });

      expect(readFields(input).ok).toBe(false);
    });

    it("stores what it checked when its iterator and its entries disagree", () => {
      const input = Fields.from(["finish"]);
      Object.defineProperty(input, Symbol.iterator, {
        value: function* () {
          yield "depth";
        },
      });

      const reading = readFields(input);

      expectStoredAsChecked(reading);
    });

    it("is stored as a plain array even when its species would build another class", () => {
      const input = Fields.from(["finish"]);
      Object.defineProperty(input, "constructor", {
        value: { [Symbol.species]: Fields },
      });

      const reading = readFields(input);

      expectStoredAsChecked(reading);
    });
  });

  describe("a list longer than there are fields", () => {
    it.each([6, 7, 100])(
      "refuses %s entries, listed or not, because no row can appear twice",
      (length) => {
        const input = Array.from(
          { length },
          (_, index) => KITCHEN_DEFAULTS_FIELDS[index % 6],
        );

        expect(readFields(input).ok).toBe(length === 6 ? true : false);
      },
    );

    it("takes the whole list of six, in any order, each once", () => {
      const reading = readFields([...KITCHEN_DEFAULTS_FIELDS].reverse());

      expect(storedFieldsOf(reading)).toEqual(
        [...KITCHEN_DEFAULTS_FIELDS].reverse(),
      );
    });
  });
});
