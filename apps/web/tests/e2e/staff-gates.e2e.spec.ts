// The staff area's doors as a browser meets them from outside: the addresses that are not staff pages, and the answer a
// visitor, or a session cookie that names no session, gets from the pages and routes that are. Nothing here signs in:
// every request is a read that ends at the session lookup, and none reaches a kitchen, a note or the audit log.
//
// The spellings are the L3-U2 obligation of the Lot 3 plan (§7.2, *L3-U2 notes carried from the L3-U1 reviews*). They
// are measured against the production build (`next start`), as `unmatched-addresses.e2e.spec.ts` is, and so run under
// CI only: under `next dev` the framework answers an unmatched address with its own development page.
import { expect, test, type APIRequestContext } from "@playwright/test";

import { ACCOUNT_PAGE_HEADERS } from "../../src/lib/security-headers";
import {
  mintSessionValue,
  SESSION_COOKIE_NAME,
  sessionCookieOf,
} from "./support/staff-session";

const RUN_UNDER_CI =
  "It reads the production build the first server makes under CI. Run it with: " +
  "CI=1 pnpm --filter @lemnaria/web exec playwright test tests/e2e/staff-gates.e2e.spec.ts --project=mobile";

const UNCLAIMED_ADDRESS = "/ro/zz";
const A_KITCHEN_ID = "e2e-not-a-kitchen";
const A_WELL_FORMED_DESIGN_ID = "abcdefghijklmnopqrstu";
const ROBOTS_HEADER = "x-robots-tag";
const CACHE_HEADER = "cache-control";
const ACCOUNT_CACHE_CONTROL = ACCOUNT_PAGE_HEADERS.find(
  ({ key }) => key.toLowerCase() === CACHE_HEADER,
)?.value;
const SESSION_EXPIRED_REASON = "reason=session-expired";

const NOT_STAFF_PAGES: readonly string[] = [
  "/ro/st%61ff/kitchens",
  "/ro/%73taff/kitchens",
  "/ro/staff/%6Bitchens",
  "/ro/staff/kitchens%2F",
  "/ro/staff%2Fkitchens",
  "/ro/staff/KITCHENS",
  "/ro/Staff/kitchens",
  "/ro/STAFF/audit",
  "/ro/staff/Audit",
  "/ro/staff/%61udit",
  "/%72o/staff/kitchens",
  "/RO/staff/kitchens",
  "/staff/kitchens",
  "/ro/staff/kitchens/x/y",
  "/ro/staff",
  "/ro/staff/nope",
];

const STAFF_PAGES: readonly string[] = [
  "/ro/staff/kitchens",
  "/ru/staff/kitchens",
  "/ro/staff/audit",
  "/ru/staff/audit",
  `/ro/staff/kitchens/${A_KITCHEN_ID}`,
];

const STAFF_ROUTES_THAT_NEED_A_SESSION: readonly string[] = [
  "/api/staff/kitchens",
  `/api/staff/kitchens/${A_WELL_FORMED_DESIGN_ID}`,
  "/api/staff/audit",
];

