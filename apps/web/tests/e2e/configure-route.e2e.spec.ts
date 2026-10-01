import {
  expect,
  test,
  type APIResponse,
  type Response,
} from "@playwright/test";

import { deleteMintedDesigns } from "./support/minted-designs";
import { mintSeededDesign } from "./support/seeded-design";

/**
 * M7 wave 7E3a S3 — criterion 4's resume matrix, over both entry routes and both locales.
 *
 * Split out of `locale-routing.qa` back in wave 7E4 D3 while `/{locale}/configurator/configure`
 * still answered 200 with the editor; since 7E3a it is the second resume entry point (ADR 0114
 * decision 4, Amendment F), and this file is **the one place that gate still allows the route
 * string** (`git grep -rln '"/configurator/configure"' apps/web/tests/e2e` names only this file).
 *
 * The five-row matrix (§6 criterion 4):
 *
 * | Cookie state | Answer |
 * | --- | --- |
 * | None | 307 to room, no `Set-Cookie`, the repository is never called |
 * | Matches | 307 to the resumed design |
 * | Well-formed, matching nothing | 307 to room, plus the clear |
 * | Malformed | 307 to room, plus the clear |
 * | Lookup throws | covered in Vitest (`home-navigation.test.ts`) — not reproducible live |
 *
 * "The repository is never called" and the throwing branch are unit-tested with a double; a real
 * browser cannot force either. What only a live server proves is here: the real cookie, the real
 * hash, the real index-backed lookup, and — since neither route may ever answer 200 — that.
 */

const CSP_HEADER = "content-security-policy-report-only";
const VISITOR_COOKIE_NAME = "__Host-lemnaria_visitor";
const WELL_FORMED_UNKNOWN_VALUE = "z".repeat(43);
const MALFORMED_VALUE = "too-short-and-not-base64url";

/** Both resume entry points, as the path suffix appended to `/{locale}`. */
const ENTRY_ROUTES = ["", "/configurator/configure"] as const;
const LOCALES = ["ro", "ru"] as const;

for (const locale of LOCALES) {
  for (const routeSuffix of ENTRY_ROUTES) {
    const path = `/${locale}${routeSuffix}`;

    test(`${path}: no cookie resumes to room, sets nothing`, async ({
      request,
    }) => {
      const response = await request.get(path, { maxRedirects: 0 });

      expect(response.status(), path).toBe(307);
      expect(response.headers().location).toBe(`/${locale}/configurator/room`);
      // Not `toBeUndefined()`: next-intl's own `NEXT_LOCALE` cookie legitimately rides along on
      // this response (`routing.ts`'s `localeCookie`), unrelated to visitor identity. What D1
      // promises is that *this route* sets none of the visitor cookie — checked by name.
      expect(response.headers()["set-cookie"] ?? "").not.toContain(
        VISITOR_COOKIE_NAME,
      );
      assertResumeHeaders(response);
      assertCsp(response);
    });

    test(`${path}: a malformed cookie resumes to room and is cleared`, async ({
      request,
    }) => {
      const response = await request.get(path, {
        maxRedirects: 0,
        headers: { cookie: `${VISITOR_COOKIE_NAME}=${MALFORMED_VALUE}` },
      });

      expect(response.status(), path).toBe(307);
      expect(response.headers().location).toBe(`/${locale}/configurator/room`);
      assertCleared(response);
    });

    test(`${path}: a well-formed cookie matching nothing resumes to room and is cleared`, async ({
      request,
    }) => {
      const response = await request.get(path, {
        maxRedirects: 0,
        headers: {
          cookie: `${VISITOR_COOKIE_NAME}=${WELL_FORMED_UNKNOWN_VALUE}`,
        },
      });

      expect(response.status(), path).toBe(307);
      expect(response.headers().location).toBe(`/${locale}/configurator/room`);
      assertCleared(response);
    });

    test(`${path}: a matching cookie resumes to the design, minted in the same browser`, async ({
      page,
      context,
    }) => {
      const design = await mintSeededDesign(page, locale);
      try {
        const navigation = await page.goto(path);
        if (navigation === null)
          throw new Error("Navigation returned no response");

        expect(new URL(page.url()).pathname).toBe(`/${locale}/d/${design.id}`);
        expect(
          (await context.cookies()).some(
            (cookie) => cookie.name === VISITOR_COOKIE_NAME,
          ),
        ).toBe(true);

        // The found branch's own 307, not only the page it lands on (L1.4, review round 1): a
        // redirect that dropped CSP for one step would still leave the final document policy-
        // covered, so this has to be read off the intermediate response.
        const redirectedFrom = navigation.request().redirectedFrom();
        if (redirectedFrom === null) {
          throw new Error(`Expected ${path} to have redirected at least once`);
        }
        const redirectResponse = await redirectedFrom.response();
        if (redirectResponse === null) {
          throw new Error("Expected the redirect's own response");
        }
        expect(redirectResponse.status()).toBe(307);
        assertCsp(redirectResponse);
      } finally {
        await deleteMintedDesigns([design.id]);
      }
    });
  }
}

