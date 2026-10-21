// Adversarial reading of the staff kitchen's answer (wave L3-U3): `staffKitchenFrom` is the only thing between a body from
// the network and a page that draws a client's data, so it is judged on three promises. It never throws, whatever the body
// holds; it refuses (reads as nothing) a body whose required member is the wrong kind at any depth, and softens only the two
// documents; and what it hands on is the contract's members field by field, never an extra the server happened to send.
import {
  DesignSchema,
  KITCHEN_L_DESIGN,
  isDesignId,
} from "@lemnaria/configurator-domain";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { staffKitchenFrom } from "@/staff/use-staff-kitchen";

import {
  STAFF_KITCHEN_ID,
  wireChangedStatus,
  wireKitchen,
} from "../support/staff-kitchen-wire";

const MOMENT = "2026-10-17T11:08:00.000Z";
const NOTE_COUNT_AT_THE_LIMIT = 100;

type Json = Record<string, unknown>;

function validWire(): Json {
  return wireKitchen({
    status: wireChangedStatus("contacted"),
    notes: [
      {
        id: "n1",
        text: "Am sunat.",
        createdAt: MOMENT,
        author: { email: "mihai.rusu@lemnaria.md", name: "Mihai Rusu" },
      },
    ],
  });
}

/** A fresh wire with one member, found by its path, put to `value`. `undefined` removes the member. */
function withValueAt(path: readonly (string | number)[], value: unknown): Json {
  const wire = JSON.parse(JSON.stringify(validWire())) as Json;
  let holder: Record<string | number, unknown> = wire;
  for (const step of path.slice(0, -1)) {
    holder = holder[step] as Record<string | number, unknown>;
  }
  const last = path.at(-1);
  if (last === undefined) throw new Error("a path names a member");
  if (value === undefined) {
    Reflect.deleteProperty(holder, last);
  } else {
    holder[last] = value;
  }
  return wire;
}

const NOT_A_STRING = [4, true, [], {}, ["x"]] as const;
const NOT_A_BOOLEAN = ["true", 1, 0, null, [], {}] as const;
const NOT_AN_INSTANT = [
  undefined,
  null,
  "",
  "soon",
  "2026-13-01T00:00:00.000Z",
  "2026-10-21T25:00:00Z",
  "+275760-09-13T00:00:00.001Z",
  0,
  1_792_540_800_000,
  [],
  {},
] as const;

