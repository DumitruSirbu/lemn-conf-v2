import { fc, test as propertyTest } from "@fast-check/vitest";
import {
  canonicalSerializeDesign,
  validateContactSubmission,
} from "@lemnaria/configurator-domain";
import type { Design } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  judgeSubmission,
  requireValidClientRequestId,
  requireValidLookup,
  requireValidReference,
  requireValidSubmission,
} from "../src/contact-submission-store.js";
import type { ContactSubmissionToRecord } from "../src/contact-submission-store.js";
import { FakeContactSubmissionStore } from "../src/fake-contact-submission-store.js";
import { generateDesignId } from "../src/generate-design-id.js";
import { requireSha256Digest } from "../src/sha256-digest.js";
import {
  DIGEST_A,
  FAKE_DESIGN_ID,
  FAKE_SNAPSHOT,
  aCallbackSubmission,
  aDesignSubmission,
} from "./support/contact-submission-fixtures.js";
import {
  POISON_MARKER,
  cleanJsonObject,
  objectHoldingUnstorableText,
  textHoldingAnOverflowingNumber,
} from "./support/qa-8i-json-arbitraries.js";
import { REAL_SNAPSHOTS, levelsOf } from "./support/qa-8i-real-snapshots.js";
import { markersFoundOn } from "./support/leaked-connection-markers.js";
import { rejectionOf } from "./support/rejection-of.js";
import { privilegesHeldWithGrantOption } from "./support/table-privileges.js";

/**
 * The shared check of a contact submission under attack, with no database: the table's edges, values that are not
 * text, parts that are not objects, text Postgres cannot hold, and a snapshot's document and priced design. It also
 * holds what only a unit test can show of the fake's draws and of the grant-option question.
 */
const CLIENT_REQUEST_ID = "qa-8i-check-test-request-id";
const LARGEST_REVISION = 9_223_372_036_854_775_807n;
const WIDEST_NINETEEN_DIGITS = 9_999_999_999_999_999_999n;
/** Text no refusal may repeat. */
const MARKER = "QA8I-LEAKED-MARKER";
const CHECKS_OWN_OPENING = "Refusing to use the contact submission store";
const CHECKS_OWN_REFUSAL = /^Refusing to use the contact submission store/;

const NOTHING_THROWN = Symbol("nothing thrown");

function thrownBy(act: () => void): unknown {
  try {
    act();
    return NOTHING_THROWN;
  } catch (thrown) {
    return thrown;
  }
}

/** The message of what `act` threw, `undefined` when it threw nothing. */
function messageThrownBy(act: () => void): string | undefined {
  const thrown = thrownBy(act);
  if (thrown === NOTHING_THROWN) return undefined;
  return thrown instanceof Error ? thrown.message : "a non-error throw";
}

/** What `act` threw; a test that expected a throw fails when there was none. */
function caughtFrom(act: () => void): unknown {
  const thrown = thrownBy(act);
  if (thrown === NOTHING_THROWN) throw new Error("nothing was thrown");
  return thrown;
}

function withRevision(revision: unknown): ContactSubmissionToRecord {
  return {
    ...aDesignSubmission(CLIENT_REQUEST_ID),
    target: {
      kind: "design",
      design: { id: FAKE_DESIGN_ID, revision: revision as string },
    },
  };
}

