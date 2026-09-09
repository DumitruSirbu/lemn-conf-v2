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

function respondTo(path: string, headers?: HeadersInit) {
  const url = new URL(path, "https://lemnaria.test");
  return proxy(
    headers === undefined
      ? new NextRequest(url)
      : new NextRequest(url, { headers }),
  );
}

function requestHeader(response: Response, name: string): string | null {
  return response.headers.get(`x-middleware-request-${name.toLowerCase()}`);
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
    const response = respondTo("/ro/configurator/configure");
    const nonce = response.headers.get(`x-middleware-request-${NONCE_HEADER}`);
    const requestPolicy = response.headers.get(
      `x-middleware-request-${CSP_ENFORCED_HEADER.toLowerCase()}`,
    );
    expect(nonce).toBeTruthy();
    expect(requestPolicy).toContain(`'nonce-${String(nonce)}'`);
  });

  it.each(["/api/designs", "/internal/scene-shot"])(
    "preserves the CSP and nonce request context while bypassing locale routing for %s",
    (path) => {
      const response = respondTo(path);
      const nonce = requestHeader(response, NONCE_HEADER);

      expect(response.headers.get("location")).toBeNull();
      expect(requestHeader(response, "x-next-intl-locale")).toBeNull();
      expect(nonce).toBeTruthy();
      expect(requestHeader(response, CSP_ENFORCED_HEADER)).toContain(
        `'nonce-${String(nonce)}'`,
      );
      expect(response.headers.get(CSP_REPORT_ONLY_HEADER)).toBeTruthy();
    },
  );

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

describe("proxy locale routing", () => {
  it("negotiates a valid locale cookie before Accept-Language", () => {
    const response = respondTo("/configurator/configure", {
      cookie: "NEXT_LOCALE=ru",
      "accept-language": "ro;q=1, ru;q=0.5",
    });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://lemnaria.test/ru/configurator/configure",
    );
    expect(response.headers.get(CSP_REPORT_ONLY_HEADER)).toBeTruthy();
  });

  it("ignores an invalid locale cookie and falls through to Accept-Language", () => {
    const response = respondTo("/configurator/contact", {
      cookie: "NEXT_LOCALE=en",
      "accept-language": "ru, ro;q=0.5",
    });

    expect(response.headers.get("location")).toBe(
      "https://lemnaria.test/ru/configurator/contact",
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("set-cookie")).toContain("NEXT_LOCALE=ru");
  });

  it.each([
    [undefined, "/ro/configurator/configure"],
    ["not-a-language-%%%", "/ro/configurator/configure"],
  ])(
    "falls back to Romanian for absent or malformed Accept-Language %s",
    (acceptLanguage, expectedPath) => {
      const headers = new Headers();
      if (acceptLanguage !== undefined)
        headers.set("accept-language", acceptLanguage);

      const response = respondTo("/configurator/configure", headers);
      expect(new URL(response.headers.get("location") ?? "").pathname).toBe(
        expectedPath,
      );
    },
  );

  it("gives an explicit supported prefix precedence over cookie and header", () => {
    const response = respondTo("/ro/configurator/contact", {
      cookie: "NEXT_LOCALE=ru",
      "accept-language": "ru",
    });

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(requestHeader(response, "x-next-intl-locale")).toBe("ro");
    expect(response.headers.get("set-cookie")).toContain("NEXT_LOCALE=ro");
  });

  it("preserves the complete query on a negotiated redirect", () => {
    const response = respondTo(
      "/d/design-123?mode=read%20only&intent=callback",
      { "accept-language": "ru" },
    );

    expect(response.headers.get("location")).toBe(
      "https://lemnaria.test/ru/d/design-123?mode=read%20only&intent=callback",
    );
  });

  it.each([
    "/ro",
    "/ru",
    "/ro/configurator/configure",
    "/ru/configurator/configure",
    "/ro/configurator/contact",
    "/ru/configurator/contact",
    "/ro/d/design-123",
    "/ru/d/design-123",
  ])("routes the localized customer entrypoint %s", (path) => {
    const response = respondTo(path);
    const expectedLocale = path.split("/")[1];

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(requestHeader(response, "x-next-intl-locale")).toBe(expectedLocale);
    expect(response.headers.get("link")).toContain('hreflang="ro"');
    expect(response.headers.get("link")).toContain('hreflang="ru"');
  });

  it.each([
    "/en/configurator/configure",
    "/ro/api/designs",
    "/ru/internal/scene-shot",
    "/ro/not-a-customer-route",
  ])("does not reinterpret the unsupported path %s", (path) => {
    const response = respondTo(path, {
      cookie: "NEXT_LOCALE=ru",
      "accept-language": "ru",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(requestHeader(response, "x-next-intl-locale")).toBeNull();
    expect(requestHeader(response, NONCE_HEADER)).toBeTruthy();
  });

  it.each([
    "/RO/configurator/configure",
    "/rO/configurator/contact",
    "/Ru/d/design-123",
  ])(
    "returns a CSP-decorated public 404 for case-variant locale path %s",
    (path) => {
      const response = respondTo(path, {
        cookie: "NEXT_LOCALE=ru",
        "accept-language": "ru",
      });

      expect(response.status).toBe(404);
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-next")).toBeNull();
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
      expect(requestHeader(response, "x-next-intl-locale")).toBeNull();
      expect(response.headers.get(CSP_REPORT_ONLY_HEADER)).toMatch(
        /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/,
      );
    },
  );

  it("decorates the exact redirect without losing status, location, query, cookie, or CSP", () => {
    const response = respondTo("/?entry=hero", {
      cookie: "NEXT_LOCALE=en",
      "accept-language": "ru",
    });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://lemnaria.test/ru?entry=hero",
    );
    expect(response.headers.get("set-cookie")).toContain("NEXT_LOCALE=ru");
    expect(response.headers.get(CSP_REPORT_ONLY_HEADER)).toMatch(
      /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/,
    );
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
