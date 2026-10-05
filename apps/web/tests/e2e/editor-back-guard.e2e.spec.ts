// M7C wave C1 slice S4 (FB-001, Q10), at 390 x 844 by touch: the confirmation on the browser's Back,
// criteria 1-5 of `docs/milestones/M7C-m7-feedback-fixes.md`, *C1*, *S4*. Mobile project only: the
// behaviour has no viewport branch, and desktop shard 2/3 is at its budget (backlog 106).
//
// **What only a browser can show, and why this is not a unit test.** Whether Back lands on the
// editor's own first entry rather than skipping it (Chrome's history manipulation intervention), what
// `history.state` holds once Next's patched `pushState` has copied its own state onto the guard, and
// that the address bar never moves, are properties of a real history. `use-back-guard.dom.test.ts`
// simulates a landing; it cannot say that Chrome would deliver it.
//
// Every test reaches the editor **from Step 1**, the only way the guard exists. The two that must not
// warn for an editor opened any other way use the seeded design, which Step 1 did not hand over.
//
// **Must not run concurrently with any other persistence live run**: each Step 1 test mints one row,
// deleted by the `designWrites` fixture's teardown (ADR 0006).
import {
  expect,
  mergeTests,
  type Dialog,
  type Page,
  type Request,
} from "@playwright/test";

import { openSeededDesign, test as seededTest } from "./support/seeded-design";
import {
  continueButton,
  idInEditorUrl,
  roomPath,
  roomScreen,
  test as stepOneTest,
  typeDigits,
} from "./support/step-one-by-touch";

const test = mergeTests(stepOneTest, seededTest);

// Fixtures are lazy: asking for this one in every test is what deletes the rows a Step 1 hand-over
// minted, whether the test passed or not.
test.beforeEach(async ({ designWrites }) => {
  await Promise.resolve(designWrites);
});

const DIALOG = "back-confirm-dialog";
const CONFIRM = "back-confirm-confirm";
const STAY = "back-confirm-confirm-back";

const THE_TYPED_ROOM =
  "/ro/configurator/room?shape=L&wallA=3.56&wallB=4.25&height=2.7&direction=left";
const THE_EMPTY_L_ROOM = "/ro/configurator/room?shape=L&direction=left";
const AS_TYPED = { wallA: "3560", wallB: "4250", height: "2700" } as const;

/** What the guard entry's own state is keyed on (`use-back-guard.ts`). */
const GUARD_KEY = "lemnariaBackGuard";

interface EditorVisit {
  readonly designUrl: string;
  readonly designId: string;
}

/** Step 1 to the editor, by touch, through the real hand-off: the one route that has Step 1 behind it. */
async function openTheEditorFromStepOne(page: Page): Promise<EditorVisit> {
  await page.goto(roomPath("ro"));
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1A");
  await page.getByTestId("room-shape-card-L").tap();
  await continueButton(page).tap();
  await expect(page).toHaveURL(THE_EMPTY_L_ROOM);
  await typeDigits(page, "wallA", AS_TYPED.wallA);
  await typeDigits(page, "wallB", AS_TYPED.wallB);
  await typeDigits(page, "height", AS_TYPED.height);
  await expect(page).toHaveURL(THE_TYPED_ROOM);
  await continueButton(page).tap();
  await page.waitForURL(/\/ro\/d\/[^/]+$/);
  await expectTheEditorToBeReady(page);
  return { designUrl: page.url(), designId: idInEditorUrl(page.url()) };
}

async function expectTheEditorToBeReady(page: Page): Promise<void> {
  await expect(page.getByTestId("top-bar-title")).toBeVisible();
  const trigger = page.getByTestId("global-settings-trigger");
  if ((await trigger.count()) > 0) await expect(trigger).toBeEnabled();
}

/** One applied change — a hardware tier other than the one chosen, so every call is a change — and the save it causes, awaited so no request is
 *  still on its way when a test starts counting. A press, so the customer's gesture is a real one. */
async function makeAnEdit(page: Page, designId: string): Promise<void> {
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === `/api/designs/${designId}`,
  );
  await page.getByTestId("global-settings-trigger").tap();
  await page
    .getByTestId("global-settings-group")
    .nth(1)
    .locator('input[type="radio"]:not(:checked)')
    .first()
    .tap();
  await page.getByTestId("global-settings-apply").tap();
  await expect(page.getByTestId("global-settings-surface")).toHaveCount(0);
  await saved;
}

interface EntryFacts {
  readonly length: number;
  readonly isGuard: boolean;
  readonly isAcceptedByNext: boolean;
}

