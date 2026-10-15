// Wave 8L review fix M1: the contact form posts. Until its script is running, a form that is submitted is the
// browser's own, and a form with no method is a GET, which writes everything typed into the address and so into the
// history, the server's logs and every referrer. THIS FILE HOLDS ONLY ON THE PRODUCTION SERVER (`CI=1`): the scripts are
// blocked by their build addresses, which `next dev` does not serve the same way. Run it with:
// CI=1 pnpm exec playwright test tests/e2e/qa-8l-contact-no-js.adversarial.e2e.spec.ts --project=mobile
//
// With every script chunk refused, the callback form is typed into and submitted by Enter and by a tap on its button;
// the address has no query string afterwards, no typed value is in any request's address or in the page's, and a POST
// to the page itself was made (so the form did submit). With scripts allowed nothing is submitted by the browser at
// all. The assertion is made to fail on the same page with its `method` removed by the route, so it is known to see a
// leak. Only the address and the requests' addresses are read: what the server answers to the POST is not the claim.
import { expect, test, type Page, type Request } from "@playwright/test";

import { callbackPath, field, newToken } from "./support/contact-page";
import { newPhone } from "./support/contact-run";

const SCRIPT_CHUNKS = "**/_next/static/**/*.js";
const RUN_UNDER_CI =
  "It blocks the production build's script chunks. Run it with: " +
  "CI=1 pnpm exec playwright test tests/e2e/qa-8l-contact-no-js.adversarial.e2e.spec.ts --project=mobile";

test.skip(process.env.CI === undefined, RUN_UNDER_CI);

interface Typed {
  readonly name: string;
  readonly phone: string;
  readonly locality: string;
}

function tokensTyped(): Typed {
  return {
    name: `Tok${newToken()}`,
    phone: newPhone(),
    locality: `Loc${newToken()}`,
  };
}

interface Seen {
  readonly urls: string[];
  readonly navigations: string[];
  readonly posts: string[];
}

function watch(page: Page): Seen {
  const seen: Seen = { urls: [], navigations: [], posts: [] };
  page.on("request", (request: Request) => {
    seen.urls.push(request.url());
    if (request.method() === "POST") seen.posts.push(request.url());
  });
  page.on("framenavigated", (frame) => {
    seen.navigations.push(frame.url());
  });
  return seen;
}

async function typeInto(page: Page, typed: Typed): Promise<void> {
  await field(page, "name").fill(typed.name);
  await field(page, "phone").fill(typed.phone);
  await field(page, "locality").fill(typed.locality);
}

function expectNoValueIn(places: readonly string[], typed: Typed): void {
  const values: readonly string[] = [typed.name, typed.phone, typed.locality];
  for (const value of values) {
    for (const place of places) {
      expect(place, `a value typed is in ${place}`).not.toContain(value);
      expect(place.toLowerCase()).not.toContain(
        encodeURIComponent(value).toLowerCase(),
      );
    }
  }
}

async function submitBy(page: Page, how: "enter" | "tap"): Promise<void> {
  const navigated = page.waitForEvent("framenavigated", { timeout: 15_000 });
  if (how === "enter") await field(page, "phone").press("Enter");
  else await page.locator('form button[type="submit"]').tap();
  await navigated;
  await page.waitForLoadState("load");
}

async function withNoScripts(page: Page): Promise<void> {
  await page.route(SCRIPT_CHUNKS, (route) => route.abort());
}

for (const submission of ["enter", "tap"] as const) {
  test(`with no script running, ${submission === "enter" ? "Enter in the phone field" : "a tap on the button"} submits by POST to the page and writes nothing typed into any address`, async ({
    page,
  }) => {
    const seen = watch(page);
    const typed = tokensTyped();
    await withNoScripts(page);
    await page.goto(callbackPath("ro"));
    await expect(page.locator('form[method="post"]')).toHaveCount(1);
    await typeInto(page, typed);
    const pageUrl = page.url();

    await submitBy(page, submission);

    expect(seen.posts, "the form was submitted by the browser").toContain(
      pageUrl,
    );
    expect(page.url()).not.toContain("?");
    expect(new URL(page.url()).search).toBe("");
    expectNoValueIn([...seen.urls, ...seen.navigations, page.url()], typed);
    expect(
      seen.navigations.filter((url) => url.includes("?")),
      "an address with a query string was visited",
    ).toEqual([]);
  });
}

test("the same two submissions, with the form's method taken off by the route, DO write what was typed into the address: the check can fail", async ({
  page,
}) => {
  const typed = tokensTyped();
  await withNoScripts(page);
  let rewritten = 0;
  await page.route(`**${callbackPath("ro")}`, async (route) => {
    if (route.request().resourceType() !== "document") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const html = await response.text();
    rewritten += html.includes('method="post"') ? 1 : 0;
    await route.fulfill({
      response,
      body: html.replace(' method="post"', ""),
    });
  });
  await page.goto(callbackPath("ro"));
  await typeInto(page, typed);

  await submitBy(page, "enter");

  expect(rewritten, "the page had a method to take off").toBeGreaterThan(0);
  expect(page.url()).toContain("?");
  expect(page.url()).toContain(encodeURIComponent(typed.name));
});

test("positive control: with scripts allowed, Enter in the phone field submits nothing to the browser, the address stays, and the form says what is missing", async ({
  page,
}) => {
  const seen = watch(page);
  const typed = tokensTyped();
  await page.goto(callbackPath("ro"));
  await expect(page.getByTestId("contact-cta")).toBeVisible();
  await typeInto(page, typed);
  const pageUrl = page.url();
  const postsBefore = seen.posts.length;
  const navigationsBefore = seen.navigations.length;

  await field(page, "phone").press("Enter");

  await expect(
    page.getByTestId("contact-consent").getByRole("alert"),
  ).toBeVisible();
  await page.waitForTimeout(1000);
  expect(page.url()).toBe(pageUrl);
  expect(seen.posts.length).toBe(postsBefore);
  expect(seen.navigations.length).toBe(navigationsBefore);
  expectNoValueIn([...seen.urls, page.url()], typed);
});
