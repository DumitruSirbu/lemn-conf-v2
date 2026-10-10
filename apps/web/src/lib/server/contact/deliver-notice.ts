import "server-only";

import type { ContactSubmissionStore } from "@lemnaria/persistence";
import type { NextResponse } from "next/server";

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
import type { Content } from "@/i18n/content";
import { buildLeadNotification } from "@/lib/server/mail/lead-notification";
import {
  isRetryableMailFailure,
  type MailMessage,
  type MailOutcome,
  type MailSender,
} from "@/lib/server/mail/mail-sender";
import type { ContactSubmissionToRecord } from "@lemnaria/persistence";

/** A reference's own shape, which no stored request has, so a message built with it can never be the one sent. */
const PLACEHOLDER_REFERENCE = "LM-00000000";

/** What a stored request needs to be passed on: its reference, what was stored, the sender, the notice's language. */
export interface Delivery {
  readonly reference: string;
  readonly submission: ContactSubmissionToRecord;
  readonly sender: MailSender;
  readonly noticeContent: Content;
  readonly store: Pick<ContactSubmissionStore, "markNotified">;
}

/**
 * Proves the notice can be made before the request is stored: a request whose notice cannot be built is refused and
 * stores nothing. The message is dropped, and never sent: its reference is a placeholder, and the one sent is built
 * again with the stored one.
 */
export function proveTheNoticeIsBuildable(
  submission: ContactSubmissionToRecord,
  noticeContent: Content,
): void {
  noticeFor(PLACEHOLDER_REFERENCE, submission, noticeContent);
}

function noticeFor(
  reference: string,
  submission: ContactSubmissionToRecord,
  noticeContent: Content,
): MailMessage {
  try {
    return buildLeadNotification({
      reference,
      submission,
      content: noticeContent,
    });
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
 * Passes a stored request on: the notice with its stored reference, the send, and the mark. The mail's failure is one
 * of two outward answers by the mail's own rule of which a retry may follow; a mark that fails after an accepted
 * send is still a success, with its line.
 */
export async function deliverNotice(delivery: Delivery): Promise<NextResponse> {
  const { reference, submission, sender, noticeContent } = delivery;
  const outcome = await sender.send(
    noticeFor(reference, submission, noticeContent),
  );
  if (!outcome.ok) return notPassedOnByTheMail(reference, outcome);
  return markedAsSent(delivery);
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