async function readHistory(page: Page): Promise<EntryFacts> {
  return page.evaluate((guardKey) => {
    const state = history.state as Record<string, unknown> | null;
    return {
      length: history.length,
      isGuard: state?.[guardKey] === true,
      isAcceptedByNext: state?.__NA === true,
    };
  }, GUARD_KEY);
}

async function expectGuardUnderTheCustomer(page: Page): Promise<EntryFacts> {
  await expect.poll(async () => (await readHistory(page)).isGuard).toBe(true);
  return readHistory(page);
}

/** Back, then the dialog — and nothing else moved. */
async function pressBackAndExpectTheQuestion(
  page: Page,
  designUrl: string,
): Promise<void> {
  await page.goBack();
  await expect(page.getByTestId(DIALOG)).toBeVisible();
  expect(page.url()).toBe(designUrl);
}

async function expectStepOneWithTheRoomFilled(page: Page): Promise<void> {
  await expect(page).toHaveURL(THE_TYPED_ROOM);
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1D");
  for (const field of ["wallA", "wallB", "height"] as const) {
    await expect(page.getByTestId(`room-length-${field}`)).toHaveValue(
      AS_TYPED[field],
    );
  }
}

function recordRequests(page: Page): readonly Request[] {
  const requests: Request[] = [];
  page.on("request", (request) => {
    requests.push(request);
  });
  return requests;
}

function describeRequests(requests: readonly Request[]): string {
  return JSON.stringify(
    requests.map((request) => `${request.method()} ${request.url()}`),
  );
}

test("Back after an edit asks without moving the address bar; Stay and Escape put the guard back; Confirm opens Step 1 with the room filled in and writes nothing", async ({
  page,
  designWrites,
}) => {
  const { designUrl, designId } = await openTheEditorFromStepOne(page);
  const beforeTheEdit = await readHistory(page);
  await makeAnEdit(page, designId);
  const guard = await expectGuardUnderTheCustomer(page);
  expect(guard.length).toBe(beforeTheEdit.length + 1);
  expect(guard.isAcceptedByNext, "Next must accept the guard on Forward").toBe(
    true,
  );
  const requests = recordRequests(page);

  await pressBackAndExpectTheQuestion(page, designUrl);
  expect(describeRequests(requests)).toBe("[]");
  expect((await readHistory(page)).length).toBe(guard.length);

  await page.getByTestId(STAY).tap();
  await expect(page.getByTestId(DIALOG)).toHaveCount(0);
  expect(page.url()).toBe(designUrl);
  const afterStay = await expectGuardUnderTheCustomer(page);
  expect(afterStay.length, "Stay must create no entry").toBe(guard.length);

  await pressBackAndExpectTheQuestion(page, designUrl);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId(DIALOG)).toHaveCount(0);
  expect(page.url()).toBe(designUrl);
  expect((await expectGuardUnderTheCustomer(page)).length).toBe(guard.length);

  await pressBackAndExpectTheQuestion(page, designUrl);
  const postsBeforeConfirm = designWrites.postCount();
  const savesBeforeConfirm = designWrites.saves().length;
  await page.getByTestId(CONFIRM).tap();

  await expectStepOneWithTheRoomFilled(page);
  expect(describeRequests(requests.filter(isNotRead))).toBe("[]");
  expect(designWrites.postCount()).toBe(postsBeforeConfirm);
  expect(designWrites.saves()).toHaveLength(savesBeforeConfirm);

  await page.goto("/ro");
  await expect(page).toHaveURL(designUrl);
  await expect(page.getByTestId("top-bar-title")).toBeVisible();
});

function isNotRead(request: Request): boolean {
  return request.method() !== "GET";
}

test("a Back with the links' dialog open is let through, never stacking a second dialog; dismissing that dialog puts the guard back", async ({
  page,
}) => {
  const { designUrl, designId } = await openTheEditorFromStepOne(page);
  await makeAnEdit(page, designId);
  await expectGuardUnderTheCustomer(page);
  await page.getByTestId("bottom-bar-back").tap();
  await expect(page.getByTestId(DIALOG)).toBeVisible();

  await page.goBack();

  await expect(page.getByTestId(DIALOG), "one dialog, never two").toHaveCount(
    1,
  );
  expect(page.url()).toBe(designUrl);
  await page.getByTestId(STAY).tap();
  await expect(page.getByTestId(DIALOG)).toHaveCount(0);
  await expectGuardUnderTheCustomer(page);
  await pressBackAndExpectTheQuestion(page, designUrl);
});

