// Leaving a design while its write waits for the limit on saves, and coming back to it without a full load, at
// 390 x 844 by touch: every way a customer has of going away and returning inside the app. The save is refused in the
// browser by route interception with the module's own 429 and a short wait, so the wait's end is seen and the limiter's
// counters are not touched. The rule each way is held to: the design that returns is the one that waits, shown as
// waiting, and the one write sent when the wait ends holds the edit made before leaving and the one made after.
//
// The last three tests are what the wait's own rule does not reach: the review step with a write that was handed back,
// and a design returned to by Back after its write has already gone.
//
// **Must not run concurrently with any other persistence live run**: each test mints one or two rows, deleted by its
// fixture's teardown (ADR 0006).
import { expect, type Page, type Route } from "@playwright/test";

import { APPROVED_ROMANIAN_MESSAGES } from "../support/approved-romanian-messages";

import {
  chooseAnotherHardwareTier,
  chooseAnotherHardwareTierAndSave,
  expectEditorReady,
  expectReviewDrawn,
  goBackAndSettle,
  hardwareTierInTheStore,
  openEditorFromStepOne,
  REVIEW_CTA,
  reviewPath,
  SAVE_WAIT,
  type EditorVisit,
} from "./support/qa-8d-review";
import { CONFIRM, DIALOG, press } from "./support/qa-m7c-c1-s3-back";
import {
  continueButton,
  editorPath,
  findBaseRowTapTarget,
  roomScreen,
  test,
} from "./support/step-one-by-touch";

const SAVE_LIMIT_BODY = JSON.stringify({
  error: "The limit on saving is reached for now.",
  code: "SAVE_LIMIT_REACHED",
});
/** Longer than the slowest way away and back (Step 1, a second design made there, two steps of history), so the
 *  return is always inside the wait. */
const WAIT_SECONDS = 25;
const WAIT_MS = WAIT_SECONDS * 1000;
/** Shorter than the way to a second design, so the write has gone before the first design is returned to. */
const WAIT_THAT_ENDS_WHILE_AWAY_SECONDS = 5;
const PAUSE_SENTENCE = APPROVED_ROMANIAN_MESSAGES.panel.savePausedNotice;
/** The wait and the answer of the write that ends it. */
const WAIT_END_TIMEOUT_MS = WAIT_MS + 15_000;
const TEST_TIMEOUT_MS = 180_000;
const SAME_DOCUMENT_MARK = "qaLeaveWhileWaitingSameDocument";
const ROOM_URL = /\/ro\/configurator\/room/;
const EDITOR_URL = /\/ro\/d\/[^/]+$/;
const MATERIAL_GROUP_INDEX = 0;
const TAP_LANDS_WITHIN_MS = 1500;
const SCENE_BACK_WITHIN_MS = 20_000;

interface TierSettings {
  readonly hardwareTierId?: string;
  readonly materialTierId?: string;
}

interface SaveSeen {
  readonly atMs: number;
  readonly settings: TierSettings;
}

/** Answers the design's first save as the limit does and lets every later one through to the server. */
async function refuseTheFirstSave(
  page: Page,
  designId: string,
  waitSeconds: number,
): Promise<SaveSeen[]> {
  const saves: SaveSeen[] = [];
  await page.route(`**/api/designs/${designId}`, async (route: Route) => {
    const request = route.request();
    if (request.method() !== "PUT" && request.method() !== "PATCH") {
      await route.continue();
      return;
    }
    saves.push({ atMs: Date.now(), settings: settingsIn(request.postData()) });
    if (saves.length > 1) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 429,
      contentType: "application/json",
      headers: { "Retry-After": String(waitSeconds) },
      body: SAVE_LIMIT_BODY,
    });
  });
  return saves;
}

function settingsIn(body: string | null): TierSettings {
  const design = JSON.parse(body ?? "{}") as { settings?: TierSettings };
  return design.settings ?? {};
}

async function storedSettings(
  page: Page,
  designId: string,
): Promise<TierSettings> {
  return page.evaluate(async (id: string) => {
    const response = await fetch(`/api/designs/${id}`, {
      credentials: "same-origin",
    });
    const payload = (await response.json()) as {
      design: { settings?: TierSettings };
    };
    return payload.design.settings ?? {};
  }, designId);
}

async function markThisDocument(page: Page): Promise<void> {
  await page.evaluate(
    (mark) => Reflect.set(window, mark, true),
    SAME_DOCUMENT_MARK,
  );
}

/** False after any full load: a new document has no mark. */
async function isTheMarkedDocument(page: Page): Promise<boolean> {
  return page.evaluate(
    (mark) => Reflect.get(window, mark) === true,
    SAME_DOCUMENT_MARK,
  );
}

