import { fc } from "@fast-check/vitest";
import {
  PAYLOAD_DIGEST_FIELDS,
  type ConsentTextVersion,
  type ContactIntent,
  type ContactSubmissionRequest,
  type PayloadDigestField,
  type SubmissionTarget,
} from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  FAILED_OUTCOME,
  UNANSWERED_OUTCOME,
  type ContactOutcome,
} from "@/contact/contact-answer";
import type { ContactFormValues } from "@/contact/contact-form-model";
import {
  coveredProjectionOf,
  historyAfterOutcome,
  historyAfterSend,
  isSameProjection,
  NO_SEND_YET,
  prepareSend,
  type PreparedSend,
  type SendHistory,
} from "@/contact/contact-request-identity";

type PreparedOk = Extract<PreparedSend, { readonly ok: true }>;

const BOOK_VERSION = "book-2026-10";

const VALUES: ContactFormValues = {
  name: "Ana Popescu",
  phone: "069 123 456",
  locality: "Chisinau",
  channel: "email",
  email: "ana@example.com",
  consent: true,
  honeypot: "",
};

const DESIGN_TARGET: SubmissionTarget = {
  kind: "design",
  design: { id: "design0123456789abcde", revision: "7" },
};

const INTENT_TARGET: SubmissionTarget = { kind: "intent", intent: "callback" };

function submissionOf(
  overrides: Partial<{
    values: Partial<ContactFormValues>;
    target: SubmissionTarget;
    elapsedMs: number;
  }> = {},
) {
  return {
    values: { ...VALUES, ...overrides.values },
    target: overrides.target ?? DESIGN_TARGET,
    locale: "ro" as const,
    elapsedMs: overrides.elapsedMs ?? 4000,
  };
}

/** Ids of the generator's own length, numbered so that two are never equal and the call count is readable. */
function numberedGenerator() {
  const calls = { count: 0 };
  const generateId = () => {
    calls.count += 1;
    return `request-id-${String(calls.count).padStart(8, "0")}`;
  };
  return { calls, generateId };
}

/** Used by every send that is not handed its own generator, so two such sends never meet the same id by chance. */
const SHARED_IDS = numberedGenerator();

function sendOf(
  history: SendHistory,
  submission = submissionOf(),
  generateId = SHARED_IDS.generateId,
): PreparedOk {
  const prepared = prepareSend({
    history,
    submission,
    bookVersion: submission.target.kind === "design" ? BOOK_VERSION : undefined,
    generateId,
  });
  if (!prepared.ok) throw new Error("the fixture's send was refused");
  return prepared;
}

