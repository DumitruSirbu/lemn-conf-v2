import {
  parsePriceBook,
  SAMPLE_PRICE_BOOK,
  type PriceBook,
} from "@lemnaria/configurator-domain";
import { createTranslator } from "next-intl";
import { NextResponse, type NextRequest } from "next/server";

import { resolveContent, type Content } from "@/i18n/content";
import { routing } from "@/i18n/routing";
import roMessages from "@/messages/ro.json";
import { ContactFailure, causeOf } from "@/lib/server/contact/contact-failure";
import {
  reportContactRefused,
  reportContactUnavailable,
} from "@/lib/server/contact/contact-log";
import {
  bodyTooLargeAnswer,
  crossSiteAnswer,
  invalidAnswer,
  notJsonAnswer,
} from "@/lib/server/contact/contact-responses";
import { getContactSubmissionStore } from "@/lib/server/contact/contact-submission-store-instance";
import { makeContactJudge } from "@/lib/server/contact/judge-contact-request";
import {
  submitContact,
  type SubmitContactPorts,
} from "@/lib/server/contact/submit-contact";
import { isCrossSiteRequest } from "@/lib/server/cross-site-request";
import { readDigester } from "@/lib/server/digest/digest-secret";
import { loadOwnedDesign } from "@/lib/server/load-owned-design";
import { createMailSender } from "@/lib/server/mail/create-mail-sender";
import { NOTICE_LOCALE } from "@/lib/server/mail/lead-notification";
import { contactUnavailableResponse } from "@/lib/server/rate-limit/rate-limited-response";
import {
  readUtf8BodyWithLimit,
  type BoundedBodyFailure,
} from "@/lib/server/read-body-with-limit";
import { readVisitorHash } from "@/lib/server/visitor";

/** The body's bound, in bytes counted as they are read: a form's request is a few hundred, and the largest honeypot
 *  or name the schema admits is far under this (the security reader's figure, ADR 0154). */
const CONTACT_BODY_MAX_BYTES = 8 * 1024;

const JSON_MEDIA_TYPE = "application/json";

/** What the route has made for one request: the ports S4 is handed, or the answer for a request that could not be
 *  given them. */
type MadePorts =
  | { readonly kind: "ports"; readonly ports: SubmitContactPorts }
  | { readonly kind: "unavailable"; readonly answer: NextResponse };

/**
 * A contact request: the guard, the content type and the body to its bound come first and count nothing. Then the
 * ports are made inside the request and the body's text goes to the orchestration, which asks every request's
 * judgement before it parses a byte. This route parses nothing and asks no judgement, so the order of what is read
 * and counted is held in one place. No answer sets, clears or refreshes a cookie.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const refusal = refusalBeforeTheBody(request);
  if (refusal !== undefined) return refusal;
  const body = await readUtf8BodyWithLimit(
    request.body,
    CONTACT_BODY_MAX_BYTES,
  );
  if (!body.ok) return refusalOfUnreadableBody(body.failure);
  const made = madeProductionPorts(request);
  if (made.kind === "unavailable") return made.answer;
  return submitContact(
    { text: body.value, visitorHash: readVisitorHash(request.cookies) },
    made.ports,
  );
}

function refusalBeforeTheBody(request: NextRequest): NextResponse | undefined {
  if (isCrossSiteRequest(request)) {
    reportContactRefused("CONTACT_CROSS_SITE");
    return crossSiteAnswer();
  }
  if (!isJsonRequest(request)) {
    reportContactRefused("CONTACT_NOT_JSON");
    return notJsonAnswer();
  }
  return undefined;
}

/** The media type alone decides, whatever parameters follow it and in whatever case it is written. */
function isJsonRequest(request: NextRequest): boolean {
  const [mediaType = ""] = (request.headers.get("content-type") ?? "").split(
    ";",
  );
  return mediaType.trim().toLowerCase() === JSON_MEDIA_TYPE;
}

/** Past the bound is the caller's payload; a stream that broke is a transport failure with no payload to refuse. */
function refusalOfUnreadableBody(failure: BoundedBodyFailure): NextResponse {
  if (failure === "too-large") {
    reportContactRefused("CONTACT_BODY_TOO_LARGE");
    return bodyTooLargeAnswer();
  }
  reportContactRefused("CONTACT_INVALID");
  return invalidAnswer([]);
}

/** Nothing is held at module level, so a request that cannot be given its ports is answered as unavailable and no
 *  later request inherits what failed. */
function madeProductionPorts(request: NextRequest): MadePorts {
  try {
    return { kind: "ports", ports: productionPortsOf(request) };
  } catch (thrown) {
    reportContactUnavailable(causeOf(thrown));
    return { kind: "unavailable", answer: contactUnavailableResponse() };
  }
}

function productionPortsOf(request: NextRequest): SubmitContactPorts {
  return {
    store: getContactSubmissionStore(),
    createSender: () => createMailSender(process.env),
    book: bookOfThisRequest(),
    digester: readDigester(process.env),
    noticeContent: noticeContent(),
    servedLocales: routing.locales,
    loadOwned: loadOwnedDesign,
    makeJudge: (instant) =>
      makeContactJudge({
        environment: process.env,
        headers: request.headers,
        instant,
      }),
    now: () => new Date(),
  };
}

/** The one book of the request: the digest's version and the snapshot's prices are both made from it. A book this
 *  build ships and cannot read is a defect of ours, never a fact about the customer's request. */
function bookOfThisRequest(): PriceBook {
  const parsed = parsePriceBook(SAMPLE_PRICE_BOOK);
  if (!parsed.ok) throw new ContactFailure("unexpected");
  return parsed.book;
}

/** The shop's notice is written in its own language, whatever the customer's, and never through the request's locale. */
function noticeContent(): Content {
  return resolveContent(
    createTranslator({ locale: NOTICE_LOCALE, messages: roMessages }),
  );
}
