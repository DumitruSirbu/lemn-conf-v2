import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { STATIC_SECURITY_HEADERS } from "./src/lib/security-headers";

const ALL_ROUTES = "/:path*";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