// L1.4 (review round 1): the unprefixed paths take **two** hops — next-intl's own locale redirect,
// then this route's resume redirect — and CSP has to survive both, not only the one the existing
// per-locale tests above already cover. `ru` needs `NEXT_LOCALE` because it is not the fallback
// locale `locale-routing.qa`'s own cases negotiate the same way.
for (const [locale, negotiationHeaders] of [
  ["ro", { cookie: "NEXT_LOCALE=ro" }],
  ["ru", { cookie: "NEXT_LOCALE=ru" }],
] as const) {
  for (const routeSuffix of ENTRY_ROUTES) {
    const unprefixedPath = routeSuffix === "" ? "/" : routeSuffix;

    test(`unprefixed ${unprefixedPath} negotiates ${locale} and resumes to room, CSP on both hops`, async ({
      request,
    }) => {
      const firstHop = await request.get(unprefixedPath, {
        headers: negotiationHeaders,
        maxRedirects: 0,
      });

      expect(firstHop.status(), unprefixedPath).toBe(307);
      assertCsp(firstHop);
      const firstLocation = firstHop.headers().location ?? "";
      expect(firstLocation).toBe(`/${locale}${routeSuffix}`);

      const secondHop = await request.get(firstLocation, {
        maxRedirects: 0,
      });

      expect(secondHop.status(), firstLocation).toBe(307);
      assertCsp(secondHop);
      expect(secondHop.headers().location).toBe(`/${locale}/configurator/room`);
    });
  }
}

test("resumes the most recently touched design, over both an earlier mint and an earlier save", async ({
  page,
}) => {
  const first = await mintSeededDesign(page, "ro");
  const second = await mintSeededDesign(page, "ro");
  try {
    // Minting again in the same browser rotates to a fresh value and moves the earlier design's
    // row to it (M7 wave 7E3b D1 / ADR 0114 Amendment H1), so both designs still share one
    // visitor — `second` is now the more recently updated of the two.
    await page.goto("/ro");
    expect(new URL(page.url()).pathname).toBe(`/ro/d/${second.id}`);

    // Touching `first` again — a save — makes it the more recent of the two once more.
    await saveDesign(page, first);
    await page.goto("/ro");
    expect(new URL(page.url()).pathname).toBe(`/ro/d/${first.id}`);
  } finally {
    await deleteMintedDesigns([first.id, second.id]);
  }
});

async function saveDesign(
  page: Parameters<typeof mintSeededDesign>[0],
  design: { readonly id: string; readonly revision: string },
): Promise<void> {
  const status = await page.evaluate(
    async ({ id, revision }): Promise<number> => {
      const loaded = (await (
        await fetch(`/api/designs/${id}`, { credentials: "same-origin" })
      ).json()) as { design: unknown };
      const response = await fetch(`/api/designs/${id}`, {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-expected-revision": revision,
        },
        body: JSON.stringify(loaded.design),
      });
      return response.status;
    },
    { id: design.id, revision: design.revision },
  );
  expect(status).toBe(200);
}

function assertResumeHeaders(response: APIResponse | Response): void {
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  // Not `toBe`: Next appends its own RSC-negotiation values (`rsc`, `next-router-state-tree`, …)
  // to the same header, ahead of the one this route sets — `Vary: Cookie` is still exactly what
  // `visitor-resume.ts` asked for, just not the header's only member on the wire.
  expect(response.headers().vary).toContain("Cookie");
  const location = response.headers().location ?? "";
  expect(location.startsWith("/")).toBe(true);
  expect(location).not.toContain("?");
  expect(location).not.toContain("://");
}

function assertCleared(response: APIResponse | Response): void {
  assertResumeHeaders(response);
  const setCookie = response.headers()["set-cookie"] ?? "";
  expect(setCookie).toContain(`${VISITOR_COOKIE_NAME}=`);
  expect(setCookie).toMatch(/Max-Age=0/);
  assertCsp(response);
}

function assertCsp(response: APIResponse | Response): string {
  const policy = response.headers()[CSP_HEADER];
  expect(policy).toBeTruthy();
  const nonce = /'nonce-([^']+)'/.exec(policy ?? "")?.[1];
  expect(nonce).toBeTruthy();
  if (nonce === undefined) throw new Error("CSP contains no nonce");
  return nonce;
}