describe("a required member of the wrong kind, at every depth, makes the whole kitchen unreadable", () => {
  const refusals: readonly (readonly [
    string,
    readonly (string | number)[],
    readonly unknown[],
  ])[] = [
    ["kitchen", ["kitchen"], [undefined, null, "k", 4, []]],
    ["kitchen.id", ["kitchen", "id"], [undefined, null, ...NOT_A_STRING, ""]],
    [
      "kitchen.id of another shape",
      ["kitchen", "id"],
      [
        "k".repeat(20),
        "k".repeat(22),
        `${STAFF_KITCHEN_ID}\n`,
        `\n${STAFF_KITCHEN_ID}`,
        "\u043A".repeat(21),
        `${"k".repeat(20)}.`,
        `${"k".repeat(19)}%2F`,
      ],
    ],
    [
      "kitchen.name",
      ["kitchen", "name"],
      [undefined, ...NOT_A_STRING.filter((value) => typeof value !== "string")],
    ],
    ["kitchen.isSent", ["kitchen", "isSent"], [undefined, ...NOT_A_BOOLEAN]],
    [
      "kitchen.isHidden",
      ["kitchen", "isHidden"],
      [undefined, ...NOT_A_BOOLEAN],
    ],
    [
      "kitchen.sentAt",
      ["kitchen", "sentAt"],
      NOT_AN_INSTANT.filter((value) => value !== null),
    ],
    ["kitchen.updatedAt", ["kitchen", "updatedAt"], NOT_AN_INSTANT],
    ["client", ["client"], [undefined, "ana", 4, true, []]],
    ["client.email", ["client", "email"], [undefined, null, 4, true, [], {}]],
    ["client.name", ["client", "name"], [undefined, 4, true, [], {}]],
    ["client.phone", ["client", "phone"], [undefined, 4, true, [], {}]],
    ["request", ["request"], [undefined, "r", 4, true, []]],
    [
      "request.reference",
      ["request", "reference"],
      [undefined, null, "", 4, true, [], {}],
    ],
    ["request.sentAt", ["request", "sentAt"], NOT_AN_INSTANT],
    ["status", ["status"], [undefined, "contacted", 4, true, []]],
    ["status.value", ["status", "value"], [undefined, null, 4, true, [], {}]],
    [
      "status.changedBy",
      ["status", "changedBy"],
      [undefined, "mihai", 4, true, []],
    ],
    [
      "status.changedBy.email",
      ["status", "changedBy", "email"],
      [undefined, 4, true, [], {}],
    ],
    [
      "status.changedBy.name",
      ["status", "changedBy", "name"],
      [undefined, 4, true, [], {}],
    ],
    [
      "status.changedAt",
      ["status", "changedAt"],
      NOT_AN_INSTANT.filter((value) => value !== null),
    ],
    ["notes", ["notes"], [undefined, null, "n", 4, {}, { length: 0 }]],
    ["a note that is not an object", ["notes", 0], [null, "n", 4, true, []]],
    ["note.id", ["notes", 0, "id"], [undefined, null, "", 4, true, {}]],
    ["note.text", ["notes", 0, "text"], [undefined, null, 4, true, [], {}]],
    ["note.createdAt", ["notes", 0, "createdAt"], NOT_AN_INSTANT],
    ["note.author", ["notes", 0, "author"], [undefined, null, "m", 4, []]],
    [
      "note.author.email",
      ["notes", 0, "author", "email"],
      [undefined, 4, true, [], {}],
    ],
    [
      "note.author.name",
      ["notes", 0, "author", "name"],
      [undefined, 4, true, [], {}],
    ],
    ["notesTruncated", ["notesTruncated"], [undefined, ...NOT_A_BOOLEAN]],
  ];

  it.each(refusals)("%s", (_, path, wrongValues) => {
    for (const wrong of wrongValues) {
      const body = withValueAt(path, wrong);

      expect(
        staffKitchenFrom(body),
        `${path.join(".")} = ${JSON.stringify(wrong)}`,
      ).toBeUndefined();
    }
  });
});

describe("only the two documents are softened", () => {
  it.each(["design", "asSent"] as const)(
    "reads %s of any wrong kind as nothing and keeps everything around it",
    (member) => {
      const wrongKinds = [
        undefined,
        null,
        "doc",
        4,
        true,
        [],
        {},
        { room: "?" },
        { ...KITCHEN_L_DESIGN, placements: "many" },
        {
          ...KITCHEN_L_DESIGN,
          room: { ...KITCHEN_L_DESIGN.room, wallsMm: [-5] },
        },
      ];

      for (const wrong of wrongKinds) {
        const kitchen = staffKitchenFrom(
          withValueAt(["kitchen", member], wrong),
        );

        expect(kitchen?.kitchen[member], JSON.stringify(wrong)).toBeNull();
        expect(kitchen?.client?.email).toBe("ana.popescu@mail.md");
        expect(kitchen?.request?.reference).toBe("LEM-2026-0417");
        expect(kitchen?.status?.value).toBe("contacted");
      }
    },
  );

  it("reads one document without the other's fate", () => {
    const kitchen = staffKitchenFrom(
      withValueAt(["kitchen", "asSent"], { room: "?" }),
    );

    expect(kitchen?.kitchen.asSent).toBeNull();
    expect(kitchen?.kitchen.design).not.toBeNull();
  });
});

