import { NextResponse, type NextRequest } from "next/server";

import { causeOf } from "@/lib/server/contact/contact-failure";
import { reportContactUnavailable } from "@/lib/server/contact/contact-log";
import { makeContactProductionPorts } from "@/lib/server/contact/contact-production-ports";
import { refuseWithLine } from "@/lib/server/contact/contact-refusal";
import {
  submitContact,
  type SubmitContactPorts,
} from "@/lib/server/contact/submit-contact";
import { isCrossSiteRequest } from "@/lib/server/cross-site-request";
import { contactUnavailableResponse } from "@/lib/server/rate-limit/rate-limited-response";
import {
  readUtf8BodyWithLimit,
  type BoundedBodyFailure,
} from "@/lib/server/read-body-with-limit";
import { readVisitorHash } from "@/lib/server/visitor";

/** The body's bound, in bytes counted as they are read: a form's request is a few hundred, and the largest honeypot
 *  or name the schema admits is far under this. */
const CONTACT_BODY_MAX_BYTES = 8 * 1024;

const JSON_MEDIA_TYPE = "application/json";

// Pinned, not defaulted: nodemailer's raw TLS socket and the Postgres driver cannot run on Edge.
export const runtime = "nodejs";

/** What the route has made for one request: the ports the orchestration is handed, or the answer for a request that
 *  could not be given them. */
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
    return refuseWithLine({ code: "CONTACT_CROSS_SITE" });
  }
  if (!isJsonRequest(request)) {
    return refuseWithLine({ code: "CONTACT_NOT_JSON" });
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
  return failure === "too-large"
    ? refuseWithLine({ code: "CONTACT_BODY_TOO_LARGE" })
    : refuseWithLine({ code: "CONTACT_INVALID", issues: [] });
}

/** Nothing is held at module level, so a request that cannot be given its ports is answered as unavailable and no
 *  later request inherits what failed. */
function madeProductionPorts(request: NextRequest): MadePorts {
  try {
    return {
      kind: "ports",
      ports: makeContactProductionPorts(request.headers),
    };
  } catch (thrown) {
    reportContactUnavailable(causeOf(thrown));
    return { kind: "unavailable", answer: contactUnavailableResponse() };
  }
}
