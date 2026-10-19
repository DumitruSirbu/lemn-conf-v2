import "server-only";

import type { NextResponse } from "next/server";

import type { ExportedKitchen } from "@lemnaria/persistence";

import { reportAccountEvent } from "@/lib/server/account/account-log";
import {
  accountExportResponse,
  answerOfJudgement,
  unauthenticatedResponse,
  unavailableResponse,
} from "@/lib/server/account/account-responses";
import { getAccountKitchenStore } from "@/lib/server/account/account-kitchen-store-instance";
import { getAccountStore } from "@/lib/server/account/account-store-instance";
import type { SignedInSession } from "@/lib/server/account/current-session";
import { judgeAccountSubject } from "@/lib/server/rate-limit/judge-account-request";
import type { HeaderReader } from "@/lib/server/rate-limit/network-source";

// E10 of the Lot 2 plan: a signed-in account downloads its own data. From step 5 of the common order on; the route has
// checked the origin, media type, size, session and capability (steps 1 to 4). The account is the session's, and no
// request member names one.
//
// Scope (plan C15, O4): the profile and every kitchen the person has not deleted, hidden ones included. The shop's
// requests and its notes are not in it: no contact personal column is readable by the application (ADR 0153 d1) and
// there is no notes table. Nothing credential-shaped is in the file: it is built from named fields, never from a row.

/** Bumped when the file's shape changes, so a reader of an old download can tell which shape it holds. */
const EXPORT_FORMAT_VERSION = 1;

export interface AccountExportRequest {
  readonly session: SignedInSession;
  readonly headers: HeaderReader;
}

export async function exportOwnAccount({
  session,
  headers,
}: AccountExportRequest): Promise<NextResponse> {
  const limited = answerOfJudgement(
    await judgeAccountSubject({
      purpose: "export",
      headers,
      accountId: session.accountId,
    }),
  );
  if (limited !== undefined) return limited;
  const [account, profile, kitchens] = await Promise.all([
    getAccountStore().findById(session.accountId),
    getAccountStore().findProfile(session.accountId),
    getAccountKitchenStore().exportAll(session.accountId),
  ]);
  if (account.kind === "none" || profile.kind === "none") {
    return unauthenticatedResponse();
  }
  if (kitchens.kind === "too-many") {
    reportAccountEvent({ event: "export", outcome: "unavailable" });
    return unavailableResponse();
  }
  reportAccountEvent({ event: "export", outcome: "succeeded" });
  return accountExportResponse(
    JSON.stringify({
      formatVersion: EXPORT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      account: {
        email: account.account.email,
        language: account.account.locale,
        ...profile.profile,
      },
      kitchens: kitchens.kitchens.map(exportedKitchenOf),
    }),
  );
}

function exportedKitchenOf(kitchen: ExportedKitchen) {
  return {
    id: kitchen.id,
    name: kitchen.name,
    updatedAt: kitchen.updatedAt.toISOString(),
    isSent: kitchen.isSent,
    isHidden: kitchen.isHidden,
    design: kitchen.design,
  };
}
