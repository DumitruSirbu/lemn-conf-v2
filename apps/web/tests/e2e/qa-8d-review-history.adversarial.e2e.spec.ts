// The review in the browser's own history, at 390 x 844 by touch: what Back and Forward do between the editor and
// the review, and what the review's links into the editor leave behind them. The desktop half is
// `qa-8d-review-history.adversarial.desktop.e2e.spec.ts`.
//
// **Must not run concurrently with any other persistence live run**: each test mints one row, deleted by its
// fixture's teardown (ADR 0006).
import { expect } from "@playwright/test";

import { readSelection } from "./support/panel";
import {
  BACK_QUESTION,
  BACK_QUESTION_STAY,
  chooseAnotherHardwareTierAndSave,
  expectEditorReady,
  expectReviewDrawn,
  goBackAndSettle,
  goForwardAndSettle,
  hardwareTierInTheStore,
  historyLength,
  isGuardEntryUnderTheCustomer,
  openEditorFromStepOne,
  openReview,
  REVIEW_BOTTOM,
  REVIEW_CTA,
  contactPath,
  reviewPath,
  scrollReserveAtTheFoot,
  settingsSheet,
} from "./support/qa-8d-review";
import { openSeededDesign, test as seededTest } from "./support/seeded-design";
import { roomScreen, test as stepOneTest } from "./support/step-one-by-touch";

stepOneTest(
  "from an edited editor the link opens the review; Back returns to the editor as left without the question, the next Back asks, and after Stay the same holds again",
  async ({ page, designWrites }) => {
    // Fixtures are lazy: asking for this one is what deletes the row the hand-over mints.
    await Promise.resolve(designWrites);
    const { designId, editorUrl } = await openEditorFromStepOne(page);
    await chooseAnotherHardwareTierAndSave(page, designId);
    const editedTier = await hardwareTierInTheStore(page);
    const lengthInTheEditor = await historyLength(page);

    for (const round of ["first", "after Stay"]) {
      await page.getByTestId(REVIEW_CTA).tap();
      await page.waitForURL(reviewPath("ro", designId));
      await expectReviewDrawn(page);
      expect(await historyLength(page), round).toBe(lengthInTheEditor + 1);

      await goBackAndSettle(page);

      expect(page.url(), round).toBe(editorUrl);
      await expect(page.getByTestId(BACK_QUESTION), round).toHaveCount(0);
      await expect(page.getByTestId(REVIEW_BOTTOM), round).toHaveCount(0);
      expect(await isGuardEntryUnderTheCustomer(page), round).toBe(true);
      expect(await hardwareTierInTheStore(page), round).toBe(editedTier);

      await goBackAndSettle(page);

      await expect(page.getByTestId(BACK_QUESTION), round).toBeVisible();
      expect(page.url(), round).toBe(editorUrl);

      await page.getByTestId(BACK_QUESTION_STAY).tap();
      await expect(page.getByTestId(BACK_QUESTION), round).toHaveCount(0);
      await expect
        .poll(() => isGuardEntryUnderTheCustomer(page), { message: round })
        .toBe(true);
      expect(await historyLength(page), round).toBe(lengthInTheEditor + 1);
    }
  },
);

stepOneTest(
  "a language switch on the review is one more entry: Back returns to the review in the first language, then to the edited editor without the question, then asks",
  async ({ page, designWrites }) => {
    // Fixtures are lazy: asking for this one is what deletes the row the hand-over mints.
    await Promise.resolve(designWrites);
    const { designId, editorUrl } = await openEditorFromStepOne(page);
    await chooseAnotherHardwareTierAndSave(page, designId);
    await page.getByTestId(REVIEW_CTA).tap();
    await expectReviewDrawn(page);
    const lengthOnTheReview = await historyLength(page);

    await page.getByTestId("top-bar-locale").tap();
    await page.getByTestId("top-bar-locale-option-ru").tap();
    await page.waitForURL(reviewPath("ru", designId));
    await expectReviewDrawn(page);
    expect(await historyLength(page)).toBe(lengthOnTheReview + 1);

    await goBackAndSettle(page);
    await expect(page).toHaveURL(reviewPath("ro", designId));
    await expectReviewDrawn(page);
    await expect(page.getByTestId(BACK_QUESTION)).toHaveCount(0);

    await goBackAndSettle(page);
    expect(page.url()).toBe(editorUrl);
    await expect(page.getByTestId(BACK_QUESTION)).toHaveCount(0);
    expect(await isGuardEntryUnderTheCustomer(page)).toBe(true);

    await goBackAndSettle(page);
    await expect(page.getByTestId(BACK_QUESTION)).toBeVisible();
    expect(page.url()).toBe(editorUrl);
  },
);

stepOneTest(
  "after the review is reloaded, Back still reaches the editor and then Step 1: no question from a visit the reload ended, and no entry Back cannot leave",
  async ({ page, designWrites }) => {
    // Fixtures are lazy: asking for this one is what deletes the row the hand-over mints.
    await Promise.resolve(designWrites);
    const { designId, editorUrl } = await openEditorFromStepOne(page);
    await chooseAnotherHardwareTierAndSave(page, designId);
    const editedTier = await hardwareTierInTheStore(page);
    await page.getByTestId(REVIEW_CTA).tap();
    await expectReviewDrawn(page);

    await page.reload();
    await expectReviewDrawn(page);
    await goBackAndSettle(page);

    expect(page.url()).toBe(editorUrl);
    await expectEditorReady(page);
    expect(await hardwareTierInTheStore(page)).toBe(editedTier);
    await expect(page.getByTestId(BACK_QUESTION)).toHaveCount(0);

    const pressesToStepOne = await (async () => {
      for (let presses = 1; presses <= 3; presses += 1) {
        await goBackAndSettle(page);
        if ((await roomScreen(page).count()) > 0) return presses;
      }
      return 4;
    })();
    expect(pressesToStepOne).toBeLessThanOrEqual(2);
    await expect(page.getByTestId(BACK_QUESTION)).toHaveCount(0);
  },
);