function withSnapshot(
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

describe("the shared check at the table's edges", () => {
  it.each([
    [15, false],
    [16, true],
    [64, true],
    [65, false],
  ])("judges a client request id of %i characters", (length, isAccepted) => {
    const refusal = messageThrownBy(() => {
      requireValidClientRequestId("x".repeat(length));
    });

    expect(refusal === undefined).toBe(isAccepted);
  });

  it.each([
    ["0", false],
    ["1", true],
    ["9223372036854775807", true],
    ["9223372036854775808", false],
    ["9999999999999999999", false],
    ["10000000000000000000", false],
    ["01", false],
    ["-1", false],
    ["1.0", false],
    ["1e3", false],
    [" 1", false],
    ["1\n", false],
    ["", false],
    ["١", false],
  ])("judges a revision of %j", (revision, isAccepted) => {
    const refusal = messageThrownBy(() => {
      requireValidSubmission(withRevision(revision));
    });

    expect(refusal === undefined).toBe(isAccepted);
  });

  it.each([
    [5, false],
    [6, true],
    [32, true],
    [33, false],
  ])("judges a reference of %i characters", (length, isAccepted) => {
    const refusal = messageThrownBy(() => {
      requireValidReference("A".repeat(length));
    });

    expect(refusal === undefined).toBe(isAccepted);
  });

  it.each([
    ["a".repeat(63)],
    ["a".repeat(65)],
    [`${"a".repeat(63)}g`],
    [`${"a".repeat(64)}\n`],
    [`\n${"a".repeat(64)}`],
    [""],
  ])("refuses a digest that is not sixty-four lowercase hex: %j", (digest) => {
    const refusal = messageThrownBy(() => {
      requireValidLookup({
        clientRequestId: CLIENT_REQUEST_ID,
        payloadDigest: digest,
      });
    });

    expect(refusal).toMatch(/digest/);
  });

  it.each([
    ["an id with a line feed after it", `${"x".repeat(16)}\n`],
    ["an id with a line feed before it", `\n${"x".repeat(16)}`],
    ["an id holding a NUL", `${"x".repeat(8)}\u0000${"x".repeat(8)}`],
    ["an id holding a letter outside ASCII", `${"x".repeat(15)}é`],
    ["an id holding a full stop", `${"x".repeat(15)}.`],
  ])("refuses %s", (_name, id) => {
    expect(
      messageThrownBy(() => {
        requireValidClientRequestId(id);
      }),
    ).toMatch(/client request id/);
  });

  it.each([
    ["a JSON string", JSON.stringify(MARKER)],
    ["an object encoded twice", JSON.stringify(JSON.stringify({ a: MARKER }))],
    ["a JSON array", JSON.stringify([MARKER])],
    ["a JSON number", "7"],
    ["a JSON null", "null"],
    ["a JSON true", "true"],
    ["empty text", ""],
    ["text that is not JSON", `{${MARKER}`],
    ["two objects", "{}{}"],
    ["an object that is not text", { marker: MARKER }],
  ])(
    "refuses a document that is %s, saying nothing of it",
    (_name, document) => {
      const refusal = messageThrownBy(() => {
        requireValidSubmission(withSnapshot(document, FAKE_SNAPSHOT.priced));
      });

      expect(refusal).toMatch(/JSON object/);
      expect(refusal).not.toContain(MARKER);
    },
  );

  it.each([
    ["an array", [MARKER]],
    ["null", null],
    ["text", MARKER],
    ["a number", 7],
    ["undefined", undefined],
  ])(
    "refuses a priced design that is %s, saying nothing of it",
    (_name, priced) => {
      const refusal = messageThrownBy(() => {
        requireValidSubmission(withSnapshot(FAKE_SNAPSHOT.document, priced));
      });

      expect(refusal).toMatch(/JSON object/);
      expect(refusal).not.toContain(MARKER);
    },
  );
});

describe("the shared check of a value that is not text", () => {
  const sixteenDigits = 1_234_567_890_123_456;

  it.each([
    ["a number of sixteen digits", sixteenDigits],
    ["a list of one id", [CLIENT_REQUEST_ID]],
    ["an object that prints as an id", { toString: () => CLIENT_REQUEST_ID }],
  ])("refuses a client request id that is %s", (_name, id) => {
    expect(
      messageThrownBy(() => {
        requireValidClientRequestId(id as unknown as string);
      }),
    ).toMatch(/client request id/);
  });

  it("refuses a digest that is a list of one digest", () => {
    expect(
      messageThrownBy(() => {
        requireValidLookup({
          clientRequestId: CLIENT_REQUEST_ID,
          payloadDigest: [DIGEST_A] as unknown as string,
        });
      }),
    ).toMatch(/digest/);
  });

  it("refuses a reference that is a list of one reference", () => {
    expect(
      messageThrownBy(() => {
        requireValidReference(["LM-AAAAAAAA"] as unknown as string);
      }),
    ).toMatch(/reference/);
  });

  it("refuses a revision that is a number or a list, which the column would take", () => {
    expect(
      [7, [7], ["7"], 7n].map((revision) =>
        (
          messageThrownBy(() => {
            requireValidSubmission(withRevision(revision));
          }) ?? ""
        ).includes("revision"),
      ),
    ).toEqual([true, true, true, true]);
  });

  it("leaves the fake refusing a request recorded under a number, so it is never held under a key its text cannot find", async () => {
    const store = new FakeContactSubmissionStore();

    const refusal = await rejectionOf(
      store.record(aCallbackSubmission(sixteenDigits as unknown as string)),
    );

    expect((refusal as Error).message).toMatch(/client request id/);
    expect(store.heldSubmissions()).toEqual([]);
  });
});

/** A contact the domain accepts: a channel with the e-mail it needs, or with one typed that the domain drops. */
const acceptedChannel = fc.constantFrom(
  { channel: "phone" },
  { channel: "phone", email: "typed.and.dropped@example.invalid" },
  { channel: "phone", email: "not an e-mail" },
  { channel: "whatsapp" },
  { channel: "whatsapp", email: "" },
  { channel: "email", email: "zorba.fakeperson@example.invalid" },
);

const DESIGN_ID = generateDesignId();

interface RawTarget {
  readonly intent?: string;
  readonly design?: { readonly id: string; readonly revision: string };
}

const designAtRevision = (revision: bigint): RawTarget => ({
  design: { id: DESIGN_ID, revision: String(revision) },
});

/** A target the revision column holds: a callback, or a design at a revision up to the widest `bigint`. */
const targetThatFitsTheColumn: fc.Arbitrary<RawTarget> = fc.oneof(
  fc.constant({ intent: "callback" }),
  fc.bigInt({ min: 1n, max: LARGEST_REVISION }).map(designAtRevision),
  fc.constantFrom(1n, LARGEST_REVISION).map(designAtRevision),
);

/** A design at a revision the domain's nineteen digits admit and the column does not hold. */
const targetPastTheColumn: fc.Arbitrary<RawTarget> = fc.oneof(
  fc
    .bigInt({ min: LARGEST_REVISION + 1n, max: WIDEST_NINETEEN_DIGITS })
    .map(designAtRevision),
  fc
    .constantFrom(LARGEST_REVISION + 1n, WIDEST_NINETEEN_DIGITS)
    .map(designAtRevision),
);

function requestTheDomainAccepts(target: fc.Arbitrary<RawTarget>) {
  return fc.record({
    name: fc.stringMatching(/^[A-Za-z][A-Za-z .'-]{0,40}[A-Za-z]$/),
    locality: fc.stringMatching(/^[A-Za-z0-9 ,.-]{0,60}$/),
    contact: acceptedChannel,
    target,
    clientRequestId: fc.stringMatching(/^[A-Za-z0-9_-]{16,64}$/),
  });
}

type RawRequest =
  ReturnType<typeof requestTheDomainAccepts> extends fc.Arbitrary<infer Raw>
    ? Raw
    : never;

/** What the shared check says of `raw` once the domain has validated it; the domain's refusal fails the test. */
function checksVerdictOnTheValidated(raw: RawRequest): string | undefined {
  const validation = validateContactSubmission(
    {
      contact: {
        name: raw.name,
        phone: "+37369123456",
        locality: raw.locality,
        ...raw.contact,
        consent: true,
        consentTextVersion: "placeholder",
      },
      ...raw.target,
      clientRequestId: raw.clientRequestId,
      locale: "ro",
      elapsedMs: 5000,
    },
    ["ro"],
  );
  if (!validation.ok) {
    throw new Error("the domain refused a request built to be accepted");
  }
  const { contact, target, clientRequestId, locale } = validation.request;
  return messageThrownBy(() => {
    requireValidSubmission({
      clientRequestId,
      payloadDigest: DIGEST_A,
      contact,
      locale,
      target,
      snapshot: target.kind === "design" ? FAKE_SNAPSHOT : undefined,
    });
  });
}

describe("what the domain's validation accepts", () => {
  propertyTest.prop([requestTheDomainAccepts(targetThatFitsTheColumn)])(
    "is accepted by the shared check, for every channel and for a callback or a design the revision column holds",
    (raw) => {
      expect(checksVerdictOnTheValidated(raw)).toBeUndefined();
    },
  );

  propertyTest.prop([requestTheDomainAccepts(targetPastTheColumn)])(
    "is refused by the shared check as the revision, when the design's revision is past the column",
    (raw) => {
      expect(checksVerdictOnTheValidated(raw)).toMatch(/revision/);
    },
  );
});

describe("the shared check of a part that is not an object", () => {
  type Part = readonly [
    name: string,
    placed: (value: unknown) => ContactSubmissionToRecord,
    itsOwnRefusal: RegExp,
    aListsRefusal: RegExp,
  ];

  const design = (): ContactSubmissionToRecord =>
    aDesignSubmission(CLIENT_REQUEST_ID);

  const PARTS: readonly Part[] = [
    [
      "the contact",
      (value) => ({ ...design(), contact: value as never }),
      /the contact must be an object/,
      /the contact's name must be text/,
    ],
    [
      "the target",
      (value) => ({ ...design(), target: value as never }),
      /the target must name a design or an intent/,
      /the target must name a design or an intent/,
    ],
    [
      "the target's design",
      (value) => ({
        ...design(),
        target: { kind: "design", design: value as never },
      }),
      /the target's design must be an object/,
      /the design id must be text/,
    ],
    [
      "the snapshot",
      (value) => ({ ...design(), snapshot: value as never }),
      /a design is stored with its snapshot, an object/,
      /the snapshot's document must be a JSON object/,
    ],
  ];

  describe.each(PARTS)("%s", (_name, placed, itsOwnRefusal, aListsRefusal) => {
    it.each([
      ["text", MARKER],
      ["a number", 7],
      ["null", null],
      ["a true", true],
      ["a symbol", Symbol(MARKER)],
    ])(
      "is refused as that part when it is %s, with nothing of it in the refusal",
      (_kind, value) => {
        const refusal = messageThrownBy(() => {
          requireValidSubmission(placed(value));
        });

        expect(refusal).toMatch(itsOwnRefusal);
        expect(refusal).not.toContain(MARKER);
      },
    );

    it("is refused, when it is a list, for the member a list does not hold, with nothing of it in the refusal", () => {
      const refusal = messageThrownBy(() => {
        requireValidSubmission(placed([MARKER, { name: MARKER }]));
      });

      expect(refusal).toMatch(aListsRefusal);
      expect(refusal).not.toContain(MARKER);
    });

    it("is refused by the check, and by nothing else, when reading any member of it throws the marker", () => {
      const throwing = new Proxy(
        {},
        {
          get: () => {
            throw new Error(MARKER);
          },
          has: () => {
            throw new Error(MARKER);
          },
        },
      );

      const refusal = messageThrownBy(() => {
        requireValidSubmission(placed(throwing));
      });

      expect(refusal).toMatch(CHECKS_OWN_REFUSAL);
      expect(refusal).not.toContain(MARKER);
    });
  });
});

describe("the digest's own check of a value that is not text", () => {
  it.each([
    ["a list of one digest", [DIGEST_A]],
    ["an object that prints as a digest", { toString: () => DIGEST_A }],
    ["a number", 7],
    ["null", null],
    ["undefined", undefined],
  ])(
    "refuses %s, for the counter store and the design repository too",
    (_name, value) => {
      expect(
        messageThrownBy(() => {
          requireSha256Digest(value, "digest", "test the digest");
        }),
      ).toMatch(/64-character lowercase hex/);
    },
  );

  it("still accepts a digest that is text", () => {
    expect(
      messageThrownBy(() => {
        requireSha256Digest(DIGEST_A, "digest", "test the digest");
      }),
    ).toBeUndefined();
  });
});

describe("text Postgres cannot hold", () => {
  const UNSTORABLE: readonly (readonly [string, string])[] = [
    ["a NUL", `${MARKER}\u0000`],
    ["a NUL alone", "\u0000"],
    ["a high half at the end", `${MARKER}\uD800`],
    ["a high half before a letter", `\uDBFF${MARKER}`],
    ["a low half at the start", `\uDC00${MARKER}`],
    ["a low half after a letter", `${MARKER}\uDFFF`],
    ["a pair the wrong way round", `${MARKER}\uDC00\uD800`],
    ["a pair and then a high half", `${MARKER}\uD83D\uDE00\uD83D`],
    ["two high halves and a low", `${MARKER}\uD83D\uD83D\uDE00`],
  ];

  type Place = (text: string) => ContactSubmissionToRecord;
  const inContact =
    (
      field: "name" | "phone" | "phoneNormalForm" | "locality" | "email",
    ): Place =>
    (text) => {
      const submission = aDesignSubmission(CLIENT_REQUEST_ID);
      return {
        ...submission,
        contact: { ...submission.contact, [field]: text },
      };
    };
  const PLACES: readonly (readonly [string, Place])[] = [
    ["the name", inContact("name")],
    ["the phone", inContact("phone")],
    ["the phone's normal form", inContact("phoneNormalForm")],
    ["the locality", inContact("locality")],
    ["the e-mail", inContact("email")],
    [
      "the locale",
      (text) => ({ ...aDesignSubmission(CLIENT_REQUEST_ID), locale: text }),
    ],
    [
      "the design id",
      (text) => ({
        ...aDesignSubmission(CLIENT_REQUEST_ID),
        target: { kind: "design", design: { id: text, revision: "7" } },
      }),
    ],
  ];

  describe.each(PLACES)("in %s", (_place, placed) => {
    it.each(UNSTORABLE)(
      "refuses %s, saying nothing of the text",
      (_name, text) => {
        const refusal = messageThrownBy(() => {
          requireValidSubmission(placed(text));
        });

        expect(refusal).toMatch(/database can hold/);
        expect(refusal).not.toContain(MARKER);
      },
    );

    it("accepts a whole pair, alone, twice over and between letters", () => {
      expect(
        [
          "\uD83D\uDE00",
          "\uD83D\uDE00\uD83D\uDE00",
          "a\uD83D\uDE00b",
          "\uDBFF\uDFFF",
        ].map((text) =>
          messageThrownBy(() => {
            requireValidSubmission(placed(text));
          }),
        ),
      ).toEqual([undefined, undefined, undefined, undefined]);
    });
  });
});

describe("a snapshot's document and priced design, judged before a statement carries them", () => {
  const WIDE_DOCUMENT_MEMBERS = 1_000_000;
  const DEEPER_THAN_THE_ENCODER_GOES = 100_000;
  const PAST_A_DOUBLE = "9007199254740993";

  function judged(document: unknown, priced: unknown) {
    return judgeSubmission(withSnapshot(document, priced)).snapshotJson;
  }

  propertyTest.prop([objectHoldingUnstorableText])(
    "refuses a document holding unstorable text at any depth, in a key or a value, with nothing of it in the refusal",
    (tree) => {
      const refusal = messageThrownBy(() => {
        requireValidSubmission(
          withSnapshot(JSON.stringify(tree), FAKE_SNAPSHOT.priced),
        );
      });

      expect(refusal).toMatch(/JSON object/);
      expect(refusal).not.toContain(POISON_MARKER);
    },
  );

  propertyTest.prop([objectHoldingUnstorableText])(
    "refuses a priced design holding unstorable text at any depth, in a key or a value, with nothing of it in the refusal",
    (tree) => {
      const refusal = messageThrownBy(() => {
        requireValidSubmission(withSnapshot(FAKE_SNAPSHOT.document, tree));
      });

      expect(refusal).toMatch(/JSON object/);
      expect(refusal).not.toContain(POISON_MARKER);
    },
  );

  propertyTest.prop([textHoldingAnOverflowingNumber])(
    "refuses a document holding, at any depth, a number a double cannot hold",
    (text) => {
      expect(
        messageThrownBy(() => {
          requireValidSubmission(withSnapshot(text, FAKE_SNAPSHOT.priced));
        }),
      ).toMatch(/JSON object/);
    },
  );

  propertyTest.prop([cleanJsonObject, cleanJsonObject])(
    "accepts any object of storable text and finite numbers, and the JSON to send is that object's",
    (document, priced) => {
      const text = JSON.stringify(document);

      const json = judged(text, priced);

      expect(json).toEqual({
        document: JSON.stringify(JSON.parse(text)),
        priced: JSON.stringify(JSON.parse(JSON.stringify(priced))),
      });
    },
  );

  it.each([
    ["not a number", Number.NaN],
    ["an infinity", Number.POSITIVE_INFINITY],
    ["a negative infinity", Number.NEGATIVE_INFINITY],
  ])(
    "refuses a priced design whose total is %s, and does not store it as null",
    (_name, total) => {
      const refusal = messageThrownBy(() => {
        requireValidSubmission(
          withSnapshot(FAKE_SNAPSHOT.document, {
            ...FAKE_SNAPSHOT.priced,
            totalMinor: total,
          }),
        );
      });

      expect(refusal).toMatch(/JSON object/);
    },
  );

  it("refuses a document holding a whole number past a double's reach, and never rewrites it", () => {
    expect(
      messageThrownBy(() => {
        requireValidSubmission(
          withSnapshot(`{"n":${PAST_A_DOUBLE}}`, FAKE_SNAPSHOT.priced),
        );
      }),
    ).toMatch(/JSON object/);
  });

  it.each([
    [
      "lists",
      `{"a":${"[".repeat(DEEPER_THAN_THE_ENCODER_GOES)}${"]".repeat(DEEPER_THAN_THE_ENCODER_GOES)}}`,
    ],
    [
      "objects",
      `${'{"a":'.repeat(DEEPER_THAN_THE_ENCODER_GOES)}1${"}".repeat(DEEPER_THAN_THE_ENCODER_GOES)}`,
    ],
  ])(
    "refuses a document of very deep %s under the depth's own sentence, and throws nothing else",
    (_name, document) => {
      const outcome = messageThrownBy(() => {
        requireValidSubmission(withSnapshot(document, FAKE_SNAPSHOT.priced));
      });

      expect(outcome).toMatch(/64 levels/);
    },
  );

  it("returns a document of a million members as the text it was handed", () => {
    const document = JSON.stringify({
      members: Array.from(
        { length: WIDE_DOCUMENT_MEMBERS },
        (_member, index) => `member-${String(index)}`,
      ),
    });

    expect(judged(document, FAKE_SNAPSHOT.priced)?.document).toBe(document);
  });

  it.each([
    ["a list of one object's text", ['{"a":1}']],
    [
      "an object that prints as an object's text",
      { toString: () => '{"a":1}' },
    ],
    ["a String object", Object('{"a":1}')],
  ])("refuses a document that is %s and not text", (_name, document) => {
    expect(
      messageThrownBy(() => {
        requireValidSubmission(withSnapshot(document, FAKE_SNAPSHOT.priced));
      }),
    ).toMatch(/JSON object/);
  });

  it("sends a document with keys named __proto__ and constructor as it was handed, judges what sits under them, and refuses a key written twice", () => {
    const clean = '{"__proto__":{"a":1},"constructor":{"prototype":"p"},"a":2}';
    const unstorableUnderProto = '{"__proto__":{"a":"\\u0000"}}';
    const aKeyWrittenTwice =
      '{"__proto__":{"a":1},"constructor":{"prototype":"p"},"a":1,"a":2}';

    expect(judged(clean, FAKE_SNAPSHOT.priced)?.document).toBe(clean);
    expect(
      [unstorableUnderProto, aKeyWrittenTwice].map((document) =>
        messageThrownBy(() => {
          requireValidSubmission(withSnapshot(document, FAKE_SNAPSHOT.priced));
        }),
      ),
    ).toEqual([
      expect.stringContaining("JSON object"),
      expect.stringContaining("JSON object"),
    ]);
  });
});

describe("the fake draws a proposal exactly when the Neon store does", () => {
  it("uses one proposal for a first record, one for a replay and one for each collision", async () => {
    const drawn: string[] = [];
    const queue = ["LM-AAAAAAAA", "LM-BBBBBBBB", "LM-AAAAAAAA", "LM-CCCCCCCC"];
    const store = new FakeContactSubmissionStore({
      proposeReference: () => {
        const proposal = queue.shift() ?? "LM-ZZZZZZZZ";
        drawn.push(proposal);
        return proposal;
      },
    });

    const answers = [
      await store.record(aCallbackSubmission("qa-8i-fake-draws-first")),
      await store.record(aCallbackSubmission("qa-8i-fake-draws-first")),
      await store.record(aCallbackSubmission("qa-8i-fake-draws-second")),
    ];

    expect(answers).toEqual([
      {
        kind: "stored",
        reference: "LM-AAAAAAAA",
        isNew: true,
        isNotified: false,
      },
      {
        kind: "stored",
        reference: "LM-AAAAAAAA",
        isNew: false,
        isNotified: false,
      },
      {
        kind: "stored",
        reference: "LM-CCCCCCCC",
        isNew: true,
        isNotified: false,
      },
    ]);
    expect(drawn).toEqual([
      "LM-AAAAAAAA",
      "LM-BBBBBBBB",
      "LM-AAAAAAAA",
      "LM-CCCCCCCC",
    ]);
  });

  it("draws nothing for a request the shared check refuses, a lookup or a mark", async () => {
    let draws = 0;
    const store = new FakeContactSubmissionStore({
      proposeReference: () => {
        draws += 1;
        return "LM-AAAAAAAA";
      },
    });
    await store.record(aCallbackSubmission("qa-8i-fake-draws-third"));

    await store
      .record(aCallbackSubmission("qa-8i-fake-draws-third", MARKER))
      .catch(() => undefined);
    await store.lookUp({
      clientRequestId: "qa-8i-fake-draws-third",
      payloadDigest: DIGEST_A,
    });
    await store.markNotified("qa-8i-fake-draws-third");

    expect(draws).toBe(1);
  });
});

describe("the grant-option question as it is sent", () => {
  it("asks has_table_privilege for each privilege with the grant option's suffix, of the table it was given", async () => {
    const sent: { text: string; values: unknown[] }[] = [];
    const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
      sent.push({ text: strings.join("?").replace(/\s+/g, " "), values });
      return Promise.resolve([{ privilege: "INSERT" }]);
    }) as unknown as Parameters<typeof privilegesHeldWithGrantOption>[0];

    const held = await privilegesHeldWithGrantOption(sql, "public.some_table", [
      "INSERT",
      "SELECT",
    ]);

    expect(held).toEqual(["INSERT"]);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.text).toContain(
      "has_table_privilege(current_user, ?, privilege || ' WITH GRANT OPTION')",
    );
    expect(sent[0]?.values).toEqual([
      ["INSERT", "SELECT"],
      "public.some_table",
    ]);
  });
});

