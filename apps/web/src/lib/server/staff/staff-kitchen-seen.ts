import "server-only";

import type { NextResponse } from "next/server";

import { isDesignId } from "@lemnaria/configurator-domain";
import type {
  DesignRevision,
  MarkKitchenSeenResult,
} from "@lemnaria/persistence";

import {
  reportAccountEvent,
  type AccountEvent,
} from "@/lib/server/account/account-log";
import { answerOfJudgement } from "@/lib/server/account/account-responses";
import type { SignedInSession } from "@/lib/server/account/current-session";
import type { SessionCookieReader } from "@/lib/server/account/session-cookie";
import { designNotFoundResponse } from "@/lib/server/design-errors";
import { judgeAccountSubject } from "@/lib/server/rate-limit/judge-account-request";
import type { HeaderReader } from "@/lib/server/rate-limit/network-source";
import { judgeDisplayedRevision } from "@/lib/server/staff/displayed-revision";
import { admitStaff } from "@/lib/server/staff/staff-admission";
import { getKitchenChangeStore } from "@/lib/server/staff/kitchen-change-store-instance";
import {
  actingSessionOf,
  onlyMembersOf,
  type Judged,
} from "@/lib/server/staff/staff-kitchen-actions";
import {
  staffSeenConflictResponse,
  staffSeenInvalidResponse,
  staffSeenMarkedResponse,
} from "@/lib/server/staff/staff-responses";

// A staff member marks a kitchen seen at the revision the page displayed (ADR 0178 A-12). The route has checked the
// origin, the media type and the body's size. From there: the session and `contact.read` (a client reaches no store),
// the id's shape, the body's one member, the account's own bucket (which **fails closed**), and only then the store,
// which commits the mark and its `kitchen-seen` row together or neither. Anything the store throws, a missing audit
// row included, is the route's `503`: a mark is never written without its row.

/** The log event of the seen mark: the route names its failure wrapper by it too. */
export const STAFF_SEEN_EVENT = "staff-seen" as const satisfies AccountEvent;

const SEEN_BODY_MEMBERS = ["displayedRevision"] as const;

export interface StaffSeenRequest {
  readonly cookies: SessionCookieReader;
  readonly headers: HeaderReader;
  /** The URL segment as it arrived: its shape is judged here. */
  readonly designId: string;
  /** The body's text, already read to its bound by the route. */
  readonly bodyText: string;
}

export async function markKitchenSeenAsStaff(
  request: StaffSeenRequest,
): Promise<NextResponse> {
  const { cookies, headers, designId, bodyText } = request;
  const admission = await admitStaff({
    cookies,
    event: STAFF_SEEN_EVENT,
    capability: "contact.read",
  });
  if (admission.kind === "refused") return admission.response;
  if (!isDesignId(designId)) return notFound(designId);
  const judged = judgedDisplayedRevision(bodyText);
  if (judged.kind === "refused") return refusal(judged.response);
  const limited = await refusalOfSeenLimit(admission.session, headers);
  if (limited !== undefined) return limited;
  const result = await getKitchenChangeStore().markSeen({
    designId,
    displayedRevision: judged.value,
    audit: {
      session: actingSessionOf(cookies),
      entry: { action: "kitchen-seen", detail: {} },
    },
  });
  return answerOfSeen(result, designId);
}

function judgedDisplayedRevision(bodyText: string): Judged<DesignRevision> {
  const members = onlyMembersOf(bodyText, SEEN_BODY_MEMBERS);
  if (members.kind === "refused") return members;
  const judgement = judgeDisplayedRevision(members.value.displayedRevision);
  if (judgement.ok) return { kind: "judged", value: judgement.revision };
  return {
    kind: "refused",
    response: staffSeenInvalidResponse(judgement.code),
  };
}

/** One mark counted in the account's own bucket, once, before the store is asked; a bucket that cannot be counted is
 *  `503` and writes nothing (ADR 0156). */
async function refusalOfSeenLimit(
  session: SignedInSession,
  headers: HeaderReader,
): Promise<NextResponse | undefined> {
  return answerOfJudgement(
    await judgeAccountSubject({
      purpose: "staff-seen",
      headers,
      accountId: session.accountId,
    }),
  );
}

function answerOfSeen(
  result: MarkKitchenSeenResult,
  designId: string,
): NextResponse {
  switch (result.kind) {
    case "ok":
      reportAccountEvent({ event: STAFF_SEEN_EVENT, outcome: "succeeded" });
      return staffSeenMarkedResponse();
    case "not-found":
      return notFound(designId);
    case "displayed-revision-ahead":
      return refusal(staffSeenConflictResponse());
  }
}

function notFound(designId: string): NextResponse {
  reportAccountEvent({ event: STAFF_SEEN_EVENT, outcome: "refused" });
  return designNotFoundResponse(designId);
}

function refusal(response: NextResponse): NextResponse {
  reportAccountEvent({ event: STAFF_SEEN_EVENT, outcome: "refused" });
  return response;
}
