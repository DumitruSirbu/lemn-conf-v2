import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  MAX_DISABLED_ITEMS,
  projectAvailability,
} from "@/lib/server/project-availability";

// Adversarial QA for M10 wave R1's availability projection: the answer is serialised into every page, so it is handed on
// only as the catalogue declares it: a text revision, and items of a closed set of kinds each holding exactly one text id
// (a handle from its closed list), every one bounded. Anything else is refused and never passed on, and a size past a
// bound is told apart from a shape that is wrong.

const MAX_ID_LENGTH = 64;
const MAX_REVISION_LENGTH = 19;

const ID_MEMBERS = [
  ["material", "tierId"],
  ["hardware", "tierId"],
  ["finish", "finishId"],
  ["handle", "handle"],
  ["accessory", "accessoryId"],
] as const;

const KIND_WITH_FREE_TEXT_ID = ID_MEMBERS.filter(([kind]) => kind !== "handle");
const HANDLES = ["steel", "black", "push"];

function answerOf(...disabled: unknown[]): unknown {
  return { revision: "1", disabled };
}

function manyOf(item: unknown, count: number): unknown[] {
  return Array.from({ length: count }, () => item);
}

function refusalOf(answer: unknown): string | undefined {
  const projected = projectAvailability(answer);
  return projected.ok ? undefined : projected.refusal;
}

describe("a declared answer is handed on exactly", () => {
  it("is an item of every kind with its one id, in order, and the revision", () => {
    const items = [
      { kind: "material", tierId: "material.painted-mdf" },
      { kind: "hardware", tierId: "hardware.premium" },
      { kind: "finish", finishId: "finish.x" },
      { kind: "handle", handle: "black" },
      { kind: "accessory", accessoryId: "dishDryingRack" },
    ];

    const projected = projectAvailability({ revision: "42", disabled: items });

    expect(projected).toEqual({
      ok: true,
      availability: { revision: "42", disabled: items },
    });
  });

  it("is an empty list, and a list of the same item twice", () => {
    const item = { kind: "material", tierId: "m" };

    expect(projectAvailability(answerOf())).toMatchObject({ ok: true });
    expect(projectAvailability(answerOf(item, item))).toMatchObject({
      ok: true,
      availability: { disabled: [item, item] },
    });
  });

  it.each(HANDLES)("takes the handle %s", (handle) => {
    expect(refusalOf(answerOf({ kind: "handle", handle }))).toBeUndefined();
  });
});

describe("the kinds are closed, and each holds exactly its one id member", () => {
  it.each([
    "wall",
    "Material",
    "material ",
    "",
    "constructor",
    "toString",
    "hasOwnProperty",
    "__proto__",
    "valueOf",
  ])("refuses the kind %j as unreadable", (kind) => {
    expect(refusalOf(answerOf({ kind, tierId: "t" }))).toBe("unreadable");
  });

  it.each([null, undefined, 7, true, ["material"], { name: "material" }])(
    "refuses a kind that is %j",
    (kind) => {
      expect(refusalOf(answerOf({ kind, tierId: "t" }))).toBe("unreadable");
    },
  );

  it.each(ID_MEMBERS)(
    "refuses a %s item that names its id under the wrong member, or none",
    (kind, member) => {
      const wrongMember = member === "tierId" ? "finishId" : "tierId";

      expect(refusalOf(answerOf({ kind, [wrongMember]: "id" }))).toBe(
        "unreadable",
      );
      expect(refusalOf(answerOf({ kind }))).toBe("unreadable");
    },
  );

  it.each(ID_MEMBERS)(
    "refuses a %s item whose id is not text, or is empty",
    (kind, member) => {
      for (const id of [
        "",
        0,
        1,
        null,
        undefined,
        true,
        ["id"],
        { deep: "id" },
        { deep: "x".repeat(100_000) },
        12n,
      ]) {
        expect(
          refusalOf(answerOf({ kind, [member]: id })),
          `${kind} ${typeof id}`,
        ).toBe("unreadable");
      }
    },
  );

  it.each(["Steel", "gold", "", " steel", "steel ", "push\n", "STEEL"])(
    "refuses the handle %j: only the closed list is a handle",
    (handle) => {
      expect(refusalOf(answerOf({ kind: "handle", handle }))).toBe(
        "unreadable",
      );
    },
  );

  it.each([null, undefined, 3, "material", true, [], [{ kind: "material" }]])(
    "refuses an item that is %j",
    (item) => {
      expect(refusalOf(answerOf(item))).toBe("unreadable");
    },
  );

  it("refuses a hole in the list", () => {
    const sparse = new Array<unknown>(2);
    sparse[0] = { kind: "material", tierId: "t" };

    expect(refusalOf({ revision: "1", disabled: sparse })).toBe("unreadable");
  });

  it("refuses one bad item among good ones, however many", () => {
    const good = { kind: "material", tierId: "t" };

    expect(refusalOf(answerOf(good, good, { kind: "nope" }, good))).toBe(
      "unreadable",
    );
  });
});

