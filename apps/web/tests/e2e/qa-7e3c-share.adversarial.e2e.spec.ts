import { createHash, randomBytes } from "node:crypto";

import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type APIResponse,
  type BrowserContext,
  type Page,
} from "@playwright/test";

import { isAccountSessionRead } from "./support/account-session-reads";
import { SINK_CABINET_TAP, tapCanvas } from "./support/canvas-taps";
import { nonceOfPolicy, policyOf } from "./support/csp-violations";
import { deleteMintedDesigns } from "./support/minted-designs";
import { canonicaliseRowIds } from "./support/rsc-row-ids";
import {
  expectWriteAccessApplied,
  issueShareLink,
  mintSeededDesign,
  openSeededDesign,
  openSharedDesign,
  type SeededDesign,
} from "./support/seeded-design";

/**
 * M7 wave 7E3c adversarial QA — what only a live server and a real browser can answer: token
 * enumeration through response differences, same-site CSRF on the share endpoint, the leak scan
 * over every response a share view triggers, revocation and re-issue racing live, crafted writes,
 * the headers on the page and on the unprefixed redirect, and the cascade.
 *
 * Every design minted here is deleted afterwards (ADR 0006).
 */

const VISITOR_COOKIE_NAME = "__Host-lemnaria_visitor";
const SETTLE_MS = 2000;
const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** `playwright.config.ts` serves a production build (`next start`) only under `CI`; locally it is
 *  `next dev`, which rewrites a page's `Cache-Control` to `no-cache, must-revalidate`. Criteria 7
 *  and 10 are measured "on `next start`", so the assertions only a production server can answer are
 *  held there. */
const IS_PRODUCTION_SERVER = process.env.CI !== undefined;

const mintedDesignIds: string[] = [];

test.afterAll(async () => {
  await deleteMintedDesigns(mintedDesignIds);
});

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function randomWellFormedToken(): string {
  return Array.from(randomBytes(12), (byte) => ALPHABET[byte % 62]).join("");
}

function tokenOf(sharePath: string): string {
  return sharePath.slice("/s/".length);
}

function projectBaseUrl(): URL {
  const base = test.info().project.use.baseURL;
  if (base === undefined) throw new Error("the project has no baseURL");
  return new URL(base);
}

async function mintTracked(page: Page): Promise<SeededDesign> {
  const design = await mintSeededDesign(page);
  mintedDesignIds.push(design.id);
  return design;
}

async function freshRequestContext(): Promise<APIRequestContext> {
  return playwrightRequest.newContext({ baseURL: projectBaseUrl().href });
}

/** The fetch is made from inside the owner's page, so it carries the owner's cookies. */
async function ownerFetch(
  page: Page,
  path: string,
  method: string,
): Promise<{ status: number; body: string }> {
  return page.evaluate(
    async ({ path: target, method: verb }) => {
      const response = await fetch(target, {
        method: verb,
        credentials: "same-origin",
      });
      return { status: response.status, body: await response.text() };
    },
    { path, method },
  );
}

function nonceOf(response: APIResponse): string {
  const nonce = nonceOfPolicy(policyOf(response));
  if (nonce === undefined) throw new Error("the response carries no CSP nonce");
  return nonce;
}

async function normalisedBody(
  response: APIResponse,
  token: string,
): Promise<string> {
  const body = (await response.text())
    .replaceAll(nonceOf(response), "{nonce}")
    .replaceAll(token, "{token}")
    .replace(DEV_REQUEST_ID, "{dev-request-id}");
  return IS_PRODUCTION_SERVER ? body : canonicaliseRowIds(body);
}

/** `next dev` stamps a fresh per-request id into every document; a production build does not. Nor
 *  does it renumber the flight rows between two renders of one page, which `next dev` does under
 *  load (see `support/rsc-row-ids.ts`) — so the row ids are compared up to renaming there only. */
const DEV_REQUEST_ID = /self\.__next_r="[^"]*"/g;

function headerNamesExceptDate(response: APIResponse): string[] {
  return response
    .headersArray()
    .map(({ name }) => name.toLowerCase())
    .filter((name) => name !== "date")
    .sort();
}

