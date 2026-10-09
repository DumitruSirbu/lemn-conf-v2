import { fc, test as propertyTest } from "@fast-check/vitest";
import { validateContactSubmission } from "@lemnaria/configurator-domain";
import { describe, expect, it } from "vitest";

import {
  requireValidClientRequestId,
  requireValidLookup,
  requireValidReference,
  requireValidSubmission,
} from "../src/contact-submission-store.js";
import type { ContactSubmissionToRecord } from "../src/contact-submission-store.js";
import { FakeContactSubmissionStore } from "../src/fake-contact-submission-store.js";
import { generateDesignId } from "../src/generate-design-id.js";
import {
  DIGEST_A,
  FAKE_DESIGN_ID,
  FAKE_SNAPSHOT,
  aCallbackSubmission,
  aDesignSubmission,
} from "./support/contact-submission-fixtures.js";

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
