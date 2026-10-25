// The review's scene under a thumb, 390 x 844 with real touch: it is looked at and not handled. A swipe that starts
// on it scrolls the page, a drag turns nothing, a tap selects nothing, the chips change the view, and leaving the
// review gives the WebGL context back.
//
// Every "nothing moved" below is a count of changed pixels, and each test first makes the same count see a change
// (a chip tapped), so a count of zero is a scene that stood still and not a capture that sees nothing.
//
// **Must not run concurrently with any other persistence live run**: each test mints rows and deletes them (ADR 0006).
import { NARROWED_ROOM_OVERFLOWING_DESIGN } from "@lemnaria/configurator-domain";
import { expect, type Locator, type Page } from "@playwright/test";

import { APPROVED_ROMANIAN_MESSAGES } from "../support/approved-romanian-messages";
import { deleteMintedDesigns } from "./support/minted-designs";
import { readSelection } from "./support/panel";
import {
  capturePatch,
  countChangedPixels,
  countPixels,
  type CapturedPatch,
  type PixelRect,
} from "./support/pixels";
import {
  captureEvidence,
  centreOf,
  expectEditorReady,
  expectSceneMounted,
  goBackAndSettle,
  goForwardAndSettle,
  mostCanvasesSeen,
  openReview,
  readSceneContexts,
  recordRequests,
  refuseWebGL,
  REVIEW_BOTTOM,
  REVIEW_CTA,
  REVIEW_ROW,
  REVIEW_SCENE,
  contactPath,
  reviewPath,
  scrollTop,
  toTheDesignApi,
  touchDrag,
  trackSceneContexts,
  watchCanvasCount,
} from "./support/qa-8d-review";
import { openSeededDesign, test } from "./support/seeded-design";
import { seedDesign } from "./support/u-design";
import { expectEditorTopBarShown } from "./support/editor-top-bar";

/** The scene's link to the editor, by the wording the copy lock holds for it. */
const VIEW_IN_3D = APPROVED_ROMANIAN_MESSAGES.reviewScreen.view3d;
/** The camera's ease is 0.7 s; this outlasts it and the frame after. */
const VIEW_SETTLE_MS = 1800;
/** A still scene differs from itself by nothing; a moved camera by tens of thousands. Measured on this fixture. */
const STILL_SCENE_MAX_CHANGED_PIXELS = 60;
const MOVED_VIEW_MIN_CHANGED_PIXELS = 4000;
const PIXEL_NOISE_FLOOR = 12;
/** These journeys wait out a dozen camera eases; on a busy machine that passes the default half minute. */
const LONG_JOURNEY_TIMEOUT_MS = 120_000;
const MOMENTUM_SETTLE_MS = 900;
/** A third of the 1 144 the mark was measured at on the narrowed kitchen in the review's 354 x 240 scene. */
const MIN_MARK_PIXELS_IN_THE_REVIEW_SCENE = 380;
/** R3F gives the context back half a second after the canvas unmounts. */
const CONTEXT_RELEASE_TIMEOUT_MS = 5000;

async function sceneClip(canvas: Locator): Promise<PixelRect> {
  const box = await canvas.boundingBox();
  if (!box) throw new Error("the review's canvas is not on the page");
  return {
    x: Math.ceil(box.x),
    y: Math.ceil(box.y),
    width: Math.floor(box.width) - 1,
    height: Math.floor(box.height) - 1,
  };
}

async function settledScene(
  page: Page,
  clip: PixelRect,
): Promise<CapturedPatch> {
  await page.waitForTimeout(VIEW_SETTLE_MS);
  return capturePatch(page, clip);
}

function chips(page: Page): Locator {
  return page.getByTestId(REVIEW_SCENE).getByRole("button");
}

