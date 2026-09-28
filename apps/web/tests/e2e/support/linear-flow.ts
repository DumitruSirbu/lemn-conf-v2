// Support for M7 wave 7J, criterion A16: the straight kitchen's own real flow, end to end. Shared
// by the mobile and desktop specs so the two viewports run the same journey rather than each
// keeping its own copy — the mirror flow's own pattern (`mirror-flow.ts`).
import { expect, type Locator, type Page } from "@playwright/test";

import { ro } from "../../support/romanian-content.e2e";
import { issueShareLink, openSharedDesign } from "./seeded-design";

const ROOM = "/ro/configurator/room";

/** Comfortably inside the straight kitchen's own approved range (1200–6000, 2200–3900), so
 *  composition places a sink and a hob and the journey is the subject rather than the generator's
 *  boundary — `generate-kitchen.linear.test.ts` (domain) owns that boundary. */
const AS_TYPED = { wallA: "3700", height: "2600" } as const;

// No `direction` key: `serialiseRoomInput` (`room-url-state.ts`) never writes one for a straight
// room (ADR 0130 D7 — no corner, no direction).
const EMPTY_LINEAR_ROOM = `${ROOM}?shape=linear`;
/** `AS_TYPED` in the URL's own metres (ADR 0126): 3700 mm and 2600 mm as the settle writes them. */
const TYPED_LINEAR_ROOM = `${ROOM}?shape=linear&wallA=3.7&height=2.6`;

function roomScreen(page: Page): Locator {
  return page.locator("main[data-room-substate]");
}

function lengthField(page: Page, field: keyof typeof AS_TYPED): Locator {
  return page.getByTestId(`room-length-${field}`);
}

async function typeLength(
  page: Page,
  field: keyof typeof AS_TYPED,
  text: string,
): Promise<void> {
  const input = lengthField(page, field);
  await input.click();
  await input.pressSequentially(text);
}

async function expectFields(page: Page): Promise<void> {
  for (const [field, text] of Object.entries(AS_TYPED)) {
    await expect(lengthField(page, field as keyof typeof AS_TYPED)).toHaveValue(
      text,
    );
  }
}

function idInEditorUrl(url: string): string {
  const id = new URL(url).pathname.split("/").pop();
  if (id === undefined || id === "") throw new Error(`no design id in ${url}`);
  return decodeURIComponent(id);
}

/** The camera group's own buttons — two for a straight design (ADR 0130 D9), never three. */
async function cameraPresetButtonCount(page: Page): Promise<number> {
  return page
    .getByRole("group", { name: ro.configure.cameraGroupLabel })
    .getByRole("button")
    .count();
}

/**
 * *Liniară* → 1B → 1D → 1F → the editor at `/d/{id}`, with a reload proved at both the room query
 * and the editor's own URL, and the share view checked for the same straight kitchen (criterion
 * A16). `mintedIds` is the caller's own array — the caller's `afterAll` deletes it (ADR 0006), so
 * this function mints a row but never owns its cleanup.
 */
export async function runLinearFlow(
  page: Page,
  mintedIds: string[],
): Promise<void> {
  await page.goto(ROOM);
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1A");

  await page.getByTestId("room-shape-card-linear").click();
  await page.getByTestId("room-continue").click();
  await expect(page).toHaveURL(EMPTY_LINEAR_ROOM);
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1B");

  await typeLength(page, "wallA", AS_TYPED.wallA);
  await typeLength(page, "height", AS_TYPED.height);
  await expect(page).toHaveURL(TYPED_LINEAR_ROOM);
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1D");

  // Reload on the room query restores 1D with the same fields.
  await page.reload();
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1D");
  await expectFields(page);

  await page.getByTestId("room-continue").click();
  await expect(page.getByTestId("room-compose")).toBeVisible();
  await expect(page.getByTestId("room-compose-rows")).toBeVisible();

  await page.waitForURL(/\/ro\/d\/[^/]+$/);
  const designId = idInEditorUrl(page.url());
  mintedIds.push(designId);
  await expect(page.getByTestId("top-bar-title")).toBeVisible();
  expect(await cameraPresetButtonCount(page)).toBe(2);

  // Reload on `/d/{id}` restores the same design.
  await page.reload();
  await expect(page.getByTestId("top-bar-title")).toBeVisible();
  expect(await cameraPresetButtonCount(page)).toBe(2);

  // The back link returns Step 1 filled in with the room the customer typed.
  //
  // Read and followed, rather than clicked (`mirror-flow.ts`'s own finding):
  // `configure-module__I4GB0W__back` is one of D2A's two top-bar arms and `configure.module.css`
  // hides it at the desktop breakpoint in favour of the wordmark, so a click that first waits for
  // it to be *visible* hangs forever on that project. The link exists on the page either way.
  const backHref = await page.getByTestId("top-bar-back").getAttribute("href");
  if (!backHref) throw new Error("top-bar-back carries no href");
  await page.goto(backHref);
  await expect(page).toHaveURL(TYPED_LINEAR_ROOM);
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1D");
  await expectFields(page);

  // The share view draws the same kitchen.
  await page.goto(`/ro/d/${designId}`);
  const sharePath = await issueShareLink(page, { id: designId, revision: "" });
  const shareContext = await page.context().browser()?.newContext();
  if (!shareContext) throw new Error("could not open a fresh browser context");
  try {
    const sharePage = await shareContext.newPage();
    await openSharedDesign(sharePage, sharePath);
    await expect(sharePage.locator("canvas")).toBeVisible();
    expect(await cameraPresetButtonCount(sharePage)).toBe(2);
  } finally {
    await shareContext.close();
  }
}
