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
  goBackAndSettle,
  goForwardAndSettle,
  readBottomRegion,
  recordRequests,
  REVIEW_BOTTOM,
  REVIEW_CTA,
  contactPath,
  reviewPath,
  SAVE_WAIT,
  tabThroughTheReview,
  toTheDesignApi,
  touchTheMiddleOf,
} from "./support/qa-8d-review";
import {
  FIRST_FRAME_FREEZE_TIMEOUT_MS,
  openSeededDesign,
  test,
} from "./support/seeded-design";
import { U_MIDDLE, seedKitchen } from "./support/ssr-html";
import { seedDesign } from "./support/u-design";

const FIGURE = '[data-section="figure"]';
const SETTINGS_ROW = '[data-section="settingsRow"]';
/** Longer than the coalescer's first retries (0.5 s, 1 s, 2 s), so "still off" is read after it has tried again. */
const SEVERAL_RETRIES_MS = 4000;

/** Long enough for a navigation a tap had started to have shown in the address. */
const TAP_SETTLE_MS = 400;

/** The reads of the design's API among `requests`: a save this tab's editor already owed is not the review's. */
function readsOfTheDesign(
  requests: ReturnType<typeof recordRequests>,
  designId: string,
): readonly unknown[] {
  return toTheDesignApi(requests, designId).filter(
    (request) => request.method === "GET",
  );
}

/** Long enough for a request the arrival had caused to have left. */
const REQUEST_SETTLE_MS = 1500;

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
    contactPath("ro", seededDesign.id),
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
    contactPath("ro", seededDesign.id),
    { timeout: 15_000 },
  );
  await expect(page.getByTestId(SAVE_WAIT)).toHaveCount(0);
  expect(await isStillTheMarkedDocument(page)).toBe(true);
});

const REFUSED_SAVES: readonly (readonly [string, number, string])[] = [
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
    // Only a conflict is settled in the editor; these draw no link there.
    await expect(page.getByTestId("review-open-editor")).toHaveCount(0);
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
      contactPath("ro", seededDesign.id),
    );
  });
}