/** Opens the review with its scene drawn and still, and proves the pixel count sees a camera that moves. */
async function openReviewWithAWatchedScene(
  page: Page,
  design: { readonly id: string; readonly revision: string },
): Promise<{ readonly clip: PixelRect; readonly still: CapturedPatch }> {
  await openReview(page, design);
  const canvas = await expectSceneMounted(page);
  const clip = await sceneClip(canvas);
  const overview = await settledScene(page, clip);

  await chips(page).nth(1).tap();
  const wallA = await settledScene(page, clip);
  expect(
    await countChangedPixels(page, overview, wallA, PIXEL_NOISE_FLOOR),
    "the count must see the view change before it is trusted to see none",
  ).toBeGreaterThan(MOVED_VIEW_MIN_CHANGED_PIXELS);

  return { clip, still: wallA };
}

test("a thumb swipe that starts on the scene scrolls the page, and neither a sideways touch drag nor a mouse drag turns the camera, while the editor's own scene still turns under the same drag", async ({
  page,
  seededDesign,
}) => {
  test.setTimeout(LONG_JOURNEY_TIMEOUT_MS);
  const { clip, still } = await openReviewWithAWatchedScene(page, seededDesign);
  const centre = await centreOf(page.getByTestId(REVIEW_SCENE));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight > window.innerHeight,
    ),
  ).toBe(true);
  expect(await scrollTop(page)).toBe(0);

  await touchDrag(page, centre, { x: centre.x, y: centre.y - 150 });

  await expect.poll(() => scrollTop(page)).toBeGreaterThanOrEqual(120);

  // The swipe's own momentum has to end before the page is put back at its top.
  await page.waitForTimeout(MOMENTUM_SETTLE_MS);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await expect.poll(() => scrollTop(page)).toBe(0);
  await touchDrag(
    page,
    { x: centre.x - 110, y: centre.y + 30 },
    { x: centre.x + 110, y: centre.y + 30 },
  );
  expect(await scrollTop(page)).toBe(0);
  expect(
    await countChangedPixels(
      page,
      still,
      await settledScene(page, clip),
      PIXEL_NOISE_FLOOR,
    ),
    "after a sideways touch drag",
  ).toBeLessThanOrEqual(STILL_SCENE_MAX_CHANGED_PIXELS);

  await page.mouse.move(centre.x - 90, centre.y + 30);
  await page.mouse.down();
  await page.mouse.move(centre.x + 90, centre.y + 50, { steps: 10 });
  await page.mouse.up();
  await page.mouse.wheel(0, -300);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  expect(
    await countChangedPixels(
      page,
      still,
      await settledScene(page, clip),
      PIXEL_NOISE_FLOOR,
    ),
    "after a mouse drag and a wheel",
  ).toBeLessThanOrEqual(STILL_SCENE_MAX_CHANGED_PIXELS);

  await page.getByRole("link", { name: VIEW_IN_3D, exact: true }).tap();
  await page.waitForURL(`/ro/d/${seededDesign.id}`);
  await expectEditorReady(page);
  const editorCanvas = page.locator("canvas");
  const editorClip = await sceneClip(editorCanvas);
  const editorCentre = await centreOf(editorCanvas);
  const editorBefore = await settledScene(page, editorClip);
  await touchDrag(
    page,
    { x: editorCentre.x - 110, y: editorCentre.y },
    { x: editorCentre.x + 110, y: editorCentre.y },
  );
  expect(
    await countChangedPixels(
      page,
      editorBefore,
      await settledScene(page, editorClip),
      PIXEL_NOISE_FLOOR,
    ),
    "the editor's scene under the same sideways drag",
  ).toBeGreaterThan(MOVED_VIEW_MIN_CHANGED_PIXELS);
});

/**
 * A known flake (backlog 195, 162): on a CI runner's software WebGL the still-scene count has read ~32 700 changed
 * pixels against at most 60 (CI run 38574379483, mobile shard 5/9) and passed alone. Owner's ruling 2026-10-14: this one
 * test is retried once on CI only, so a pass on the retry is reported "flaky" and not hidden. The assertions are
 * unchanged, a failure on both attempts is still a red, and no other test in the file is retried.
 */
