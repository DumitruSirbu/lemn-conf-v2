// Wave 8Q criterion 1, QA's sweep: the developer's `unmatched-addresses` spec names the classes S0 measured; this one
// walks a seeded sample of addresses nobody named (locale prefixes right and wrong, depth, dots, percent-escapes, other
// scripts, internal names, query strings) and holds every answer to the same rule, under the live policy: an answer that
// is an HTML document with scripts carries a policy whose nonce is on every one of its scripts, a second load carries
// another nonce, and no body is one of the build's prerendered files. The one named exemption is an address the proxy's
// matcher skips (a last segment with a file extension, `/_next/`): it carries no policy, is recorded, and is asserted to
// be exactly that class, so a document with no policy anywhere else is a red.
//
// The sample is `fc.sample` with a fixed seed: deterministic, and a failing address is printed whole. A control proves the
// check can fail: a prerendered file's body, served as a response, is flagged by the same function.
// THIS FILE IS A `CI=1` SPEC. Run it with:
//   CI=1 pnpm exec playwright test tests/e2e/qa-8q-unmatched-sweep.adversarial.e2e.spec.ts --project=mobile
// Writes: none. Every request is a GET.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type APIRequestContext } from "@playwright/test";
import fc from "fast-check";

import { POLICY_HEADER, nonceOfPolicy } from "./support/csp-violations";

const RUN_UNDER_CI =
  "It reads the production build the first server makes under CI. Run it with: " +
  "CI=1 pnpm exec playwright test tests/e2e/qa-8q-unmatched-sweep.adversarial.e2e.spec.ts --project=mobile";

const SEED = 20_261_013;
const SAMPLE_SIZE = 90;
const SMALLEST_HTML_SHARE = 20;
const PRERENDERED_DIRECTORY = join(process.cwd(), ".next", "server", "app");
const SCRIPT_TAG = /<script\b[^>]*>/g;
const NONCE_ATTRIBUTE = /\snonce="([^"]*)"/;
const HAS_EXTENSION = /\.[A-Za-z0-9]{1,8}$/;

const PREFIXES = [
  "/ro",
  "/ru",
  "/xx",
  "/RO",
  "/ro/d",
  "/ro/d/e2e-readiness-probe",
  "/ro/configurator",
  "/ru/configurator/room",
  "/ro/s",
  "/ru/d/x/review",
  "/ro/d/x/contact",
  "/api",
  "/api/designs",
  "/internal",
  "",
  "/_next",
] as const;

const SEGMENTS = [
  "zz",
  "..",
  ".",
  "%2e%2e",
  "%2E",
  "%00",
  "%20",
  "%2F",
  "%E2%82%AC",
  "a.b",
  "x.png",
  "x.js",
  "x.map",
  "ß",
  "日本語",
  "ё",
  "_not-found",
  "_global-error",
  "favicon.ico",
  "robots.txt",
  ";x=1",
  "@",
  "~",
  "a+b",
  "room",
  "contact",
  "done",
  "review",
] as const;

const address = fc
  .tuple(
    fc.constantFrom(...PREFIXES),
    fc.array(
      fc.oneof(
        fc.constantFrom(...SEGMENTS),
        fc.stringMatching(/^[a-z0-9._~-]{1,14}$/),
      ),
      { minLength: 0, maxLength: 4 },
    ),
    fc.constantFrom("", "", "", "?x=1", "?locale=ru&a[]=1", "?%00=%E0"),
  )
  .map(
    ([prefix, segments, query]) =>
      `${prefix}${segments.map(asSegment).join("")}${query}`,
  )
  .filter((path) => path.startsWith("/"));

interface Load {
  readonly status: number;
  readonly contentType: string;
  readonly body: string;
  readonly policy: string | undefined;
  readonly nonce: string | undefined;
}

test.describe("a seeded sweep of addresses nobody named, under the live policy", () => {
  test.skip(process.env.CI === undefined, RUN_UNDER_CI);

  test("the judge can fail; and every HTML answer with scripts is nonced by its own response, a new nonce on each load, and none is a prerendered file", async ({
    request,
  }, testInfo) => {
    expectTheJudgeCanFail();
    const sample = [
      ...new Set(fc.sample(address, { numRuns: SAMPLE_SIZE, seed: SEED })),
    ];
    const prerendered = prerenderedFiles();
    const undocumented: string[] = [];
    const noPolicy: string[] = [];
    let htmlWithScripts = 0;

    for (const path of sample) {
      const first = await load(request, path);
      const second = await load(request, path);
      const verdict = judge(path, first, second, prerendered);
      if (verdict.kind === "violation") {
        undocumented.push(`${path}: ${verdict.reason}`);
      } else if (verdict.kind === "no-policy-exemption") {
        noPolicy.push(`${path} -> ${String(first.status)}`);
      } else if (verdict.kind === "nonced-document") {
        htmlWithScripts += 1;
      }
    }

    testInfo.annotations.push({
      type: "sweep",
      description:
        `${String(sample.length)} addresses, ${String(htmlWithScripts)} nonced documents, ` +
        `${String(noPolicy.length)} documents with no policy (the extension exemption): ${noPolicy.join(", ")}`,
    });
    expect(undocumented, "addresses that break the rule").toEqual([]);
    expect(
      htmlWithScripts,
      "documents with scripts the sweep actually judged",
    ).toBeGreaterThanOrEqual(SMALLEST_HTML_SHARE);
  });
});

