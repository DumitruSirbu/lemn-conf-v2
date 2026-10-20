// **The journey, once, end to end** — M7 wave 7F4b, criterion 44.
//
// `/ro/configurator/room` → choose **L** → type a room → *Continuă* → 1F → the editor at
// `/ro/d/{id}` showing that kitchen; then *‹ Cameră* returns to Step 1 with the room filled in
// (wave 7E2's criterion 5, now with fields to fill).
//
// **CI is the verdict.** `scripts/local-ci.sh` sets `CI=1` for e2e, so it serves a production build as
// the runner does, but a bare `playwright test` serves `next dev`, and either way a green local run says
// nothing about runner timing. Wave 7F1-D45's close-out records that in full.
//
// **What only this spec can show.** Every other guard on the hand-off stubs `fetch`
// (`tests/room/room-handoff.dom.test.ts`) and therefore proves what the *browser sent*, not what the
// *database kept*. Here the row is real: `POST /api/designs` mints it, the `PUT` writes the composed
// document, and the editor loads it back through `GET /api/designs/{id}` before it can draw a single
// cabinet. A design the engine can produce and the round trip cannot carry fails here and nowhere
// else.
//
// Wave 7K inherits this spec rather than rewriting it.
import { expect, test, type Locator, type Page } from "@playwright/test";

import { deleteMintedDesigns } from "./support/minted-designs";
import { expectEditorTopBarShown } from "./support/editor-top-bar";

const ROOM = "/ro/configurator/room";

/** What the first debounced sync writes over the bare `?shape=L` the shape step pushes — ruling R6's
 *  third layer, performed by a `router.replace` that rewrites the entry rather than minting one. */
const THE_EMPTY_L_ROOM = `${ROOM}?shape=L&direction=left`;

/** The room this spec types, as the URL holds it once typing has settled. It is comfortably inside
 *  the approved bounds, so the composition places every core role and the journey is the subject
 *  rather than the generator's boundary — `minimum-kitchen.test.ts` owns that. */
const THE_TYPED_ROOM = `${ROOM}?shape=L&wallA=3.56&wallB=4.25&height=2.7&direction=left`;

/** The same room as the customer types it: whole millimetres, digits only (ADR 0126). A re-seed from
 *  the URL refills exactly these digits, so the fields read the same after the round trip. */
const AS_TYPED = { wallA: "3560", wallB: "4250", height: "2700" } as const;

/** Every design this spec causes to be minted, deleted in `afterAll` — ADR 0006's rule that a suite
 *  minting rows removes them. The id is read off the URL the hand-off navigated to, because nothing
 *  in this journey is told an id in advance. */
const mintedDesignIds: string[] = [];

test.afterAll(async () => {
  await deleteMintedDesigns(mintedDesignIds);
});

test("a composed kitchen opens in the editor, and the editor leads back to the room it was composed for", async ({
  page,
}) => {
  await page.goto(ROOM);
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1A");

  await page.getByTestId("room-shape-card-L").click();
  await page.getByTestId("room-continue").click();
  // Waited on rather than typed straight through: the first debounced sync rewrites this entry with
  // the corner direction, and a keystroke landing mid-settle on a slow runner races that write.
  await expect(page).toHaveURL(THE_EMPTY_L_ROOM);

  await typeLength(page, "wallA", AS_TYPED.wallA);
  await typeLength(page, "wallB", AS_TYPED.wallB);
  await typeLength(page, "height", AS_TYPED.height);
  await expect(page).toHaveURL(THE_TYPED_ROOM);

  await page.getByTestId("room-continue").click();

  // 1F, drawn from the composition rather than from a fixture: the rows exist because
  // `generateKitchen` ran in this browser, against a Three.js kit this tap pulled down.
  await expect(page.getByTestId("room-compose")).toBeVisible();
  await expect(page.getByTestId("room-compose-rows")).toBeVisible();

  // The hand-off. Nothing is tapped for it — the composition and the write are one wait.
  await page.waitForURL(/\/ro\/d\/[^/]+$/);
  const designId = idInEditorUrl(page.url());
  mintedDesignIds.push(designId);

  // The editor is genuinely on that design: its own top bar is drawn, which happens only after
  // `GET /api/designs/{id}` came back with a document the schema accepted.
  await expectEditorTopBarShown(page);

  // **7E2 criterion 5, now with fields to fill.** The back control's href is built from the design's
  // own room, so this is the room the customer typed making the full round trip through the
  // database and back into the form.
  // M7C C1 S3: the link asks first, and *Înapoi la cameră* is the navigation.
  await page.getByTestId("top-bar-back").click();
  await page.getByTestId("back-confirm-confirm").click();

  await expect(page).toHaveURL(THE_TYPED_ROOM);
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1D");
  await expectFields(page, AS_TYPED);
});

/** The screen, and the marker the sub-state is read off. */
function roomScreen(page: Page): Locator {
  return page.locator("main[data-room-substate]");
}

function idInEditorUrl(url: string): string {
  const id = new URL(url).pathname.split("/").pop();
  if (id === undefined || id === "") {
    throw new Error(`no design id in ${url}`);
  }
  // The path segment is escaped on the way in, so it is unescaped on the way out: the row's id is
  // what the mint chose, not what a URL can hold.
  return decodeURIComponent(id);
}

function lengthField(page: Page, field: keyof typeof AS_TYPED): Locator {
  return page.getByTestId(`room-length-${field}`);
}

/** A length as the customer enters it, one keystroke at a time. */
async function typeLength(
  page: Page,
  field: keyof typeof AS_TYPED,
  text: string,
): Promise<void> {
  const input = lengthField(page, field);
  await input.click();
  await input.pressSequentially(text);
}

async function expectFields(
  page: Page,
  lengths: Record<keyof typeof AS_TYPED, string>,
): Promise<void> {
  for (const [field, text] of Object.entries(lengths)) {
    await expect(lengthField(page, field as keyof typeof AS_TYPED)).toHaveValue(
      text,
    );
  }
}
