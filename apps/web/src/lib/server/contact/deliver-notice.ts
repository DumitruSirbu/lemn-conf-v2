import "server-only";

import { CURRENT_SCHEMA_VERSION } from "@lemnaria/configurator-domain";
import type {
  ContactSubmissionStore,
  ContactSubmissionToRecord,
  SentKitchenViewRepository,
} from "@lemnaria/persistence";
import type { NextResponse } from "next/server";

import type { Content } from "@/i18n/content";
import { ContactFailure, causeOf } from "@/lib/server/contact/contact-failure";
import {
  reportContactMarkFailed,
  reportContactNoticeNotSent,
} from "@/lib/server/contact/contact-log";
import {
  CONTACT_NOTICE_NOT_SENT_CODE,
  CONTACT_NOTICE_NOT_SENT_RETRY_CODE,
  noticeNotSentAnswer,
  noticeNotSentRetryAnswer,
  sentAnswer,
} from "@/lib/server/contact/contact-responses";
import { mintSentKitchenLink } from "@/lib/server/contact/sent-kitchen-link";
import {
  composeLeadNotice,
  NOTICE_LOCALE,
  type LeadNoticeInput,
  type NoticeKitchenLink,
} from "@/lib/server/mail/lead-notification";
import {
  isRetryableMailFailure,
  isSendableMailMessage,
  type MailMessage,
  type MailOutcome,
  type MailSender,
} from "@/lib/server/mail/mail-sender";
import type { PublicOriginOutcome } from "@/lib/server/public-origin";

/** A reference's own shape that the generator can in principle draw, one chance in 2^40, so a message built with
 *  it is never sent: the one that is sent is built again with the stored reference. */
const PLACEHOLDER_REFERENCE = "LM-00000000";

/** A host that never resolves, and a link of the kitchen link's own shape under it, for the proof alone: a sent
 *  notice's link is only ever the one `mintSentKitchenLink` answered. */
const PLACEHOLDER_ORIGIN = "https://example.invalid";
const PLACEHOLDER_PUBLIC_ORIGIN: PublicOriginOutcome = Object.freeze({
  status: "configured",
  origin: PLACEHOLDER_ORIGIN,
});
const PLACEHOLDER_KITCHEN_LINK: NoticeKitchenLink = Object.freeze({
  kind: "link",
  url: `${PLACEHOLDER_ORIGIN}/${NOTICE_LOCALE}/s/000000000000`,
});

const NO_KITCHEN_LINK: NoticeKitchenLink = Object.freeze({
  kind: "unavailable",
});

/** Where the notice's view-only link comes from: the public origin, read again for each attempt, and the table its
 *  frozen copies are recorded in. */
export interface KitchenLinkSources {
  readonly readPublicOrigin: () => PublicOriginOutcome;
  readonly sentKitchenViews: SentKitchenViewRepository;
}

/** What a stored request needs to be passed on: its reference, what was stored, the sender, the notice's language. */
export interface Delivery {
  readonly reference: string;
  readonly submission: ContactSubmissionToRecord;
  readonly sender: MailSender;
  readonly noticeContent: Content;
  readonly store: Pick<ContactSubmissionStore, "markNotified">;
  readonly kitchenLinks: KitchenLinkSources;
}

/**
 * Proves the notice can be made, and may be sent, before the request is stored, with a kitchen link and without one,
 * as either may be sent: a request whose notice cannot be built, or that no sender would take, is refused and stores
 * nothing. The messages are dropped, and never sent: their reference and link are placeholders, and the one sent is
 * built again with the stored reference.
 */
export function proveTheNoticeIsBuildable(
  submission: ContactSubmissionToRecord,
  noticeContent: Content,
): void {
  for (const kitchenLink of [PLACEHOLDER_KITCHEN_LINK, NO_KITCHEN_LINK]) {
    const message = noticeFor({
      reference: PLACEHOLDER_REFERENCE,
      submission,
      content: noticeContent,
      kitchenLink,
      publicOrigin: PLACEHOLDER_PUBLIC_ORIGIN,
    });
    if (!isSendableMailMessage(message)) {
      throw new ContactFailure("notice-unbuildable");
    }
  }
}

