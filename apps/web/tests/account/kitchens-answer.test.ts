// The reader of `GET /api/account/kitchens` against the E1 wire (Lot 2 plan section 2, E1; criterion 5). A page that is
// not what the contract says is told as a failed request, never drawn half-understood; a part of a kitchen that only
// costs the card a detail (its price, its colour) is dropped alone.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import { kitchensPageFrom } from "@/account/kitchens/kitchens-answer";

import {
  designIdOf,
  wireKitchen,
  wirePage,
} from "../support/account-kitchens-wire";

describe("a page the contract describes", () => {
  it("reads the total, the kitchens in order and the cursor", () => {
    const page = kitchensPageFrom(
      wirePage([wireKitchen(1), wireKitchen(2)], {
        total: 5,
        nextCursor: "opaque-cursor_1",
      }),
    );
    expect(page?.total).toBe(5);
    expect(page?.kitchens.map((kitchen) => kitchen.id)).toEqual([
      designIdOf(1),
      designIdOf(2),
    ]);
    expect(page?.nextCursor).toBe("opaque-cursor_1");
  });

  it("reads a last page: a null cursor is no cursor", () => {
    expect(kitchensPageFrom(wirePage([wireKitchen(1)]))?.nextCursor).toBe(
      undefined,
    );
  });

  it("reads an empty account: no kitchens, a total of nothing", () => {
    const page = kitchensPageFrom(wirePage([]));
    expect(page).toEqual({ total: 0, kitchens: [], nextCursor: undefined });
  });

  it("reads an empty page that still names a next one (the server skipped unreadable documents)", () => {
    const page = kitchensPageFrom(
      wirePage([], { total: 3, nextCursor: "more" }),
    );
    expect(page).toEqual({ total: 3, kitchens: [], nextCursor: "more" });
  });

  it("keeps a total larger than the kitchens returned", () => {
    expect(
      kitchensPageFrom(wirePage([wireKitchen(1)], { total: 40 }))?.total,
    ).toBe(40);
  });

  it("carries the stored document, the sent mark and the time of the last change", () => {
    const updatedAt = "2026-10-19T09:30:15.250Z";
    const [kitchen] =
      kitchensPageFrom(wirePage([wireKitchen(1, { updatedAt, isSent: true })]))
        ?.kitchens ?? [];
    expect(kitchen?.isSent).toBe(true);
    expect(kitchen?.updatedAtMs).toBe(Date.parse(updatedAt));
    expect(kitchen?.updatedAtIso).toBe(updatedAt);
    expect(kitchen?.document).toEqual(KITCHEN_L_DESIGN);
  });
});

describe("a kitchen's name", () => {
  it.each([
    ["null", null],
    ["empty", ""],
    ["spaces only", "   "],
    ["a line break only", "\n\t"],
  ])(
    "is not given when it is %s: the card then names it from its facts",
    (_, name) => {
      const [kitchen] =
        kitchensPageFrom(wirePage([wireKitchen(1, { name })]))?.kitchens ?? [];
      expect(kitchen?.name).toBeUndefined();
    },
  );

  it("keeps a given name as the server stored it, untouched", () => {
    const [kitchen] =
      kitchensPageFrom(wirePage([wireKitchen(1, { name: " Casa Ana " })]))
        ?.kitchens ?? [];
    expect(kitchen?.name).toBe(" Casa Ana ");
  });
});

describe("a page that is not the contract's fails whole", () => {
  it.each([
    ["no body", undefined],
    ["null", null],
    ["a string", "kitchens"],
    ["an array", []],
    ["an empty object", {}],
    ["a missing total", wirePage([], { total: undefined })],
    ["a missing kitchens member", wirePage([], { kitchens: undefined })],
    ["a missing cursor member", wirePage([], { nextCursor: undefined })],
    ["a total that is a string", wirePage([], { total: "3" })],
    ["a negative total", wirePage([], { total: -1 })],
    ["a fractional total", wirePage([], { total: 1.5 })],
    ["an infinite total", wirePage([], { total: Infinity })],
    ["an unsafe-integer total", wirePage([], { total: 2 ** 53 })],
    ["kitchens that is an object", wirePage([], { kitchens: {} })],
    ["an empty-string cursor", wirePage([], { nextCursor: "" })],
    ["a numeric cursor", wirePage([], { nextCursor: 7 })],
    [
      "a cursor past 512 characters",
      wirePage([], { nextCursor: "c".repeat(513) }),
    ],
  ])("%s", (_, body) => {
    expect(kitchensPageFrom(body)).toBeUndefined();
  });

  it("accepts a cursor of exactly 512 characters", () => {
    expect(
      kitchensPageFrom(wirePage([], { nextCursor: "c".repeat(512) }))
        ?.nextCursor,
    ).toBe("c".repeat(512));
  });

  it("reads only the body's own members, never an inherited one", () => {
    const inherited: unknown = Object.create({
      total: 1,
      kitchens: [],
      nextCursor: null,
    });
    expect(kitchensPageFrom(inherited)).toBeUndefined();
  });

  it("fails the whole page for one malformed kitchen among good ones", () => {
    const page = wirePage([
      wireKitchen(1),
      wireKitchen(2, { id: "not-a-design-id" }),
      wireKitchen(3),
    ]);
    expect(kitchensPageFrom(page)).toBeUndefined();
  });

  it.each([
    ["a kitchen that is null", null],
    ["a kitchen that is a string", "kitchen"],
    ["an id that is not a design id's shape", wireKitchen(1, { id: "abc" })],
    [
      "an id with a path segment",
      wireKitchen(1, { id: `${"a".repeat(18)}/..` }),
    ],
    ["a numeric id", wireKitchen(1, { id: 12 })],
    ["a missing id", wireKitchen(1, { id: undefined })],
    ["a name that is a number", wireKitchen(1, { name: 5 })],
    ["a missing name member", wireKitchen(1, { name: undefined })],
    [
      "an updatedAt that is a number",
      wireKitchen(1, { updatedAt: 1760000000 }),
    ],
    [
      "an updatedAt that is not a date",
      wireKitchen(1, { updatedAt: "yesterday" }),
    ],
    ["a missing updatedAt", wireKitchen(1, { updatedAt: undefined })],
    ["an isSent that is a string", wireKitchen(1, { isSent: "false" })],
    ["an isSent that is 0", wireKitchen(1, { isSent: 0 })],
    ["a missing isSent", wireKitchen(1, { isSent: undefined })],
    ["a missing summary", wireKitchen(1, { summary: undefined })],
    ["a null summary", wireKitchen(1, { summary: null })],
  ])("%s", (_, kitchen) => {
    expect(kitchensPageFrom(wirePage([kitchen]))).toBeUndefined();
  });
});

