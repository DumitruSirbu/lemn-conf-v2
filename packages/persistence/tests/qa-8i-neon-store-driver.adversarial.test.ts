import { NeonDbError } from "@neondatabase/serverless";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ContactSubmissionStoreError } from "../src/contact-submission-store.js";
import { NeonContactSubmissionStore } from "../src/neon-contact-submission-store.js";
import {
  DIGEST_A,
  FAKE_EMAIL,
  FAKE_NAME,
  FAKE_PHONE,
  FAKE_SNAPSHOT,
  aDesignSubmission,
} from "./support/contact-submission-fixtures.js";
import {
  WELL_FORMED_UNREACHABLE_VALUE,
  markersFoundOn,
} from "./support/leaked-connection-markers.js";
import {
  answerWith,
  driver,
  failWith,
  resetDriver,
} from "./support/mocked-neon-driver.js";

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-driver.js")).withMockedDriver(
    await importOriginal<object>(),
  ),
);

/**
 * Adversarial QA of M8 wave 8I with the driver replaced: what the Neon store sends when its proposal is not a
 * reference (criterion 12), and what leaves it when the driver throws something that resists being read (criterion 7).
 */
const CLIENT_REQUEST_ID = "qa-8i-driver-test-request-id";
const REFERENCE = "LM-AAAAAAAA";
const MARKERS = [FAKE_NAME, FAKE_PHONE, FAKE_EMAIL, CLIENT_REQUEST_ID];
const LEAKING_TEXT = MARKERS.join(" ");
const READS_OF_ONE_WALK_AND_ONE_ENCODING = 2;

function storeProposing(...proposals: string[]): NeonContactSubmissionStore {
  return new NeonContactSubmissionStore(WELL_FORMED_UNREACHABLE_VALUE, {
    proposeReference: () => proposals.shift() ?? REFERENCE,
  });
}

beforeEach(resetDriver);
afterEach(resetDriver);

describe("a proposal that is not a reference", () => {
  it.each([
    ["lowercase", "lm-aaaaaaaa"],
    ["five characters", "LM-AA"],
    ["thirty-three characters", "A".repeat(33)],
    ["empty", ""],
    ["holding a person's name", FAKE_NAME],
  ])(
    "is refused before any statement carries the request to the server: %s",
    async (_name, proposal) => {
      const failure = await storeProposing(proposal)
        .record(aDesignSubmission(CLIENT_REQUEST_ID))
        .catch((error: unknown) => error);

      expect(driver.statements).toEqual([]);
      expect((failure as Error).message).toMatch(/reference/);
      expect(markersFoundOn(failure, MARKERS)).toEqual([]);
    },
  );

  it("is refused when it is the second draw, after a collision, with one statement sent and not two", async () => {
    failWith(
      Object.assign(new Error("collision"), {
        code: "23505",
        constraint: "contact_submissions_reference_is_unique",
      }),
    );
    answerWith([]);

    const failure = await storeProposing(REFERENCE, "not a reference")
      .record(aDesignSubmission(CLIENT_REQUEST_ID))
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(driver.statements.length).toBeLessThanOrEqual(1);
  });
});

function throwingOnEveryRead(): unknown {
  return new Proxy(
    {},
    {
      get: () => {
        throw new Error(LEAKING_TEXT);
      },
      getPrototypeOf: () => {
        throw new Error(LEAKING_TEXT);
      },
      ownKeys: () => {
        throw new Error(LEAKING_TEXT);
      },
    },
  );
}

function errorWhoseNameIsAGetterThatThrows(): Error {
  const error = new Error(LEAKING_TEXT);
  Object.defineProperty(error, "name", {
    get: () => {
      throw new Error(LEAKING_TEXT);
    },
  });
  return error;
}

function errorNamedAfterAPerson(): Error {
  return Object.assign(new Error("refused"), {
    name: FAKE_NAME,
    code: LEAKING_TEXT,
  });
}

