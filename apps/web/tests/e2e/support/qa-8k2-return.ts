// Moves, interceptions and readouts for the 8K2 traces of a design returned to by the browser's history: the journey in
// either locale, the probe's read held or refused in the browser, every control of a surface tried by touch, and the
// time from the return to the answer applied, read inside the page. No assertion of a rule lives here.
import { expect, type Locator, type Page, type Route } from "@playwright/test";

import {
  expectEditorReady,
  goBackAndSettle,
  type EditorVisit,
} from "./qa-8d-review";
import { CONFIRM, DIALOG, press } from "./qa-m7c-c1-s3-back";
import { FIRST_FRAME_FREEZE_TIMEOUT_MS } from "./seeded-design";
import {
  continueButton,
  findBaseRowTapTarget,
  idInEditorUrl,
  isEditorUrl,
  roomPath,
  roomScreen,
  typeDigits,
  type Locale,
} from "./step-one-by-touch";

export const ANY_ROOM_URL = /\/(ro|ru)\/configurator\/room/;
const ANY_EDITOR_URL = /\/(ro|ru)\/d\/[^/]+$/;
const READ_LIMIT_STATUS = 429;
const READ_LIMIT_BODY = JSON.stringify({
  error: "The limit on reading is reached for now.",
  code: "READ_LIMIT_REACHED",
});
const RETURN_RECORD_KEY = "__qa8k2Return";

/** The editor reached from Step 1 in `locale`, as a customer reaches it. The caller's fixture deletes the row. */
export async function openEditorFromStepOneIn(
  page: Page,
  locale: Locale,
): Promise<EditorVisit> {
  await page.goto(roomPath(locale));
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1A");
  await press(page, page.getByTestId("room-shape-card-L"));
  await press(page, continueButton(page));
  await typeDigits(page, "wallA", "3560");
  await typeDigits(page, "wallB", "4250");
  await typeDigits(page, "height", "2700");
  await press(page, continueButton(page));
  await page.waitForURL((url) => isEditorUrl(url, locale));
  await expectEditorReady(page);
  return { designId: idInEditorUrl(page.url()), editorUrl: page.url() };
}

/** Step 1 by the editor's back link and the question it asks, in whichever locale the page is. */
export async function toStepOne(page: Page): Promise<void> {
  await press(page, page.getByTestId("bottom-bar-back"));
  await expect(page.getByTestId(DIALOG)).toBeVisible();
  await press(page, page.getByTestId(CONFIRM));
  await page.waitForURL(ANY_ROOM_URL);
  await expect(roomScreen(page)).toBeVisible();
}

/** Step 1 reopened from the editor still holds the room that was typed, so one press makes a second design. */
export async function makeASecondDesign(page: Page): Promise<EditorVisit> {
  await press(page, continueButton(page));
  await page.waitForURL(ANY_EDITOR_URL);
  await expectEditorReady(page);
  return { designId: idInEditorUrl(page.url()), editorUrl: page.url() };
}

/** The browser's Back from an editor to Step 1, answering the editor's question where it asks one. */
export async function backToStepOne(page: Page): Promise<void> {
  await goBackAndSettle(page);
  if (await page.getByTestId(DIALOG).isVisible())
    await press(page, page.getByTestId(CONFIRM));
  await page.waitForURL(ANY_ROOM_URL);
}

/** The editor's frame is drawn; says nothing of write access, which a held or refused probe leaves unanswered. */
export async function expectEditorDrawn(page: Page): Promise<void> {
  await expect(page.getByTestId("top-bar-title")).toBeVisible({
    timeout: FIRST_FRAME_FREEZE_TIMEOUT_MS,
  });
}

export interface HeldReads {
  /** Resolves once a read of the design has left the browser and is being kept out. */
  readonly hasLeft: Promise<void>;
  /** Lets the kept reads, and every later one, reach the server. */
  readonly release: () => Promise<void>;
}