describe("the summary's walls follow the room's shape", () => {
  const summaryOf = (shape: unknown, wallsMm: unknown, finish?: unknown) => ({
    shape,
    wallsMm,
    ...(finish === undefined ? {} : { finish }),
  });

  it.each([
    ["linear", [3000]],
    ["L", [3000, 2400]],
    ["U", [3000, 2400, 2600]],
  ])("accepts %s with exactly its walls", (shape, wallsMm) => {
    const [kitchen] =
      kitchensPageFrom(
        wirePage([wireKitchen(1, { summary: summaryOf(shape, wallsMm) })]),
      )?.kitchens ?? [];
    expect(kitchen?.summary.shape).toBe(shape);
    expect(kitchen?.summary.wallsMm).toEqual(wallsMm);
  });

  it.each([
    ["linear", []],
    ["linear", [3000, 2400]],
    ["L", [3000]],
    ["L", [3000, 2400, 2600]],
    ["U", [3000, 2400]],
    ["U", [3000, 2400, 2600, 1000]],
  ])("refuses %s with %j walls: the page fails whole", (shape, wallsMm) => {
    expect(
      kitchensPageFrom(
        wirePage([wireKitchen(1, { summary: summaryOf(shape, wallsMm) })]),
      ),
    ).toBeUndefined();
  });

  it.each([
    ["a zero wall", [3000, 0]],
    ["a negative wall", [3000, -2400]],
    ["a NaN wall", [3000, Number.NaN]],
    ["an infinite wall", [3000, Infinity]],
    ["a string wall", [3000, "2400"]],
    ["a null wall", [3000, null]],
  ])("refuses %s", (_, wallsMm) => {
    expect(
      kitchensPageFrom(
        wirePage([wireKitchen(1, { summary: summaryOf("L", wallsMm) })]),
      ),
    ).toBeUndefined();
  });

  it.each([
    ["an unknown shape", summaryOf("O", [3000])],
    ["a numeric shape", summaryOf(1, [3000])],
    ["walls that are not a list", summaryOf("linear", "3000")],
    ["no walls member", { shape: "linear" }],
  ])("refuses %s", (_, summary) => {
    expect(
      kitchensPageFrom(wirePage([wireKitchen(1, { summary })])),
    ).toBeUndefined();
  });

  it("drops a finish this build does not know and keeps the kitchen", () => {
    const [kitchen] =
      kitchensPageFrom(
        wirePage([
          wireKitchen(1, {
            summary: summaryOf("linear", [3000], {
              kind: "palette-entry",
              entryId: "pal.does-not-exist",
            }),
          }),
        ]),
      )?.kitchens ?? [];
    expect(kitchen?.summary).toEqual({
      shape: "linear",
      wallsMm: [3000],
      finish: undefined,
    });
  });

  it("keeps a finish it knows", () => {
    const finish = { kind: "palette-entry", entryId: "pal.antracit" };
    const [kitchen] =
      kitchensPageFrom(
        wirePage([
          wireKitchen(1, { summary: summaryOf("linear", [3000], finish) }),
        ]),
      )?.kitchens ?? [];
    expect(kitchen?.summary.finish).toEqual(finish);
  });

  it("reads a kitchen with no finish at all", () => {
    const [kitchen] =
      kitchensPageFrom(
        wirePage([wireKitchen(1, { summary: summaryOf("linear", [3000]) })]),
      )?.kitchens ?? [];
    expect(kitchen?.summary.finish).toBeUndefined();
  });
});

describe("a stored document this build cannot read", () => {
  it.each([
    ["is missing", undefined],
    ["is null", null],
    ["is a string", "design"],
    ["is an empty object", {}],
    [
      "has a placement list of the wrong type",
      { ...KITCHEN_L_DESIGN, placements: 3 },
    ],
  ])("costs only the price when it %s", (_, document) => {
    const page = kitchensPageFrom(
      wirePage([wireKitchen(1, { document }), wireKitchen(2)]),
    );
    expect(page?.kitchens).toHaveLength(2);
    expect(page?.kitchens[0]?.document).toBeUndefined();
    expect(page?.kitchens[0]?.id).toBe(designIdOf(1));
    expect(page?.kitchens[1]?.document).toEqual(KITCHEN_L_DESIGN);
  });
});
