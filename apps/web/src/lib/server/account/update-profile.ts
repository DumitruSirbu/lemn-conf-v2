import "server-only";

import type { NextResponse } from "next/server";

import { validateProfileText } from "@lemnaria/configurator-domain";

import { reportAccountEvent } from "@/lib/server/account/account-log";
import { parseJsonObject } from "@/lib/server/account/account-request";
import {
  answerOfJudgement,
  invalidInputResponse,
  invalidRequestResponse,
  profileResponse,
  profileSavedResponse,
  unauthenticatedResponse,
} from "@/lib/server/account/account-responses";
import { getAccountStore } from "@/lib/server/account/account-store-instance";
import type { SignedInSession } from "@/lib/server/account/current-session";
import { judgeAccountSubject } from "@/lib/server/rate-limit/judge-account-request";
import type { HeaderReader } from "@/lib/server/rate-limit/network-source";

// E6 of the Lot 2 plan: the optional details a signed-in account keeps. From step 5 of the common order on; the route
// has checked the origin, media type, size, session and capability (steps 1 to 4). The account is the session's, and
// only the `changes` the domain returns are written: the body itself never reaches the store, so no request member can
// name `email`, a role or another account.

export interface ProfileSaveRequest {
  readonly session: SignedInSession;
  readonly bodyText: string;
  readonly headers: HeaderReader;
}

/** The account's own details. An account the session names but the table lost reads as no session. */
export async function readOwnProfile(
  session: SignedInSession,
): Promise<NextResponse> {
  const lookup = await getAccountStore().findProfile(session.accountId);
  return lookup.kind === "found"
    ? profileResponse(lookup.profile)
    : unauthenticatedResponse();
}

/**
 * Validation comes first and costs nothing; the account's limiter is counted before the write. A member that is absent
 * leaves its column as it is, and `""` clears it.
 */
export async function saveOwnProfile({
  session,
  bodyText,
  headers,
}: ProfileSaveRequest): Promise<NextResponse> {
  const body = parseJsonObject(bodyText);
  if (body === undefined) return invalidRequestResponse();
  const validation = validateProfileText(body);
  if (!validation.ok) return invalidInputResponse(validation.issues);
  const limited = answerOfJudgement(
    await judgeAccountSubject({
      purpose: "profile",
      headers,
      accountId: session.accountId,
    }),
  );
  if (limited !== undefined) return limited;
  const outcome = await getAccountStore().updateProfile({
    accountId: session.accountId,
    changes: validation.changes,
  });
  if (outcome.kind === "none") return unauthenticatedResponse();
  reportAccountEvent({ event: "profile", outcome: "succeeded" });
  return profileSavedResponse();
}