describe("the null members the contract allows", () => {
  it("reads a client, a request and a status of null, and a name, phone, sent date of null", () => {
    const body = wireKitchen({
      client: null,
      request: null,
      status: null,
      kitchen: { name: null, sentAt: null },
    });

    const kitchen = staffKitchenFrom(body);

    expect(kitchen?.client).toBeNull();
    expect(kitchen?.request).toBeNull();
    expect(kitchen?.status).toBeNull();
    expect(kitchen?.kitchen.name).toBeNull();
    expect(kitchen?.kitchen.sentAt).toBeNull();
  });

  it("reads a client whose name and phone are null", () => {
    const kitchen = staffKitchenFrom(
      wireKitchen({
        client: { email: "a@b.md", name: null, phone: null },
      }),
    );

    expect(kitchen?.client).toEqual({
      email: "a@b.md",
      name: null,
      phone: null,
    });
  });
});

describe("a status word", () => {
  it.each([
    "NEW",
    "New",
    " new",
    "new ",
    "new\n",
    "",
    "closed\u0000",
    "__proto__",
    "constructor",
    "toString",
    "hasOwnProperty",
    "offer_sent",
    "offerSent",
    "Contacted",
    "x".repeat(10_000),
  ])("%j outside the list is unrecognised and never a listed word", (word) => {
    const kitchen = staffKitchenFrom(
      wireKitchen({ status: wireChangedStatus(word) }),
    );

    expect(kitchen?.status?.value).toBe("unrecognised");
  });

  it("is the word itself when it is listed, and unrecognised for any other text at all", () => {
    const listed = ["new", "contacted", "offer-sent", "closed"];

    fc.assert(
      fc.property(
        fc.oneof(fc.string({ maxLength: 40 }), fc.constantFrom(...listed)),
        (word) => {
          const value = staffKitchenFrom(
            wireKitchen({ status: wireChangedStatus(word) }),
          )?.status?.value;

          expect(value).toBe(listed.includes(word) ? word : "unrecognised");
        },
      ),
      { numRuns: 300 },
    );
  });

  it("keeps the literal word 'unrecognised' sent by the server as unrecognised, not as a listed word", () => {
    const kitchen = staffKitchenFrom(
      wireKitchen({ status: wireChangedStatus("unrecognised") }),
    );

    expect(kitchen?.status?.value).toBe("unrecognised");
  });
});

describe("instants", () => {
  it.each([
    "1970-01-01T00:00:00.000Z",
    "1969-12-31T23:59:59.999Z",
    "9999-12-31T23:59:59.999Z",
    "+275760-09-13T00:00:00.000Z",
    "2026-03-29T01:00:00.000Z",
    "2026-10-25T01:30:00.000Z",
    "2026-10-21T12:00:00+03:00",
  ])("%s is read, in every place an instant is carried", (instant) => {
    const kitchen = staffKitchenFrom(
      wireKitchen({
        kitchen: { sentAt: instant, updatedAt: instant },
        request: { reference: "L", sentAt: instant },
        status: {
          value: "closed",
          changedBy: { email: null, name: null },
          changedAt: instant,
        },
        notes: [
          {
            id: "n",
            text: "t",
            createdAt: instant,
            author: { email: null, name: null },
          },
        ],
      }),
    );

    expect(kitchen).toBeDefined();
  });
});

