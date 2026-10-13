// Wave 8Q criterion 1: no address a browser can be sent is answered by a prerendered document, whose scripts carry no
// CSP nonce. THIS FILE HOLDS ONLY ON THE PRODUCTION BUILD (`CI=1`: `next build` and `next start`): the manifest it reads
// is a build's, and under `next dev` every page is rendered per request whatever it says (ADR 0158 *Limits*,
// backlog 182). Its evidence is a `CI=1` run, never `pnpm ci:local`, whose e2e step runs `next dev` until Q42 is
// answered.
//
// It spends no write: every request is a GET, a HEAD, or a method that no route accepts, and none reaches a store.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type APIRequestContext } from "@playwright/test";

import { SCENE_SHOT_ROUTE_FLAG } from "../../src/app/internal/scene-shot/route-availability";
import {
  CONTENT_SECURITY_POLICY_MODE,
  cspResponseHeaderName,
} from "../../src/lib/security-headers";

import {
  startProductionPolicyServer,
  UNMATCHED_ADDRESSES_SERVER_PORT,
  type ProductionPolicyServer,
} from "./support/production-policy-server";

const RUN_UNDER_CI =
  "It reads the production build the first server makes under CI. Run it with: " +
  "CI=1 pnpm exec playwright test tests/e2e/unmatched-addresses.e2e.spec.ts --project=mobile";

const SERVER_START_TIMEOUT_MS = 300_000;
const BUILD_DIRECTORY = join(process.cwd(), ".next");
const PRERENDERED_DIRECTORY = join(BUILD_DIRECTORY, "server", "app");
const POLICY_HEADER = cspResponseHeaderName(
  CONTENT_SECURITY_POLICY_MODE,
).toLowerCase();
const NONCE_IN_POLICY = /'nonce-([^']+)'/;
const SCRIPT_TAG = /<script\b[^>]*>/g;
const NONCE_ATTRIBUTE = /\snonce="([^"]*)"/;
const LONG_SEGMENT_LENGTH = 9000;

interface Address {
  readonly path: string;
  readonly method?: string;
}

interface Answer {
  readonly status: number;
  readonly contentType: string;
  readonly body: string;
  readonly policyNonce: string | undefined;
  readonly headers: Readonly<Record<string, string>>;
}

/** What Next answers for an address no route owns: its own text, rendered for the request, with the request's nonce. */
const PER_REQUEST_404_DOCUMENTS: readonly Address[] = [
  { path: "/ro/zz" },
  { path: "/ru/zz" },
  { path: "/ro/d/x/zz" },
  { path: "/ro/configurator/zz" },
  { path: "/ro/configurator/room/extra" },
  { path: `/ro/${"a".repeat(LONG_SEGMENT_LENGTH)}` },
  { path: "/ro/_not-found" },
  { path: "/ro/_global-error" },
  { path: "/ro/zz", method: "POST" },
  { path: "/xx/configurator/room" },
  // The two names Next builds a document for, typed as addresses (8Q.12): rewritten to the catch-all.
  { path: "/_not-found" },
  { path: "/_global-error" },
  { path: "/_not-found?x=1" },
  { path: "/_not-found", method: "POST" },
  { path: "/_not-found/x" },
  { path: "/_global-error/x" },
];

/** Answered with no body at all, so there is no script to carry a nonce. */
const EMPTY_404_ANSWERS: readonly Address[] = [
  { path: "/zz" },
  { path: "/RO/configurator/room" },
  ...["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"].map(
    (method) => ({ path: "/api/zz", method }),
  ),
  { path: "/api/zz/y" },
  { path: "/api/designs/x/share/extra" },
  { path: "/api/cron/zz" },
  { path: "/api" },
  { path: "/internal/zz" },
  { path: "/internal/zz", method: "POST" },
  { path: "/internal/zz/y" },
  { path: "/internal" },
  { path: "/internal/scene-shot/extra" },
];

/**
 * The matcher of `src/proxy.ts` skips an address ending in a static extension, and `_next/static`, so these get no
 * policy at all: a document with no policy has nothing to enforce, and the flip changes nothing for it. Recorded here
 * as a measurement and not fixed in 8Q, whose scope excludes the proxy (8Q.4's last row).
 */
const EXTENSION_ADDRESSES: readonly Address[] = [
  { path: "/ro/zz.png" },
  { path: "/ro/configurator/zz.svg" },
  { path: "/_next/static/zz.js" },
];

/** Not documents of any kind: a malformed percent-escape fails in the framework's own decoding, before a route. */
const MALFORMED_ADDRESSES: readonly Address[] = [
  { path: "/%" },
  { path: "/ro/%" },
  { path: "/ro/%E0%A4%A" },
  { path: "/ro/d/%E0%A4%A" },
];