const RESISTING_THROWS: readonly (readonly [string, () => unknown])[] = [
  ["a proxy that throws on every read", throwingOnEveryRead],
  ["an error whose name getter throws", errorWhoseNameIsAGetterThatThrows],
  [
    "an error whose name and code hold a person's details",
    errorNamedAfterAPerson,
  ],
  ["a symbol", () => Symbol(LEAKING_TEXT)],
  [
    "a function holding the details",
    () => Object.assign(() => 0, { detail: LEAKING_TEXT }),
  ],
  ["a list of the details", () => [...MARKERS]],
];

describe("a throw of the driver that resists being read", () => {
  it.each(RESISTING_THROWS)(
    "leaves every operation as the store error holding no marker: %s",
    async (_name, thrown) => {
      const store = storeProposing(REFERENCE, REFERENCE, REFERENCE);
      const calls = [
        () => store.record(aDesignSubmission(CLIENT_REQUEST_ID)),
        () =>
          store.lookUp({
            clientRequestId: CLIENT_REQUEST_ID,
            payloadDigest: DIGEST_A,
          }),
        () => store.markNotified(CLIENT_REQUEST_ID),
      ];

      for (const call of calls) {
        failWith(thrown());

        const failure = await call().catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(ContactSubmissionStoreError);
        expect(markersFoundOn(failure, MARKERS)).toEqual([]);
      }
    },
  );
});

describe("a reply whose row is not plain data", () => {
  const recordedRow = {
    reference: REFERENCE,
    is_new: true,
    is_same_payload: true,
    is_notified: false,
  };

  it.each([
    [
      "a row whose columns are inherited",
      [Object.create(recordedRow) as object],
    ],
    ["a list holding a hole", [recordedRow, undefined]],
    ["a list holding a null", [null]],
    ["a row that is a list", [[REFERENCE, true, true, false]]],
    [
      "a row with a column that is an object",
      [{ ...recordedRow, is_notified: {} }],
    ],
    [
      "a row with a reference of thirty-three characters",
      [{ ...recordedRow, reference: "A".repeat(33) }],
    ],
  ])(
    "is the store error with no cause for a record answered with %s",
    async (_name, reply) => {
      answerWith(reply);

      const failure = await storeProposing(REFERENCE)
        .record(aDesignSubmission(CLIENT_REQUEST_ID))
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(ContactSubmissionStoreError);
      expect((failure as Error).cause).toBeUndefined();
    },
  );
});

