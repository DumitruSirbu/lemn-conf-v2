import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  DesignAccessor,
  VisitorResumeLookup,
} from "@lemnaria/persistence";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * M7 wave 7E3a adversarial QA — the resume half. `home-navigation.test.ts` covers `/[locale]` only;
 * this runs the same matrix over **both** route modules, then pushes on the edges: cookie-value
 * boundaries, planted non-`__Host-` names, the clear's exact attributes, an id that needs encoding,
 * the throwing lookup's log line, and criterion 7's import/no-HTML claims.
 */

const VISITOR_COOKIE_NAME = "__Host-lemnaria_visitor";
const WELL_FORMED_VALUE = "Ab0_-".repeat(8) + "xyz";
const SOURCE_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../src",
);

const repository = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("@/lib/server/repository", () => ({
  getRepository: () => repository.current,
}));

const ROUTES = {
  "/{l}": await import("../../src/app/[locale]/route"),
  "/{l}/configurator/configure": await import(
    "../../src/app/[locale]/configurator/configure/route"
  ),
} as const;

class StubResumeRepository {
  readonly accessors: DesignAccessor[] = [];
  constructor(private readonly outcome: VisitorResumeLookup | Error) {}

  resume(accessor: DesignAccessor): Promise<VisitorResumeLookup> {
    this.accessors.push(accessor);
    return this.outcome instanceof Error
      ? Promise.reject(this.outcome)
      : Promise.resolve(this.outcome);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function requestWithCookieHeader(cookie?: string): NextRequest {
  return new NextRequest(
    "https://lemnaria.test/ro",
    cookie === undefined ? {} : { headers: { cookie } },
  );
}

function params(locale: string): { params: Promise<{ locale: string }> } {
  return { params: Promise.resolve({ locale }) };
}

function visitorSetCookies(response: Response): string[] {
  return response.headers
    .getSetCookie()
    .filter((line) => line.startsWith(`${VISITOR_COOKIE_NAME}=`));
}

function expectTheClear(response: Response): void {
  const lines = visitorSetCookies(response);
  expect(lines).toHaveLength(1);
  const clear = lines[0] ?? "";
  expect(clear.startsWith(`${VISITOR_COOKIE_NAME}=;`)).toBe(true);
  expect(clear).toMatch(/;\s*Max-Age=0(;|$)/);
  expect(clear).toMatch(/;\s*Secure(;|$)/);
  expect(clear).toMatch(/;\s*Path=\/(;|$)/);
  expect(clear).toMatch(/;\s*HttpOnly(;|$)/);
  expect(clear).toMatch(/SameSite=lax/i);
  expect(clear).not.toMatch(/Domain=/i);
}

for (const [routeName, { GET }] of Object.entries(ROUTES)) {
  describe.each(["ro", "ru"] as const)(`${routeName}, locale %s`, (locale) => {
    it("found: 307 to the design, no Set-Cookie at all, private no-store, empty body", async () => {
      const stub = new StubResumeRepository({ kind: "found", id: "abc" });
      repository.current = stub;

      const response = await GET(
        requestWithCookieHeader(`${VISITOR_COOKIE_NAME}=${WELL_FORMED_VALUE}`),
        params(locale),
      );

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(`/${locale}/d/abc`);
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(await response.text()).toBe("");
      // A request with no session asks as its browser alone: the accessor names no account.
      expect(stub.accessors).toEqual([
        { visitorHash: sha256Hex(WELL_FORMED_VALUE) },
      ]);
    });

    it("well-formed matching nothing: the clear carries Secure, Path=/, Max-Age=0 and no Domain", async () => {
      repository.current = new StubResumeRepository({ kind: "none" });

      const response = await GET(
        requestWithCookieHeader(`${VISITOR_COOKIE_NAME}=${WELL_FORMED_VALUE}`),
        params(locale),
      );

      expect(response.headers.get("location")).toBe(
        `/${locale}/configurator/room`,
      );
      expectTheClear(response);
    });

    const MALFORMED = [
      { name: "42 characters", value: "a".repeat(42) },
      { name: "44 characters", value: "a".repeat(44) },
      { name: "43 with '+'", value: `${"a".repeat(42)}+` },
      { name: "43 with '='", value: `${"a".repeat(42)}=` },
    ];

    it.each(MALFORMED)(
      "malformed ($name): the clear, and no query",
      async ({ value }) => {
        const stub = new StubResumeRepository({ kind: "found", id: "never" });
        repository.current = stub;

        const response = await GET(
          requestWithCookieHeader(`${VISITOR_COOKIE_NAME}=${value}`),
          params(locale),
        );

        expect(response.headers.get("location")).toBe(
          `/${locale}/configurator/room`,
        );
        expectTheClear(response);
        expect(stub.accessors).toEqual([]);
      },
    );

    it("an empty value is treated as absent: no clear, no query", async () => {
      const stub = new StubResumeRepository({ kind: "found", id: "never" });
      repository.current = stub;

      const response = await GET(
        requestWithCookieHeader(`${VISITOR_COOKIE_NAME}=`),
        params(locale),
      );

      expect(response.headers.get("location")).toBe(
        `/${locale}/configurator/room`,
      );
      expect(visitorSetCookies(response)).toEqual([]);
      expect(stub.accessors).toEqual([]);
    });

    it("a planted un-prefixed `lemnaria_visitor` is never read: no query, no clear", async () => {
      const stub = new StubResumeRepository({ kind: "found", id: "never" });
      repository.current = stub;

      const response = await GET(
        requestWithCookieHeader(`lemnaria_visitor=${WELL_FORMED_VALUE}`),
        params(locale),
      );

      expect(response.headers.get("location")).toBe(
        `/${locale}/configurator/room`,
      );
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(stub.accessors).toEqual([]);
    });

    it("a lookup that throws leaves the cookie untouched and logs no value, hash or id", async () => {
      repository.current = new StubResumeRepository(
        Object.assign(new Error("terminating connection"), { code: "57P01" }),
      );
      const error = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      const warn = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);

      const response = await GET(
        requestWithCookieHeader(`${VISITOR_COOKIE_NAME}=${WELL_FORMED_VALUE}`),
        params(locale),
      );

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        `/${locale}/configurator/room`,
      );
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(error).toHaveBeenCalledOnce();
      expect(warn).not.toHaveBeenCalled();
      const logged = JSON.stringify(error.mock.calls);
      expect(logged).toContain('"operation":"resume"');
      expect(logged).not.toContain(WELL_FORMED_VALUE);
      expect(logged).not.toContain(sha256Hex(WELL_FORMED_VALUE));
    });

    it("a found id that needs encoding cannot escape the path or become a protocol-relative URL", async () => {
      repository.current = new StubResumeRepository({
        kind: "found",
        id: "/evil.test/x?y#z",
      });

      const response = await GET(
        requestWithCookieHeader(`${VISITOR_COOKIE_NAME}=${WELL_FORMED_VALUE}`),
        params(locale),
      );

      const location = response.headers.get("location") ?? "";
      expect(location).toBe(`/${locale}/d/%2Fevil.test%2Fx%3Fy%23z`);
      expect(location.startsWith("//")).toBe(false);
    });

    it("never answers anything but 307 or 404, and never HTML, whatever the cookie", async () => {
      repository.current = new StubResumeRepository({ kind: "found", id: "x" });
      const headers = [
        undefined,
        `${VISITOR_COOKIE_NAME}=${WELL_FORMED_VALUE}`,
        `${VISITOR_COOKIE_NAME}=bad`,
      ];
      for (const cookie of headers) {
        const response = await GET(
          requestWithCookieHeader(cookie),
          params(locale),
        );
        expect(response.status).toBe(307);
        expect(response.headers.get("content-type") ?? "").not.toMatch(/html/);
      }
    });
  });