describe("what is not declared is dropped", () => {
  it("drops every other member of an item, whatever it holds", () => {
    const projected = projectAvailability(
      answerOf({
        kind: "material",
        tierId: "t",
        finishId: "also",
        note: "x".repeat(10_000),
        nested: { deep: ["x".repeat(10_000)] },
      }),
    );

    expect(projected).toEqual({
      ok: true,
      availability: {
        revision: "1",
        disabled: [{ kind: "material", tierId: "t" }],
      },
    });
  });

  it("drops every other member of the answer", () => {
    const projected = projectAvailability({
      revision: "1",
      disabled: [],
      comment: "x".repeat(10_000),
    });

    expect(projected).toEqual({
      ok: true,
      availability: { revision: "1", disabled: [] },
    });
  });

  it("copies an own __proto__ member nowhere and pollutes nothing", () => {
    const hostile = JSON.parse(
      '{"revision":"1","__proto__":{"polluted":"yes"},"disabled":[{"kind":"material","tierId":"t","__proto__":{"polluted":"yes"}}]}',
    ) as unknown;

    const projected = projectAvailability(hostile);

    expect(projected).toEqual({
      ok: true,
      availability: {
        revision: "1",
        disabled: [{ kind: "material", tierId: "t" }],
      },
    });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(JSON.stringify(projected)).not.toContain("polluted");
  });

  // The book's projection reads only members an object owns. This one destructures, so a member a prototype supplies is
  // read as if the store had written it; a store's answer is data, but the two projections should agree.
  it("does not read an id an item merely inherits", () => {
    const inheritedItem = Object.create({ tierId: "inherited" }) as Record<
      string,
      unknown
    >;
    inheritedItem.kind = "material";

    expect(refusalOf(answerOf(inheritedItem))).toBe("unreadable");
  });

  it("does not read a revision and a list the answer merely inherits", () => {
    const inheritedAnswer = Object.create({
      revision: "1",
      disabled: [],
    }) as unknown;

    expect(refusalOf(inheritedAnswer)).toBe("unreadable");
  });
});

describe("the bounds, exactly, and which refusal each is", () => {
  it("takes the most items and refuses one more as too large", () => {
    const item = { kind: "material", tierId: "t" };

    expect(refusalOf(answerOf(...manyOf(item, MAX_DISABLED_ITEMS)))).toBe(
      undefined,
    );
    expect(refusalOf(answerOf(...manyOf(item, MAX_DISABLED_ITEMS + 1)))).toBe(
      "too-large",
    );
  });

  it.each(KIND_WITH_FREE_TEXT_ID)(
    "takes a %s id of 64 characters and refuses 65 as too large",
    (kind, member) => {
      expect(
        refusalOf(answerOf({ kind, [member]: "x".repeat(MAX_ID_LENGTH) })),
      ).toBeUndefined();
      expect(
        refusalOf(answerOf({ kind, [member]: "x".repeat(MAX_ID_LENGTH + 1) })),
      ).toBe("too-large");
    },
  );

  it("takes a revision of nineteen characters and refuses twenty as too large", () => {
    expect(
      refusalOf({ revision: "9".repeat(MAX_REVISION_LENGTH), disabled: [] }),
    ).toBeUndefined();
    expect(
      refusalOf({
        revision: "9".repeat(MAX_REVISION_LENGTH + 1),
        disabled: [],
      }),
    ).toBe("too-large");
  });

  it.each([12, 12n, null, undefined, ["1"], { toString: "1" }])(
    "refuses a revision that is %s as unreadable, not as a size",
    (revision) => {
      expect(refusalOf({ revision, disabled: [] })).toBe("unreadable");
    },
  );

  it.each([null, undefined, 3, "answer", true, [], [[]]])(
    "refuses an answer that is %j as unreadable",
    (answer) => {
      expect(refusalOf(answer)).toBe("unreadable");
    },
  );

  it("counts the size before it reads an item, so a huge list of bad items is too large and costs nothing", () => {
    const bad = Array(MAX_DISABLED_ITEMS + 1).fill(null) as unknown[];

    expect(refusalOf({ revision: "1", disabled: bad })).toBe("too-large");
  });
});

