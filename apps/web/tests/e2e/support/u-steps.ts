// The steps every U journey shares (`u-flow.ts`, `qa-u6-journey.ts`), so the two say "choose the U and
// continue" and "compose and reload" once. Wave U7 builds on them too.
import { expect, type Locator, type Page } from "@playwright/test";

import { ro } from "../../support/romanian-content.e2e";
import { idInEditorUrl, roomPath, roomScreen } from "./step-one-by-touch";

export const ROOM = roomPath("ro");

/** A U's four camera presets: overview and one per wall (`CameraPresetId`). */
export const U_CAMERA_PRESETS = 4;

export function cameraPresetButtons(page: Page): Locator {
  return page
    .getByRole("group", { name: ro.configure.cameraGroupLabel })
    .getByRole("button");
}

/** 1A -> the U card -> *Continuă* -> 1B, with no shape refusal drawn on the way. */
export async function chooseUAndContinue(page: Page): Promise<void> {
  await page.goto(ROOM);
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1A");
  await page.getByTestId("room-shape-card-U").click();
  await expect(page.getByTestId("room-shape-refusal")).toHaveCount(0);
  await page.getByTestId("room-continue").click();
  // No `direction` key: a U has one hand and the URL it writes names none (ADR 0132 decision 8).
  await expect(page).toHaveURL(`${ROOM}?shape=U`);
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1B");
}

/**
 * 1D -> 1F -> `/ro/d/{id}` -> reload, asserting a U's four presets before and after. Returns the minted
 * id, pushed onto the caller's own list (the caller's `afterAll` deletes it, ADR 0006). A retrying
 * `toHaveCount`, never a `count()`: the editor's first client commit replaces the store's initial L,
 * so a count taken at once can read the L's three presets (`linear-flow.ts`'s finding).
 */
export async function composeAndReload(
  page: Page,
  mintedIds: string[],
): Promise<string> {
  await page.getByTestId("room-continue").click();
  await expect(page.getByTestId("room-compose")).toBeVisible();
  await expect(page.getByTestId("room-compose-rows")).toBeVisible();
  await page.waitForURL(/\/ro\/d\/[^/]+$/);
  const id = idInEditorUrl(page.url());
  mintedIds.push(id);
  await expect(page.getByTestId("top-bar-title")).toBeVisible();
  await expect(cameraPresetButtons(page)).toHaveCount(U_CAMERA_PRESETS);

  await page.reload();
  await expect(page.getByTestId("top-bar-title")).toBeVisible();
  await expect(cameraPresetButtons(page)).toHaveCount(U_CAMERA_PRESETS);
  return id;
}
