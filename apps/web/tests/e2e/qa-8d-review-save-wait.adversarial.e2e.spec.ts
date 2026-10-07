// The review and the save, at 390 x 844 by touch: an offer may be asked for only the design the server holds. The
// save request is held or refused in the browser, so each state lasts long enough to be read.
//
// **Must not run concurrently with any other persistence live run**: each test mints one row, deleted by its
// fixture's teardown (ADR 0006).
import { NARROWED_ROOM_OVERFLOWING_DESIGN } from "@lemnaria/configurator-domain";
import { expect, type Page, type Route } from "@playwright/test";

import { APPROVED_ROMANIAN_MESSAGES } from "../support/approved-romanian-messages";
import { deleteMintedDesigns } from "./support/minted-designs";
import {
  captureEvidence,
  chooseAnotherHardwareTier,
  chooseAnotherHardwareTierAndSave,
  expectReviewDrawn,
  openReview,
  readBottomRegion,
  recordRequests,
  REVIEW_CTA,
  reviewPath,
  SAVE_WAIT,
  toTheDesignApi,
  touchTheMiddleOf,
} from "./support/qa-8d-review";
import { openSeededDesign, test } from "./support/seeded-design";
import { seedDesign } from "./support/u-design";

const FIGURE = '[data-section="figure"]';
const SETTINGS_ROW = '[data-section="settingsRow"]';
/** Longer than the coalescer's first retries (0.5 s, 1 s, 2 s), so "still off" is read after it has tried again. */
const SEVERAL_RETRIES_MS = 4000;

/** Long enough for a navigation a tap had started to have shown in the address. */
const TAP_SETTLE_MS = 400;

type SaveAnswer = (route: Route) => Promise<void>;

/** Answers every save of `designId` with `answer` until the returned function is called. */
async function answerSavesWith(
  page: Page,
  designId: string,
  answer: SaveAnswer,
): Promise<() => Promise<void>> {
  const pattern = `**/api/designs/${designId}`;
  const handler = async (route: Route): Promise<void> => {
    const method = route.request().method();
    if (method !== "PUT" && method !== "PATCH") {
      await route.continue();
      return;
    }
    await answer(route);
  };
  await page.route(pattern, handler);
  return () => page.unroute(pattern, handler);
}

function refuseWith(status: number): SaveAnswer {
  return (route) =>
    route.fulfill({ status, contentType: "application/json", body: "{}" });
}

async function editThenOpenTheReviewAtOnce(
  page: Page,
  designId: string,
): Promise<void> {
  await chooseAnotherHardwareTier(page);
  await page.getByTestId(REVIEW_CTA).tap();
  await page.waitForURL(reviewPath("ro", designId));
  await expectReviewDrawn(page);
}

async function markThisDocument(page: Page): Promise<void> {
  await page.evaluate(() => {
    Reflect.set(window, "__sameDocument", true);
  });
}

async function isStillTheMarkedDocument(page: Page): Promise<boolean> {
  return page.evaluate(() => Reflect.get(window, "__sameDocument") === true);
}

async function expectCallToActionOffBecauseOf(
  page: Page,
  sentence: string,
): Promise<void> {
  const callToAction = page.getByTestId(REVIEW_CTA);
  await expect(page.getByTestId(SAVE_WAIT)).toHaveText(sentence);
  await expect(page.getByTestId(SAVE_WAIT)).toBeInViewport();
  await expect(callToAction).toHaveAttribute("aria-disabled", "true");
  await expect(callToAction).toHaveAccessibleDescription(sentence);
  await expect(callToAction).not.toHaveAttribute("href");

  const address = page.url();
  await touchTheMiddleOf(page, callToAction);
  await page.waitForTimeout(TAP_SETTLE_MS);
  expect(page.url()).toBe(address);
}

