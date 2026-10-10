// The editor when the limit on saves refuses a save, at 390 x 844 by touch. The save is answered in the browser by
// route interception with the module's own 429, so no volume is needed and the limiter's counters are not touched: the
// refused request never reaches the server. This is the spec the visual check runs; `E2E_SAVE_PAUSE_HOLD_MS` keeps
// the paused editor open that long before the test ends, and a screenshot of it is attached either way.
//
// **Must not run concurrently with any other persistence live run**: each test mints one row, deleted by its
// fixture's teardown (ADR 0006).
import { expect, type Page, type Route } from "@playwright/test";

import { APPROVED_ROMANIAN_MESSAGES } from "../support/approved-romanian-messages";
import {
  chooseAnotherHardwareTier,
  expectEditorReady,
} from "./support/qa-8d-review";
import { test } from "./support/seeded-design";

const SELECTED_BODY = "p8";
const PAUSE_SENTENCE = APPROVED_ROMANIAN_MESSAGES.panel.savePausedNotice;
const SAVE_LIMIT_BODY = JSON.stringify({
  error: "The limit on saving is reached for now.",
  code: "SAVE_LIMIT_REACHED",
});
/** Long enough to be looked at and never reached by a test. */
const A_WHOLE_HOUR_SECONDS = 3600;
const SHORT_WAIT_SECONDS = 3;
const WAIT_BEFORE_COUNTING_MS = 3000;
const HOLD_VARIABLE = "E2E_SAVE_PAUSE_HOLD_MS";

/** The paused sentence's words with its time left open: the clock is the browser's, and the test does not read it. */
function pauseSentencePattern(): RegExp {
  const [before, after] = PAUSE_SENTENCE.split("{time}");
  const escape = (text: string): string =>
    text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `^${escape(before ?? "")}\\d{2}:\\d{2}${escape(after ?? "")}$`,
  );
}

interface SaveRequest {
  readonly atMs: number;
  readonly body: string | null;
}

/** Refuses every save of `designId` with the limit's 429 until `refusals` have been sent, then lets them through. */
async function refuseSavesAsTheLimitDoes(
  page: Page,
  designId: string,
  {
    retryAfterSeconds,
    refusals,
  }: { retryAfterSeconds: number; refusals: number },
): Promise<SaveRequest[]> {
  const saves: SaveRequest[] = [];
  await page.route(`**/api/designs/${designId}`, async (route: Route) => {
    const method = route.request().method();
    if (method !== "PUT" && method !== "PATCH") {
      await route.continue();
      return;
    }
    saves.push({ atMs: Date.now(), body: route.request().postData() });
    if (saves.length > refusals) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 429,
      contentType: "application/json",
      headers: { "Retry-After": String(retryAfterSeconds) },
      body: SAVE_LIMIT_BODY,
    });
  });
  return saves;
}

async function openEditorWithABodySelected(
  page: Page,
  designId: string,
): Promise<void> {
  await page.goto(`/ro/d/${designId}?select=${SELECTED_BODY}`);
  await expectEditorReady(page);
  await expect(page.getByTestId("editor-panel")).toBeVisible();
}

test("a refused save pauses the editor with the time it will be sent, keeps every edit and sends nothing", async ({
  page,
  seededDesign,
}, testInfo) => {
  const saves = await refuseSavesAsTheLimitDoes(page, seededDesign.id, {
    retryAfterSeconds: A_WHOLE_HOUR_SECONDS,
    refusals: Number.POSITIVE_INFINITY,
  });
  await openEditorWithABodySelected(page, seededDesign.id);

  await chooseAnotherHardwareTier(page);

  const notice = page.getByTestId("panel-notice");
  await expect(notice).toHaveText(pauseSentencePattern());
  await expect(notice).toHaveAttribute("data-notice", "save-paused");
  await expect(notice).toHaveAttribute("data-tone", "info");
  await expect(notice.getByRole("button")).toHaveCount(0);
  await expect(notice).toBeInViewport();
  await expect(page.getByTestId("selection-debug")).toHaveAttribute(
    "data-save-status",
    "error",
  );
  await chooseAnotherHardwareTier(page);
  await page.waitForTimeout(WAIT_BEFORE_COUNTING_MS);

  expect(saves).toHaveLength(1);
  await expect(notice).toHaveAttribute("data-notice", "save-paused");
  await testInfo.attach("save-paused-390x844.png", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
  await page.waitForTimeout(Number(process.env[HOLD_VARIABLE] ?? 0));
});

test("sends the one waiting write when the stated time comes, with the last edit in it, and the sentence goes", async ({
  page,
  seededDesign,
}) => {
  const saves = await refuseSavesAsTheLimitDoes(page, seededDesign.id, {
    retryAfterSeconds: SHORT_WAIT_SECONDS,
    refusals: 1,
  });
  await openEditorWithABodySelected(page, seededDesign.id);

  await chooseAnotherHardwareTier(page);
  await expect(page.getByTestId("panel-notice")).toHaveAttribute(
    "data-notice",
    "save-paused",
  );
  await chooseAnotherHardwareTier(page);
  await expect(page.getByTestId("selection-debug")).toHaveAttribute(
    "data-save-status",
    "idle",
    { timeout: 3 * SHORT_WAIT_SECONDS * 1000 },
  );
  await expect(page.getByTestId("panel-notice")).toHaveAttribute(
    "data-empty",
    "true",
  );

  expect(saves).toHaveLength(2);
  const [refused, sent] = saves;
  expect((sent?.atMs ?? 0) - (refused?.atMs ?? 0)).toBeGreaterThanOrEqual(
    SHORT_WAIT_SECONDS * 1000,
  );
  expect(sent?.body).not.toBe(refused?.body);
  const stored = await page.evaluate(async (id: string) => {
    const response = await fetch(`/api/designs/${id}`, {
      credentials: "same-origin",
    });
    return ((await response.json()) as { design: unknown }).design;
  }, seededDesign.id);
  expect(stored).toEqual(JSON.parse(sent?.body ?? "null"));
});
