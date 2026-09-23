import { NARROWED_ROOM_OVERFLOWING_DESIGN } from "@lemnaria/configurator-domain";
import { expect, type Page } from "@playwright/test";

import { deleteMintedDesigns } from "./support/minted-designs";
import {
  mintSeededDesign,
  openSeededDesign,
  test,
  type SeededDesign,
} from "./support/seeded-design";

/**
 * **ADR 0082 decision 7's other shell**: *"one rule for both shells — containment is not one of
 * §10.1's permitted layout forks, and the answer to 'may a control leave the screen' is the same on
 * both."* The mobile half is `top-bar-pill-containment.e2e.spec.ts`; this is the desktop half, and it
 * is a separate file because the project's viewport is decided by the filename.
 *
 * ## What ADR 0104 changed here, and what it did not
 *
 * The settings strip and its band are withdrawn (decision 2): frame D2A draws **one pill** in the top
 * bar and that pill is the trigger. So there is no chip count to sweep, and this file sweeps the axis
 * that actually decides whether anything is cut — **the width the row is given** — recording which
 * rung the pill lands on at each, so a change that moves a rung boundary is visible rather than
 * silent. Every ADR 0082 predicate is still asserted, of the new control.
 *
 * ## The flagged surface, and why this file was once green over a broken screen
 *
 * On 2026-09-06 this file was green while two chips rendered 28 px wide with 138 and 115 px of label
 * cut, painted inside the step nav's column, and the trigger stood over the price bar. It was green
 * because every case drove the retired editor route's own seeded document, which is **never
 * flagged** — the assertion that would have failed was evaluated only on the input that cannot
 * falsify it.
 *
 * So a design carrying ADR 0065's flag is a **second surface** here, minted and deleted the way
 * `overflow-mark.e2e.spec.ts` mints and deletes one (ADR 0006).
 *
 * ## And the flagged surface now asserts the **opposite** of what it used to
 *
 * `1cc86d8` bought 9.28 px of top-bar height so ADR 0065's sentence could wrap beside the figure at
 * 900–1025 px, and the case at this file's `:655` asserted that growth. **The owner ruled the
 * sentence out of the bar on 2026-09-09** (ADR 0104 decision 8b) and onto the scene, so the trade has
 * nothing left to buy: that case is **re-pointed, not deleted**, and now asserts that the header does
 * not grow — at either end of the window that used to cost it, on the flagged design as well as the
 * seeded one. A gate that proved a now-retired trade becomes the gate that proves it stayed retired.
 */

const SCENE_SETTLE_MS = 2000;

/**
 * The widths the row is measured at.
 *
 * 900 is the `min-width: 900px` branch's own first pixel and 1440 is the width the project runs at.
 * **1025 and 1035 sit either side of the width at which the wordmark returns** — measured 1033.32 on
 * 2026-09-09, which is where it fits beside **two** setting names, the owner's second ruling. 1025
 * and 1026 were also the two ends of the window the retired 9.28 px trade used to be spent in, so
 * one pair does both jobs. 930, 1100, 1200 and 1300 are where the pill's own rungs arrive, and 1344
 * is where frame D2A's spacing comes back. None of them is a threshold — criterion 4i forbids one —
 * they are widths a measurement is taken at.
 */
const DESKTOP_WIDTHS = [
  900, 930, 1025, 1035, 1100, 1200, 1300, 1440, 1920,
] as const;

const TOUCH_TARGET_PX = 44;
const SUB_PIXEL_SLACK = 0.5;

/** Frame D2A's own declared band. **At every width, on every design** — which is what ADR 0104
 *  decision 8b's ruling bought and what criterion 12b and 12c assert. */
const RULED_TOP_BAR_HEIGHT_PX = 76;

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const mintedDesignIds: string[] = [];

test.afterAll(async () => {
  await deleteMintedDesigns(mintedDesignIds);
});

test.beforeEach(async ({ page, seededDesign }) => {
  await openSeededDesign(page, seededDesign);
  await page.waitForTimeout(SCENE_SETTLE_MS);
});

