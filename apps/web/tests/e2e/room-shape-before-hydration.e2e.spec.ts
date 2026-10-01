// A shape card tapped on the server-rendered 1A, **before React has hydrated it**, is still the
// customer's choice — *Continuă* enables once the page hydrates.
//
// The card's radio is a controlled input. A tap that lands before hydration checks the DOM radio
// natively; React then hydrates with no choice in state and records the radio's *already checked*
// value as its baseline, so the tap is never reported as a change, and every further tap on that
// radio is a no-op too. Measured under a load average of 25 (2026-09-30): the card drew as chosen,
// *Continuă* stayed disabled for 30 s of repeated taps, and two unrelated specs failed the same way.
//
// The JavaScript is **held back deliberately** rather than raced, so the ordering is the stimulus and
// this test does not depend on the machine being slow.
import { expect, test, type Page, type Route } from "@playwright/test";

const ROOM = "/ro/configurator/room";

const SCRIPT_REQUESTS = "**/_next/static/**/*.js";

/** React writes `__reactProps$…` onto a DOM node when it hydrates it; nothing else does. */
async function isHydrated(page: Page, testId: string): Promise<boolean> {
  return page.getByTestId(testId).evaluate((node) => {
    return Object.keys(node).some((key) => key.startsWith("__reactProps$"));
  });
}

async function holdScripts(page: Page): Promise<() => Promise<void>> {
  const held: Route[] = [];
  let isHolding = true;
  await page.route(SCRIPT_REQUESTS, async (route) => {
    if (isHolding) {
      held.push(route);
      return;
    }
    await route.continue();
  });
  return async () => {
    isHolding = false;
    await Promise.all(held.map((route) => route.continue()));
  };
}

for (const shape of ["linear", "L", "U"] as const) {
  test(`a ${shape} card tapped before hydration still enables Continue`, async ({
    page,
  }) => {
    const releaseScripts = await holdScripts(page);
    await page.goto(ROOM, { waitUntil: "domcontentloaded" });

    await page.getByTestId(`room-shape-card-${shape}`).click();
    await expect(page.getByTestId(`room-shape-${shape}`)).toBeChecked();
    expect(await isHydrated(page, `room-shape-${shape}`)).toBe(false);

    await releaseScripts();
    await expect.poll(() => isHydrated(page, `room-shape-${shape}`)).toBe(true);

    await expect(page.getByTestId(`room-shape-${shape}`)).toBeChecked();
    await expect(page.getByTestId("room-continue")).toBeEnabled();
  });
}
