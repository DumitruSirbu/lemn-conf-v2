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
    /contact field/,
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

  it("accepts every id the domain accepts that the digest fixture sits beside", () => {
    expect(() => {
      requireValidLookup({
        clientRequestId: CLIENT_REQUEST_ID,
        payloadDigest: DIGEST_A,
      });
    }).not.toThrow();
  });
});