function expectShareViewHeaders(response: APIResponse, label: string): void {
  const headers = response.headersArray();
  const valuesOf = (name: string): string[] =>
    headers
      .filter((header) => header.name.toLowerCase() === name)
      .map((header) => header.value);

  expect(valuesOf("referrer-policy"), `${label}: Referrer-Policy`).toEqual([
    "no-referrer",
  ]);
  expect(valuesOf("x-robots-tag"), `${label}: X-Robots-Tag`).toEqual([
    "noindex, nofollow",
  ]);
  if (!IS_PRODUCTION_SERVER) return;
  const cacheControl = valuesOf("cache-control");
  expect(cacheControl, `${label}: one Cache-Control`).toHaveLength(1);
  expect(cacheControl[0], `${label}: Cache-Control`).toContain("private");
  expect(cacheControl[0], `${label}: Cache-Control`).toContain("no-store");
  expect(cacheControl[0], `${label}: Cache-Control`).not.toMatch(
    /public|s-maxage/,
  );
}

async function isShareUnavailable(
  context: APIRequestContext,
  sharePath: string,
): Promise<boolean> {
  const html = await (await context.get(`/ro${sharePath}`)).text();
  return html.includes('data-testid="design-load-error"');
}

test.describe("criterion 10 — unavailable is one response, whatever made it unavailable", () => {
  test("unknown, revoked, another design's revoked and a deleted design's token answer identically", async ({
    page,
  }) => {
    const first = await mintTracked(page);
    const revokedPath = await issueShareLink(page, first);
    expect(
      (await ownerFetch(page, `/api/designs/${first.id}/share`, "DELETE"))
        .status,
    ).toBe(204);

    const second = await mintTracked(page);
    const foreignRevokedPath = await issueShareLink(page, second);
    expect(
      (await ownerFetch(page, `/api/designs/${second.id}/share`, "DELETE"))
        .status,
    ).toBe(204);
    const livePath = await issueShareLink(page, second);

    const doomed = await mintSeededDesign(page);
    const deletedPath = await issueShareLink(page, doomed);
    await deleteMintedDesigns([doomed.id]);

    const stranger = await freshRequestContext();
    try {
      const unknownToken = randomWellFormedToken();
      const cases = {
        unknown: unknownToken,
        revoked: tokenOf(revokedPath),
        "another design's revoked": tokenOf(foreignRevokedPath),
        "a deleted design's": tokenOf(deletedPath),
      };
      // A fresh context per case: the first request in a context is answered with next-intl's
      // `NEXT_LOCALE` Set-Cookie and later ones are not, which would otherwise read as a difference.
      const responses = new Map<
        string,
        { response: APIResponse; body: string }
      >();
      for (const [name, token] of Object.entries(cases)) {
        const perCase = await freshRequestContext();
        const response = await perCase.get(`/ro/s/${token}`);
        responses.set(name, {
          response,
          body: await normalisedBody(response, token),
        });
        await perCase.dispose();
      }

      const unknown = responses.get("unknown");
      if (unknown === undefined) throw new Error("no unknown-token response");
      expect(unknown.response.status()).toBe(200);
      expect(unknown.body).toContain('data-testid="design-load-error"');
      for (const [name, { response, body }] of responses) {
        expect(response.status(), name).toBe(unknown.response.status());
        expect(headerNamesExceptDate(response), name).toEqual(
          headerNamesExceptDate(unknown.response),
        );
        // Bytes are held on `next start` only: under the full suite's load, `next dev` was measured
        // numbering one RSC row differently (`8b` vs `89`) between two unavailable tokens — timing
        // noise in the dev renderer, not a token-state signal; ten production repeats were identical.
        if (IS_PRODUCTION_SERVER)
          expect(body, `${name} body vs unknown`).toBe(unknown.body);
        expectShareViewHeaders(response, name);
      }

      // Malformed shapes: the shape is public (the page's own ruling), so only status and headers
      // are held to identity here — never the body's RSC chunk numbering.
      for (const malformed of [
        "a".repeat(11),
        "a".repeat(13),
        "abcdefghij-_",
      ]) {
        const response = await stranger.get(`/ro/s/${malformed}`);
        expect(response.status(), malformed).toBe(unknown.response.status());
        expect(await response.text(), malformed).toContain(
          'data-testid="design-load-error"',
        );
        expectShareViewHeaders(response, malformed);
      }

      // The positive control: the one live token in this test does open.
      expect(await isShareUnavailable(stranger, livePath)).toBe(false);
    } finally {
      await stranger.dispose();
    }
  });
});

