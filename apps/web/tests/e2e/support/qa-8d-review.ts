// What the review's browser specs share: opening the review, a real touch on the page, and reading what the page
// sent and what it drew. No assertion lives here.
import {
  expect,
  type CDPSession,
  type Locator,
  type Page,
  type Response,
} from "@playwright/test";

import { press } from "./qa-m7c-c1-s3-back";
import {
  expectWriteAccessApplied,
  FIRST_FRAME_FREEZE_TIMEOUT_MS,
  type Locale,
  type SeededDesign,
} from "./seeded-design";
import {
  continueButton,
  idInEditorUrl,
  lengthField,
  roomPath,
  roomScreen,
  type LengthField,
} from "./step-one-by-touch";

export const REVIEW_BOTTOM = "review-bottom";
export const REVIEW_CTA = "review-cta";
export const REVIEW_SCENE = "review-scene";
export const REVIEW_ROW = "review-row";
export const SAVE_WAIT = "review-save-wait";

export function reviewPath(locale: Locale, designId: string): string {
  return `/${locale}/d/${designId}/review`;
}

export function contactPath(locale: Locale, designId: string): string {
  return `/${locale}/d/${designId}/contact`;
}

export function editorPath(locale: Locale, designId: string): string {
  return `/${locale}/d/${designId}`;
}

/** A hard load of the review, returned once its bottom region is drawn. */
export async function openReview(
  page: Page,
  design: SeededDesign,
  locale: Locale = "ro",
): Promise<Response | null> {
  const navigation = await page.goto(reviewPath(locale, design.id));
  await expectReviewDrawn(page);
  return navigation;
}

export async function expectReviewDrawn(page: Page): Promise<void> {
  await expect(page.getByTestId(REVIEW_BOTTOM)).toBeVisible({
    timeout: FIRST_FRAME_FREEZE_TIMEOUT_MS,
  });
}

/** The review's scene has painted: its canvas is attached and has a size. */
export async function expectSceneMounted(page: Page): Promise<Locator> {
  const canvas = page.getByTestId(REVIEW_SCENE).locator("canvas");
  await expect(canvas).toBeVisible({ timeout: FIRST_FRAME_FREEZE_TIMEOUT_MS });
  return canvas;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A finger put down at `from`, moved to `to` in steps and lifted: the browser's own touch input, so `touch-action`
 *  and scrolling behave as they do under a thumb. */
export async function touchDrag(
  page: Page,
  from: Point,
  to: Point,
  steps = 12,
): Promise<void> {
  const session = await page.context().newCDPSession(page);
  try {
    await dispatchTouch(session, "touchStart", [from]);
    for (let step = 1; step <= steps; step += 1) {
      const point = {
        x: from.x + ((to.x - from.x) * step) / steps,
        y: from.y + ((to.y - from.y) * step) / steps,
      };
      await dispatchTouch(session, "touchMove", [point]);
      await page.waitForTimeout(16);
    }
    await dispatchTouch(session, "touchEnd", []);
  } finally {
    await session.detach();
  }
}

async function dispatchTouch(
  session: CDPSession,
  type: "touchStart" | "touchMove" | "touchEnd",
  points: readonly Point[],
): Promise<void> {
  await session.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: points.map((point) => ({ x: point.x, y: point.y })),
  });
}

/** A finger on the middle of `target`, whatever the control says about itself: a control that is off is still
 *  something a thumb lands on, and the point is to see that nothing follows. */
export async function touchTheMiddleOf(
  page: Page,
  target: Locator,
): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const middle = await centreOf(target);
  await page.touchscreen.tap(middle.x, middle.y);
}

export async function scrollTop(page: Page): Promise<number> {
  return page.evaluate(() => window.scrollY);
}

export async function centreOf(target: Locator): Promise<Point> {
  const box = await target.boundingBox();
  if (!box) throw new Error("the element is not on the page");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export interface RecordedRequest {
  readonly method: string;
  readonly pathname: string;
  readonly search: string;
}

/** Every request the page makes from now on. */
export function recordRequests(page: Page): readonly RecordedRequest[] {
  const recorded: RecordedRequest[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    recorded.push({
      method: request.method(),
      pathname: url.pathname,
      search: url.search,
    });
  });
  return recorded;
}

