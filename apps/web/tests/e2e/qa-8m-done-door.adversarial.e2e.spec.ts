// Wave 8M criteria 9 and 10 over real HTTP: the confirmation's address is the fourth door to a design. A request with no
// cookie, a malformed one, another visitor's, an id nothing matches and every segment that is not a design id's shape is
// given by `/done` the very answer the review and the contact page give it: the status, the headers but the two that name
// the address, and the load-error page. The owner's own request is the contrast, so that "alike" is not "all refused".
// The second half is the production build's (`CI=1`): `/done` is in no prerender manifest, and three loads carry three
// nonces, each the one in that response's own policy header, with the not-found page as the manifest's positive control.
// Nothing here sends a contact request; the designs a test mints are removed by it.
import {
  expect,
  request as playwrightRequest,
  test as plain,
  type APIRequestContext,
  type APIResponse,
  type Browser,
} from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  nonceOfPolicy,
  policyOf,
  POLICY_HEADER,
} from "./support/csp-violations";
import { deleteMintedDesigns } from "./support/minted-designs";
import { mintSeededDesign, type Locale } from "./support/seeded-design";

const VISITOR_COOKIE = "__Host-lemnaria_visitor";
const WELL_FORMED_UNKNOWN_ID = "A".repeat(21);
const LOCALES: readonly Locale[] = ["ro", "ru"];
const SCRIPT_TAG = /<script\b[^>]*>/g;
const NONCE_ATTRIBUTE = /\snonce="([^"]*)"/;
const BUILD_DIRECTORY = join(process.cwd(), ".next");

const RUN_UNDER_CI =
  "It reads the production build the first server makes under CI. Run it with: " +
  "CI=1 pnpm exec playwright test tests/e2e/qa-8m-done-door.adversarial.e2e.spec.ts --project=mobile";

const BROKEN_ESCAPE = "%E0%A4%A";

/** Segments that are not the generator's shape: too short, too long, the wrong alphabet, a static extension, an escape. */
const MALFORMED_SEGMENTS: readonly string[] = [
  "not-an-id",
  "x".repeat(20),
  "x".repeat(22),
  "abc.png",
  "..%2F..%2Fapi",
  "a%20b",
  "e2e-readiness-probe-but-longer-than-21",
  BROKEN_ESCAPE,
];