describe("notes", () => {
  function noteNumbered(serial: number): Json {
    return {
      id: `note-${String(serial)}`,
      text: `Nota ${String(serial)}`,
      createdAt: MOMENT,
      author: { email: "mihai.rusu@lemnaria.md", name: "Mihai Rusu" },
    };
  }

  it("keeps all of the newest hundred in the order given, and the truncated flag", () => {
    const notes = Array.from({ length: NOTE_COUNT_AT_THE_LIMIT }, (_, index) =>
      noteNumbered(index),
    );

    const kitchen = staffKitchenFrom(
      wireKitchen({ notes, notesTruncated: true }),
    );

    expect(kitchen?.notes.map(({ id }) => id)).toEqual(
      notes.map((note) => note.id),
    );
    expect(kitchen?.notesTruncated).toBe(true);
  });

  it("is unreadable when one note of a hundred is wrong, rather than dropping it and hiding that a note exists", () => {
    const notes = Array.from({ length: NOTE_COUNT_AT_THE_LIMIT }, (_, index) =>
      noteNumbered(index),
    );
    notes[57] = { ...noteNumbered(57), text: 4 };

    expect(staffKitchenFrom(wireKitchen({ notes }))).toBeUndefined();
  });

  it("keeps a note whose text is hostile or huge exactly as it came", () => {
    const hostile = [
      "<script>alert(1)</script>",
      "\u202Eevil",
      "{count, plural, one {#} other {#}}",
      "\u0000\n\r\t",
      "\u{1F469}\u200D\u{1F4BB}",
      "n".repeat(1_000_000),
      "",
    ];
    const notes = hostile.map((text, index) => ({
      ...noteNumbered(index),
      text,
    }));

    const kitchen = staffKitchenFrom(wireKitchen({ notes }));

    expect(kitchen?.notes.map(({ text }) => text)).toEqual(hostile);
  });

  it("reads a note id repeated, so a later wave that keys by id must not trust it to be unique", () => {
    const kitchen = staffKitchenFrom(
      wireKitchen({ notes: [noteNumbered(1), noteNumbered(1)] }),
    );

    expect(kitchen?.notes).toHaveLength(2);
  });
});

describe("what is handed on is the contract's members and nothing the server added", () => {
  const SECRET = "SECRET-FROM-THE-SERVER";

  function withExtras(): Json {
    const extras = {
      accountId: SECRET,
      address: SECRET,
      postalPhone: SECRET,
      password: SECRET,
    };
    const wire = validWire() as Record<string, Record<string, unknown>>;
    return {
      ...wire,
      ...extras,
      kitchen: { ...wire.kitchen, ...extras },
      client: { ...wire.client, ...extras, id: SECRET },
      request: { ...wire.request, ...extras },
      status: {
        ...wire.status,
        ...extras,
        changedBy: { email: "e@f.md", name: "E", ...extras, id: SECRET },
      },
      notes: [
        {
          id: "n1",
          text: "t",
          createdAt: MOMENT,
          author: { email: "e@f.md", name: "E", ...extras, id: SECRET },
          ...extras,
        },
      ],
    };
  }

  it("has exactly the contract's keys at every depth", () => {
    const kitchen = staffKitchenFrom(withExtras());

    expect(Object.keys(kitchen ?? {}).sort()).toEqual(
      [
        "client",
        "kitchen",
        "notes",
        "notesTruncated",
        "request",
        "status",
      ].sort(),
    );
    expect(Object.keys(kitchen?.kitchen ?? {}).sort()).toEqual(
      [
        "asSent",
        "design",
        "id",
        "isHidden",
        "isSent",
        "name",
        "sentAt",
        "updatedAt",
      ].sort(),
    );
    expect(Object.keys(kitchen?.client ?? {}).sort()).toEqual([
      "email",
      "name",
      "phone",
    ]);
    expect(Object.keys(kitchen?.request ?? {}).sort()).toEqual([
      "reference",
      "sentAt",
    ]);
    expect(Object.keys(kitchen?.status ?? {}).sort()).toEqual([
      "changedAt",
      "changedBy",
      "value",
    ]);
    expect(Object.keys(kitchen?.status?.changedBy ?? {}).sort()).toEqual([
      "email",
      "name",
    ]);
    expect(Object.keys(kitchen?.notes[0] ?? {}).sort()).toEqual([
      "author",
      "createdAt",
      "id",
      "text",
    ]);
    expect(Object.keys(kitchen?.notes[0]?.author ?? {}).sort()).toEqual([
      "email",
      "name",
    ]);
  });

  it("carries none of the extras anywhere in what it hands on", () => {
    const kitchen = staffKitchenFrom(withExtras());

    expect(kitchen).toBeDefined();
    expect(JSON.stringify(kitchen).includes(SECRET)).toBe(false);
  });

  it("lets an extra member of a document through only as the domain's schema parses it", () => {
    const design = { ...KITCHEN_L_DESIGN, accountId: SECRET, owner: SECRET };

    const kitchen = staffKitchenFrom(
      withValueAt(["kitchen", "design"], design),
    );

    expect(JSON.stringify(kitchen?.kitchen.design).includes(SECRET)).toBe(
      false,
    );
    expect(DesignSchema.safeParse(design).success).toBe(
      kitchen?.kitchen.design !== null,
    );
  });
});

