import "server-only";

import type { NextResponse } from "next/server";

import type {
  ExportedKitchen,
  ExportedKitchenNotes,
} from "@lemnaria/persistence";

import { reportAccountEvent } from "@/lib/server/account/account-log";
import {
  accountExportResponse,
  answerOfJudgement,
  exportTooLargeResponse,
  unauthenticatedResponse,
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
// Order: the size is measured first, with no document read, so an account that can never be exported is refused for
// good without spending its daily bucket; then the bucket is counted, then the whole export is read. The read repeats
// the bound in its own statement, and an account that grew past it in between is refused the same way, having spent
// the bucket.
//
// Scope (plan C15, O4, and O-L3-6 of Lot 3, ADR 0174 decision 4): the profile and every kitchen the person has not
// deleted, hidden ones included, each with the shop's staff notes on it as text and date. The shop's requests are not in
// it: no contact personal column is readable by the application (ADR 0153 d1). A note carries no author: the person is
// told what the shop wrote, not who. The notes of a kitchen the person deleted are not in it, as the kitchen is not
// (ADR 0173, an open question the owner has not answered). Nothing credential-shaped is in the file: it is built from
// named fields, never from a row.
//
// The notes are read after the kitchens, only for an export that will be served, so an account over the kitchen bound
// is refused (409) without a note read. A notes read that fails is a thrown store error, which the route answers 503:
// there is no download without them. Like a failed kitchen read, it follows the spent bucket (O26's residual).

/** Bumped when the file's shape changes, so a reader of an old download can tell which shape it holds. Version 2 adds
 *  `notes` and `notesTruncated` to every kitchen. */
const EXPORT_FORMAT_VERSION = 2;

const NO_NOTES: ExportedKitchenNotes = { notes: [], isTruncated: false };

export interface AccountExportRequest {
  readonly session: SignedInSession;
  readonly headers: HeaderReader;
}

export async function exportOwnAccount({
  session,
  headers,
}: AccountExportRequest): Promise<NextResponse> {
  const size = await getAccountKitchenStore().measureExport(session.accountId);
  if (size.kind === "too-many") return answerTooLarge();
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
  if (kitchens.kind === "too-many") return answerTooLarge();
  const notes = await getAccountKitchenStore().exportNotes(
    session.accountId,
    kitchens.kitchens.map(({ id }) => id),
  );
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
      kitchens: kitchens.kitchens.map((kitchen) =>
        exportedKitchenOf(kitchen, notes.get(kitchen.id) ?? NO_NOTES),
      ),
    }),
  );
}

function answerTooLarge(): NextResponse {
  reportAccountEvent({ event: "export", outcome: "refused" });
  return exportTooLargeResponse();
}

function exportedKitchenOf(
  kitchen: ExportedKitchen,
  { notes, isTruncated }: ExportedKitchenNotes,
) {
  return {
    id: kitchen.id,
    name: kitchen.name,
    updatedAt: kitchen.updatedAt.toISOString(),
    isSent: kitchen.isSent,
    isHidden: kitchen.isHidden,
    design: kitchen.design,
    notes: notes.map(({ text, createdAt }) => ({
      text,
      createdAt: createdAt.toISOString(),
    })),
    notesTruncated: isTruncated,
  };
}