test.describe("criteria 7 and 8 — headers on the page, the unprefixed redirect, and paths not served", () => {
  test("a live link's 200 and its unprefixed 307 both carry the three share headers and the meta tags", async ({
    page,
  }) => {
    const design = await mintTracked(page);
    const sharePath = await issueShareLink(page, design);
    const stranger = await freshRequestContext();
    try {
      for (const locale of ["ro", "ru"]) {
        const response = await stranger.get(`/${locale}${sharePath}`);
        expect(response.status()).toBe(200);
        expectShareViewHeaders(response, `/${locale}${sharePath}`);
        const html = await response.text();
        expect(html).toMatch(/<meta name="robots" content="noindex, nofollow"/);
        expect(html).toMatch(/<meta name="referrer" content="no-referrer"/);
      }

      const redirect = await stranger.get(sharePath, {
        maxRedirects: 0,
        headers: { "accept-language": "ru" },
      });
      expect(redirect.status()).toBe(307);
      expect(
        new URL(redirect.headers().location ?? "", projectBaseUrl()).pathname,
      ).toBe(`/ru${sharePath}`);
      expectShareViewHeaders(redirect, "unprefixed 307");

      for (const unserved of [
        `/en${sharePath}`,
        `/RO${sharePath}`,
        `/ro${sharePath}/x`,
      ]) {
        const response = await stranger.get(unserved, { maxRedirects: 0 });
        expect(response.status(), unserved).toBe(404);
      }
    } finally {
      await stranger.dispose();
    }
  });
});

interface CapturedResponse {
  readonly url: string;
  readonly headers: string;
  readonly body: string;
}

function captureEveryResponse(page: Page): CapturedResponse[] {
  const captured: CapturedResponse[] = [];
  page.on("response", (response) => {
    void (async () => {
      let body = "";
      try {
        body = await response.text();
      } catch {
        body = "";
      }
      captured.push({
        url: response.url(),
        headers: JSON.stringify(await response.allHeaders()),
        body,
      });
    })();
  });
  return captured;
}

async function secretsOf(
  context: BrowserContext,
  design: SeededDesign,
  sharePath: string,
): Promise<Record<string, string>> {
  const cookies = await context.cookies();
  const visitor = cookies.find(
    (cookie) => cookie.name === VISITOR_COOKIE_NAME,
  )?.value;
  const writeToken = cookies.find((cookie) =>
    cookie.name.startsWith("lemnaria_write_token_"),
  )?.value;
  if (visitor === undefined || writeToken === undefined)
    throw new Error("the owner's jar lacks a visitor or write-token cookie");
  return {
    "design id": design.id,
    "visitor value": visitor,
    "visitor hash": sha256Hex(visitor),
    "write token": writeToken,
    "write token hash": sha256Hex(writeToken),
    "share token hash": sha256Hex(tokenOf(sharePath)),
  };
}

