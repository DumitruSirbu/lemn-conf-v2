import "server-only";

import {
  countedFormOfAddress,
  payloadDigestFields,
  type ContactSubmissionRequest,
} from "@lemnaria/configurator-domain";
import type {
  ContactSubmissionStore,
  ContactSubmissionToRecord,
  SentMarkStore,
  SubmissionLookup,
} from "@lemnaria/persistence";
import type { NextResponse } from "next/server";

import type { Content } from "@/i18n/content";
import { ContactFailure, causeOf } from "@/lib/server/contact/contact-failure";
import {
  reportContactSentMarkFailed,
  reportContactUnavailable,
} from "@/lib/server/contact/contact-log";
import {
  refuseStoredWithLine,
  refuseWithLine,
} from "@/lib/server/contact/contact-refusal";
import {
  rejectedAnswer,
  sentAnswer,
} from "@/lib/server/contact/contact-responses";
import {
  deliverNotice,
  inTheRegionOfAReference,
  proveTheNoticeIsBuildable,
  type KitchenLinkSources,
} from "@/lib/server/contact/deliver-notice";
import type { ContactJudge } from "@/lib/server/contact/judge-contact-request";
import {
  isRejectedAsAutomatic,
  parseContactRequest,
} from "@/lib/server/contact/parse-contact-request";
import {
  prepareSubmission,
  type PreparedSubmission,
  type SubmissionSources,
} from "@/lib/server/contact/prepare-submission";
import { beforeDeadline } from "@/lib/server/contact/sent-kitchen-link";
import type { DigesterOutcome } from "@/lib/server/digest/digest-secret";
import type { MailSenderCreation } from "@/lib/server/mail/create-mail-sender";
import type { MailSender } from "@/lib/server/mail/mail-sender";
import { contactUnavailableResponse } from "@/lib/server/rate-limit/rate-limited-response";

/** What a request is, as the route hands it over: the body's text, unparsed, and the hash of the visitor's cookie when
 *  there was one. Nothing here has been judged or parsed. */
export interface ContactBody {
  readonly text: string;
  readonly visitorHash: string | undefined;
}

/**
 * Every port is handed in, so nothing here is held at module level: the store, the sent mark, the mail's factory, the
 * one price book of the request, the digester made from the secret, the notice's language, the owned load, the judge's
 * maker, the clock, and where the notice's kitchen link comes from. A test hands the fakes; the route hands the
 * production ones, each made inside the request.
 */
export interface SubmitContactPorts
  extends SubmissionSources,
    KitchenLinkSources {
  readonly store: ContactSubmissionStore;
  readonly sentMarks: SentMarkStore;
  readonly createSender: () => MailSenderCreation;
  readonly digester: DigesterOutcome;
  readonly noticeContent: Content;
  readonly servedLocales: readonly string[];
  readonly makeJudge: (instant: Date) => ContactJudge;
  readonly now: () => Date;
}

/** A request that has reached its answer, or one whose row exists and whose notice is still to be passed on. */
type Reached =
  | { readonly kind: "answer"; readonly answer: NextResponse }
  | { readonly kind: "held"; readonly held: HeldRequest };

/** From the record's answer, or from a lookup that said stored and not notified once its tries were allowed. */
interface HeldRequest {
  readonly reference: string;
  readonly sender: MailSender;
  readonly request: ContactSubmissionRequest;
  readonly payloadDigest: string;
  /** What was stored, when this request stored it; absent for a retry, which reads the design again. */
  readonly stored: PreparedSubmission | undefined;
}

/** What a request is handed from its first judgement on: its body, the ports and the judge made for it. */
interface Intake {
  readonly body: ContactBody;
  readonly ports: SubmitContactPorts;
  readonly judge: ContactJudge;
}

/** What every step after the parse is handed. */
interface Admission extends Intake {
  readonly request: ContactSubmissionRequest;
  readonly sender: MailSender;
  readonly payloadDigest: string;
}

/** Stored, or about to be, and its notice still to be passed on. */
interface ForDelivery {
  readonly reference: string;
  readonly stored: HeldRequest["stored"];
}

/**
 * One contact request, from its body's text to its answer. Nothing is parsed before every request's judgement has
 * allowed, and then the order is: the shape, the honeypot and the time, the sender, the digest, the lookup; for a
 * stored request its tries, and for a new one its design, its notice proved buildable, its buckets and its record; and
 * last the notice, the send and the mark. Before a reference is held a throw is unavailable; from there it is the
 * answer a retry may follow.
 */
