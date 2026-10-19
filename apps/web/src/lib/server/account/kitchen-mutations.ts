import "server-only";

import type { NextResponse } from "next/server";

import { isDesignId, judgeKitchenName } from "@lemnaria/configurator-domain";

import { getAccountKitchenStore } from "@/lib/server/account/account-kitchen-store-instance";
import { reportAccountEvent } from "@/lib/server/account/account-log";
import { parseJsonObject } from "@/lib/server/account/account-request";
import {
  answerOfJudgement,
  invalidInputResponse,
  invalidRequestResponse,
  kitchenDuplicatedResponse,
  kitchenMarkedResponse,
  kitchenNotSentResponse,
  kitchenRenamedResponse,
  kitchenSentResponse,
} from "@/lib/server/account/account-responses";
import type { SignedInSession } from "@/lib/server/account/current-session";
import { designNotFoundResponse } from "@/lib/server/design-errors";
import {
  judgeAccountBlock,
  judgeAccountSubject,
} from "@/lib/server/rate-limit/judge-account-request";
import type { HeaderReader } from "@/lib/server/rate-limit/network-source";

// E2 to E5 of the Lot 2 plan: what a signed-in client does to a kitchen it owns. From step 5 of the common order on;
// the route has checked the origin, the media type and size (where there is a body), the session and `design.edit.own`.
// The account is the session's and the kitchen is the URL's `:id` alone. A kitchen that is unknown, another account's,
// owned by no account, hidden or deleted gets one answer, `designNotFoundResponse`, whichever it was: the store gives
// one outcome for all of them, and an id that is not a design id's shape never reaches it.

type MarkEvent = "kitchen-hide" | "kitchen-delete";
type ChangeEvent = MarkEvent | "kitchen-rename" | "kitchen-duplicate";

export interface KitchenChange {
  readonly session: SignedInSession;
  /** The URL segment as it arrived: its shape is judged here. */
  readonly designId: string;
  readonly headers: HeaderReader;
}

export interface KitchenNaming extends KitchenChange {
  readonly bodyText: string;
}

type JudgedName =
  | { readonly kind: "name"; readonly name: string }
  | { readonly kind: "refused"; readonly response: NextResponse };

/** E2. The name is judged (NFC, trimmed, 1 to 120 characters); the judged form is stored and answered. */
export async function renameOwnKitchen(
  change: KitchenNaming,
): Promise<NextResponse> {
  const event = "kitchen-rename";
  const judged = judgedNameOf(event, change);
  if (judged.kind === "refused") return judged.response;
  const limited = await refusalOfChangeLimit(event, change);
  if (limited !== undefined) return limited;
  const outcome = await getAccountKitchenStore().rename({
    accountId: change.session.accountId,
    designId: change.designId,
    name: judged.name,
  });
  if (outcome.kind === "none") return notFound(event, change.designId);
  return succeeded(event, kitchenRenamedResponse(judged.name));
}

/** E3. The copy is named as the client composed it; the mint's per-network bucket is counted before the account's. */
export async function duplicateOwnKitchen(
  change: KitchenNaming,
): Promise<NextResponse> {
  const event = "kitchen-duplicate";
  const judged = judgedNameOf(event, change);
  if (judged.kind === "refused") return judged.response;
  const limited = await refusalOfCopyLimit(change);
  if (limited !== undefined) return limited;
  const outcome = await getAccountKitchenStore().duplicate({
    accountId: change.session.accountId,
    designId: change.designId,
    name: judged.name,
  });
  if (outcome.kind === "none") return notFound(event, change.designId);
  return succeeded(event, kitchenDuplicatedResponse(outcome.id));
}

/** E5. Hides a sent kitchen from its owner's list; the store stops its share link in the same step. */
export async function hideOwnKitchen(
  change: KitchenChange,
): Promise<NextResponse> {
  const event = "kitchen-hide";
  const refusal = await refusalBeforeMark(event, change);
  if (refusal !== undefined) return refusal;
  const outcome = await getAccountKitchenStore().hide({
    accountId: change.session.accountId,
    designId: change.designId,
  });
  if (outcome.kind === "none") return notFound(event, change.designId);
  if (outcome.kind === "not-sent") {
    return conflict(event, kitchenNotSentResponse());
  }
  return succeeded(event, kitchenMarkedResponse());
}

/** E4. Deletes an unsent kitchen from its owner's list by a mark; the store stops its share link in the same step. */
export async function deleteOwnKitchen(
  change: KitchenChange,
): Promise<NextResponse> {
  const event = "kitchen-delete";
  const refusal = await refusalBeforeMark(event, change);
  if (refusal !== undefined) return refusal;
  const outcome = await getAccountKitchenStore().markDeleted({
    accountId: change.session.accountId,
    designId: change.designId,
  });
  if (outcome.kind === "none") return notFound(event, change.designId);
  if (outcome.kind === "sent") return conflict(event, kitchenSentResponse());
  return succeeded(event, kitchenMarkedResponse());
}

/** The id's shape first, then the body's name: both cost nothing and count nothing. */
function judgedNameOf(event: ChangeEvent, change: KitchenNaming): JudgedName {
  const unknown = refusalOfIdShape(event, change.designId);
  if (unknown !== undefined) return refusedWith(unknown);
  const body = parseJsonObject(change.bodyText);
  if (body === undefined) return refusedWith(invalidRequestResponse());
  const judgement = judgeKitchenName(
    Object.hasOwn(body, "name") ? body.name : undefined,
  );
  if (judgement.ok) return { kind: "name", name: judgement.name };
  return refusedWith(
    invalidInputResponse([{ field: "name", code: judgement.code }]),
  );
}

async function refusalBeforeMark(
  event: MarkEvent,
  change: KitchenChange,
): Promise<NextResponse | undefined> {
  return (
    refusalOfIdShape(event, change.designId) ??
    (await refusalOfChangeLimit(event, change))
  );
}

function refusalOfIdShape(
  event: ChangeEvent,
  designId: string,
): NextResponse | undefined {
  return isDesignId(designId) ? undefined : notFound(event, designId);
}

/** Rename, hide and delete are counted in the account's saves bucket, once, before the store is asked. */
async function refusalOfChangeLimit(
  purpose: MarkEvent | "kitchen-rename",
  { session, headers }: KitchenChange,
): Promise<NextResponse | undefined> {
  return answerOfJudgement(
    await judgeAccountSubject({
      purpose,
      headers,
      accountId: session.accountId,
    }),
  );
}

/** A copy is a mint (ADR 0147's intent): the network's mint bucket first, and only a request it passed is counted for
 *  the account, as the save judge orders its two. */
async function refusalOfCopyLimit({
  session,
  headers,
}: KitchenChange): Promise<NextResponse | undefined> {
  const blocked = answerOfJudgement(
    await judgeAccountBlock({ purpose: "kitchen-duplicate", headers }),
  );
  if (blocked !== undefined) return blocked;
  return answerOfJudgement(
    await judgeAccountSubject({
      purpose: "kitchen-duplicate",
      headers,
      accountId: session.accountId,
    }),
  );
}

function refusedWith(response: NextResponse): JudgedName {
  return { kind: "refused", response };
}

function notFound(event: ChangeEvent, designId: string): NextResponse {
  reportAccountEvent({ event, outcome: "refused" });
  return designNotFoundResponse(designId);
}

function conflict(event: MarkEvent, response: NextResponse): NextResponse {
  reportAccountEvent({ event, outcome: "refused" });
  return response;
}

function succeeded(event: ChangeEvent, response: NextResponse): NextResponse {
  reportAccountEvent({ event, outcome: "succeeded" });
  return response;
}
