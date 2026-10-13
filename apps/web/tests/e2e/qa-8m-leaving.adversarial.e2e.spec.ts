// Wave 8M, the moment between a send that was answered and the confirmation that replaces the contact page (8M.3, criterion
// 11), by touch, on the production server: the request is answered *sent* at once and the confirmation's own page takes
// a while to come (a slow phone, a busy server). What the customer sees in that while is the thing under test: a request
// that has gone, with nothing on the screen to say so, is the reverse of a false success, and a customer who sees an empty
// page presses Back. THIS FILE HOLDS ONLY ON THE PRODUCTION SERVER (`CI=1`). The contact answer is made by `page.route`;
// nothing is stored.
import { expect, type Page } from "@playwright/test";

import {
  ANSWERS,
  CTA,
  DONE_HEADING,
  DONE_REFERENCE,
  answerContactWith,
  donePath,
  fillTheWholeForm,
  newToken,
  pressTheCallToAction,
  waitForTheLeastFormTime,
} from "./support/contact-page";
import { newPhone } from "./support/contact-run";
import { captureEvidence } from "./support/qa-8d-review";
import { reachContactFromTheEditor } from "./support/qa-8m";
import { test } from "./support/seeded-design";

const RUN_UNDER_CI =
  "It runs against the production server. Run it with: " +
  "CI=1 pnpm exec playwright test tests/e2e/qa-8m-leaving.adversarial.e2e.spec.ts --project=mobile";

test.beforeEach(() => {
  test.skip(process.env.CI === undefined, RUN_UNDER_CI);
});

const THE_CONFIRMATION_IS_SLOW_MS = 4000;

/** What stands between the top bar and the foot of the page: its text, and how many elements that draw anything. */
async function whatTheBodyShows(page: Page): Promise<{
  readonly text: string;
  readonly drawnElements: number;
}> {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    const header = main?.querySelector("header");
    const rest = [...(main?.children ?? [])].filter(
      (child) => child !== header,
    );
    return {
      text: rest
        .map((child) => (child as HTMLElement).innerText)
        .join(" ")
        .trim(),
      drawnElements: rest.length,
    };
  });
}

test("ro: while the confirmation's page is on its way the contact page does not stand empty: the customer is told the request went, or that it is being sent", async ({
  page,
  seededDesign,
}) => {
  const { drawnAtMs } = await reachContactFromTheEditor(
    page,
    seededDesign,
    "ro",
  );
  await fillTheWholeForm(page, {
    name: `Nm${newToken()}`,
    phone: newPhone(),
    locality: "Chisinau",
  });
  await waitForTheLeastFormTime(drawnAtMs);
  await answerContactWith(page, ANSWERS.sent("LMN-LV-0001"));
  await page.route(`**/d/${seededDesign.id}/done**`, async (route) => {
    await new Promise((resolve) =>
      setTimeout(resolve, THE_CONFIRMATION_IS_SLOW_MS),
    );
    await route.continue();
  });

  await pressTheCallToAction(page);
  await expect(page.getByTestId(CTA)).toHaveCount(0);
  await page.waitForTimeout(1200);

  const whileWaiting = await whatTheBodyShows(page);
  await captureEvidence(page, "8m-leaving-ro-while-the-confirmation-comes");
  expect(
    whileWaiting.text,
    "the page between the send's answer and the confirmation",
  ).not.toBe("");

  await page.waitForURL(`**${donePath("ro", seededDesign.id)}`);
  await expect(page.getByTestId(DONE_HEADING)).toBeVisible();
  await expect(page.getByTestId(DONE_REFERENCE)).toHaveText("LMN-LV-0001");
});

test("ro: when the confirmation's page cannot be fetched at all, the customer who was told nothing but a send went is not left with an empty page and no way on", async ({
  page,
  seededDesign,
}) => {
  const { drawnAtMs } = await reachContactFromTheEditor(
    page,
    seededDesign,
    "ro",
  );
  await fillTheWholeForm(page, {
    name: `Nm${newToken()}`,
    phone: newPhone(),
    locality: "Chisinau",
  });
  await waitForTheLeastFormTime(drawnAtMs);
  await answerContactWith(page, ANSWERS.sent("LMN-LV-0002"));
  await page.route(`**/d/${seededDesign.id}/done**`, (route) =>
    route.abort("internetdisconnected"),
  );

  await pressTheCallToAction(page);
  await expect(page.getByTestId(CTA)).toHaveCount(0);
  await page.waitForTimeout(3000);

  await captureEvidence(page, "8m-leaving-ro-confirmation-unreachable");
  const url = page.url();
  const shown = await whatTheBodyShows(page).catch(() => ({
    text: "",
    drawnElements: 0,
  }));
  console.log(
    `QA8M leaving, the confirmation unreachable: url ${url}, body text ${JSON.stringify(shown.text)}`,
  );
  // Either the browser's own error page replaced it (no `main`), or the contact page stands: and then it says something.
  const isOurPage = await page.locator("main").count();
  if (isOurPage > 0) expect(shown.text).not.toBe("");
});
