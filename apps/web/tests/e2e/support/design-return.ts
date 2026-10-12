// Leaving a design for Step 1 and a second design, and coming back by the browser's history: the moves and the
// readouts the return specs share. No assertion lives here.
import { expect, type Page } from "@playwright/test";

import {
  expectEditorReady,
  toTheDesignApi,
  type RecordedRequest,
} from "./qa-8d-review";
import { CONFIRM, DIALOG, press } from "./qa-m7c-c1-s3-back";
import { continueButton, roomScreen } from "./step-one-by-touch";

export const ROOM_URL = /\/ro\/configurator\/room/;
export const EDITOR_URL = /\/ro\/d\/[^/]+$/;

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
