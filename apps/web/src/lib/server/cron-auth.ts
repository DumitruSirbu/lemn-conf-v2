import "server-only";

import * as crypto from "node:crypto";

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically whenever `CRON_SECRET` is
 *  set on the project. Comparison is timing-safe so a byte-by-byte early exit on `===` can't leak
 *  how much of the secret a guess got right. An unset `CRON_SECRET` fails closed — it is never
 *  treated as "no auth required". */
export function isAuthorizedCronRequest(headers: Headers): boolean {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) return false;

  const authorizationHeader = headers.get("authorization");
  if (!authorizationHeader) return false;

  const expected = Buffer.from(`Bearer ${expectedSecret}`);
  const actual = Buffer.from(authorizationHeader);

  // `timingSafeEqual` throws on mismatched lengths rather than returning `false`, so a
  // length check must happen first — and that check runs on public lengths only, never on secret
  // bytes, so it does not reopen the timing side-channel this function exists to close.
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}
