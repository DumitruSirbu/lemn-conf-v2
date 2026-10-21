// What the list screen believes of a body: every part must be what the contract says, or the whole page is "a request that
// failed", and a status this build does not name is never told as one it does. `staffKitchenListFrom` is pure, so it is
// read directly, one hostile member at a time, with the accepting cases beside them so a reader that refuses everything
// cannot pass.
import { describe, expect, it } from "vitest";

import { staffKitchenListFrom } from "@/staff/use-staff-kitchens";

import {
  staffKitchenIdOf,
  wireDraft,
  wireList,
  wireRow,
} from "../support/staff-kitchens-wire";

function oneRow(overrides: Parameters<typeof wireRow>[1]): unknown {
  return wireList([wireRow(1, overrides)], { total: 1 });
}

describe("a page that is read", () => {
  it("keeps a page size the contract allows to differ from twenty, and ignores members it does not know", () => {
    const body = {
      ...wireList([{ ...wireRow(1), extra: "ignored" }], {
        total: 12,
        page: 3,
        pageSize: 5,
      }),
      note: "ignored",
    };

    const list = staffKitchenListFrom(body);

    expect(list).toMatchObject({ total: 12, page: 3, pageSize: 5 });
    expect(list?.kitchens.map(({ id }) => id)).toEqual([staffKitchenIdOf(1)]);
    expect(list?.kitchens[0]).not.toHaveProperty("extra");
  });

  it("keeps a page past the end as a page with no rows, which the screen must then deal with", () => {
    expect(
      staffKitchenListFrom(wireList([], { total: 3, page: 5 })),
    ).toMatchObject({ total: 3, page: 5, kitchens: [] });
  });

  it("keeps a null name, a null phone and a profile with no name", () => {
    const list = staffKitchenListFrom(
      oneRow({
        name: null,
        client: { email: "a@x.test", name: null, phone: null },
      }),
    );

    expect(list?.kitchens[0]).toMatchObject({
      name: null,
      client: { email: "a@x.test", name: null, phone: null },
    });
  });

  it.each([
    ["the empty string", ""],
    ["a different case", "NEW"],
    ["a padded word", " new"],
    ["a word of Object.prototype", "constructor"],
    ["another word of Object.prototype", "toString"],
    ["the prototype key", "__proto__"],
    ["a future word", "won"],
  ])(
    "tells %s as unrecognised and never as a status the build names",
    (_label, status) => {
      const list = staffKitchenListFrom(oneRow({ requestStatus: status }));

      expect(list?.kitchens[0]?.requestStatus).toBe("unrecognised");
    },
  );

  it("tells every status the build names as itself, and none as unrecognised", () => {
    const names = ["new", "contacted", "offer-sent", "closed"];
    const list = staffKitchenListFrom(
      wireList(
        names.map((status, index) =>
          wireRow(index + 1, { requestStatus: status }),
        ),
      ),
    );

    expect(list?.kitchens.map(({ requestStatus }) => requestStatus)).toEqual(
      names,
    );
  });

  it("keeps a draft's missing status as none, not as a new request", () => {
    const list = staffKitchenListFrom(wireList([wireDraft(1)], { total: 1 }));

    expect(list?.kitchens[0]?.requestStatus).toBeNull();
  });

  it("reads only the members a body holds itself, not those its prototype supplies", () => {
    const inherited: unknown = Object.create(
      wireList([wireRow(1)], { total: 1 }),
    );

    expect(staffKitchenListFrom(inherited)).toBeUndefined();
  });

  it("reads only the members a row holds itself, not those its prototype supplies", () => {
    const inheritedRow: unknown = Object.create(wireRow(1));

    expect(
      staffKitchenListFrom(wireList([inheritedRow], { total: 1 })),
    ).toBeUndefined();
  });

  it("reads a body whose key is the prototype key as having no such member", () => {
    const body: unknown = JSON.parse(
      '{"__proto__":{"total":1,"page":1,"pageSize":20,"kitchens":[]}}',
    );

    expect(staffKitchenListFrom(body)).toBeUndefined();
  });
});