interface Answer {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

test.describe("an address that is not a staff page", () => {
  test.skip(process.env.CI === undefined, RUN_UNDER_CI);

  test("the control: an address no route owns is a 404 that carries no account-page header", async ({
    request,
  }) => {
    const answer = await answerOf(request, UNCLAIMED_ADDRESS);

    expect(answer.status).toBe(404);
    expect(answer.headers[ROBOTS_HEADER]).toBeUndefined();
  });

  test("the control: a staff page carries every account-page header, so the 404s below are told apart by them", async ({
    request,
  }) => {
    const answer = await answerOf(request, "/ro/staff/kitchens");

    for (const { key, value } of ACCOUNT_PAGE_HEADERS) {
      expect(answer.headers[key.toLowerCase()], key).toBe(value);
    }
  });

  for (const address of NOT_STAFF_PAGES) {
    test(`${address}: the framework's own 404, with the headers of any other 404 and no staff page`, async ({
      request,
    }) => {
      const answer = await answerOf(request, address);

      expect(answer.status).toBe(404);
      expect(answer.headers[ROBOTS_HEADER], "an account-page header").toBe(
        undefined,
      );
      expect(
        answer.headers[CACHE_HEADER],
        "the account pages' cache rule",
      ).not.toBe(ACCOUNT_CACHE_CONTROL);
      expect(answer.headers.location, "a redirect to the login").toBe(
        undefined,
      );
    });
  }
});

test.describe("a staff page asked by a visitor", () => {
  test.skip(process.env.CI === undefined, RUN_UNDER_CI);

  for (const address of STAFF_PAGES) {
    test(`${address}: a redirect to the plain login page, and the account-page headers`, async ({
      request,
    }) => {
      const answer = await answerOf(request, address);

      expect(answer.status).toBe(307);
      expect(loginAddressOf(answer)).toBe(
        `/${localeOf(address)}/account/login`,
      );
      for (const { key, value } of ACCOUNT_PAGE_HEADERS) {
        expect(answer.headers[key.toLowerCase()], key).toBe(value);
      }
    });
  }

  test("the browser ends on the login page, with no staff word on it", async ({
    page,
  }) => {
    await page.goto("/ro/staff/kitchens");

    await expect(page).toHaveURL(/\/ro\/account\/login$/);
    expect(await page.locator("body").innerText()).not.toMatch(
      /staff|personalului/i,
    );
  });
});

test.describe("a staff page asked with a cookie that names no session", () => {
  test.skip(process.env.CI === undefined, RUN_UNDER_CI);

  for (const address of STAFF_PAGES) {
    test(`${address}: a well-formed value the server never minted is sent on to the login page as an expired session`, async ({
      request,
    }) => {
      const answer = await answerOf(request, address, {
        cookie: `${SESSION_COOKIE_NAME}=${mintSessionValue()}`,
      });

      expect(answer.status).toBe(307);
      expect(loginAddressOf(answer)).toBe(
        `/${localeOf(address)}/account/login?${SESSION_EXPIRED_REASON}`,
      );
    });
  }

  test("a malformed value is read the same way", async ({ request }) => {
    const answer = await answerOf(request, "/ro/staff/kitchens", {
      cookie: `${SESSION_COOKIE_NAME}=short`,
    });

    expect(answer.status).toBe(307);
    expect(loginAddressOf(answer)).toBe(
      `/ro/account/login?${SESSION_EXPIRED_REASON}`,
    );
  });

  test("a browser holding the cookie as the server sets it sends it over this server's plain HTTP, and lands on the login page as an expired session", async ({
    context,
    page,
    baseURL,
  }) => {
    await context.addCookies([
      sessionCookieOf(mintSessionValue(), baseURL ?? ""),
    ]);

    await page.goto("/ro/staff/audit");

    await expect(page).toHaveURL(
      new RegExp(`/ro/account/login\\?${SESSION_EXPIRED_REASON}$`),
    );
  });
});

test.describe("a staff route asked without a session", () => {
  test.skip(process.env.CI === undefined, RUN_UNDER_CI);

  for (const address of STAFF_ROUTES_THAT_NEED_A_SESSION) {
    test(`${address}: 401 to a visitor and to a cookie that names no session`, async ({
      request,
    }) => {
      const visitor = await answerOf(request, address);
      const forged = await answerOf(request, address, {
        cookie: `${SESSION_COOKIE_NAME}=${mintSessionValue()}`,
      });

      expect(visitor.status).toBe(401);
      expect(forged.status).toBe(401);
      expect(visitor.body).not.toMatch(/"(kitchens|events|document)"/);
    });
  }
});

function localeOf(address: string): string {
  return address.split("/")[1] ?? "";
}

function loginAddressOf(answer: Answer): string {
  const location = answer.headers.location ?? "";
  const target = new URL(location, "http://origin.invalid");
  return `${target.pathname}${target.search}`;
}

async function answerOf(
  request: APIRequestContext,
  path: string,
  { cookie }: { cookie?: string } = {},
): Promise<Answer> {
  const response = await request.fetch(path, {
    maxRedirects: 0,
    failOnStatusCode: false,
    headers: cookie === undefined ? {} : { cookie },
  });
  return {
    status: response.status(),
    headers: response.headers(),
    body: await response.text(),
  };
}