test("a conflicted save: the review says in its own words that the choice is made in the editor and links there, never naming a reload or an overwrite it does not have; the link opens the editor still in conflict", async ({
  page,
  seededDesign,
}) => {
  await openSeededDesign(page, seededDesign);
  await answerSavesWith(page, seededDesign.id, refuseWith(409));

  await editThenOpenTheReviewAtOnce(page, seededDesign.id);

  await expectCallToActionOffBecauseOf(
    page,
    APPROVED_ROMANIAN_MESSAGES.reviewScreen.conflict,
  );
  const foot = page.getByTestId(REVIEW_BOTTOM);
  await expect(foot).not.toContainText(
    APPROVED_ROMANIAN_MESSAGES.panel.saveConflictNotice,
  );
  const openEditor = foot.getByRole("link", {
    name: APPROVED_ROMANIAN_MESSAGES.reviewScreen.openEditor,
    exact: true,
  });
  await expect(openEditor).toBeInViewport();
  expect((await openEditor.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await page.waitForTimeout(SEVERAL_RETRIES_MS);
  await expectCallToActionOffBecauseOf(
    page,
    APPROVED_ROMANIAN_MESSAGES.reviewScreen.conflict,
  );

  const firstBody = new URL(
    (await page
      .getByTestId("review-group-edit")
      .first()
      .getAttribute("href")) ?? "",
    page.url(),
  ).searchParams.get("select");
  expect(firstBody).not.toBeNull();
  await expect(openEditor).toHaveAttribute(
    "href",
    `/ro/d/${seededDesign.id}?select=${String(firstBody)}`,
  );

  await openEditor.tap();
  await page.waitForURL(`/ro/d/${seededDesign.id}`);

  await expectTheConflictOnScreen(page);
  await expect(page.getByTestId("selection-debug")).toHaveAttribute(
    "data-selection-id",
    String(firstBody),
  );
});

/** The editor's own conflict notice with both of its controls, drawn and inside the phone, with no further tap. In
 *  a U the body, and so the panel, arrives once the scene rests: ADR 0144's bound. */
async function expectTheConflictOnScreen(page: Page): Promise<void> {
  for (const control of ["panel-conflict-reload", "panel-conflict-overwrite"]) {
    await expect(page.getByTestId(control)).toBeInViewport({
      timeout: FIRST_FRAME_FREEZE_TIMEOUT_MS,
    });
  }
  await expect(page.getByTestId("panel-notice")).toContainText(
    APPROVED_ROMANIAN_MESSAGES.panel.saveConflictNotice,
  );
  await expect(page.getByTestId("selection-debug")).toHaveAttribute(
    "data-save-status",
    "conflict",
  );
}

test("in a U, the conflict link arrives with the editor's conflict notice and both its controls on screen", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const minted: string[] = [];
  try {
    const kitchen = await seedKitchen(page, minted, U_MIDDLE);
    await openSeededDesign(page, kitchen);
    await answerSavesWith(page, kitchen.id, refuseWith(409));
    await editThenOpenTheReviewAtOnce(page, kitchen.id);

    await page.getByTestId("review-open-editor").tap();
    await page.waitForURL(`/ro/d/${kitchen.id}`);

    await expectTheConflictOnScreen(page);
  } finally {
    await deleteMintedDesigns(minted);
  }
});

// The Russian the foot must show, written out so the page is not compared with the catalogue it reads.
const RUSSIAN_CONFLICT =
  "Кухню изменили в другой вкладке или на другом устройстве, поэтому твоё изменение не сохранено. Выбери в редакторе, какую версию оставить, и тогда запрашивай предложение.";
const RUSSIAN_OPEN_EDITOR = "Открыть редактор";

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
    expect(region.sentences[2]).toBe(RUSSIAN_CONFLICT);
    await expect(
      page.getByTestId(REVIEW_BOTTOM).getByRole("link", {
        name: RUSSIAN_OPEN_EDITOR,
        exact: true,
      }),
    ).toBeInViewport();
    expect(region.height).toBeLessThanOrEqual(region.viewportHeight / 2);
    await captureEvidence(page, "save-wait-tallest-foot-ru");
    const tabbed = await tabThroughTheReview(page);
    console.log(`FOCUS three sentences ru ${JSON.stringify(tabbed)}`);
    expect(tabbed.focused).toBeGreaterThan(10);
    expect(tabbed.leastRoomAbove, tabbed.lowest).toBeGreaterThanOrEqual(0);

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
    contactPath("ro", seededDesign.id),
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

test("with the design changed and saved in another tab, the review reached from this tab's untouched editor shows the saved design, ready, and asks nothing of the design's API to do so", async ({
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
  const settingsTheServerHolds =
    (await otherTab.locator(SETTINGS_ROW).textContent()) ?? "";
  const figureTheServerHolds =
    (await otherTab.locator(FIGURE).textContent()) ?? "";

  await page.bringToFront();
  const requests = recordRequests(page);
  await page.getByTestId(REVIEW_CTA).tap();
  await page.waitForURL(reviewPath("ro", seededDesign.id));
  await expectReviewDrawn(page);

  await expect(page.locator(SETTINGS_ROW)).toHaveText(settingsTheServerHolds);
  await expect(page.locator(FIGURE)).toHaveText(figureTheServerHolds);
  await expect(page.getByTestId(SAVE_WAIT)).toHaveCount(0);
  await expect(page.getByTestId(REVIEW_CTA)).toHaveAttribute(
    "href",
    contactPath("ro", seededDesign.id),
  );
  await page.waitForTimeout(REQUEST_SETTLE_MS);
  expect(toTheDesignApi(requests, seededDesign.id)).toEqual([]);
});

test("a stale tab holding an edit of its own keeps that edit on the review, with the call to action off: the page's newer copy does not replace an unsaved one", async ({
  page,
  context,
  seededDesign,
}) => {
  await openSeededDesign(page, seededDesign);
  const otherTab = await context.newPage();
  await otherTab.goto(`/ro/d/${seededDesign.id}?select=p4`);
  await expect(otherTab.getByTestId("width-step-narrower")).toBeEnabled({
    timeout: FIRST_FRAME_FREEZE_TIMEOUT_MS,
  });
  const savedElsewhere = otherTab.waitForResponse(
    (response) =>
      response.request().method() !== "GET" &&
      new URL(response.url()).pathname === `/api/designs/${seededDesign.id}`,
  );
  await otherTab.getByTestId("width-step-narrower").tap();
  await savedElsewhere;
  const priceTheServerHolds =
    (await otherTab.getByTestId("price-bar-total").textContent()) ?? "";

  await page.bringToFront();
  let releaseTheSave: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    releaseTheSave = resolve;
  });
  await answerSavesWith(page, seededDesign.id, async (route) => {
    await held;
    await route.continue();
  });
  await chooseAnotherHardwareTier(page);
  const priceWithThisTabsEdit =
    (await page.getByTestId("price-bar-total").textContent()) ?? "";
  expect(priceWithThisTabsEdit).not.toBe(priceTheServerHolds);
  const requests = recordRequests(page);
  await page.getByTestId(REVIEW_CTA).tap();
  await page.waitForURL(reviewPath("ro", seededDesign.id));
  await expectReviewDrawn(page);

  await expect(page.getByTestId(SAVE_WAIT)).toBeVisible();
  await expect(page.getByTestId(REVIEW_CTA)).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect(page.locator(FIGURE)).toContainText(priceWithThisTabsEdit);
  await page.waitForTimeout(REQUEST_SETTLE_MS);
  expect(readsOfTheDesign(requests, seededDesign.id)).toEqual([]);
  releaseTheSave();
});

