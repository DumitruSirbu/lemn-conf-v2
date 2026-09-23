import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type APIResponse,
  type BrowserContext,
  type Page,
} from "@playwright/test";

import { deleteMintedDesigns } from "./support/minted-designs";
import {
  issueShareLink,
  mintSeededDesign,
  openSeededDesign,
  openSharedDesign,
  openUnavailableDesign,
  type SeededDesign,
} from "./support/seeded-design";

/**
 * M7 wave 7E3b adversarial QA — what only a live server and a real browser can answer: fixation
 * closed after rotation (criterion 6, backlog 81), the owner's own flow across a rotation, D3's
 * stale-tab save that must never restore a rotated-away value, and the byte identity of the
 * refusal across a foreign cookie, a missing or malformed one and an unknown id (criterion 2).
 *
 * Every design minted here is deleted afterwards (ADR 0006).
 */

const VISITOR_COOKIE_NAME = "__Host-lemnaria_visitor";
const PLANTED_VALUE = "Pl4nted_by-a-same-host-script-0123456789abc";

/** Bytes are held on `next start` only, for 7E3c QA's measured reason: `next dev` numbers RSC rows
 *  differently under load and stamps a per-request id into every document. */
const IS_PRODUCTION_SERVER = process.env.CI !== undefined;
const DEV_REQUEST_ID = /self\.__next_r="[^"]*"/g;

const mintedDesignIds: string[] = [];
const openRequestContexts: APIRequestContext[] = [];

test.afterEach(async () => {
  await Promise.all(
    openRequestContexts.splice(0).map((context) => context.dispose()),
  );
});

test.afterAll(async () => {
  await deleteMintedDesigns(mintedDesignIds);
});

async function mintTracked(page: Page): Promise<SeededDesign> {
  const design = await mintSeededDesign(page);
  mintedDesignIds.push(design.id);
  return design;
}

async function visitorCookieOf(context: BrowserContext) {
  return (await context.cookies()).filter(
    (cookie) => cookie.name === VISITOR_COOKIE_NAME,
  );
}

/** A same-host script's plant: a non-`HttpOnly` `__Host-` cookie written through `document.cookie`,
 *  the backlog-81 precondition. Only possible while the jar holds no `HttpOnly` cookie of the name. */
async function plantVisitorValue(page: Page, value: string): Promise<void> {
  await page.goto("/ro/configurator/room");
  await page.evaluate(
    ([name, planted]) => {
      document.cookie = `${name}=${planted}; Secure; Path=/; SameSite=Lax`;
    },
    [VISITOR_COOKIE_NAME, value] as const,
  );
}

function projectBaseUrl(): URL {
  const base = test.info().project.use.baseURL;
  if (base === undefined) throw new Error("the project has no baseURL");
  return new URL(base);
}

async function freshRequestContext(): Promise<APIRequestContext> {
  return playwrightRequest.newContext({ baseURL: projectBaseUrl().href });
}

test.describe("criterion 6 — fixation closed (backlog 81)", () => {
  test("a planted value is replaced by the next mint, and a second browser holding it reads nothing and resumes nowhere", async ({
    page,
    context,
    browser,
  }) => {
    expect(PLANTED_VALUE).toHaveLength(43);
    await plantVisitorValue(page, PLANTED_VALUE);
    const planted = await visitorCookieOf(context);
    expect(planted.map((cookie) => [cookie.value, cookie.httpOnly])).toEqual([
      [PLANTED_VALUE, false],
    ]);

    const design = await mintTracked(page);
    const afterMint = await visitorCookieOf(context);
    expect(afterMint).toHaveLength(1);
    expect(afterMint[0]?.value).not.toBe(PLANTED_VALUE);
    expect(afterMint[0]?.httpOnly).toBe(true);

    const attackerContext = await browser.newContext();
    try {
      const attackerPage = await attackerContext.newPage();
      await plantVisitorValue(attackerPage, PLANTED_VALUE);
      await openUnavailableDesign(attackerPage, `/ro/d/${design.id}`);

      const attackerApi = await attackerPage.evaluate(async (id) => {
        const response = await fetch(`/api/designs/${id}`);
        return response.status;
      }, design.id);
      expect(attackerApi).toBe(404);

      await attackerPage.goto("/ro");
      expect(new URL(attackerPage.url()).pathname).toBe(
        "/ro/configurator/room",
      );
    } finally {
      await attackerContext.close();
    }

    // The victim, meanwhile, still owns the design it just minted.
    await openSeededDesign(page, design, { locale: "ro" });
  });

  test("R4 measured: an attacker's own value planted in a victim loses the attacker every design it held", async ({
    page,
    browser,
  }) => {
    const attackerContext = await browser.newContext();
    try {
      const attackerPage = await attackerContext.newPage();
      const attackerDesign = await mintTracked(attackerPage);
      const attackerValue = (await visitorCookieOf(attackerContext))[0]?.value;
      if (attackerValue === undefined) throw new Error("attacker has no value");

      await plantVisitorValue(page, attackerValue);
      const victimDesign = await mintTracked(page);

      await openUnavailableDesign(attackerPage, `/ro/d/${attackerDesign.id}`);
      await page.goto("/ro");
      expect(new URL(page.url()).pathname).toBe(`/ro/d/${victimDesign.id}`);
    } finally {
      await attackerContext.close();
    }
  });
});