describe("a snapshot's own encoding, its walked value and its depth", () => {
  const BOUND = 64;
  const CHECKS_REFUSAL = /^Refusing to use the contact submission store/;
  const DEPTH_REFUSAL = /64 levels/;
  const SHARED_LEVELS = 20;

  /** An object `levels` deep: the root, then lists one inside the other. */
  function documentOfLevels(levels: number): string {
    return `{"deep":${"[".repeat(levels - 1)}${"]".repeat(levels - 1)}}`;
  }

  function valueOfLevels(levels: number): object {
    let value: unknown = 1;
    for (let level = 1; level < levels; level += 1) {
      value = level % 2 === 0 ? { inner: value } : [value];
    }
    return { deep: value };
  }

  function refusalOfSnapshot(document: unknown, priced: unknown) {
    return messageThrownBy(() => {
      requireValidSubmission(withSnapshot(document, priced));
    });
  }

  describe("the real snapshots the domain makes", () => {
    it("are eight kitchens of all three shapes, nested four levels in the document and five in the priced design, against a bound of 64", () => {
      const levels = REAL_SNAPSHOTS.map(({ snapshot }) => ({
        document: levelsOf(JSON.parse(snapshot.document)),
        priced: levelsOf(snapshot.priced),
      }));

      expect(REAL_SNAPSHOTS.map(({ name }) => name[0])).toEqual([
        "l",
        "l",
        "L",
        "L",
        "U",
        "U",
        "U",
        "t",
      ]);
      expect(Math.max(...levels.map((level) => level.document))).toBe(4);
      expect(Math.max(...levels.map((level) => level.priced))).toBe(5);
    });

    it.each(REAL_SNAPSHOTS)(
      "pass the check for $name, and what is to be sent is the document itself and the priced design's one encoding",
      ({ snapshot }) => {
        const json = judgeSubmission(
          withSnapshot(snapshot.document, snapshot.priced),
        ).snapshotJson;

        expect(json).toEqual({
          document: snapshot.document,
          priced: JSON.stringify(snapshot.priced),
        });
        expect(JSON.stringify(JSON.parse(snapshot.document))).toBe(
          snapshot.document,
        );
      },
    );
  });

  describe("what canonicalSerializeDesign emits is its own encoding", () => {
    const keyLikeAnIndex = fc.constantFrom(
      "0",
      "2",
      "9",
      "10",
      "007",
      "-1",
      "1.5",
    );
    const withIndexLikeKeys = fc
      .tuple(
        cleanJsonObject,
        fc.array(fc.tuple(keyLikeAnIndex, cleanJsonObject), { maxLength: 5 }),
      )
      .map(([object, entries]) => ({
        ...object,
        ...Object.fromEntries(entries),
      }));

    propertyTest.prop([withIndexLikeKeys])(
      "for any value it is handed, keys that read as indices included",
      (value) => {
        const text = canonicalSerializeDesign(value as unknown as Design);

        expect(JSON.stringify(JSON.parse(text))).toBe(text);
        expect(refusalOfSnapshot(text, FAKE_SNAPSHOT.priced)).toBeUndefined();
      },
    );
  });

  describe("the bound of 64 levels", () => {
    it("admits a document and a priced design of 64 levels and refuses each at 65, under the depth's own sentence", () => {
      expect([
        refusalOfSnapshot(documentOfLevels(BOUND), FAKE_SNAPSHOT.priced),
        refusalOfSnapshot(FAKE_SNAPSHOT.document, valueOfLevels(BOUND)),
      ]).toEqual([undefined, undefined]);
      expect(
        refusalOfSnapshot(documentOfLevels(BOUND + 1), FAKE_SNAPSHOT.priced),
      ).toMatch(DEPTH_REFUSAL);
      expect(
        refusalOfSnapshot(FAKE_SNAPSHOT.document, valueOfLevels(BOUND + 1)),
      ).toMatch(DEPTH_REFUSAL);
    });

    it.each([
      ["brackets inside a text", { a: "[".repeat(200) }],
      ["braces inside a key", { ["{".repeat(200)]: 1 }],
      ["a quote and then brackets inside a text", { a: `"${"[".repeat(200)}` }],
      [
        "a backslash before the closing quote, then brackets in the next text",
        { a: "\\", b: "[".repeat(200) },
      ],
      [
        "two backslashes and a quote, then brackets",
        { a: `\\\\"${"{[".repeat(100)}` },
      ],
      [
        "many lists side by side, none inside another",
        { a: Array.from({ length: 500 }, () => [[]]) },
      ],
    ])("does not count %s as depth", (_name, value) => {
      expect(
        refusalOfSnapshot(JSON.stringify(value), FAKE_SNAPSHOT.priced),
      ).toBeUndefined();
    });

    it.each([
      [
        "65 levels after a text full of closing brackets",
        {
          a: "]".repeat(200),
          deep: JSON.parse(documentOfLevels(BOUND)) as unknown,
        },
      ],
      [
        "65 levels after a text that ends in an escaped quote",
        { a: 'x"', deep: JSON.parse(documentOfLevels(BOUND)) as unknown },
      ],
      [
        "65 levels after a text that ends in a backslash",
        { a: "x\\", deep: JSON.parse(documentOfLevels(BOUND)) as unknown },
      ],
    ])("still counts %s", (_name, value) => {
      expect(
        refusalOfSnapshot(JSON.stringify(value), FAKE_SNAPSHOT.priced),
      ).toMatch(DEPTH_REFUSAL);
    });

    it.each([
      [
        "a hundred thousand lists",
        `{"a":${"[".repeat(100_000)}${"]".repeat(100_000)}}`,
      ],
      ["a hundred thousand lists never closed", `{"a":${"[".repeat(100_000)}`],
      [
        "a hundred thousand closings, then as many openings",
        `${"]".repeat(100_000)}${"[".repeat(100_000)}`,
      ],
      [
        "an unclosed text, then a hundred thousand lists",
        `{"a":"${"[".repeat(100_000)}`,
      ],
      [
        "a backslash outside any text, then a quote and a hundred thousand lists",
        `{"a":\\"${"[".repeat(100_000)}${"]".repeat(100_000)}}`,
      ],
    ])(
      "throws its own refusal and nothing else for text of %s",
      (_name, text) => {
        expect(refusalOfSnapshot(text, FAKE_SNAPSHOT.priced)).toMatch(
          CHECKS_REFUSAL,
        );
      },
    );

    it("refuses a document far deeper than a parser's own stack under the depth's sentence, so the bound and not the parser judged it", () => {
      expect(
        refusalOfSnapshot(
          `{"a":${"[".repeat(100_000)}${"]".repeat(100_000)}}`,
          FAKE_SNAPSHOT.priced,
        ),
      ).toMatch(DEPTH_REFUSAL);
    });

    it("ends at the bound for a priced design that holds itself, in a member or in a list", () => {
      const inAMember: Record<string, unknown> = { ...FAKE_SNAPSHOT.priced };
      inAMember["self"] = inAMember;
      const inAList: Record<string, unknown> = { ...FAKE_SNAPSHOT.priced };
      inAList["lines"] = [[inAList]];

      expect(refusalOfSnapshot(FAKE_SNAPSHOT.document, inAMember)).toMatch(
        DEPTH_REFUSAL,
      );
      expect(refusalOfSnapshot(FAKE_SNAPSHOT.document, inAList)).toMatch(
        DEPTH_REFUSAL,
      );
    });

    // A recorded limit, not a defect: a value whose levels each hold the next one twice is a tree to the encoder,
    // which writes every path. Twenty levels are a million leaves and are judged at once; sixty would never end.
    // Nothing parsed from JSON and nothing `priceDesign` returns shares a member.
    it("accepts a priced design whose every level holds the next one twice, twenty levels down", () => {
      let shared: unknown = { leaf: 1 };
      for (let level = 0; level < SHARED_LEVELS; level += 1) {
        shared = [shared, shared];
      }

      expect(
        messageThrownBy(() => {
          judgeSubmission(withSnapshot(FAKE_SNAPSHOT.document, { shared }));
        }),
      ).toBeUndefined();
    });
  });

  describe("the priced design walked as a value", () => {
    /** A list of three places whose middle one was never set. */
    function listWithAMissingPlace(): unknown[] {
      const list: unknown[] = [1];
      list[2] = 3;
      return list;
    }

    const priced = FAKE_SNAPSHOT.priced;

    it.each([
      ["a bigint", { ...priced, totalMinor: 7n }],
      ["a function", { ...priced, totalMinor: () => 7 }],
      ["a symbol", { ...priced, totalMinor: Symbol("7") }],
      ["a Date", { ...priced, at: new Date(0) }],
      ["a Map", { ...priced, lines: new Map([["a", 1]]) }],
      ["a boxed number", { ...priced, totalMinor: Object(7) as unknown }],
      [
        "a class instance",
        {
          ...priced,
          line: new (class Line {
            amount = 7;
          })(),
        },
      ],
      ["an undefined place in a list", { ...priced, lines: [undefined] }],
      [
        "a missing place in a list",
        { ...priced, lines: listWithAMissingPlace() },
      ],
      ["a function in a list", { ...priced, lines: [() => 7] }],
      ["a symbol in a list", { ...priced, lines: [Symbol("7")] }],
      [
        "not a number, three levels down",
        { ...priced, lines: [{ amounts: [Number.NaN] }] },
      ],
      [
        "an infinity in a list",
        { ...priced, lines: [Number.POSITIVE_INFINITY] },
      ],
      ["its own toJSON", { ...priced, toJSON: () => ({}) }],
      [
        "a member that throws when read",
        Object.defineProperty({ ...priced }, "totalMinor", {
          enumerable: true,
          get: () => {
            throw new Error(MARKER);
          },
        }),
      ],
      [
        "a proxy that throws on every read",
        new Proxy(
          {},
          {
            ownKeys: () => {
              throw new Error(MARKER);
            },
          },
        ),
      ],
    ])(
      "refuses a priced design holding %s, as the check refuses and saying nothing of it",
      (_name, value) => {
        const refusal = refusalOfSnapshot(FAKE_SNAPSHOT.document, value);

        expect(refusal).toMatch(/JSON object/);
        expect(refusal).not.toContain(MARKER);
      },
    );

    it("leaves out an object's member that is undefined, as the type's optional fields are, and encodes the rest once", () => {
      const json = judgeSubmission(
        withSnapshot(FAKE_SNAPSHOT.document, {
          ...priced,
          lines: [{ nameKey: undefined, amountMinor: 7 }],
          note: undefined,
        }),
      ).snapshotJson;

      expect(json?.priced).toBe(
        JSON.stringify({ ...priced, lines: [{ amountMinor: 7 }] }),
      );
    });

    it("accepts an object with no prototype, and a negative zero, which is sent as zero", () => {
      const bare = Object.assign(Object.create(null) as object, {
        totalMinor: -0,
      });

      expect(
        judgeSubmission(withSnapshot(FAKE_SNAPSHOT.document, bare)).snapshotJson
          ?.priced,
      ).toBe('{"totalMinor":0}');
    });

    // A recorded limit, not a defect: a list is not asked whether it is plain, so one
    // that carries its own encoder is walked as its members and sent as whatever the encoder answers.
    it("sends a list that carries its own toJSON as that encoder answers, not as the members that were walked", () => {
      const lines = Object.assign([1, 2], { toJSON: () => ["encoder's"] });

      expect(
        judgeSubmission(
          withSnapshot(FAKE_SNAPSHOT.document, { ...priced, lines }),
        ).snapshotJson?.priced,
      ).toBe(JSON.stringify({ ...priced, lines: ["encoder's"] }));
    });
  });
});