/** Keeps every read of `designId` out, unanswered, until released; saves pass through. */
export async function holdReadsOf(
  page: Page,
  designId: string,
): Promise<HeldReads> {
  const held: Route[] = [];
  let isHolding = true;
  let markLeft: () => void = () => undefined;
  const hasLeft = new Promise<void>((resolve) => {
    markLeft = resolve;
  });
  await page.route(`**/api/designs/${designId}`, async (route: Route) => {
    if (isHolding && route.request().method() === "GET") {
      held.push(route);
      markLeft();
      return;
    }
    await route.continue();
  });
  return {
    hasLeft,
    release: async () => {
      isHolding = false;
      // A read the page gave up on meanwhile has no route left to continue.
      await Promise.all(
        held.map((route) => route.continue().catch(() => null)),
      );
    },
  };
}

export interface RefusedReads {
  readonly count: () => number;
  /** From now on the design's reads reach the server. */
  readonly stopRefusing: () => void;
}

/** Answers every read of `designId` as the limit on reads does, in the browser, until told to stop. */
export async function refuseReadsOf(
  page: Page,
  designId: string,
): Promise<RefusedReads> {
  let isRefusing = true;
  let refused = 0;
  await page.route(`**/api/designs/${designId}`, async (route: Route) => {
    if (!isRefusing || route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    refused += 1;
    await route.fulfill({
      status: READ_LIMIT_STATUS,
      contentType: "application/json",
      headers: { "Retry-After": "60" },
      body: READ_LIMIT_BODY,
    });
  });
  return {
    count: () => refused,
    stopRefusing: () => {
      isRefusing = false;
    },
  };
}

/** A scene that has just come back is not yet where its readout says, so the tap is made again until it lands. */
const TAP_LANDS_WITHIN_MS = 1500;

/** Selects a base-row body with a finger once the scene can say where one is, and returns once its panel is open. */
export async function openThePanelOnABody(page: Page): Promise<void> {
  await expect(async () => {
    const body = await findBaseRowTapTarget(page);
    await page.touchscreen.tap(body.x, body.y);
    await expect(page.getByTestId("editor-panel")).toBeVisible({
      timeout: TAP_LANDS_WITHIN_MS,
    });
  }).toPass({ timeout: FIRST_FRAME_FREEZE_TIMEOUT_MS });
}

const CONTROLS =
  "button, input, select, textarea, a[href], [role='button'], [role='radio'], [role='option']";

/**
 * Puts a finger on the middle of every control inside `surface`, enabled or not, but for those named in `except`.
 * Coordinates, not `tap()`: a locator's tap waits for the control to be enabled, and the point is to press the ones
 * that are not. Returns the test ids pressed, so a trace can say what it tried.
 */
export async function touchEveryControlIn(
  page: Page,
  surface: Locator,
  except: readonly string[],
): Promise<string[]> {
  const touched: string[] = [];
  const count = await surface.locator(CONTROLS).count();
  for (let index = 0; index < count; index += 1) {
    const control = surface.locator(CONTROLS).nth(index);
    if ((await control.count()) === 0) break;
    const testId = (await control.getAttribute("data-testid")) ?? "(unnamed)";
    if (except.includes(testId)) continue;
    await control.scrollIntoViewIfNeeded().catch(() => null);
    const box = await control.boundingBox();
    if (box === null) continue;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    touched.push(testId);
  }
  return touched;
}

/** A finger on the middle of `target`, whether or not it is enabled. */
export async function touchTheMiddle(
  page: Page,
  target: Locator,
): Promise<void> {
  const box = await target.boundingBox();
  if (box === null) throw new Error("the control has no box to touch");
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

/** What of the document the editor's readout publishes: any command that changed the design moves one of these. */
export async function documentReadout(page: Page): Promise<string> {
  const readout = page.getByTestId("selection-debug");
  const fields = [
    "data-updated-at",
    "data-material-tier",
    "data-hardware-tier",
    "data-cabinet-depth",
    "data-global-finish",
    "data-overriding-finishes",
  ];
  const values = await Promise.all(
    fields.map((field) => readout.getAttribute(field)),
  );
  return values.join("|");
}

export interface ReturnTiming {
  /** From the history traversal to the editor's settings control unlocking, which the answer's store write does. */
  readonly returnToAppliedMs: number;
  /** From the traversal to the read of the design leaving the browser. */
  readonly returnToReadSentMs: number;
  /** The read itself, sent to answered. */
  readonly readMs: number;
}

interface ReturnRecord {
  designId: string;
  returnedAtMs: number | null;
  readSentAtMs: number | null;
  readAnsweredAtMs: number | null;
  appliedAtMs: number | null;
}

/**
 * Arms the page to time the next traversal that lands on the editor of `designId`. Called on the page the traversal
 * leaves, since the same document shows both. The clock is the page's own, so no test-runner polling is in the figure.
 * The read is timed around the page's own `fetch`, which is put back as it was once the read has answered.
 */
export async function watchTheNextReturnTo(
  page: Page,
  designId: string,
): Promise<void> {
  await page.evaluate(
    ({ key, id }) => {
      const record: ReturnRecord = {
        designId: id,
        returnedAtMs: null,
        readSentAtMs: null,
        readAnsweredAtMs: null,
        appliedAtMs: null,
      };
      Reflect.set(window, key, record);
      window.addEventListener(
        "popstate",
        () => {
          record.returnedAtMs ??= performance.now();
        },
        { capture: true, once: true },
      );

      const pageFetch = window.fetch;
      const isTheRead = (input: RequestInfo | URL, init?: RequestInit) =>
        (init?.method ?? "GET") === "GET" &&
        new URL(
          input instanceof Request ? input.url : String(input),
          window.location.href,
        ).pathname === `/api/designs/${id}`;
      window.fetch = async (input, init) => {
        if (record.readSentAtMs !== null || !isTheRead(input, init))
          return pageFetch(input, init);
        record.readSentAtMs = performance.now();
        try {
          return await pageFetch(input, init);
        } finally {
          record.readAnsweredAtMs = performance.now();
          window.fetch = pageFetch;
        }
      };

      const isUnlockedOnThisDesign = (): boolean => {
        const trigger = document.querySelector(
          '[data-testid="global-settings-trigger"]',
        );
        const readout = document.querySelector(
          '[data-testid="selection-debug"]',
        );
        return (
          trigger instanceof HTMLButtonElement &&
          !trigger.disabled &&
          readout?.getAttribute("data-design-id") === id
        );
      };
      const observer = new MutationObserver(() => {
        if (record.returnedAtMs === null || record.appliedAtMs !== null) return;
        if (!isUnlockedOnThisDesign()) return;
        record.appliedAtMs = performance.now();
        observer.disconnect();
      });
      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
      });
    },
    { key: RETURN_RECORD_KEY, id: designId },
  );
}

