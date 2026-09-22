// **Adversarial QA, M7 wave 7F2 slice S3b — late echoes on a real router, swept and slowed.**
//
// The implementer's `room-late-echo.e2e.spec.ts` samples twelve gaps on a localhost round trip. This
// spec widens both axes the defect lives on:
// - **the gap**, swept every 20 ms over 300–600 ms, and the first keystroke after 1B every 10 ms over
//   300–500 ms;
// - **the round trip**, stretched to a phone network's with Chrome's own network emulation (300 ms
//   of latency on every request), where a write's round trip is longer than the settle and two
//   writes can be in flight at once;
// - **three fields** typed through each other's round trips, with the locale prefix checked.
//
// The waits are the stimulus, never the synchronisation: every assertion polls.
import {
  expect,
  test,
  type CDPSession,
  type Locator,
  type Page,
} from "@playwright/test";

const ROOM = "/ro/configurator/room";
const THE_EMPTY_L_ROOM = `${ROOM}?shape=L&direction=left`;

/** A phone network's latency, added by Chrome to every request, the RSC fetch a `replace` makes
 *  included. */
const SLOW_NETWORK_LATENCY_MS = 300;

const GAP_SWEEP_MS = rangeOf({ fromMs: 300, toMs: 600, stepMs: 20 });
const FIRST_KEYSTROKE_SWEEP_MS = rangeOf({
  fromMs: 300,
  toMs: 500,
  stepMs: 10,
});
const SLOW_NETWORK_GAPS_MS = [300, 400, 450, 500, 600, 700, 900] as const;

for (const gapMs of GAP_SWEEP_MS) {
  test(`keeps 36 when 6 follows 3 by ${String(gapMs)} ms`, async ({ page }) => {
    await page.goto(THE_EMPTY_L_ROOM, { waitUntil: "networkidle" });

    await lengthField(page, "wallA").fill("3");
    await page.waitForTimeout(gapMs);
    await lengthField(page, "wallA").press("6");

    await expect(page).toHaveURL(`${ROOM}?shape=L&wallA=0.036&direction=left`);
    await expect(lengthField(page, "wallA")).toHaveValue("36");
  });
}

for (const delayMs of FIRST_KEYSTROKE_SWEEP_MS) {
  test(`keeps the first digit typed ${String(delayMs)} ms after 1B is asked for`, async ({
    page,
  }) => {
    await page.goto(ROOM, { waitUntil: "networkidle" });
    await page.getByTestId("room-shape-card-L").click();

    await page.getByTestId("room-continue").click();
    await page.waitForTimeout(delayMs);
    await lengthField(page, "wallA").press("3");

    await expect(page).toHaveURL(`${ROOM}?shape=L&wallA=0.003&direction=left`);
    await expect(lengthField(page, "wallA")).toHaveValue("3");
  });
}

for (const gapMs of SLOW_NETWORK_GAPS_MS) {
  test(`keeps 360 typed a digit every ${String(gapMs)} ms over a ${String(SLOW_NETWORK_LATENCY_MS)} ms network`, async ({
    page,
  }) => {
    await page.goto(THE_EMPTY_L_ROOM, { waitUntil: "networkidle" });
    await slowTheNetwork(page);
    const wallA = lengthField(page, "wallA");

    await wallA.fill("3");
    await page.waitForTimeout(gapMs);
    await wallA.press("6");
    await page.waitForTimeout(gapMs);
    await wallA.press("0");

    await expect(page).toHaveURL(`${ROOM}?shape=L&wallA=0.36&direction=left`, {
      timeout: 10_000,
    });
    await expect(wallA).toHaveValue("360");
  });
}

for (const gapMs of [420, 600] as const) {
  test(`keeps wall A, wall B and the ceiling typed ${String(gapMs)} ms apart over a slow network, in /ro`, async ({
    page,
  }) => {
    await page.goto(THE_EMPTY_L_ROOM, { waitUntil: "networkidle" });
    await slowTheNetwork(page);

    await lengthField(page, "wallA").fill("3");
    await page.waitForTimeout(gapMs);
    await lengthField(page, "wallB").fill("2");
    await page.waitForTimeout(gapMs);
    await lengthField(page, "height").fill("2");
    // Focus moves back to wall A with the caret at the start, so the caret is sent to the end first.
    await lengthField(page, "wallA").press("End");
    await page.waitForTimeout(gapMs);
    await lengthField(page, "wallA").press("6");

    await expect(page).toHaveURL(
      `${ROOM}?shape=L&wallA=0.036&wallB=0.002&height=0.002&direction=left`,
      { timeout: 10_000 },
    );
    await expect(lengthField(page, "wallA")).toHaveValue("36");
    await expect(lengthField(page, "wallB")).toHaveValue("2");
    await expect(lengthField(page, "height")).toHaveValue("2");
  });
}

function rangeOf(range: {
  fromMs: number;
  toMs: number;
  stepMs: number;
}): readonly number[] {
  const count = Math.floor((range.toMs - range.fromMs) / range.stepMs) + 1;
  return Array.from({ length: count }, (_, index) => {
    return range.fromMs + index * range.stepMs;
  });
}

function lengthField(page: Page, field: "wallA" | "wallB" | "height"): Locator {
  return page.getByTestId(`room-length-${field}`);
}

async function slowTheNetwork(page: Page): Promise<CDPSession> {
  const session = await page.context().newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: SLOW_NETWORK_LATENCY_MS,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  return session;
}