/** Sets the width and waits for the row to have settled at it: the pill's rung and the wordmark are
 *  both decided from a `ResizeObserver`, so a measurement in the same tick as the resize is a race. */
async function atWidth(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForFunction(
    (expected) => document.documentElement.clientWidth === expected,
    width,
  );
  await page.waitForFunction(() => {
    const anchor = document.querySelector('[data-testid="global-settings"]');
    const cell = anchor?.parentElement;
    if (!cell) return false;
    /**
     * **The cell, quiet for a stretch — not the pill, and not merely for three frames.**
     *
     * Two mistakes were made here on 2026-09-09 and both read a rung the row had not taken yet. A
     * three-frame check passes while a state update from the observer is still pending; and watching
     * the *pill* passes instantly at any width where the pill's own width does not change, which is
     * most of them — the pill is content-sized and the row is what moves.
     */
    const settled = window as unknown as {
      lastTrackWidth?: number;
      settledSince?: number;
    };
    const width = cell.getBoundingClientRect().width;
    const now = performance.now();
    if (settled.lastTrackWidth !== width) {
      settled.lastTrackWidth = width;
      settled.settledSince = now;
      return false;
    }
    return now - (settled.settledSince ?? now) > 200;
  });
}

async function boxesOf(page: Page, selector: string): Promise<readonly Box[]> {
  return page.evaluate(
    (css) =>
      [...document.querySelectorAll(css)].map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        };
      }),
    selector,
  );
}

/** **Which rung the pill is on**, recorded at every width the sweep visits so that a later change
 *  that moves a boundary shows up as a changed record rather than as nothing at all. */
async function rungOf(page: Page): Promise<{
  readonly labels: readonly string[];
  readonly counter: string | null;
  readonly isWordmarkDrawn: boolean;
}> {
  return page.evaluate(() => {
    const wordmark = document.querySelector(
      "main > header > span:nth-child(2)",
    );
    return {
      labels: [
        ...document.querySelectorAll(
          '[data-testid="global-settings-pill-label"]',
        ),
      ].map((label) => label.textContent),
      counter:
        document.querySelector('[data-testid="global-settings-pill-count"]')
          ?.textContent ?? null,
      isWordmarkDrawn:
        wordmark !== null && getComputedStyle(wordmark).display !== "none",
    };
  });
}

/** The step nav's own box and every label in it, read together so a case cannot assert one and
 *  believe it has measured the other — see the note on `clipped` at the case that uses it. */
async function readNav(page: Page): Promise<{
  readonly clipped: readonly {
    readonly text: string;
    readonly overflow: number;
  }[];
  readonly left: number;
  readonly overflow: number;
}> {
  return page.evaluate(() => {
    const header = document.querySelector("header");
    if (!header) throw new Error("no header on the page");
    const clipped = [...header.querySelectorAll("span")]
      .filter((text) => text.textContent.trim().length > 0)
      .map((text) => ({
        text: text.textContent,
        overflow: text.scrollWidth - text.clientWidth,
      }))
      .filter((text) => text.overflow > 1);
    const rect = header.getBoundingClientRect();
    return {
      clipped,
      left: rect.left,
      overflow: header.scrollWidth - header.clientWidth,
    };
  });
}

/** Grid row 1, as the five cells that stand in it — the boxes criterion 12c compares between the two
 *  designs. All five are stretched to the row, so any of their heights *is* the row's. */
async function readTopBar(page: Page): Promise<{
  readonly headerHeight: number;
  readonly priceCell: Box;
  readonly pill: Box;
}> {
  return page.evaluate(() => {
    const boxOf = (selector: string): Box => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`no ${selector} on the page`);
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const bar = document.querySelector('[data-testid="price-bar"]');
    const cell = bar?.parentElement?.parentElement;
    if (!cell) throw new Error("the price bar has no cell around it");
    const cellRect = cell.getBoundingClientRect();
    return {
      headerHeight: boxOf("main > header").height,
      priceCell: {
        x: cellRect.x,
        y: cellRect.y,
        width: cellRect.width,
        height: cellRect.height,
      },
      pill: boxOf('[data-testid="global-settings-trigger"]'),
    };
  });
}

