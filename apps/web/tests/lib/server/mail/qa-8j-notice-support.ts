import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  snapshotSubmission,
  validateContactFields,
  type ContactFields,
  type Design,
  type PriceBook,
  type SubmissionSnapshot,
} from "@lemnaria/configurator-domain";
import type { ContactSubmissionToRecord } from "@lemnaria/persistence";

import type { Content } from "@/i18n/content";
import { buildLeadNotification } from "@/lib/server/mail/lead-notification";
import type { MailMessage } from "@/lib/server/mail/mail-sender";

import { ro } from "../../../support/romanian-content";
import {
  VARIED_STRAIGHT_ARM,
  variedKitchensOf,
} from "../../../support/varied-kitchens";

// Invented, recognisable values: a test looks for them where the customer's text must not be.
export const QA_REFERENCE = "LM-QAQA2345";
export const QA_CLIENT_REQUEST_ID = "qa_request_0000000001";
export const QA_NAME = "Nume Fictiv 5d81c0";
export const QA_PHONE_AS_TYPED = "060 058 100";
export const QA_PHONE_NORMAL_FORM = "+37360058100";
export const QA_LOCALITY = "Localitate Marker 5d81c0";
export const QA_EMAIL = "qa-client-5d81c0@example.com";

export const CUSTOMER_MARKERS = [
  QA_NAME,
  QA_PHONE_AS_TYPED,
  QA_PHONE_NORMAL_FORM,
  QA_LOCALITY,
  QA_EMAIL,
];

/** A contact the domain's own validation accepted, with the e-mail channel so that every field has a line. */
export function acceptedContact(): ContactFields {
  const result = validateContactFields({
    name: QA_NAME,
    phone: QA_PHONE_AS_TYPED,
    locality: QA_LOCALITY,
    channel: "email",
    email: QA_EMAIL,
    consent: true,
    consentTextVersion: "placeholder",
  });
  if (!result.ok) throw new Error("the fixture contact is not valid");
  return result.contact;
}

export interface SnapshotBook {
  readonly book: PriceBook;
  readonly pricingVersion: string;
}

export const SAMPLE_BOOK: SnapshotBook = {
  book: SAMPLE_PRICE_BOOK,
  pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
};

/** The domain's public snapshot function, or nothing where it refuses the kitchen. */
export function snapshotUnder(
  design: Design,
  { book, pricingVersion }: SnapshotBook,
): SubmissionSnapshot | undefined {
  const result = snapshotSubmission({
    design,
    catalog: buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
    book,
    pricingVersion,
  });
  return result.ok ? result.snapshot : undefined;
}

export function requireSnapshot(design: Design): SubmissionSnapshot {
  const snapshot = snapshotUnder(design, SAMPLE_BOOK);
  if (snapshot === undefined)
    throw new Error("the fixture kitchen cannot be submitted");
  return snapshot;
}

function firstStraightKitchen(): Design {
  const [first] = variedKitchensOf(VARIED_STRAIGHT_ARM);
  if (first === undefined) throw new Error("the fixture has no kitchen");
  return first.design;
}

export const QA_SNAPSHOT = requireSnapshot(firstStraightKitchen());

export function designRequest(
  overrides: Partial<ContactSubmissionToRecord> = {},
): ContactSubmissionToRecord {
  return {
    clientRequestId: QA_CLIENT_REQUEST_ID,
    payloadDigest: "d".repeat(64),
    contact: acceptedContact(),
    locale: "ro",
    target: { kind: "design", design: { id: "design-qa", revision: "7" } },
    snapshot: QA_SNAPSHOT,
    ...overrides,
  };
}

export function callbackRequest(
  overrides: Partial<ContactSubmissionToRecord> = {},
): ContactSubmissionToRecord {
  return designRequest({
    target: { kind: "intent", intent: "callback" },
    snapshot: undefined,
    ...overrides,
  });
}

export function noticeOf(
  submission: ContactSubmissionToRecord,
  content: Content = ro,
): MailMessage {
  return buildLeadNotification({
    reference: QA_REFERENCE,
    submission,
    content,
  });
}

export function thrownBy(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error("expected the action to throw");
}