test("tapping the language already showing leaves the guard marked: Stay and a second Back still ask, and Confirm leaves in one press", async ({
  page,
}) => {
  const { designUrl, designId } = await openTheEditorFromStepOne(page);
  await makeAnEdit(page, designId);
  const guard = await expectGuardUnderTheCustomer(page);

  await page.getByTestId("top-bar-locale").tap();
  await page.getByTestId("top-bar-locale-option-ro").tap();

  expect(page.url()).toBe(designUrl);
  const afterTheTap = await expectGuardUnderTheCustomer(page);
  expect(afterTheTap.length).toBe(guard.length);
  await pressBackAndExpectTheQuestion(page, designUrl);
  await page.getByTestId(STAY).tap();
  await expect(page.getByTestId(DIALOG)).toHaveCount(0);
  await pressBackAndExpectTheQuestion(page, designUrl);
  await page.getByTestId(CONFIRM).tap();

  await expectStepOneWithTheRoomFilled(page);
});

test("two quick taps on Confirm leave once: Step 1, never the page before it", async ({
  page,
}) => {
  const { designUrl, designId } = await openTheEditorFromStepOne(page);
  await makeAnEdit(page, designId);
  await expectGuardUnderTheCustomer(page);
  await pressBackAndExpectTheQuestion(page, designUrl);

  await page.getByTestId(CONFIRM).evaluate((button: HTMLElement) => {
    button.click();
    button.click();
  });

  await expectStepOneWithTheRoomFilled(page);
  await page.waitForTimeout(500);
  expect(new URL(page.url()).pathname).toBe(roomPath("ro"));
});

test("never a trap: with the question open a second Back reaches Step 1, and so does Back, Stay, Back, Back", async ({
  page,
}) => {
  const { designUrl, designId } = await openTheEditorFromStepOne(page);
  await makeAnEdit(page, designId);
  await expectGuardUnderTheCustomer(page);

  await pressBackAndExpectTheQuestion(page, designUrl);
  await page.goBack();
  await expectStepOneWithTheRoomFilled(page);
  await expect(page.getByTestId(DIALOG)).toHaveCount(0);

  await page.goForward();
  await expect(page).toHaveURL(designUrl);
  await expectTheEditorToBeReady(page);
  await page.goForward();
  await expect(page).toHaveURL(designUrl);
  await expect(page.getByTestId(DIALOG)).toHaveCount(0);

  await page.goBack();
  await page.goBack();
  await expectStepOneWithTheRoomFilled(page);
});

test("Back, Stay, Back, Back reaches Step 1 in two presses after the stay", async ({
  page,
}) => {
  const { designUrl, designId } = await openTheEditorFromStepOne(page);
  await makeAnEdit(page, designId);
  await expectGuardUnderTheCustomer(page);
  await pressBackAndExpectTheQuestion(page, designUrl);
  await page.getByTestId(STAY).tap();
  await expect(page.getByTestId(DIALOG)).toHaveCount(0);

  await pressBackAndExpectTheQuestion(page, designUrl);
  await page.goBack();

  await expectStepOneWithTheRoomFilled(page);
});

test("an untouched kitchen is left by Back without a question", async ({
  page,
}) => {
  const { designUrl } = await openTheEditorFromStepOne(page);
  const entry = await readHistory(page);
  expect(entry.isGuard, "no guard before an edit").toBe(false);

  await page.goBack();

  await expectStepOneWithTheRoomFilled(page);
  await expect(page.getByTestId(DIALOG)).toHaveCount(0);
  expect(page.url()).not.toBe(designUrl);
});

test("Forward never asks", async ({ page }) => {
  const { designUrl, designId } = await openTheEditorFromStepOne(page);
  await makeAnEdit(page, designId);
  await expectGuardUnderTheCustomer(page);
  await pressBackAndExpectTheQuestion(page, designUrl);

  await page.goForward();

  await expect(page.getByTestId(DIALOG)).toHaveCount(0);
  expect(page.url()).toBe(designUrl);
  expect((await readHistory(page)).isGuard).toBe(true);
});

test("a reload does not ask, adds no entry, and leaves Step 1 two Backs away; nor does it raise a leave-page prompt", async ({
  page,
}) => {
  const { designUrl, designId } = await openTheEditorFromStepOne(page);
  await makeAnEdit(page, designId);
  const guard = await expectGuardUnderTheCustomer(page);
  const prompts = recordPrompts(page);

  await page.reload();
  await expectTheEditorToBeReady(page);

  expect(page.url()).toBe(designUrl);
  const afterReload = await readHistory(page);
  expect(afterReload.length).toBe(guard.length);
  expect(afterReload.isGuard, "a reload keeps the marker, not the module").toBe(
    true,
  );
  await makeAnEdit(page, designId);
  expect((await readHistory(page)).length).toBe(guard.length);

  await page.goBack();
  await expectTheEditorToBeReady(page);
  expect(page.url()).toBe(designUrl);
  await expect(page.getByTestId(DIALOG)).toHaveCount(0);
  await page.goBack();

  await expectStepOneWithTheRoomFilled(page);
  await expect(page.getByTestId(DIALOG)).toHaveCount(0);
  expect(prompts).toEqual([]);
});

