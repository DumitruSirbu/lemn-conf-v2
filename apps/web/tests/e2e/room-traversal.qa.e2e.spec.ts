// **The traversal, in a build** — M7 wave 7F1-D45, criterion 23, ruling R9.
//
// This is the only place defects **D4** (a browser Back loses the room the customer typed) and
// **D5** (a traversal draws 1A under a 1B URL) are falsifiable. Both were found in a production
// build by the visual gate, and neither can be reproduced in a DOM test: what restores the stale
// room is Next reusing a page segment on a back/forward navigation
// (`next/dist/docs/01-app/02-guides/upgrading/version-15.md:525`), and no harness can stand in for
// the browser's own history.
//
// **Each assertion below names the defect it would have caught.** They are written against measured
// values, not invented ones: the gate walked this path by hand on 2026-09-14 and the URL, the field
// notation and the entry counts here are what it recorded.
//
// **The probe is *Înapoi* and then Back, never *Continuă* and then Back**, for two reasons. A push
// whose target equals the current URL is demoted to a `replaceState` and mints no entry
// (`next/dist/client/components/app-router.js:59-61`), so *Continuă* at 1B leaves nothing to come
// back from and the test would pass vacuously. And *Înapoi* — `router.push` at the bare pathname,
// which is never demoted — is the gesture that minted the entry D4's Back came from, so this spec
// reproduces the reported defect step for step rather than its class.
//
// **CI is the verdict.** A green local run says nothing about runner timing, and locally the suite
// serves `next dev` rather than a build.
import { expect, test, type Locator, type Page } from "@playwright/test";

const ROOM = "/ro/configurator/room";

/** What the first debounced sync writes over the bare `?shape=L` *Continuă* pushes: ruling R6's
 *  third layer, performed by a `router.replace` that rewrites the entry rather than minting one. */
const THE_EMPTY_L_ROOM = `${ROOM}?shape=L&direction=left`;

/** The room this spec types, as the URL holds it once typing has settled. Metres are written with a
 *  dot on the wire and the field takes whole millimetres (ADR 0126) — one room, two notations, and
 *  `metresTextForUrl` is the only place that crossing happens. */
const THE_TYPED_ROOM = `${ROOM}?shape=L&wallA=3.56&wallB=4.25&height=2.7&direction=left`;

/** The room as the customer types it, and as the fields render it after a traversal: a re-seed from
 *  the URL refills exactly these digits (ADR 0126), so there is no notation drift to allow for. */
const AS_TYPED = { wallA: "3560", wallB: "4250", height: "2700" } as const;

/** A height one digit short of 2600 mm: what the field holds just before the last keystroke. */
const HEIGHT_BEFORE_LAST_DIGIT = "260";

// The screen's own Back control is *Înapoi*; the title names it in English because a Romanian
// literal belongs in `src/messages/*.json` and a test name is not a negative claim about wording.
test("the screen's Back, then the browser's, returns the typed room (D4) at the sub-state its URL names (D5)", async ({
  page,
}) => {
  await page.goto(ROOM);
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1A");
  const entriesAt1A = await historyLength(page);

  await page.getByTestId("room-shape-card-L").click();
  await page.getByTestId("room-continue").click();
  // Waiting on the canonicalised URL rather than on a timeout is also criterion 18's first arm: the
  // sync writes `direction=left` through a `replace`, so it rewrites this entry instead of adding
  // one — which is why the count below is the push's single entry and not two.
  await expect(page).toHaveURL(THE_EMPTY_L_ROOM);
  expect(await historyLength(page)).toBe(entriesAt1A + 1);

  await typeLength(page, "wallA", AS_TYPED.wallA);
  await typeLength(page, "wallB", AS_TYPED.wallB);
  await typeLength(page, "height", AS_TYPED.height);
  await expect(page).toHaveURL(THE_TYPED_ROOM);

  // **Typing mints no history entry.** The write is a `router.replace`; a `push` per settle would
  // bury the shape step under a dozen entries and make Back a per-keystroke undo.
  expect(await historyLength(page)).toBe(entriesAt1A + 1);
  await expectFields(page, AS_TYPED);

  await page.getByTestId("room-back").click();
  await expect(page).toHaveURL(ROOM);
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1A");
  // *Înapoi* targets the bare pathname, which differs from the URL showing, so this one **is** an
  // entry — and it is the entry the Back below comes from.
  expect(await historyLength(page)).toBe(entriesAt1A + 2);

  await page.goBack();

  // **D4.** The address bar carries every length again. Under `window.history.replaceState` the
  // router restored the URL it had recorded — `?shape=L&direction=left` — and the room was gone.
  await expect(page).toHaveURL(THE_TYPED_ROOM);
  // **D5.** The screen reads the sub-state off the live query, so a segment Next restored from its
  // own cache self-corrects. A screen that believed the server's parse drew 1A here, under a URL
  // describing a complete room.
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1D");
  await expectFields(page, AS_TYPED);

  // Forward, then Back again: both hold, so the first Back was not a one-off re-render.
  await page.goForward();
  await expect(page).toHaveURL(ROOM);
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1A");

  await page.goBack();

  await expect(page).toHaveURL(THE_TYPED_ROOM);
  await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1D");
  await expectFields(page, AS_TYPED);
});

test("a tap inside the settle interval leaves the last digit in the entry behind (I5)", async ({
  page,
}) => {
  // **The case the flush exists for, and the one a customer actually hits**: type the last digit and
  // tap on at once. Cancelling the pending write and pushing — the obvious design — would leave a
  // 1B entry that never received that digit, which is D4 again on the fastest, most confident path.
  // The departure flushes instead, and pushes only once the flush has been observed coming back.
  //
  // On a slow machine the settle may fire before the tap, in which case the departure takes its
  // immediate path. The claim below holds either way; what it can never do is pass over a design
  // that drops the digit.
  await page.goto(ROOM);
  await page.getByTestId("room-shape-card-L").click();
  await page.getByTestId("room-continue").click();
  await expect(page).toHaveURL(THE_EMPTY_L_ROOM);

  await typeLength(page, "wallA", AS_TYPED.wallA);
  await typeLength(page, "wallB", AS_TYPED.wallB);
  await typeLength(page, "height", HEIGHT_BEFORE_LAST_DIGIT);
  await expect(page).toHaveURL(
    `${ROOM}?shape=L&wallA=3.56&wallB=4.25&height=0.26&direction=left`,
  );

  const height = lengthField(page, "height");
  await height.press("End");
  await height.pressSequentially("0");
  await page.getByTestId("room-back").click();
  await expect(page).toHaveURL(ROOM);

  await page.goBack();

  // The appended digit completes an ordinary 2600 mm height, so the entry left behind is a valid
  // room; had the digit been dropped, this URL would still read `height=0.26`.
  await expect(page).toHaveURL(
    `${ROOM}?shape=L&wallA=3.56&wallB=4.25&height=2.6&direction=left`,
  );
  await expect(lengthField(page, "height")).toHaveValue("2600");
});

/** The screen, and the marker the sub-state is read off. It lives on the screen rather than on the
 *  route precisely because the route no longer parses anything (ruling R9). */
function roomScreen(page: Page): Locator {
  return page.locator("main[data-room-substate]");
}

function lengthField(page: Page, field: keyof typeof AS_TYPED): Locator {
  return page.getByTestId(`room-length-${field}`);
}

/** A length as the customer enters it — one keystroke at a time, so *"typing mints no entry"* is a
 *  claim about several keystrokes rather than about one `fill`. */
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

async function historyLength(page: Page): Promise<number> {
  return page.evaluate(() => window.history.length);
}
