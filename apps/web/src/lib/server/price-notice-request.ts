import "server-only";

import {
  ITEM_ID_MEMBER_OF_KIND,
  type ItemRef,
} from "@lemnaria/configurator-domain";
import { isMintedId, type SaveCredential } from "@lemnaria/persistence";
import { NextResponse, type NextRequest } from "next/server";

import {
  bodyTooLargeResponse,
  invalidRequestResponse,
  notJsonResponse,
  unavailableResponse,
} from "@/lib/server/account/account-responses";
import { editingAccountIdOf } from "@/lib/server/account/design-reader";
import { isCrossSiteRequest } from "@/lib/server/cross-site-request";
import {
  designErrorResponse,
  designNotFoundResponse,
  PER_CREDENTIAL_HEADERS,
} from "@/lib/server/design-errors";
import {
  membersOf,
  ownMember,
  type Members,
} from "@/lib/server/price-dashboard/draft-requests";
import { dashboardInvalidInputResponse } from "@/lib/server/price-dashboard/dashboard-responses";
import { isRevisionShape } from "@/lib/server/price-dashboard/revision-shape";
import type {
  AcknowledgementOutcome,
  FailedOutcome,
  PriceNoticeOutcome,
} from "@/lib/server/price-notice";
import { readUtf8BodyWithLimit } from "@/lib/server/read-body-with-limit";
import { readWriteTokenHash } from "@/lib/server/write-token";
import type {
  DashboardIssue,
  PriceNoticeAcknowledgedWire,
  PriceNoticeRefusedWire,
  PriceNoticeWire,
  PriceStampWire,
  RemovedAccessoryWire,
  RequiredReplacementWire,
} from "@/price-dashboard/price-dashboard-wire-contract";

// What the two price-notice routes ask of a request and say back (see ADR 0178 A-11).
// Neither route builds a body from a stored value by spreading it: every answer is shaped member by member, so the wire's
// closed keys are held at run time and not only by the compiler.

/** The two members fit in under a hundred bytes; this leaves room for whitespace and nothing for a payload. */
const ACKNOWLEDGE_BODY_MAX_BYTES = 1024;

const ACKNOWLEDGE_MEMBERS = ["versionId", "availabilityRevision"] as const;

const JSON_MEDIA_TYPE = "application/json";

/** The `500` of a defect the server cannot answer around. Closed: it holds nothing of the request or the design. */
const DEFECT_STATUS_WORD = "unexpected";

// ---------------------------------------------------------------------------------------------------------------------
// The credential

/**
 * The credential this request edits the design with, or `undefined`; see `saveCredentialOf` (the parity test is the owner
 * of the two agreeing). The difference: cross-site is refused first, on both arms, before any cookie is read, because the
 * `GET` writes a marker too.
 */
export async function editCredentialOf(
  request: NextRequest,
  id: string,
): Promise<SaveCredential | undefined> {
  if (isCrossSiteRequest(request)) return undefined;
  const writeTokenHash = readWriteTokenHash(request, id);
  if (writeTokenHash !== undefined) {
    return { kind: "write-token", hash: writeTokenHash };
  }
  const accountId = await editingAccountIdOf(request.cookies);
  return accountId === undefined ? undefined : { kind: "account", accountId };
}

// ---------------------------------------------------------------------------------------------------------------------
// The acknowledgement's body

export type AcknowledgeReading =
  | { readonly kind: "pair"; readonly pair: PriceStampWire }
  | { readonly kind: "refused"; readonly response: NextResponse };

/** The pair the body names, or the answer that refuses it. The version id is judged by the store's own `isMintedId`
 *  (exactly 21 characters), so a value the store would throw on never reaches it. */
export async function readAcknowledgedPair(
  request: NextRequest,
): Promise<AcknowledgeReading> {
  if (!isJsonRequest(request)) return refused(notJsonResponse());
  const body = await readUtf8BodyWithLimit(
    request.body,
    ACKNOWLEDGE_BODY_MAX_BYTES,
  );
  if (!body.ok) {
    return refused(
      body.failure === "too-large"
        ? bodyTooLargeResponse()
        : invalidRequestResponse(),
    );
  }
  const members = membersOf(body.value, ACKNOWLEDGE_MEMBERS);
  if (members === undefined) return refused(invalidRequestResponse());
  return judgedPair(members);
}

function judgedPair(members: Members): AcknowledgeReading {
  const versionId = ownMember(members, "versionId");
  const availabilityRevision = ownMember(members, "availabilityRevision");
  const issues = [
    ...issueOf("versionId", versionId, isMintedId),
    ...issueOf("availabilityRevision", availabilityRevision, isRevisionShape),
  ];
  if (issues.length > 0) return refused(dashboardInvalidInputResponse(issues));
  return {
    kind: "pair",
    pair: {
      versionId: versionId as string,
      availabilityRevision: availabilityRevision as string,
    },
  };
}

/** None for a member that is text of the shape; `MISSING_VALUE` for one absent or not text; `UNKNOWN_VALUE` for text off
 *  its shape. The value is never part of the issue. */
