import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  snapshotSubmission,
  validateContactFields,
  type ContactFields,
  type ContactFieldsInput,
  type Design,
  type SubmissionSnapshot,
} from "@lemnaria/configurator-domain";
import type { ContactSubmissionToRecord } from "@lemnaria/persistence";

import type {
  LeadNoticeInput,
  NoticeKitchenLink,
} from "@/lib/server/mail/lead-notification";

import { ro } from "../../../support/romanian-content";
import {
  VARIED_L_ARM,
  VARIED_U_ARM,
  variedKitchensOf,
  type VariedArm,
} from "../../../support/varied-kitchens";

// Fictitious throughout: the origin is a reserved name that resolves nowhere, the numbers are no one's.
export const FIXTURE_ORIGIN = "https://example.invalid";
export const FIXTURE_TOKEN = "Fixture0Tok1";
export const FIXTURE_KITCHEN_URL = `${FIXTURE_ORIGIN}/ro/s/${FIXTURE_TOKEN}`;
export const FIXTURE_REFERENCE = "LM-FIXT2345";
export const FIXTURE_REQUEST_ID = "fixture_request_000001";
export const FIXTURE_REVISION = "7";

export const KITCHEN_LINK: NoticeKitchenLink = {
  kind: "link",
  url: FIXTURE_KITCHEN_URL,
};
export const NO_LINK: NoticeKitchenLink = { kind: "unavailable" };

export function fixtureContact(
  overrides: ContactFieldsInput = {},
): ContactFields {
  const result = validateContactFields({
    name: "Ion Exemplu",
    phone: "069 000 123",
    locality: "Orhei",
    channel: "whatsapp",
    consent: true,
    consentTextVersion: "placeholder",
    ...overrides,
  });
  if (!result.ok) throw new Error("the fixture contact is not valid");
  return result.contact;
}

export function snapshotOf(design: Design): SubmissionSnapshot | undefined {
  const result = snapshotSubmission({
    design,
    catalog: buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
  });
  return result.ok ? result.snapshot : undefined;
}

/** The arm's kitchens the domain would store, each with its snapshot. */
export function sendableKitchensOf(arm: VariedArm): readonly {
  readonly design: Design;
  readonly snapshot: SubmissionSnapshot;
}[] {
  return variedKitchensOf(arm).flatMap(({ design }) => {
    const snapshot = snapshotOf(design);
    return snapshot === undefined ? [] : [{ design, snapshot }];
  });
}

function firstSendable(arm: VariedArm): SubmissionSnapshot {
  const [first] = sendableKitchensOf(arm);
  if (first === undefined) throw new Error("the arm has no sendable kitchen");
  return first.snapshot;
}

export const L_SNAPSHOT = firstSendable(VARIED_L_ARM);
export const U_SNAPSHOT = firstSendable(VARIED_U_ARM);

export function designSubmission(
  overrides: Partial<ContactSubmissionToRecord> = {},
): ContactSubmissionToRecord {
  return {
    clientRequestId: FIXTURE_REQUEST_ID,
    payloadDigest: "f".repeat(64),
    contact: fixtureContact(),
    locale: "ro",
    target: {
      kind: "design",
      design: { id: "design-fixture", revision: FIXTURE_REVISION },
    },
    snapshot: L_SNAPSHOT,
    ...overrides,
  };
}

export function callbackSubmission(
  overrides: Partial<ContactSubmissionToRecord> = {},
): ContactSubmissionToRecord {
  return designSubmission({
    target: { kind: "intent", intent: "callback" },
    snapshot: undefined,
    ...overrides,
  });
}

export function noticeInput(
  submission: ContactSubmissionToRecord,
  kitchenLink: NoticeKitchenLink = KITCHEN_LINK,
): LeadNoticeInput {
  return { reference: FIXTURE_REFERENCE, submission, content: ro, kitchenLink };
}

/** A name and a locality made of what markup, a script and an attribute would need, with nothing that breaks a line. */
export const HOSTILE_NAME = `Ion <script>alert("x")</script> & 'O'Brien' </td><img src=x onerror=y>`;
export const HOSTILE_LOCALITY = `Balti "><a href="javascript:alert(1)">x</a> {{name}}`;

export interface LeadNoticeFixture {
  readonly name: string;
  readonly input: LeadNoticeInput;
}

/** What the owner's preview renders: each variant a reader of the shop's inbox can meet. */
export const LEAD_NOTICE_FIXTURES: readonly LeadNoticeFixture[] = [
  {
    name: "design-with-link",
    input: noticeInput(designSubmission()),
  },
  {
    name: "design-link-unavailable",
    input: noticeInput(
      designSubmission({ contact: fixtureContact({ channel: "phone" }) }),
      NO_LINK,
    ),
  },
  {
    name: "special-characters",
    input: noticeInput(
      designSubmission({
        contact: {
          ...fixtureContact(),
          name: HOSTILE_NAME,
          locality: HOSTILE_LOCALITY,
        },
      }),
    ),
  },
  {
    name: "russian-client",
    input: noticeInput(designSubmission({ locale: "ru" })),
  },
  {
    name: "email-channel-u-kitchen",
    input: noticeInput(
      designSubmission({
        contact: fixtureContact({
          channel: "email",
          email: "ion.exemplu+oferta@example.invalid",
          locality: "",
        }),
        snapshot: U_SNAPSHOT,
      }),
    ),
  },
  {
    name: "callback",
    input: noticeInput(callbackSubmission()),
  },
];

export function fixtureNamed(name: string): LeadNoticeInput {
  const fixture = LEAD_NOTICE_FIXTURES.find(
    (candidate) => candidate.name === name,
  );
  if (fixture === undefined) throw new Error(`no fixture named ${name}`);
  return fixture.input;
}