function expectInside(
  box: Box,
  bounds: { readonly width: number; readonly height: number },
  what: string,
): void {
  expect(box.x, `${what} left`).toBeGreaterThanOrEqual(-SUB_PIXEL_SLACK);
  expect(box.y, `${what} top`).toBeGreaterThanOrEqual(-SUB_PIXEL_SLACK);
  expect(box.x + box.width, `${what} right`).toBeLessThanOrEqual(
    bounds.width + SUB_PIXEL_SLACK,
  );
  expect(box.y + box.height, `${what} bottom`).toBeLessThanOrEqual(
    bounds.height + SUB_PIXEL_SLACK,
  );
}

/* ------------------------------------------------------------------------- *
 * The flagged surface: a stored design carrying ADR 0065's overflow flag.
 * ------------------------------------------------------------------------- */

/** Mints a row of its own, beside the fixture's per-test one: this file caches it across every test
 *  (below), which the test-scoped `seededDesign` fixture does not do. */
async function mintFlaggedRow(page: Page): Promise<SeededDesign> {
  const design = await mintSeededDesign(page);
  mintedDesignIds.push(design.id);
  return design;
}

/** Stores the seeded kitchen with wall A declared narrower than the run standing on it, which is
 *  what makes ADR 0065 flag the total. Built from the document the API just returned, so it cannot
 *  drift from the fixture. */
async function storeANarrowedRoom(
  page: Page,
  stored: SeededDesign,
): Promise<void> {
  const saved = await page.evaluate(
    async (target: SeededDesign & { readonly widthMm: number }) => {
      const loaded = await fetch(`/api/designs/${target.id}`);
      const { design } = (await loaded.json()) as {
        design: { room: { widthMm: number } };
      };
      const response = await fetch(`/api/designs/${target.id}`, {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-expected-revision": target.revision,
        },
        body: JSON.stringify({
          ...design,
          room: { ...design.room, widthMm: target.widthMm },
        }),
      });
      return response.status;
    },
    { ...stored, widthMm: NARROWED_ROOM_OVERFLOWING_DESIGN.room.widthMm },
  );

  // ADR 0065 decision 7 and ADR 0069: a design that does not fit still saves.
  expect(saved).toBe(200);
}

/**
 * Opens a design whose total carries ADR 0065's flag, and asserts that it does.
 *
 * **Mints its own row, in the caller's own context, every time it is called** (M7 wave 7E3b, S4,
 * criterion 9). This file used to cache one row across every test — each of which gets its own
 * fresh, empty cookie jar (Playwright's own per-test isolation) — because reading `/d/{id}` never
 * needed a credential at all (ADR 0019 decision 1). Since ADR 0114 decision 5 a design opens only in
 * the browser that owns it, so a row minted in one test's context is unreadable from the next's:
 * re-minting per call is the fallback G11 names when `addCookies` planting a host-only `__Host-`
 * cookie across contexts is not measured, which it was not here.
 *
 * **Not `openSeededDesign`, deliberately**, because that helper throws unless this browser holds
 * write access, and this file only ever reads the row back — never edits it through the UI.
 *
 * **The sentence is on the scene now** (ADR 0104 decision 8b), so that is where its presence is
 * confirmed — the entire point of the ruling is that the top bar cannot tell the two designs apart,
 * which would make a top-bar probe for the flag both wrong and vacuous.
 */
async function openFlaggedDesign(page: Page): Promise<void> {
  const flaggedDesign = await mintFlaggedRow(page);
  await storeANarrowedRoom(page, flaggedDesign);

  await page.goto(`/d/${flaggedDesign.id}`);
  await page.waitForSelector("canvas", { state: "attached" });
  await expect(page.getByTestId("price-bar-overflow")).toBeVisible();
  await page.waitForTimeout(SCENE_SETTLE_MS);
}