test.describe("the owner across a rotation", () => {
  test("an earlier design stays editable, resume lands on the newest, and an earlier share link still opens for a stranger", async ({
    page,
    browser,
  }) => {
    const first = await mintTracked(page);
    const sharePath = await issueShareLink(page, first);
    const second = await mintTracked(page);

    await openSeededDesign(page, first, { locale: "ro" });
    await page.goto("/ro");
    expect(new URL(page.url()).pathname).toBe(`/ro/d/${second.id}`);

    const strangerContext = await browser.newContext();
    try {
      const strangerPage = await strangerContext.newPage();
      await openSharedDesign(strangerPage, sharePath, { locale: "ro" });
      await expect(strangerPage.getByTestId("design-load-error")).toHaveCount(
        0,
      );
      await openUnavailableDesign(strangerPage, `/ro/d/${first.id}`);
    } finally {
      await strangerContext.close();
    }
  });

  test("D3: a stale tab's save carrying the rotated-away value lands, and never restores that value to the jar", async ({
    page,
    context,
  }) => {
    const first = await mintTracked(page);
    const staleValue = (await visitorCookieOf(context))[0]?.value;
    const second = await mintTracked(page);
    const currentValue = (await visitorCookieOf(context))[0]?.value;
    expect(staleValue).toBeDefined();
    expect(currentValue).not.toBe(staleValue);

    // The stale tab's request: it carries the value the jar held before the rotation, and its
    // response lands in this same jar afterwards — `context.request` shares the browser's cookie
    // storage, and an explicit `cookie` header replaces what the jar would have sent.
    const read = (await (
      await context.request.get(`/api/designs/${first.id}`)
    ).json()) as { design: unknown; revision: string };
    const writeToken = (await context.cookies()).find((cookie) =>
      cookie.name.startsWith("lemnaria_write_token_"),
    );
    if (writeToken === undefined) throw new Error("no write token in the jar");
    const response = await context.request.put(`/api/designs/${first.id}`, {
      headers: {
        cookie: `${writeToken.name}=${writeToken.value}; ${VISITOR_COOKIE_NAME}=${staleValue ?? ""}`,
        "content-type": "application/json",
        "x-expected-revision": read.revision,
      },
      data: JSON.stringify(read.design),
    });
    const saved = response.status();
    const visitorSetCookies = response
      .headersArray()
      .filter(
        ({ name, value }) =>
          name.toLowerCase() === "set-cookie" &&
          value.startsWith(`${VISITOR_COOKIE_NAME}=`),
      );

    // Proof the server saw the stale value: an owning value would have been re-emitted.
    expect(visitorSetCookies).toEqual([]);
    expect(saved).toBe(200);
    expect((await visitorCookieOf(context))[0]?.value).toBe(currentValue);
    await openSeededDesign(page, first, { locale: "ro" });
    // The save moved `first`'s updated_at past `second`'s, so resume — still reachable from the
    // jar's current value — now lands there.
    await page.goto("/ro");
    expect(new URL(page.url()).pathname).toBe(`/ro/d/${first.id}`);
    await openSeededDesign(page, second, { locale: "ro" });
  });
});

function nonceOf(response: APIResponse): string {
  const headers = response.headers();
  const policy =
    headers["content-security-policy-report-only"] ??
    headers["content-security-policy"] ??
    "";
  const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];
  if (nonce === undefined) throw new Error("the response carries no CSP nonce");
  return nonce;
}

/** Every header but `Date`, with the per-response CSP nonce (it also rides in `Link`) and the
 *  path's own id (the hreflang `Link`) replaced by placeholders. */
function headersExceptDate(response: APIResponse, pathId = "\u0000"): string[] {
  const policy =
    response.headers()["content-security-policy-report-only"] ??
    response.headers()["content-security-policy"];
  const nonce = policy === undefined ? undefined : nonceOf(response);
  return response
    .headersArray()
    .filter(({ name }) => name.toLowerCase() !== "date")
    .map(
      ({ name, value }) =>
        `${name.toLowerCase()}: ${(nonce === undefined ? value : value.replaceAll(nonce, "{nonce}")).replaceAll(pathId, "{id}")}`,
    )
    .sort();
}

async function getWithCookie(
  path: string,
  cookie: string | undefined,
): Promise<APIResponse> {
  const perCase = await freshRequestContext();
  openRequestContexts.push(perCase);
  const response = await perCase.get(path, {
    maxRedirects: 0,
    headers: cookie === undefined ? {} : { cookie },
  });
  return response;
}

