// M7C wave C1 slice S4 adversarial QA (docs/WORKFLOW.md step 3), at 390 x 844 by touch: the browser
// Back's confirmation, criteria 1-5 of `docs/milestones/M7C-m7-feedback-fixes.md`, *C1*, *S4*, pushed
// where the implementer's `editor-back-guard.e2e.spec.ts` does not go. Mobile project only: the
// behaviour has no viewport branch, and desktop shard 2/3 is at its budget (backlog 106).
//
// The long random sequences of criterion 2 are `use-back-guard.qa-m7c-c1-s4.adversarial.dom.test.ts`'s;
// this file is what only a real history can show: the back links' own dialog against Back, the
// backdrop, Back twice in one breath, a real departure from the site, the settings sheet open under
// Back, and Q10's reading of an edit undone by hand.
//
// **Must not run concurrently with any other persistence live run**: each test mints one row,
// deleted by the `designWrites` fixture's teardown (ADR 0006).
import { expect, type Page } from "@playwright/test";

import {
  continueButton,
  idInEditorUrl,
  roomPath,
  roomScreen,
  test,
  typeDigits,
} from "./support/step-one-by-touch";
import { expectWriteAccessApplied } from "./support/seeded-design";

// Fixtures are lazy: asking for this one in every test is what deletes the rows a hand-over minted.
test.beforeEach(async ({ designWrites }) => {
  await Promise.resolve(designWrites);
});

const DIALOG = "back-confirm-dialog";
const CONFIRM = "back-confirm-confirm";
const SCRIM = "back-confirm-scrim";
const GUARD_KEY = "lemnariaBackGuard";
const THE_TYPED_ROOM =
  "/ro/configurator/room?shape=L&wallA=3.56&wallB=4.25&height=2.7&direction=left";
const STEP_ONE_PATHNAME = roomPath("ro");

interface EditorVisit {
  readonly designUrl: string;
  readonly designId: string;
}

async function openTheEditorFromStepOne(page: Page): Promise<EditorVisit> {
  await page.goto(roomPath("ro"));
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1A");
  await page.getByTestId("room-shape-card-L").tap();
  await continueButton(page).tap();
  await typeDigits(page, "wallA", "3560");
  await typeDigits(page, "wallB", "4250");
  await typeDigits(page, "height", "2700");
  await expect(page).toHaveURL(THE_TYPED_ROOM);
  await continueButton(page).tap();
  await page.waitForURL(/\/ro\/d\/[^/]+$/);
  await expectTheEditorToBeReady(page);
  return { designUrl: page.url(), designId: idInEditorUrl(page.url()) };
}

async function expectTheEditorToBeReady(page: Page): Promise<void> {
  await expect(page.getByTestId("top-bar-title")).toBeVisible();
  await expectWriteAccessApplied(page);
}

/** Picks a hardware tier in the settings sheet and applies it, awaiting the save. */
async function applyHardwareTier(
  page: Page,
  designId: string,
  pick: "another" | "the original",
  original?: string,
): Promise<string> {
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === `/api/designs/${designId}`,
  );
  await page.getByTestId("global-settings-trigger").tap();
  const group = page.getByTestId("global-settings-group").nth(1);
  const checkedBefore = await group
    .locator('input[type="radio"]:checked')
    .getAttribute("value");
  const target =
    pick === "another"
      ? group.locator('input[type="radio"]:not(:checked)').first()
      : group.locator(`input[type="radio"][value="${String(original)}"]`);
  await target.tap();
  await page.getByTestId("global-settings-apply").tap();
  await expect(page.getByTestId("global-settings-surface")).toHaveCount(0);
  await saved;
  return String(checkedBefore);
}

async function makeAnEdit(page: Page, designId: string): Promise<string> {
  const original = await applyHardwareTier(page, designId, "another");
  await expectGuardUnderTheCustomer(page);
  return original;
}

async function expectGuardUnderTheCustomer(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        (key) =>
          (history.state as Record<string, unknown> | null)?.[key] === true,
        GUARD_KEY,
      ),
    )
    .toBe(true);
}

/** Back pressed until Step 1 shows, answering nothing; how many presses it took (or limit + 1). */
async function backPressesToStepOne(
  page: Page,
  limit: number,
): Promise<number> {
  for (let presses = 1; presses <= limit; presses += 1) {
    await page.goBack();
    // A same-document traversal resolves `goBack` before React has answered it.
    await page.waitForTimeout(400);
    if (new URL(page.url()).pathname === STEP_ONE_PATHNAME) return presses;
  }
  return limit + 1;
}

