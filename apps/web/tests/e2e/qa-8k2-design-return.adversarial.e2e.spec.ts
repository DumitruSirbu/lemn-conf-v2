// A design returned to by the browser's history, attacked at 390 x 844 by touch on the production server: in Russian,
// with returns one after another; with the answer about write access held slow and every edit control pressed
// meanwhile; with that answer refused as the limit on reads refuses it, then asked again; with the other design's own
// save out while the first is edited and returned to; and from a review that kept an older page, left by each kind of
// link to the editor.
//
// Not here: a page frozen past a failed save's retry time and resumed. The browser these specs run cannot be frozen:
// `Page.setWebLifecycleState` raises no `freeze` event in headless Chromium and its timers keep firing, and Playwright
// starts it with the back-forward cache off.
//
// The answer and the saves are held, refused or failed in the browser by route interception, so no limiter's counter is
// touched. Timings of a return are read inside the page and printed, not asserted: they are a measurement.
//
// **Must not run concurrently with any other persistence live run**: each test mints one or two rows, deleted by its
// fixture's teardown (ADR 0006).
import { expect, type Page } from "@playwright/test";

import {
  chooseAnotherMaterialAndSave,
  holdFirstSaveOf,
  materialTierInTheStore,
  readsOfTheDesignSince,
  savesOfTheDesignSince,
  storedSettings,
} from "./support/design-return";
import {
  chooseAnotherHardwareTier,
  chooseAnotherHardwareTierAndSave,
  expectEditorReady,
  expectReviewDrawn,
  hardwareTierInTheStore,
  openEditorFromStepOne,
  recordRequests,
  settingsSheet,
  type EditorVisit,
  type RecordedRequest,
} from "./support/qa-8d-review";
import { press } from "./support/qa-m7c-c1-s3-back";
import {
  ANY_ROOM_URL,
  backToStepOne,
  documentReadout,
  expectEditorDrawn,
  holdReadsOf,
  makeASecondDesign,
  openEditorFromStepOneIn,
  openThePanelOnABody,
  readTheReturn,
  refuseReadsOf,
  toStepOne,
  touchEveryControlIn,
  touchTheMiddle,
  traverseStraightTo,
  watchTheNextReturnTo,
  type ReturnTiming,
} from "./support/qa-8k2-return";
import { expectWriteAccessApplied } from "./support/seeded-design";
import { test } from "./support/step-one-by-touch";

const TEST_TIMEOUT_MS = 240_000;
const SAVED_WITH_NO_CONFLICT = 200;
/** Long enough for a request the load had caused to have left. */
const REQUEST_SETTLE_MS = 2000;
const STORED_WITHIN_MS = 30_000;
const REVIEW_URL = /\/d\/[^/]+\/review$/;
const CLOSES_THE_PANEL = ["panel-close", "panel-done"];

function readout(page: Page) {
  return expect(page.getByTestId("selection-debug"));
}

async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(REQUEST_SETTLE_MS);
}

async function editHardwareAndSave(
  page: Page,
  visit: EditorVisit,
): Promise<string> {
  await chooseAnotherHardwareTierAndSave(page, visit.designId);
  const tier = await hardwareTierInTheStore(page);
  expect(tier).not.toBe("");
  return tier;
}

/** The editor shows the hardware tier the server holds, and the next edit is saved on top of it with no conflict. */
async function expectStoredEditShownAndNextSaved(
  page: Page,
  visit: EditorVisit,
  storedHardwareTier: string,
): Promise<void> {
  expect((await storedSettings(page, visit.designId)).hardwareTierId).toBe(
    storedHardwareTier,
  );
  expect(await hardwareTierInTheStore(page)).toBe(storedHardwareTier);
  expect(await chooseAnotherMaterialAndSave(page, visit.designId)).toBe(
    SAVED_WITH_NO_CONFLICT,
  );
  expect(await storedSettings(page, visit.designId)).toMatchObject({
    hardwareTierId: storedHardwareTier,
    materialTierId: await materialTierInTheStore(page),
  });
}

