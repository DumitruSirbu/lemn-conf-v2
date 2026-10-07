// The review in the browser's own history at 1440 x 900 with a pointer: the stacks of
// `qa-8d-review-history.adversarial.e2e.spec.ts` that a viewport could change, and no more, since the desktop shards
// are at their budget.
//
// **Must not run concurrently with any other persistence live run**: each test mints one row, deleted by its
// fixture's teardown (ADR 0006).
import { expect } from "@playwright/test";

import { readSelection } from "./support/panel";
import {
  BACK_QUESTION,
  chooseAnotherHardwareTierAndSave,
  expectEditorReady,
  expectReviewDrawn,
  goBackAndSettle,
  goForwardAndSettle,
  hardwareTierInTheStore,
  historyLength,
  isGuardEntryUnderTheCustomer,
  openEditorFromStepOne,
  REVIEW_BOTTOM,
  REVIEW_CTA,
  reviewPath,
} from "./support/qa-8d-review";
import { openSeededDesign, test as seededTest } from "./support/seeded-design";
import { test as stepOneTest } from "./support/step-one-by-touch";

stepOneTest(
  "from an edited editor the link opens the review; Back returns to the editor as left without the question, and the next Back asks",
  async ({ page, designWrites }) => {
    // Fixtures are lazy: asking for this one is what deletes the row the hand-over mints.
    await Promise.resolve(designWrites);
    const { designId, editorUrl } = await openEditorFromStepOne(page);
    await chooseAnotherHardwareTierAndSave(page, designId);
    const editedTier = await hardwareTierInTheStore(page);
    const lengthInTheEditor = await historyLength(page);

    await page.getByTestId(REVIEW_CTA).click();
    await page.waitForURL(reviewPath("ro", designId));
    await expectReviewDrawn(page);
    expect(await historyLength(page)).toBe(lengthInTheEditor + 1);

    await goBackAndSettle(page);

    expect(page.url()).toBe(editorUrl);
    await expect(page.getByTestId(BACK_QUESTION)).toHaveCount(0);
    await expect(page.getByTestId(REVIEW_BOTTOM)).toHaveCount(0);
    expect(await isGuardEntryUnderTheCustomer(page)).toBe(true);
    expect(await hardwareTierInTheStore(page)).toBe(editedTier);

    await goBackAndSettle(page);

    await expect(page.getByTestId(BACK_QUESTION)).toBeVisible();
    expect(page.url()).toBe(editorUrl);
  },
);

seededTest(
  "from an untouched editor the review is one entry further and Back returns without a question; a group's edit link then opens the editor with its first body selected, and Back returns to the review",
  async ({ page, seededDesign }) => {
    await openSeededDesign(page, seededDesign);
    const editorUrl = page.url();
    const lengthInTheEditor = await historyLength(page);

    await page.getByTestId(REVIEW_CTA).click();
    await page.waitForURL(reviewPath("ro", seededDesign.id));
    await expectReviewDrawn(page);
    expect(await historyLength(page)).toBe(lengthInTheEditor + 1);

    await goBackAndSettle(page);
    expect(page.url()).toBe(editorUrl);
    await expect(page.getByTestId(BACK_QUESTION)).toHaveCount(0);

    await goForwardAndSettle(page);
    await expectReviewDrawn(page);
    const edit = page.getByTestId("review-group-edit").first();
    const selected = new URL(
      (await edit.getAttribute("href")) ?? "",
      page.url(),
    ).searchParams.get("select");

    await edit.click();
    await page.waitForURL(`/ro/d/${seededDesign.id}`);
    await expectEditorReady(page);
    expect((await readSelection(page)).selectionId).toBe(selected);

    await goBackAndSettle(page);
    await expect(page).toHaveURL(reviewPath("ro", seededDesign.id));
    await expectReviewDrawn(page);
  },
);