/* ------------------------------------------------------------------------- *
 * Amendment A's second and third predicates, as measurements.
 * ------------------------------------------------------------------------- */

/**
 * Every part of the pill measured against **its own grid item's box**, on all four edges — ADR 0082
 * *Amendment A* predicate 2, raised by ADR 0094 criterion 4b.
 *
 * The item is addressed as the anchor's parent because its class is a CSS-module hash no spec can
 * name; the structural fact — the settings cell holds this control and nothing else — is what
 * `configure-screen.tsx` renders.
 *
 * Returns a list of failures rather than asserting, so one sweep reports every width that broke
 * instead of stopping at the first.
 */
async function bandContainmentFailures(
  page: Page,
  slack: number,
): Promise<readonly string[]> {
  return page.evaluate((allowed) => {
    const anchor = document.querySelector('[data-testid="global-settings"]');
    const cell = anchor?.parentElement;
    if (!cell) throw new Error("the settings pill has no cell around it");
    const cellRect = cell.getBoundingClientRect();

    const failures: string[] = [];
    const measure = (what: string, element: Element): void => {
      const rect = element.getBoundingClientRect();
      if (rect.left < cellRect.left - allowed)
        failures.push(
          `${what} left ${String(rect.left)} < ${String(cellRect.left)}`,
        );
      if (rect.top < cellRect.top - allowed)
        failures.push(
          `${what} top ${String(rect.top)} < ${String(cellRect.top)}`,
        );
      if (rect.right > cellRect.right + allowed)
        failures.push(
          `${what} right ${String(rect.right)} > ${String(cellRect.right)}`,
        );
      if (rect.bottom > cellRect.bottom + allowed)
        failures.push(
          `${what} bottom ${String(rect.bottom)} > ${String(cellRect.bottom)}`,
        );
    };

    const pill = document.querySelector(
      '[data-testid="global-settings-trigger"]',
    );
    if (!pill) throw new Error("no settings pill on the page");
    measure("the pill", pill);
    for (const [index, part] of [...pill.children].entries())
      measure(`part ${String(index)}`, part);

    return failures;
  }, slack);
}

/**
 * Anything on the pill that is cut by the box it stands in — Amendment A's third predicate.
 *
 * **At most one, and it is the first label**: ADR 0104 decision 3 makes a label that does not fit a
 * *counted* label rather than a cut one, so the only ellipsis the ladder admits is the floor's, which
 * is the material's name and the only segment the mockups declare `text-overflow` on.
 */
async function clippedPillParts(page: Page): Promise<readonly unknown[]> {
  return page.evaluate(() => {
    const pill = document.querySelector(
      '[data-testid="global-settings-trigger"]',
    );
    if (!pill) throw new Error("no settings pill on the page");
    return [...pill.querySelectorAll("*")]
      .map((part, index) => ({
        index,
        text: part.textContent,
        testId: part.getAttribute("data-testid"),
        overflow: part.scrollWidth - part.clientWidth,
      }))
      .filter((part) => part.overflow > 1);
  });
}

/* ------------------------------------------------------------------------- *
 * The seeded design.
 * ------------------------------------------------------------------------- */

