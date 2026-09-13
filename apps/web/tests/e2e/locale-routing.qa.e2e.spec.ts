import {
  expect,
  test,
  type APIResponse,
  type Page,
  type Response,
} from "@playwright/test";
import { readFileSync } from "node:fs";

interface MetadataMessages {
  readonly brand: string;
  readonly meta: { readonly title: string; readonly description: string };
}

const roMessages = readMessages("ro");
const ruMessages = readMessages("ru");

const CSP_HEADER = "content-security-policy-report-only";

test("cookie, weighted language preferences, fallback and the full query select the redirect locale", async ({
  request,
}) => {
  const cases = [
    {
      path: "/configurator/configure?mode=read%20only&tag=a&tag=b",
      headers: {
        cookie: "NEXT_LOCALE=ru",
        "accept-language": "ro;q=1, ru;q=0.1",
      },
      locale: "ru",
    },
    {
      path: "/configurator/contact?from=qa",
      headers: { "accept-language": "ru;q=0.8, ro;q=0.9" },
      locale: "ro",
    },
    {
      path: "/configurator/contact?from=qa",
      headers: { "accept-language": "fr;q=1, ru;q=0.9, ro;q=0.2" },
      locale: "ru",
    },
    {
      path: "/configurator/configure?from=malformed",
      headers: {
        cookie: "NEXT_LOCALE=en",
        "accept-language": "not-a-language-%%%",
      },
      locale: "ro",
    },
  ] as const;

  for (const scenario of cases) {
    const response = await request.get(scenario.path, {
      headers: scenario.headers,
      maxRedirects: 0,
    });

    expect(response.status(), scenario.path).toBe(307);
    assertCsp(response);
    const location = new URL(
      response.headers().location ?? "",
      "http://localhost:4320",
    );
    const source = new URL(scenario.path, "http://localhost:4320");
    expect(location.pathname).toBe(`/${scenario.locale}${source.pathname}`);
    expect([...location.searchParams.entries()]).toEqual([
      ...source.searchParams.entries(),
    ]);
  }
});

test("both localized documents expose locale metadata and the environment's nonce contract", async ({
  page,
  context,
}) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));

  for (const [locale, messages] of [
    ["ro", roMessages],
    ["ru", ruMessages],
  ] as const) {
    await context.addCookies([
      {
        name: "NEXT_LOCALE",
        value: locale === "ro" ? "ru" : "ro",
        domain: "localhost",
        path: "/",
      },
    ]);
    const response = await page.goto(`/${locale}/configurator/contact`);
    if (response === null) throw new Error("Navigation returned no response");
    expect(response.status()).toBe(200);
    const nonce = assertCsp(response);

    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page).toHaveTitle(
      messages.meta.title.replace("{brand}", messages.brand),
    );
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      messages.meta.description,
    );
    await expect(page.locator("html")).not.toHaveAttribute("lang", /en/i);
    expect(await documentNonces(page)).toEqual(
      process.env.CI === undefined ? [nonce] : [],
    );
    await expect
      .poll(async () => {
        const cookies = await context.cookies();
        return cookies.find((cookie) => cookie.name === "NEXT_LOCALE")?.value;
      })
      .toBe(locale);
    expect(response.headers().link).toContain('hreflang="ro"');
    expect(response.headers().link).toContain('hreflang="ru"');
  }

  expect(runtimeErrors).toEqual([]);
});

test("localized roots and all five customer entrypoints are real runtime routes", async ({
  request,
}) => {
  for (const locale of ["ro", "ru"] as const) {
    const root = await request.get(`/${locale}`, { maxRedirects: 0 });
    expect(root.status()).toBe(307);
    expect(root.headers().location).toBe(`/${locale}/configurator/room`);
    assertCsp(root);

    for (const path of [
      "/configurator/configure",
      "/configurator/contact",
      "/configurator/room",
      "/d/qa-route-does-not-exist",
    ]) {
      const response = await request.get(`/${locale}${path}`, {
        maxRedirects: 0,
      });
      expect(response.status(), `/${locale}${path}`).toBe(200);
      expect(response.headers().location).toBeUndefined();
      assertCsp(response);
    }
  }
});

test("invalid locale shapes and prefixed tooling are 404 while unprefixed tooling stays put", async ({
  request,
}) => {
  for (const path of [
    "/en/configurator/configure",
    "/RO/configurator/configure",
    "/ro/configurator/configure/extra",
    "/ro/configurator/room/x",
    "/ru/configurator/room/x",
    "/ro/api/designs",
    "/ru/internal/scene-shot",
  ]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(404);
    expect(response.headers().location).toBeUndefined();
    assertCsp(response);
  }

  const api = await request.get("/api/designs", { maxRedirects: 0 });
  expect(api.status()).toBe(405);
  expect(api.headers().location).toBeUndefined();
  assertCsp(api);

  const internal = await request.get("/internal/scene-shot", {
    maxRedirects: 0,
  });
  // The verification-only route is available under `next dev` and deliberately gated off by
  // default under `next start`; either way, locale routing must leave the unprefixed path in place.
  expect(internal.status()).toBe(process.env.CI === undefined ? 200 : 404);
  expect(internal.headers().location).toBeUndefined();
  assertCsp(internal);
});

function assertCsp(response: APIResponse | Response): string {
  const policy = response.headers()[CSP_HEADER];
  expect(policy).toBeTruthy();
  const nonce = /'nonce-([^']+)'/.exec(policy ?? "")?.[1];
  expect(nonce).toBeTruthy();
  if (nonce === undefined) throw new Error("CSP contains no nonce");
  return nonce;
}

async function documentNonces(page: Page): Promise<string[]> {
  return page.locator("script[nonce], link[nonce]").evaluateAll((elements) => {
    // Browsers intentionally hide nonce values from `getAttribute`; the IDL property remains the
    // authoritative value used for CSP checks.
    const nonces = elements.map((element) =>
      "nonce" in element && typeof element.nonce === "string"
        ? element.nonce
        : undefined,
    );
    return [
      ...new Set(
        nonces.filter((nonce): nonce is string => nonce !== undefined),
      ),
    ];
  });
}

function readMessages(locale: "ro" | "ru"): MetadataMessages {
  return JSON.parse(
    readFileSync(
      new URL(`../../src/messages/${locale}.json`, import.meta.url),
      "utf8",
    ),
  ) as MetadataMessages;
}
