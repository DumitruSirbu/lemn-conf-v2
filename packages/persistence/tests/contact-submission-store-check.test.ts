import { fc, test as propertyTest } from "@fast-check/vitest";
import { validateContactSubmission } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  judgeSubmission,
  requireValidClientRequestId,
  requireValidLookup,
  requireValidReference,
  requireValidSubmission,
} from "../src/contact-submission-store.js";
import type { ContactSubmissionToRecord } from "../src/contact-submission-store.js";
import {
  DIGEST_A,
  FAKE_DESIGN_ID,
  FAKE_SNAPSHOT,
  aCallbackSubmission,
  aDesignSubmission,
} from "./support/contact-submission-fixtures.js";

const CLIENT_REQUEST_ID = "check-test-client-request-id";
/** Text no refusal may repeat. It sits in the part under test, so a message that quoted its value would hold it. */
const MARKER = "LEAKED-MARKER-7f3a";

const designWithRevision = (revision: string): ContactSubmissionToRecord => {
  const design = aDesignSubmission(CLIENT_REQUEST_ID);
  return {
    ...design,
    target: { kind: "design", design: { id: FAKE_DESIGN_ID, revision } },
  };
};

const REFUSED_PARTS: readonly (readonly [
  string,
  ContactSubmissionToRecord,
  RegExp,
])[] = [
  [
    "a client request id of the wrong shape",
    aDesignSubmission(`${MARKER} spaces`),
    /client request id/,
  ],
  [
    "a client request id that is too short",
    aDesignSubmission("short"),
    /client request id/,
  ],
  [
    "a digest that is not lowercase hex",
    aDesignSubmission(CLIENT_REQUEST_ID, MARKER),
    /digest/,
  ],
  [
    "a contact field that is not text",
    withContact({ name: 7 as unknown as string }),
    /contact's name/,
  ],
  [
    "an e-mail on a channel that is not e-mail",
    withContact({ channel: "phone", email: MARKER }),
    /e-mail/,
  ],
  [
    "no e-mail on the e-mail channel",
    withContact({ email: undefined }),
    /e-mail/,
  ],
  [
    "a locale that is not text",
    { ...aDesignSubmission(CLIENT_REQUEST_ID), locale: 3 as unknown as string },
    /locale/,
  ],
  [
    "a design without its snapshot",
    { ...aDesignSubmission(CLIENT_REQUEST_ID), snapshot: undefined },
    /snapshot/,
  ],
  [
    "a callback with a snapshot",
    { ...aCallbackSubmission(CLIENT_REQUEST_ID), snapshot: FAKE_SNAPSHOT },
    /snapshot/,
  ],
  [
    "a snapshot whose document is a JSON string",
    withSnapshot({ document: JSON.stringify(JSON.stringify({ k: MARKER })) }),
    /JSON object/,
  ],
  [
    "a snapshot whose document is not JSON",
    withSnapshot({ document: MARKER }),
    /JSON object/,
  ],
  [
    "a snapshot whose document is an array",
    withSnapshot({ document: JSON.stringify([MARKER]) }),
    /JSON object/,
  ],
  [
    "a snapshot whose priced design is not an object",
    withSnapshot({
      priced: [MARKER] as unknown as typeof FAKE_SNAPSHOT.priced,
    }),
    /JSON object/,
  ],
  [
    "a target with neither a design nor an intent",
    {
      ...aDesignSubmission(CLIENT_REQUEST_ID),
      target: { kind: "design" } as never,
    },
    /exactly one/,
  ],
  [
    "a target with both a design and an intent",
    {
      ...aDesignSubmission(CLIENT_REQUEST_ID),
      target: {
        kind: "design",
        design: { id: FAKE_DESIGN_ID, revision: "1" },
        intent: "callback",
      } as never,
    },
    /exactly one/,
  ],
  [
    "an intent nobody knows",
    {
      ...aCallbackSubmission(CLIENT_REQUEST_ID),
      target: { kind: "intent", intent: MARKER } as never,
    },
    /exactly one/,
  ],
  [
    "a design id that is empty",
    {
      ...aDesignSubmission(CLIENT_REQUEST_ID),
      target: { kind: "design", design: { id: "", revision: "1" } },
    },
    /design id/,
  ],
  [
    "a revision above the column's widest value",
    designWithRevision("9223372036854775808"),
    /revision/,
  ],
  ["a revision with a leading zero", designWithRevision("01"), /revision/],
  ["a revision of zero", designWithRevision("0"), /revision/],
  ["a revision that is not a number", designWithRevision(MARKER), /revision/],
];