test.describe("criterion 9 — nothing leaks, nothing is requested, nothing is set", () => {
  test("a fresh context's share view: no secret in any response, no /api/ request, only NEXT_LOCALE in the jar", async ({
    page,
    context,
    browser,
  }) => {
    const design = await mintTracked(page);
    const sharePath = await issueShareLink(page, design);
    const secrets = await secretsOf(context, design, sharePath);

    const visitorContext = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 844 },
    });
    try {
      const visitorPage = await visitorContext.newPage();
      const captured = captureEveryResponse(visitorPage);
      const apiRequests: string[] = [];
      const accountSessionReads: string[] = [];
      visitorPage.on("request", (request) => {
        if (new URL(request.url()).pathname.startsWith("/api/"))
          (isAccountSessionRead(request.method(), request.url())
            ? accountSessionReads
            : apiRequests
          ).push(`${request.method()} ${request.url()}`);
      });

      await openSharedDesign(visitorPage, sharePath, { locale: "ro" });
      await visitorPage.waitForTimeout(SETTLE_MS);
      await tapCanvas(visitorPage, SINK_CABINET_TAP);
      await visitorPage.waitForTimeout(SETTLE_MS);
      await visitorPage.getByTestId("top-bar-locale").tap();
      await visitorPage.getByTestId("top-bar-locale-option-ru").tap();
      // A client navigation, awaited as one: under the full suite's load on `next dev` it has been
      // measured to take longer than an assertion's default retry window.
      await visitorPage.waitForURL(new RegExp(`/ru${sharePath}$`));
      await visitorPage.waitForTimeout(SETTLE_MS);

      expect(apiRequests).toEqual([]);
      // The header's one read of who is signed in, asked once for the one document the visitor loaded: the
      // language switch is a client navigation inside it and must not ask again (`use-account-session.ts`).
      expect(accountSessionReads.length).toBeLessThanOrEqual(1);
      expect(captured.length).toBeGreaterThan(0);
      for (const response of captured) {
        for (const [name, secret] of Object.entries(secrets)) {
          const where = `${name} in ${response.url}`;
          expect(response.url.includes(secret), where).toBe(false);
          expect(response.headers.includes(secret), where).toBe(false);
          expect(response.body.includes(secret), where).toBe(false);
        }
      }
      const storage = await visitorPage.evaluate(() =>
        JSON.stringify({
          local: Object.entries(localStorage),
          session: Object.entries(sessionStorage),
          cookie: document.cookie,
        }),
      );
      for (const [name, secret] of Object.entries(secrets)) {
        expect(storage.includes(secret), `${name} in storage`).toBe(false);
      }
      const jar = (await visitorContext.cookies()).map((cookie) => cookie.name);
      expect(jar.filter((name) => name !== "NEXT_LOCALE")).toEqual([]);
    } finally {
      await visitorContext.close();
    }
  });

  test("positive control: the same scan finds the id on the owner's /d/{id}", async ({
    page,
  }) => {
    const design = await mintTracked(page);
    const captured = captureEveryResponse(page);
    await openSeededDesign(page, design, { locale: "ro" });
    await page.waitForTimeout(SETTLE_MS);

    expect(captured.some((response) => response.body.includes(design.id))).toBe(
      true,
    );
  });

  test("the owner's browser, holding both cookies, gets the same share-view body as a stranger", async ({
    page,
  }) => {
    const design = await mintTracked(page);
    const sharePath = await issueShareLink(page, design);
    const token = tokenOf(sharePath);
    const stranger = await freshRequestContext();
    try {
      const asOwner = await page.request.get(`/ro${sharePath}`);
      const asStranger = await stranger.get(`/ro${sharePath}`);
      expect(asOwner.headers()["set-cookie"] ?? "").not.toContain(
        VISITOR_COOKIE_NAME,
      );
      expect(await normalisedBody(asOwner, token)).toBe(
        await normalisedBody(asStranger, token),
      );
    } finally {
      await stranger.dispose();
    }
  });
});

