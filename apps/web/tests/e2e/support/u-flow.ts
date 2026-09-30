// Support for M7B wave U6 S1 (AC2's dated line): the U's real flow, end to end, now that the approved
// policy states the U. Shared by the mobile and desktop specs so the two viewports run one journey —
// the straight kitchen's own pattern (`linear-flow.ts`). Wave U7 adds the wall-C edits, the captures and
// the share view on top of this; this journey is the one U6 owes: 1A -> 1B -> 1D -> 1F -> the editor.
import { expect, type Page } from "@playwright/test";

import { lengthField, roomScreen, type LengthField } from "./step-one-by-touch";
import { chooseUAndContinue, composeAndReload, ROOM } from "./u-steps";

/** Comfortably inside the approved U (A 2700-6000, B and C 1000-6000, the minimum kitchen met by
 *  A >= 3000), so composition places a sink and a hob and the journey is the subject rather than the
 *  generator's boundary — `u-minimum-kitchen.test.ts` (domain) owns that boundary. */
const AS_TYPED = {
  wallA: "4500",
  wallB: "3000",
  wallC: "3600",
  height: "2600",
} as const satisfies Record<LengthField, string>;

/** `AS_TYPED` in the URL's own metres (ADR 0126), as the settle writes them. */
const TYPED_U_ROOM = `${ROOM}?shape=U&wallA=4.5&wallB=3&wallC=3.6&height=2.6`;

async function typeLength(
  page: Page,
  field: LengthField,
  text: string,
): Promise<void> {
  const input = lengthField(page, field);
  await input.click();
  await input.pressSequentially(text);
}

async function expectFields(page: Page): Promise<void> {
  for (const field of Object.keys(AS_TYPED) as LengthField[]) {
    await expect(lengthField(page, field)).toHaveValue(AS_TYPED[field]);
  }
}

/**
 * *În formă de U* -> *Continuă* -> 1B -> 1D -> 1F -> the editor at `/d/{id}`, with a reload proved at
 * both the room query and the editor's own URL and the back link returning Step 1 filled in. `mintedIds`
 * is the caller's own array — the caller's `afterAll` deletes it (ADR 0006), so this function mints a
 * row but never owns its cleanup.
 */
export async function runUFlow(page: Page, mintedIds: string[]): Promise<void> {
  await chooseUAndContinue(page);

  for (const field of Object.keys(AS_TYPED) as LengthField[]) {
    await typeLength(page, field, AS_TYPED[field]);
  }
  await expect(page).toHaveURL(TYPED_U_ROOM);
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1D");

  // Reload on the room query restores 1D with the same fields.
  await page.reload();
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1D");
  await expectFields(page);

  await composeAndReload(page, mintedIds);

  // The back link returns Step 1 filled in with the room the customer typed. Read and followed rather
  // than clicked, as `linear-flow.ts` does: the desktop breakpoint hides the arm a click would wait on.
  const backHref = await page.getByTestId("top-bar-back").getAttribute("href");
  if (!backHref) throw new Error("top-bar-back carries no href");
  await page.goto(backHref);
  await expect(page).toHaveURL(TYPED_U_ROOM);
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1D");
  await expectFields(page);
}
