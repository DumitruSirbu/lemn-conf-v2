// Wave 8M criteria 7 and 13 and ADR 0148 A4's tripwire, measured at 390 x 844 by touch in Romanian and Russian: how tall
// 5A's pinned region is in each state of the WhatsApp action (the tripwire is half the viewport, 422 px), whether the last
// block scrolls clear of it, whether the page is ever wider than the phone, and whether every control is at least 44 x
// 44 px. 5B has no pinned region (its retry stands in the flow, under the sentence), so what is measured there is that the
// retry is on the first screen and that no state overflows. Every figure is logged (`QA8M`) so the report quotes what was
// measured; the assertions are the limits. The screens are captured where `QA_EVIDENCE_DIR` says. Nothing is stored: the
// contact answers are made by `page.route`, and the share link is the design's own, removed with the design.
import { expect, type Locator, type Page } from "@playwright/test";

import {
  ANSWERS,
  CTA,
  DONE_REFERENCE,
  FAILURE,
  NETWORK_FAILURE,
  answerContactInOrder,
  contactDocumentPath,
  donePath,
  expectFormDrawn,
  fillTheWholeForm,
  newToken,
  pressTheCallToAction,
  waitForTheLeastFormTime,
} from "./support/contact-page";
import { captureEvidence } from "./support/qa-8d-review";
import { reachDoneByAMockedSend } from "./support/qa-8m";
import { test } from "./support/seeded-design";

const PHONE = { width: 390, height: 844 } as const;
const HALF_THE_VIEWPORT = PHONE.height / 2;
const LEAST_TOUCH_TARGET = 44;
const LOCALES = ["ro", "ru"] as const;

interface Box {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly width: number;
  readonly height: number;
}

async function boxOf(target: Locator): Promise<Box> {
  return target.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      width: rect.width,
      height: rect.height,
    };
  });
}

async function expectNoSideways(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    overflow.scrollWidth,
    `${label}: the page's width`,
  ).toBeLessThanOrEqual(overflow.clientWidth);
}

/** Criterion 16's geometry: the call link is a touch target at least 44 px each way, no wider than the phone, and under
 *  the retry, so the retry's own place on the first screen is not taken by it. */
async function expectCallLinkBeneath(
  page: Page,
  retryBox: Box,
  label: string,
): Promise<void> {
  const link = page.getByTestId("call-shop-link");
  await expectTouchTarget(link, `${label} call link`);
  const box = await boxOf(link);
  expect(box.left, `${label}: call link left`).toBeGreaterThanOrEqual(0);
  expect(box.right, `${label}: call link right`).toBeLessThanOrEqual(
    PHONE.width,
  );
  expect(box.top, `${label}: call link under the retry`).toBeGreaterThanOrEqual(
    retryBox.bottom - 1,
  );
}

async function expectTouchTarget(
  target: Locator,
  label: string,
): Promise<void> {
  const box = await boxOf(target);
  console.log(
    `QA8M touch ${label}: ${String(Math.round(box.width))} x ${String(Math.round(box.height))} px`,
  );
  expect
    .soft(box.height, `${label}: height`)
    .toBeGreaterThanOrEqual(LEAST_TOUCH_TARGET);
  expect
    .soft(box.width, `${label}: width`)
    .toBeGreaterThanOrEqual(LEAST_TOUCH_TARGET);
}

async function expectRegionWithinTheTripwire(
  page: Page,
  label: string,
): Promise<Box> {
  const region = await boxOf(page.getByTestId("done-bottom"));
  console.log(
    `QA8M region ${label}: ${String(Math.round(region.height))} px tall, ${String(Math.round(region.top))} to ${String(Math.round(region.bottom))} of ${String(PHONE.height)}`,
  );
  expect(region.height, `${label}: the region's height`).toBeLessThanOrEqual(
    HALF_THE_VIEWPORT,
  );
  expect(
    region.bottom,
    `${label}: the region ends on the screen`,
  ).toBeLessThanOrEqual(PHONE.height);
  return region;
}

/** At the page's end, the last block above the region ends above the region's top edge. */
async function expectLastBlockClearOfTheRegion(
  page: Page,
  label: string,
): Promise<void> {
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await page.waitForTimeout(300);
  const region = await boxOf(page.getByTestId("done-bottom"));
  const lastBlock = await boxOf(page.getByTestId("done-picture"));
  console.log(
    `QA8M clearance ${label}: the picture ends ${String(Math.round(region.top - lastBlock.bottom))} px above the region`,
  );
  expect(lastBlock.bottom, `${label}: the last block`).toBeLessThanOrEqual(
    region.top,
  );
}

