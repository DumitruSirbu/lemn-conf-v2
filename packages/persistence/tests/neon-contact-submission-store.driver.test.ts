import { NeonDbError } from "@neondatabase/serverless";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ContactSubmissionStoreError,
  MAX_REFERENCE_PROPOSALS,
} from "../src/contact-submission-store.js";
import type { ContactSubmissionOperation } from "../src/contact-submission-store.js";
import { NeonContactSubmissionStore } from "../src/neon-contact-submission-store.js";
import {
  DIGEST_A,
  DIGEST_B,
  FAKE_DESIGN_ID,
  FAKE_DOCUMENT_MARKER,
  FAKE_EMAIL,
  FAKE_LOCALITY,
  FAKE_NAME,
  FAKE_PHONE,
  aDesignSubmission,
} from "./support/contact-submission-fixtures.js";
import { proposing } from "./support/contact-submission-store-contract.js";
import {
  FAKE_HOST,
  FAKE_MARKERS,
  FAKE_PASSWORD,
  FAKE_USER,
  WELL_FORMED_UNREACHABLE_VALUE,
  markersFoundOn,
} from "./support/leaked-connection-markers.js";
import { rejectionOf } from "./support/rejection-of.js";
import {
  answerWith,
  driver,
  failWith,
  resetDriver,
  throwSynchronously,
} from "./support/mocked-neon-driver.js";

vi.mock("@neondatabase/serverless", async (importOriginal) =>
  (await import("./support/mocked-neon-driver.js")).withMockedDriver(
    await importOriginal<object>(),
  ),
);

/**
 * The store with the driver replaced: the collision loop, the repeat after a lost reply, and the translation of every
 * failure and every unexpected reply. Nothing here reaches a database.
 */
const CLIENT_REQUEST_ID = "driver-test-request-id";
const [FIRST_REFERENCE, SECOND_REFERENCE, THIRD_REFERENCE, FOURTH_REFERENCE] = [
  "LM-AAAAAAAA",
  "LM-BBBBBBBB",
  "LM-CCCCCCCC",
  "LM-DDDDDDDD",
] as const;
const REFERENCES = [
  FIRST_REFERENCE,
  SECOND_REFERENCE,
  THIRD_REFERENCE,
  FOURTH_REFERENCE,
];
const REFERENCE_UNIQUENESS = "contact_submissions_reference_is_unique";
const LONGER_THAN_EVERY_BACKOFF_MS = 5_000;
const ATTEMPTS_IN_THE_RETRY_BUDGET = 3;
const LEAKING_TEXT = `postgres://${FAKE_USER}:${FAKE_PASSWORD}@${FAKE_HOST}/db`;

/** A recognisable fake of every stored field, which a driver's error holds in every place it can. */
const STORED_FIELD_MARKERS = [
  FAKE_NAME,
  FAKE_PHONE,
  FAKE_EMAIL,
  FAKE_LOCALITY,
  FAKE_DOCUMENT_MARKER,
  FAKE_DESIGN_ID,
  CLIENT_REQUEST_ID,
  DIGEST_A,
];
const ALL_MARKERS = [...FAKE_MARKERS, ...STORED_FIELD_MARKERS];

const recordedRow = (reference: string, changes: object = {}): object => ({
  reference,
  is_new: true,
  is_same_payload: true,
  is_notified: false,
  ...changes,
});

function newStore(...proposals: string[]): NeonContactSubmissionStore {
  return new NeonContactSubmissionStore(WELL_FORMED_UNREACHABLE_VALUE, {
    proposeReference: proposing(...proposals),
  });
}

function referenceSentIn(statementIndex: number): unknown {
  return driver.statements[statementIndex]?.values[1];
}

function databaseRefusal(
  code: string,
  constraint: string | undefined,
): NeonDbError {
  return Object.assign(new NeonDbError(`refused ${LEAKING_TEXT}`), {
    code,
    constraint,
    detail: STORED_FIELD_MARKERS.join(" "),
    where: STORED_FIELD_MARKERS.join(" "),
    hint: STORED_FIELD_MARKERS.join(" "),
  });
}

function coldStartRefusal(): NeonDbError {
  return new NeonDbError(
    'Server error (HTTP status 500): {"message":"Couldn\'t connect to compute node","neon:retryable":true}',
  );
}

function emptyReply(): SyntaxError {
  return new SyntaxError("Unexpected end of JSON input");
}