function saveStatus(page: Page) {
  return expect(page.getByTestId("selection-debug"));
}

async function materialTierInTheStore(page: Page): Promise<string> {
  const tier = await page
    .getByTestId("selection-debug")
    .getAttribute("data-material-tier");
  return tier ?? "";
}

/** A second edit to another setting than the first, so a write that holds both can be told from one holding either. */
async function chooseAnotherMaterial(page: Page): Promise<void> {
  await press(page, page.getByTestId("global-settings-trigger"));
  const material = page
    .getByTestId("global-settings-group")
    .nth(MATERIAL_GROUP_INDEX);
  await press(
    page,
    material.locator('input[type="radio"]:not(:checked)').last(),
  );
  await press(page, page.getByTestId("global-settings-apply"));
  await expect(page.getByTestId("global-settings-surface")).toHaveCount(0);
}

/** The panel is where the editor says a write waits, and it is open only with a body selected. A scene that has just
 *  come back is not yet where its readout says, so the tap is made again until it lands. */
async function selectABody(page: Page): Promise<void> {
  await expect(async () => {
    const body = await findBaseRowTapTarget(page);
    await page.touchscreen.tap(body.x, body.y);
    await expect(page.getByTestId("editor-panel")).toBeVisible({
      timeout: TAP_LANDS_WITHIN_MS,
    });
  }).toPass({ timeout: SCENE_BACK_WITHIN_MS });
}

async function toStepOneByTheBackLink(page: Page): Promise<void> {
  await press(page, page.getByTestId("bottom-bar-back"));
  await expect(page.getByTestId(DIALOG)).toBeVisible();
  await press(page, page.getByTestId(CONFIRM));
  await page.waitForURL(ROOM_URL);
  await expect(roomScreen(page)).toBeVisible();
}

/** Step 1 reopened from the editor still holds the room that was typed, so one press makes a second design. */
async function makeAnotherDesignFromStepOne(page: Page): Promise<void> {
  await press(page, continueButton(page));
  await page.waitForURL(EDITOR_URL);
  await expectEditorReady(page);
}

async function toTheReviewByItsLink(
  page: Page,
  designId: string,
): Promise<void> {
  await press(page, page.getByTestId(REVIEW_CTA));
  await page.waitForURL(reviewPath("ro", designId));
  await expectReviewDrawn(page);
}

async function chooseLanguage(
  page: Page,
  locale: "ro" | "ru",
  designId: string,
): Promise<void> {
  await press(page, page.getByTestId("top-bar-locale"));
  await press(page, page.getByTestId(`top-bar-locale-option-${locale}`));
  await page.waitForURL(editorPath(locale, designId));
  await expectEditorReady(page);
}

interface WayAwayAndBack {
  readonly name: string;
  readonly go: (page: Page, visit: EditorVisit) => Promise<void>;
}

const WAYS_THAT_KEEP_THE_DESIGN_IN_THE_BROWSER: readonly WayAwayAndBack[] = [
  {
    name: "to the review by its link and back by the review's own link",
    go: async (page, { designId }) => {
      await toTheReviewByItsLink(page, designId);
      await press(page, page.getByTestId("review-back"));
      await page.waitForURL(EDITOR_URL);
    },
  },
  {
    name: "to the review by its link and back by the browser's Back",
    go: async (page, { designId }) => {
      await toTheReviewByItsLink(page, designId);
      await page.goBack();
      await page.waitForURL(EDITOR_URL);
    },
  },
  {
    name: "to the other language by the menu and back by the menu",
    go: async (page, { designId }) => {
      await chooseLanguage(page, "ru", designId);
      await chooseLanguage(page, "ro", designId);
    },
  },
  {
    name: "to Step 1 by the back link and its question, then the browser's Back",
    go: async (page) => {
      await toStepOneByTheBackLink(page);
      await page.goBack();
      await page.waitForURL(EDITOR_URL);
    },
  },
  {
    name: "to Step 1 by the browser's Back and its question, then Forward",
    go: async (page) => {
      await goBackAndSettle(page);
      await press(page, page.getByTestId(CONFIRM));
      await page.waitForURL(ROOM_URL);
      await page.goForward();
      await page.waitForURL(EDITOR_URL);
    },
  },
];

/** The one way that puts another design in the editor between leaving and returning. */
const BY_WAY_OF_ANOTHER_DESIGN: WayAwayAndBack = {
  name: "to Step 1, a second design made there, then the browser's Back twice",
  go: async (page, { editorUrl }) => {
    await toStepOneByTheBackLink(page);
    await makeAnotherDesignFromStepOne(page);
    await page.goBack();
    await page.waitForURL(ROOM_URL);
    await page.goBack();
    await page.waitForURL(editorUrl);
  },
};