describe("which id a send carries", () => {
  it("is a new id for the first send, asked of the generator once", () => {
    const { calls, generateId } = numberedGenerator();

    const first = sendOf(NO_SEND_YET, submissionOf(), generateId);

    expect(first.body.clientRequestId).toBe("request-id-00000001");
    expect(calls.count).toBe(1);
  });

  it("is the same id for an unchanged request after a failure, and the generator is not asked", () => {
    const { calls, generateId } = numberedGenerator();
    const first = sendOf(NO_SEND_YET, submissionOf(), generateId);
    const afterFailure = historyAfterOutcome(
      historyAfterSend(first),
      FAILED_OUTCOME,
    );

    const retry = sendOf(
      afterFailure,
      submissionOf({ elapsedMs: 9000 }),
      generateId,
    );

    expect(retry.body.clientRequestId).toBe(first.body.clientRequestId);
    expect(calls.count).toBe(1);
  });

  it("is the same id for an unchanged request after an unanswered send, as after a failed one, and the id is not spent", () => {
    const { calls, generateId } = numberedGenerator();
    const first = sendOf(NO_SEND_YET, submissionOf(), generateId);
    const afterUnanswered = historyAfterOutcome(
      historyAfterSend(first),
      UNANSWERED_OUTCOME,
    );

    const retry = sendOf(
      afterUnanswered,
      submissionOf({ elapsedMs: 9000 }),
      generateId,
    );

    expect(afterUnanswered).toEqual(historyAfterSend(first));
    expect(retry.body.clientRequestId).toBe(first.body.clientRequestId);
    expect(retry.body.elapsedMs).toBe(9000);
    expect(calls.count).toBe(1);
  });

  it("is a retry whose body equals the first's but for the time", () => {
    const first = sendOf(NO_SEND_YET, submissionOf({ elapsedMs: 1500 }));
    const afterFailure = historyAfterOutcome(
      historyAfterSend(first),
      FAILED_OUTCOME,
    );

    const retry = sendOf(afterFailure, submissionOf({ elapsedMs: 8200 }));

    expect({ ...retry.body, elapsedMs: 0 }).toEqual({
      ...first.body,
      elapsedMs: 0,
    });
    expect(retry.body.elapsedMs).toBe(8200);
  });

  it("is the same id when only the honeypot's text differs, since the digest leaves it out", () => {
    const first = sendOf(NO_SEND_YET);
    const history = historyAfterSend(first);

    const next = sendOf(history, submissionOf({ values: { honeypot: "bot" } }));

    expect(next.body.clientRequestId).toBe(first.body.clientRequestId);
  });

  it("is a new id when only the design's revision differs", () => {
    const first = sendOf(NO_SEND_YET);
    const edited = submissionOf({
      target: {
        kind: "design",
        design: { id: "design0123456789abcde", revision: "8" },
      },
    });

    const next = sendOf(historyAfterSend(first), edited);

    expect(next.body.clientRequestId).not.toBe(first.body.clientRequestId);
  });

  it("is a new id when only the typed name differs", () => {
    const first = sendOf(NO_SEND_YET);

    const next = sendOf(
      historyAfterSend(first),
      submissionOf({ values: { name: "Ana P." } }),
    );

    expect(next.body.clientRequestId).not.toBe(first.body.clientRequestId);
  });

  it("is the same id when only the whitespace around a name differs, since the digest covers what the domain read", () => {
    const first = sendOf(NO_SEND_YET);

    const next = sendOf(
      historyAfterSend(first),
      submissionOf({ values: { name: "  Ana Popescu  " } }),
    );

    expect(next.body.clientRequestId).toBe(first.body.clientRequestId);
  });

  it("is a new id after a conflict, though nothing the form holds changed", () => {
    const first = sendOf(NO_SEND_YET);
    const afterConflict = historyAfterOutcome(historyAfterSend(first), {
      kind: "conflict",
    });

    const next = sendOf(afterConflict);

    expect(next.body.clientRequestId).not.toBe(first.body.clientRequestId);
  });

  it("keeps the id made after a conflict for the retries that follow it", () => {
    const first = sendOf(NO_SEND_YET);
    const second = sendOf(historyOf(first, { kind: "conflict" }));

    const third = sendOf(historyOf(second, FAILED_OUTCOME));

    expect(third.body.clientRequestId).toBe(second.body.clientRequestId);
    expect(second.body.clientRequestId).not.toBe(first.body.clientRequestId);
  });

  it("asks the generator once for a changed request, not once per attempt", () => {
    const { calls, generateId } = numberedGenerator();
    const first = sendOf(NO_SEND_YET, submissionOf(), generateId);

    sendOf(
      historyAfterSend(first),
      submissionOf({ values: { locality: "Balti" } }),
      generateId,
    );

    expect(calls.count).toBe(2);
  });

  it("is a new id when the browser's price book changed between two sends", () => {
    const first = sendOf(NO_SEND_YET);

    const next = prepareSend({
      history: historyAfterSend(first),
      submission: submissionOf(),
      bookVersion: "book-2026-11",
      generateId: SHARED_IDS.generateId,
    });

    expect(next.ok && next.body.clientRequestId).not.toBe(
      first.body.clientRequestId,
    );
  });

  it("refuses a generator that makes text the server would refuse as an id", () => {
    expect(() =>
      prepareSend({
        history: NO_SEND_YET,
        submission: submissionOf(),
        bookVersion: BOOK_VERSION,
        generateId: () => "short",
      }),
    ).toThrow(RangeError);
  });

  it("hands on the domain's refusal when the form is not valid, and no id is kept", () => {
    const refused = prepareSend({
      history: NO_SEND_YET,
      submission: submissionOf({ values: { consent: false } }),
      bookVersion: BOOK_VERSION,
      generateId: numberedGenerator().generateId,
    });

    expect(refused.ok).toBe(false);
  });
});

function historyOf(prepared: PreparedOk, outcome: ContactOutcome): SendHistory {
  return historyAfterOutcome(historyAfterSend(prepared), outcome);
}

