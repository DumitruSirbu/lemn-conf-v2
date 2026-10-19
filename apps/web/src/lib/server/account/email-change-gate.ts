import "server-only";

import { NextResponse } from "next/server";

import { EMAIL_CHANGE_ENABLED } from "@/account/profile/email-change-enabled";

/**
 * The answer for an e-mail-change route while the feature is off, `undefined` while it is on. It is the empty `404`
 * the catch-all `/api` route gives an address that does not exist, so the two routes are not told apart from one.
 * Call it before anything is read, logged or counted.
 */
export function refuseWhileEmailChangeIsOff(): NextResponse | undefined {
  if (EMAIL_CHANGE_ENABLED) return undefined;
  return new NextResponse(null, {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}