const BACK_ONCE: WayAwayAndBack = {
  name: "the browser's Back once more",
  go: async (page, { editorUrl }) => {
    await page.goBack();
    await page.waitForURL(editorUrl);
  },
};

interface WaitingVisit extends EditorVisit {
  readonly saves: SaveSeen[];
  readonly editedHardwareTier: string;
}

/** The editor reached from Step 1, one edit made, its save refused: the write waits. */
async function editAndBeRefused(
  page: Page,
  waitSeconds = WAIT_SECONDS,
): Promise<WaitingVisit> {
  const visit = await openEditorFromStepOne(page);
  await markThisDocument(page);
  const saves = await refuseTheFirstSave(page, visit.designId, waitSeconds);
  await chooseAnotherHardwareTier(page);
  await saveStatus(page).toHaveAttribute("data-save-status", "error");
  return {
    ...visit,
    saves,
    editedHardwareTier: await hardwareTierInTheStore(page),
  };
}

async function leaveAndReturn(
  page: Page,
  way: WayAwayAndBack,
  visit: EditorVisit,
): Promise<void> {
  await way.go(page, visit);
  expect(page.url()).toBe(visit.editorUrl);
  await expectEditorReady(page);
}

async function expectTheWaitingDesignOnTheScreen(
  page: Page,
  waiting: WaitingVisit,
): Promise<void> {
  expect
    .soft(await hardwareTierInTheStore(page))
    .toBe(waiting.editedHardwareTier);
  await expect
    .soft(page.getByTestId("selection-debug"))
    .toHaveAttribute("data-save-status", "error", { timeout: 1 });
  await selectABody(page);
  await expect
    .soft(page.getByTestId("panel-notice"))
    .toHaveAttribute("data-notice", "save-paused");
}

async function expectTheWaitEnded(page: Page): Promise<void> {
  await saveStatus(page).toHaveAttribute("data-save-status", "idle", {
    timeout: WAIT_END_TIMEOUT_MS,
  });
}

const THE_RULE_WITH_A_LATER_EDIT =
  "the edit returns as waiting and one write stores it with a later edit";
const THE_RULE_WITH_NO_LATER_EDIT =
  "with no edit after, what is stored when the wait ends is what the screen shows, and the next edit is saved";

for (const way of [
  ...WAYS_THAT_KEEP_THE_DESIGN_IN_THE_BROWSER,
  BY_WAY_OF_ANOTHER_DESIGN,
]) {
  test(`while a save waits, ${way.name}: ${THE_RULE_WITH_A_LATER_EDIT}`, async ({
    page,
    designWrites,
  }) => {
    test.setTimeout(TEST_TIMEOUT_MS);
    // Fixtures are lazy: asking for this one is what deletes the rows the hand-overs mint.
    await Promise.resolve(designWrites);
    const waiting = await editAndBeRefused(page);

    await leaveAndReturn(page, way, waiting);

    expect(await isTheMarkedDocument(page)).toBe(true);
    await expectTheWaitingDesignOnTheScreen(page, waiting);
    await chooseAnotherMaterial(page);
    const editedMaterialTier = await materialTierInTheStore(page);
    await expectTheWaitEnded(page);
    const bothEdits = {
      hardwareTierId: waiting.editedHardwareTier,
      materialTierId: editedMaterialTier,
    };
    expect(waiting.saves).toHaveLength(2);
    const [refused, sent] = waiting.saves;
    expect((sent?.atMs ?? 0) - (refused?.atMs ?? 0)).toBeGreaterThanOrEqual(
      WAIT_MS,
    );
    expect(sent?.settings).toMatchObject(bothEdits);
    expect(await storedSettings(page, waiting.designId)).toMatchObject(
      bothEdits,
    );
  });
}

test(`while a save waits, ${BY_WAY_OF_ANOTHER_DESIGN.name}: ${THE_RULE_WITH_NO_LATER_EDIT}`, async ({
  page,
  designWrites,
}) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  // Fixtures are lazy: asking for this one is what deletes the rows the hand-overs mint.
  await Promise.resolve(designWrites);
  const waiting = await editAndBeRefused(page);
  await leaveAndReturn(page, BY_WAY_OF_ANOTHER_DESIGN, waiting);

  await expect
    .poll(() => waiting.saves.length, { timeout: WAIT_END_TIMEOUT_MS })
    .toBe(2);
  await expectTheWaitEnded(page);

  const stored = await storedSettings(page, waiting.designId);
  expect
    .soft(stored.hardwareTierId ?? "")
    .toBe(await hardwareTierInTheStore(page));
  await chooseAnotherMaterial(page);
  await expect
    .poll(() => waiting.saves.length, { timeout: WAIT_END_TIMEOUT_MS })
    .toBe(3);
  await expectTheWaitEnded(page);
  expect(await storedSettings(page, waiting.designId)).toMatchObject({
    hardwareTierId: waiting.editedHardwareTier,
    materialTierId: await materialTierInTheStore(page),
  });
});