async function outcomeOf(pending: Promise<unknown>): Promise<unknown> {
  try {
    return { resolvedWith: await pending };
  } catch (error) {
    return error;
  }
}

async function settleThroughEveryBackoff(
  pending: Promise<unknown>,
): Promise<unknown> {
  const outcome = outcomeOf(pending);
  await vi.advanceTimersByTimeAsync(LONGER_THAN_EVERY_BACKOFF_MS);
  return outcome;
}

beforeEach(() => {
  resetDriver();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("a reference that is another request's", () => {
  it("is drawn again with a new proposal, and the answer is the second one's row", async () => {
    failWith(databaseRefusal("23505", REFERENCE_UNIQUENESS));
    answerWith([recordedRow(SECOND_REFERENCE)]);

    const recording = await newStore(...REFERENCES).record(
      aDesignSubmission(CLIENT_REQUEST_ID),
    );

    expect(recording).toEqual({
      kind: "stored",
      reference: SECOND_REFERENCE,
      isNew: true,
      isNotified: false,
    });
    expect([referenceSentIn(0), referenceSentIn(1)]).toEqual([
      FIRST_REFERENCE,
      SECOND_REFERENCE,
    ]);
  });

  it("is given up on after three proposals: the store error, no cause, three distinct proposals sent", async () => {
    for (let draw = 0; draw < MAX_REFERENCE_PROPOSALS; draw += 1) {
      failWith(databaseRefusal("23505", REFERENCE_UNIQUENESS));
    }

    const failure = await rejectionOf(
      newStore(...REFERENCES).record(aDesignSubmission(CLIENT_REQUEST_ID)),
    );

    expect(failure).toBeInstanceOf(ContactSubmissionStoreError);
    expect((failure as ContactSubmissionStoreError).operation).toBe(
      "record a request",
    );
    expect((failure as Error).cause).toBeUndefined();
    expect(
      driver.statements.map((_statement, index) => referenceSentIn(index)),
    ).toEqual(REFERENCES.slice(0, MAX_REFERENCE_PROPOSALS));
  });

  it.each([
    ["another constraint", "23505", "contact_submissions_pkey"],
    ["no constraint named", "23505", undefined],
    [
      "the reference's constraint under another code",
      "23514",
      REFERENCE_UNIQUENESS,
    ],
  ])(
    "is not the collision when the refusal is %s: one statement, the store error with the code only",
    async (_name, code, constraint) => {
      failWith(databaseRefusal(code, constraint));

      const failure = await rejectionOf(
        newStore(...REFERENCES).record(aDesignSubmission(CLIENT_REQUEST_ID)),
      );

      expect(failure).toBeInstanceOf(ContactSubmissionStoreError);
      expect((failure as Error).cause).toEqual({ name: "NeonDbError", code });
      expect(driver.statements).toHaveLength(1);
    },
  );
});

describe("a statement repeated after a lost reply", () => {
  it.each([
    ["a cold-start refusal", coldStartRefusal],
    ["an empty reply", emptyReply],
  ])(
    "re-sends the same proposal after %s, and answers what the database then says",
    async (_name, lostReply) => {
      failWith(lostReply());
      answerWith([recordedRow(FIRST_REFERENCE)]);

      const settled = await settleThroughEveryBackoff(
        newStore(...REFERENCES).record(aDesignSubmission(CLIENT_REQUEST_ID)),
      );

      expect(settled).toEqual({
        resolvedWith: {
          kind: "stored",
          reference: FIRST_REFERENCE,
          isNew: true,
          isNotified: false,
        },
      });
      expect([referenceSentIn(0), referenceSentIn(1)]).toEqual([
        FIRST_REFERENCE,
        FIRST_REFERENCE,
      ]);
    },
  );

  it("gives up after the retry budget with the store error, never the driver's", async () => {
    for (let attempt = 0; attempt < ATTEMPTS_IN_THE_RETRY_BUDGET; attempt += 1)
      failWith(coldStartRefusal());

    const settled = await settleThroughEveryBackoff(
      newStore(...REFERENCES).record(aDesignSubmission(CLIENT_REQUEST_ID)),
    );

    expect(settled).toBeInstanceOf(ContactSubmissionStoreError);
    expect(driver.statements).toHaveLength(ATTEMPTS_IN_THE_RETRY_BUDGET);
  });

  it("repeats a look-up and a mark too, which are safe to repeat", async () => {
    failWith(emptyReply());
    answerWith([]);
    failWith(emptyReply());
    answerWith([{ reference: FIRST_REFERENCE }]);
    const store = newStore();

    const lookedUp = await settleThroughEveryBackoff(
      store.lookUp({
        clientRequestId: CLIENT_REQUEST_ID,
        payloadDigest: DIGEST_A,
      }),
    );
    const marked = await settleThroughEveryBackoff(
      store.markNotified(CLIENT_REQUEST_ID),
    );

    expect(lookedUp).toEqual({ resolvedWith: { kind: "absent" } });
    expect(marked).toEqual({ resolvedWith: undefined });
  });
});

describe("what the rows answer", () => {
  it("is a conflict when the stored digest is another, and the row's reference is not given out", async () => {
    answerWith([
      recordedRow(THIRD_REFERENCE, {
        is_new: false,
        is_same_payload: false,
        is_notified: true,
      }),
    ]);

    const recording = await newStore(...REFERENCES).record(
      aDesignSubmission(CLIENT_REQUEST_ID, DIGEST_B),
    );

    expect(recording).toEqual({ kind: "conflict" });
  });

  it("is a replay, not new, with the stored reference and whether it was notified", async () => {
    answerWith([
      recordedRow(THIRD_REFERENCE, {
        is_new: false,
        is_notified: true,
      }),
    ]);

    const recording = await newStore(...REFERENCES).record(
      aDesignSubmission(CLIENT_REQUEST_ID),
    );

    expect(recording).toEqual({
      kind: "stored",
      reference: THIRD_REFERENCE,
      isNew: false,
      isNotified: true,
    });
  });

  it("is absent, stored or a conflict for a look-up, with no isNew", async () => {
    const store = newStore();
    const request = {
      clientRequestId: CLIENT_REQUEST_ID,
      payloadDigest: DIGEST_A,
    };
    const lookedUpRow = {
      reference: FIRST_REFERENCE,
      is_same_payload: true,
      is_notified: true,
    };
    answerWith([]);
    answerWith([lookedUpRow]);
    answerWith([{ ...lookedUpRow, is_same_payload: false }]);

    expect([
      await store.lookUp(request),
      await store.lookUp(request),
      await store.lookUp(request),
    ]).toEqual([
      { kind: "absent" },
      { kind: "stored", reference: FIRST_REFERENCE, isNotified: true },
      { kind: "conflict" },
    ]);
  });
});

const UNEXPECTED_REPLIES: readonly (readonly [string, unknown])[] = [
  ["no rows", []],
  ["two rows", [recordedRow(FIRST_REFERENCE), recordedRow(SECOND_REFERENCE)]],
  [
    "a row with a column more",
    [recordedRow(FIRST_REFERENCE, { name: FAKE_NAME })],
  ],
  [
    "a row with a column less",
    [{ reference: FIRST_REFERENCE, is_new: true, is_same_payload: true }],
  ],
  ["a reference that is lowercase", [recordedRow("lm-aaaaaaaa")]],
  ["a reference that is not text", [recordedRow(7 as unknown as string)]],
  [
    "an is_new that is text",
    [recordedRow(FIRST_REFERENCE, { is_new: "true" })],
  ],
  [
    "an is_same_payload that is null",
    [recordedRow(FIRST_REFERENCE, { is_same_payload: null })],
  ],
  ["an object and not a list", {}],
  ["null", null],
  ["a string", "ok"],
  ["a list of strings", ["LM-AAAAAAAA"]],
];

describe("a reply that is not exactly the rows the statement names", () => {
  it.each(UNEXPECTED_REPLIES)(
    "is the store error with no cause for a record answered with %s",
    async (_name, reply) => {
      answerWith(reply);

      const failure = await rejectionOf(
        newStore(...REFERENCES).record(aDesignSubmission(CLIENT_REQUEST_ID)),
      );

      expect(failure).toBeInstanceOf(ContactSubmissionStoreError);
      expect((failure as Error).cause).toBeUndefined();
    },
  );

  it("is the store error with no cause for a look-up answered with two rows or a row of the record's shape", async () => {
    const store = newStore();
    const request = {
      clientRequestId: CLIENT_REQUEST_ID,
      payloadDigest: DIGEST_A,
    };
    const row = {
      reference: FIRST_REFERENCE,
      is_same_payload: true,
      is_notified: false,
    };
    answerWith([row, row]);
    answerWith([recordedRow(FIRST_REFERENCE)]);

    const failures = [
      await rejectionOf(store.lookUp(request)),
      await rejectionOf(store.lookUp(request)),
    ];

    for (const failure of failures) {
      expect(failure).toBeInstanceOf(ContactSubmissionStoreError);
      expect((failure as Error).cause).toBeUndefined();
    }
  });

  it("is the store error for a mark that finds no row, or more than one", async () => {
    const store = newStore();
    answerWith([]);
    answerWith([
      { reference: FIRST_REFERENCE },
      { reference: SECOND_REFERENCE },
    ]);

    const failures = [
      await rejectionOf(store.markNotified(CLIENT_REQUEST_ID)),
      await rejectionOf(store.markNotified(CLIENT_REQUEST_ID)),
    ];

    for (const failure of failures) {
      expect(failure).toBeInstanceOf(ContactSubmissionStoreError);
      expect((failure as ContactSubmissionStoreError).operation).toBe(
        "mark a request notified",
      );
    }
  });
});

function errorWithLeakingGetters(): Error {
  const error = new Error(LEAKING_TEXT);
  Object.defineProperty(error, "code", {
    get: () => {
      throw new Error(LEAKING_TEXT);
    },
  });
  return error;
}

/** An error whose code and constraint read as the reference's collision on the first read only (`isAtFirst`), or on
 *  every read after the first. A store that classifies a failure twice can disagree with itself. */
function errorWhoseReadingChanges(isAtFirst: boolean): NeonDbError {
  const error = databaseRefusal("23505", REFERENCE_UNIQUENESS);
  let reads = 0;
  Object.defineProperty(error, "code", {
    get: () => {
      reads += 1;
      return (reads === 1) === isAtFirst ? "23505" : "XX000";
    },
  });
  return error;
}

const FAILURE_SHAPES: readonly (readonly [string, () => unknown])[] = [
  [
    "the reference's collision, which is handled only by the loop of a record",
    () => databaseRefusal("23505", REFERENCE_UNIQUENESS),
  ],
  [
    "an error that reads as the collision at first and as something else after",
    () => errorWhoseReadingChanges(true),
  ],
  [
    "an error that reads as something else at first and as the collision after",
    () => errorWhoseReadingChanges(false),
  ],
  ["a string holding the connection string", () => LEAKING_TEXT],
  ["null", () => null],
  ["undefined", () => undefined],
  ["a number", () => 42],
  [
    "a plain object holding every stored field",
    () => ({ message: STORED_FIELD_MARKERS.join(" "), code: "23514" }),
  ],
  [
    "a fetch failure whose cause holds the host",
    () => new TypeError("fetch failed", { cause: new Error(LEAKING_TEXT) }),
  ],
  [
    "a check violation whose detail holds every stored field",
    () =>
      databaseRefusal("23514", "contact_submissions_payload_digest_is_sha256"),
  ],
  [
    "a unique violation of the primary key, whose detail holds the key",
    () => databaseRefusal("23505", "contact_submissions_pkey"),
  ],
  [
    "a refusal whose cause chain holds the fields",
    () =>
      Object.assign(
        new Error("outer", {
          cause: new Error(STORED_FIELD_MARKERS.join(" ")),
        }),
        { code: "XX000" },
      ),
  ],
  [
    "an error whose code getter throws the connection string",
    errorWithLeakingGetters,
  ],
];

const OPERATIONS: readonly (readonly [
  ContactSubmissionOperation,
  (store: NeonContactSubmissionStore) => Promise<unknown>,
])[] = [
  [
    "record a request",
    (store) => store.record(aDesignSubmission(CLIENT_REQUEST_ID)),
  ],
  [
    "look up a request",
    (store) =>
      store.lookUp({
        clientRequestId: CLIENT_REQUEST_ID,
        payloadDigest: DIGEST_A,
      }),
  ],
  ["mark a request notified", (store) => store.markNotified(CLIENT_REQUEST_ID)],
];

describe("every failure of the driver", () => {
  describe.each(OPERATIONS)(
    "when it is raised while the store tries to %s",
    (operation, run) => {
      it.each(FAILURE_SHAPES)(
        "leaves as the store error holding no marker, for %s",
        async (_name, shape) => {
          failWith(shape());

          const failure = await rejectionOf(run(newStore(...REFERENCES)));

          expect(failure).toBeInstanceOf(ContactSubmissionStoreError);
          expect((failure as ContactSubmissionStoreError).operation).toBe(
            operation,
          );
          expect(markersFoundOn(failure, ALL_MARKERS)).toEqual([]);
        },
      );

      it("leaves as the store error holding no marker when the driver throws before returning a promise", async () => {
        throwSynchronously(
          databaseRefusal(
            "23514",
            "contact_submissions_payload_digest_is_sha256",
          ),
        );

        const failure = await rejectionOf(run(newStore(...REFERENCES)));

        expect(failure).toBeInstanceOf(ContactSubmissionStoreError);
        expect(markersFoundOn(failure, ALL_MARKERS)).toEqual([]);
      });
    },
  );

  it.each([
    [
      "look up a request",
      (store: NeonContactSubmissionStore) =>
        store.lookUp({
          clientRequestId: CLIENT_REQUEST_ID,
          payloadDigest: DIGEST_A,
        }),
    ],
    [
      "mark a request notified",
      (store: NeonContactSubmissionStore) =>
        store.markNotified(CLIENT_REQUEST_ID),
    ],
  ])(
    "does not pass the reference's collision through when it is raised while the store tries to %s: it leaves as the store error",
    async (_operation, run) => {
      failWith(databaseRefusal("23505", REFERENCE_UNIQUENESS));

      const failure = await rejectionOf(run(newStore(...REFERENCES)));

      expect(failure).toBeInstanceOf(ContactSubmissionStoreError);
      expect(failure).not.toBeInstanceOf(NeonDbError);
      expect((failure as Error).cause).toEqual({
        name: "NeonDbError",
        code: "23505",
      });
    },
  );

  it("is classified once: a record meets an error that reads as the collision only at first as one collision, and draws again", async () => {
    failWith(errorWhoseReadingChanges(true));
    answerWith([recordedRow(SECOND_REFERENCE)]);

    const recording = await newStore(...REFERENCES).record(
      aDesignSubmission(CLIENT_REQUEST_ID),
    );

    expect(recording).toMatchObject({
      kind: "stored",
      reference: SECOND_REFERENCE,
    });
    expect(driver.statements).toHaveLength(2);
  });

  it("keeps the type name and the SQLSTATE of a refusal as its whole cause", async () => {
    failWith(
      databaseRefusal("23514", "contact_submissions_payload_digest_is_sha256"),
    );

    const failure = await rejectionOf(
      newStore(...REFERENCES).record(aDesignSubmission(CLIENT_REQUEST_ID)),
    );

    expect((failure as Error).cause).toEqual({
      name: "NeonDbError",
      code: "23514",
    });
  });

  it("is not logged: the store writes nothing to the console while it fails", async () => {
    const written = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "info"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
    ];
    failWith(
      databaseRefusal("23514", "contact_submissions_payload_digest_is_sha256"),
    );

    await newStore(...REFERENCES)
      .record(aDesignSubmission(CLIENT_REQUEST_ID))
      .catch(() => undefined);

    expect(written.map((spy) => spy.mock.calls.length)).toEqual([0, 0, 0, 0]);
  });
});

/** A row, or a list, that throws the details when any of it is read. It answers nothing for `then`, as the promise
 *  machinery must be able to carry it: it is the reading of the reply that throws, not the delivery of it. */
function unreadable(): object {
  const throwing = (): never => {
    throw new Error(LEAKING_TEXT);
  };
  return new Proxy([], {
    get: (_target, key) => (key === "then" ? undefined : throwing()),
    ownKeys: throwing,
    getOwnPropertyDescriptor: throwing,
    has: throwing,
  });
}

describe("a reply whose rows throw when they are read", () => {
  const readableRow = {
    reference: FIRST_REFERENCE,
    is_new: true,
    is_same_payload: true,
    is_notified: false,
  };

  it.each([
    ["a row that throws", () => [unreadable()]],
    ["a list that throws", () => unreadable()],
    ["a row that throws after a good one", () => [readableRow, unreadable()]],
  ])(
    "is the store error with no cause and no marker for every operation: %s",
    async (_name, reply) => {
      for (const [, run] of OPERATIONS) {
        answerWith(reply());

        const failure = await rejectionOf(run(newStore(...REFERENCES)));

        expect(failure).toBeInstanceOf(ContactSubmissionStoreError);
        expect((failure as Error).cause).toBeUndefined();
        expect(markersFoundOn(failure, ALL_MARKERS)).toEqual([]);
      }
    },
  );
});