  it(`${routeName}: /en answers 404 with no Set-Cookie and no query`, async () => {
    const stub = new StubResumeRepository({ kind: "found", id: "never" });
    repository.current = stub;

    const response = await GET(
      requestWithCookieHeader(`${VISITOR_COOKIE_NAME}=bad`),
      params("en"),
    );

    expect(response.status).toBe(404);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(stub.accessors).toEqual([]);
  });
}

describe("criterion 7 — neither route module can reach the editor", () => {
  const ROUTE_FILES = [
    "app/[locale]/route.ts",
    "app/[locale]/configurator/configure/route.ts",
    "lib/server/visitor-resume.ts",
  ];

  it.each(ROUTE_FILES)(
    "%s imports nothing from app/configurator, store or components",
    (file) => {
      const source = readFileSync(resolve(SOURCE_DIR, file), "utf8");
      const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map(
        (m) => m[1] ?? "",
      );

      for (const specifier of imports) {
        expect(specifier).not.toMatch(
          /app\/configurator|\/store|\/components|configure-screen/,
        );
      }
    },
  );

  it("no page.tsx survives beside either route.ts", () => {
    for (const dir of ["app/[locale]", "app/[locale]/configurator/configure"]) {
      expect(() =>
        readFileSync(resolve(SOURCE_DIR, dir, "page.tsx")),
      ).toThrow();
    }
  });
});
