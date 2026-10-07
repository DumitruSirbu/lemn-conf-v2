import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import nextConfig from "../next.config";
import { config, proxy } from "../src/proxy";
import {
  CSP_ENFORCED_HEADER,
  CSP_REPORT_ONLY_HEADER,
  NONCE_HEADER,
  SHARE_VIEW_HEADERS,
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
    expect(matches.test("/configurator/room")).toBe(true);
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

  it.each(["/ro/configurator/room", "/ru/configurator/room"])(
    "keeps the CSP and nonce on the new localized room route %s",
    (path) => {
      const response = respondTo(path);
      const nonce = requestHeader(response, NONCE_HEADER);

      expect(nonce).toBeTruthy();
      expect(requestHeader(response, CSP_ENFORCED_HEADER)).toContain(
        `'nonce-${String(nonce)}'`,
      );
      expect(response.headers.get(CSP_REPORT_ONLY_HEADER)).toContain(
        `'nonce-${String(nonce)}'`,
      );
    },
  );

  it.each(["ro", "ru"] as const)(
    "leaves the localized %s room query in place while decorating the response",
    (locale) => {
      const response = respondTo(
        `/${locale}/configurator/room?shape=L&wallA=3.6&tag=a&tag=b`,
      );
      const nonce = requestHeader(response, NONCE_HEADER);

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
      expect(requestHeader(response, "x-next-intl-locale")).toBe(locale);
      expect(nonce).toBeTruthy();
      expect(requestHeader(response, CSP_ENFORCED_HEADER)).toContain(
        `'nonce-${String(nonce)}'`,
      );
      expect(response.headers.get(CSP_REPORT_ONLY_HEADER)).toContain(
        `'nonce-${String(nonce)}'`,
      );
    },
  );

  it.each(["ro", "ru"] as const)(
    "preserves the complete room query and CSP on a negotiated %s redirect",
    (locale) => {
      const response = respondTo(
        "/configurator/room?shape=L&wallA=3.6&tag=a&tag=b",
        { "accept-language": locale },
      );

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        `https://lemnaria.test/${locale}/configurator/room?shape=L&wallA=3.6&tag=a&tag=b`,
      );
      expect(response.headers.get(CSP_REPORT_ONLY_HEADER)).toMatch(
        /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/,
      );
    },
  );

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
    "/ro/configurator/room",
    "/ru/configurator/room",
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
    "/en/configurator/room",
    "/fr/configurator/room",
    "/ro/api/designs",
    "/ru/internal/scene-shot",
    "/ro/configurator/Room",
    "/ro/configurator/room/x",
    "/ru/configurator/room/x",
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
    "/Ro/configurator/room",
    "/RU/configurator/room",
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

describe("proxy share-view routing and headers (M7 wave 7E3c D7)", () => {
  it.each(["/ro/s/abcDEF123456", "/ru/s/abcDEF123456"])(
    "routes the localized share view %s through locale routing",
    (path) => {
      const response = respondTo(path);

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-next")).toBe("1");
    },
  );

  it("redirects the unprefixed link to the negotiated locale, carrying the share headers (criterion 8)", () => {
    const response = respondTo("/s/abcDEF123456", {
      "accept-language": "ru",
    });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://lemnaria.test/ru/s/abcDEF123456",
    );
    // QA round 1, Q4: pinned to the literal values, not to `SHARE_VIEW_HEADERS` itself — a test
    // asserting a module's own constant against itself passes however that constant is edited and
    // proves nothing about the response.
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("carries the three share headers on the localized page response too", () => {
    const response = respondTo("/ro/s/abcDEF123456");

    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("carries no share header on an ordinary customer route", () => {
    const response = respondTo("/ro/d/design-123");

    for (const { key } of SHARE_VIEW_HEADERS) {
      expect(response.headers.get(key)).toBeNull();
    }
  });

  it.each(["/en/s/abcDEF123456", "/ro/s/abcDEF123456/extra"])(
    "does not reinterpret the unsupported share path %s",
    (path) => {
      const response = respondTo(path, {
        cookie: "NEXT_LOCALE=ru",
        "accept-language": "ru",
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
      expect(requestHeader(response, "x-next-intl-locale")).toBeNull();
    },
  );

  it("returns the CSP-decorated public 404 for a case-variant locale on the share path", () => {
    const response = respondTo("/RO/s/abcDEF123456");

    expect(response.status).toBe(404);
    expect(requestHeader(response, "x-next-intl-locale")).toBeNull();
  });
});

describe("proxy design-step routing", () => {
  it.each(
    (["ro", "ru"] as const).flatMap((locale) =>
      (["review", "contact", "done"] as const).map(
        (step) => [locale, step] as const,
      ),
    ),
  )(
    "routes the localized design step /%s/d/{id}/%s through locale routing",
    (locale, step) => {
      const response = respondTo(`/${locale}/d/design-123/${step}`);

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(requestHeader(response, "x-next-intl-locale")).toBe(locale);
      expect(response.headers.get("link")).toContain('hreflang="ro"');
      expect(response.headers.get("link")).toContain('hreflang="ru"');
    },
  );

  it.each(["review", "contact", "done"])(
    "redirects the unprefixed /d/{id}/%s to the negotiated locale, keeping the query",
    (step) => {
      const response = respondTo(`/d/design-123/${step}?from=editor`, {
        "accept-language": "ru",
      });

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        `https://lemnaria.test/ru/d/design-123/${step}?from=editor`,
      );
    },
  );

  it("carries no share header on a design step", () => {
    const response = respondTo("/ro/d/design-123/review");

    for (const { key } of SHARE_VIEW_HEADERS) {
      expect(response.headers.get(key)).toBeNull();
    }
  });

  it.each([
    "/ro/d/design-123/anything-else",
    "/ru/d/design-123/anything-else",
    "/ro/d/design-123/Review",
    "/ro/d/design-123/reviews",
    "/ro/d/design-123/review/extra",
    "/ru/d/design-123/contact/extra",
    "/ro/d/design-123/done/extra",
    "/ro/d/design-123/review/contact",
    "/ro/d/design-123/review%2Fextra",
    "/ro/s/abcDEF123456/review",
    "/ru/s/abcDEF123456/contact",
    "/ro/configurator/room/review",
  ])("does not reinterpret the unsupported design path %s", (path) => {
    const response = respondTo(path, {
      cookie: "NEXT_LOCALE=ru",
      "accept-language": "ru",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(requestHeader(response, "x-next-intl-locale")).toBeNull();
  });

  it.each(["/RO/d/design-123/review", "/Ru/d/design-123/done"])(
    "returns the CSP-decorated public 404 for case-variant locale design step %s",
    (path) => {
      const response = respondTo(path);

      expect(response.status).toBe(404);
      expect(requestHeader(response, "x-next-intl-locale")).toBeNull();
    },
  );
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
