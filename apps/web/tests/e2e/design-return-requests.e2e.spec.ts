// How many times the editor of a design reads the design's API when it is loaded and when the browser's history
// returns to it, at 390 x 844 by touch, on the production server. One read answers write access; a design whose
// answer the store already holds asks nothing.
//
// **Must not run concurrently with any other persistence live run**: each test mints one or two rows, deleted by its
// fixture's teardown (ADR 0006).
import { expect, type Page } from "@playwright/test";

import {
  expectEditorReady,
  openEditorFromStepOne,
  recordRequests,
} from "./support/qa-8d-review";
import {
  makeAnotherDesignFromStepOne,
  readsOfTheDesignSince,
  ROOM_URL,
  savesOfTheDesignSince,
  toStepOneByTheBackLink,
} from "./support/design-return";
import { test } from "./support/step-one-by-touch";

/** Long enough for a request the load had caused to have left. */
const REQUEST_SETTLE_MS = 2000;

async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(REQUEST_SETTLE_MS);
}

test("the editor reached from Step 1 reads its design once", async ({
  page,
  designWrites,
}) => {
  // Fixtures are lazy: asking for this one is what deletes the rows the test mints.
  await Promise.resolve(designWrites);
  const requests = recordRequests(page);

  const { designId } = await openEditorFromStepOne(page);
  await settle(page);

  expect(readsOfTheDesignSince(requests, 0, designId)).toHaveLength(1);
});

test("a full load of the editor reads its design once and saves nothing", async ({
  page,
  designWrites,
}) => {
  await Promise.resolve(designWrites);
  const { designId } = await openEditorFromStepOne(page);
  const requests = recordRequests(page);

  await page.reload();
  await expectEditorReady(page);
  await settle(page);

  expect(readsOfTheDesignSince(requests, 0, designId)).toHaveLength(1);
  expect(savesOfTheDesignSince(requests, 0, designId)).toHaveLength(0);
});

test("the browser's Back from a second design to the first reads the first design once", async ({
  page,
  designWrites,
}) => {
  await Promise.resolve(designWrites);
  const first = await openEditorFromStepOne(page);
  await toStepOneByTheBackLink(page);
  await makeAnotherDesignFromStepOne(page);
  await page.goBack();
  await page.waitForURL(ROOM_URL);
  const requests = recordRequests(page);

  await page.goBack();
  await page.waitForURL(first.editorUrl);
  await expectEditorReady(page);
  await settle(page);

  expect(readsOfTheDesignSince(requests, 0, first.designId)).toHaveLength(1);
  expect(savesOfTheDesignSince(requests, 0, first.designId)).toHaveLength(0);
});

test("the browser's Back from Step 1 to the design it was reached from reads nothing", async ({
  page,
  designWrites,
}) => {
  await Promise.resolve(designWrites);
  const visit = await openEditorFromStepOne(page);
  await toStepOneByTheBackLink(page);
  const requests = recordRequests(page);

  await page.goBack();
  await page.waitForURL(visit.editorUrl);
  await expectEditorReady(page);
  await settle(page);

  expect(readsOfTheDesignSince(requests, 0, visit.designId)).toHaveLength(0);
  expect(savesOfTheDesignSince(requests, 0, visit.designId)).toHaveLength(0);
});
