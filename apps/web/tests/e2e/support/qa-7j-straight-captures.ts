// M7 wave 7J, criterion A17: the straight kitchen's own capture set, written **outside the watched
// tree** (`QA_7J_CAPTURE_DIR`, default the OS temp dir) — the same pattern `qa-7i-captures.ts` uses,
// for the same reason (`browser-and-visual-qa.md`, *A trap that produces confident wrong
// measurements*). Mints one row per width and deletes it (ADR 0006).
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, type Locator, type Page } from "@playwright/test";

import { ro } from "../../support/romanian-content.e2e";
import { standAt, waitForSettleAfter } from "./mirror-flow";

const CAPTURE_DIR =
  process.env.QA_7J_CAPTURE_DIR ?? path.join(tmpdir(), "qa-7j-captures");

const ROOM = "/ro/configurator/room";

/** The owner's own witness (ADR 0130's G7) plus both approved-range ends (ADR 0108 Amendment G). */
const WIDTHS_MM = [1200, 3700, 6000] as const;

const PRESETS = [
  ["overview", ro.configure.cameraPresets.overview],
  ["wallA", ro.configure.cameraPresets.wallA],
] as const;

function roomScreen(page: Page): Locator {
  return page.locator("main[data-room-substate]");
}

function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function capture(page: Page, name: string): Promise<void> {
  mkdirSync(CAPTURE_DIR, { recursive: true });
  await page.screenshot({ path: path.join(CAPTURE_DIR, `${name}.png`) });
}

function idInEditorUrl(url: string): string {
  const id = new URL(url).pathname.split("/").pop();
  if (id === undefined || id === "") throw new Error(`no design id in ${url}`);
  return decodeURIComponent(id);
}

async function composeLinearThroughStepOne(
  page: Page,
  wallAMm: number,
): Promise<{ readonly designId: string }> {
  await page.goto(ROOM);
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1A");

  await page.getByTestId("room-shape-card-linear").click();
  await page.getByTestId("room-continue").click();
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1B");

  const wallA = page.getByTestId("room-length-wallA");
  await wallA.click();
  await wallA.pressSequentially(String(wallAMm));
  const height = page.getByTestId("room-length-height");
  await height.click();
  await height.pressSequentially("2600");
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1D");

  await page.getByTestId("room-continue").click();
  await page.waitForURL(/\/ro\/d\/[^/]+$/);
  const designId = idInEditorUrl(page.url());
  await expect(page.getByTestId("top-bar-title")).toBeVisible();
  return { designId };
}

async function chooseDepth(page: Page, depthMm: string): Promise<void> {
  await page.getByTestId("global-settings-trigger").click();
  const option = page
    .getByTestId("global-settings-depth-option")
    .filter({ has: page.locator(`input[value="${depthMm}"]`) });
  await option.getByRole("radio").check();
  await page.getByTestId("global-settings-apply").click();
  await expect(page.getByTestId("global-settings-surface")).toHaveCount(0);
  await expect(page.getByTestId("selection-debug")).toHaveAttribute(
    "data-cabinet-depth",
    depthMm,
  );
}

async function captureEveryPreset(
  page: Page,
  designId: string,
  prefix: string,
): Promise<void> {
  for (const [slug, label] of PRESETS) {
    await page.goto(`/ro/d/${designId}`);
    await waitForSettleAfter(page, 0);
    await standAt(page, label);
    await capture(page, `${prefix}-${slug}`);
  }
}

/**
 * Every width in `WIDTHS_MM`, at both declared cabinet depths, `overview` and `wallA` — 12
 * screenshots per viewport, `${viewport}-${widthMm}-${depthMm}-${preset}.png`. `mintedIds` is the
 * caller's own array — the caller's `afterAll` deletes it.
 */
export async function runStraightCaptureSet(
  page: Page,
  viewport: "mobile" | "desktop",
  mintedIds: string[],
): Promise<void> {
  const errors = trackPageErrors(page);

  for (const wallAMm of WIDTHS_MM) {
    const { designId } = await composeLinearThroughStepOne(page, wallAMm);
    mintedIds.push(designId);

    await captureEveryPreset(
      page,
      designId,
      `${viewport}-${String(wallAMm)}-600`,
    );

    await page.goto(`/ro/d/${designId}`);
    await waitForSettleAfter(page, 0);
    await chooseDepth(page, "700");
    await captureEveryPreset(
      page,
      designId,
      `${viewport}-${String(wallAMm)}-700`,
    );
  }

  expect(errors).toEqual([]);
}

export { CAPTURE_DIR };