test("criterion 2 with the back link's own dialog open: Back never stacks a second dialog, and two Backs still reach Step 1", async ({
  page,
}) => {
  const { designId } = await openTheEditorFromStepOne(page);
  await makeAnEdit(page, designId);
  await page.getByTestId("bottom-bar-back").tap();
  await expect(page.getByTestId(DIALOG)).toBeVisible();

  await page.goBack();
  await page.waitForTimeout(400);
  await expect(page.getByTestId(DIALOG), "one dialog, never two").toHaveCount(
    1,
  );

  const presses = 1 + (await backPressesToStepOne(page, 3));

  expect(
    presses,
    "every Back is absorbed (restore-guard) for as long as the link's dialog is open",
  ).toBeLessThanOrEqual(2);
});

test("a backdrop press is Stay: the URL never moves, the guard is back under the customer, and Back asks again", async ({
  page,
}) => {
  const { designUrl, designId } = await openTheEditorFromStepOne(page);
  await makeAnEdit(page, designId);
  await page.goBack();
  await expect(page.getByTestId(DIALOG)).toBeVisible();
  expect(page.url()).toBe(designUrl);

  await page.getByTestId(SCRIM).tap({ position: { x: 6, y: 6 } });

  await expect(page.getByTestId(DIALOG)).toHaveCount(0);
  expect(page.url()).toBe(designUrl);
  await expectGuardUnderTheCustomer(page);
  await page.goBack();
  await expect(page.getByTestId(DIALOG)).toBeVisible();
  expect(page.url()).toBe(designUrl);
});

test("two Backs in one breath reach Step 1 and leave no dialog over it", async ({
  page,
}) => {
  const { designId } = await openTheEditorFromStepOne(page);
  await makeAnEdit(page, designId);

  await page.evaluate(() => {
    history.back();
    history.back();
  });

  await expect(page).toHaveURL(THE_TYPED_ROOM);
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1D");
  await page.waitForTimeout(500);
  await expect(page.getByTestId(DIALOG)).toHaveCount(0);
});

test("after Confirm, Forward into the editor again: no question from the old guard, and Step 1 within two Backs", async ({
  page,
}) => {
  const { designUrl, designId } = await openTheEditorFromStepOne(page);
  await makeAnEdit(page, designId);
  await page.goBack();
  await page.getByTestId(CONFIRM).tap();
  await expect(page).toHaveURL(THE_TYPED_ROOM);

  await page.goForward();
  await expect(page).toHaveURL(designUrl);
  await expectTheEditorToBeReady(page);
  await page.goForward();
  await page.waitForTimeout(400);
  await page.goBack();
  await page.waitForTimeout(400);

  await expect(page.getByTestId(DIALOG)).toHaveCount(0);
  expect(page.url()).toBe(designUrl);
  expect(await backPressesToStepOne(page, 3)).toBeLessThanOrEqual(2);
});

test("leaving the site and coming back by Back: no second guard, no question, Step 1 within two Backs (failure mode 3, criterion 4)", async ({
  page,
}) => {
  const { designUrl, designId } = await openTheEditorFromStepOne(page);
  await makeAnEdit(page, designId);
  const guardedLength = await page.evaluate(() => history.length);

  await page.goto("about:blank");
  await page.goBack();
  await expect(page).toHaveURL(designUrl);
  await expectTheEditorToBeReady(page);
  await applyHardwareTier(page, designId, "another");

  expect(
    await page.evaluate(() => history.length),
    "only the departure's own entry",
  ).toBe(guardedLength + 1);
  await expectGuardUnderTheCustomer(page);
  const presses = await backPressesToStepOne(page, 3);
  await expect(page.getByTestId(DIALOG)).toHaveCount(0);
  expect(presses).toBeLessThanOrEqual(2);
});

test("Back with the settings sheet open: the question opens, and a second Back still reaches Step 1", async ({
  page,
}) => {
  const { designUrl, designId } = await openTheEditorFromStepOne(page);
  await makeAnEdit(page, designId);
  await page.getByTestId("global-settings-trigger").tap();
  await expect(page.getByTestId("global-settings-surface")).toBeVisible();

  await page.goBack();

  await expect(page.getByTestId(DIALOG)).toBeVisible();
  expect(page.url()).toBe(designUrl);
  expect(await backPressesToStepOne(page, 2)).toBeLessThanOrEqual(1);
});

test("Q10 as built: an edit undone by hand still asks — the flag counts edits, there is no undo to compare against", async ({
  page,
}) => {
  const { designUrl, designId } = await openTheEditorFromStepOne(page);
  const original = await makeAnEdit(page, designId);
  await applyHardwareTier(page, designId, "the original", original);

  await page.goBack();

  await expect(page.getByTestId(DIALOG)).toBeVisible();
  expect(page.url()).toBe(designUrl);
});