test("an edit still being saved when the review opens: the review shows the edited design with the call to action off and the saving sentence, and it turns ready when the save lands, in the same document", async ({
  page,
  seededDesign,
}) => {
  await openSeededDesign(page, seededDesign);
  const priceBefore = await page.getByTestId("price-bar-total").textContent();
  let releaseTheSave: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    releaseTheSave = resolve;
  });
  await answerSavesWith(page, seededDesign.id, async (route) => {
    await held;
    await route.continue();
  });
  await markThisDocument(page);

  await chooseAnotherHardwareTier(page);
  const priceAfterTheEdit = await page
    .getByTestId("price-bar-total")
    .textContent();
  expect(priceAfterTheEdit).not.toBe(priceBefore);
  await page.getByTestId(REVIEW_CTA).tap();
  await page.waitForURL(reviewPath("ro", seededDesign.id));
  await expectReviewDrawn(page);

  await expectCallToActionOffBecauseOf(
    page,
    APPROVED_ROMANIAN_MESSAGES.reviewScreen.saving,
  );
  await expect(page.locator(FIGURE)).toContainText(priceAfterTheEdit ?? "");

  releaseTheSave();

  await expect(page.getByTestId(SAVE_WAIT)).toHaveCount(0);
  await expect(page.getByTestId(REVIEW_CTA)).toHaveAttribute(
    "href",
    "/ro/configurator/contact",
  );
  await expect(page.getByTestId(REVIEW_CTA)).not.toHaveAttribute(
    "aria-disabled",
  );
  await expect(page.locator(FIGURE)).toContainText(priceAfterTheEdit ?? "");
  expect(await isStillTheMarkedDocument(page)).toBe(true);
});

test("a save the server keeps failing: the call to action stays off with the editor's own sentence through the retries, and turns ready when a retry lands", async ({
  page,
  seededDesign,
}) => {
  await openSeededDesign(page, seededDesign);
  const stopFailing = await answerSavesWith(
    page,
    seededDesign.id,
    refuseWith(500),
  );
  await markThisDocument(page);

  await editThenOpenTheReviewAtOnce(page, seededDesign.id);

  await expectCallToActionOffBecauseOf(
    page,
    APPROVED_ROMANIAN_MESSAGES.panel.saveFailedNotice,
  );
  await page.waitForTimeout(SEVERAL_RETRIES_MS);
  await expectCallToActionOffBecauseOf(
    page,
    APPROVED_ROMANIAN_MESSAGES.panel.saveFailedNotice,
  );

  await stopFailing();

  await expect(page.getByTestId(REVIEW_CTA)).toHaveAttribute(
    "href",
    "/ro/configurator/contact",
    { timeout: 15_000 },
  );
  await expect(page.getByTestId(SAVE_WAIT)).toHaveCount(0);
  expect(await isStillTheMarkedDocument(page)).toBe(true);
});

const REFUSED_SAVES: readonly (readonly [string, number, string])[] = [
  ["a conflict", 409, APPROVED_ROMANIAN_MESSAGES.panel.saveConflictNotice],
  [
    "a refused write",
    403,
    APPROVED_ROMANIAN_MESSAGES.panel.readOnlyRefusedNotice,
  ],
  ["a stopped save", 422, APPROVED_ROMANIAN_MESSAGES.panel.saveStoppedNotice],
];

for (const [name, status, sentence] of REFUSED_SAVES) {
  test(`${name} (${String(status)}): the call to action is off for good with the editor's own sentence, and reloading the review shows the design the server holds, ready`, async ({
    page,
    seededDesign,
  }) => {
    await openSeededDesign(page, seededDesign);
    const savedSettings = await (async () => {
      await page.getByTestId(REVIEW_CTA).tap();
      await expectReviewDrawn(page);
      const text = await page.locator(SETTINGS_ROW).textContent();
      await page.goBack();
      await expect(page.getByTestId("top-bar-title")).toBeVisible();
      return text;
    })();
    await answerSavesWith(page, seededDesign.id, refuseWith(status));

    await editThenOpenTheReviewAtOnce(page, seededDesign.id);

    await expectCallToActionOffBecauseOf(page, sentence);
    await expect(page.locator(SETTINGS_ROW)).not.toHaveText(
      savedSettings ?? "",
    );
    await page.waitForTimeout(SEVERAL_RETRIES_MS);
    await expectCallToActionOffBecauseOf(page, sentence);

    await page.reload();
    await expectReviewDrawn(page);

    await expect(page.locator(SETTINGS_ROW)).toHaveText(savedSettings ?? "");
    await expect(page.getByTestId(SAVE_WAIT)).toHaveCount(0);
    await expect(page.getByTestId(REVIEW_CTA)).toHaveAttribute(
      "href",
      "/ro/configurator/contact",
    );
  });
}

