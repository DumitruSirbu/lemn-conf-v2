import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { STATIC_SECURITY_HEADERS } from "./src/lib/security-headers";

const ALL_ROUTES = "/:path*";

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
};

const withNextIntl = createNextIntlPlugin({
  requestConfig: "./src/i18n/request.ts",
  experimental: {
    createMessagesDeclaration: "./src/messages/ro.json",
  },
});

export default withNextIntl(nextConfig);