test.describe("nothing on the top bar leaves the viewport", () => {
  for (const width of DESKTOP_WIDTHS)
    test(`contains every top-bar control at ${String(width)} px`, async ({
      page,
    }) => {
      await atWidth(page, width);

      // The rung, recorded before anything is asserted about it. A pill with a counter must still
      // name at least one setting, and one naming every setting must draw no counter — the ladder's
      // two ends, at whichever width this happens to be.
      const rung = await rungOf(page);
      expect(
        rung.labels.length,
        `at ${String(width)} px`,
      ).toBeGreaterThanOrEqual(1);
      if (rung.labels.length < 4) expect(rung.counter).toMatch(/^\+\d+$/);
      else expect(rung.counter).toBeNull();

      const bounds = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
        scrollWidth: document.documentElement.scrollWidth,
      }));

      expect(bounds.scrollWidth).toBe(bounds.width);
      // **Every control in the row.** The pill, the price, the CTA and the locale are the four the
      // frame says never give way, and the assertion that would catch D2A drawn at a width it does
      // not fit is that all of them are on screen at all of them.
      for (const testId of [
        "top-bar-step",
        "top-bar-title",
        "global-settings-trigger",
        "price-bar-total",
        "review-cta",
        "top-bar-locale",
      ]) {
        const [box] = await boxesOf(page, `[data-testid="${testId}"]`);
        if (!box) throw new Error(`no ${testId} on the page`);
        expectInside(box, bounds, `${testId} at ${String(width)} px`);
      }
    });

  for (const width of DESKTOP_WIDTHS)
    test(`keeps the pill inside its own cell at ${String(width)} px`, async ({
      page,
    }) => {
      await atWidth(page, width);

      expect(
        await bandContainmentFailures(page, SUB_PIXEL_SLACK),
        `seeded at ${String(width)} px`,
      ).toEqual([]);
    });

  test("cuts at most the one label the ladder allows, at every width", async ({
    page,
  }) => {
    for (const width of DESKTOP_WIDTHS) {
      await atWidth(page, width);
      const clipped = await clippedPillParts(page);

      expect(
        clipped.length,
        `seeded at ${String(width)} px`,
      ).toBeLessThanOrEqual(1);
    }
  });

  test("gives the pill the declared touch target without painting one", async ({
    page,
  }) => {
    // ADR 0082 decision 8 with ADR 0104 decision 5's mechanism: the painted pill is frame D2A's own
    // 40 px and the hit area is the token's, so the target is measured where the requirement always
    // was — what a pointer at the corners of a 44 px box reaches.
    await atWidth(page, 900);

    const reached = await page.evaluate((target) => {
      const pill = document.querySelector(
        '[data-testid="global-settings-trigger"]',
      );
      if (!pill) throw new Error("no settings pill on the page");
      const rect = pill.getBoundingClientRect();
      const centreX = rect.x + rect.width / 2;
      const centreY = rect.y + rect.height / 2;
      const half = target / 2 - 1;
      return {
        paintedHeight: rect.height,
        corners: [
          [centreX - half, centreY - half],
          [centreX + half, centreY - half],
          [centreX - half, centreY + half],
          [centreX + half, centreY + half],
        ].map(([x, y]) => {
          const hit = document.elementFromPoint(x ?? 0, y ?? 0);
          return hit !== null && (pill === hit || pill.contains(hit));
        }),
      };
    }, TOUCH_TARGET_PX);

    expect(reached.corners).toEqual([true, true, true, true]);
    // Non-vacuity: the target is met **without** changing the drawing.
    expect(reached.paintedHeight).toBe(40);
  });
});

