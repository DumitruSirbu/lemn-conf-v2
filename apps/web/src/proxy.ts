import { NextResponse, type NextRequest } from "next/server";

import {
  buildContentSecurityPolicy,
  CONTENT_SECURITY_POLICY_MODE,
  CSP_ENFORCED_HEADER,
  cspResponseHeaderName,
  NONCE_HEADER,
} from "@/lib/security-headers";

/**
 * Everything except the immutable build output and static files, which carry no scripts of their
 * own and already receive the static headers from `next.config.ts`.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|glb|gltf|hdr|bin|woff|woff2)$).*)",
  ],
};

export function proxy(request: NextRequest): NextResponse {
  const nonce = createNonce();
  const policy = buildContentSecurityPolicy({
    nonce,
    isDevelopment: process.env.NODE_ENV !== "production",
  });

  const response = NextResponse.next({
    request: { headers: withNonce(request.headers, nonce, policy) },
  });
  response.headers.set(
    cspResponseHeaderName(CONTENT_SECURITY_POLICY_MODE),
    policy,
  );
  return response;
}

/**
 * Next reads the *request* `Content-Security-Policy` to learn the nonce it must stamp onto its own
 * bootstrap scripts. It has to be the enforcing header name even while the response only reports —
 * otherwise Next would emit unnonced scripts and the report-only rollout would report every one of
 * them, drowning the real findings.
 */
function withNonce(
  requestHeaders: Headers,
  nonce: string,
  policy: string,
): Headers {
  const headers = new Headers(requestHeaders);
  headers.set(NONCE_HEADER, nonce);
  headers.set(CSP_ENFORCED_HEADER, policy);
  return headers;
}

function createNonce(): string {
  return btoa(crypto.randomUUID());
}