test("the tallest foot the review can have, in Russian: a kitchen past its wall whose save conflicted shows three sentences, stays under half the phone, and leaves the named bodies clear of it at the page's end", async ({
  page,
}) => {
  const minted: string[] = [];
  try {
    const kitchen = await seedDesign(page, NARROWED_ROOM_OVERFLOWING_DESIGN);
    minted.push(kitchen.id);
    await openSeededDesign(page, kitchen, { locale: "ru" });
    await answerSavesWith(page, kitchen.id, refuseWith(409));

    await chooseAnotherHardwareTier(page);
    await page.getByTestId(REVIEW_CTA).tap();
    await page.waitForURL(reviewPath("ru", kitchen.id));
    await expectReviewDrawn(page);
    await expect(page.getByTestId(SAVE_WAIT)).toBeVisible();

    const region = await readBottomRegion(page);
    console.log(
      `BOTTOM_REGION three sentences ru ${JSON.stringify({
        height: region.height,
        shareOfViewport: region.height / region.viewportHeight,
      })}`,
    );
    expect(region.sentences).toHaveLength(3);
    expect(region.height).toBeLessThanOrEqual(region.viewportHeight / 2);
    await captureEvidence(page, "save-wait-tallest-foot-ru");

    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    const named = await page.getByTestId("review-named-bodies").boundingBox();
    expect((named?.y ?? 0) + (named?.height ?? 0)).toBeLessThanOrEqual(
      (await readBottomRegion(page)).top,
    );
  } finally {
    await deleteMintedDesigns(minted);
  }
});

test("the review asks nothing of the design's API: not when opened at its own address, not when reached from the editor, and not while it stands open", async ({
  page,
  seededDesign,
}) => {
  const requests = recordRequests(page);

  await openReview(page, seededDesign);
  await expect(page.getByTestId(REVIEW_CTA)).toHaveAttribute(
    "href",
    "/ro/configurator/contact",
  );
  await page.waitForTimeout(2000);
  expect(toTheDesignApi(requests, seededDesign.id)).toEqual([]);

  await openSeededDesign(page, seededDesign);
  const sentByTheEditor = toTheDesignApi(requests, seededDesign.id).length;
  expect(sentByTheEditor).toBeGreaterThan(0);

  await page.getByTestId(REVIEW_CTA).tap();
  await page.waitForURL(reviewPath("ro", seededDesign.id));
  await expectReviewDrawn(page);
  await page.waitForTimeout(2000);

  expect(toTheDesignApi(requests, seededDesign.id)).toHaveLength(
    sentByTheEditor,
  );
});

test("with the design changed and saved in another tab, the review reached from this tab's editor does not offer the older design as ready", async ({
  page,
  context,
  seededDesign,
}) => {
  await openSeededDesign(page, seededDesign);
  const otherTab = await context.newPage();
  await openSeededDesign(otherTab, seededDesign);
  await chooseAnotherHardwareTierAndSave(otherTab, seededDesign.id);
  await otherTab.getByTestId(REVIEW_CTA).tap();
  await expectReviewDrawn(otherTab);
  const settingsTheServerHolds = await otherTab
    .locator(SETTINGS_ROW)
    .textContent();
  const figureTheServerHolds = await otherTab.locator(FIGURE).textContent();

  await page.bringToFront();
  await page.getByTestId(REVIEW_CTA).tap();
  await page.waitForURL(reviewPath("ro", seededDesign.id));
  await expectReviewDrawn(page);

  const showsTheServersDesign =
    (await page.locator(SETTINGS_ROW).textContent()) ===
      settingsTheServerHolds &&
    (await page.locator(FIGURE).textContent()) === figureTheServerHolds;
  const isOfferedAsReady =
    (await page.getByTestId(REVIEW_CTA).getAttribute("aria-disabled")) !==
    "true";
  expect(
    showsTheServersDesign || !isOfferedAsReady,
    "the review shows a design the server no longer holds, with its call to action ready",
  ).toBe(true);
});