describe("the answer is a copy", () => {
  const stored = (): { revision: string; disabled: unknown[] } => ({
    revision: "7",
    disabled: [
      { kind: "material", tierId: "t", extra: "x" },
      { kind: "handle", handle: "push" },
    ],
  });

  it("shares no object or array with the store's answer, so a later change to either cannot reach the other", () => {
    const answer = stored();

    const projected = projectAvailability(answer);

    if (!projected.ok) throw new Error("expected a projection");
    expect(projected.availability).not.toBe(answer);
    expect(projected.availability.disabled).not.toBe(answer.disabled);
    projected.availability.disabled.forEach((item, index) => {
      expect(item).not.toBe(answer.disabled[index]);
    });
    answer.disabled.push({ kind: "finish", finishId: "late" });
    (answer.disabled[0] as Record<string, unknown>).tierId = "changed";
    expect(projected.availability.disabled).toHaveLength(2);
    expect(projected.availability.disabled[0]).toEqual({
      kind: "material",
      tierId: "t",
    });
  });

  it("projects a deeply frozen answer, and leaves it as it was", () => {
    const answer = stored();
    const deepFreeze = (value: unknown): void => {
      if (typeof value !== "object" || value === null) return;
      Object.values(value).forEach(deepFreeze);
      Object.freeze(value);
    };
    deepFreeze(answer);

    const projected = projectAvailability(answer);

    expect(projected).toMatchObject({ ok: true });
    expect(answer.disabled[0]).toEqual({
      kind: "material",
      tierId: "t",
      extra: "x",
    });
  });
});

describe("over any answer at all", () => {
  const hostile = fc.anything({
    withBigInt: true,
    withNullPrototype: true,
    withObjectString: true,
    withSparseArray: true,
    withTypedArray: true,
  });
  const idText = fc.string({ minLength: 1, maxLength: MAX_ID_LENGTH });
  const declaredItem = fc.oneof(
    ...ID_MEMBERS.map(([kind, member]) =>
      (kind === "handle" ? fc.constantFrom(...HANDLES) : idText).map((id) => ({
        kind,
        [member]: id,
      })),
    ),
  );

  it("never throws, and hands on only an answer that is a revision and declared items, each with a kind and one id", () => {
    fc.assert(
      fc.property(hostile, (answer) => {
        const projected = projectAvailability(answer);

        if (!projected.ok) return;
        const { revision, disabled } = projected.availability;
        expect(typeof revision).toBe("string");
        expect(revision.length).toBeLessThanOrEqual(MAX_REVISION_LENGTH);
        expect(disabled.length).toBeLessThanOrEqual(MAX_DISABLED_ITEMS);
        for (const item of disabled) {
          expect(Object.keys(item)).toHaveLength(2);
        }
      }),
      { numRuns: 500 },
    );
  });

  it("round-trips every declared answer, and its serialised size is bounded", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: MAX_REVISION_LENGTH }),
        fc.array(declaredItem, { maxLength: MAX_DISABLED_ITEMS }),
        (revision, disabled) => {
          const projected = projectAvailability({ revision, disabled });

          expect(projected).toEqual({
            ok: true,
            availability: { revision, disabled },
          });
        },
      ),
      { numRuns: 200 },
    );
  });

  it("refuses an answer made declared and then broken in one place, whichever place", () => {
    const breakages: readonly ((item: Record<string, unknown>) => void)[] = [
      (item) => {
        item.kind = "unknown";
      },
      (item) => {
        for (const key of Object.keys(item)) {
          if (key !== "kind") item[key] = 5;
        }
      },
      (item) => {
        for (const key of Object.keys(item)) {
          if (key !== "kind") Reflect.deleteProperty(item, key);
        }
      },
    ];
    fc.assert(
      fc.property(
        fc.array(declaredItem, { minLength: 1, maxLength: 20 }),
        fc.nat(),
        fc.constantFrom(...breakages),
        (disabled, at, breakIt) => {
          const items = structuredClone(disabled) as Record<string, unknown>[];
          const victim = items[at % items.length];
          if (victim === undefined) return;
          breakIt(victim);

          expect(refusalOf({ revision: "1", disabled: items })).toBe(
            "unreadable",
          );
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("what the page's root holds of the store's answer", () => {
  it("is a projection of it, so a change the store's object suffers after the read does not reach the root", async () => {
    const { SAMPLE_PRICE_BOOK } = await import("@lemnaria/configurator-domain");
    const { readActivePriceBook } = await import(
      "@/lib/server/active-price-book"
    );
    const answer = {
      revision: "3",
      disabled: [{ kind: "material", tierId: "t", extra: "x" }],
    };
    const stores = {
      priceBook: {
        readActive: () =>
          Promise.resolve({
            kind: "found",
            version: {
              versionId: "v",
              sequenceNumber: 1,
              label: "L",
              publishedAt: new Date(0),
              book: { ...SAMPLE_PRICE_BOOK, version: "v" },
            },
          }),
      },
      availability: { readCurrent: () => Promise.resolve(answer) },
    };

    const root = await readActivePriceBook(
      stores as unknown as Parameters<typeof readActivePriceBook>[0],
    );
    answer.disabled.push({ kind: "material", tierId: "late", extra: "y" });

    expect(root.kind === "active" && root.availability).toEqual({
      revision: "3",
      disabled: [{ kind: "material", tierId: "t" }],
    });
  });
});