test.describe("the row gives way in the ruled order and no further", () => {
  test("keeps the four protected controls whole at every width", async ({
    page,
  }) => {
    // ADR 0104 decision 8: the step pill, the price figure, `Verifică designul` and the locale chip
    // are `flex: 0 0 auto` in frame D2A and are what the header is *for*. What gives is the pill's
    // ladder, then the row's gaps, then the wordmark — never these.
    for (const width of DESKTOP_WIDTHS) {
      await atWidth(page, width);

      const whole = await page.evaluate(() =>
        ["top-bar-step", "price-bar-total", "review-cta", "top-bar-locale"].map(
          (testId) => {
            const element = document.querySelector(`[data-testid="${testId}"]`);
            if (!element) throw new Error(`no ${testId} on the page`);
            return {
              testId,
              overflow: element.scrollWidth - element.clientWidth,
            };
          },
        ),
      );

      for (const control of whole)
        expect(
          control.overflow,
          `${control.testId} at ${String(width)} px`,
        ).toBeLessThanOrEqual(1);
    }
  });

  test("settles at every width it is dragged through, and clips nothing on the way", async ({
    page,
  }) => {
    /**
     * **Criterion 13's 1 px sweep**, across the width at which the wordmark returns — measured 1034
     * on 2026-09-09, and the boundary the real defect this case exists for lived at: a track measured
     * in one configuration and read in another made the row grow a label it had no room for and hold
     * it for about 250 ms.
     *
     * Three properties, and the third is the one that matters:
     *
     * - nothing on the pill is ever cut while the row is being dragged;
     * - the pill always names a setting and always counts what it does not;
     * - **the answer at a width is a property of that width**, so reading it twice gives the same
     *   thing. That is what a measure-and-decide loop cannot do, and it is what caught the real
     *   defect this case exists for: a track measured in one configuration and read in another made
     *   the row grow a label it had no room for and hold it for about 250 ms.
     *
     * **What is deliberately not asserted is a monotone label count.** Crossing the width where the
     * wordmark returns, the pill gives a label back to it — the owner's own trade (ADR 0104
     * decision 8), and the one visible consequence of it.
     */
    const seen: string[] = [];
    for (let width = 1024; width <= 1044; width += 1) {
      await atWidth(page, width);
      const first = await rungOf(page);
      const clipped = await clippedPillParts(page);
      const again = await rungOf(page);

      expect(clipped.length, `at ${String(width)} px`).toBe(0);
      expect(
        first.labels.length,
        `at ${String(width)} px`,
      ).toBeGreaterThanOrEqual(1);
      if (first.labels.length < 4)
        expect(first.counter, `at ${String(width)} px`).toMatch(/^\+\d+$/);
      // Idempotence at the width: the same row, read twice, without a resize in between.
      expect(again, `at ${String(width)} px`).toEqual(first);

      seen.push(
        `${String(width)}:${String(first.labels.length)}${first.isWordmarkDrawn ? "W" : "-"}`,
      );
    }

    // **And the property the owner's second ruling bought**: the label count never falls as the
    // window widens. At the earlier one-name width it did, at exactly this boundary — the wordmark
    // came back and took a name off the pill. Recorded as a sequence so a change that moves a
    // boundary shows up in the failure text rather than as nothing at all.
    const counts = seen.map((entry) => Number(entry.split(":")[1]?.trim()[0]));

    expect(seen.length).toBe(21);
    for (const [index, count] of counts.entries())
      if (index > 0)
        expect(count, seen.join(" | ")).toBeGreaterThanOrEqual(
          counts[index - 1] ?? 0,
        );
  });

  test("draws the wordmark above the width two setting names need beside it, and not below", async ({
    page,
  }) => {
    // Give C, ruled by the owner on 2026-09-09 and re-ruled the same day: the wordmark comes back
    // where it fits beside **two** whole setting names, so widening the window never takes a name
    // away. The boundary is **measured, not declared**, so this asserts the shape of the rule at two
    // widths well clear of it rather than pinning the width.
    await atWidth(page, 900);
    expect((await rungOf(page)).isWordmarkDrawn).toBe(false);

    await atWidth(page, 1440);
    const wide = await rungOf(page);
    expect(wide.isWordmarkDrawn).toBe(true);
    // And what it was traded for: at the narrow width the pill still names a setting whole.
    await atWidth(page, 900);
    const narrow = await rungOf(page);
    expect(narrow.labels[0]).toBe("PAL melaminat");
    expect(narrow.counter).toMatch(/^\+\d+$/);
  });
});

/* ------------------------------------------------------------------------- *
 * ADR 0104 decisions 8b and 12b/12c, on both surfaces.
 * ------------------------------------------------------------------------- */