export async function readTheReturn(page: Page): Promise<ReturnTiming> {
  const record = await page.evaluate(
    (key) => Reflect.get(window, key) as ReturnRecord,
    RETURN_RECORD_KEY,
  );
  const { returnedAtMs, readSentAtMs, readAnsweredAtMs, appliedAtMs } = record;
  if (
    returnedAtMs === null ||
    readSentAtMs === null ||
    readAnsweredAtMs === null ||
    appliedAtMs === null
  )
    throw new Error(
      `the return was not timed to its end: ${JSON.stringify(record)}`,
    );
  return {
    returnToAppliedMs: Math.round(appliedAtMs - returnedAtMs),
    returnToReadSentMs: Math.round(readSentAtMs - returnedAtMs),
    readMs: Math.round(readAnsweredAtMs - readSentAtMs),
  };
}

/** The history entry of the first address matching `pattern`, reached in one traversal, as a long press on Back does. */
export async function traverseStraightTo(
  page: Page,
  pattern: RegExp,
): Promise<void> {
  await page.evaluate((source) => {
    const wanted = new RegExp(source);
    const { navigation } = window as unknown as {
      navigation: {
        entries: () => { url: string | null; index: number }[];
        currentEntry: { index: number };
      };
    };
    const entry = navigation
      .entries()
      .find(({ url }) => url !== null && wanted.test(new URL(url).pathname));
    if (entry === undefined) throw new Error(`no history entry for ${source}`);
    window.history.go(entry.index - navigation.currentEntry.index);
  }, pattern.source);
  await page.waitForURL((url) => pattern.test(url.pathname));
}
