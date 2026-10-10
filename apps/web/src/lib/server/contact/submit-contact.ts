import "server-only";

import {
  countedFormOfAddress,
  payloadDigestFields,
  type ContactSubmissionRequest,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import type {
  ContactSubmissionStore,
  SubmissionLookup,
  SubmissionRecording,
} from "@lemnaria/persistence";
import type { NextResponse } from "next/server";

import type { Content } from "@/i18n/content";
import { ContactFailure, causeOf } from "@/lib/server/contact/contact-failure";
import {
  reportContactRefused,
  reportContactStoredRequestRefused,
  reportContactUnavailable,
} from "@/lib/server/contact/contact-log";
import {
  rejectedAnswer,
  requestConflictAnswer,
  sentAnswer,
} from "@/lib/server/contact/contact-responses";
import {
  deliverNotice,
  inTheRegionOfAReference,
  proveTheNoticeIsBuildable,
} from "@/lib/server/contact/deliver-notice";
import type { ContactJudge } from "@/lib/server/contact/judge-contact-request";
import {
  isRejectedAsAutomatic,
  parseContactRequest,
  prepareSubmission,
  type PreparedSubmission,
  type SubmissionSources,
} from "@/lib/server/contact/prepare-submission";
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
 * Every port is handed in, so nothing here is held at module level: the store, the mail's factory, the one price book
 * of the request, the digester made from the secret, the notice's language, the owned load, the judge's maker and the
 * clock. A test hands the fakes; the route hands the production ones, each made inside the request.
 */
export interface SubmitContactPorts extends SubmissionSources {
  readonly store: ContactSubmissionStore;
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

/** What every step after the parse is handed. */
interface Admission {
  readonly body: ContactBody;
  readonly ports: SubmitContactPorts;
  readonly judge: ContactJudge;
  readonly request: ContactSubmissionRequest;
  readonly sender: MailSender;
  readonly payloadDigest: string;
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
  const reached = await beforeAReference(body, ports);
  if (reached.kind === "answer") return reached.answer;
  return passedOn(reached.held, ports);
}

/** The judge's making and every request's judgement are inside the guard, so a maker or a clock that throws is the one
 *  unavailable answer and never the framework's own. */
async function beforeAReference(
  body: ContactBody,
  ports: SubmitContactPorts,
): Promise<Reached> {
  try {
    const judge = ports.makeJudge(ports.now());
    const limited = await judge.everyRequest();
    if (limited !== undefined) return answered(limited);
    return await toTheLookupAndBeyond(body, ports, judge);
  } catch (thrown) {
    reportContactUnavailable(causeOf(thrown));
    return answered(contactUnavailableResponse());
  }
}

async function toTheLookupAndBeyond(
  body: ContactBody,
  ports: SubmitContactPorts,
  judge: ContactJudge,
): Promise<Reached> {
  const parsed = parseContactRequest(body.text, ports.servedLocales);
  if (parsed.kind === "answer") return answered(parsed.answer);
  const { request } = parsed;
  if (isRejectedAsAutomatic(request)) return answered(rejectedAnswer());
  const sender = senderOrFailure(ports);
  const payloadDigest = digestOf(request, ports);
  const admission = { body, ports, judge, request, sender, payloadDigest };
  const lookup = await ports.store.lookUp({
    clientRequestId: request.clientRequestId,
    payloadDigest,
  });
  return afterTheLookup(lookup, admission);
}

function afterTheLookup(
  lookup: SubmissionLookup,
  admission: Admission,
): Promise<Reached> {
  if (lookup.kind === "absent") return aNewRequest(admission);
  return aStoredOrConflictingRequest(lookup, admission);
}

/** The tries' judgement comes first, and only for an id the lookup answered stored or conflicting. */
async function aStoredOrConflictingRequest(
  lookup: Exclude<SubmissionLookup, { kind: "absent" }>,
  admission: Admission,
): Promise<Reached> {
  const { judge, request } = admission;
  const limited = await judge.triesOfStoredRequest(request.clientRequestId);
  if (limited !== undefined) return answered(limited);
  if (lookup.kind === "conflict") return answered(conflict());
  return lookup.isNotified
    ? answered(sentAnswer(lookup.reference))
    : held(lookup.reference, admission, undefined);
}

/** The design and its notice are proved before a bucket of a new request is counted, so a request that stores nothing
 *  spends none of a browser's. */
async function aNewRequest(admission: Admission): Promise<Reached> {
  const { ports, judge, request, payloadDigest, body } = admission;
  const prepared = await prepareSubmission(request, payloadDigest, ports);
  if (prepared.kind === "refused") {
    reportContactRefused(prepared.code);
    return answered(prepared.answer);
  }
  proveTheNoticeIsBuildable(prepared.submission, ports.noticeContent);
  const limited = await judge.newRequest({
    visitorHash: body.visitorHash,
    countedAddress: countedAddressOf(request),
  });
  if (limited !== undefined) return answered(limited);
  const recording = await ports.store.record(prepared.submission);
  return afterTheRecord(recording, admission, prepared);
}

/** Whether to send is decided on `isNotified`, never on `isNew`: a twin that landed first may have sent already. */
function afterTheRecord(
  recording: SubmissionRecording,
  admission: Admission,
  prepared: PreparedSubmission,
): Reached {
  if (recording.kind === "conflict") return answered(conflict());
  return recording.isNotified
    ? answered(sentAnswer(recording.reference))
    : held(recording.reference, admission, prepared);
}

function held(
  reference: string,
  { request, sender, payloadDigest }: Admission,
  stored: HeldRequest["stored"],
): Reached {
  return {
    kind: "held",
    held: { reference, sender, request, payloadDigest, stored },
  };
}

/** The retry of a stored request reads its design again, and is refused for it as any request is, with a line that
 *  names the stored request. A request this call stored carries what it stored. */
function passedOn(
  heldRequest: HeldRequest,
  ports: SubmitContactPorts,
): Promise<NextResponse> {
  const { reference } = heldRequest;
  return inTheRegionOfAReference(reference, async () => {
    const prepared = await storedOrPrepared(heldRequest, ports);
    if (prepared.kind === "refused") {
      reportContactStoredRequestRefused(prepared.code, reference);
      return prepared.answer;
    }
    return deliverNotice({
      reference,
      submission: prepared.submission,
      sender: heldRequest.sender,
      noticeContent: ports.noticeContent,
      store: ports.store,
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

function answered(answer: NextResponse): Reached {
  return { kind: "answer", answer };
}

function conflict(): NextResponse {
  reportContactRefused("CONTACT_REQUEST_CONFLICT");
  return requestConflictAnswer();
}

/** The sender, made once for the request and before the lookup, so no factory runs after the record. */
function senderOrFailure(ports: SubmitContactPorts): MailSender {
  const created = ports.createSender();
  if (created.kind !== "sender") throw new ContactFailure("sender-unusable");
  return created.sender;
}

/** The request's digest over the coverage, and for a design the version of the one book the snapshot is priced with. */
function digestOf(
  request: ContactSubmissionRequest,
  { digester, book }: { digester: DigesterOutcome; book: PriceBook },
): string {
  if (digester.status !== "usable")
    throw new ContactFailure("digester-unusable");
  const bookVersion =
    request.target.kind === "design" ? book.version : undefined;
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