/** A named route is not shadowed: it keeps its own answer, a method it does not export its own `405`. */
const NAMED_ROUTES_KEEP_THEIR_ANSWER: readonly (Address & {
  readonly status: number;
})[] = [
  { path: "/api/designs", method: "PUT", status: 405 },
  { path: "/api/designs", method: "DELETE", status: 405 },
  { path: "/api/designs/x/share", method: "PUT", status: 405 },
  { path: "/api/contact-submissions", method: "GET", status: 405 },
  { path: "/api/cron/prune-rate-limits", method: "POST", status: 405 },
];

const REDIRECTS: readonly { path: string; location: string }[] = [
  { path: "/", location: "/ro" },
  { path: "/ro/configurator/room/", location: "/ro/configurator/room" },
  { path: "/ro//configurator//room", location: "/ro/configurator/room" },
  { path: "/_not-found/", location: "/_not-found" },
  { path: "/api/", location: "/api" },
];

test.describe("a build's manifest", () => {
  test.skip(process.env.CI === undefined, RUN_UNDER_CI);

  test("lists no dynamic route, and serves each route it does list as a nonced document, never its own file", async ({
    request,
  }) => {
    const manifest = JSON.parse(
      readFileSync(join(BUILD_DIRECTORY, "prerender-manifest.json"), "utf8"),
    ) as {
      routes: Record<string, unknown>;
      dynamicRoutes: Record<string, unknown>;
    };
    const listed = Object.keys(manifest.routes);

    expect(listed.length, "the manifest is not empty").toBeGreaterThan(0);
    expect(
      Object.keys(manifest.dynamicRoutes),
      "a dynamic route a browser could be sent without a nonce",
    ).toEqual([]);
    for (const route of listed) {
      const answer = await answerOf(request, { path: route });
      expect(answer.body, `${route} is not its prerendered file`).not.toBe(
        prerenderedFileOf(route),
      );
      expectEveryScriptNoncedByItsOwnResponse(answer, route);
    }
  });

  test("the directory it reads holds the prerendered files the comparison below needs", () => {
    expect(
      prerenderedFiles().length,
      "prerendered documents under .next/server/app",
    ).toBeGreaterThan(0);
  });
});

test.describe("an address no route answers", () => {
  test.skip(process.env.CI === undefined, RUN_UNDER_CI);

  for (const address of PER_REQUEST_404_DOCUMENTS) {
    test(`${labelOf(address)}: a 404 rendered for the request, every script carrying that response's nonce, a new nonce on each load`, async ({
      request,
    }) => {
      const loads = [
        await answerOf(request, address),
        await answerOf(request, address),
      ];

      for (const load of loads) {
        expect(load.status).toBe(404);
        expect(load.contentType).toContain("text/html");
        expect(
          prerenderedFiles(),
          "a prerendered file served as it is",
        ).not.toContain(load.body);
        expect(
          scriptsOf(load.body).length,
          "scripts, so the check below is not vacuous",
        ).toBeGreaterThan(0);
        expectEveryScriptNoncedByItsOwnResponse(load, labelOf(address));
      }
      expect(loads[0]?.policyNonce).not.toBe(loads[1]?.policyNonce);
    });
  }

  for (const address of EMPTY_404_ANSWERS) {
    test(`${labelOf(address)}: an empty 404, no document`, async ({
      request,
    }) => {
      const answer = await answerOf(request, address);

      expect(answer.status).toBe(404);
      expect(answer.body).toBe("");
      expect(answer.contentType).not.toContain("text/html");
    });
  }

  for (const address of MALFORMED_ADDRESSES) {
    test(`${labelOf(address)}: no HTML document, whatever the status`, async ({
      request,
    }) => {
      const answer = await answerOf(request, address);

      expect(answer.status).toBeGreaterThanOrEqual(400);
      expect(answer.contentType).not.toContain("text/html");
      expect(scriptsOf(answer.body)).toEqual([]);
    });
  }

  test("the api catch-all's answer is never cached", async ({ request }) => {
    const answer = await answerOf(request, { path: "/api/zz" });

    expect(answer.headers["cache-control"]).toBe("no-store");
  });
});

test.describe("an address ending in an extension the proxy skips (a recorded measurement, not a fix)", () => {
  test.skip(process.env.CI === undefined, RUN_UNDER_CI);

  for (const address of EXTENSION_ADDRESSES) {
    test(`${labelOf(address)}: a 404 rendered for the request, and no policy to enforce, or a policy its scripts follow`, async ({
      request,
    }) => {
      const answer = await answerOf(request, address);

      expect(answer.status).toBe(404);
      expect(answer.body, "the prerendered file").not.toBe(
        prerenderedFileOf("/_not-found"),
      );
      if (answer.policyNonce === undefined) {
        test.info().annotations.push({
          type: "no-policy",
          description: `${labelOf(address)} is a document with no ${POLICY_HEADER} header: the matcher in proxy.ts skips it`,
        });
        expect(answer.headers[POLICY_HEADER]).toBeUndefined();
      } else {
        expectEveryScriptNoncedByItsOwnResponse(answer, labelOf(address));
      }
    });
  }
});

