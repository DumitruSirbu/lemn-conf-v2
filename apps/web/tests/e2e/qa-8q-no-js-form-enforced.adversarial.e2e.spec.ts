// Wave 8Q criterion 11 (ADR 0159 d8), QA's: the callback form submitted with the page's scripts not running, under the
// live policy. `form-action 'self'` admits the page's own `POST`: no violation of either disposition is seen by any of the
// three observers, no report is sent, and the document the POST answers is the callback page again, with no value typed
// in any address. Scripts are not run by refusing every build chunk (the convention of `qa-8l-contact-no-js`); the
// init-script observer still runs, so the event observer is live while the page's own code is not.
//
// Control that can fail the claim: the same page rewritten so that its form posts to ANOTHER origin is a `form-action`
// violation, seen by the same observers, and under enforcement the POST never leaves for that origin.
// THIS FILE IS A `CI=1` SPEC. Run it with:
//   CI=1 pnpm exec playwright test tests/e2e/qa-8q-no-js-form-enforced.adversarial.e2e.spec.ts --project=mobile
// Writes: none. The POST goes to the callback PAGE with consent unticked, so it is refused by the page's own rules and
// no contact request is sent or stored. Reports are answered by `page.route`, so the suite's server counts none.
import { expect, test, type Page } from "@playwright/test";

import { callbackPath, field, newToken } from "./support/contact-page";
import { newPhone } from "./support/contact-run";
import {
  NO_VIOLATIONS,
  violationsSeen,
  watchForViolations,
} from "./support/csp-violations";
import {
  captureReports,
  dispositionOfTheLiveMode,
  isEnforcing,
  serveForeignScript,
} from "./support/qa-8q-injection";

const SCRIPT_CHUNKS = "**/_next/static/**/*.js";
const FOREIGN_ACTION = "https://qa8q-foreign.example/collect";
const RUN_UNDER_CI =
  "It blocks the production build's script chunks. Run it with: " +
  "CI=1 pnpm exec playwright test tests/e2e/qa-8q-no-js-form-enforced.adversarial.e2e.spec.ts --project=mobile";

test.skip(process.env.CI === undefined, RUN_UNDER_CI);

test("in both languages, with no script running, Enter in the form POSTs to its own page under the live policy with no violation", async ({
  page,
}) => {
  const net = await watchForViolations(page);
  const reports = await captureReports(page);
  await withNoScripts(page);

  for (const locale of ["ro", "ru"] as const) {
    await test.step(locale, async () => {
      await page.goto(callbackPath(locale));
      await expect(page.locator('form[method="post"]')).toHaveCount(1);
      await typeTheForm(page);
      const pageUrl = page.url();

      const posted = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" && response.url() === pageUrl,
      );
      await field(page, "phone").press("Enter");
      const answer = await posted;
      await page.waitForLoadState("load");
      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(answer.status(), "answers as it did before the flip").toBe(200);
      expect(answer.headers()["content-type"]).toContain("text/html");
      expect(page.url()).toBe(pageUrl);
      expect(await page.locator('form[method="post"]').count()).toBe(1);
    });
  }

  expect(violationsSeen(net)).toEqual(NO_VIOLATIONS);
  expect(reports).toEqual([]);
});

test("control: a form that posts to another origin is a form-action violation, and under enforcement it never leaves", async ({
  page,
}) => {
  const net = await watchForViolations(page);
  const reports = await captureReports(page);
  const foreign = await serveForeignScript(page);
  await withNoScripts(page);
  await page.route(`**${callbackPath("ro")}`, async (route) => {
    if (route.request().resourceType() !== "document") {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    const html = await response.text();
    const headers = { ...response.headers() };
    delete headers["content-encoding"];
    delete headers["content-length"];
    await route.fulfill({
      response,
      headers,
      body: html.replace(/<form\b/, `<form action="${FOREIGN_ACTION}"`),
    });
  });
  await page.goto(callbackPath("ro"));
  await expect(page.locator(`form[action="${FOREIGN_ACTION}"]`)).toHaveCount(1);
  await typeTheForm(page);
  const pageUrl = page.url();

  // A blocked submission is a navigation that never commits: Playwright would wait on it for the whole test.
  await field(page, "phone").press("Enter", { noWaitAfter: true });

  await expect
    .poll(() => violationsSeen(net).events.length, {
      message: "form-action events",
    })
    .toBeGreaterThan(0);
  expect(violationsSeen(net).events[0]).toMatchObject({
    directive: "form-action",
    disposition: dispositionOfTheLiveMode(),
  });
  await expect.poll(() => reports.length).toBeGreaterThan(0);
  expect(reports[0]?.report["effective-directive"]).toBe("form-action");
  if (isEnforcing()) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(page.url(), "the POST never left the page").toBe(pageUrl);
    expect(foreign.requests, "nothing reached the other origin").toEqual([]);
  }
});

function tokensTyped(): { name: string; phone: string; locality: string } {
  return {
    name: `Tok${newToken()}`,
    phone: newPhone(),
    locality: `Loc${newToken()}`,
  };
}

async function typeTheForm(page: Page) {
  const typed = tokensTyped();
  await field(page, "name").fill(typed.name);
  await field(page, "phone").fill(typed.phone);
  await field(page, "locality").fill(typed.locality);
  return typed;
}

async function withNoScripts(page: Page): Promise<void> {
  await page.route(SCRIPT_CHUNKS, (route) => route.abort());
}