function withContact(
  changes: Partial<ContactSubmissionToRecord["contact"]>,
): ContactSubmissionToRecord {
  const design = aDesignSubmission(CLIENT_REQUEST_ID);
  return { ...design, contact: { ...design.contact, ...changes } };
}

function withSnapshot(
  changes: Partial<typeof FAKE_SNAPSHOT>,
): ContactSubmissionToRecord {
  return {
    ...aDesignSubmission(CLIENT_REQUEST_ID),
    snapshot: { ...FAKE_SNAPSHOT, ...changes },
  };
}

function thrownBy(action: () => void): Error {
  try {
    action();
  } catch (error) {
    if (error instanceof Error) return error;
  }
  throw new Error("the check did not refuse");
}

describe("the shared check of a request the table would refuse", () => {
  it.each(REFUSED_PARTS)(
    "refuses %s, naming the part",
    (_name, submission, partName) => {
      expect(
        thrownBy(() => {
          requireValidSubmission(submission);
        }).message,
      ).toMatch(partName);
    },
  );

  it.each(REFUSED_PARTS)(
    "holds no value of the request when it refuses %s",
    (_name, submission) => {
      const refusal = thrownBy(() => {
        requireValidSubmission(submission);
      });

      expect(refusal.message).not.toContain(MARKER);
      expect(refusal.message).not.toContain(CLIENT_REQUEST_ID);
      expect(refusal.message).not.toContain(FAKE_DESIGN_ID);
      expect(refusal.cause).toBeUndefined();
    },
  );

  it("accepts a design and a callback", () => {
    expect(() => {
      requireValidSubmission(aDesignSubmission(CLIENT_REQUEST_ID));
    }).not.toThrow();
    expect(() => {
      requireValidSubmission(aCallbackSubmission(CLIENT_REQUEST_ID));
    }).not.toThrow();
  });

  it.each([["1"], ["9223372036854775807"], ["1000000000000000000"]])(
    "accepts the revision %s, up to the column's widest value",
    (revision) => {
      expect(() => {
        requireValidSubmission(designWithRevision(revision));
      }).not.toThrow();
    },
  );

  it("refuses a lookup by a digest that is not a digest, saying nothing of its value", () => {
    const refusal = thrownBy(() => {
      requireValidLookup({
        clientRequestId: CLIENT_REQUEST_ID,
        payloadDigest: MARKER,
      });
    });

    expect(refusal.message).toMatch(/digest/);
    expect(refusal.message).not.toContain(MARKER);
  });

  it("refuses a reference outside the table's check, and accepts its edges", () => {
    for (const reference of [
      "",
      "LM-1",
      "lm-ABCDEFGH",
      "A".repeat(33),
      "LM-ABC DEF",
    ]) {
      expect(() => {
        requireValidReference(reference);
      }).toThrow(/reference must be/);
    }
    for (const reference of ["ABCDEF", "A".repeat(32), "LM-0000-0000"]) {
      expect(() => {
        requireValidReference(reference);
      }).not.toThrow();
    }
  });
});

const ID_CHARACTERS = [
  "a",
  "b",
  "c",
  "X",
  "Y",
  "Z",
  "0",
  "1",
  "9",
  "_",
  "-",
  " ",
  "+",
  ".",
  "\n",
  "é",
];
const idLike = fc.string({
  unit: fc.constantFrom(...ID_CHARACTERS),
  maxLength: 70,
});

function isAcceptedByTheDomain(clientRequestId: string): boolean {
  const validation = validateContactSubmission(
    {
      contact: {
        name: "Zorba Fakeperson",
        phone: "+37369123456",
        locality: "",
        channel: "phone",
        consent: true,
        consentTextVersion: "placeholder",
      },
      intent: "callback",
      clientRequestId,
      locale: "ro",
      elapsedMs: 5000,
    },
    ["ro"],
  );
  return validation.ok;
}

function isAcceptedByTheStore(clientRequestId: string): boolean {
  try {
    requireValidClientRequestId(clientRequestId);
    return true;
  } catch {
    return false;
  }
}

