import { expect, test, type Page } from "@playwright/test";

/**
 * **The breakdown sheet's close button, measured against what is painted over it** — the owner's
 * report of 2026-09-09: the sheet opens on a phone and there is no way out of it.
 *
 * Three ways out of this sheet, and on a phone the first two do not exist. **Escape** is a keyboard.
 * **Tapping outside** has never dismissed it: frame 2D deliberately keeps the scene live behind the
 * sheet and there is no scrim to catch the tap (ADR 0104, M6-AUD-013). So `Închide` is the only one,
 * and a reload was the only escape while it was covered.
 *
 * **Why this file is a hit test and not a query.** Every existing assertion about that button asks
 * the DOM for it, and the button was never missing — `.actions` was painted on top of it.
 *
 * **The gate was not blind. It was illegible, and nobody was watching it.** The one test that came
 * close, `price-breakdown.e2e.spec.ts`'s *"closes from its own close action"*, **does** fail on this
 * defect: Playwright's `tap()` runs its own hit-target check and never lands the tap. But it fails
 * as a **120-second timeout with no reason attached**, which says *something is slow* where the
 * defect is *something is on top* — and this browser suite runs on merge and on demand, never on a
 * pull request, so the one signal that existed was both unreadable and unobserved.
 *
 * That distinction is the part worth keeping, because the two have different repairs. A blind gate
 * is fixed by writing a better assertion. An illegible one is fixed by making the failure name its
 * cause and by putting the suite where someone will read it. This file does the first half: it
 * asserts the covering directly, so a regression prints the element that is over the button —
 * `review-cta` — in about two seconds. The second half is not a test's to do, and is reported rather
 * than quietly worked around.
 *
 * It is the 900 px header clip's failure mode one layer up: a per-element probe cannot see a box
 * that something *outside* it is drawn over, any more than it can see one clipped from outside. The
 * only witness for either is a measurement taken from the screen's side — there,
 * `document.elementFromPoint`.
 *
 * **The probes are inset by the button's own corner radius, and that is not slack.** `.close` is
 * `border-radius: 12px`, so a point at a literal corner of its bounding box lies *outside* the
 * painted shape and hits the parent — measured on desktop, where nothing covers the button at all
 * and all four bare corners still returned `.footer`. A corner probe would therefore fail on a
 * correct page, which is worse than not probing: it would be reverted as flaky. Inset past the
 * radius and the four points are inside the shape and still nowhere near the centre.
 */

const SCENE_SETTLE_MS = 2000;

/** Past `.close`'s own `border-radius: 12px`, so a probe lands on the button and not in the corner
 *  the radius cuts away. */
const CORNER_INSET_PX = 14;

/** The shipped phone viewport, and two short ones a real device reaches with browser chrome
 *  expanded — the same three `global-settings-actions-reachable.e2e.spec.ts` sweeps, because the
 *  bottom of the screen is where both surfaces are at risk and a fix that only holds at 844 is a
 *  fix for the screenshot rather than for the phone. */
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 390, height: 620 },
  { width: 360, height: 560 },
] as const;

interface Probe {
  readonly name: string;
  readonly x: number;
  readonly y: number;
}

async function openSheet(page: Page): Promise<void> {
  await page.goto("/configurator/configure");
  await page.waitForSelector("canvas", { state: "attached" });
  await page.waitForTimeout(SCENE_SETTLE_MS);
  await page.getByTestId("price-breakdown-trigger").tap();
  await expect(page.getByTestId("price-breakdown-surface")).toBeVisible();
}

/** What the screen returns at each of five points on the close button: its centre and its four
 *  corners, inset past the radius. Returns the `data-testid` where there is one and the class where
 *  there is not, so a failure names the covering element rather than only reporting a mismatch. */
