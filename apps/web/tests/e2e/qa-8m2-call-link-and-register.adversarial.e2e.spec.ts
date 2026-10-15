// Wave 8M2 criteria 16, 17, 19 and 21 on rendered pages, in both locales and by touch: 5B draws the one call link in both
// of its classes on the design page and on the callback page; the 8L sentences and the callback form's in-place sent view
// draw none; every sentence these pages put on screen is in the informal register; and each pinned size holds in
// Russian. Every contact answer is made by `page.route`, so no request reaches the server, no row is stored and no bucket
// of the suite's one shared block is spent (the any-kind twin stays where the last whole run left it).
import { expect, type Locator, type Page } from "@playwright/test";

import {
  ANSWERS,
  CALLBACK_SENT,
  CTA,
  FAILURE,
  MESSAGES,
  NETWORK_FAILURE,
  OUTCOME,
  RETRY,
  answerContactInOrder,
  callbackPath,
  contactDocumentPath,
  expectFormDrawn,
  fillTheWholeForm,
  newToken,
  pressTheCallToAction,
  recordContactRequests,
  waitForTheLeastFormTime,
} from "./support/contact-page";
import { test } from "./support/seeded-design";
import { shopTelAddress } from "../../src/shop/shop-phone";

const RUN_UNDER_CI =
  "It counts requests on the production server. Run it with: " +
  "CI=1 pnpm exec playwright test tests/e2e/qa-8m2-call-link-and-register.adversarial.e2e.spec.ts --project=mobile";

test.beforeEach(() => {
  test.skip(process.env.CI === undefined, RUN_UNDER_CI);
});

const LOCALES = ["ro", "ru"] as const;
type Locale = (typeof LOCALES)[number];
const LIMITED_DAYS = [
  {
    name: "today",
    now: "2026-10-12T12:00:00+03:00",
    retryAfter: "6",
    isTomorrow: false,
  },
  {
    name: "tomorrow",
    now: "2026-10-12T00:00:00+03:00",
    retryAfter: "86399",
    isTomorrow: true,
  },
] as const;
/** The answers 8L draws beside the form, none of them 5B: each keeps its own place and action (criterion 16). */
const OTHER_8L_CLASSES = [
  { name: "invalid phone (400)", answer: ANSWERS.invalidPhone },
  { name: "conflict (409)", answer: ANSWERS.conflict },
  { name: "design not current (409)", answer: ANSWERS.designNotCurrent },
  { name: "does not fit (422)", answer: ANSWERS.doesNotFit },
] as const;
const PHONE_WIDTH = 390;
const LEAST_TOUCH_TARGET = 44;

/** Whole formal words, lower-cased: the register test's own idea, applied to what a page shows rather than to the
 *  catalogue. The customer's own typed values are not on these pages' sentences, only on the form, which is not read. */
/* eslint-disable no-restricted-syntax -- The scan names the formal words it forbids; no catalogue leaf can supply a word the catalogue must not hold. */
const FORMAL_WORDS: Readonly<Record<Locale, readonly string[]>> = {
  ro: ["dumneavoastră", "vă", "ați", "reveniți", "încercați", "configurați"],
  ru: ["вы", "вас", "вам", "ваш", "ваше", "ваши", "попробуйте", "скопируйте"],
};
/* eslint-enable no-restricted-syntax */

function formalWordsIn(text: string, locale: Locale): string[] {
  const forbidden = new Set(FORMAL_WORDS[locale]);
  return text
    .toLocaleLowerCase(locale)
    .split(/[^\p{L}\p{M}]+/u)
    .filter((word) => forbidden.has(word));
}

async function expectInformalRegister(
  page: Page,
  locale: Locale,
  where: string,
): Promise<void> {
  const shown = await page.locator("main").innerText();
  expect(shown.length, `${where}: something is on screen`).toBeGreaterThan(20);
  expect(formalWordsIn(shown, locale), `${where}: formal words`).toEqual([]);
}

async function expectTouchTarget(target: Locator, label: string) {
  const box = await target.boundingBox();
  expect(box, `${label}: drawn`).not.toBeNull();
  expect(box?.height ?? 0, `${label}: height`).toBeGreaterThanOrEqual(
    LEAST_TOUCH_TARGET,
  );
  expect(box?.width ?? 0, `${label}: width`).toBeGreaterThanOrEqual(
    LEAST_TOUCH_TARGET,
  );
  expect(
    (box?.x ?? 0) + (box?.width ?? 0),
    `${label}: right edge`,
  ).toBeLessThanOrEqual(PHONE_WIDTH);
}

async function expectTheCallLink(page: Page, locale: Locale, where: string) {
  const link = page.getByTestId("call-shop-link");
  await expect(link, where).toHaveCount(1);
  await expect(page.locator('a[href^="tel:"]'), where).toHaveCount(1);
  await expect(link, where).toHaveAttribute("href", shopTelAddress());
  await expect(link, where).toContainText(
    MESSAGES[locale].submissionResult.callShop,
  );
  await expectTouchTarget(link, `${where}: the call link`);
  const retry = await page.getByTestId(RETRY).boundingBox();
  const call = await link.boundingBox();
  expect(call?.y ?? 0, `${where}: under the retry`).toBeGreaterThanOrEqual(
    (retry?.y ?? 0) + (retry?.height ?? 0) - 1,
  );
}

