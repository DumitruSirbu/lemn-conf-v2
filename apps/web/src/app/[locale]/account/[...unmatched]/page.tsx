import { notFound } from "next/navigation";
import { connection } from "next/server";

/**
 * Every address under `/{locale}/account/` that no account page answers; `not-found.tsx` beside it draws the answer.
 * Rendered per request for the reason the locale's own unmatched page is: a prerendered 404's scripts carry no CSP
 * nonce. `connection()` keeps the page out of the build's prerender.
 */
export default async function UnmatchedAccountAddressPage() {
  await connection();
  notFound();
}