/** The paused sentence's words with its time left open: the clock is the browser's, and the test does not read it. */
function pauseSentencePattern(): RegExp {
  const [before, after] = PAUSE_SENTENCE.split("{time}");
  const escaped = (text = ""): string =>
    text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped(before)}\\d{2}:\\d{2}${escaped(after)}$`);
}

test("the review of a design whose waiting write was handed back says the pause and goes on only once stored", async ({
  page,
  designWrites,
}) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  // Fixtures are lazy: asking for this one is what deletes the rows the hand-overs mint.
  await Promise.resolve(designWrites);
  const waiting = await editAndBeRefused(page);
  await leaveAndReturn(page, BY_WAY_OF_ANOTHER_DESIGN, waiting);

  await toTheReviewByItsLink(page, waiting.designId);

  const callToAction = page.getByTestId(REVIEW_CTA);
  await expect(page.getByTestId(SAVE_WAIT)).toHaveText(pauseSentencePattern());
  await expect(callToAction).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByTestId("review-open-editor")).toHaveCount(0);
  await expect(page.getByTestId(SAVE_WAIT)).toHaveCount(0, {
    timeout: WAIT_END_TIMEOUT_MS,
  });
  await expect(callToAction).toHaveJSProperty("tagName", "A");
  expect(await storedSettings(page, waiting.designId)).toMatchObject({
    hardwareTierId: waiting.editedHardwareTier,
  });
});

/** Polled from whatever page is on screen: the write goes from the browser's one writer, wherever the customer is. */
async function expectStored(
  page: Page,
  designId: string,
  hardwareTierId: string,
): Promise<void> {
  await expect
    .poll(async () => (await storedSettings(page, designId)).hardwareTierId, {
      timeout: WAIT_END_TIMEOUT_MS,
    })
    .toBe(hardwareTierId);
}

/** What a design returned to must do once its edit is stored: show it, and save the next edit on top of it. */
async function expectTheStoredEditShownAndTheNextSaved(
  page: Page,
  { designId }: EditorVisit,
  storedHardwareTier: string,
): Promise<void> {
  expect.soft(await hardwareTierInTheStore(page)).toBe(storedHardwareTier);
  await chooseAnotherMaterial(page);
  const editedMaterialTier = await materialTierInTheStore(page);
  await expect
    .soft(page.getByTestId("selection-debug"))
    .not.toHaveAttribute("data-save-status", "conflict");
  await expectTheWaitEnded(page);
  expect(await storedSettings(page, designId)).toMatchObject({
    hardwareTierId: storedHardwareTier,
    materialTierId: editedMaterialTier,
  });
}

test("a write that waited and went while a second design was on screen is stored, shown on return, built on", async ({
  page,
  designWrites,
}) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  // Fixtures are lazy: asking for this one is what deletes the rows the hand-overs mint.
  await Promise.resolve(designWrites);
  const waiting = await editAndBeRefused(
    page,
    WAIT_THAT_ENDS_WHILE_AWAY_SECONDS,
  );
  await toStepOneByTheBackLink(page);
  await makeAnotherDesignFromStepOne(page);
  await expectStored(page, waiting.designId, waiting.editedHardwareTier);

  await page.goBack();
  await page.waitForURL(ROOM_URL);
  await leaveAndReturn(page, BACK_ONCE, waiting);

  await expectTheStoredEditShownAndTheNextSaved(
    page,
    waiting,
    waiting.editedHardwareTier,
  );
});

test("with no limit met, a saved edit is shown when Back returns to its design from a second one, built on", async ({
  page,
  designWrites,
}) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  // Fixtures are lazy: asking for this one is what deletes the rows the hand-overs mint.
  await Promise.resolve(designWrites);
  const visit = await openEditorFromStepOne(page);
  await chooseAnotherHardwareTierAndSave(page, visit.designId);
  const savedHardwareTier = await hardwareTierInTheStore(page);

  await leaveAndReturn(page, BY_WAY_OF_ANOTHER_DESIGN, visit);

  await expectTheStoredEditShownAndTheNextSaved(page, visit, savedHardwareTier);
});
