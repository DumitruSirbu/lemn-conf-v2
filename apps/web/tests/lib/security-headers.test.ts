import { describe, expect, it } from "vitest";

import {
  buildContentSecurityPolicy,
  CONTENT_SECURITY_POLICY_MODE,
  CSP_ENFORCED_HEADER,
  CSP_REPORT_ONLY_HEADER,
  CSP_REPORT_PATH,
  cspResponseHeaderName,
  STATIC_SECURITY_HEADERS,
} from "../../src/lib/security-headers";

function directives(policy: string): string[] {
  return policy.split("; ");
}

function directive(policy: string, name: string): string {
  const found = directives(policy).find(
    (entry) => entry === name || entry.startsWith(`${name} `),
  );
  if (!found) throw new Error(`policy has no ${name} directive: ${policy}`);
  return found;
}

const PRODUCTION_POLICY = buildContentSecurityPolicy({
  nonce: "TEST_NONCE",
  isDevelopment: false,
});

describe("STATIC_SECURITY_HEADERS", () => {
  it("is exactly the versioned set every response must carry", () => {
    expect(STATIC_SECURITY_HEADERS).toEqual([
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Strict-Transport-Security",
        value: "max-age=15552000; includeSubDomains",
      },
      {
        key: "Permissions-Policy",
        value:
          "accelerometer=(), ambient-light-sensor=(), autoplay=(), camera=(), " +
          "display-capture=(), encrypted-media=(), geolocation=(), gyroscope=(), " +
          "magnetometer=(), microphone=(), midi=(), payment=(), usb=(), " +
          "xr-spatial-tracking=()",
      },
      { key: "X-DNS-Prefetch-Control", value: "off" },
    ]);
  });

  it("pins HTTPS for six months without committing to the irreversible preload list", () => {
    const hsts = STATIC_SECURITY_HEADERS.find(
      (header) => header.key === "Strict-Transport-Security",
    );
    expect(hsts?.value).toContain("includeSubDomains");
    expect(hsts?.value).not.toContain("preload");
    const maxAge = /max-age=(\d+)/.exec(hsts?.value ?? "")?.[1];
    expect(Number(maxAge)).toBeGreaterThanOrEqual(15_552_000);
  });

  it("disables the sensors, camera, microphone and geolocation the app never uses", () => {
    const permissionsPolicy = STATIC_SECURITY_HEADERS.find(
      (header) => header.key === "Permissions-Policy",
    );
    for (const feature of [
      "camera",
      "microphone",
      "geolocation",
      "accelerometer",
      "gyroscope",
      "magnetometer",
    ]) {
      expect(permissionsPolicy?.value).toContain(`${feature}=()`);
    }
  });
});

describe("cspResponseHeaderName", () => {
  // The one test that names the live mode: a rollback is the constant set back and this test edited (8Q.5).
  it("enforces the policy, under the enforcing header name", () => {
    expect(CONTENT_SECURITY_POLICY_MODE).toBe("enforce");
    expect(cspResponseHeaderName(CONTENT_SECURITY_POLICY_MODE)).toBe(
      CSP_ENFORCED_HEADER,
    );
  });

  it("switches to the enforcing header from the one mode constant", () => {
    expect(cspResponseHeaderName("enforce")).toBe(CSP_ENFORCED_HEADER);
    expect(cspResponseHeaderName("report-only")).toBe(CSP_REPORT_ONLY_HEADER);
  });
});

describe("buildContentSecurityPolicy", () => {
  it("carries every directive the security baseline requires", () => {
    expect(directive(PRODUCTION_POLICY, "object-src")).toBe(
      "object-src 'none'",
    );
    expect(directive(PRODUCTION_POLICY, "base-uri")).toBe("base-uri 'self'");
    expect(directive(PRODUCTION_POLICY, "frame-ancestors")).toBe(
      "frame-ancestors 'none'",
    );
    expect(directive(PRODUCTION_POLICY, "default-src")).toBe(
      "default-src 'self'",
    );
    expect(directive(PRODUCTION_POLICY, "form-action")).toBe(
      "form-action 'self'",
    );
  });

  it("admits scripts by nonce and never by a blanket unsafe-inline", () => {
    expect(directive(PRODUCTION_POLICY, "script-src")).toBe(
      "script-src 'self' 'nonce-TEST_NONCE' 'strict-dynamic'",
    );
    expect(directive(PRODUCTION_POLICY, "script-src")).not.toContain(
      "unsafe-inline",
    );
    expect(directive(PRODUCTION_POLICY, "script-src")).not.toContain(
      "unsafe-eval",
    );
  });

  it("gives each request its own nonce rather than a constant", () => {
    const other = buildContentSecurityPolicy({
      nonce: "OTHER_NONCE",
      isDevelopment: false,
    });
    expect(directive(other, "script-src")).toContain("'nonce-OTHER_NONCE'");
    expect(directive(other, "script-src")).not.toContain("'nonce-TEST_NONCE'");
  });

  it("admits the blob and data sources three.js needs for textures and workers", () => {
    expect(directive(PRODUCTION_POLICY, "img-src")).toBe(
      "img-src 'self' blob: data:",
    );
    expect(directive(PRODUCTION_POLICY, "worker-src")).toBe(
      "worker-src 'self' blob:",
    );
  });

  it("keeps the dev-server allowances out of a production policy", () => {
    const development = buildContentSecurityPolicy({
      nonce: "TEST_NONCE",
      isDevelopment: true,
    });
    expect(directive(development, "script-src")).toContain("'unsafe-eval'");
    expect(directive(development, "connect-src")).toBe(
      "connect-src 'self' ws: wss:",
    );
    expect(directives(development)).not.toContain("upgrade-insecure-requests");

    expect(directive(PRODUCTION_POLICY, "connect-src")).toBe(
      "connect-src 'self'",
    );
    expect(directives(PRODUCTION_POLICY)).toContain(
      "upgrade-insecure-requests",
    );
  });

  it("names the application's own sink with a report-uri, in both branches and as the only reporting directive", () => {
    for (const isDevelopment of [false, true]) {
      const policy = buildContentSecurityPolicy({ nonce: "n", isDevelopment });
      expect(directive(policy, "report-uri")).toBe(
        `report-uri ${CSP_REPORT_PATH}`,
      );
      expect(
        directives(policy).filter((entry) => entry.startsWith("report-")),
      ).toHaveLength(1);
    }
    expect(CSP_REPORT_PATH).toBe("/api/csp-reports");
  });

  it("names no external origin, because the browser bundle loads none", () => {
    expect(PRODUCTION_POLICY).not.toContain("http://");
    expect(PRODUCTION_POLICY).not.toContain("https://");
    expect(PRODUCTION_POLICY).not.toContain("*");
  });
});