function issueOf(
  field: "versionId" | "availabilityRevision",
  declared: unknown,
  hasShape: (value: string) => boolean,
): readonly DashboardIssue<"MISSING_VALUE" | "UNKNOWN_VALUE">[] {
  if (typeof declared !== "string") return [{ field, code: "MISSING_VALUE" }];
  return hasShape(declared) ? [] : [{ field, code: "UNKNOWN_VALUE" }];
}

function refused(response: NextResponse): AcknowledgeReading {
  return { kind: "refused", response };
}

/** The media type alone decides, whatever parameters follow it and in whatever case it is written. */
function isJsonRequest(request: NextRequest): boolean {
  const [mediaType = ""] = (request.headers.get("content-type") ?? "").split(
    ";",
  );
  return mediaType.trim().toLowerCase() === JSON_MEDIA_TYPE;
}

// ---------------------------------------------------------------------------------------------------------------------
// The answers

/** The `GET`'s answer: the notice, or the refusal every route under a design's path gives a caller who may not edit it. */
export function priceNoticeResponse(
  outcome: PriceNoticeOutcome,
  id: string,
): NextResponse {
  if (outcome.kind === "notice") return noticeBody(outcome.notice);
  return failureResponse(outcome, id);
}

/** The `POST`'s answer. A refusal of the pair is `400` and a state of the data, never a failure to answer. */
export function acknowledgementResponse(
  outcome: AcknowledgementOutcome,
  id: string,
): NextResponse {
  switch (outcome.kind) {
    case "acknowledged":
      return acknowledgedBody(outcome.pair);
    case "refused":
      return refusedBody(outcome.refusal);
    case "invalid-pair":
      return dashboardInvalidInputResponse([
        { field: "versionId", code: "UNKNOWN_VALUE" },
        { field: "availabilityRevision", code: "UNKNOWN_VALUE" },
      ]);
    default:
      return failureResponse(outcome, id);
  }
}

/**
 * Every answer that is not a result. `not-editable` is `designNotFoundResponse` byte for byte, as every refusal of these
 * routes is. A stored design this build cannot read is the design routes' own `500`. A defect is a `500` with a closed
 * body, and anything that could not be reached or judged is a `503` with a constant one: no error, cause or driver text is
 * ever serialised, and a rejected read is never folded into the `404`.
 */
function failureResponse(outcome: FailedOutcome, id: string): NextResponse {
  switch (outcome.kind) {
    case "not-editable":
      return designNotFoundResponse(id);
    case "unreadable":
      return markedPerCredential(designErrorResponse("load", outcome.error));
    case "defective":
      return NextResponse.json(
        { status: DEFECT_STATUS_WORD },
        { status: 500, headers: PER_CREDENTIAL_HEADERS },
      );
    case "unavailable":
      return unavailableResponse();
  }
}

function noticeBody(notice: PriceNoticeWire): NextResponse {
  if (notice.kind === "no-active-version") {
    return withPerCredentialHeaders({
      kind: "no-active-version",
      isSent: notice.isSent,
    });
  }
  return withPerCredentialHeaders({
    kind: "active-version",
    isSent: notice.isSent,
    current: stampOf(notice.current),
    pricesChanged: notice.pricesChanged,
    replacementsRequired: notice.replacementsRequired.map(replacementOf),
    removedAccessories: notice.removedAccessories.map(removedAccessoryOf),
  } satisfies PriceNoticeWire);
}

function acknowledgedBody(pair: PriceStampWire): NextResponse {
  const body: PriceNoticeAcknowledgedWire = { acknowledged: stampOf(pair) };
  return withPerCredentialHeaders(body);
}

function refusedBody(refusal: PriceNoticeRefusedWire["status"]): NextResponse {
  const body: PriceNoticeRefusedWire = { status: refusal };
  return NextResponse.json(body, {
    status: 400,
    headers: PER_CREDENTIAL_HEADERS,
  });
}

function withPerCredentialHeaders(
  body: PriceNoticeWire | PriceNoticeAcknowledgedWire,
): NextResponse {
  return NextResponse.json(body, { headers: PER_CREDENTIAL_HEADERS });
}

/** The design routes' own unreadable `500` carries no cache headers, and this answer depends on the cookie. */
function markedPerCredential(response: NextResponse): NextResponse {
  for (const [name, value] of Object.entries(PER_CREDENTIAL_HEADERS)) {
    response.headers.set(name, value);
  }
  return response;
}

function stampOf({
  versionId,
  availabilityRevision,
}: PriceStampWire): PriceStampWire {
  return { versionId, availabilityRevision };
}

function replacementOf({
  item,
  remaining,
}: RequiredReplacementWire): RequiredReplacementWire {
  return { item: itemRefOf(item), remaining: remaining.map(itemRefOf) };
}

/** `authoredName` is staff-authored text and is data only; the key is left out, never set to `undefined`. */
function removedAccessoryOf({
  accessoryId,
  authoredName,
}: RemovedAccessoryWire): RemovedAccessoryWire {
  return authoredName === undefined
    ? { accessoryId }
    : { accessoryId, authoredName };
}

/** An item by its kind and the one member that kind names it by; the member name is computed, hence the casts. */
function itemRefOf(item: ItemRef): ItemRef {
  const member = ITEM_ID_MEMBER_OF_KIND[item.kind];
  return {
    kind: item.kind,
    [member]: (item as Record<string, string>)[member],
  } as ItemRef;
}
