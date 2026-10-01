// **A typed digit is not lost to a late URL echo, on real timers and the real router** — M7 wave
// 7F2, slice S3b, criterion S3b-8.
//
// The settle writes the room about `URL_SETTLE_MS` after a keystroke, and that write takes a round
// trip to come back. A keystroke inside that round trip used to be undone when the older write
// echoed: the field went back to the older value and the URL settled on it.
//
// **Which arms are witnesses, and on which runner** (S3b-8, amended by S3b.10; review R1.4):
// - **The slow-network arms witness on any runner.** They add a phone network's latency to every
//   request through Chrome's own emulation, which stretches a write's round trip past the settle
//   and widens the window past any cadence jitter or build difference.
// - **The wall-A cadence arms witness only on local `next dev`**, where each gap kept was measured
//   red against HEAD's rule, 3 of 3 trials. The localhost window moves with the build and the
//   runner: in the production run (CI) they are regression checks, not witnesses, and that holds
//   for 415 and 430 ms in particular, which sit outside the window the plan measured in production.
//
// **The waits below are the stimulus, never the synchronisation.** Each one places a keystroke in
// time relative to the settle, and every assertion after it polls. D45 criterion 23's *"no fixed
// wait standing in for the flush"* still holds: nothing here waits for a write to land.
//
// **CI is the verdict.** Locally this serves `next dev`, where the round trip is the dev server's;
// the production claim is the CI run's (D45 risk 5).
import { expect, test, type Locator, type Page } from "@playwright/test";

const ROOM = "/ro/configurator/room";

/** What the first debounced sync writes over the bare `?shape=L` *Continuă* pushes. */
const THE_EMPTY_L_ROOM = `${ROOM}?shape=L&direction=left`;

/** Gaps from the first keystroke to the second, inside the settle's round trip on local `next dev`.
 *  Only the gaps measured red against HEAD's rule on this runner, 3 of 3 trials, are kept (S3b.10):
 *  350, 380, 420, 450 and 500 ms were green against HEAD here and were dropped. */
const KEYSTROKE_GAPS_MS = [390, 395, 400, 405, 410, 415, 430] as const;

/** A phone network's latency, added by Chrome to every request, the RSC fetch a `replace` makes
 *  included. */
const SLOW_NETWORK_LATENCY_MS = 300;

/** Gaps between keystrokes on the slow network, each measured red against HEAD's rule on this
 *  runner in 3 of 3 trials (300 and 800 ms were green and were dropped). */
const SLOW_NETWORK_GAPS_MS = [400, 450, 500, 550, 600, 700] as const;

/** Waits after *Continuă* on the slow network, inside the canonicalising write's round trip. Each
 *  was measured red against HEAD's rule on this runner in 3 of 3 trials (700, 1 100 and 1 300 ms
 *  were green and were dropped). The fixed-cadence version of this arm was dropped entirely: on
 *  local `next dev` its window sits outside any cadence it sampled (S3b.10, F2). */
const SLOW_NETWORK_FIRST_KEYSTROKE_DELAYS_MS = [
  800, 850, 900, 950, 1_000,
] as const;

/** A settle, a slow round trip, a re-write and its own slow round trip, with room to spare. */
const SLOW_NETWORK_SETTLE_TIMEOUT_MS = 10_000;

for (const gapMs of KEYSTROKE_GAPS_MS) {
  test(`keeps the second digit of wall A typed ${String(gapMs)} ms after the first`, async ({
    page,
  }) => {
    await openHydrated(page, THE_EMPTY_L_ROOM);
    const wallA = page.getByTestId("room-length-wallA");

    await wallA.fill("3");
    await page.waitForTimeout(gapMs);
    await wallA.press("6");

    await expect(page).toHaveURL(`${ROOM}?shape=L&wallA=0.036&direction=left`);
    await expect(wallA).toHaveValue("36");
  });
}

for (const gapMs of SLOW_NETWORK_GAPS_MS) {
  test(`keeps 360 typed a digit every ${String(gapMs)} ms over a ${String(SLOW_NETWORK_LATENCY_MS)} ms network`, async ({
    page,
  }) => {
    await openHydrated(page, THE_EMPTY_L_ROOM);
    await slowTheNetwork(page);
    const wallA = wallAField(page);

    await wallA.fill("3");
    await page.waitForTimeout(gapMs);
    await wallA.press("6");
    await page.waitForTimeout(gapMs);
    await wallA.press("0");

    await expect(page).toHaveURL(`${ROOM}?shape=L&wallA=0.36&direction=left`, {
      timeout: SLOW_NETWORK_SETTLE_TIMEOUT_MS,
    });
    await expect(wallA).toHaveValue("360");
  });
}

for (const delayMs of SLOW_NETWORK_FIRST_KEYSTROKE_DELAYS_MS) {
  test(`keeps the first digit typed ${String(delayMs)} ms after 1B is asked for over a ${String(SLOW_NETWORK_LATENCY_MS)} ms network`, async ({
    page,
  }) => {
    await openHydrated(page, ROOM);
    await slowTheNetwork(page);
    await page.getByTestId("room-shape-card-L").click();

    await page.getByTestId("room-continue").click();
    await page.waitForTimeout(delayMs);
    await wallAField(page).press("3");

    await expect(page).toHaveURL(`${ROOM}?shape=L&wallA=0.003&direction=left`, {
      timeout: SLOW_NETWORK_SETTLE_TIMEOUT_MS,
    });
    await expect(wallAField(page)).toHaveValue("3");
  });
}

/**
 * The page, loaded and hydrated before the first keystroke. A keystroke into server-rendered markup
 * that React has not yet hydrated is lost for a different reason, and would make a red here
 * ambiguous. `networkidle` is Playwright's own signal that the page's scripts have stopped loading.
 */
async function openHydrated(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: "networkidle" });
}

function wallAField(page: Page): Locator {
  return page.getByTestId("room-length-wallA");
}

/** Chrome's own network emulation, so every request the router makes pays the latency. Set after the
 *  page has loaded, so the stimulus is the round trip of the writes and not the page load. */
async function slowTheNetwork(page: Page): Promise<void> {
  const session = await page.context().newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: SLOW_NETWORK_LATENCY_MS,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
}