function noticeFor(input: LeadNoticeInput): MailMessage {
  try {
    return composeLeadNotice(input);
  } catch {
    throw new ContactFailure("notice-unbuildable");
  }
}

/**
 * Everything from the moment a reference is held. A throw here is the answer a retry may follow, with its line and the
 * reference, and never "cannot be taken": the row exists.
 */
export async function inTheRegionOfAReference(
  reference: string,
  run: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await run();
  } catch (thrown) {
    return notPassedOnBecauseOfOurs(reference, thrown);
  }
}

/**
 * Passes a stored request on: a fresh kitchen link, the notice with its stored reference, the send, and the mark. A
 * link that cannot be had leaves the notice without one and changes no answer. The mail's failure is one of two
 * outward answers by the mail's own rule of which a retry may follow; a mark that fails after an accepted send is still
 * a success, with its line.
 */
export async function deliverNotice(delivery: Delivery): Promise<NextResponse> {
  const { reference, submission, sender, noticeContent, kitchenLinks } =
    delivery;
  const publicOrigin = kitchenLinks.readPublicOrigin();
  const kitchenLink = await kitchenLinkFor(delivery, publicOrigin);
  const outcome = await sender.send(
    noticeFor({
      reference,
      submission,
      content: noticeContent,
      kitchenLink,
      publicOrigin,
    }),
  );
  if (!outcome.ok) return notPassedOnByTheMail(reference, outcome);
  return markedAsSent(delivery);
}

/** A callback has no kitchen, so nothing is minted for it. A design's link is the mint's own answer, handed on as it
 *  came, so no other string can stand for it; the notice holds it only under the origin it was minted under. The
 *  snapshot was made from a design read at the current schema. */
function kitchenLinkFor(
  { submission, kitchenLinks }: Delivery,
  origin: PublicOriginOutcome,
): Promise<NoticeKitchenLink> {
  const { clientRequestId, target, snapshot } = submission;
  if (target.kind === "intent" || snapshot === undefined) {
    return Promise.resolve(NO_KITCHEN_LINK);
  }
  return mintSentKitchenLink(
    {
      clientRequestId,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      document: snapshot.document,
    },
    { origin, repository: kitchenLinks.sentKitchenViews },
  );
}

/** The notice was accepted, so whatever the mark does the request is a success: a mark that fails is a line. */
async function markedAsSent({
  reference,
  submission,
  store,
}: Delivery): Promise<NextResponse> {
  try {
    await store.markNotified(submission.clientRequestId);
  } catch {
    reportContactMarkFailed(reference);
  }
  return sentAnswer(reference);
}

function notPassedOnByTheMail(
  reference: string,
  outcome: Extract<MailOutcome, { ok: false }>,
): NextResponse {
  const mayRetry = isRetryableMailFailure(outcome.kind);
  reportContactNoticeNotSent({
    code: mayRetry
      ? CONTACT_NOTICE_NOT_SENT_RETRY_CODE
      : CONTACT_NOTICE_NOT_SENT_CODE,
    failure: {
      kind: "mail",
      failureKind: outcome.kind,
      providerStatus: outcome.status,
    },
    reference,
  });
  return mayRetry ? noticeNotSentRetryAnswer() : noticeNotSentAnswer();
}

function notPassedOnBecauseOfOurs(
  reference: string,
  thrown: unknown,
): NextResponse {
  reportContactNoticeNotSent({
    code: CONTACT_NOTICE_NOT_SENT_RETRY_CODE,
    failure: { kind: "cause", cause: causeOf(thrown) },
    reference,
  });
  return noticeNotSentRetryAnswer();
}