test.describe("a named route beside the catch-alls", () => {
  test.skip(process.env.CI === undefined, RUN_UNDER_CI);

  for (const route of NAMED_ROUTES_KEEP_THEIR_ANSWER) {
    test(`${labelOf(route)}: still ${String(route.status)}, not the catch-all's 404`, async ({
      request,
    }) => {
      const answer = await answerOf(request, route);

      expect(answer.status).toBe(route.status);
    });
  }

  test("/internal/scene-shot, with its flag on, is still the page", async ({
    request,
  }) => {
    const answer = await answerOf(request, { path: "/internal/scene-shot" });

    expect(answer.status).toBe(200);
    expectEveryScriptNoncedByItsOwnResponse(answer, "/internal/scene-shot");
  });

  for (const { path, location } of REDIRECTS) {
    test(`${path}: still a redirect to ${location}`, async ({ request }) => {
      const answer = await answerOf(request, { path });

      expect([307, 308]).toContain(answer.status);
      expect(new URL(answer.headers.location ?? "", "http://x").pathname).toBe(
        location,
      );
    });
  }
});

test.describe("the capture pages on a server whose flag is off", () => {
  test.skip(process.env.CI === undefined, RUN_UNDER_CI);

  let server: ProductionPolicyServer | undefined;

  test.beforeAll(async () => {
    test.setTimeout(SERVER_START_TIMEOUT_MS);
    expect(
      process.env[SCENE_SHOT_ROUTE_FLAG],
      "the runner's environment, which the second server inherits",
    ).toBeUndefined();
    server = await startProductionPolicyServer(UNMATCHED_ADDRESSES_SERVER_PORT);
  });

  test.afterAll(async () => {
    await server?.stop();
  });

  for (const path of ["/internal/scene-shot", "/internal/mirror-shot"]) {
    test(`${path}: a 404 rendered for the request, every script carrying that response's nonce`, async ({
      playwright,
    }) => {
      if (server === undefined) throw new Error("the second server is not up");
      const context = await playwright.request.newContext({
        baseURL: server.origin,
      });
      try {
        const loads = [
          await answerOf(context, { path }),
          await answerOf(context, { path }),
        ];

        for (const load of loads) {
          expect(load.status).toBe(404);
          expect(prerenderedFiles()).not.toContain(load.body);
          expect(scriptsOf(load.body).length).toBeGreaterThan(0);
          expectEveryScriptNoncedByItsOwnResponse(load, path);
        }
        expect(loads[0]?.policyNonce).not.toBe(loads[1]?.policyNonce);
      } finally {
        await context.dispose();
      }
    });
  }
});

function labelOf({ path, method }: Address): string {
  const shown = path.length > 40 ? `${path.slice(0, 40)}...` : path;
  return `${method ?? "GET"} ${shown}`;
}

async function answerOf(
  request: APIRequestContext,
  { path, method = "GET" }: Address,
): Promise<Answer> {
  const response = await request.fetch(path, {
    method,
    maxRedirects: 0,
    failOnStatusCode: false,
    headers: { accept: "text/html" },
  });
  const headers = response.headers();
  return {
    status: response.status(),
    contentType: headers["content-type"] ?? "",
    body: method === "HEAD" ? "" : await response.text(),
    policyNonce: NONCE_IN_POLICY.exec(headers[POLICY_HEADER] ?? "")?.[1],
    headers,
  };
}

function expectEveryScriptNoncedByItsOwnResponse(
  answer: Answer,
  address: string,
): void {
  const scripts = scriptsOf(answer.body);
  if (scripts.length === 0) return;
  expect(
    answer.policyNonce,
    `${address} has scripts and its response carries no nonce in its ${POLICY_HEADER}`,
  ).toBeDefined();
  expect(
    scripts.filter(
      (tag) => NONCE_ATTRIBUTE.exec(tag)?.[1] !== answer.policyNonce,
    ),
    `${address}: scripts that do not carry the response's own nonce`,
  ).toEqual([]);
}

function scriptsOf(html: string): string[] {
  return html.match(SCRIPT_TAG) ?? [];
}

function prerenderedFiles(): string[] {
  return readdirSync(PRERENDERED_DIRECTORY)
    .filter((name) => name.endsWith(".html"))
    .map((name) => readFileSync(join(PRERENDERED_DIRECTORY, name), "utf8"));
}

function prerenderedFileOf(route: string): string {
  const file = join(PRERENDERED_DIRECTORY, `${route}.html`);
  if (!existsSync(file)) {
    throw new Error(`the build holds no prerendered file for ${route}`);
  }
  return readFileSync(file, "utf8");
}
