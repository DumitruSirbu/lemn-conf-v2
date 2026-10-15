// Two designs made in one document, each edited and saved, and the browser's history walked between them at 390 x 844
// by touch: a design returned to shows the stored one by the time an edit is offered, and the next edit is saved on
// top of it without a conflict.
//
// **Must not run concurrently with any other persistence live run**: each test mints two rows, deleted by its
// fixture's teardown (ADR 0006).
import { expect, type Page } from "@playwright/test";

import {
  chooseAnotherMaterialAndSave,
  makeAnotherDesignFromStepOne,
  materialTierInTheStore,
  ROOM_URL,
  storedSettings,
  toStepOneByTheBackLink,
} from "./support/design-return";
import {
  chooseAnotherHardwareTierAndSave,
  expectEditorReady,
  goBackAndSettle,
  hardwareTierInTheStore,
  openEditorFromStepOne,
  type EditorVisit,
} from "./support/qa-8d-review";
import { CONFIRM, press } from "./support/qa-m7c-c1-s3-back";
import { idInEditorUrl, test } from "./support/step-one-by-touch";

const SAVED_WITH_NO_CONFLICT = 200;
const TEST_TIMEOUT_MS = 180_000;

async function editAndSave(page: Page, visit: EditorVisit): Promise<string> {
  await chooseAnotherHardwareTierAndSave(page, visit.designId);
  const tier = await hardwareTierInTheStore(page);
  expect(tier).not.toBe("");
  return tier;
}

/** The editor shows the hardware tier the server holds, and the next edit is saved on top of it. */
async function expectStoredEditShownAndNextSaved(
  page: Page,
  visit: EditorVisit,
  savedHardwareTier: string,
): Promise<void> {
  expect((await storedSettings(page, visit.designId)).hardwareTierId).toBe(
    savedHardwareTier,
  );
  expect(await hardwareTierInTheStore(page)).toBe(savedHardwareTier);
  expect(await chooseAnotherMaterialAndSave(page, visit.designId)).toBe(
    SAVED_WITH_NO_CONFLICT,
  );
  expect(await storedSettings(page, visit.designId)).toMatchObject({
    hardwareTierId: savedHardwareTier,
    materialTierId: await materialTierInTheStore(page),
  });
}

test("Back to the first design and Forward to the second each show the stored edit, and the next edit on each is saved", async ({
  page,
  designWrites,
}) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  // Fixtures are lazy: asking for this one is what deletes the rows the hand-overs mint.
  await Promise.resolve(designWrites);
  const first = await openEditorFromStepOne(page);
  const firstTier = await editAndSave(page, first);
  await toStepOneByTheBackLink(page);
  await makeAnotherDesignFromStepOne(page);
  const second: EditorVisit = {
    designId: idInEditorUrl(page.url()),
    editorUrl: page.url(),
  };
  const secondTier = await editAndSave(page, second);

  await goBackAndSettle(page);
  await press(page, page.getByTestId(CONFIRM));
  await page.waitForURL(ROOM_URL);
  await page.goBack();
  await page.waitForURL(first.editorUrl);
  await expectEditorReady(page);
  await expectStoredEditShownAndNextSaved(page, first, firstTier);

  await page.goForward();
  await page.waitForURL(ROOM_URL);
  await page.goForward();
  await page.waitForURL(second.editorUrl);
  await expectEditorReady(page);
  await expectStoredEditShownAndNextSaved(page, second, secondTier);
});