async function whatIsOnTopOfTheCloseButton(
  page: Page,
): Promise<readonly (readonly [string, string])[]> {
  return page.evaluate((inset: number) => {
    const button = document.querySelector(
      '[data-testid="price-breakdown-close"]',
    );
    if (!button) throw new Error("the close button is not in the document");
    const box = button.getBoundingClientRect();
    const probes: Probe[] = [
      { name: "centre", x: box.x + box.width / 2, y: box.y + box.height / 2 },
      { name: "top-left", x: box.x + inset, y: box.y + inset },
      { name: "top-right", x: box.right - inset, y: box.y + inset },
      { name: "bottom-left", x: box.x + inset, y: box.bottom - inset },
      { name: "bottom-right", x: box.right - inset, y: box.bottom - inset },
    ];
    return probes.map((probe) => {
      const found = document.elementFromPoint(probe.x, probe.y);
      // `className` is a string on an `HTMLElement` and an `SVGAnimatedString` on an SVG one, so it
      // is read through `getAttribute` — which answers a string or nothing for either.
      const name = found
        ? (found.getAttribute("data-testid") ??
          found.getAttribute("class") ??
          found.tagName.toLowerCase())
        : "nothing";
      return [probe.name, name] as const;
    });
  }, CORNER_INSET_PX);
}

test.describe("the breakdown sheet's close button is reachable, not merely present", () => {
  for (const viewport of VIEWPORTS) {
    const where = `${String(viewport.width)} x ${String(viewport.height)}`;

    test(`answers the close button at all five points at ${where}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await openSheet(page);

      const found = await whatIsOnTopOfTheCloseButton(page);

      expect(found).toEqual([
        ["centre", "price-breakdown-close"],
        ["top-left", "price-breakdown-close"],
        ["top-right", "price-breakdown-close"],
        ["bottom-left", "price-breakdown-close"],
        ["bottom-right", "price-breakdown-close"],
      ]);
    });
  }

  /** The button is on screen as well as on top. A box below the fold is unreachable for a different
   *  reason and would pass the probes above by returning `nothing`. */
  test("draws the close button inside the viewport", async ({ page }) => {
    await openSheet(page);

    const box = await page.getByTestId("price-breakdown-close").boundingBox();
    const viewport = page.viewportSize();
    if (!box || !viewport) throw new Error("the sheet is not laid out");

    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  });

  /** **The premise, and it is the one that keeps this file honest.** The action row is still drawn
   *  and still occupies the band the sheet now covers — so the probes above are answering "the sheet
   *  wins the overlap", not "there was nothing to overlap". Without this, deleting the action row
   *  would turn every assertion above green. */
  test("still draws the action row underneath, overlapping the button's band", async ({
    page,
  }) => {
    await openSheet(page);

    const close = await page.getByTestId("price-breakdown-close").boundingBox();
    const back = await page.getByTestId("bottom-bar-back").boundingBox();
    const cta = await page.getByTestId("review-cta").boundingBox();
    if (!close || !back || !cta)
      throw new Error("the bottom rows are not laid out");

    // They share the band: the action row's box starts above the close button's bottom edge.
    expect(back.y).toBeLessThan(close.y + close.height);
    expect(cta.y).toBeLessThan(close.y + close.height);
  });

  /** Frame 2D keeps the scene live behind the sheet and there is no scrim (ADR 0104, M6-AUD-013).
   *  Asserted here because the obvious way to make a close button reachable is to put a scrim under
   *  it, and that is the fix this product has already refused. */
  test("leaves the scene above the sheet live and hit-testable", async ({
    page,
  }) => {
    await openSheet(page);

    const sheet = await page
      .getByTestId("price-breakdown-surface")
      .boundingBox();
    const canvas = await page.locator("canvas").boundingBox();
    if (!sheet || !canvas) throw new Error("the sheet is not laid out");

    // The strip of scene the sheet leaves standing, measured from the canvas's own top rather than
    // from the page's: the top bar is above the canvas and answers `button` for its own controls,
    // which is a correct answer to the wrong question.
    const strip = sheet.y - canvas.y;
    expect(strip).toBeGreaterThan(0);

    const onTop = await page.evaluate(
      ([x, y]: readonly [number, number]) => {
        const found = document.elementFromPoint(x, y);
        return found ? found.tagName.toLowerCase() : "nothing";
      },
      [canvas.x + canvas.width / 2, canvas.y + strip / 2] as const,
    );

    expect(onTop).toBe("canvas");
  });
});
