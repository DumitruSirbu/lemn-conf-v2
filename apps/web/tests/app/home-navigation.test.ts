import type { VisitorResumeLookup } from "@lemnaria/persistence";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M7 wave 7E3a S3 — `[locale]/route.ts`, criterion 4's resume matrix and criterion 6's "before any
 * cookie is read" 404, each branch against a repository double (criterion 4: "each branch is also
 * in Vitest with a repository double"). `configure-route.e2e.spec.ts` covers the same matrix, over
 * both routes, in a real browser.
 */

const VISITOR_COOKIE_NAME = "__Host-lemnaria_visitor";
const WELL_FORMED_VALUE = "a".repeat(43);
const MALFORMED_VALUE = "not-base64url-and-not-43-chars";

const reportDesignFailure = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/design-failure-log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/design-failure-log")>()),
  reportDesignFailure,
}));

const repository = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("@/lib/server/repository", () => ({
  getRepository: () => repository.current,
}));

const { GET } = await import("../../src/app/[locale]/route");

class StubResumeRepository {
  calls = 0;
  constructor(private readonly outcome: VisitorResumeLookup | Error) {}

  resumeVisitor(): Promise<VisitorResumeLookup> {
    this.calls += 1;
    return this.outcome instanceof Error
      ? Promise.reject(this.outcome)
      : Promise.resolve(this.outcome);
  }
}

function requestCarrying(cookieValue?: string): NextRequest {
  return new NextRequest(
    "https://lemnaria.test/ro",
    cookieValue === undefined
      ? {}
      : { headers: { cookie: `${VISITOR_COOKIE_NAME}=${cookieValue}` } },
  );
}

function routeParams(locale: string): { params: Promise<{ locale: string }> } {
  return { params: Promise.resolve({ locale }) };
}

beforeEach(() => {
  reportDesignFailure.mockClear();
});

describe.each(["ro", "ru"] as const)("locale %s", (locale) => {
  it("no cookie: 307 to room, no Set-Cookie, the repository is never called", async () => {
    const stub = new StubResumeRepository({ kind: "none" });
    repository.current = stub;

    const response = await GET(requestCarrying(), routeParams(locale));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `/${locale}/configurator/room`,
    );
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(stub.calls).toBe(0);
  });

  it("well-formed, matching nothing: 307 to room, plus the clear", async () => {
    repository.current = new StubResumeRepository({ kind: "none" });

    const response = await GET(
      requestCarrying(WELL_FORMED_VALUE),
      routeParams(locale),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `/${locale}/configurator/room`,
    );
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${VISITOR_COOKIE_NAME}=;`);
    expect(setCookie).toContain("Max-Age=0");
  });

  it("malformed: 307 to room, plus the clear, and no query", async () => {
    const stub = new StubResumeRepository({ kind: "none" });
    repository.current = stub;

    const response = await GET(
      requestCarrying(MALFORMED_VALUE),
      routeParams(locale),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `/${locale}/configurator/room`,
    );
    expect(response.headers.get("set-cookie") ?? "").toContain("Max-Age=0");
    expect(stub.calls).toBe(0);
  });

  it("a lookup that throws: 307 to room, no Set-Cookie, one resume log line", async () => {
    repository.current = new StubResumeRepository(
      new Error("connection reset"),
    );

    const response = await GET(
      requestCarrying(WELL_FORMED_VALUE),
      routeParams(locale),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `/${locale}/configurator/room`,
    );
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(reportDesignFailure).toHaveBeenCalledExactlyOnceWith(
      "resume",
      expect.any(Error),
    );
  });

  it("every branch: an empty body, private no-store, and a relative Location with no query", async () => {
    repository.current = new StubResumeRepository({ kind: "none" });

    const response = await GET(requestCarrying(), routeParams(locale));

    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie");
    const location = response.headers.get("location") ?? "";
    expect(location.startsWith("/")).toBe(true);
    expect(location).not.toContain("?");
    expect(location).not.toContain("://");
  });
});

it("an unsupported locale answers 404 before any cookie is read", async () => {
  const stub = new StubResumeRepository({ kind: "none" });
  repository.current = stub;

  const response = await GET(
    requestCarrying(WELL_FORMED_VALUE),
    routeParams("en"),
  );

  expect(response.status).toBe(404);
  expect(stub.calls).toBe(0);
});