interface Answer {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

async function ask(
  baseURL: string,
  path: string,
  cookies: Readonly<Record<string, string>>,
): Promise<Answer> {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  const context: APIRequestContext = await playwrightRequest.newContext({
    baseURL,
    extraHTTPHeaders: cookie === "" ? {} : { cookie },
  });
  try {
    const response = await context.get(path, { maxRedirects: 0 });
    return {
      status: response.status(),
      headers: response.headers(),
      body: await response.text(),
    };
  } finally {
    await context.dispose();
  }
}

function withoutPerRequestValues(text: string): string {
  return text
    .replace(/nonce=\\?"[^"\\]*\\?"/g, "nonce=N")
    .replace(/'nonce-[^']*'/g, "'nonce-N'")
    .replace(/\\?"nonce\\?":\\?"[^"\\]*\\?"/g, "nonce:N")
    .replace(/__next_r=\\?"[^"\\]*\\?"/g, "__next_r=R");
}

/** What a door answered, with the address asked for and everything drawn fresh per request taken out. */
function comparable(answer: Answer, segment: string): unknown {
  const headers = Object.fromEntries(
    Object.entries(answer.headers)
      .filter(([name]) => !["date", "link", "content-length"].includes(name))
      .map(([name, value]) => [
        name,
        withoutPerRequestValues(value).replaceAll(segment, "ID"),
      ]),
  );
  return {
    status: answer.status,
    headers,
    page: refusalPageOf(answer.body)?.replaceAll(segment, "ID"),
  };
}

function refusalPageOf(body: string): string | undefined {
  const page = /<main[^>]*data-testid="design-load-error"[\s\S]*?<\/main>/.exec(
    body,
  );
  return page === null ? undefined : withoutPerRequestValues(page[0]);
}

interface Visitors {
  readonly baseURL: string;
  readonly ownedId: string;
  readonly owner: Readonly<Record<string, string>>;
  readonly foreign: Readonly<Record<string, string>>;
  readonly cleanUp: () => Promise<void>;
}

async function mintTwoVisitors(
  browser: Browser,
  baseURL: string,
): Promise<Visitors> {
  const ownerContext = await browser.newContext();
  const foreignContext = await browser.newContext();
  const owned = await mintSeededDesign(await ownerContext.newPage());
  const foreignOwn = await mintSeededDesign(await foreignContext.newPage());
  const visitorOf = async (
    context: typeof ownerContext,
  ): Promise<Record<string, string>> => {
    const cookie = (await context.cookies()).find(
      ({ name }) => name === VISITOR_COOKIE,
    );
    if (cookie === undefined) throw new Error("the mint set no visitor cookie");
    return { [VISITOR_COOKIE]: cookie.value };
  };
  return {
    baseURL,
    ownedId: owned.id,
    owner: await visitorOf(ownerContext),
    foreign: await visitorOf(foreignContext),
    cleanUp: async () => {
      await ownerContext.close();
      await foreignContext.close();
      await deleteMintedDesigns([owned.id, foreignOwn.id]);
    },
  };
}

function baseUrlOf(baseURL: string | undefined): string {
  if (baseURL === undefined) throw new Error("the project sets no baseURL");
  return baseURL;
}

const DOORS_TO_COMPARE = ["review", "contact"] as const;

plain.describe("four doors, one answer", () => {
  for (const locale of LOCALES) {
    plain(
      `${locale}: no cookie, a malformed cookie, another visitor's, an unknown id and every segment that is no id's shape are refused by /done exactly as by the review and the contact page; the owner is let in`,
      async ({ browser, baseURL }) => {
        const visitors = await mintTwoVisitors(browser, baseUrlOf(baseURL));
        try {
          const refusals: readonly (readonly [
            string,
            string,
            Readonly<Record<string, string>>,
          ])[] = [
            ["no cookie", visitors.ownedId, {}],
            [
              "a malformed cookie",
              visitors.ownedId,
              { [VISITOR_COOKIE]: "not-a-visitor" },
            ],
            ["another visitor's cookie", visitors.ownedId, visitors.foreign],
            ["an id nothing matches", WELL_FORMED_UNKNOWN_ID, visitors.foreign],
            ...MALFORMED_SEGMENTS.map(
              (segment) =>
                [`the segment ${segment}`, segment, visitors.foreign] as const,
            ),
          ];
          for (const [name, segment, cookies] of refusals) {
            const done = await ask(
              visitors.baseURL,
              `/${locale}/d/${segment}/done`,
              cookies,
            );
            // A broken percent-escape answers 500 on every door and on routes this wave did not change (8L's note in
            // `qa-8l-contact-doors`); it is held to being alike, not to a page.
            if (segment !== BROKEN_ESCAPE) {
              expect(
                done.body,
                `${name}: /done draws the refusal page`,
              ).toContain('data-testid="design-load-error"');
            }
            for (const door of DOORS_TO_COMPARE) {
              const other = await ask(
                visitors.baseURL,
                `/${locale}/d/${segment}/${door}`,
                cookies,
              );
              expect(
                comparable(done, segment),
                `${name}: /done against /${door}`,
              ).toEqual(comparable(other, segment));
            }
          }

          const owner = await ask(
            visitors.baseURL,
            `/${locale}/d/${visitors.ownedId}/done`,
            visitors.owner,
          );
          expect(owner.status).toBe(200);
          expect(owner.body).not.toContain('data-testid="design-load-error"');
          // The owner's confirmation for a design nothing was sent for carries no reference and no claim in its markup:
          // neither the reference card nor, since wave 8V, the design-link card that took its place on 5A.
          expect(owner.body).not.toContain('data-testid="done-reference"');
          expect(owner.body).not.toContain(
            'data-testid="done-design-link-card"',
          );
        } finally {
          await visitors.cleanUp();
        }
      },
    );
  }

  plain(
    "the address with a step the confirmation does not have is no page, for the owner too",
    async ({ browser, baseURL }) => {
      const visitors = await mintTwoVisitors(browser, baseUrlOf(baseURL));
      try {
        for (const path of [
          `/ro/d/${visitors.ownedId}/done/extra`,
          `/ro/d/${visitors.ownedId}/done.json`,
          `/ro/d/${visitors.ownedId}/Done`,
          `/ro/d/${visitors.ownedId}/done;x`,
          `/ro/d/${visitors.ownedId}/done%2Fextra`,
        ]) {
          for (const cookies of [visitors.owner, {}]) {
            const answer = await ask(visitors.baseURL, path, cookies);
            expect(answer.status, path).toBe(404);
            expect(answer.body, path).not.toContain(
              'data-testid="done-heading"',
            );
          }
        }
      } finally {
        await visitors.cleanUp();
      }
    },
  );
});

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
  const nonce = nonceOfPolicy(policyOf(response));
  if (nonce === undefined) {
    throw new Error(`the response carries no nonce in its ${POLICY_HEADER}`);
  }
  return nonce;
}

