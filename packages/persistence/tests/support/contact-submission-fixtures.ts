import type {
  DesignReference,
  SubmissionSnapshot,
} from "@lemnaria/configurator-domain";

import type { ContactSubmissionToRecord } from "../../src/contact-submission-store.js";

export const DIGEST_A = "a".repeat(64);
export const DIGEST_B = "b".repeat(64);

/** Recognisable and fake, so a test can search a message, a stack or an inspected error for them. */
export const FAKE_NAME = "Zorba Fakeperson";
export const FAKE_PHONE = "+37300000017";
/** Its own value, not the phone's: a store that wrote the phone into the normal-form column would show. */
export const FAKE_PHONE_NORMAL_FORM = "+37300000018";
export const FAKE_EMAIL = "zorba.fakeperson@example.invalid";
export const FAKE_LOCALITY = "Fakeville-Nowhere";
export const FAKE_DOCUMENT_MARKER = "fake-document-marker";
export const FAKE_DESIGN_ID = "FakeDesignId_0000000";

const STORED_DESIGN_REVISION = "7";

/** The shape `priceDesign` returns, with nothing priced: this suite stores it and never reads it. */
const FAKE_PRICED_DESIGN: SubmissionSnapshot["priced"] = {
  currency: "MDL",
  pricingVersion: "fake-book-1",
  status: "estimate",
  amountsProvisional: true,
  lines: [],
  totalMinor: 0,
  overflowingPlacementIds: [],
  totalIsFlagged: false,
};

export const FAKE_SNAPSHOT: SubmissionSnapshot = {
  document: JSON.stringify({ marker: FAKE_DOCUMENT_MARKER }),
  priced: FAKE_PRICED_DESIGN,
};

/** A request for a design, stored under `clientRequestId`. */
export function aDesignSubmission(
  clientRequestId: string,
  payloadDigest: string = DIGEST_A,
): ContactSubmissionToRecord {
  return {
    clientRequestId,
    payloadDigest,
    contact: {
      name: FAKE_NAME,
      phone: FAKE_PHONE,
      phoneNormalForm: FAKE_PHONE_NORMAL_FORM,
      locality: FAKE_LOCALITY,
      channel: "email",
      email: FAKE_EMAIL,
      consentTextVersion: "placeholder",
    },
    locale: "ro",
    target: {
      kind: "design",
      design: { id: FAKE_DESIGN_ID, revision: STORED_DESIGN_REVISION },
    },
    snapshot: FAKE_SNAPSHOT,
  };
}

/** A request for the design `design` names, whatever the fixture's own design is. */
export function aDesignSubmissionNaming(
  clientRequestId: string,
  design: DesignReference,
): ContactSubmissionToRecord {
  return {
    ...aDesignSubmission(clientRequestId),
    target: { kind: "design", design },
  };
}

/** A callback: no design, so no snapshot, and a channel that needs no e-mail. */
export function aCallbackSubmission(
  clientRequestId: string,
  payloadDigest: string = DIGEST_A,
): ContactSubmissionToRecord {
  const design = aDesignSubmission(clientRequestId, payloadDigest);
  return {
    ...design,
    contact: { ...design.contact, channel: "phone", email: undefined },
    target: { kind: "intent", intent: "callback" },
    snapshot: undefined,
  };
}