export function toTheDesignApi(
  requests: readonly RecordedRequest[],
  designId: string,
): readonly RecordedRequest[] {
  return requests.filter((request) =>
    request.pathname.startsWith(`/api/designs/${designId}`),
  );
}

/** The names of the review's tagged sections, in the document's order. */
export async function sectionsInDocumentOrder(
  page: Page,
): Promise<readonly string[]> {
  return page
    .locator("[data-section]")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-section") ?? ""),
    );
}

export interface BottomRegionFit {
  readonly viewportHeight: number;
  readonly top: number;
  readonly bottom: number;
  readonly height: number;
  readonly sentences: readonly string[];
}

export async function readBottomRegion(page: Page): Promise<BottomRegionFit> {
  return page.getByTestId(REVIEW_BOTTOM).evaluate((region) => {
    const rect = region.getBoundingClientRect();
    return {
      viewportHeight: window.innerHeight,
      top: rect.top,
      bottom: rect.bottom,
      height: rect.height,
      sentences: [
        ...region.querySelectorAll("p:not([data-section='figure'])"),
      ].map((sentence) => sentence.textContent),
    };
  });
}

/** Counts the canvases in the document on every animation frame from now on, so two alive at once in any painted
 *  frame is seen. Read it back with {@link mostCanvasesSeen}. */
export async function watchCanvasCount(page: Page): Promise<void> {
  await page.evaluate(() => {
    const seen = { most: 0 };
    Reflect.set(window, "__canvasWatch", seen);
    const sample = (): void => {
      seen.most = Math.max(
        seen.most,
        document.querySelectorAll("canvas").length,
      );
      requestAnimationFrame(sample);
    };
    sample();
    new MutationObserver(() => {
      seen.most = Math.max(
        seen.most,
        document.querySelectorAll("canvas").length,
      );
    }).observe(document.documentElement, { childList: true, subtree: true });
  });
}

export async function mostCanvasesSeen(page: Page): Promise<number> {
  return page.evaluate(
    () => (Reflect.get(window, "__canvasWatch") as { most: number }).most,
  );
}

/**
 * Wraps `getContext` for every document this page loads, so each WebGL context given to a canvas that has stood in
 * the document is kept and its loss can be read. The support probe asks on a canvas that is never attached; that one
 * is not a scene and is not counted. Read with {@link readSceneContexts}.
 */
export async function trackSceneContexts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    interface Held {
      readonly context: WebGLRenderingContext;
      readonly canvas: HTMLCanvasElement;
      hasStoodInTheDocument: boolean;
    }
    const held: Held[] = [];
    Reflect.set(window, "__webglContexts", held);
    const original: unknown = Object.getOwnPropertyDescriptor(
      HTMLCanvasElement.prototype,
      "getContext",
    )?.value;
    if (typeof original !== "function") {
      throw new Error("HTMLCanvasElement.getContext is not callable");
    }
    HTMLCanvasElement.prototype.getContext = function getContext(
      this: HTMLCanvasElement,
      contextId: string,
      ...rest: unknown[]
    ) {
      const context: unknown = Reflect.apply(original, this, [
        contextId,
        ...rest,
      ]);
      const isWebGL = contextId === "webgl" || contextId === "webgl2";
      if (
        isWebGL &&
        context !== null &&
        !held.some((entry) => entry.context === context)
      ) {
        held.push({
          context: context as WebGLRenderingContext,
          canvas: this,
          hasStoodInTheDocument: this.isConnected,
        });
      }
      return context;
    } as typeof HTMLCanvasElement.prototype.getContext;
    // A renderer may be given its context before its canvas is attached, so attachment is watched, not read once.
    const watch = (): void => {
      for (const entry of held) {
        if (entry.canvas.isConnected) entry.hasStoodInTheDocument = true;
      }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  });
}

