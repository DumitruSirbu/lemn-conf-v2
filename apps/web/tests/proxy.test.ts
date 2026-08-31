import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import nextConfig from "../next.config";
import { config, proxy } from "../src/proxy";
import {
  CSP_ENFORCED_HEADER,
  CSP_REPORT_ONLY_HEADER,
  NONCE_HEADER,
  STATIC_SECURITY_HEADERS,
} from "../src/lib/security-headers";

function respondTo(path: string) {
  return proxy(new NextRequest(new URL(path, "https://lemnaria.test")));
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("proxy security headers", () => {
  it("sends the policy report-only, and never both header names at once", () => {
    const response = respondTo("/configurator/configure");
    expect(response.headers.get(CSP_REPORT_ONLY_HEADER)).toBeTruthy();
    expect(response.headers.get(CSP_ENFORCED_HEADER)).toBeNull();
  });

  // Vitest runs with NODE_ENV=test, so without this stub every policy built through the proxy takes
  // the development branch and a deployed policy could leak 'unsafe-eval' or ws: unnoticed.
  it("emits the exact production policy when NODE_ENV is production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const policy = respondTo("/configurator/configure").headers.get(
      CSP_REPORT_ONLY_HEADER,
    );
    const nonce = /'nonce-([^']+)'/.exec(policy ?? "")?.[1];
    expect(nonce).toBeTruthy();
    expect(policy).toBe(
      [
        "default-src 'self'",
        `script-src 'self' 'nonce-${String(nonce)}' 'strict-dynamic'`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' blob: data:",
        "font-src 'self'",
        "connect-src 'self'",
        "worker-src 'self' blob:",
        "media-src 'self'",
        "manifest-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "frame-src 'none'",
        "upgrade-insecure-requests",
      ].join("; "),
    );
    expect(policy).not.toContain("unsafe-eval");
    expect(policy).not.toContain("ws:");
  });

  it("carries the required directives on a real route response", () => {
    const policy = respondTo("/configurator/configure").headers.get(
      CSP_REPORT_ONLY_HEADER,
    );
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("default-src 'self'");
    expect(policy).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  });

  it("hands Next a nonce on the request so its bootstrap scripts are not reported", () => {
    const response = respondTo("/");
    const nonce = response.headers.get(`x-middleware-request-${NONCE_HEADER}`);
    const requestPolicy = response.headers.get(
      `x-middleware-request-${CSP_ENFORCED_HEADER.toLowerCase()}`,
    );
    expect(nonce).toBeTruthy();
    expect(requestPolicy).toContain(`'nonce-${String(nonce)}'`);
  });

  it("issues a different nonce per request", () => {
    const first = respondTo("/").headers.get(CSP_REPORT_ONLY_HEADER);
    const second = respondTo("/").headers.get(CSP_REPORT_ONLY_HEADER);
    expect(first).not.toBe(second);
  });

  it("covers document and API routes but not immutable build output", () => {
    const pattern = config.matcher[0];
    expect(pattern).toBeTypeOf("string");
    const matches = new RegExp(`^${String(pattern)}$`);
    expect(matches.test("/")).toBe(true);
    expect(matches.test("/configurator/configure")).toBe(true);
    expect(matches.test("/d/abc123")).toBe(true);
    expect(matches.test("/api/designs")).toBe(true);
    expect(matches.test("/internal/scene-shot")).toBe(true);
    expect(matches.test("/_next/static/chunks/main.js")).toBe(false);
    expect(matches.test("/favicon.ico")).toBe(false);
    expect(matches.test("/textures/oak.png")).toBe(false);
  });
});

describe("next.config security headers", () => {
  it("applies the exact static header set to every route", async () => {
    const headers = await nextConfig.headers?.();
    expect(headers).toEqual([
      { source: "/:path*", headers: [...STATIC_SECURITY_HEADERS] },
    ]);
  });

  it("includes nosniff, a strict referrer policy and anti-framing", async () => {
    const headers = await nextConfig.headers?.();
    const byKey = new Map(
      headers?.[0]?.headers.map((header) => [header.key, header.value]),
    );
    expect(byKey.get("X-Content-Type-Options")).toBe("nosniff");
    expect(byKey.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(byKey.get("X-Frame-Options")).toBe("DENY");
    expect(byKey.get("Permissions-Policy")).toContain("camera=()");
  });
});