describe("the domain's client request id and the store's", () => {
  it("meet on an id of the width's edges, so the property below reaches both arms", () => {
    expect(
      [
        CLIENT_REQUEST_ID,
        "x".repeat(16),
        "x".repeat(64),
        "x".repeat(15),
        "x".repeat(65),
      ].map(isAcceptedByTheDomain),
    ).toEqual([true, true, true, false, false]);
  });

  propertyTest.prop([idLike])(
    "agree on any string made of id-like characters",
    (text) => {
      expect(isAcceptedByTheStore(text)).toBe(isAcceptedByTheDomain(text));
    },
  );

  propertyTest.prop([fc.string({ maxLength: 70 })])(
    "agree on any string",
    (text) => {
      expect(isAcceptedByTheStore(text)).toBe(isAcceptedByTheDomain(text));
    },
  );

  it("accepts a look-up by an id of the domain's shape and the fixture's digest", () => {
    expect(() => {
      requireValidLookup({
        clientRequestId: CLIENT_REQUEST_ID,
        payloadDigest: DIGEST_A,
      });
    }).not.toThrow();
  });
});

const OWN_REFUSAL = "Refusing to use the contact submission store";
const DEPTH_BOUND = 64;

function submissionWith(
  document: unknown,
  priced: unknown,
): ContactSubmissionToRecord {
  return {
    ...aDesignSubmission(CLIENT_REQUEST_ID),
    snapshot: {
      document: document as string,
      priced: priced as typeof FAKE_SNAPSHOT.priced,
    },
  };
}

/** `returned`, or the check's own refusal, or the name of whatever else was thrown: only the first two are allowed. */
function outcomeOfTheCheck(submission: ContactSubmissionToRecord): string {
  try {
    requireValidSubmission(submission);
    return "returned";
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(OWN_REFUSAL)) {
      return error.message;
    }
    return `something else: ${error instanceof Error ? error.name : typeof error}`;
  }
}

/** A document of `levels` levels: the root object holding lists inside lists. */
function listsNestedTo(levels: number): string {
  return `{"a":${"[".repeat(levels - 1)}${"]".repeat(levels - 1)}}`;
}

/** A document of `levels` levels of objects inside objects, the innermost empty. */
function objectsNestedTo(levels: number): string {
  return `${'{"a":'.repeat(levels - 1)}{}${"}".repeat(levels - 1)}`;
}

/** A value of `levels` nested plain objects, the outermost the first level. */
function valueNestedToLevels(levels: number): object {
  let value: object = {};
  for (let level = 1; level < levels; level += 1) value = { a: value };
  return value;
}

describe("the depth bound of a snapshot", () => {
  it.each([
    ["lists", listsNestedTo],
    ["objects", objectsNestedTo],
  ])(
    "accepts a document of 64 levels of %s and refuses 65, under its own sentence",
    (_name, nestedTo) => {
      expect(
        outcomeOfTheCheck(
          submissionWith(nestedTo(DEPTH_BOUND), FAKE_SNAPSHOT.priced),
        ),
      ).toBe("returned");
      expect(
        outcomeOfTheCheck(
          submissionWith(nestedTo(DEPTH_BOUND + 1), FAKE_SNAPSHOT.priced),
        ),
      ).toMatch(/no deeper than 64 levels/);
    },
  );

  it("accepts a priced design of 64 levels and refuses 65, under its own sentence", () => {
    expect(
      outcomeOfTheCheck(
        submissionWith(
          FAKE_SNAPSHOT.document,
          valueNestedToLevels(DEPTH_BOUND),
        ),
      ),
    ).toBe("returned");
    expect(
      outcomeOfTheCheck(
        submissionWith(
          FAKE_SNAPSHOT.document,
          valueNestedToLevels(DEPTH_BOUND + 1),
        ),
      ),
    ).toMatch(/no deeper than 64 levels/);
  });

  it("counts a bracket inside a string as text and not as a level", () => {
    const brackets = "[".repeat(200);

    expect(
      outcomeOfTheCheck(
        submissionWith(
          JSON.stringify({ note: brackets, "[[[[": '"\\"[' }),
          FAKE_SNAPSHOT.priced,
        ),
      ),
    ).toBe("returned");
  });

  it.each([
    [
      "a document of lists",
      () => submissionWith(listsNestedTo(100_000), FAKE_SNAPSHOT.priced),
    ],
    [
      "a document of objects",
      () =>
        submissionWith(
          `${'{"a":'.repeat(100_000)}1${"}".repeat(100_000)}`,
          FAKE_SNAPSHOT.priced,
        ),
    ],
    [
      "a priced design",
      () =>
        submissionWith(FAKE_SNAPSHOT.document, valueNestedToLevels(100_000)),
    ],
    [
      "a priced design that holds itself twice",
      () => {
        const cyclic: Record<string, unknown> = {};
        cyclic["a"] = cyclic;
        cyclic["b"] = cyclic;
        return submissionWith(FAKE_SNAPSHOT.document, cyclic);
      },
    ],
  ])(
    "refuses %s a hundred thousand levels deep with the check's own refusal and nothing else",
    (_name, build) => {
      expect(outcomeOfTheCheck(build())).toMatch(/no deeper than 64 levels/);
    },
  );
});

