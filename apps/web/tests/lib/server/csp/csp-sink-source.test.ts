import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { routing } from "@/i18n/routing";
import {
  buildContentSecurityPolicy,
  CSP_REPORT_PATH,
} from "@/lib/security-headers";
import {
  CSP_DIRECTIVES,
  CSP_REPORT_LOCALES,
} from "@/lib/server/csp/csp-report";

import { readSource } from "../server-source-support";

const SOURCE_ROOT = join(import.meta.dirname, "../../../../src");
const ROUTE_FILE = `app${CSP_REPORT_PATH}/route.ts`;

/** What the sink may not reach: the code that reads or sets a visitor's cookie, and every store but the counters. */
const CODE_THAT_TOUCHES_COOKIES = [
  "lib/server/visitor.ts",
  "lib/server/visitor-resume.ts",
  "lib/server/write-token.ts",
];
const CODE_THAT_STORES = [
  "lib/server/repository.ts",
  "lib/server/contact/contact-submission-store-instance.ts",
];

/** The text of a source file with its comments taken out, so that a sentence that says "no cookie" is not a cookie. */
function codeOf(path: string): string {
  return readSource(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Every file under `src` the route reaches by an `@/` import, the route itself included, by path relative to `src`. */
function closureOfTheRoute(): string[] {
  const seen = new Set<string>();
  const pending = [ROUTE_FILE];
  for (let path = pending.pop(); path !== undefined; path = pending.pop()) {
    if (seen.has(path)) continue;
    seen.add(path);
    for (const imported of ownImportsOf(path)) pending.push(imported);
  }
  return [...seen];
}

function ownImportsOf(path: string): string[] {
  const specifiers = [...codeOf(path).matchAll(/from\s+"@\/([^"]+)"/g)].map(
    (match) => match[1] ?? "",
  );
  return specifiers.flatMap((specifier) =>
    ["ts", "tsx"]
      .map((extension) => `${specifier}.${extension}`)
      .filter((candidate) => existsSync(join(SOURCE_ROOT, candidate))),
  );
}

describe("the sink's source: it reads no cookie, sets none and stores nothing but the counter", () => {
  const closure = closureOfTheRoute();

  it("reaches the limiter, the reduction and the body reader, so that the walk below is over the real route", () => {
    expect(closure).toEqual(
      expect.arrayContaining([
        ROUTE_FILE,
        "lib/server/csp/csp-report.ts",
        "lib/server/csp/judge-csp-report.ts",
        "lib/server/rate-limit/judge-block-bucket.ts",
        "lib/server/read-body-with-limit.ts",
      ]),
    );
  });

  it("imports no cookies API in the route, in the csp modules, or in anything either reaches", () => {
    const cookieApis =
      /next\/headers|\bcookies\b|["']set-cookie["']|["']cookie["']/i;

    const offenders = closure.filter((path) => cookieApis.test(codeOf(path)));

    expect(offenders).toEqual([]);
  });

  it("reaches no module that reads a visitor's or a write token's cookie, and no store but the counters'", () => {
    expect(
      closure.filter((path) =>
        [...CODE_THAT_TOUCHES_COOKIES, ...CODE_THAT_STORES].includes(path),
      ),
    ).toEqual([]);
  });

  it("takes a plain `Request`, which has no cookie accessor, and exports the one method Next allows it", async () => {
    expect(codeOf(ROUTE_FILE)).not.toMatch(/NextRequest|NextResponse/);
    const exported = await import("../../../../src/app/api/csp-reports/route");
    expect(Object.keys(exported)).toEqual(["POST"]);
  });
});

/** Directives of the policy that govern the browser's behaviour, not a resource it fetches: no violation names them. */
const DIRECTIVES_NO_VIOLATION_NAMES: ReadonlySet<string> = new Set([
  "upgrade-insecure-requests",
  "report-uri",
]);

describe("the sink's address and its closed lists", () => {
  it("pins CSP_REPORT_PATH to /api/csp-reports, where a route file exists and exports POST", () => {
    expect(readFileSync(join(SOURCE_ROOT, ROUTE_FILE), "utf8")).toContain(
      "export async function POST",
    );
    expect(CSP_REPORT_PATH).toBe("/api/csp-reports");
  });

  it("names the locales the routing names, and every directive of the policy, in both of its branches", () => {
    expect([...CSP_REPORT_LOCALES]).toEqual([...routing.locales]);
    for (const isDevelopment of [false, true]) {
      const policy = buildContentSecurityPolicy({ nonce: "n", isDevelopment });
      const names = policy
        .split("; ")
        .map((directive) => directive.split(" ")[0] ?? "")
        .filter((name) => !DIRECTIVES_NO_VIOLATION_NAMES.has(name));

      expect(
        names.filter((name) => !CSP_DIRECTIVES.some((own) => own === name)),
      ).toEqual([]);
    }
  });

  it("holds no directive the policy does not have, but the -elem and -attr forms of its script and style sources", () => {
    const policy = buildContentSecurityPolicy({
      nonce: "n",
      isDevelopment: false,
    });
    const names = new Set(
      policy.split("; ").map((directive) => directive.split(" ")[0]),
    );

    const stale = CSP_DIRECTIVES.filter(
      (name) =>
        !names.has(name) && !/^(?:script|style)-src-(?:elem|attr)$/.test(name),
    );

    expect(stale).toEqual([]);
  });
});