async function expectFocusClearOfTheRegion(
  page: Page,
  label: string,
): Promise<void> {
  const region = await boxOf(page.getByTestId("done-bottom"));
  const focused = await page.evaluate(() => {
    const active = document.activeElement;
    if (active === null || active === document.body) return undefined;
    const rect = active.getBoundingClientRect();
    return {
      testId: (active as HTMLElement).dataset.testid ?? active.tagName,
      bottom: rect.bottom,
      insideRegion: active.closest('[data-testid="done-bottom"]') !== null,
    };
  });
  if (focused === undefined || focused.insideRegion) return;
  expect(
    focused.bottom,
    `${label}: ${focused.testId} is not under the region`,
  ).toBeLessThanOrEqual(region.top);
}

for (const locale of LOCALES) {
  test(`${locale}: 5A at 390 x 844, in every state of the WhatsApp action: the pinned region stays under half the screen, the last block scrolls clear of it, the page is never wider than the phone, and every control is at least 44 x 44`, async ({
    page,
    seededDesign,
  }) => {
    await page.setViewportSize(PHONE);
    await reachDoneByAMockedSend(page, seededDesign, locale, "LMN-GEO-0001");
    await expectNoSideways(page, "5A arrived");
    await expectRegionWithinTheTripwire(page, "5A, the action at rest");
    await expectLastBlockClearOfTheRegion(page, "5A");
    await captureEvidence(page, `8m-5A-${locale}-arrived`, { fullPage: false });
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });

    await expectTouchTarget(page.getByTestId("done-copy"), `${locale} copy`);
    await expectTouchTarget(
      page.getByTestId("done-whatsapp-send"),
      `${locale} the WhatsApp button`,
    );
    await expectTouchTarget(
      page.getByTestId("done-back-to-design"),
      `${locale} back to the design`,
    );
    // The language menu is 25 px high on every screen that has one: backlog 192, recorded 2026-10-12 and the human's at
    // the hand check. Measured so that the report quotes it; not asserted, since it is not this wave's to change.
    const localeMenu = await boxOf(page.getByTestId("top-bar-locale"));
    console.log(
      `QA8M touch ${locale} the language menu (backlog 192): ${String(Math.round(localeMenu.width))} x ${String(Math.round(localeMenu.height))} px`,
    );

    // A link already active, so that the warning is drawn: the tallest the region gets.
    await page.evaluate(async (designId) => {
      await fetch(`/api/designs/${designId}/share`, {
        method: "POST",
        credentials: "same-origin",
      });
    }, seededDesign.id);
    await page.getByTestId("done-whatsapp-send").tap();
    await expect(
      page.getByTestId("done-whatsapp-reissue-warning"),
    ).toBeVisible();
    await expectRegionWithinTheTripwire(page, "5A, the warning");
    await expectFocusClearOfTheRegion(page, "the warning");
    await expectNoSideways(page, "5A warning");
    await captureEvidence(page, `8m-5A-${locale}-warning`);
    await expectTouchTarget(
      page.getByTestId("done-whatsapp-go-on"),
      `${locale} go on`,
    );

    await page.getByTestId("done-whatsapp-go-on").tap();
    await expect(page.getByTestId("done-whatsapp-open")).toBeVisible();
    await expectRegionWithinTheTripwire(page, "5A, the link");
    await expectNoSideways(page, "5A link");
    await captureEvidence(page, `8m-5A-${locale}-link`);
    await expectTouchTarget(
      page.getByTestId("done-whatsapp-open"),
      `${locale} the external link`,
    );
  });

  test(`${locale}: 5A's share failure is within the tripwire too`, async ({
    page,
    seededDesign,
  }) => {
    await page.setViewportSize(PHONE);
    await reachDoneByAMockedSend(page, seededDesign, locale, "LMN-GEO-0002");
    await page.route(
      `**/api/designs/${seededDesign.id}/share`,
      async (route) => {
        await route.fulfill({ status: 500, body: "{}" });
      },
    );

    await page.getByTestId("done-whatsapp-send").tap();

    await expect(page.getByTestId("done-whatsapp-error")).toBeVisible();
    await expectRegionWithinTheTripwire(page, "5A, the share error");
    await expectNoSideways(page, "5A share error");
    await captureEvidence(page, `8m-5A-${locale}-share-error`);
    await expectTouchTarget(
      page.getByTestId("done-whatsapp-retry"),
      `${locale} the share retry`,
    );
  });

  test(`${locale}: a reference of ten thousand characters, with and without a break to wrap at, wraps inside the column, and the copy control and the region stay on the screen`, async ({
    page,
    seededDesign,
  }) => {
    await page.setViewportSize(PHONE);
    await reachDoneByAMockedSend(
      page,
      seededDesign,
      locale,
      "ABCDEFGHIJ".repeat(1000),
    );
    await expectNoSideways(page, "an unbroken reference");
    const reference = await boxOf(page.getByTestId(DONE_REFERENCE));
    expect(reference.right, "the reference's right edge").toBeLessThanOrEqual(
      PHONE.width,
    );
    expect(reference.left).toBeGreaterThanOrEqual(0);
    await expectRegionWithinTheTripwire(
      page,
      "a ten-thousand-character reference",
    );
    const copy = await boxOf(page.getByTestId("done-copy"));
    expect(copy.right).toBeLessThanOrEqual(PHONE.width);
    expect(copy.left).toBeGreaterThanOrEqual(0);
    await page.getByTestId("done-copy").scrollIntoViewIfNeeded();
    await captureEvidence(page, `8m-5A-${locale}-long-reference`);
  });

  test(`${locale}: 5B, in the lost-connection and not-sent states, online and offline, is no wider than the phone, its retry is on the first screen and at least 44 high, and the longest typed value stays inside the box`, async ({
    page,
    context,
    seededDesign,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto(contactDocumentPath(locale, seededDesign.id));
    const drawnAtMs = await expectFormDrawn(page);
    const longLocalPart = "a".repeat(64);
    const longAddress = `${longLocalPart}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(60)}`;
    await fillTheWholeForm(page, {
      name: `Nm${newToken()}`,
      phone: "069123456",
      locality: "Chisinau",
      email: longAddress,
    });
    await waitForTheLeastFormTime(drawnAtMs);
    await answerContactInOrder(page, [NETWORK_FAILURE, ANSWERS.unavailable]);

    await pressTheCallToAction(page);
    await expect(page.getByTestId(FAILURE)).toHaveAttribute(
      "data-screen",
      "lost-connection",
    );
    await expectNoSideways(page, "5B lost connection");
    await captureEvidence(page, `8m-5B-${locale}-lost-connection`);
    const retry = page.getByTestId("contact-retry");
    const retryBox = await boxOf(retry);
    console.log(
      `QA8M 5B ${locale} retry: top ${String(Math.round(retryBox.top))}, bottom ${String(Math.round(retryBox.bottom))}, ${String(Math.round(retryBox.width))} x ${String(Math.round(retryBox.height))}`,
    );
    expect(retryBox.top).toBeGreaterThanOrEqual(0);
    expect(
      retryBox.bottom,
      "the retry is on the first screen",
    ).toBeLessThanOrEqual(PHONE.height);
    await expectTouchTarget(retry, `${locale} 5B retry`);
    await expectCallLinkBeneath(page, retryBox, `${locale} 5B lost connection`);

    await context.setOffline(true);
    await expect(page.getByTestId("failure-waiting")).toBeVisible();
    await expectNoSideways(page, "5B offline");
    await captureEvidence(page, `8m-5B-${locale}-offline`);
    await context.setOffline(false);

    await retry.tap();
    await expect(page.getByTestId(FAILURE)).toHaveAttribute(
      "data-screen",
      "not-sent",
    );
    await expectNoSideways(page, "5B not sent");
    await expectCallLinkBeneath(
      page,
      await boxOf(retry),
      `${locale} 5B not sent`,
    );
    await captureEvidence(page, `8m-5B-${locale}-not-sent`);
  });

  test(`${locale}: the view of a design nothing was sent for draws no claim, its review link is at least 44 high, and the page is no wider than the phone`, async ({
    page,
    seededDesign,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto(donePath(locale, seededDesign.id));
    await expect(page.getByTestId("done-heading")).toBeVisible();
    await expect(page.getByTestId("done-heading")).toBeFocused();
    await expect(page.getByTestId(DONE_REFERENCE)).toHaveCount(0);
    await expect(page.getByTestId(CTA)).toHaveCount(0);
    await expect(page.getByTestId("done-bottom")).toHaveCount(0);
    await expectNoSideways(page, "no request");
    await expectTouchTarget(
      page.getByTestId("done-review-link"),
      `${locale} the review link`,
    );
    await captureEvidence(page, `8m-no-request-${locale}`);
  });
}