/** One traversal that lands on `visit`'s editor: it reads the design once, saves nothing, and is timed in the page. */
async function returnTo(
  page: Page,
  visit: EditorVisit,
  requests: readonly RecordedRequest[],
  traverse: () => Promise<unknown>,
): Promise<ReturnTiming> {
  const mark = requests.length;
  await watchTheNextReturnTo(page, visit.designId);
  await traverse();
  await page.waitForURL(visit.editorUrl);
  await expectEditorReady(page);
  await settle(page);
  expect(readsOfTheDesignSince(requests, mark, visit.designId)).toHaveLength(1);
  expect(savesOfTheDesignSince(requests, mark, visit.designId)).toHaveLength(0);
  const timing = await readTheReturn(page);
  console.log(`[qa-8k2 L1] ${JSON.stringify(timing)}`);
  return timing;
}

test("in Russian, Back from Step 1 reads nothing, and Back to the first design, Forward to the second and Back to the first again each read once, show what is stored and save the next edit on it", async ({
  page,
  designWrites,
}) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  // Fixtures are lazy: asking for this one is what deletes the rows the hand-overs mint.
  await Promise.resolve(designWrites);
  const first = await openEditorFromStepOneIn(page, "ru");
  const requests = recordRequests(page);

  await toStepOne(page);
  const markAtStepOne = requests.length;
  await page.goBack();
  await page.waitForURL(first.editorUrl);
  await expectEditorReady(page);
  await settle(page);
  expect(
    readsOfTheDesignSince(requests, markAtStepOne, first.designId),
  ).toHaveLength(0);

  const firstTier = await editHardwareAndSave(page, first);
  await toStepOne(page);
  const second = await makeASecondDesign(page);
  const secondTier = await editHardwareAndSave(page, second);

  await backToStepOne(page);
  await returnTo(page, first, requests, () => page.goBack());
  await expectStoredEditShownAndNextSaved(page, first, firstTier);
  const firstMaterial = await materialTierInTheStore(page);

  await page.goForward();
  await page.waitForURL(ANY_ROOM_URL);
  await returnTo(page, second, requests, () => page.goForward());
  await expectStoredEditShownAndNextSaved(page, second, secondTier);

  await backToStepOne(page);
  await returnTo(page, first, requests, () => page.goBack());
  expect(await materialTierInTheStore(page)).toBe(firstMaterial);
  expect(await hardwareTierInTheStore(page)).toBe(firstTier);
  const tierAfterTheSecondReturn = await editHardwareAndSave(page, first);
  expect(await storedSettings(page, first.designId)).toMatchObject({
    hardwareTierId: tierAfterTheSecondReturn,
    materialTierId: firstMaterial,
  });
  expect(new URL(page.url()).pathname.startsWith("/ru/")).toBe(true);
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("ru");
});

test("while the answer about write access is held back, the older copy is on screen and no control of the settings pill or of a body's panel changes the design or sends a save; the answer then shows the stored design", async ({
  page,
  designWrites,
}) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  await Promise.resolve(designWrites);
  const first = await openEditorFromStepOne(page);
  const storedTier = await editHardwareAndSave(page, first);
  await toStepOne(page);
  await makeASecondDesign(page);
  await backToStepOne(page);
  const requests = recordRequests(page);
  const heldAnswer = await holdReadsOf(page, first.designId);

  await page.goBack();
  await page.waitForURL(first.editorUrl);
  await heldAnswer.hasLeft;
  await expectEditorDrawn(page);

  expect(await hardwareTierInTheStore(page)).not.toBe(storedTier);
  const documentBefore = await documentReadout(page);
  const settingsTrigger = page.getByTestId("global-settings-trigger");
  await expect(settingsTrigger).toBeDisabled();
  await touchTheMiddle(page, settingsTrigger);
  await expect(settingsSheet(page)).toHaveCount(0);
  await openThePanelOnABody(page);
  const panel = page.getByTestId("editor-panel");
  await expect(page.getByTestId("panel-notice")).not.toHaveAttribute(
    "data-empty",
    "true",
  );
  const touched = await touchEveryControlIn(page, panel, CLOSES_THE_PANEL);
  console.log(`[qa-8k2 locked controls touched] ${touched.join(", ")}`);
  expect(touched.length).toBeGreaterThan(0);
  expect(await documentReadout(page)).toBe(documentBefore);
  expect(savesOfTheDesignSince(requests, 0, first.designId)).toHaveLength(0);

  await heldAnswer.release();
  const askAgain = page.getByTestId("panel-access-retry");
  if (await askAgain.isVisible()) await press(page, askAgain);
  await expectWriteAccessApplied(page);
  await expectStoredEditShownAndNextSaved(page, first, storedTier);
});