test.describe(
  "known flake, backlog 195",
  { annotation: { type: "flake", description: "backlog 195" } },
  () => {
    test.describe.configure({ retries: process.env.CI === undefined ? 0 : 1 });

    test("a tap on a body in the review's scene selects nothing: no outline is drawn, no panel opens, the address stays, and the editor opened afterwards holds no selection", async ({
      page,
      seededDesign,
    }) => {
      const { clip, still } = await openReviewWithAWatchedScene(
        page,
        seededDesign,
      );
      const address = page.url();
      const requests = recordRequests(page);

      // Across the lower half of the scene, where the base run stands in the wall view: some of these land on a body.
      for (const offsetX of [-120, -60, 0, 60, 120]) {
        await page.touchscreen.tap(
          clip.x + clip.width / 2 + offsetX,
          clip.y + clip.height * 0.7,
        );
      }

      expect(
        await countChangedPixels(
          page,
          still,
          await settledScene(page, clip),
          PIXEL_NOISE_FLOOR,
        ),
      ).toBeLessThanOrEqual(STILL_SCENE_MAX_CHANGED_PIXELS);
      expect(page.url()).toBe(address);
      await expect(page.getByTestId("editor-panel")).toHaveCount(0);
      expect(toTheDesignApi(requests, seededDesign.id)).toEqual([]);

      await page.getByRole("link", { name: VIEW_IN_3D, exact: true }).tap();
      await page.waitForURL(`/ro/d/${seededDesign.id}`);
      await expectEditorReady(page);

      expect((await readSelection(page)).selectionId).toBe("");
      await expect(page.getByTestId("editor-panel")).toHaveCount(0);
    });
  },
);

