import { notFound } from "next/navigation";
import { connection } from "next/server";

/**
 * Every address under a locale that no other route answers. Next would serve its built-in 404 from the prerendered
 * `_not-found` document, whose scripts carry no CSP nonce; a 404 thrown here is rendered for each request, so the
 * nonce reaches them and `.next/prerender-manifest.json` is not what a browser is sent (8Q.4). `connection()` is what
 * keeps this page out of the build's prerender, as on the callback page.
 */
export default async function UnmatchedAddressPage() {
  await connection();
  notFound();
}
