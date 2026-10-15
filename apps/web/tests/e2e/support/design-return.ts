// Leaving a design for Step 1 and a second design, and coming back by the browser's history: the moves and the
// readouts the return specs share. No assertion lives here.
import { expect, type Page, type Route } from "@playwright/test";

import {
  expectEditorReady,
  toTheDesignApi,
  type RecordedRequest,
} from "./qa-8d-review";
import { CONFIRM, DIALOG, press } from "./qa-m7c-c1-s3-back";
import { continueButton, roomScreen } from "./step-one-by-touch";

export const ROOM_URL = /\/ro\/configurator\/room/;
export const EDITOR_URL = /\/ro\/d\/[^/]+$/;
const MATERIAL_GROUP_INDEX = 0;

/** Step 1 by the editor's back link and the question it asks. */
export async function toStepOneByTheBackLink(page: Page): Promise<void> {
  await press(page, page.getByTestId("bottom-bar-back"));
  await expect(page.getByTestId(DIALOG)).toBeVisible();
  await press(page, page.getByTestId(CONFIRM));
  await page.waitForURL(ROOM_URL);
  await expect(roomScreen(page)).toBeVisible();
}

/** Step 1 reopened from the editor still holds the room that was typed, so one press makes a second design. */
export async function makeAnotherDesignFromStepOne(page: Page): Promise<void> {
  await press(page, continueButton(page));
  await page.waitForURL(EDITOR_URL);
  await expectEditorReady(page);
}

/** The reads of the design's API since `mark`, a position in the recording. */
export function readsOfTheDesignSince(
  requests: readonly RecordedRequest[],
  mark: number,
  designId: string,
): readonly RecordedRequest[] {
  return toTheDesignApi(requests.slice(mark), designId).filter(
    (request) => request.method === "GET",
  );
}

/** The saves of the design since `mark`. */
export function savesOfTheDesignSince(
  requests: readonly RecordedRequest[],
  mark: number,
  designId: string,
): readonly RecordedRequest[] {
  return toTheDesignApi(requests.slice(mark), designId).filter(
    (request) => request.method === "PUT" || request.method === "PATCH",
  );
}

export interface TierSettings {
  readonly hardwareTierId?: string;
  readonly materialTierId?: string;
}

/** The settings the server holds for the design right now, read from the page so its cookies go with the request. */
export async function storedSettings(
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

/** The material tier the store holds, as the editor's own readout publishes it. */
export async function materialTierInTheStore(page: Page): Promise<string> {
  const tier = await page
    .getByTestId("selection-debug")
    .getAttribute("data-material-tier");
  return tier ?? "";
}

/** A second edit to another setting than the hardware tier, so a write holding both can be told from one holding
 *  either. Returns the status the server answered the save with. */
export async function chooseAnotherMaterialAndSave(
  page: Page,
  designId: string,
): Promise<number> {
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === `/api/designs/${designId}`,
  );
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
  return (await saved).status();
}

const SERVER_ERROR_STATUS = 500;

function isSave(route: Route): boolean {
  const method = route.request().method();
  return method === "PUT" || method === "PATCH";
}

export interface SavesThatFail {
  /** From now on the design's saves reach the server. */
  readonly stopFailing: () => void;
}

/** Answers every save of `designId` with a server error until told to stop; reads and later saves pass through. */
export async function failSavesOf(
  page: Page,
  designId: string,
): Promise<SavesThatFail> {
  let isFailing = true;
  await page.route(`**/api/designs/${designId}`, async (route: Route) => {
    if (isFailing && isSave(route)) {
      await route.fulfill({
        status: SERVER_ERROR_STATUS,
        contentType: "application/json",
        body: "{}",
      });
      return;
    }
    await route.continue();
  });
  return {
    stopFailing: () => {
      isFailing = false;
    },
  };
}

export interface HeldSave {
  /** Resolves once the held save has left the browser. */
  readonly hasLeft: Promise<void>;
  /** Lets the held save reach the server and be answered. */
  readonly release: () => Promise<void>;
}

/** Keeps the first save of `designId` out, unanswered, until released; every other request passes through. */
export async function holdFirstSaveOf(
  page: Page,
  designId: string,
): Promise<HeldSave> {
  let held: Route | null = null;
  let markLeft: () => void = () => undefined;
  const hasLeft = new Promise<void>((resolve) => {
    markLeft = resolve;
  });
  await page.route(`**/api/designs/${designId}`, async (route: Route) => {
    if (held === null && isSave(route)) {
      held = route;
      markLeft();
      return;
    }
    await route.continue();
  });
  return {
    hasLeft,
    release: async () => {
      await held?.continue();
    },
  };
}