test.describe("on a design carrying ADR 0065's overflow flag", () => {
  test("clips nothing on the pill, at any of the swept widths", async ({
    page,
  }) => {
    // ADR 0094 criterion 4a. The defect this replaces cut 138 and 115 px off two chips at 900 and was
    // clean only from 1150 up, so the widths either side of that are the ones that fail a fix which
    // moved a threshold rather than removing it.
    await openFlaggedDesign(page);

    for (const width of DESKTOP_WIDTHS) {
      await atWidth(page, width);

      expect(
        (await clippedPillParts(page)).length,
        `flagged at ${String(width)} px`,
      ).toBeLessThanOrEqual(1);
    }
  });

  test("keeps the pill inside its own cell at every width", async ({
    page,
  }) => {
    // ADR 0094 criterion 4b, and the assertion the old defect would have failed: a chip inside the
    // viewport and standing on the step nav.
    await openFlaggedDesign(page);

    for (const width of DESKTOP_WIDTHS) {
      await atWidth(page, width);
      expect(
        await bandContainmentFailures(page, SUB_PIXEL_SLACK),
        `flagged at ${String(width)} px`,
      ).toEqual([]);
    }
  });

  test("leaves the price bar's box and its hit test to itself at 900 px", async ({
    page,
  }) => {
    // ADR 0094 criterion 4c. 900 px is where the interception was measured — the trigger stood
    // 39.06 × 44.00 px over the price bar and `elementFromPoint` at the total's left edge returned
    // `global-settings-trigger`. It matters more now than it did: the pill stands in the same row as
    // the price rather than in a band beneath it.
    await openFlaggedDesign(page);
    await atWidth(page, 900);

    const measured = await page.evaluate((slack) => {
      const rectOf = (testId: string): DOMRect => {
        const element = document.querySelector(`[data-testid="${testId}"]`);
        if (!element) throw new Error(`no ${testId} on the page`);
        return element.getBoundingClientRect();
      };
      const bar = rectOf("price-bar");
      const overlaps = (what: string, rect: DOMRect): string | null => {
        const width =
          Math.min(rect.right, bar.right) - Math.max(rect.left, bar.left);
        const height =
          Math.min(rect.bottom, bar.bottom) - Math.max(rect.top, bar.top);
        if (width <= slack || height <= slack) return null;
        return `${what} overlaps the price bar by ${String(width)} × ${String(height)}`;
      };

      const intersections: string[] = [];
      for (const testId of [
        "global-settings-trigger",
        "review-cta",
        "top-bar-locale",
        "top-bar-title",
      ]) {
        const found = overlaps(testId, rectOf(testId));
        if (found) intersections.push(found);
      }

      // The three probes ADR 0094 names, each half a pixel inside the box so a boundary point is
      // never attributed to whatever paints beside it.
      const total = rectOf("price-bar-total");
      const totalElement = document.querySelector(
        '[data-testid="price-bar-total"]',
      );
      const probe = (x: number): string => {
        const hit = document.elementFromPoint(x, total.top + total.height / 2);
        if (hit && totalElement?.contains(hit)) return "price-bar-total";
        return (
          hit?.closest("[data-testid]")?.getAttribute("data-testid") ??
          "nothing"
        );
      };

      return {
        intersections,
        hits: [
          probe(total.left + slack),
          probe(total.left + total.width / 2),
          probe(total.right - slack),
        ],
      };
    }, SUB_PIXEL_SLACK);

    expect(measured.intersections).toEqual([]);
    expect(measured.hits).toEqual([
      "price-bar-total",
      "price-bar-total",
      "price-bar-total",
    ]);

    // And the breakdown still opens, which is the half wave 6K-b3's revert was about.
    await page.getByTestId("price-breakdown-trigger").click();
    await expect(page.getByTestId("price-breakdown-surface")).toBeVisible();
  });

  /**
   * ADR 0094 criterion 4e. The residue is the settings track now rather than the strip's, and the
   * pre-wave arrangement's own failure was a nav squeezed to zero, so the confinement is measured
   * rather than claimed.
   *
   * **`nav.overflow` is the whole of this case; `nav.clipped` cannot see the failure it is written
   * against.** Measured 2026-09-09 in the failing state: the header's own box was 250.7 px against a
   * 380.703 px line, the title rendered as *"Confi"* and the locale chip was not on screen — and
   * `clipped` was `[]` throughout, because no individual span was *internally* scrolled. The header
   * box cuts them from outside, which a per-span `scrollWidth − clientWidth` probe cannot detect by
   * construction.
   */
  test("does not clip the step nav at 900 px", async ({ page }) => {
    await openFlaggedDesign(page);
    await atWidth(page, 900);

    const nav = await readNav(page);

    expect(nav.clipped).toEqual([]);
    expect(nav.overflow).toBeLessThanOrEqual(1);
    expect(nav.left).toBeGreaterThanOrEqual(-SUB_PIXEL_SLACK);
  });

  /**
   * **The case that asserted `1cc86d8`'s 9.28 px, re-pointed to assert its absence.**
   *
   * It used to read: *"pays for that line in top-bar height, and only between 900 and 1025 px"* —
   * the header grew to 85.28 px on a flagged design so ADR 0065's sentence could wrap to a third line
   * beside the figure. The owner ruled that sentence out of the bar on 2026-09-09 (ADR 0104 decision
   * 8b) and onto the scene, so the height it bought has nothing left to buy.
   *
   * Both ends of the old window are still measured — 900 and 1025, where it grew, and 1026, where it
   * came back — because a gate that proved a trade is the right gate to prove the trade stayed
   * retired. **Criterion 12b.**
   */
  test("draws the ruled 76 px band at every width, flagged as well as seeded", async ({
    page,
  }) => {
    await openFlaggedDesign(page);

    for (const width of DESKTOP_WIDTHS) {
      await atWidth(page, width);
      const bar = await readTopBar(page);

      expect(bar.headerHeight, `flagged at ${String(width)} px`).toBeCloseTo(
        RULED_TOP_BAR_HEIGHT_PX,
        1,
      );
    }
  });

  /**
   * **Criterion 12c: a flagged design draws the same header as an unflagged one, at every width.**
   *
   * This is the point of moving the sentence, so it is asserted rather than described — and it is the
   * assertion that would catch the sentence coming back into the bar by any route at all, including
   * one nobody has thought of. Any difference is a finding.
   */
  test("draws the same header on a flagged design as on a seeded one", async ({
    page,
  }) => {
    const seeded: Record<string, unknown> = {};
    for (const width of DESKTOP_WIDTHS) {
      await atWidth(page, width);
      const bar = await readTopBar(page);
      const rung = await rungOf(page);
      seeded[String(width)] = {
        headerHeight: bar.headerHeight,
        priceCell: bar.priceCell,
        pill: bar.pill,
        labels: rung.labels.length,
        counter: rung.counter,
        isWordmarkDrawn: rung.isWordmarkDrawn,
      };
    }

    await openFlaggedDesign(page);

    for (const width of DESKTOP_WIDTHS) {
      await atWidth(page, width);
      const bar = await readTopBar(page);
      const rung = await rungOf(page);

      expect(
        {
          headerHeight: bar.headerHeight,
          priceCell: bar.priceCell,
          pill: bar.pill,
          labels: rung.labels.length,
          counter: rung.counter,
          isWordmarkDrawn: rung.isWordmarkDrawn,
        },
        `at ${String(width)} px`,
      ).toEqual(seeded[String(width)]);
    }
  });

  test("keeps the flagged sentence on the scene, where the header does not pay for it", async ({
    page,
  }) => {
    // Non-vacuity for the two cases above: they compare two designs, and would both pass if the flag
    // had simply stopped being drawn. It is drawn — over the scene, which takes no layout from it.
    await openFlaggedDesign(page);
    await atWidth(page, 900);

    const placed = await page.evaluate(() => {
      const warning = document.querySelector(
        '[data-testid="price-bar-overflow"]',
      );
      const canvas = document.querySelector("canvas");
      const bar = document.querySelector('[data-testid="price-bar"]');
      if (!warning || !canvas || !bar)
        throw new Error("the flagged screen is missing one of its parts");
      const warningRect = warning.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      return {
        insideTheScene:
          warningRect.top >= canvasRect.top - 1 &&
          warningRect.bottom <= canvasRect.bottom + 1,
        insideTheBar: bar.contains(warning),
      };
    });

    expect(placed.insideTheScene).toBe(true);
    expect(placed.insideTheBar).toBe(false);
  });
});