function noncesOnScripts(html: string): string[] {
  return (html.match(SCRIPT_TAG) ?? []).flatMap((tag) => {
    const nonce = NONCE_ATTRIBUTE.exec(tag)?.[1];
    return nonce === undefined ? [] : [nonce];
  });
}

plain.describe("the production build", () => {
  plain.skip(process.env.CI === undefined, RUN_UNDER_CI);

  plain(
    "the manifest lists /done in no language, as a route or a dynamic route, and wrote no HTML for it",
    () => {
      const manifest = readPrerenderManifest();
      const listed = [
        ...Object.keys(manifest.routes),
        ...Object.keys(manifest.dynamicRoutes),
      ];

      expect(listed.length, "the manifest is not empty").toBeGreaterThan(0);
      expect(
        listed.filter((route) => /\/done(\/|$)/.test(route)),
        "done routes in the manifest",
      ).toEqual([]);
      for (const prerendered of [
        "server/app/ro/d/[id]/done.html",
        "server/app/ru/d/[id]/done.html",
        "server/app/[locale]/d/[id]/done.html",
      ]) {
        expect(
          existsSync(join(BUILD_DIRECTORY, prerendered)),
          prerendered,
        ).toBe(false);
      }
      // The page's server bundle exists, so the absence above is not a route that was never built.
      expect(
        existsSync(
          join(BUILD_DIRECTORY, "server/app/[locale]/d/[id]/done/page.js"),
        ),
        "the page was built",
      ).toBe(true);
    },
  );

  plain(
    "positive control: the same manifest does list a prerendered page, so an empty answer above is not an empty file",
    () => {
      const manifest = readPrerenderManifest();

      expect(
        [
          ...Object.keys(manifest.routes),
          ...Object.keys(manifest.dynamicRoutes),
        ].some((route) => route.includes("not-found")),
      ).toBe(true);
    },
  );

  for (const locale of LOCALES) {
    plain(
      `${locale}: three loads of the owner's /done carry three nonces, each the one in its own response's policy and on every script that has one`,
      async ({ browser, baseURL }) => {
        const visitors = await mintTwoVisitors(browser, baseUrlOf(baseURL));
        try {
          const cookie = `${VISITOR_COOKIE}=${visitors.owner[VISITOR_COOKIE] ?? ""}`;
          const context = await playwrightRequest.newContext({
            baseURL: visitors.baseURL,
            extraHTTPHeaders: { cookie },
          });
          const seen = new Set<string>();
          try {
            for (let load = 0; load < 3; load += 1) {
              const response = await context.get(
                `/${locale}/d/${visitors.ownedId}/done`,
              );
              expect(response.status()).toBe(200);
              const nonce = nonceOfThePolicy(response);
              const html = await response.text();
              const onScripts = noncesOnScripts(html);
              expect(
                onScripts.length,
                "scripts carrying a nonce",
              ).toBeGreaterThan(0);
              expect(new Set(onScripts)).toEqual(new Set([nonce]));
              expect(
                (html.match(SCRIPT_TAG) ?? []).filter(
                  (tag) => !NONCE_ATTRIBUTE.test(tag),
                ),
                "scripts with no nonce",
              ).toEqual([]);
              seen.add(nonce);
            }
          } finally {
            await context.dispose();
          }
          expect(seen.size, "three loads, three nonces").toBe(3);
        } finally {
          await visitors.cleanUp();
        }
      },
    );
  }

  plain(
    "a refused /done is rendered per request as well: two loads, two nonces, each its own response's",
    async ({ baseURL }) => {
      const context = await playwrightRequest.newContext({
        baseURL: baseUrlOf(baseURL),
      });
      try {
        const seen = new Set<string>();
        for (let load = 0; load < 2; load += 1) {
          const response = await context.get(
            `/ro/d/${WELL_FORMED_UNKNOWN_ID}/done`,
          );
          const nonce = nonceOfThePolicy(response);
          expect(new Set(noncesOnScripts(await response.text()))).toEqual(
            new Set([nonce]),
          );
          seen.add(nonce);
        }
        expect(seen.size).toBe(2);
      } finally {
        await context.dispose();
      }
    },
  );
});