test("each chip changes the review's view and is the one pressed, and the view chosen is the one the editor opens on and the review returns to", async ({
  page,
  seededDesign,
}) => {
  test.setTimeout(LONG_JOURNEY_TIMEOUT_MS);
  await openReview(page, seededDesign);
  const canvas = await expectSceneMounted(page);
  const clip = await sceneClip(canvas);
  let previous = await settledScene(page, clip);
  const labels = await chips(page).allTextContents();
  expect(labels.length).toBe(3);

  for (const index of [1, 2, 0, 2]) {
    await chips(page).nth(index).tap();
    const frame = await settledScene(page, clip);

    expect(
      await countChangedPixels(page, previous, frame, PIXEL_NOISE_FLOOR),
      labels[index],
    ).toBeGreaterThan(MOVED_VIEW_MIN_CHANGED_PIXELS);
    await expect(chips(page).nth(index)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(
      page.getByTestId(REVIEW_SCENE).locator('[aria-pressed="true"]'),
    ).toHaveCount(1);
    await captureEvidence(page, `scene-review-chip-${String(index)}`);
    previous = frame;
  }

  await page.getByRole("link", { name: VIEW_IN_3D, exact: true }).tap();
  await page.waitForURL(`/ro/d/${seededDesign.id}`);
  await expectEditorReady(page);
  const editorChip = (label: string): Locator =>
    page.getByRole("button", { name: label, exact: true });
  await expect(editorChip(labels[2] ?? "")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.waitForTimeout(VIEW_SETTLE_MS);
  await captureEvidence(page, "scene-editor-chip-2");

  await editorChip(labels[1] ?? "").tap();
  await page.waitForTimeout(VIEW_SETTLE_MS);
  await captureEvidence(page, "scene-editor-chip-1");
  await page.getByTestId(REVIEW_CTA).tap();
  await page.waitForURL(reviewPath("ro", seededDesign.id));
  await expectSceneMounted(page);

  await expect(chips(page).nth(1)).toHaveAttribute("aria-pressed", "true");
});

test("the review's scene marks a kitchen with bodies past its wall and marks nothing in a kitchen that fits", async ({
  page,
  seededDesign,
}) => {
  const mark = { kind: "redTint", minExcess: 50 } as const;
  const minted: string[] = [];
  try {
    await openReview(page, seededDesign);
    const fittingClip = await sceneClip(await expectSceneMounted(page));
    await page.waitForTimeout(VIEW_SETTLE_MS);
    const marksOnAKitchenThatFits = await countPixels(page, fittingClip, mark);

    const narrowed = await seedDesign(page, NARROWED_ROOM_OVERFLOWING_DESIGN);
    minted.push(narrowed.id);
    await openReview(page, narrowed);
    const narrowedClip = await sceneClip(await expectSceneMounted(page));
    await page.waitForTimeout(VIEW_SETTLE_MS);
    const marksOnAKitchenPastItsWall = await countPixels(
      page,
      narrowedClip,
      mark,
    );
    await captureEvidence(page, "scene-marks-past-the-wall");
    console.log(
      `SCENE_MARKS ${JSON.stringify({ marksOnAKitchenThatFits, marksOnAKitchenPastItsWall })}`,
    );

    expect(marksOnAKitchenThatFits).toBeLessThanOrEqual(40);
    expect(marksOnAKitchenPastItsWall).toBeGreaterThan(
      MIN_MARK_PIXELS_IN_THE_REVIEW_SCENE,
    );
  } finally {
    await deleteMintedDesigns(minted);
  }
});

test("between the editor and the review there is never a second canvas, and each scene's WebGL context is given back when its screen is left", async ({
  page,
  seededDesign,
}) => {
  await trackSceneContexts(page);
  await openSeededDesign(page, seededDesign);
  await expect(page.locator("canvas")).toHaveCount(1);
  await watchCanvasCount(page);

  const expectOneLiveSceneOf = async (made: number): Promise<void> => {
    await expect
      .poll(() => readSceneContexts(page), {
        timeout: CONTEXT_RELEASE_TIMEOUT_MS,
      })
      .toEqual({ made, live: 1 });
  };

  await expectOneLiveSceneOf(1);

  await page.getByTestId(REVIEW_CTA).tap();
  await page.waitForURL(reviewPath("ro", seededDesign.id));
  await expectSceneMounted(page);
  await expectOneLiveSceneOf(2);

  await goBackAndSettle(page);
  await expectEditorTopBarShown(page);
  await expect(page.locator("canvas")).toHaveCount(1);
  await expectOneLiveSceneOf(3);

  await goForwardAndSettle(page);
  await expectSceneMounted(page);
  await expectOneLiveSceneOf(4);

  await page.getByTestId(REVIEW_CTA).tap();
  await page.waitForURL(contactPath("ro", seededDesign.id));
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect
    .poll(() => readSceneContexts(page), {
      timeout: CONTEXT_RELEASE_TIMEOUT_MS,
    })
    .toEqual({ made: 4, live: 0 });
  expect(await mostCanvasesSeen(page)).toBe(1);
});

test("on a device without WebGL the review's address shows the editor's no-3D screen whole and nothing of the review: one main, no row, no figure, no amount, no call to action, and no request for the design", async ({
  page,
  seededDesign,
}) => {
  await refuseWebGL(page);
  const requests = recordRequests(page);

  await page.goto(reviewPath("ro", seededDesign.id));

  const exit = page.getByTestId("webgl-unavailable");
  await expect(exit).toBeVisible();
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("main main")).toHaveCount(0);
  await expect(page.getByTestId(REVIEW_ROW)).toHaveCount(0);
  await expect(page.getByTestId(REVIEW_BOTTOM)).toHaveCount(0);
  await expect(page.getByTestId(REVIEW_CTA)).toHaveCount(0);
  await expect(page.getByTestId(REVIEW_SCENE)).toHaveCount(0);
  await expect(page.locator("[data-section]")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toMatch(/MDL/);
  // One exit link: the e-mail one is not drawn until the provider is live (Q12 (ii), 8L.12).
  await expect(exit.getByRole("link")).toHaveCount(1);
  await expect(exit.getByRole("link")).toHaveAttribute(
    "href",
    "/ro/configurator/contact",
  );
  expect(toTheDesignApi(requests, seededDesign.id)).toEqual([]);
  await captureEvidence(page, "scene-no-webgl");
});