seededTest(
  "from an untouched editor opened by its link, the review is one entry further: Back returns to the editor with no question and Forward to the review",
  async ({ page, seededDesign }) => {
    await openSeededDesign(page, seededDesign);
    const editorUrl = page.url();
    const lengthInTheEditor = await historyLength(page);

    await page.getByTestId(REVIEW_CTA).tap();
    await page.waitForURL(reviewPath("ro", seededDesign.id));
    await expectReviewDrawn(page);
    expect(await historyLength(page)).toBe(lengthInTheEditor + 1);

    await goBackAndSettle(page);
    expect(page.url()).toBe(editorUrl);
    await expect(page.getByTestId("top-bar-title")).toBeVisible();
    await expect(page.getByTestId(BACK_QUESTION)).toHaveCount(0);
    expect(await isGuardEntryUnderTheCustomer(page)).toBe(false);

    await goForwardAndSettle(page);
    await expect(page).toHaveURL(reviewPath("ro", seededDesign.id));
    await expectReviewDrawn(page);
    expect(await historyLength(page)).toBe(lengthInTheEditor + 1);
  },
);

seededTest(
  "a group's edit link opens the editor one entry further with that group's first body selected and the address clean; Back returns to the review, and Forward re-selects nothing",
  async ({ page, seededDesign }) => {
    await openReview(page, seededDesign);
    expect(await scrollReserveAtTheFoot(page)).not.toBe("");
    const lengthOnTheReview = await historyLength(page);
    const edit = page.getByTestId("review-group-edit").nth(1);
    const selected = new URL(
      (await edit.getAttribute("href")) ?? "",
      page.url(),
    ).searchParams.get("select");
    expect(selected).not.toBeNull();

    await edit.tap();
    await page.waitForURL(`/ro/d/${seededDesign.id}`);
    await expectEditorReady(page);

    expect((await readSelection(page)).selectionId).toBe(selected);
    await expect(page.getByTestId("editor-panel")).toBeVisible();
    expect(await historyLength(page)).toBe(lengthOnTheReview + 1);
    // What the review reserved at the viewport's foot for its pinned region does not follow the customer here.
    expect(await scrollReserveAtTheFoot(page)).toBe("");

    await page.getByTestId("panel-close").tap();
    await expect(page.getByTestId("editor-panel")).toHaveCount(0);
    await goBackAndSettle(page);
    await expect(page).toHaveURL(reviewPath("ro", seededDesign.id));
    await expectReviewDrawn(page);

    await goForwardAndSettle(page);
    await expect(page).toHaveURL(`/ro/d/${seededDesign.id}`);
    await expectEditorReady(page);
    expect((await readSelection(page)).selectionId).toBe("");
    await expect(page.getByTestId("editor-panel")).toHaveCount(0);
  },
);

seededTest(
  "the settings link, from a review reached through the editor, opens the editor with the settings open; Back returns to the review and Forward does not open them again",
  async ({ page, seededDesign }) => {
    await openSeededDesign(page, seededDesign);
    await page.getByTestId(REVIEW_CTA).tap();
    await expectReviewDrawn(page);
    const lengthOnTheReview = await historyLength(page);

    await page.locator('[data-section="settingsRow"] a').tap();
    await page.waitForURL(`/ro/d/${seededDesign.id}`);

    await expect(settingsSheet(page)).toBeVisible();
    expect(await historyLength(page)).toBe(lengthOnTheReview + 1);

    await goBackAndSettle(page);
    await expect(page).toHaveURL(reviewPath("ro", seededDesign.id));
    await expectReviewDrawn(page);

    await goForwardAndSettle(page);
    await expect(page).toHaveURL(`/ro/d/${seededDesign.id}`);
    await expectEditorReady(page);
    await expect(settingsSheet(page)).toHaveCount(0);
  },
);

seededTest(
  "the settings link, from a review opened at its own address, opens the editor with the settings open",
  async ({ page, seededDesign }) => {
    await openReview(page, seededDesign);

    await page.locator('[data-section="settingsRow"] a').tap();
    await page.waitForURL(`/ro/d/${seededDesign.id}`);
    await expectEditorReady(page);

    await expect(settingsSheet(page)).toBeVisible();
  },
);

seededTest(
  "the review's call to action leaves for the contact step and Back returns to the same review",
  async ({ page, seededDesign }) => {
    await openReview(page, seededDesign);
    const lengthOnTheReview = await historyLength(page);

    await page.getByTestId(REVIEW_CTA).tap();
    await page.waitForURL(contactPath("ro", seededDesign.id));
    expect(await historyLength(page)).toBe(lengthOnTheReview + 1);

    await goBackAndSettle(page);
    await expect(page).toHaveURL(reviewPath("ro", seededDesign.id));
    await expectReviewDrawn(page);
  },
);
