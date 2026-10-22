import "server-only";

import type { NextResponse } from "next/server";

import type { StoredAccount } from "@lemnaria/persistence";

import {
  reportAccountEvent,
  type AccountEvent,
} from "@/lib/server/account/account-log";
import {
  unavailableResponse,
  wrongPasswordResponse,
} from "@/lib/server/account/account-responses";
import {
  checkPassword,
  REFUSED_PASSWORD_STAND_IN,
} from "@/lib/server/account/password-hash";

// The signed-in person's proof for a change to their own sign-in details: the account's current password, verified
// once, in the same time whatever was typed.

export interface CurrentPasswordCheck {
  /** The NFKC form to verify, or `undefined` for a text the length bounds refuse: it can match no hash. */
  readonly currentPassword: string | undefined;
  readonly account: Pick<StoredAccount, "passwordHash">;
  /** The log event that names the flow. */
  readonly event: AccountEvent;
}

/**
 * The one argon2id verification, whatever was typed: a text the password policy refused is verified as a stand-in
 * against the account's own hash, so it costs what a wrong password costs. The answer is `wrong-password` for a wrong
 * password and for such a text alike. A platform that could not compute is not a wrong password, and is `503`.
 * Nothing is returned when the password verified.
 */
export async function refusalOfCurrentPassword({
  currentPassword,
  account,
  event,
}: CurrentPasswordCheck): Promise<NextResponse | undefined> {
  const check = await checkPassword({
    password: currentPassword ?? REFUSED_PASSWORD_STAND_IN,
    phc: account.passwordHash,
  });
  if (check === "failed") {
    reportAccountEvent({ event, outcome: "unavailable" });
    return unavailableResponse();
  }
  if (currentPassword !== undefined && check === "match") return undefined;
  reportAccountEvent({ event, outcome: "refused" });
  return wrongPasswordResponse();
}