describe("round 3: the snapshot the Neon store sends", () => {
  const HANDED_DOCUMENT =
    '{"b":"A","a":2,"list":[100,1.5,-7e-7],"é":"\\"q\\""}';
  const NOT_ITS_OWN_ENCODING =
    ' {"b" : "\\u0041", "a":1.50, "a":2 , "list":[1e2] }\n';
  const recordedRow = {
    reference: REFERENCE,
    is_new: true,
    is_same_payload: true,
    is_notified: false,
  };

  /** A plain priced design that counts how often its book version is read: once by the walk, once by the encoder. */
  function pricedCountingItsReads(): {
    readonly priced: typeof FAKE_SNAPSHOT.priced;
    readonly reads: () => number;
  } {
    let reads = 0;
    const priced = { ...FAKE_SNAPSHOT.priced };
    Object.defineProperty(priced, "pricingVersion", {
      enumerable: true,
      get: () => {
        reads += 1;
        return "book-read";
      },
    });
    return { priced, reads: () => reads };
  }

  function textsSentIn(statementIndex: number): string[] {
    return (driver.statements[statementIndex]?.values ?? []).filter(
      (value): value is string => typeof value === "string",
    );
  }

  function jsonTextsSentIn(statementIndex: number): string[] {
    return textsSentIn(statementIndex).filter((text) => text.startsWith("{"));
  }

  it("is the document handed in, byte for byte, and the priced design encoded as JSON.stringify encodes it", async () => {
    answerWith([recordedRow]);

    await storeProposing(REFERENCE).record({
      ...aDesignSubmission(CLIENT_REQUEST_ID),
      snapshot: { document: HANDED_DOCUMENT, priced: FAKE_SNAPSHOT.priced },
    });

    expect(jsonTextsSentIn(0)).toEqual([
      HANDED_DOCUMENT,
      JSON.stringify(FAKE_SNAPSHOT.priced),
    ]);
  });

  it("sends no statement for a document that is not its own encoding: it is refused and never rewritten", async () => {
    const failure = await storeProposing(REFERENCE)
      .record({
        ...aDesignSubmission(CLIENT_REQUEST_ID),
        snapshot: {
          document: NOT_ITS_OWN_ENCODING,
          priced: FAKE_SNAPSHOT.priced,
        },
      })
      .catch((error: unknown) => error);

    expect(driver.statements).toEqual([]);
    expect((failure as Error).message).toMatch(/JSON object/);
  });

  it("sends no statement for a priced design that carries its own encoder, which could encode otherwise than it was walked", async () => {
    const priced = {
      ...FAKE_SNAPSHOT.priced,
      toJSON: () => ({ pricingVersion: "book\u0000" }),
    } as unknown as typeof FAKE_SNAPSHOT.priced;

    const failure = await storeProposing(REFERENCE)
      .record({
        ...aDesignSubmission(CLIENT_REQUEST_ID),
        snapshot: { document: FAKE_SNAPSHOT.document, priced },
      })
      .catch((error: unknown) => error);

    expect(driver.statements).toEqual([]);
    expect((failure as Error).message).toMatch(/JSON object/);
  });

  it("encodes the priced design once for the request, and sends the same two texts in the statement drawn again after a collision", async () => {
    const { priced, reads } = pricedCountingItsReads();
    failWith(
      Object.assign(new NeonDbError("collision"), {
        code: "23505",
        constraint: "contact_submissions_reference_is_unique",
      }),
    );
    answerWith([{ ...recordedRow, reference: "LM-BBBBBBBB" }]);

    await storeProposing(REFERENCE, "LM-BBBBBBBB").record({
      ...aDesignSubmission(CLIENT_REQUEST_ID),
      snapshot: { document: HANDED_DOCUMENT, priced },
    });

    expect(driver.statements).toHaveLength(2);
    expect(reads()).toBe(READS_OF_ONE_WALK_AND_ONE_ENCODING);
    expect(jsonTextsSentIn(1)).toEqual(jsonTextsSentIn(0));
    expect(jsonTextsSentIn(1)).toEqual([
      HANDED_DOCUMENT,
      JSON.stringify({ ...FAKE_SNAPSHOT.priced, pricingVersion: "book-read" }),
    ]);
  });

  // A limit, recorded and not a defect (the round-2 stopping rule): a real priced design is plain data. One that
  // answers a member through a getter is read by the walk and again by the encoder, so the text sent is what the
  // second read gave.
  it("reads a member behind a getter twice, so what is sent is the encoder's reading and not the walk's", async () => {
    let reads = 0;
    const priced = { ...FAKE_SNAPSHOT.priced };
    Object.defineProperty(priced, "pricingVersion", {
      enumerable: true,
      get: () => {
        reads += 1;
        return `book-read-${String(reads)}`;
      },
    });
    answerWith([recordedRow]);

    await storeProposing(REFERENCE).record({
      ...aDesignSubmission(CLIENT_REQUEST_ID),
      snapshot: { document: FAKE_SNAPSHOT.document, priced },
    });

    expect(textsSentIn(0).join(" ")).toContain("book-read-2");
  });

  it("sends no snapshot text for a callback", async () => {
    answerWith([recordedRow]);
    const callback = aDesignSubmission(CLIENT_REQUEST_ID);

    await storeProposing(REFERENCE).record({
      ...callback,
      contact: { ...callback.contact, channel: "phone", email: undefined },
      target: { kind: "intent", intent: "callback" },
      snapshot: undefined,
    });

    expect(jsonTextsSentIn(0)).toEqual([]);
  });
});