test("an answer about write access refused as the limit on reads refuses it leaves the page's copy locked with the notice and its retry, and the retry that answers shows the stored design", async ({
  page,
  designWrites,
}) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  await Promise.resolve(designWrites);
  const first = await openEditorFromStepOne(page);
  const storedTier = await editHardwareAndSave(page, first);
  await toStepOne(page);
  await makeASecondDesign(page);
  await backToStepOne(page);
  const requests = recordRequests(page);
  const refused = await refuseReadsOf(page, first.designId);

  await page.goBack();
  await page.waitForURL(first.editorUrl);
  await expectEditorDrawn(page);
  await expect.poll(() => refused.count()).toBe(1);

  await openThePanelOnABody(page);
  await expect(page.getByTestId("panel-notice")).toHaveAttribute(
    "data-notice",
    "access-uncheckable",
  );
  await expect(page.getByTestId("global-settings-trigger")).toBeDisabled();
  expect(await hardwareTierInTheStore(page)).not.toBe(storedTier);
  const documentBefore = await documentReadout(page);
  await touchEveryControlIn(page, page.getByTestId("editor-panel"), [
    ...CLOSES_THE_PANEL,
    "panel-access-retry",
  ]);
  expect(await documentReadout(page)).toBe(documentBefore);
  expect(savesOfTheDesignSince(requests, 0, first.designId)).toHaveLength(0);
  expect(refused.count()).toBe(1);

  refused.stopRefusing();
  await press(page, page.getByTestId("panel-access-retry"));
  await expectWriteAccessApplied(page);

  expect(readsOfTheDesignSince(requests, 0, first.designId)).toHaveLength(2);
  await expectStoredEditShownAndNextSaved(page, first, storedTier);
});

test("with the second design's save out, the first is edited, left and returned to with its edit shown unsaved; the second shows its own edit as being saved; one save of each then stores both", async ({
  page,
  designWrites,
}) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  await Promise.resolve(designWrites);
  const first = await openEditorFromStepOne(page);
  await toStepOne(page);
  const second = await makeASecondDesign(page);
  const requests = recordRequests(page);
  const heldSave = await holdFirstSaveOf(page, second.designId);
  await chooseAnotherHardwareTier(page);
  const secondTier = await hardwareTierInTheStore(page);
  await heldSave.hasLeft;
  const heldSinceMs = Date.now();

  await backToStepOne(page);
  await page.goBack();
  await page.waitForURL(first.editorUrl);
  await expectEditorReady(page);
  await chooseAnotherHardwareTier(page);
  const firstTier = await hardwareTierInTheStore(page);

  await page.goForward();
  await page.waitForURL(ANY_ROOM_URL);
  await page.goForward();
  await page.waitForURL(second.editorUrl);
  await expectEditorReady(page);
  expect(await hardwareTierInTheStore(page)).toBe(secondTier);
  await readout(page).toHaveAttribute("data-save-status", "saving", {
    timeout: 1,
  });

  await backToStepOne(page);
  await page.goBack();
  await page.waitForURL(first.editorUrl);
  await expectEditorDrawn(page);
  console.log(
    `[qa-8k2 fourth state] the first design was edited, left and returned to ${String(Date.now() - heldSinceMs)} ms after the second design's save left`,
  );
  expect(await hardwareTierInTheStore(page)).toBe(firstTier);
  expect(savesOfTheDesignSince(requests, 0, first.designId)).toHaveLength(0);
  await expectEditorReady(page);
  expect(await hardwareTierInTheStore(page)).toBe(firstTier);

  await heldSave.release();
  await expect
    .poll(
      async () => (await storedSettings(page, first.designId)).hardwareTierId,
      { timeout: STORED_WITHIN_MS },
    )
    .toBe(firstTier);
  await readout(page).toHaveAttribute("data-save-status", "idle");
  expect((await storedSettings(page, second.designId)).hardwareTierId).toBe(
    secondTier,
  );
  expect(savesOfTheDesignSince(requests, 0, first.designId)).toHaveLength(1);
  expect(savesOfTheDesignSince(requests, 0, second.designId)).toHaveLength(1);
  await expectStoredEditShownAndNextSaved(page, first, firstTier);
});