describe("the ids of consecutive sends, over any sequence of edits and answers", () => {
  const VARIANTS = ["Ana", "Bia", "Cora"].flatMap((name) =>
    ["7", "8"].map((revision) =>
      submissionOf({
        values: { name },
        target: {
          kind: "design",
          design: { id: "design0123456789abcde", revision },
        },
      }),
    ),
  );

  const OUTCOMES: readonly ContactOutcome[] = [
    FAILED_OUTCOME,
    UNANSWERED_OUTCOME,
    { kind: "refused", issues: [{ field: "phone", code: "REQUIRED" }] },
    { kind: "conflict" },
    { kind: "design-not-current" },
    { kind: "does-not-fit" },
    { kind: "limited", waitSeconds: 60 },
    { kind: "sent", reference: "LM-7K3QWXY2" },
  ];

  const stepArb = fc.record({
    variant: fc.integer({ min: 0, max: VARIANTS.length - 1 }),
    outcome: fc.integer({ min: 0, max: OUTCOMES.length - 1 }),
    honeypot: fc.constantFrom("", "bot"),
    elapsedMs: fc.integer({ min: 0, max: 90_000 }),
  });

  it("share an id if and only if their covered projections are equal and no conflict came between", () => {
    fc.assert(
      fc.property(
        fc.array(stepArb, { minLength: 1, maxLength: 30 }),
        (steps) => {
          const { calls, generateId } = numberedGenerator();
          let history: SendHistory = NO_SEND_YET;
          let previous:
            | {
                id: string;
                variant: number;
                outcome: ContactOutcome;
                projection: PreparedOk["projection"];
              }
            | undefined;
          let idsChanged = 0;

          for (const step of steps) {
            const variant = VARIANTS[step.variant];
            if (variant === undefined) throw new Error("variant out of range");
            const submission = {
              ...variant,
              values: { ...variant.values, honeypot: step.honeypot },
              elapsedMs: step.elapsedMs,
            };
            const prepared = sendOf(history, submission, generateId);
            const outcome = OUTCOMES[step.outcome] ?? FAILED_OUTCOME;

            if (previous === undefined) {
              idsChanged += 1;
            } else {
              const isSameProjectionExpected =
                previous.variant === step.variant;
              expect(
                isSameProjection(previous.projection, prepared.projection),
              ).toBe(isSameProjectionExpected);
              const isSameIdExpected =
                isSameProjectionExpected &&
                previous.outcome.kind !== "conflict";
              expect(prepared.body.clientRequestId === previous.id).toBe(
                isSameIdExpected,
              );
              if (!isSameIdExpected) idsChanged += 1;
            }

            previous = {
              id: prepared.body.clientRequestId,
              variant: step.variant,
              outcome,
              projection: prepared.projection,
            };
            history = historyAfterOutcome(historyAfterSend(prepared), outcome);
          }

          expect(calls.count).toBe(idsChanged);
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe("what the covered projection holds", () => {
  type Coverable = Exclude<PayloadDigestField, "clientRequestId">;
  interface Subject {
    readonly request: ContactSubmissionRequest;
    readonly bookVersion: string | undefined;
  }

  const DESIGN_REQUEST: ContactSubmissionRequest = {
    contact: {
      name: "Ana Popescu",
      phone: "069 123 456",
      phoneNormalForm: "+37369123456",
      locality: "Chisinau",
      channel: "phone",
      email: undefined,
      consentTextVersion: "placeholder",
    },
    target: {
      kind: "design",
      design: { id: "design0123456789abcde", revision: "7" },
    },
    clientRequestId: "request-id-00000001",
    locale: "ro",
    isHoneypotFilled: false,
    elapsedMs: 4000,
  };
  const DESIGN_SUBJECT: Subject = {
    request: DESIGN_REQUEST,
    bookVersion: BOOK_VERSION,
  };
  const INTENT_SUBJECT: Subject = {
    request: { ...DESIGN_REQUEST, target: INTENT_TARGET },
    bookVersion: undefined,
  };

  function withContact(
    subject: Subject,
    change: Partial<ContactSubmissionRequest["contact"]>,
  ): Subject {
    return {
      ...subject,
      request: {
        ...subject.request,
        contact: { ...subject.request.contact, ...change },
      },
    };
  }

  function withDesign(
    subject: Subject,
    change: { id?: string; revision?: string },
  ): Subject {
    if (subject.request.target.kind !== "design")
      throw new Error("not a design");
    const { design } = subject.request.target;
    return {
      ...subject,
      request: {
        ...subject.request,
        target: { kind: "design", design: { ...design, ...change } },
      },
    };
  }

  /** The one change of the request that moves each covered field, written for every field the digest covers: a field
   *  the domain adds is a key this record lacks, which does not compile. */
  const CHANGE_OF: Readonly<
    Record<Coverable, { base: Subject; change: (subject: Subject) => Subject }>
  > = {
    locale: {
      base: DESIGN_SUBJECT,
      change: (subject) => ({
        ...subject,
        request: { ...subject.request, locale: "ru" },
      }),
    },
    targetKind: { base: DESIGN_SUBJECT, change: () => INTENT_SUBJECT },
    designId: {
      base: DESIGN_SUBJECT,
      change: (subject) => withDesign(subject, { id: "design9876543210abcde" }),
    },
    designRevision: {
      base: DESIGN_SUBJECT,
      change: (subject) => withDesign(subject, { revision: "8" }),
    },
    intent: {
      base: INTENT_SUBJECT,
      change: (subject) => ({
        ...subject,
        request: {
          ...subject.request,
          // The domain has one intent today; a second is what this field exists to tell apart.
          target: { kind: "intent", intent: "other" as ContactIntent },
        },
      }),
    },
    name: {
      base: DESIGN_SUBJECT,
      change: (subject) => withContact(subject, { name: "Ana P." }),
    },
    phone: {
      base: DESIGN_SUBJECT,
      change: (subject) => withContact(subject, { phone: "+373 69 123 456" }),
    },
    phoneNormalForm: {
      base: DESIGN_SUBJECT,
      change: (subject) =>
        withContact(subject, { phoneNormalForm: "+37369123457" }),
    },
    locality: {
      base: DESIGN_SUBJECT,
      change: (subject) => withContact(subject, { locality: "Balti" }),
    },
    channel: {
      base: DESIGN_SUBJECT,
      change: (subject) => withContact(subject, { channel: "whatsapp" }),
    },
    email: {
      base: DESIGN_SUBJECT,
      change: (subject) => withContact(subject, { email: "ana@example.com" }),
    },
    consentTextVersion: {
      base: DESIGN_SUBJECT,
      change: (subject) =>
        withContact(subject, {
          // The domain has one text today; a second is what this field exists to tell apart.
          consentTextVersion: "second" as ConsentTextVersion,
        }),
    },
    bookVersion: {
      base: DESIGN_SUBJECT,
      change: (subject) => ({ ...subject, bookVersion: "book-2026-11" }),
    },
  };

  const COVERED_FIELDS = PAYLOAD_DIGEST_FIELDS.filter(
    (field): field is Coverable => field !== "clientRequestId",
  );

  function projectionOf(subject: Subject) {
    return coveredProjectionOf(subject.request, subject.bookVersion);
  }

  it("holds every field the digest covers but the id, and the table below changes each of them", () => {
    expect(Object.keys(CHANGE_OF).sort()).toEqual([...COVERED_FIELDS].sort());
    expect(projectionOf(DESIGN_SUBJECT).map(([field]) => field)).toEqual(
      COVERED_FIELDS,
    );
  });

  it.each(COVERED_FIELDS)(
    "is a different projection when only %s's own change is made",
    (field) => {
      const { base, change } = CHANGE_OF[field];

      expect(
        isSameProjection(projectionOf(base), projectionOf(change(base))),
      ).toBe(false);
    },
  );

  it("is the same projection for the same request under another id, the time and the honeypot", () => {
    const another: Subject = {
      ...DESIGN_SUBJECT,
      request: {
        ...DESIGN_REQUEST,
        clientRequestId: "request-id-00000099",
        isHoneypotFilled: true,
        elapsedMs: 91_000,
      },
    };

    expect(
      isSameProjection(projectionOf(DESIGN_SUBJECT), projectionOf(another)),
    ).toBe(true);
  });

  it("is equal exactly when no covered field of a design request differs, for any subset of them", () => {
    const designFields = COVERED_FIELDS.filter(
      (field) =>
        CHANGE_OF[field].base === DESIGN_SUBJECT && field !== "targetKind",
    );
    expect(designFields.length).toBeGreaterThan(8);

    fc.assert(
      fc.property(fc.subarray(designFields), (differing) => {
        const changed = differing.reduce(
          (subject, field) => CHANGE_OF[field].change(subject),
          DESIGN_SUBJECT,
        );

        expect(
          isSameProjection(projectionOf(DESIGN_SUBJECT), projectionOf(changed)),
        ).toBe(differing.length === 0);
      }),
      { numRuns: 300 },
    );
  });
});
