import "server-only";

import { headers } from "next/headers";

import { NONCE_HEADER } from "@/lib/security-headers";

/** What a challenge page hands the Turnstile widget. Either is `undefined` when the request or the deployment has
 *  none, and the widget then shows its "unavailable" copy rather than a box that can never pass. */
export interface ChallengePageProps {
  readonly siteKey: string | undefined;
  readonly nonce: string | undefined;
}

/**
 * Read per request, never at build: the site key is a deployment value and the nonce is minted by `proxy.ts` for this
 * request alone. Awaiting `headers()` is what makes the calling page dynamic, which the nonce needs to reach the HTML.
 * The key is the public site key and is read without a `NEXT_PUBLIC_` name, so it is never inlined into a bundle.
 * A page that calls this is reached by a plain document load, never a client navigation: the policy that names the
 * challenge's frame is that document's own (`proxy.ts`, account challenge pages).
 */
export async function readChallengePageProps(): Promise<ChallengePageProps> {
  const requestHeaders = await headers();
  return {
    siteKey: process.env.TURNSTILE_SITE_KEY,
    nonce: requestHeaders.get(NONCE_HEADER) ?? undefined,
  };
}