describe("the document equals its own encoding", () => {
  it.each([
    ["a number written with a needless fraction", '{"n":1.0}'],
    ["a number past a double's reach", '{"n":9007199254740993}'],
    ["a number written with an exponent", '{"n":1e2}'],
    ["a key written twice", '{"a":1,"a":2}'],
    ["a space after a colon", '{"a": 1}'],
    ["a line feed around it", '\n{"a":1}'],
    ["an escape that is not needed", '{"a":"\\u0041"}'],
  ])("refuses a document with %s, and never rewrites it", (_name, document) => {
    expect(
      outcomeOfTheCheck(submissionWith(document, FAKE_SNAPSHOT.priced)),
    ).toMatch(/JSON object/);
  });

  it.each([
    [
      "an object of every kind of value",
      '{"a":1,"b":[1,2.5,-3],"c":"x","d":true,"e":null,"f":{}}',
    ],
    ["text with a character outside ASCII", JSON.stringify({ name: "Zoë 👩‍🍳" })],
    [
      "a number as an encoder writes it",
      JSON.stringify({ n: 1e21, m: 0.1, z: -0 }),
    ],
    ["the fixture's own document", FAKE_SNAPSHOT.document],
  ])("accepts %s, and sends the text that was handed in", (_name, document) => {
    const judged = judgeSubmission(
      submissionWith(document, FAKE_SNAPSHOT.priced),
    );

    expect(judged.snapshotJson?.document).toBe(document);
  });
});

function aListWithAHole(): unknown[] {
  const list: unknown[] = [];
  list[1] = 1;
  return list;
}

describe("the priced design is walked as a value", () => {
  const priced = FAKE_SNAPSHOT.priced;

  it.each([
    ["a number that is not a number", { ...priced, totalMinor: Number.NaN }],
    ["an infinity", { ...priced, totalMinor: Number.POSITIVE_INFINITY }],
    ["a bigint", { ...priced, totalMinor: 7n }],
    ["a function", { ...priced, totalMinor: () => 7 }],
    ["a symbol", { ...priced, totalMinor: Symbol("total") }],
    ["a Date", { ...priced, pricingVersion: new Date(0) }],
    [
      "an object that is not plain",
      {
        ...priced,
        pricingVersion: new (class Version {
          readonly label = "version";
        })(),
      },
    ],
    ["a list holding undefined", { ...priced, lines: [undefined] }],
    ["a list with a hole in it", { ...priced, lines: aListWithAHole() }],
    ["an object with a toJSON", { ...priced, toJSON: () => ({}) }],
  ])(
    "refuses a price holding %s, saying nothing of the rest of it",
    (_name, value) => {
      const outcome = outcomeOfTheCheck(
        submissionWith(FAKE_SNAPSHOT.document, {
          note: MARKER,
          ...(value as object),
          value,
        }),
      );

      expect(outcome).toMatch(/JSON object/);
      expect(outcome).not.toContain(MARKER);
    },
  );

  it.each([
    ["a Date", new Date(0)],
    ["a list", [priced]],
    ["text", MARKER],
  ])("refuses %s as the whole price", (_name, value) => {
    const outcome = outcomeOfTheCheck(
      submissionWith(FAKE_SNAPSHOT.document, value),
    );

    expect(outcome).toMatch(/JSON object/);
    expect(outcome).not.toContain(MARKER);
  });

  it("leaves out an object's member that is undefined, as the type's optional fields are, and encodes once", () => {
    const withUndefinedMember = { ...priced, optional: undefined };

    const judged = judgeSubmission(
      submissionWith(FAKE_SNAPSHOT.document, withUndefinedMember),
    );

    expect(judged.snapshotJson?.priced).toBe(JSON.stringify(priced));
  });

  it("accepts every kind it allows, and sends what the encoder makes of the value", () => {
    const allowed = {
      text: "x",
      count: 3,
      fraction: 0.5,
      yes: true,
      nothing: null,
      list: [1, [2], { a: "b" }],
      deep: { a: { b: {} } },
    };

    const judged = judgeSubmission(
      submissionWith(FAKE_SNAPSHOT.document, allowed),
    );

    expect(judged.snapshotJson?.priced).toBe(JSON.stringify(allowed));
  });
});