export async function submitContact(
  body: ContactBody,
  ports: SubmitContactPorts,
): Promise<NextResponse> {
  const reached = await takeBeforeAReference(body, ports);
  if (reached.kind === "answer") return reached.answer;
  return passOn(reached.held, ports);
}

/** The judge's making and every request's judgement are inside the guard, so a maker or a clock that throws is the one
 *  unavailable answer and never the framework's own. */
async function takeBeforeAReference(
  body: ContactBody,
  ports: SubmitContactPorts,
): Promise<Reached> {
  try {
    const judge = ports.makeJudge(ports.now());
    const limited = await judge.everyRequest();
    if (limited !== undefined) return endWithAnswer(limited);
    return await readAndLookUp({ body, ports, judge });
  } catch (thrown) {
    reportContactUnavailable(causeOf(thrown));
    return endWithAnswer(contactUnavailableResponse());
  }
}

/** The shape, then the honeypot and the time, which are answered before anything else of the request is made. */
async function readAndLookUp(intake: Intake): Promise<Reached> {
  const parsed = parseContactRequest(
    intake.body.text,
    intake.ports.servedLocales,
  );
  if (parsed.kind === "refused") {
    return endWithAnswer(refuseWithLine(parsed.refusal));
  }
  if (isRejectedAsAutomatic(parsed.request)) {
    return endWithAnswer(rejectedAnswer());
  }
  return lookUp(admit(intake, parsed.request));
}

/** Makes the sender once, before the lookup, and the digest over the coverage. */
function admit(intake: Intake, request: ContactSubmissionRequest): Admission {
  return {
    ...intake,
    request,
    sender: makeSender(intake.ports),
    payloadDigest: digestOf(request, intake.ports),
  };
}

async function lookUp(admission: Admission): Promise<Reached> {
  const { ports, request, payloadDigest } = admission;
  const lookup = await ports.store.lookUp({
    clientRequestId: request.clientRequestId,
    payloadDigest,
  });
  return lookup.kind === "absent"
    ? takeNewRequest(admission)
    : answerKnownRequest(lookup, admission);
}

/** The tries' judgement comes first, and only for an id the lookup answered stored or conflicting. */
async function answerKnownRequest(
  lookup: Exclude<SubmissionLookup, { kind: "absent" }>,
  admission: Admission,
): Promise<Reached> {
  const { judge, request } = admission;
  const limited = await judge.triesOfStoredRequest(request.clientRequestId);
  if (limited !== undefined) return endWithAnswer(limited);
  if (lookup.kind === "conflict") return endWithAnswer(refuseAsConflict());
  return lookup.isNotified
    ? endWithAnswer(sentAnswer(lookup.reference))
    : holdForDelivery(admission, {
        reference: lookup.reference,
        stored: undefined,
      });
}

/** The design and its notice are proved before a bucket of a new request is counted, so a request that stores nothing
 *  spends none of a browser's. */
async function takeNewRequest(admission: Admission): Promise<Reached> {
  const { ports, request, payloadDigest } = admission;
  const prepared = await prepareSubmission(request, payloadDigest, ports);
  if (prepared.kind === "refused") {
    return endWithAnswer(refuseWithLine(prepared.refusal));
  }
  proveTheNoticeIsBuildable(prepared.submission, ports.noticeContent);
  return countAndRecord(admission, prepared);
}

/** Whether to send is decided on `isNotified`, never on `isNew`: a twin that landed first may have sent already. */
async function countAndRecord(
  admission: Admission,
  prepared: Extract<PreparedSubmission, { kind: "ready" }>,
): Promise<Reached> {
  const { ports, judge, request, body } = admission;
  const limited = await judge.newRequest({
    visitorHash: body.visitorHash,
    countedAddress: countedAddressOf(request),
  });
  if (limited !== undefined) return endWithAnswer(limited);
  const recording = await ports.store.record(prepared.submission);
  if (recording.kind === "conflict") return endWithAnswer(refuseAsConflict());
  await markDesignSent(
    ports.sentMarks,
    prepared.submission,
    recording.reference,
  );
  return recording.isNotified
    ? endWithAnswer(sentAnswer(recording.reference))
    : holdForDelivery(admission, {
        reference: recording.reference,
        stored: prepared,
      });
}