export interface SceneContextCensus {
  /** Every scene context this document has made. */
  readonly made: number;
  /** Those the browser still holds. */
  readonly live: number;
}

export async function readSceneContexts(
  page: Page,
): Promise<SceneContextCensus> {
  return page.evaluate(() => {
    const held = Reflect.get(window, "__webglContexts") as {
      context: WebGLRenderingContext;
      hasStoodInTheDocument: boolean;
    }[];
    const scenes = held.filter((entry) => entry.hasStoodInTheDocument);
    return {
      made: scenes.length,
      live: scenes.filter((entry) => !entry.context.isContextLost()).length,
    };
  });
}

/** Makes every canvas in every document this page loads refuse WebGL, as a device without it does. */
export async function refuseWebGL(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original: unknown = Object.getOwnPropertyDescriptor(
      HTMLCanvasElement.prototype,
      "getContext",
    )?.value;
    if (typeof original !== "function") {
      throw new Error("HTMLCanvasElement.getContext is not callable");
    }
    HTMLCanvasElement.prototype.getContext = function getContext(
      this: HTMLCanvasElement,
      contextId: string,
      ...rest: unknown[]
    ) {
      if (contextId === "webgl" || contextId === "webgl2") return null;
      return Reflect.apply(original, this, [contextId, ...rest]) as unknown;
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
}

export async function historyLength(page: Page): Promise<number> {
  return page.evaluate(() => window.history.length);
}

/** A same-document traversal resolves before React has answered it; this is how long the guard's own specs wait. */
export const TRAVERSAL_SETTLE_MS = 400;

export async function goBackAndSettle(page: Page): Promise<void> {
  await page.goBack();
  await page.waitForTimeout(TRAVERSAL_SETTLE_MS);
}

export async function goForwardAndSettle(page: Page): Promise<void> {
  await page.goForward();
  await page.waitForTimeout(TRAVERSAL_SETTLE_MS);
}

export const BACK_QUESTION = "back-confirm-dialog";
export const BACK_QUESTION_STAY = "back-confirm-confirm-back";
const GUARD_STATE_KEY = "lemnariaBackGuard";
const SETTINGS_SHEET = "global-settings-surface";
const HARDWARE_GROUP_INDEX = 1;

export interface EditorVisit {
  readonly designId: string;
  readonly editorUrl: string;
}

/** The editor reached the way a customer reaches it, from Step 1, so the back guard is armed for the visit. The
 *  caller's fixture deletes the row the hand-over mints. */
export async function openEditorFromStepOne(page: Page): Promise<EditorVisit> {
  await page.goto(roomPath("ro"));
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1A");
  await press(page, page.getByTestId("room-shape-card-L"));
  await press(page, continueButton(page));
  await typeLength(page, "wallA", "3560");
  await typeLength(page, "wallB", "4250");
  await typeLength(page, "height", "2700");
  await press(page, continueButton(page));
  await page.waitForURL(/\/ro\/d\/[^/]+$/);
  await expectEditorReady(page);
  return { designId: idInEditorUrl(page.url()), editorUrl: page.url() };
}

async function typeLength(
  page: Page,
  field: LengthField,
  digits: string,
): Promise<void> {
  const input = lengthField(page, field);
  await press(page, input);
  await input.pressSequentially(digits);
}

export async function expectEditorReady(page: Page): Promise<void> {
  await expect(page.getByTestId("top-bar-title")).toBeVisible({
    timeout: FIRST_FRAME_FREEZE_TIMEOUT_MS,
  });
  await expectWriteAccessApplied(page);
}

/** One edit made as a customer makes it: another hardware tier chosen in the settings sheet and applied. Returns
 *  when the sheet has closed, which is before the save has answered. */
export async function chooseAnotherHardwareTier(page: Page): Promise<void> {
  await press(page, page.getByTestId("global-settings-trigger"));
  const hardware = page
    .getByTestId("global-settings-group")
    .nth(HARDWARE_GROUP_INDEX);
  await press(
    page,
    hardware.locator('input[type="radio"]:not(:checked)').first(),
  );
  await press(page, page.getByTestId("global-settings-apply"));
  await expect(page.getByTestId(SETTINGS_SHEET)).toHaveCount(0);
}

/** The same edit, returned once the server has answered its save. */
export async function chooseAnotherHardwareTierAndSave(
  page: Page,
  designId: string,
): Promise<void> {
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === `/api/designs/${designId}`,
  );
  await chooseAnotherHardwareTier(page);
  await saved;
}

