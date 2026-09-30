// Support for M7B wave U6 S1 (AC2's dated line): the U's real flow, end to end, now that the approved
// policy states the U. Shared by the mobile and desktop specs so the two viewports run one journey —
// the straight kitchen's own pattern (`linear-flow.ts`). Wave U7 adds the wall-C edits, the captures and
// the share view on top of this; this journey is the one U6 owes: 1A -> 1B -> 1D -> 1F -> the editor.
import { expect, type Locator, type Page } from "@playwright/test";

import { ro } from "../../support/romanian-content.e2e";

const ROOM = "/ro/configurator/room";

/** Comfortably inside the approved U (A 2700-6000, B and C 1000-6000, the minimum kitchen met by
 *  A >= 3000), so composition places a sink and a hob and the journey is the subject rather than the
 *  generator's boundary — `u-minimum-kitchen.test.ts` (domain) owns that boundary. */
const AS_TYPED = {
  wallA: "4500",
  wallB: "3000",
  wallC: "3600",
  height: "2600",
} as const;

type TypedField = keyof typeof AS_TYPED;

// No `direction` key: a U has one hand and the URL it writes names none (ADR 0132 decision 8).
const EMPTY_U_ROOM = `${ROOM}?shape=U`;
/** `AS_TYPED` in the URL's own metres (ADR 0126), as the settle writes them. */
const TYPED_U_ROOM = `${ROOM}?shape=U&wallA=4.5&wallB=3&wallC=3.6&height=2.6`;

/** A U's four camera presets: overview and one per wall (`CameraPresetId`). */
const U_CAMERA_PRESETS = 4;

function roomScreen(page: Page): Locator {
  return page.locator("main[data-room-substate]");
}

function lengthField(page: Page, field: TypedField): Locator {
  return page.getByTestId(`room-length-${field}`);
}

async function typeLength(
  page: Page,
  field: TypedField,
  text: string,
): Promise<void> {
  const input = lengthField(page, field);
  await input.click();
  await input.pressSequentially(text);
}

async function expectFields(page: Page): Promise<void> {
  for (const [field, text] of Object.entries(AS_TYPED)) {
    await expect(lengthField(page, field as TypedField)).toHaveValue(text);
  }
}

function idInEditorUrl(url: string): string {
  const id = new URL(url).pathname.split("/").pop();
  if (id === undefined || id === "") throw new Error(`no design id in ${url}`);
  return decodeURIComponent(id);
}

/** A retrying assertion, never a `count()` (`linear-flow.ts`'s finding): the editor's first client
 *  commit replaces the store's initial L, so a count taken at once can read the L's three presets. */
async function expectCameraPresetButtons(page: Page): Promise<void> {
  await expect(
    page
      .getByRole("group", { name: ro.configure.cameraGroupLabel })
      .getByRole("button"),
  ).toHaveCount(U_CAMERA_PRESETS);
}

/**
 * *În formă de U* -> *Continuă* -> 1B -> 1D -> 1F -> the editor at `/d/{id}`, with a reload proved at
 * both the room query and the editor's own URL and the back link returning Step 1 filled in. `mintedIds`
 * is the caller's own array — the caller's `afterAll` deletes it (ADR 0006), so this function mints a
 * row but never owns its cleanup.
 */
export async function runUFlow(page: Page, mintedIds: string[]): Promise<void> {
  await page.goto(ROOM);
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1A");

  await page.getByTestId("room-shape-card-U").click();
  await expect(page.getByTestId("room-shape-refusal")).toHaveCount(0);
  await page.getByTestId("room-continue").click();
  await expect(page).toHaveURL(EMPTY_U_ROOM);
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1B");

  for (const field of ["wallA", "wallB", "wallC", "height"] as const) {
    await typeLength(page, field, AS_TYPED[field]);
  }
  await expect(page).toHaveURL(TYPED_U_ROOM);
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1D");

  // Reload on the room query restores 1D with the same fields.
  await page.reload();
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1D");
  await expectFields(page);

  await page.getByTestId("room-continue").click();
  await expect(page.getByTestId("room-compose")).toBeVisible();
  await expect(page.getByTestId("room-compose-rows")).toBeVisible();

  await page.waitForURL(/\/ro\/d\/[^/]+$/);
  mintedIds.push(idInEditorUrl(page.url()));
  await expect(page.getByTestId("top-bar-title")).toBeVisible();
  await expectCameraPresetButtons(page);

  // Reload on `/d/{id}` restores the same design.
  await page.reload();
  await expect(page.getByTestId("top-bar-title")).toBeVisible();
  await expectCameraPresetButtons(page);

  // The back link returns Step 1 filled in with the room the customer typed. Read and followed rather
  // than clicked, as `linear-flow.ts` does: the desktop breakpoint hides the arm a click would wait on.
  const backHref = await page.getByTestId("top-bar-back").getAttribute("href");
  if (!backHref) throw new Error("top-bar-back carries no href");
  await page.goto(backHref);
  await expect(page).toHaveURL(TYPED_U_ROOM);
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1D");
  await expectFields(page);
}