describe("the check returns or throws its own refusal, whatever the document and the price", () => {
  const priceLikeValues = fc.oneof(fc.anything(), fc.jsonValue());
  const documentLikeTexts = fc.oneof(
    fc.string(),
    fc.json(),
    fc.jsonValue().map((value) => JSON.stringify(value)),
  );

  propertyTest.prop([documentLikeTexts, priceLikeValues])(
    "for any text and any value, and never anything else",
    (document, price) => {
      expect(outcomeOfTheCheck(submissionWith(document, price))).toMatch(
        /^returned$|^Refusing to use the contact submission store/,
      );
    },
  );
});

describe("a part of the request that is not an object", () => {
  const marker = MARKER;
  const NOT_AN_OBJECT: readonly (readonly [string, unknown])[] = [
    ["text", marker],
    ["a number", 7],
    ["null", null],
    ["a list holding text", [marker]],
    ["a boolean", true],
  ];
  const design = aDesignSubmission(CLIENT_REQUEST_ID);

  const PARTS: readonly (readonly [
    string,
    (value: unknown) => ContactSubmissionToRecord,
    RegExp,
  ])[] = [
    [
      "the contact",
      (value) => ({ ...design, contact: value as never }),
      /contact/,
    ],
    [
      "the target",
      (value) => ({ ...design, target: value as never }),
      /target/,
    ],
    [
      "the target's design",
      (value) => ({
        ...design,
        target: { kind: "design", design: value } as never,
      }),
      /design/,
    ],
    [
      "the snapshot",
      (value) => ({ ...design, snapshot: value as never }),
      /snapshot/,
    ],
  ];

  describe.each(PARTS)("as %s", (_part, place, named) => {
    it.each(NOT_AN_OBJECT)(
      "refuses %s with the part's own refusal and holds nothing of it",
      (_name, value) => {
        const outcome = outcomeOfTheCheck(place(value));

        expect(outcome.startsWith(OWN_REFUSAL)).toBe(true);
        expect(outcome).toMatch(named);
        expect(outcome).not.toContain(marker);
      },
    );
  });
});