test("a review restored by Forward after a later save keeps the newer copy: the page Next restores is older than the store and does not replace it", async ({
  page,
  seededDesign,
}) => {
  await openSeededDesign(page, seededDesign);
  await page.getByTestId(REVIEW_CTA).tap();
  await expectReviewDrawn(page);
  const settingsBefore = (await page.locator(SETTINGS_ROW).textContent()) ?? "";

  await goBackAndSettle(page);
  await expect(page.getByTestId("top-bar-title")).toBeVisible();
  await chooseAnotherHardwareTierAndSave(page, seededDesign.id);
  const priceAfterTheSave =
    (await page.getByTestId("price-bar-total").textContent()) ?? "";
  const requests = recordRequests(page);
  await goForwardAndSettle(page);
  await expect(page).toHaveURL(reviewPath("ro", seededDesign.id));
  await expectReviewDrawn(page);
  await page.waitForTimeout(REQUEST_SETTLE_MS);
  expect(readsOfTheDesign(requests, seededDesign.id)).toEqual([]);

  await expect(page.locator(SETTINGS_ROW)).not.toHaveText(settingsBefore);
  await expect(page.locator(FIGURE)).toContainText(priceAfterTheSave);
  await expect(page.getByTestId(SAVE_WAIT)).toHaveCount(0);
  await expect(page.getByTestId(REVIEW_CTA)).toHaveAttribute(
    "href",
    contactPath("ro", seededDesign.id),
  );
});

/** Saves the stored document over itself, unchanged, until the design stands at `revision`. */
async function saveUntilRevision(
  page: Page,
  designId: string,
  revision: string,
): Promise<void> {
  const reached = await page.evaluate(
    async ({ id, wanted }) => {
      const loaded = await fetch(`/api/designs/${id}`);
      const stored = (await loaded.json()) as {
        design: unknown;
        revision: string;
      };
      let held = stored.revision;
      for (let saves = 0; saves < 20 && held !== wanted; saves += 1) {
        const saved = await fetch(`/api/designs/${id}`, {
          method: "PUT",
          credentials: "same-origin",
          headers: {
            "content-type": "application/json",
            "x-expected-revision": held,
          },
          body: JSON.stringify(stored.design),
        });
        if (!saved.ok) return `PUT answered ${String(saved.status)}`;
        ({ revision: held } = (await saved.json()) as { revision: string });
      }
      return held;
    },
    { id: designId, wanted: revision },
  );
  if (reached !== revision)
    throw new Error(
      `saveUntilRevision: reached ${reached}, wanted ${revision}`,
    );
}

test("a tab that last heard revision 9 is stale against a page at revision 10: the revisions are compared as numbers, not as text", async ({
  page,
  context,
  seededDesign,
}) => {
  await page.goto("/ro/configurator/room");
  await saveUntilRevision(page, seededDesign.id, "9");
  await openSeededDesign(page, seededDesign);
  const otherTab = await context.newPage();
  await openSeededDesign(otherTab, seededDesign);
  await chooseAnotherHardwareTierAndSave(otherTab, seededDesign.id);
  const priceTheServerHolds =
    (await otherTab.getByTestId("price-bar-total").textContent()) ?? "";
  const revisionTheServerHolds = await otherTab.evaluate(async (id) => {
    const loaded = await fetch(`/api/designs/${id}`);
    return ((await loaded.json()) as { revision: string }).revision;
  }, seededDesign.id);
  expect(revisionTheServerHolds).toBe("10");

  await page.bringToFront();
  const priceThisTabHeld =
    (await page.getByTestId("price-bar-total").textContent()) ?? "";
  expect(priceThisTabHeld).not.toBe(priceTheServerHolds);
  const requests = recordRequests(page);
  await page.getByTestId(REVIEW_CTA).tap();
  await page.waitForURL(reviewPath("ro", seededDesign.id));
  await expectReviewDrawn(page);

  await expect(page.locator(FIGURE)).toContainText(priceTheServerHolds);
  await page.waitForTimeout(REQUEST_SETTLE_MS);
  expect(toTheDesignApi(requests, seededDesign.id)).toEqual([]);
});