test.describe("D5 — a same-site sibling origin cannot issue, re-issue or read status", () => {
  const SIBLING_PORT = 4399;

  test("an auto-submitted form POST from http://localhost:<other port> is refused and the owner's link survives", async ({
    page,
  }) => {
    const design = await mintTracked(page);
    const ownersPath = await issueShareLink(page, design);
    const target = new URL(`/api/designs/${design.id}/share`, projectBaseUrl());
    const siblingUrl = `http://localhost:${String(SIBLING_PORT)}/qa-7e3c-sibling`;
    await page.route(siblingUrl, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<form id="f" method="POST" action="${target.href}"></form>
               <script>document.getElementById("f").submit()</script>`,
      }),
    );

    const shareResponse = page.waitForResponse(
      (response) =>
        response.url() === target.href &&
        response.request().method() === "POST",
    );
    await page.goto(siblingUrl);
    const response = await shareResponse;
    const requestHeaders = await response.request().allHeaders();

    // The request did carry both credentials (same-site, SameSite=Lax) — which is D5's whole reason.
    expect(requestHeaders.cookie ?? "").toContain(VISITOR_COOKIE_NAME);
    expect(requestHeaders.origin).toBe(
      `http://localhost:${String(SIBLING_PORT)}`,
    );
    expect(response.status()).toBe(404);
    expect(await response.text()).toBe(
      JSON.stringify({ error: `No design found for id "${design.id}"` }),
    );

    const stranger = await freshRequestContext();
    try {
      expect(await isShareUnavailable(stranger, ownersPath)).toBe(false);
    } finally {
      await stranger.dispose();
    }
  });

  test("a same-site top-level GET navigation to the status endpoint is refused", async ({
    page,
  }) => {
    const design = await mintTracked(page);
    await issueShareLink(page, design);
    const target = new URL(`/api/designs/${design.id}/share`, projectBaseUrl());
    const siblingUrl = `http://localhost:${String(SIBLING_PORT)}/qa-7e3c-sibling-nav`;
    await page.route(siblingUrl, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<script>location.href = ${JSON.stringify(target.href)}</script>`,
      }),
    );
    const statusResponse = page.waitForResponse(
      (response) => response.url() === target.href,
    );
    await page.goto(siblingUrl);
    const response = await statusResponse;
    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain("active");
  });
});

test.describe("criteria 5 and 11 — live races", () => {
  test("six concurrent re-issues from the owner: every one answers 201, exactly one link opens", async ({
    page,
  }) => {
    const design = await mintTracked(page);
    const outcomes = await page.evaluate(async (id) => {
      const responses = await Promise.all(
        Array.from({ length: 6 }, () =>
          fetch(`/api/designs/${id}/share`, {
            method: "POST",
            credentials: "same-origin",
          }),
        ),
      );
      return Promise.all(
        responses.map(async (response) => ({
          status: response.status,
          body: await response.text(),
        })),
      );
    }, design.id);

    expect(outcomes.map((outcome) => outcome.status)).toEqual([
      201, 201, 201, 201, 201, 201,
    ]);
    const paths = outcomes.map(
      (outcome) => (JSON.parse(outcome.body) as { path: string }).path,
    );
    const stranger = await freshRequestContext();
    try {
      const opening = [];
      for (const path of paths) {
        if (!(await isShareUnavailable(stranger, path))) opening.push(path);
      }
      expect(opening).toHaveLength(1);
      expect(
        JSON.parse(
          (await ownerFetch(page, `/api/designs/${design.id}/share`, "GET"))
            .body,
        ),
      ).toEqual({ active: true });
    } finally {
      await stranger.dispose();
    }
  });

  test("reads racing a revoke: every read begun after the DELETE answered is unavailable, and the link never returns", async ({
    page,
  }) => {
    const design = await mintTracked(page);
    const sharePath = await issueShareLink(page, design);
    const stranger = await freshRequestContext();
    try {
      const racing = Array.from({ length: 4 }, () =>
        isShareUnavailable(stranger, sharePath),
      );
      const revoke = await ownerFetch(
        page,
        `/api/designs/${design.id}/share`,
        "DELETE",
      );
      expect(revoke.status).toBe(204);
      const after = await Promise.all(
        Array.from({ length: 4 }, () =>
          isShareUnavailable(stranger, sharePath),
        ),
      );
      await Promise.all(racing);
      expect(after).toEqual([true, true, true, true]);

      const reissued = await issueShareLink(page, design);
      const reissuedAgain = await issueShareLink(page, design);
      expect(await isShareUnavailable(stranger, sharePath)).toBe(true);
      expect(await isShareUnavailable(stranger, reissued)).toBe(true);
      expect(await isShareUnavailable(stranger, reissuedAgain)).toBe(false);
    } finally {
      await stranger.dispose();
    }
  });
});

test.describe("criterion 12 — crafted writes through a share view", () => {
  test("every method on the share page changes no row and sets no credential cookie; the token is no write credential", async ({
    page,
  }) => {
    const design = await mintTracked(page);
    const sharePath = await issueShareLink(page, design);
    const token = tokenOf(sharePath);
    const before = await ownerFetch(page, `/api/designs/${design.id}`, "GET");
    const stranger = await freshRequestContext();
    try {
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        const response = await stranger.fetch(`/ro${sharePath}`, {
          method,
          data: JSON.stringify({ placements: [] }),
          headers: { "content-type": "application/json" },
          maxRedirects: 0,
        });
        const setCookie = response
          .headersArray()
          .filter((header) => header.name.toLowerCase() === "set-cookie")
          .map((header) => header.value.split("=")[0]);
        expect(
          setCookie.filter((name) => name !== "NEXT_LOCALE"),
          method,
        ).toEqual([]);
      }

      const put = await stranger.put(`/api/designs/${token}`, {
        data: JSON.stringify({}),
        headers: { "content-type": "application/json" },
      });
      expect(put.status()).toBe(403);

      for (const method of ["POST", "DELETE", "GET"]) {
        const response = await stranger.fetch(`/api/designs/${token}/share`, {
          method,
        });
        expect(response.status(), method).toBe(404);
      }

      expect(
        await ownerFetch(page, `/api/designs/${design.id}`, "GET"),
      ).toEqual(before);
      expect(await isShareUnavailable(stranger, sharePath)).toBe(false);
    } finally {
      await stranger.dispose();
    }
  });
});

test.describe("criterion 14 — the link never reaches storage, the URL or the console", () => {
  test("after issuing through the control and reloading, the token is nowhere a script can find it", async ({
    page,
  }) => {
    const design = await mintTracked(page);
    const consoleLines: string[] = [];
    page.on("console", (message) => consoleLines.push(message.text()));
    await openSeededDesign(page, design);

    await page.getByTestId("global-settings-trigger").tap();
    await page.getByTestId("share-design-create").tap();
    const link = await page.getByTestId("share-design-link").inputValue();
    const token = new URL(link).pathname.slice("/s/".length);
    expect(token).toMatch(/^[0-9A-Za-z]{12}$/);

    const snapshot = async (): Promise<string> =>
      page.evaluate(() =>
        JSON.stringify({
          local: Object.entries(localStorage),
          session: Object.entries(sessionStorage),
          cookie: document.cookie,
          url: location.href,
        }),
      );
    expect(await snapshot()).not.toContain(token);

    await page.reload();
    await page.waitForSelector("canvas", { state: "attached" });
    await expectWriteAccessApplied(page);
    await page.getByTestId("global-settings-trigger").tap();
    await expect(page.getByTestId("share-design-status")).toBeVisible();
    await expect(page.getByTestId("share-design-link")).toHaveCount(0);
    expect(await snapshot()).not.toContain(token);
    expect(consoleLines.filter((line) => line.includes(token))).toEqual([]);
    expect(await page.content()).not.toContain(token);
  });

  // M7 wave 7E3b, S4, criterion 9: re-pointed from a stranger context reading `/d/{id}` read-only.
  // Since ADR 0114 decision 5 that access no longer exists at all — a stranger's visitor cookie
  // never matches the row, so `/d/{id}` answers the `"unavailable"` refusal rather than a read-only
  // view. The closest surviving read-only `/d/{id}` case is the owner's own browser missing only
  // its write-token cookie (criterion 4), so that is what this test now exercises; the share-view
  // half is unchanged — it never depended on the visitor cookie either way (D6/G15).
  test("no share control for the owner's own read-only /d/{id} (write token cleared) or inside the share view", async ({
    page,
    context,
  }) => {
    const design = await mintTracked(page);
    const sharePath = await issueShareLink(page, design);

    await context.clearCookies({
      name: `lemnaria_write_token_${design.id}`,
    });
    await page.goto(`/ro/d/${design.id}`);
    await page.waitForSelector("canvas", { state: "attached" });
    await page.waitForTimeout(SETTLE_MS);
    await expect(page.getByTestId("global-settings-trigger")).toBeDisabled();
    await expect(page.getByTestId("share-design")).toHaveCount(0);

    await openSharedDesign(page, sharePath, { locale: "ro" });
    await page.waitForTimeout(SETTLE_MS);
    await expect(page.getByTestId("global-settings-trigger")).toBeDisabled();
    await expect(page.getByTestId("share-design")).toHaveCount(0);
  });
});