async function fillAndOpen(page: Page, path: string): Promise<number> {
  await page.goto(path);
  const drawnAtMs = await expectFormDrawn(page);
  await fillTheWholeForm(page, {
    name: `Nm${newToken()}`,
    phone: `06${String(Math.floor(1_000_000 + Math.random() * 8_999_999))}`,
    locality: "Chisinau",
  });
  await waitForTheLeastFormTime(drawnAtMs);
  return drawnAtMs;
}

for (const locale of LOCALES) {
  const outcomes = MESSAGES[locale].contact.outcomes;

  test(`${locale}: 5B on the design page draws the one call link in both classes, the call link survives the retry's sending state, and the screen speaks informally`, async ({
    page,
    seededDesign,
  }) => {
    const sent = recordContactRequests(page);
    await fillAndOpen(page, contactDocumentPath(locale, seededDesign.id));
    await answerContactInOrder(page, [NETWORK_FAILURE, ANSWERS.unavailable]);

    await pressTheCallToAction(page);
    await expect(page.getByTestId(FAILURE)).toHaveAttribute(
      "data-screen",
      "lost-connection",
    );
    await expectTheCallLink(page, locale, `${locale} design, lost connection`);
    await expectInformalRegister(
      page,
      locale,
      `${locale} design, lost connection`,
    );

    await page.getByTestId(RETRY).tap();
    await expect(page.getByTestId(FAILURE)).toHaveAttribute(
      "data-screen",
      "not-sent",
    );
    await expectTheCallLink(page, locale, `${locale} design, not sent`);
    await expectInformalRegister(page, locale, `${locale} design, not sent`);
    expect(sent, "the first press and the retry").toHaveLength(2);

    // Pressing the link leaves the page where it was and sends nothing.
    const before = page.url();
    await page.getByTestId("call-shop-link").tap();
    await page.waitForTimeout(800);
    expect(page.url()).toBe(before);
    await expect(page.getByTestId(FAILURE)).toBeVisible();
    expect(sent, "the call link sent nothing").toHaveLength(2);
  });

  test(`${locale}: 5B on the callback page draws the one call link in both classes, and the in-place sent view that follows draws none`, async ({
    page,
  }) => {
    const sent = recordContactRequests(page);
    await fillAndOpen(page, callbackPath(locale));
    await answerContactInOrder(page, [
      NETWORK_FAILURE,
      ANSWERS.unavailable,
      ANSWERS.sent("LMN-CB-0002"),
    ]);

    await pressTheCallToAction(page);
    await expect(page.getByTestId(FAILURE)).toHaveAttribute(
      "data-screen",
      "lost-connection",
    );
    await expectTheCallLink(
      page,
      locale,
      `${locale} callback, lost connection`,
    );
    await expectInformalRegister(
      page,
      locale,
      `${locale} callback, lost connection`,
    );

    await page.getByTestId(RETRY).tap();
    await expect(page.getByTestId(FAILURE)).toHaveAttribute(
      "data-screen",
      "not-sent",
    );
    await expectTheCallLink(page, locale, `${locale} callback, not sent`);
    await expectInformalRegister(page, locale, `${locale} callback, not sent`);

    await page.getByTestId(RETRY).tap();
    await expect(page.getByTestId(CALLBACK_SENT)).toBeVisible();
    await expect(page.getByTestId("call-shop-link")).toHaveCount(0);
    await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
    await expectInformalRegister(
      page,
      locale,
      `${locale} callback, sent in place`,
    );
    expect(sent).toHaveLength(3);
  });

  for (const refusal of OTHER_8L_CLASSES) {
    test(`${locale}: 8L's class ${refusal.name} draws no call link and no 5B, and speaks informally`, async ({
      page,
      seededDesign,
    }) => {
      const sent = recordContactRequests(page);
      await fillAndOpen(page, contactDocumentPath(locale, seededDesign.id));
      await answerContactInOrder(page, [refusal.answer]);
      await pressTheCallToAction(page);
      await expect.poll(() => sent.length).toBe(1);
      await expect(page.getByTestId(CTA)).toBeVisible();
      await page.waitForTimeout(800);
      await expect(page.getByTestId("call-shop-link")).toHaveCount(0);
      await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
      await expect(page.getByTestId(FAILURE)).toHaveCount(0);
      await expectInformalRegister(page, locale, `${locale} ${refusal.name}`);
      expect(sent, "the refusal was not sent again").toHaveLength(1);
    });
  }

  for (const day of LIMITED_DAYS) {
    test(`${locale}: 8L's sentence for a retry ${day.name} draws no call link and no 5B, and speaks informally`, async ({
      page,
      seededDesign,
    }) => {
      await page.clock.setFixedTime(new Date(day.now));
      await fillAndOpen(page, contactDocumentPath(locale, seededDesign.id));
      await answerContactInOrder(page, [ANSWERS.limited(day.retryAfter)]);
      await pressTheCallToAction(page);
      await expect(page.getByTestId(OUTCOME)).toHaveAttribute(
        "data-outcome",
        "limited",
      );
      const template = day.isTomorrow
        ? outcomes.limitedTomorrow
        : outcomes.limited;
      await expect(page.getByTestId(OUTCOME)).toContainText(
        template.split("{time}")[0]?.trim() ?? "",
      );
      await expect(page.getByTestId("call-shop-link")).toHaveCount(0);
      await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
      await expect(page.getByTestId(FAILURE)).toHaveCount(0);
      await expectInformalRegister(
        page,
        locale,
        `${locale} limited ${day.name}`,
      );
    });
  }
}