test.describe("criterion 2 — one refusal, byte for byte", () => {
  test("foreign, no cookie, empty, malformed and unknown id: /ro/d/{id} and GET /api/designs/{id} answer identically", async ({
    page,
    browser,
  }) => {
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    const design = await mintTracked(ownerPage);
    await ownerContext.close();
    const own = await mintTracked(page);
    const foreignValue = (await visitorCookieOf(page.context()))[0]?.value;
    if (foreignValue === undefined) throw new Error("no foreign value");
    const unknownId = `${design.id.slice(0, -4)}zzzz`;

    const cases: Record<string, { id: string; cookie: string | undefined }> = {
      foreign: {
        id: design.id,
        cookie: `${VISITOR_COOKIE_NAME}=${foreignValue}`,
      },
      "no cookie": { id: design.id, cookie: undefined },
      empty: { id: design.id, cookie: `${VISITOR_COOKIE_NAME}=` },
      malformed: { id: design.id, cookie: `${VISITOR_COOKIE_NAME}=short` },
      "unknown id": {
        id: unknownId,
        cookie: `${VISITOR_COOKIE_NAME}=${foreignValue}`,
      },
    };

    const pages = new Map<
      string,
      { response: APIResponse; body: string; id: string }
    >();
    const apis = new Map<
      string,
      { response: APIResponse; body: string; id: string }
    >();
    for (const [name, { id, cookie }] of Object.entries(cases)) {
      const pageResponse = await getWithCookie(`/ro/d/${id}`, cookie);
      pages.set(name, {
        id,
        response: pageResponse,
        body: (await pageResponse.text())
          .replaceAll(nonceOf(pageResponse), "{nonce}")
          .replaceAll(id, "{id}")
          .replace(DEV_REQUEST_ID, "{dev-request-id}"),
      });
      const apiResponse = await getWithCookie(`/api/designs/${id}`, cookie);
      apis.set(name, {
        id,
        response: apiResponse,
        body: (await apiResponse.text()).replaceAll(id, "{id}"),
      });
    }

    const pageReference = pages.get("foreign");
    const apiReference = apis.get("foreign");
    if (pageReference === undefined || apiReference === undefined)
      throw new Error("no reference case");
    expect(pageReference.response.status()).toBe(200);
    expect(pageReference.body).toContain('data-testid="design-load-error"');
    expect(apiReference.response.status()).toBe(404);
    expect(apiReference.response.headers()["cache-control"]).toBe(
      "private, no-store",
    );
    // Next's app router prepends its own RSC names to `Vary`; `Cookie` must be among them.
    expect(apiReference.response.headers().vary).toMatch(/(^|,\s*)Cookie$/);

    // Coordinator ruling on QA Q1 (7E3c ruling (a), SEC-7E3b.4): the page is byte-identical within
    // the cookie-carrying group and within the no-cookie group; the two groups may differ in RSC
    // framing and `Link` preloads, which reveal only whether the requester sent a well-formed cookie.
    const PAGE_REFUSAL_GROUPS: Record<string, string> = {
      foreign: "foreign",
      "unknown id": "foreign",
      "no cookie": "no cookie",
      empty: "no cookie",
      malformed: "no cookie",
    };
    for (const [name, { response, body, id }] of pages) {
      const reference = pages.get(PAGE_REFUSAL_GROUPS[name] ?? "");
      if (reference === undefined) throw new Error(`no group for ${name}`);
      expect(response.status(), `page ${name}`).toBe(200);
      expect(headersExceptDate(response, id), `page ${name} headers`).toEqual(
        headersExceptDate(reference.response, reference.id),
      );
      if (IS_PRODUCTION_SERVER)
        expect(body, `page ${name} body`).toBe(reference.body);
      else
        expect(body, `page ${name}`).toContain(
          'data-testid="design-load-error"',
        );
    }
    for (const [name, { response, body, id }] of apis) {
      expect(response.status(), `api ${name}`).toBe(404);
      expect(headersExceptDate(response, id), `api ${name} headers`).toEqual(
        headersExceptDate(apiReference.response, apiReference.id),
      );
      expect(body, `api ${name} body`).toBe(apiReference.body);
      expect(response.headers()["set-cookie"], `api ${name}`).toBeUndefined();
    }

    // The owner's own control: the same two paths answer the design.
    const ownApi = await getWithCookie(
      `/api/designs/${own.id}`,
      `${VISITOR_COOKIE_NAME}=${foreignValue}`,
    );
    expect(ownApi.status()).toBe(200);
  });

  test("the unprefixed /d/{id} redirect is identical with and without a visitor cookie", async ({
    page,
  }) => {
    const design = await mintTracked(page);
    const value = (await visitorCookieOf(page.context()))[0]?.value ?? "";

    const withCookie = await getWithCookie(
      `/d/${design.id}`,
      `${VISITOR_COOKIE_NAME}=${value}`,
    );
    const without = await getWithCookie(`/d/${design.id}`, undefined);

    expect(withCookie.status()).toBe(307);
    expect(without.status()).toBe(withCookie.status());
    expect(headersExceptDate(without)).toEqual(headersExceptDate(withCookie));
    expect(await without.text()).toBe(await withCookie.text());
  });
});