describe("anything a member read throws", () => {
  const REQUESTS_REFUSAL = /the request must be plain data/;
  const lookup = {
    clientRequestId: CLIENT_REQUEST_ID,
    payloadDigest: DIGEST_A,
  };

  /** `base` with `member` answered by `read`, which may throw. */
  function withMemberRead<Base extends object>(
    base: Base,
    member: keyof Base,
    read: () => unknown,
  ): Base {
    return Object.defineProperty({ ...base }, member, {
      enumerable: true,
      get: read,
    });
  }

  function throwing(thrown: unknown): () => never {
    return () => {
      throw thrown;
    };
  }

  function proxyThrowing(thrown: unknown): never {
    return new Proxy(
      {},
      { get: throwing(thrown), has: throwing(thrown) },
    ) as never;
  }

  /** A value that throws the marker whatever is asked of it, `instanceof` included. */
  function proxyThrowingFromEveryTrap(): object {
    const refuse = throwing(new Error(MARKER));
    return new Proxy(
      {},
      {
        get: refuse,
        has: refuse,
        ownKeys: refuse,
        getPrototypeOf: refuse,
        getOwnPropertyDescriptor: refuse,
        isExtensible: refuse,
        defineProperty: refuse,
        set: refuse,
      },
    );
  }

  /** An error that copies one of the check's own sentences word for word, and carries a marker beside it. */
  function copyOfAnOwnRefusal(): Error {
    const own = caughtFrom(() => {
      requireValidClientRequestId("short");
    }) as Error;
    return Object.assign(new Error(own.message), { detail: MARKER });
  }

  const THROWN: readonly (readonly [string, () => unknown])[] = [
    [
      "an error holding the marker, with a cause",
      () => new Error(MARKER, { cause: new Error(MARKER) }),
    ],
    ["a frozen error", () => Object.freeze(new Error(MARKER))],
    [
      "a type error named after the marker",
      () => Object.assign(new TypeError(MARKER), { name: MARKER }),
    ],
    ["text", () => MARKER],
    ["an object", () => ({ message: MARKER, detail: MARKER })],
    ["null", () => null],
    ["undefined", () => undefined],
    ["a symbol", () => Symbol(MARKER)],
    ["an error copying one of the check's own sentences", copyOfAnOwnRefusal],
    ["a proxy whose every trap throws the marker", proxyThrowingFromEveryTrap],
  ];

  describe.each(THROWN)("when it is %s", (_name, thrown) => {
    it.each([
      [
        "the lookup's client request id",
        () => withMemberRead(lookup, "clientRequestId", throwing(thrown())),
      ],
      [
        "the lookup's digest",
        () => withMemberRead(lookup, "payloadDigest", throwing(thrown())),
      ],
      ["every member of the lookup's request", () => proxyThrowing(thrown())],
    ])(
      "leaves the lookup's check as the refusal of the request, keeping nothing of it: %s",
      (_place, request) => {
        const refusal = caughtFrom(() => {
          requireValidLookup(request());
        });

        expect((refusal as Error).message).toMatch(REQUESTS_REFUSAL);
        expect(markersFoundOn(refusal, [MARKER])).toEqual([]);
        expect((refusal as Error).cause).toBeUndefined();
        expect(Object.getOwnPropertyNames(refusal).sort()).toEqual([
          "message",
          "stack",
        ]);
      },
    );

    it("leaves the submission's check as the refusal of the request, keeping nothing of it", () => {
      const submission = aDesignSubmission(CLIENT_REQUEST_ID);
      const kept = thrown();

      const refusal = caughtFrom(() => {
        requireValidSubmission({
          ...submission,
          contact: withMemberRead(submission.contact, "name", throwing(kept)),
        });
      });

      expect(Object.is(refusal, kept)).toBe(false);
      expect((refusal as Error).message).toMatch(REQUESTS_REFUSAL);
      expect(markersFoundOn(refusal, [MARKER])).toEqual([]);
      expect(Object.getOwnPropertyNames(refusal).sort()).toEqual([
        "message",
        "stack",
      ]);
    });

    it("leaves the fake's lookUp as the refusal of the request, keeping nothing of it", async () => {
      const refusal = await rejectionOf(
        new FakeContactSubmissionStore().lookUp(
          withMemberRead(lookup, "payloadDigest", throwing(thrown())),
        ),
      );

      expect((refusal as Error).message).toMatch(REQUESTS_REFUSAL);
      expect(markersFoundOn(refusal, [MARKER])).toEqual([]);
    });
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a number", 7],
    ["text", MARKER],
  ])(
    "refuses a request that is %s and no object at all as the request, for a record and for a lookup",
    (_name, request) => {
      const refusals = [
        messageThrownBy(() => {
          requireValidSubmission(request as never);
        }),
        messageThrownBy(() => {
          requireValidLookup(request as never);
        }),
      ];

      expect(
        refusals.every((refusal) =>
          (refusal ?? "").startsWith(CHECKS_OWN_OPENING),
        ),
      ).toBe(true);
      expect(refusals.join(" ")).not.toContain(MARKER);
    },
  );

  it("leaves a refusal the check makes inside a member read, of another request, as that refusal: its own sentence and no value", () => {
    const submission = aDesignSubmission(CLIENT_REQUEST_ID);
    const nested = (): never => {
      requireValidSubmission(aDesignSubmission(`${MARKER} not an id`));
      throw new Error(MARKER);
    };

    const refusal = caughtFrom(() => {
      requireValidSubmission({
        ...submission,
        contact: withMemberRead(submission.contact, "name", nested),
      });
    });

    expect((refusal as Error).message).toMatch(/client request id/);
    expect(markersFoundOn(refusal, [MARKER])).toEqual([]);
  });

  // A recorded limit, not a defect: the check knows its own refusals by identity and lets one leave as it is. Code
  // that caught one earlier, wrote on it and threw it again from a member read gets that same object back, with what
  // it wrote. Nothing but the caller's own code can write there, and a validated request is plain data.
  it.each([
    ["as it was made", (refusal: Error) => refusal],
    [
      "stripped of its prototype, so that it is no Error to ask",
      (refusal: Error) => Object.setPrototypeOf(refusal, null) as Error,
    ],
    ["frozen", (refusal: Error) => Object.freeze(refusal)],
  ])(
    "lets a refusal it made earlier, thrown again by a member read, leave as that same object with what its holder wrote on it: %s",
    (_name, altered) => {
      const earlier = altered(
        Object.assign(
          caughtFrom(() => {
            requireValidClientRequestId("short");
          }) as Error,
          { detail: MARKER },
        ),
      );

      const refusal = caughtFrom(() => {
        requireValidLookup(
          withMemberRead(lookup, "payloadDigest", throwing(earlier)),
        );
      });

      expect(refusal).toBe(earlier);
      expect((refusal as { message?: unknown }).message).toMatch(
        /client request id/,
      );
      expect((refusal as { detail?: unknown }).detail).toBe(MARKER);
    },
  );

  // A recorded limit, not a defect: the invariant is the check's. The fake reads the request's id again after the
  // check, so a member that reads cleanly once and throws afterwards throws out of the fake as it is. The Neon store
  // reads it again inside its statement, where every throw becomes the store error (see the driver tests).
  it("lets a member that reads cleanly for the check and throws afterwards throw out of the fake's lookUp as it is", async () => {
    let reads = 0;
    const request = withMemberRead(lookup, "clientRequestId", () => {
      reads += 1;
      if (reads > 1) throw new Error(MARKER);
      return CLIENT_REQUEST_ID;
    });

    const thrown = await rejectionOf(
      new FakeContactSubmissionStore().lookUp(request),
    );

    expect((thrown as Error).message).toBe(MARKER);
  });

  it.each([
    [
      "an object whose text form throws",
      { toString: throwing(new Error(MARKER)) },
    ],
    ["a proxy that throws on every read", proxyThrowing(new Error(MARKER))],
    ["null", null],
  ])(
    "refuses a mark of an id that is %s as the client request id, reading nothing of it",
    async (_name, id) => {
      const refusal = await rejectionOf(
        new FakeContactSubmissionStore().markNotified(id as never),
      );

      expect((refusal as Error).message).toMatch(/client request id/);
      expect(markersFoundOn(refusal, [MARKER])).toEqual([]);
    },
  );
});