function recordPrompts(page: Page): readonly string[] {
  const prompts: string[] = [];
  page.on("dialog", (dialog: Dialog) => {
    prompts.push(`${dialog.type()}: ${dialog.message()}`);
    void dialog.dismiss();
  });
  return prompts;
}

for (const reachedBy of ["its link", "resume"] as const) {
  test(`an editor opened from ${reachedBy} pushes no guard and its Back does not ask`, async ({
    page,
    seededDesign,
  }) => {
    await page.goto(roomPath("ro"));
    if (reachedBy === "its link") await openSeededDesign(page, seededDesign);
    else await page.goto("/ro");
    await expect(page).toHaveURL(`/ro/d/${seededDesign.id}`);
    await expectTheEditorToBeReady(page);
    const before = await readHistory(page);

    await makeAnEdit(page, seededDesign.id);

    const after = await readHistory(page);
    expect(after.length).toBe(before.length);
    expect(after.isGuard).toBe(false);
    await page.goBack();
    await expect(page.getByTestId(DIALOG)).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe(roomPath("ro"));
  });
}

test("one guard per visit: a language switch before the first edit, and the question that follows", async ({
  page,
}) => {
  const { designId } = await openTheEditorFromStepOne(page);
  const atHandOff = await readHistory(page);
  await switchLanguageTo(page, "ru");
  const switchedUrl = page.url();
  expect(new URL(switchedUrl).pathname).toBe(`/ru/d/${designId}`);
  expect((await readHistory(page)).length).toBe(atHandOff.length + 1);

  await makeAnEdit(page, designId);
  const guard = await expectGuardUnderTheCustomer(page);
  expect(guard.length, "one entry for the switch, one for the guard").toBe(
    atHandOff.length + 2,
  );
  await makeAnEdit(page, designId);
  expect((await readHistory(page)).length).toBe(guard.length);
  await pressBackAndExpectTheQuestion(page, switchedUrl);
  await page.getByTestId(CONFIRM).tap();

  await expectStepOneWithTheRoomFilled(page);
  expect(
    new URL(page.url()).pathname,
    "Confirm passes the older-language editor entry and reaches Step 1",
  ).toBe(roomPath("ro"));
});

test("after a language switch before the first edit, a second Back with the question open also reaches Step 1", async ({
  page,
}) => {
  const { designId } = await openTheEditorFromStepOne(page);
  await switchLanguageTo(page, "ru");
  const switchedUrl = page.url();
  await makeAnEdit(page, designId);
  await expectGuardUnderTheCustomer(page);
  await pressBackAndExpectTheQuestion(page, switchedUrl);

  await page.goBack();

  await expectStepOneWithTheRoomFilled(page);
  await expect(page.getByTestId(DIALOG)).toHaveCount(0);
});

test("one guard per visit: a language switch after the guard, a persisted pageshow, and Back landing on the question", async ({
  page,
}) => {
  const { designUrl, designId } = await openTheEditorFromStepOne(page);
  await makeAnEdit(page, designId);
  const guard = await expectGuardUnderTheCustomer(page);

  await switchLanguageTo(page, "ru");
  await makeAnEdit(page, designId);
  expect((await readHistory(page)).length, "the switch's entry only").toBe(
    guard.length + 1,
  );

  await returnFromAnotherSite(page);
  expect((await readHistory(page)).length).toBe(guard.length + 1);

  await page.goBack();
  await expect(page).toHaveURL(designUrl);
  await expect(page.getByTestId(DIALOG)).toHaveCount(0);
  await pressBackAndExpectTheQuestion(page, designUrl);
  await page.getByTestId(STAY).tap();
  await expect(page.getByTestId(DIALOG)).toHaveCount(0);
  expect((await readHistory(page)).length).toBe(guard.length + 1);
});

async function switchLanguageTo(page: Page, locale: "ro" | "ru") {
  await page.getByTestId("top-bar-locale").tap();
  await page.getByTestId(`top-bar-locale-option-${locale}`).tap();
  await expect(page).toHaveURL(new RegExp(`/${locale}/d/`));
  await expectTheEditorToBeReady(page);
}

/** What a bfcache restore tells the page: `pageshow` with `persisted`, which Next answers by
 *  restoring its router from `history.state`. Chromium under automation does not use the cache, so the
 *  event is the part of the return that can be delivered. */
async function returnFromAnotherSite(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    );
  });
  await expectTheEditorToBeReady(page);
}