/** The control: the judge flags a prerendered file served as an answer, an un-nonced script and a repeated nonce. */
function expectTheJudgeCanFail(): void {
  const prerendered = prerenderedFiles();
  const file = prerendered[0] ?? "";
  const served = (body: string, nonce: string | undefined): Load => ({
    status: 404,
    contentType: "text/html; charset=utf-8",
    body,
    policy: nonce === undefined ? undefined : `script-src 'nonce-${nonce}'`,
    nonce,
  });

  expect(file.length).toBeGreaterThan(0);
  expect(
    judge("/ro/zz", served(file, "n1"), served(file, "n2"), prerendered).kind,
  ).toBe("violation");
  expect(
    judge(
      "/ro/zz",
      served('<script nonce="other">1</script>', "n1"),
      served('<script nonce="other">1</script>', "n2"),
      prerendered,
    ).kind,
  ).toBe("violation");
  expect(
    judge(
      "/ro/zz",
      served('<script nonce="n1">1</script>', "n1"),
      served('<script nonce="n1">1</script>', "n1"),
      prerendered,
    ).kind,
  ).toBe("violation");
  expect(
    judge(
      "/ro/zz",
      served('<script nonce="n1">1</script>', "n1"),
      served('<script nonce="n2">1</script>', "n2"),
      prerendered,
    ).kind,
  ).toBe("nonced-document");
  expect(
    judge(
      "/ro/zz",
      served("<script>1</script>", undefined),
      served("<script>1</script>", undefined),
      prerendered,
    ).kind,
    "no policy on an address with no extension",
  ).toBe("violation");
}

function asSegment(segment: string): string {
  return `/${segment.includes("%") ? segment : encodeURIComponent(segment)}`;
}

async function load(request: APIRequestContext, path: string): Promise<Load> {
  const response = await request.fetch(path, {
    maxRedirects: 0,
    failOnStatusCode: false,
    headers: { accept: "text/html" },
  });
  const headers = response.headers();
  const policy = headers[POLICY_HEADER];
  return {
    status: response.status(),
    contentType: headers["content-type"] ?? "",
    body: await response.text(),
    policy,
    nonce: nonceOfPolicy(policy),
  };
}

type Verdict =
  | { readonly kind: "not-a-document" }
  | { readonly kind: "nonced-document" }
  | { readonly kind: "no-policy-exemption" }
  | { readonly kind: "violation"; readonly reason: string };

/** The rule of the file's opening comment, applied to two loads of one address. */
function judge(
  path: string,
  first: Load,
  second: Load,
  prerendered: readonly string[],
): Verdict {
  const scripts = scriptsOf(first.body);
  const isDocument =
    first.contentType.includes("text/html") && scripts.length > 0;
  if (!isDocument) return { kind: "not-a-document" };
  if (prerendered.includes(first.body)) {
    return { kind: "violation", reason: "the body is a prerendered file" };
  }
  if (first.nonce === undefined) {
    return pathIsSkippedByTheProxy(path)
      ? { kind: "no-policy-exemption" }
      : { kind: "violation", reason: "a document with scripts and no policy" };
  }
  const unnonced = scripts.filter(
    (tag) => NONCE_ATTRIBUTE.exec(tag)?.[1] !== first.nonce,
  );
  if (unnonced.length > 0) {
    return {
      kind: "violation",
      reason: `${String(unnonced.length)} script(s) without the response's nonce`,
    };
  }
  if (second.nonce === first.nonce) {
    return { kind: "violation", reason: "two loads carry one nonce" };
  }
  return { kind: "nonced-document" };
}

/** What `proxy.ts`'s matcher leaves alone: a last segment with an extension, and everything under `/_next/`. */
function pathIsSkippedByTheProxy(path: string): boolean {
  const pathname = path.split("?")[0] ?? "";
  const last = pathname.split("/").at(-1) ?? "";
  return pathname.startsWith("/_next/") || HAS_EXTENSION.test(last);
}

function scriptsOf(html: string): string[] {
  return html.match(SCRIPT_TAG) ?? [];
}

function prerenderedFiles(): string[] {
  return readdirSync(PRERENDERED_DIRECTORY)
    .filter((name) => name.endsWith(".html"))
    .map((name) => readFileSync(join(PRERENDERED_DIRECTORY, name), "utf8"));
}