describe("a part whose member read throws", () => {
  const THROWN_TEXT = `${MARKER} thrown by a getter`;

  function throwing(): never {
    throw Object.assign(new Error(THROWN_TEXT), { detail: THROWN_TEXT });
  }

  /** An object of the given shape in which `member` is a getter that throws. */
  function withThrowingMember<Shape extends object>(
    shape: Shape,
    member: string,
  ): Shape {
    return Object.defineProperty({ ...shape }, member, {
      enumerable: true,
      get: throwing,
    });
  }

  const design = aDesignSubmission(CLIENT_REQUEST_ID);
  const PLACES: readonly (readonly [
    string,
    () => ContactSubmissionToRecord,
  ])[] = [
    [
      "the submission's contact",
      () => ({
        ...design,
        contact: withThrowingMember(design.contact, "name"),
      }),
    ],
    [
      "the submission's target",
      () => ({ ...design, target: withThrowingMember(design.target, "kind") }),
    ],
    [
      "a design's reference",
      () => ({
        ...design,
        target: {
          kind: "design",
          design: withThrowingMember(
            { id: FAKE_DESIGN_ID, revision: "7" },
            "revision",
          ),
        },
      }),
    ],
    [
      "the snapshot",
      () => ({
        ...design,
        snapshot: withThrowingMember(FAKE_SNAPSHOT, "document"),
      }),
    ],
    ["the submission itself", () => withThrowingMember(design, "locale")],
    [
      "a proxy that throws on every read",
      () =>
        new Proxy(design, {
          get: throwing,
          has: throwing,
          ownKeys: throwing,
        }),
    ],
  ];

  it.each(PLACES)(
    "is the refusal of the request when %s throws, keeping nothing of what was thrown",
    (_place, build) => {
      let refusal: unknown;
      try {
        requireValidSubmission(build());
      } catch (thrown) {
        refusal = thrown;
      }

      expect(refusal).toBeInstanceOf(Error);
      expect((refusal as Error).message).toMatch(
        /plain data whose members can be read/,
      );
      expect((refusal as Error).message).not.toContain(MARKER);
      expect((refusal as Error).cause).toBeUndefined();
      expect(Object.getOwnPropertyNames(refusal)).not.toContain("detail");
    },
  );

  it.each([
    ["the client request id", "clientRequestId"],
    ["the digest", "payloadDigest"],
  ])(
    "is the refusal of the request when %s of a look-up throws",
    (_name, member) => {
      const request = withThrowingMember(
        { clientRequestId: CLIENT_REQUEST_ID, payloadDigest: DIGEST_A },
        member,
      );

      const outcome = (() => {
        try {
          requireValidLookup(request);
          return "returned";
        } catch (thrown) {
          return thrown instanceof Error ? thrown.message : "not an error";
        }
      })();

      expect(outcome).toMatch(/plain data whose members can be read/);
      expect(outcome).not.toContain(MARKER);
    },
  );

  it("is the refusal of the request when the whole request is null", () => {
    expect(
      outcomeOfTheCheck(null as unknown as ContactSubmissionToRecord),
    ).toMatch(/plain data whose members can be read/);
  });

  it.each([
    ["text", MARKER],
    ["a number", 7],
  ])(
    "is a refusal of the check, holding nothing of it, when the whole request is %s",
    (_name, value) => {
      const outcome = outcomeOfTheCheck(
        value as unknown as ContactSubmissionToRecord,
      );

      expect(outcome.startsWith(OWN_REFUSAL)).toBe(true);
      expect(outcome).not.toContain(MARKER);
    },
  );

  it("leaves a refusal the check already makes as it is, with its own sentence", () => {
    expect(outcomeOfTheCheck({ ...design, clientRequestId: "short" })).toMatch(
      /client request id/,
    );
    expect(
      outcomeOfTheCheck({ ...design, payloadDigest: "not a digest" }),
    ).toMatch(/64-character lowercase hex/);
  });

  it("is not fooled by a thrown error that carries the check's own words", () => {
    const impostor = () => {
      throw new Error(
        "Refusing to use the contact submission store: a value of its own.",
      );
    };
    const request = Object.defineProperty({ ...design }, "locale", {
      enumerable: true,
      get: impostor,
    });

    expect(outcomeOfTheCheck(request)).toMatch(
      /plain data whose members can be read/,
    );
  });

  describe("a thrown value whose every trap throws", () => {
    const TRAPS = [
      "apply",
      "construct",
      "defineProperty",
      "deleteProperty",
      "get",
      "getOwnPropertyDescriptor",
      "getPrototypeOf",
      "has",
      "isExtensible",
      "ownKeys",
      "preventExtensions",
      "set",
      "setPrototypeOf",
    ] as const;

    /** A proxy over a function, so that `apply` and `construct` are traps too, and every one of them throws. */
    function proxyWhoseEveryTrapThrows(): object {
      const handler = Object.fromEntries(
        TRAPS.map((trap) => [trap, throwing]),
      ) as ProxyHandler<() => void>;
      return new Proxy(() => undefined, handler);
    }

    function throwingTheProxy(): never {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- a thrown value may be anything.
      throw proxyWhoseEveryTrapThrows();
    }

    it("is the refusal of the request at the submission's entry, without one trap run", () => {
      const submission = Object.defineProperty({ ...design }, "locale", {
        enumerable: true,
        get: throwingTheProxy,
      });

      const outcome = outcomeOfTheCheck(submission);

      expect(outcome).toMatch(/plain data whose members can be read/);
      expect(outcome).not.toContain(MARKER);
    });

    it("is the refusal of the request at the look-up's entry, without one trap run", () => {
      const request = Object.defineProperty(
        { clientRequestId: CLIENT_REQUEST_ID, payloadDigest: DIGEST_A },
        "payloadDigest",
        { enumerable: true, get: throwingTheProxy },
      );

      let message: unknown;
      try {
        requireValidLookup(request);
      } catch (thrown) {
        message = thrown instanceof Error ? thrown.message : "not an error";
      }

      expect(message).toMatch(/plain data whose members can be read/);
    });
  });
});
