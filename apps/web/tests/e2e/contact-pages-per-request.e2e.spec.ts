// Wave 8L criterion 9: the two contact pages are rendered for each request. THIS FILE HOLDS ONLY ON THE PRODUCTION
// BUILD (`CI=1`: `next build` and `next start`): the manifest it reads is a build's, and under `next dev` every page is
// rendered per request whatever it says (ADR 0158 *Limits*, backlog 182). Its evidence is a `CI=1` run, never
// `pnpm ci:local`, whose e2e step runs `next dev` until Q42 is answered.
//
// Neither page is in `.next/prerender-manifest.json`; two loads of each carry two nonces, every nonce on a script is the
// one in that response's own policy header, and the comment above the policy switch no longer says the contact pages
// are prerendered.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type APIResponse } from "@playwright/test";

import {
  callbackPath,
  contactDocumentPath,
  expectFormDrawn,
} from "./support/contact-page";
import { test as seededTest } from "./support/seeded-design";

const RUN_UNDER_CI =
  "It reads the production build the first server makes under CI. Run it with: " +
  "CI=1 pnpm exec playwright test tests/e2e/contact-pages-per-request.e2e.spec.ts --project=mobile";

const BUILD_DIRECTORY = join(process.cwd(), ".next");
const CSP_HEADER = "content-security-policy-report-only";
const NONCE_IN_POLICY = /'nonce-([^']+)'/;
const SCRIPT_TAG = /<script\b[^>]*>/g;
const NONCE_ATTRIBUTE = /\snonce="([^"]*)"/;
const SECURITY_HEADERS_SOURCE = join(
  process.cwd(),
  "src/lib/security-headers.ts",
);

interface PrerenderManifest {
  readonly routes: Readonly<Record<string, unknown>>;
  readonly dynamicRoutes: Readonly<Record<string, unknown>>;
}

function readPrerenderManifest(): PrerenderManifest {
  return JSON.parse(
    readFileSync(join(BUILD_DIRECTORY, "prerender-manifest.json"), "utf8"),
  ) as PrerenderManifest;
}

function nonceOfThePolicy(response: APIResponse): string {
  const policy = response.headers()[CSP_HEADER];
  const nonce = NONCE_IN_POLICY.exec(policy ?? "")?.[1];
  if (nonce === undefined) {
    throw new Error(`the response carries no nonce in its ${CSP_HEADER}`);
  }
  return nonce;
}

function noncesOnScripts(html: string): string[] {
  return (html.match(SCRIPT_TAG) ?? []).flatMap((tag) => {
    const nonce = NONCE_ATTRIBUTE.exec(tag)?.[1];
    return nonce === undefined ? [] : [nonce];
  });
}

function scriptsWithoutANonce(html: string): string[] {
  return (html.match(SCRIPT_TAG) ?? []).filter(
    (tag) => !NONCE_ATTRIBUTE.test(tag),
  );
}

test.describe("a build's manifest", () => {
  test.skip(process.env.CI === undefined, RUN_UNDER_CI);

  test("lists neither contact page, in any locale, as a route or a dynamic route, and wrote no HTML for either", () => {
    const manifest = readPrerenderManifest();
    const listed = [
      ...Object.keys(manifest.routes),
      ...Object.keys(manifest.dynamicRoutes),
    ];

    expect(listed.length, "the manifest is not empty").toBeGreaterThan(0);
    expect(
      listed.filter((route) => /\/contact(\/|$)/.test(route)),
      "contact routes in the manifest",
    ).toEqual([]);
    for (const prerendered of [
      "server/app/ro/configurator/contact.html",
      "server/app/ru/configurator/contact.html",
      "server/app/[locale]/configurator/contact.html",
      "server/app/ro/d/[id]/contact.html",
    ]) {
      expect(existsSync(join(BUILD_DIRECTORY, prerendered)), prerendered).toBe(
        false,
      );
    }
  });

  test("shows the manifest does list a prerendered page, so an empty answer above is not an empty file", () => {
    const manifest = readPrerenderManifest();

    expect(
      [
        ...Object.keys(manifest.routes),
        ...Object.keys(manifest.dynamicRoutes),
      ].some((route) => route.includes("not-found")),
    ).toBe(true);
  });
});

test.describe("the callback form's two loads", () => {
  test.skip(process.env.CI === undefined, RUN_UNDER_CI);

  for (const locale of ["ro", "ru"] as const) {
    test(`${locale}: two loads carry two nonces, each the one in its own response's policy, on every script that has one`, async ({
      request,
    }) => {
      const loads = await Promise.all(
        [1, 2, 3].map(() => request.get(callbackPath(locale))),
      );
      const seen = new Set<string>();

      for (const load of loads) {
        expect(load.status()).toBe(200);
        const nonce = nonceOfThePolicy(load);
        const html = await load.text();
        const onScripts = noncesOnScripts(html);
        expect(onScripts.length, "scripts carrying a nonce").toBeGreaterThan(0);
        expect(new Set(onScripts)).toEqual(new Set([nonce]));
        expect(scriptsWithoutANonce(html)).toEqual([]);
        seen.add(nonce);
      }

      expect(seen.size).toBe(loads.length);
    });
  }
});

seededTest.describe("the design's contact page's two loads", () => {
  seededTest.skip(process.env.CI === undefined, RUN_UNDER_CI);

  seededTest(
    "two loads carry two nonces, each the one in its own response's policy, on every script that has one",
    async ({ page, context, seededDesign }) => {
      const path = contactDocumentPath("ro", seededDesign.id);
      const first = await context.request.get(path);
      const second = await context.request.get(path);
      const seen = new Set<string>();

      for (const load of [first, second]) {
        expect(load.status()).toBe(200);
        const nonce = nonceOfThePolicy(load);
        const html = await load.text();
        const onScripts = noncesOnScripts(html);
        expect(onScripts.length, "scripts carrying a nonce").toBeGreaterThan(0);
        expect(new Set(onScripts)).toEqual(new Set([nonce]));
        expect(scriptsWithoutANonce(html)).toEqual([]);
        seen.add(nonce);
      }

      expect(seen.size).toBe(2);
      // And the page a browser makes of it is the contact page, not a prerendered shell that a nonce never reached.
      await page.goto(path);
      await expectFormDrawn(page);
    },
  );
});

test("the comment above the policy switch no longer names the contact pages as prerendered", () => {
  const source = readFileSync(SECURITY_HEADERS_SOURCE, "utf8");
  const aboveTheSwitch = source.slice(
    source.indexOf("The single switch"),
    source.indexOf("export const CONTENT_SECURITY_POLICY_MODE"),
  );

  expect(aboveTheSwitch.length).toBeGreaterThan(0);
  expect(aboveTheSwitch).not.toMatch(/contact/i);
  expect(aboveTheSwitch).toContain("prerender-manifest.json");
});
