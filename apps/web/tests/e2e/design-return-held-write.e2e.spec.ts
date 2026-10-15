// A design returned to by the browser's Back from a second design while the tab still holds a write for it, at
// 390 x 844 by touch: its saves are failing, or its save request is out and unanswered. The design comes back as that
// write's, unsaved and in the state the write is in, and the one write stores it with every later edit.
//
// **Must not run concurrently with any other persistence live run**: each test mints two rows, deleted by its
// fixture's teardown (ADR 0006).
import { expect, type Page } from "@playwright/test";

import {
  chooseAnotherMaterialAndSave,
  failSavesOf,
  holdFirstSaveOf,
  makeAnotherDesignFromStepOne,
  materialTierInTheStore,
  ROOM_URL,
  storedSettings,
  toStepOneByTheBackLink,
} from "./support/design-return";
import {
  chooseAnotherHardwareTier,
  expectEditorReady,
  hardwareTierInTheStore,
  openEditorFromStepOne,
  type EditorVisit,
} from "./support/qa-8d-review";
import { test } from "./support/step-one-by-touch";

const TEST_TIMEOUT_MS = 180_000;
/** Longer than the failure backoff's largest step (8 s) and the request that follows it. */
const BACKOFF_ENDS_WITHIN_MS = 30_000;
const SAVED_WITH_NO_CONFLICT = 200;

function saveStatusOf(page: Page) {
  return expect(page.getByTestId("selection-debug"));
}

/** To Step 1, a second design made there, then the browser's Back twice to the first design. */
async function leaveForASecondDesignAndReturn(
  page: Page,
  visit: EditorVisit,
): Promise<void> {
  await toStepOneByTheBackLink(page);
  await makeAnotherDesignFromStepOne(page);
  await page.goBack();
  await page.waitForURL(ROOM_URL);
  await page.goBack();
  await page.waitForURL(visit.editorUrl);
  await expectEditorReady(page);
}

test("while a design's saves are failing, Back to it from a second design shows its edit as failed, and one write stores it with the next edit", async ({
  page,
  designWrites,
}) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  // Fixtures are lazy: asking for this one is what deletes the rows the hand-overs mint.
  await Promise.resolve(designWrites);
  const visit = await openEditorFromStepOne(page);
  const failing = await failSavesOf(page, visit.designId);
  await chooseAnotherHardwareTier(page);
  const editedTier = await hardwareTierInTheStore(page);
  await saveStatusOf(page).toHaveAttribute("data-save-status", "error");

  await leaveForASecondDesignAndReturn(page, visit);

  expect(await hardwareTierInTheStore(page)).toBe(editedTier);
  await saveStatusOf(page).not.toHaveAttribute("data-save-status", "idle", {
    timeout: 1,
  });
  failing.stopFailing();
  await saveStatusOf(page).toHaveAttribute("data-save-status", "idle", {
    timeout: BACKOFF_ENDS_WITHIN_MS,
  });
  expect((await storedSettings(page, visit.designId)).hardwareTierId).toBe(
    editedTier,
  );
  expect(await chooseAnotherMaterialAndSave(page, visit.designId)).toBe(
    SAVED_WITH_NO_CONFLICT,
  );
  expect(await storedSettings(page, visit.designId)).toMatchObject({
    hardwareTierId: editedTier,
    materialTierId: await materialTierInTheStore(page),
  });
});

test("while a design's save request is out, Back to it from a second design shows its edit as being saved, and the answer is shown when it arrives", async ({
  page,
  designWrites,
}) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  await Promise.resolve(designWrites);
  const visit = await openEditorFromStepOne(page);
  const held = await holdFirstSaveOf(page, visit.designId);
  await chooseAnotherHardwareTier(page);
  const editedTier = await hardwareTierInTheStore(page);
  await held.hasLeft;

  await leaveForASecondDesignAndReturn(page, visit);

  expect(await hardwareTierInTheStore(page)).toBe(editedTier);
  await saveStatusOf(page).toHaveAttribute("data-save-status", "saving", {
    timeout: 1,
  });
  await held.release();
  await saveStatusOf(page).toHaveAttribute("data-save-status", "idle");
  expect((await storedSettings(page, visit.designId)).hardwareTierId).toBe(
    editedTier,
  );
  expect(await chooseAnotherMaterialAndSave(page, visit.designId)).toBe(
    SAVED_WITH_NO_CONFLICT,
  );
  expect(await storedSettings(page, visit.designId)).toMatchObject({
    hardwareTierId: editedTier,
    materialTierId: await materialTierInTheStore(page),
  });
});