describe("members that are not the body's own", () => {
  it("does not read a member from the prototype of any object of the body", () => {
    const inherited = Object.create(validWire()) as unknown;

    expect(staffKitchenFrom(inherited)).toBeUndefined();
  });

  it("does not read a nested member from a prototype", () => {
    const wire = validWire() as Record<string, Record<string, unknown>>;
    const { kitchen } = wire;
    if (kitchen === undefined)
      throw new Error("the valid body holds a kitchen");
    const kitchenOfInheritedMembers = Object.create(kitchen) as object;

    expect(
      staffKitchenFrom({ ...wire, kitchen: kitchenOfInheritedMembers }),
    ).toBeUndefined();
  });

  it("is not polluted by, and does not pollute through, a body that names the prototype", () => {
    const body = JSON.parse(
      `{"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"polluted":"yes"}},"kitchen":{"__proto__":{"id":"${STAFF_KITCHEN_ID}"}}}`,
    ) as unknown;

    expect(staffKitchenFrom(body)).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("any value at all", () => {
  it("reads as a kitchen or as nothing, and never throws, for any JSON", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (body) => {
        const kitchen = staffKitchenFrom(body);

        if (kitchen !== undefined)
          expect(isDesignId(kitchen.kitchen.id)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it("never throws, and keeps its promises, when one member of a valid body is replaced by any JSON", () => {
    const paths: readonly (readonly (string | number)[])[] = [
      ["kitchen"],
      ["kitchen", "id"],
      ["kitchen", "name"],
      ["kitchen", "design"],
      ["kitchen", "asSent"],
      ["kitchen", "isSent"],
      ["kitchen", "isHidden"],
      ["kitchen", "sentAt"],
      ["kitchen", "updatedAt"],
      ["client"],
      ["client", "email"],
      ["request"],
      ["request", "reference"],
      ["status"],
      ["status", "value"],
      ["status", "changedBy"],
      ["status", "changedAt"],
      ["notes"],
      ["notes", 0],
      ["notes", 0, "author"],
      ["notes", 0, "text"],
      ["notesTruncated"],
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...paths),
        fc.jsonValue(),
        (path, replacement) => {
          const kitchen = staffKitchenFrom(withValueAt(path, replacement));

          if (kitchen === undefined) return;
          expect(isDesignId(kitchen.kitchen.id)).toBe(true);
          expect(typeof kitchen.kitchen.isSent).toBe("boolean");
          expect(typeof kitchen.kitchen.isHidden).toBe("boolean");
          expect(Number.isFinite(Date.parse(kitchen.kitchen.updatedAt))).toBe(
            true,
          );
          expect(Array.isArray(kitchen.notes)).toBe(true);
          expect(typeof kitchen.notesTruncated).toBe("boolean");
          expect(
            kitchen.client === null || typeof kitchen.client.email === "string",
          ).toBe(true);
          expect(
            kitchen.request === null || kitchen.request.reference !== "",
          ).toBe(true);
        },
      ),
      { numRuns: 600 },
    );
  });

  it("reads a body whose strings are enormous without losing a character of them", () => {
    const huge = "x".repeat(2_000_000);

    const kitchen = staffKitchenFrom(
      wireKitchen({
        kitchen: { name: huge },
        client: { email: huge, name: huge, phone: huge },
        request: { reference: huge, sentAt: MOMENT },
      }),
    );

    expect(kitchen?.kitchen.name?.length).toBe(huge.length);
    expect(kitchen?.client?.phone?.length).toBe(huge.length);
    expect(kitchen?.request?.reference.length).toBe(huge.length);
  });
});
