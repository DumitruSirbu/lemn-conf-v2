import { notFound } from "next/navigation";
import { connection } from "next/server";

/**
 * Every address under a locale that no other route answers. Next's built-in 404 comes from the prerendered
 * `_not-found` document, whose scripts carry no CSP nonce; this 404 is rendered per request, so the nonce reaches them.
 * `connection()` keeps the page out of the build's prerender.
 */
export default async function UnmatchedAddressPage() {
  await connection();
  notFound();
}