export async function isGuardEntryUnderTheCustomer(
  page: Page,
): Promise<boolean> {
  return page.evaluate(
    (key) =>
      (window.history.state as Record<string, unknown> | null)?.[key] === true,
    GUARD_STATE_KEY,
  );
}

/** The hardware tier the store holds, as the editor's own readout publishes it. */
export async function hardwareTierInTheStore(page: Page): Promise<string> {
  return (
    (await page
      .getByTestId("selection-debug")
      .getAttribute("data-hardware-tier")) ?? ""
  );
}

export function settingsSheet(page: Page): Locator {
  return page.getByTestId(SETTINGS_SHEET);
}

/** Writes a capture where `QA_EVIDENCE_DIR` says, which must be outside the tree the dev server watches. Unset,
 *  nothing is captured. */
export async function captureEvidence(
  page: Page,
  name: string,
  { fullPage = false }: { fullPage?: boolean } = {},
): Promise<void> {
  const directory = process.env.QA_EVIDENCE_DIR;
  if (directory === undefined) return;
  const fileName = name.replaceAll(/[^\w.-]+/g, "-");
  await page.screenshot({ path: `${directory}/${fileName}.png`, fullPage });
}

export interface FocusUnderTheFoot {
  /** How many links and controls took focus while tabbing, the pinned region's own left out. */
  readonly focused: number;
  /** The least room left between a focused box's bottom edge and the region's top edge; negative is under it. */
  readonly leastRoomAbove: number;
  readonly lowest: string;
}

/**
 * Tabs forward through the review from the top of the page and back again with Shift+Tab, and reports the focused
 * box that came nearest to, or under, the pinned region. The region's own controls are left out: they are the region.
 */
export async function tabThroughTheReview(
  page: Page,
): Promise<FocusUnderTheFoot> {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    (document.activeElement as HTMLElement | null)?.blur();
  });
  let focused = 0;
  let leastRoomAbove = Number.POSITIVE_INFINITY;
  let lowest = "";
  const readTheFocusedBox = async (): Promise<string> => {
    const read = await page.evaluate((regionTestId) => {
      const active = document.activeElement;
      const region = document.querySelector(`[data-testid="${regionTestId}"]`);
      if (active === null || active === document.body || region === null)
        return { key: "", room: null as number | null };
      const key = `${active.tagName}|${active.getAttribute("href") ?? ""}|${active.textContent.trim().slice(0, 24)}`;
      if (region.contains(active) || active.closest("main") === null)
        return { key, room: null as number | null };
      return {
        key,
        room:
          region.getBoundingClientRect().top -
          active.getBoundingClientRect().bottom,
      };
    }, REVIEW_BOTTOM);
    if (read.room !== null) {
      focused += 1;
      if (read.room < leastRoomAbove) {
        leastRoomAbove = read.room;
        lowest = read.key;
      }
    }
    return read.key;
  };
  const tabUntilItComesRound = async (key: "Tab" | "Shift+Tab") => {
    const seen = new Set<string>();
    for (let presses = 0; presses < 120; presses += 1) {
      await page.keyboard.press(key);
      const focusedKey = await readTheFocusedBox();
      if (focusedKey === "" || seen.has(focusedKey)) return;
      seen.add(focusedKey);
    }
  };
  await tabUntilItComesRound("Tab");
  await tabUntilItComesRound("Shift+Tab");
  return { focused, leastRoomAbove, lowest };
}

/** What the viewport reserves at its foot for a scroll made to show something, as the page has set it. */
export async function scrollReserveAtTheFoot(page: Page): Promise<string> {
  return page.evaluate(
    () => document.documentElement.style.scrollPaddingBottom,
  );
}