describe("a page that is refused whole", () => {
  it.each([
    ["no body at all", undefined],
    ["null", null],
    ["a string", "{}"],
    ["a number", 7],
    ["an array", []],
    ["an array holding the page", [wireList([])]],
  ])("refuses %s", (_label, body) => {
    expect(staffKitchenListFrom(body)).toBeUndefined();
  });

  it.each([
    ["a total below nothing", { total: -1 }],
    ["a fractional total", { total: 1.5 }],
    ["a total that is text", { total: "5" }],
    ["a total beyond the safe integers", { total: 2 ** 53 }],
    ["a total that is not a number", { total: Number.NaN }],
    ["page nought", { page: 0 }],
    ["a negative page", { page: -1 }],
    ["a fractional page", { page: 1.5 }],
    ["a page that is text", { page: "1" }],
    ["a page size of nought", { pageSize: 0 }],
    ["a negative page size", { pageSize: -20 }],
    ["a page size that is text", { pageSize: "20" }],
  ])("refuses a page with %s", (_label, overrides) => {
    expect(staffKitchenListFrom(wireList([], overrides))).toBeUndefined();
  });

  it.each([
    ["rows that are an object", { 0: wireRow(1), length: 1 }],
    ["rows that are text", "kitchens"],
    ["no rows member", undefined],
    ["rows that are null", null],
  ])("refuses a page with %s", (_label, kitchens) => {
    const body: Record<string, unknown> = {
      total: 1,
      page: 1,
      pageSize: 20,
      kitchens,
    };

    expect(staffKitchenListFrom(body)).toBeUndefined();
  });

  it.each([
    ["a null row", null],
    ["a row that is text", "k"],
    ["a row that is a list", [wireRow(1)]],
    ["a row that is an empty object", {}],
  ])(
    "refuses a page holding %s among good ones, not only that row",
    (_label, row) => {
      const body = wireList([wireRow(1), row, wireRow(3)], { total: 3 });

      expect(staffKitchenListFrom(body)).toBeUndefined();
    },
  );

  it.each([
    ["an id that is not text", { id: 7 }],
    ["an id that could not name a kitchen", { id: "../../etc/passwd" }],
    ["no id", { id: undefined }],
    ["a hidden flag that is not a boolean", { isHidden: "no" }],
    ["a missing hidden flag", { isHidden: undefined }],
    ["a sent flag that is a number", { isSent: 1 }],
    ["a sent date that is text but no date", { sentAt: "soon" }],
    ["a sent date that is a number", { sentAt: 1_760_000_000_000 }],
    ["a missing sent date", { sentAt: undefined }],
    ["a missing change date", { updatedAt: undefined }],
    ["a change date that is null", { updatedAt: null }],
    ["a client that is text", { client: "a@x.test" }],
    ["a client that is a list", { client: ["a@x.test"] }],
    ["a missing client", { client: undefined }],
    [
      "a client whose address is null",
      { client: { email: null, name: null, phone: null } },
    ],
    [
      "a client whose name is a number",
      { client: { email: "a@x.test", name: 3, phone: null } },
    ],
    [
      "a client whose phone is a number",
      { client: { email: "a@x.test", name: null, phone: 3 } },
    ],
    [
      "a client with no phone member",
      { client: { email: "a@x.test", name: null } },
    ],
    ["a missing status member", { requestStatus: undefined }],
    ["a status that is an object", { requestStatus: { value: "new" } }],
    ["a status that is a boolean", { requestStatus: false }],
    ["a name that is an object", { name: { text: "x" } }],
  ])("refuses a page whose row has %s", (_label, overrides) => {
    expect(staffKitchenListFrom(oneRow(overrides))).toBeUndefined();
  });
});