/** How long the answer waits for the sent mark, in milliseconds: one keyed update, so a mark past this is hung and the
 *  customer's answer is not held for it. */
const SENT_MARK_DEADLINE_MS = 1000;

/**
 * The request is stored, so its design is sent whether or not the shop's notice then goes out. A design target is
 * `ready` only after `loadOwned` found that very id, so no id from the raw request reaches the store. A mark that fails
 * or outlasts `SENT_MARK_DEADLINE_MS` is a line and never an answer: the row exists, and a throw here would read as
 * "cannot be taken". The mark is idempotent, so a retry repairs one that was lost.
 */
async function markDesignSent(
  sentMarks: SentMarkStore,
  { target }: ContactSubmissionToRecord,
  reference: string,
): Promise<void> {
  if (target.kind !== "design") return;
  try {
    await beforeDeadline(
      sentMarks.markSent(target.design.id),
      SENT_MARK_DEADLINE_MS,
    );
  } catch {
    reportContactSentMarkFailed(reference);
  }
}

function holdForDelivery(
  { request, sender, payloadDigest }: Admission,
  { reference, stored }: ForDelivery,
): Reached {
  return {
    kind: "held",
    held: { reference, sender, request, payloadDigest, stored },
  };
}

/** The retry of a stored request reads its design again, and is refused for it as any request is, with a line that
 *  names the stored request. A request this call stored carries what it stored. A retry that finds its design marks it
 *  sent again; a stored request whose notice already went out is answered without that read, so a mark lost there is
 *  not repaired: the lookup carries no design id. */
function passOn(
  heldRequest: HeldRequest,
  ports: SubmitContactPorts,
): Promise<NextResponse> {
  const { reference } = heldRequest;
  return inTheRegionOfAReference(reference, async () => {
    const prepared = await storedOrPrepared(heldRequest, ports);
    if (prepared.kind === "refused") {
      return refuseStoredWithLine(prepared.refusal, reference);
    }
    if (heldRequest.stored === undefined) {
      await markDesignSent(ports.sentMarks, prepared.submission, reference);
    }
    return deliverNotice({
      reference,
      submission: prepared.submission,
      sender: heldRequest.sender,
      noticeContent: ports.noticeContent,
      store: ports.store,
      kitchenLinks: {
        readPublicOrigin: ports.readPublicOrigin,
        sentKitchenViews: ports.sentKitchenViews,
      },
    });
  });
}

function storedOrPrepared(
  { stored, request, payloadDigest }: HeldRequest,
  ports: SubmitContactPorts,
): Promise<PreparedSubmission> {
  return stored === undefined
    ? prepareSubmission(request, payloadDigest, ports)
    : Promise.resolve(stored);
}

function endWithAnswer(answer: NextResponse): Reached {
  return { kind: "answer", answer };
}

/** A request's id stored with another payload: written as a line and answered, with no reference. */
function refuseAsConflict(): NextResponse {
  return refuseWithLine({ code: "CONTACT_REQUEST_CONFLICT" });
}

/** The sender, made once for the request and before the lookup, so no factory runs after the record. */
function makeSender(ports: SubmitContactPorts): MailSender {
  const created = ports.createSender();
  if (created.kind !== "sender") throw new ContactFailure("sender-unusable");
  return created.sender;
}

/**
 * The request's digest over the coverage, and for a design the id of the version of the one book the snapshot is priced
 * with. The version is decided here, from the request's target, and the domain's function throws when it is handed one
 * the target does not take: the two statements agree by that throw, so a caller that decides wrongly is a failure and
 * never a digest over the wrong coverage.
 */
function digestOf(
  request: ContactSubmissionRequest,
  {
    digester,
    bookVersionId,
  }: { digester: DigesterOutcome; bookVersionId: string },
): string {
  if (digester.status !== "usable")
    throw new ContactFailure("digester-unusable");
  const bookVersion =
    request.target.kind === "design" ? bookVersionId : undefined;
  return digester.digest({
    purpose: "contact-payload",
    fields: payloadDigestFields(request, bookVersion),
  });
}

function countedAddressOf(
  request: ContactSubmissionRequest,
): string | undefined {
  const { channel, email } = request.contact;
  return channel === "email" && email !== undefined
    ? countedFormOfAddress(email)
    : undefined;
}