interface StaleReview {
  readonly first: EditorVisit;
  readonly storedHardwareTier: string;
  readonly storedMaterialTier: string;
  readonly requests: readonly RecordedRequest[];
}

/**
 * The first design's review, kept by the router one save old, shown again in one traversal from a second design: the
 * review was opened after one saved edit, a second edit was saved in the editor reached from it, and a second design
 * was then made.
 */
async function returnToAnOlderReviewFromASecondDesign(
  page: Page,
): Promise<StaleReview> {
  const first = await openEditorFromStepOne(page);
  const storedHardwareTier = await editHardwareAndSave(page, first);
  await press(page, page.getByTestId("review-cta"));
  await page.waitForURL(REVIEW_URL);
  await expectReviewDrawn(page);
  await press(page, page.getByTestId("review-back"));
  await page.waitForURL(first.editorUrl);
  await expectEditorReady(page);
  expect(await chooseAnotherMaterialAndSave(page, first.designId)).toBe(
    SAVED_WITH_NO_CONFLICT,
  );
  const storedMaterialTier = await materialTierInTheStore(page);
  await toStepOne(page);
  await makeASecondDesign(page);
  const requests = recordRequests(page);

  await traverseStraightTo(page, REVIEW_URL);
  await expectReviewDrawn(page);
  await settle(page);

  return { first, storedHardwareTier, storedMaterialTier, requests };
}

/** The editor holds both stored edits, and a third is saved on top of them with no conflict. */
async function expectTheEditorEndsOnTheStoredDesign(
  page: Page,
  review: StaleReview,
): Promise<void> {
  expect(await hardwareTierInTheStore(page)).toBe(review.storedHardwareTier);
  expect(await materialTierInTheStore(page)).toBe(review.storedMaterialTier);
  const nextTier = await editHardwareAndSave(page, review.first);
  expect(await storedSettings(page, review.first.designId)).toMatchObject({
    hardwareTierId: nextTier,
    materialTierId: review.storedMaterialTier,
  });
  await readout(page).toHaveAttribute("data-save-status", "idle");
}

test("a review returned to from a second design asks the server nothing, and its back link opens the editor on the stored design", async ({
  page,
  designWrites,
}) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  await Promise.resolve(designWrites);
  const review = await returnToAnOlderReviewFromASecondDesign(page);
  const { first, requests } = review;

  expect(readsOfTheDesignSince(requests, 0, first.designId)).toHaveLength(0);
  expect(savesOfTheDesignSince(requests, 0, first.designId)).toHaveLength(0);

  await press(page, page.getByTestId("review-back"));
  await page.waitForURL(first.editorUrl);
  await expectEditorReady(page);

  expect(readsOfTheDesignSince(requests, 0, first.designId)).toHaveLength(1);
  await expectTheEditorEndsOnTheStoredDesign(page, review);
});

test("a review returned to from a second design, left by a group's edit link while the answer about write access is slow, opens the editor on the stored design", async ({
  page,
  designWrites,
}) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  await Promise.resolve(designWrites);
  const review = await returnToAnOlderReviewFromASecondDesign(page);
  const { first } = review;
  const heldAnswer = await holdReadsOf(page, first.designId);

  await press(page, page.getByTestId("review-group-edit").first());
  await page.waitForURL(
    (url) => url.pathname === new URL(first.editorUrl).pathname,
  );
  await heldAnswer.hasLeft;
  await expectEditorDrawn(page);
  await readout(page).not.toHaveAttribute("data-selection-id", "");
  const selectedOnArrival = await page
    .getByTestId("selection-debug")
    .getAttribute("data-selection-id");

  await heldAnswer.release();
  const askAgain = page.getByTestId("panel-access-retry");
  if (await askAgain.isVisible()) await press(page, askAgain);
  await expectWriteAccessApplied(page);
  const selectedAfterTheAnswer = await page
    .getByTestId("selection-debug")
    .getAttribute("data-selection-id");
  console.log(
    `[qa-8k2 L3] selected on arrival: ${String(selectedOnArrival)}; after the late answer: ${JSON.stringify(selectedAfterTheAnswer)}`,
  );

  await expectTheEditorEndsOnTheStoredDesign(page, review);
});
