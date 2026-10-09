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
import { privilegesHeldWithGrantOption } from "./support/table-privileges.js";

/**
 * Adversarial QA of M8 wave 8I, criterion 12, with no database: the shared check at the table's edges, what it does
 * with a value that is not text, and whether it accepts everything the domain's validation hands it.
 */
const CLIENT_REQUEST_ID = "qa-8i-check-test-request-id";
const LARGEST_REVISION = 9_223_372_036_854_775_807n;
const WIDEST_NINETEEN_DIGITS = 9_999_999_999_999_999_999n;
/** Text no refusal may repeat. */
const MARKER = "QA8I-LEAKED-MARKER";

function refusalOf(act: () => void): string | undefined {
  try {
    act();
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : "a non-error throw";
  }
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
    const refusal = refusalOf(() => {
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
    const refusal = refusalOf(() => {
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
    const refusal = refusalOf(() => {
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
    const refusal = refusalOf(() => {
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
      refusalOf(() => {
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
      const refusal = refusalOf(() => {
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
      const refusal = refusalOf(() => {
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
      refusalOf(() => {
        requireValidClientRequestId(id as unknown as string);
      }),
    ).toMatch(/client request id/);
  });

  it("refuses a digest that is a list of one digest", () => {
    expect(
      refusalOf(() => {
        requireValidLookup({
          clientRequestId: CLIENT_REQUEST_ID,
          payloadDigest: [DIGEST_A] as unknown as string,
        });
      }),
    ).toMatch(/digest/);
  });

  it("refuses a reference that is a list of one reference", () => {
    expect(
      refusalOf(() => {
        requireValidReference(["LM-AAAAAAAA"] as unknown as string);
      }),
    ).toMatch(/reference/);
  });

  it("refuses a revision that is a number or a list, which the column would take", () => {
    expect(
      [7, [7], ["7"], 7n].map((revision) =>
        (
          refusalOf(() => {
            requireValidSubmission(withRevision(revision));
          }) ?? ""
        ).includes("revision"),
      ),
    ).toEqual([true, true, true, true]);
  });

  it("leaves the fake either refusing a request recorded under a number or finding it by its text, as the table would", async () => {
    const store = new FakeContactSubmissionStore();
    const recording = await store
      .record(aCallbackSubmission(sixteenDigits as unknown as string))
      .catch((error: unknown) => error);

    const lookup = await store.lookUp({
      clientRequestId: String(sixteenDigits),
      payloadDigest: DIGEST_A,
    });

    expect(recording instanceof Error ? "refused" : lookup.kind).not.toBe(
      "absent",
    );
  });
});

interface RawRequest {
  readonly name: string;
  readonly locality: string;
  readonly channel: string;
  readonly email: string | undefined;
  readonly target:
    | { readonly intent: string }
    | { readonly design: { readonly id: string; readonly revision: string } };
  readonly clientRequestId: string;
}

const DESIGN_ID = generateDesignId();

const rawRequest: fc.Arbitrary<RawRequest> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 60 }),
  locality: fc.string({ maxLength: 60 }),
  channel: fc.constantFrom("phone", "whatsapp", "email"),
  email: fc.option(
    fc.constantFrom("zorba.fakeperson@example.invalid", "", "not an e-mail"),
    { nil: undefined },
  ),
  target: fc.oneof(
    fc.constant({ intent: "callback" }),
    fc
      .oneof(
        fc.bigInt({ min: 1n, max: LARGEST_REVISION }),
        fc.bigInt({ min: LARGEST_REVISION + 1n, max: WIDEST_NINETEEN_DIGITS }),
      )
      .map((revision) => ({
        design: { id: DESIGN_ID, revision: String(revision) },
      })),
  ),
  clientRequestId: fc.stringMatching(/^[A-Za-z0-9_-]{16,64}$/),
});

function validated(
  raw: RawRequest,
): ReturnType<typeof validateContactSubmission> {
  return validateContactSubmission(
    {
      contact: {
        name: raw.name,
        phone: "+37369123456",
        locality: raw.locality,
        channel: raw.channel,
        ...(raw.email === undefined ? {} : { email: raw.email }),
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
}

function fitsTheColumn(raw: RawRequest): boolean {
  return (
    !("design" in raw.target) ||
    BigInt(raw.target.design.revision) <= LARGEST_REVISION
  );
}

describe("what the domain's validation accepts", () => {
  it("includes each channel, with an e-mail typed and without, so the property below reaches them", () => {
    const base: RawRequest = {
      name: "Zorba Fakeperson",
      locality: "",
      channel: "phone",
      email: "zorba.fakeperson@example.invalid",
      target: { design: { id: DESIGN_ID, revision: "7" } },
      clientRequestId: CLIENT_REQUEST_ID,
    };

    expect(
      [
        base,
        { ...base, email: undefined },
        { ...base, channel: "whatsapp" },
        { ...base, channel: "email" },
        { ...base, target: { intent: "callback" } },
      ].map((raw) => validated(raw).ok),
    ).toEqual([true, true, true, true, true]);
  });

  propertyTest.prop([rawRequest])(
    "is accepted by the shared check, but for a revision past the column, which is refused as one",
    (raw) => {
      const validation = validated(raw);
      fc.pre(validation.ok);
      const { contact, target, clientRequestId, locale } = validation.request;

      const refusal = refusalOf(() => {
        requireValidSubmission({
          clientRequestId,
          payloadDigest: DIGEST_A,
          contact,
          locale,
          target,
          snapshot: target.kind === "design" ? FAKE_SNAPSHOT : undefined,
        });
      });

      if (fitsTheColumn(raw)) expect(refusal).toBeUndefined();
      else expect(refusal).toMatch(/revision/);
    },
  );
});

describe("round 2, rule 2: the digest's own check of a value that is not text", () => {
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
        refusalOf(() => {
          requireSha256Digest(value, "digest", "test the digest");
        }),
      ).toMatch(/64-character lowercase hex/);
    },
  );

  it("still accepts a digest that is text", () => {
    expect(
      refusalOf(() => {
        requireSha256Digest(DIGEST_A, "digest", "test the digest");
      }),
    ).toBeUndefined();
  });
});

describe("round 2, rule 3: text Postgres cannot hold", () => {
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
        const refusal = refusalOf(() => {
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
          refusalOf(() => {
            requireValidSubmission(placed(text));
          }),
        ),
      ).toEqual([undefined, undefined, undefined, undefined]);
    });
  });
});

describe("round 2, rule 4: a snapshot judged as the JSON the statement will carry", () => {
  const WIDE_DOCUMENT_MEMBERS = 1_000_000;
  const WIDE_DOCUMENT_BUDGET_MS = 5_000;
  const DEEPER_THAN_THE_ENCODER_GOES = 100_000;
  const PAST_A_DOUBLE = "9007199254740993";

  function judged(document: unknown, priced: unknown) {
    return judgeSubmission(withSnapshot(document, priced)).snapshotJson;
  }

  propertyTest.prop([objectHoldingUnstorableText])(
    "refuses a document holding unstorable text at any depth, in a key or a value, with nothing of it in the refusal",
    (tree) => {
      const refusal = refusalOf(() => {
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
      const refusal = refusalOf(() => {
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
        refusalOf(() => {
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
      const refusal = refusalOf(() => {
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

  it("refuses a document holding a whole number past a double's reach, or sends it digit for digit", () => {
    const outcome = refusalOf(() => {
      const json = judged(`{"n":${PAST_A_DOUBLE}}`, FAKE_SNAPSHOT.priced);
      if (json?.document.includes(PAST_A_DOUBLE) !== true) {
        throw new Error(`sent as ${json?.document ?? "nothing"}`);
      }
    });

    expect(outcome ?? "sent digit for digit").toMatch(
      /Refusing to use the contact submission store|sent digit for digit/,
    );
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
    "accepts a document of very deep %s, or refuses it as the check refuses, and throws nothing else",
    (_name, document) => {
      const outcome = refusalOf(() => {
        requireValidSubmission(withSnapshot(document, FAKE_SNAPSHOT.priced));
      });

      expect(outcome ?? "accepted").toMatch(
        /^accepted$|^Refusing to use the contact submission store/,
      );
    },
  );

  it("judges a document of a million members inside its budget", () => {
    const document = JSON.stringify({
      members: Array.from(
        { length: WIDE_DOCUMENT_MEMBERS },
        (_member, index) => `member-${String(index)}`,
      ),
    });
    const startedAt = performance.now();

    const json = judged(document, FAKE_SNAPSHOT.priced);

    const elapsedMs = performance.now() - startedAt;
    console.info(
      `[qa-8i-check] judged ${String(document.length)} characters in ${String(Math.round(elapsedMs))} ms`,
    );
    expect(json?.document).toBe(document);
    expect(elapsedMs).toBeLessThan(WIDE_DOCUMENT_BUDGET_MS);
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
      refusalOf(() => {
        requireValidSubmission(withSnapshot(document, FAKE_SNAPSHOT.priced));
      }),
    ).toMatch(/JSON object/);
  });

  it("keeps a key named __proto__ or constructor as a key, and judges what sits under it", () => {
    const clean =
      '{"__proto__":{"a":1},"constructor":{"prototype":"p"},"a":1,"a":2}';
    const unstorableUnderProto = '{"__proto__":{"a":"\\u0000"}}';

    expect(judged(clean, FAKE_SNAPSHOT.priced)?.document).toBe(
      '{"__proto__":{"a":1},"constructor":{"prototype":"p"},"a":2}',
    );
    expect(
      refusalOf(() => {
        requireValidSubmission(
          withSnapshot(unstorableUnderProto, FAKE_SNAPSHOT.priced),
        );
      }),
    ).toMatch(/JSON object/);
  });
});

describe("round 2, criterion 13: the fake draws a proposal exactly when the Neon store does", () => {
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

describe("round 2, criterion 3: the grant-option question as it is sent", () => {
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
