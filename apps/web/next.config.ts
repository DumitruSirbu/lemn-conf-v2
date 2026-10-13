import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { routing } from "./src/i18n/routing";
import { STATIC_SECURITY_HEADERS } from "./src/lib/security-headers";

const ALL_ROUTES = "/:path*";

/** The two framework documents Next builds ahead of time, which a visitor can type as an address (8Q.12). */
const PRERENDERED_FRAMEWORK_ADDRESSES = ["/_not-found", "/_global-error"];

/** An address under the default locale that no route answers, so the `[locale]` catch-all renders the 404. */
const UNMATCHED_LOCALE_ADDRESS = `/${routing.defaultLocale}/_unmatched`;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // **Off, and it is not cosmetic.** The indicator paints a fixed badge at `bottom-left`, which is
  // where the price bar's figure sits — it covered *"…000 MDL"* in a visual-verification capture and
  // had to be reasoned around rather than read. A dev-only overlay that occludes the one number this
  // product exists to show turns every screenshot of that corner into a judgement call.
  //
  // Compile and runtime errors are unaffected: Next still surfaces those. This hides the badge only,
  // and `position` is the alternative — moving it would have kept it over a corner the panel uses on
  // mobile, so it is disabled rather than relocated.
  devIndicators: false,
  transpilePackages: ["@lemnaria/three-adapter"],
  // The CSP is not here: it carries a per-request nonce and is set in `src/proxy.ts`.
  headers() {
    return Promise.resolve([
      { source: ALL_ROUTES, headers: [...STATIC_SECURITY_HEADERS] },
    ]);
  },
  // Before the filesystem, so the prerendered documents are never served for these two addresses (8Q.12): the typed
  // address is kept, and the answer is the catch-all's per-request, nonced `404`.
  rewrites() {
    return Promise.resolve({
      beforeFiles: PRERENDERED_FRAMEWORK_ADDRESSES.map((source) => ({
        source,
        destination: UNMATCHED_LOCALE_ADDRESS,
      })),
    });
  },
};

const withNextIntl = createNextIntlPlugin({
  requestConfig: "./src/i18n/request.ts",
  experimental: {
    createMessagesDeclaration: "./src/messages/ro.json",
  },
});

export default withNextIntl(nextConfig);
