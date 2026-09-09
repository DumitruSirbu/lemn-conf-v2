import { NARROWED_ROOM_OVERFLOWING_DESIGN } from "@lemnaria/configurator-domain";
import { expect, test, type Page } from "@playwright/test";

import { deleteMintedDesigns } from "./support/minted-designs";

/**
 * **ADR 0082 decision 7's other shell**: *"one rule for both shells — containment is not one of
 * §10.1's permitted layout forks, and the answer to 'may a control leave the screen' is the same on
 * both."* The mobile half is `settings-strip-containment.e2e.spec.ts`; this is the desktop half, and
 * it is a separate file because the project's viewport is decided by the filename.
 *
 * **Measured at 900 px as well as at 1440.** On desktop the strip shares the top bar with the price
 * band, so its tightest case is the first pixel of the `min-width: 900px` branch and not the width
 * the project happens to run at. A spec that only measured 1440 would report a green tick from the
 * roomiest layout the branch has.
 *
 * ## The flagged surface, and why this file was green over a broken screen
 *
 * Everything above was true on 2026-09-06 and this file was green while two chips rendered 28 px
 * wide with 138 and 115 px of label cut, painted inside the step nav's column, and the settings
 * trigger stood 39.06 × 44.00 px over the price bar and intercepted 21 px of `price-bar-total`
 * (ADR 0094, and *Amendment A* to ADR 0082). It was green because every case below drives
 * `/configurator/configure`, which is **never flagged** — so the assertion that would have failed was
 * evaluated only on the input that cannot falsify it. A design carrying ADR 0065's overflow flag
 * gives the price bar an extra sentence, a wider column, and a different layout entirely.
 *
 * So the flagged design is a **second surface** here, minted and deleted the way
 * `overflow-mark.e2e.spec.ts` mints and deletes one (ADR 0006), narrowed to the domain's own
 * `NARROWED_ROOM_OVERFLOWING_DESIGN` width. The seeded cases below are unchanged and stay.
 *
 * ## What is asserted, and against which box
 *
 * ADR 0082 decision 1's original predicate — `scrollWidth == clientWidth` plus every box inside the
 * viewport — is necessary and was **not sufficient**: two clipped stubs standing on the step nav pass
 * it exactly. *Amendment A* adds two more, and both are here: every chip and the trigger inside
 * **`.settingsRow`'s own box** (criterion 4b), and no chip clipped by the box it stands in
 * (criterion 4a). Criterion 4c adds the price bar's own box and its hit test back, because that is
 * what the overflow landed on.
 *
 * ## What the nav's line costs, measured at both ends
 *
 * The last two cases are a pair and neither is complete alone. On 2026-09-09 the nav really was cut
 * at 900 px on a flagged design — header box 250.7 against a 380.703 px line, the title rendered
 * *"Confi"*, the locale chip not on screen — and the remedy caps the price cell at half the top bar
 * (`configure.module.css`), which the cell pays for by wrapping ADR 0065's sentence to a third line
 * and lifting grid row 1 to 85.28 px. So this file asserts the line **and** the height it was bought
 * with, and asserts that the height comes back at 1026 px. A file that measured only the line would
 * let a later change buy it with any amount of scene at all.
 */

const SCENE_SETTLE_MS = 2000;
const CHIP_COUNTS = [2, 3, 4, 5] as const;

/** The `@media (min-width: 900px)` branch's own first pixel, and the width the project runs at.
 *  Both, because the branch's tight edge and its normal case are different measurements. */
const DESKTOP_WIDTHS = [900, 1440] as const;

/** ADR 0094 criterion 4a's four widths. 900 is the branch's own first pixel and 1440 is the width
 *  the project runs at; **1000 and 1100 sit inside the 900–1150 window the defect was measured in**,
 *  so a fix that merely moved the threshold fails here instead of passing quietly. These are the
 *  widths a measurement is taken at — they are not a breakpoint, and criterion 4i forbids one. */
const FLAGGED_WIDTHS = [900, 1000, 1100, 1440] as const;

const TOUCH_TARGET_PX = 44;
const SUB_PIXEL_SLACK = 0.5;

/**
 * **The top bar's ruled height and its one measured exception.**
 *
 * 76 px is frame D2A's own band, taken on the owner's ruling of 2026-09-07 at a cost of 21 px of
 * canvas at every desktop width; `top-bar-box.test.ts` adds the four declarations up and proves the
 * header is what sets the row. That proof is about **declarations**, and on a flagged design under
 * 1026 px it is the price cell's wrapped sentence — not a declaration anywhere — that sets it
 * instead.
 *
 * Every number here was stepped a pixel at a time on the running app on 2026-09-09: the row is
 * 85.28 px from 900 through 1025 with the warning at 66.28 (three lines), and 76 px from 1026 with
 * the warning at 50.19 (two). The old uncapped layout stopped cutting the nav at 1030, so the
 * window that costs height is narrower than the window that was clipping.
 */
const RULED_TOP_BAR_HEIGHT_PX = 76;
const FLAGGED_TOP_BAR_HEIGHT_AT_900_PX = 85.28;
const TWO_LINE_WARNING_HEIGHT_PX = 50.19;
const TOP_BAR_RETURNS_TO_THE_RULED_HEIGHT_AT_PX = 1026;

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

test.beforeEach(async ({ page }) => {
  await page.goto("/configurator/configure");
  await page.waitForSelector("canvas", { state: "attached" });
  await page.waitForTimeout(SCENE_SETTLE_MS);
});

/**
 * Grows the strip to `count` chips by cloning the ones the product rendered.
 *
 * The clones carry `data-chip-clone` and are cleared before each rebuild, so the same page can be
 * measured at five chips and then at two — which is what a sweep over widths *and* counts needs, and
 * what an earlier version of this helper could not do: it read the current children as "declared",
 * so a second call never shrank the strip back.
 */
async function withChipCount(
  page: Page,
  count: number,
): Promise<readonly string[]> {
  return page.evaluate((wanted) => {
    const box = document.querySelector('[data-testid="global-settings-chips"]');
    if (!box) throw new Error("no settings chips box on the page");
    for (const clone of box.querySelectorAll('[data-chip-clone="true"]'))
      clone.remove();
    const declared = [...box.children];
    if (declared.length === 0) throw new Error("the strip declares no chips");
    while (box.children.length < wanted) {
      const source = declared[box.children.length % declared.length];
      if (!source) break;
      const clone = source.cloneNode(true) as HTMLElement;
      clone.dataset.chipClone = "true";
      box.append(clone);
    }
    return [...box.children].map((chip) => chip.textContent);
  }, count);
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

/** Grid row 1's height, and the height of the sentence that can set it. Both boxes are stretched to
 *  the row, so the header's height *is* the row's whichever cell decided it. */
async function readTopBar(page: Page): Promise<{
  readonly headerHeight: number;
  readonly warningHeight: number;
}> {
  return page.evaluate(() => {
    const header = document.querySelector("header");
    if (!header) throw new Error("no header on the page");
    const warning = document.querySelector(
      '[data-testid="price-bar-overflow"]',
    );
    if (!warning) throw new Error("the price bar carries no overflow warning");
    return {
      headerHeight: header.getBoundingClientRect().height,
      warningHeight: warning.getBoundingClientRect().height,
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

interface StoredDesign {
  readonly id: string;
  readonly revision: string;
}

/** Mints a row and returns it with the revision a save has to state (WEB-003). */
async function mintDesign(page: Page): Promise<StoredDesign> {
  const minted = await page.evaluate(async () => {
    const created = await fetch("/api/designs", {
      method: "POST",
      credentials: "same-origin",
    });
    const { id } = (await created.json()) as { id: string };
    const loaded = await fetch(`/api/designs/${id}`);
    const { revision } = (await loaded.json()) as { revision: string };
    return { id, revision, status: created.status };
  });

  // Registered before anything is asserted, so a failing assertion still cleans up.
  if (minted.id) mintedDesignIds.push(minted.id);
  expect(minted.status).toBe(201);
  return { id: minted.id, revision: minted.revision };
}

/** Stores the seeded kitchen with wall A declared narrower than the run standing on it, which is
 *  what makes ADR 0065 flag the total and give the price bar its extra sentence. Built from the
 *  document the API just returned, so it cannot drift from the fixture. */
async function storeANarrowedRoom(
  page: Page,
  stored: StoredDesign,
): Promise<void> {
  const saved = await page.evaluate(
    async (target: StoredDesign & { readonly widthMm: number }) => {
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

/** One row for the whole file — the document is read, never edited, so the tests cannot disturb each
 *  other through it, and minting once keeps the write this spec owes ADR 0006 to a single row. */
let flaggedDesignId: string | undefined;

/** Opens a design whose price bar carries ADR 0065's warning, and asserts that it does: the extra
 *  sentence is the entire reason this surface lays out differently, so a run where the flag failed to
 *  appear must fail rather than measure the easy input by accident. */
async function openFlaggedDesign(page: Page): Promise<void> {
  if (!flaggedDesignId) {
    const stored = await mintDesign(page);
    await storeANarrowedRoom(page, stored);
    flaggedDesignId = stored.id;
  }

  await page.goto(`/d/${flaggedDesignId}`);
  await page.waitForSelector("canvas", { state: "attached" });
  await expect(page.getByTestId("price-bar-overflow")).toBeVisible();
  await page.waitForTimeout(SCENE_SETTLE_MS);
}

/* ------------------------------------------------------------------------- *
 * Amendment A's second and third predicates, as measurements.
 * ------------------------------------------------------------------------- */

/**
 * Every chip and the trigger measured against **`.settingsRow`'s own box**, on all four edges.
 *
 * The band is addressed as the strip's parent element because its class is a CSS-module hash no spec
 * can name; the structural fact — `.settingsRow` holds the strip and nothing else — is what
 * `configure-screen.tsx` renders.
 *
 * Returns a list of failures rather than asserting, so one sweep reports every width and count that
 * broke instead of stopping at the first.
 */
async function bandContainmentFailures(
  page: Page,
  slack: number,
): Promise<readonly string[]> {
  return page.evaluate((allowed) => {
    const strip = document.querySelector('[data-testid="global-settings"]');
    const band = strip?.parentElement;
    if (!band) throw new Error("the settings strip has no band around it");
    const bandRect = band.getBoundingClientRect();

    const failures: string[] = [];
    const measure = (what: string, element: Element): void => {
      const rect = element.getBoundingClientRect();
      if (rect.left < bandRect.left - allowed)
        failures.push(
          `${what} left ${String(rect.left)} < ${String(bandRect.left)}`,
        );
      if (rect.top < bandRect.top - allowed)
        failures.push(
          `${what} top ${String(rect.top)} < ${String(bandRect.top)}`,
        );
      if (rect.right > bandRect.right + allowed)
        failures.push(
          `${what} right ${String(rect.right)} > ${String(bandRect.right)}`,
        );
      if (rect.bottom > bandRect.bottom + allowed)
        failures.push(
          `${what} bottom ${String(rect.bottom)} > ${String(bandRect.bottom)}`,
        );
    };

    const chips = [
      ...document.querySelectorAll('[data-testid="global-settings-chips"] > *'),
    ];
    for (const [index, chip] of chips.entries())
      measure(`chip ${String(index)}`, chip);

    const trigger = document.querySelector(
      '[data-testid="global-settings-trigger"]',
    );
    if (!trigger) throw new Error("no settings trigger on the page");
    measure("the trigger", trigger);

    return failures;
  }, slack);
}

/** Each chip's `scrollWidth − clientWidth`, which is Amendment A's third predicate: a chip clipped by
 *  the box it stands in, whatever that box's width happens to be. */
async function clippedChips(page: Page): Promise<readonly unknown[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="global-settings-chips"] > *')]
      .map((chip, index) => ({
        index,
        text: chip.textContent,
        overflow: chip.scrollWidth - chip.clientWidth,
      }))
      .filter((chip) => chip.overflow > 1),
  );
}

/* ------------------------------------------------------------------------- *
 * The seeded design — the cases this file already made, unchanged.
 * ------------------------------------------------------------------------- */

for (const width of DESKTOP_WIDTHS)
  test.describe(`at ${String(width)} px`, () => {
    for (const count of CHIP_COUNTS)
      test(`contains every chip and the trigger at ${String(count)} chips`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        const labels = await withChipCount(page, count);
        expect(labels).toHaveLength(count);

        const bounds = await page.evaluate(() => ({
          width: document.documentElement.clientWidth,
          height: document.documentElement.clientHeight,
          scrollWidth: document.documentElement.scrollWidth,
        }));

        expect(bounds.scrollWidth).toBe(bounds.width);
        const chips = await boxesOf(
          page,
          '[data-testid="global-settings-chips"] > *',
        );
        expect(chips).toHaveLength(count);
        for (const [index, chip] of chips.entries())
          expectInside(chip, bounds, `chip ${String(index)}`);

        const [trigger] = await boxesOf(
          page,
          '[data-testid="global-settings-trigger"]',
        );
        if (!trigger) throw new Error("no settings trigger on the page");
        expectInside(trigger, bounds, "the trigger");
        expect(trigger.height).toBeGreaterThanOrEqual(
          TOUCH_TARGET_PX - SUB_PIXEL_SLACK,
        );
      });

    test("truncates no chip a wrap could have shown, at five", async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await withChipCount(page, 5);

      expect(await clippedChips(page)).toEqual([]);
    });

    test("keeps the price bar's own control reachable at five chips", async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await withChipCount(page, 5);

      const reached = await page.evaluate(() => {
        const control = document.querySelector(
          '[data-testid="price-breakdown-trigger"]',
        );
        if (!control) throw new Error("no price breakdown trigger on the page");
        const rect = control.getBoundingClientRect();
        const hit = document.elementFromPoint(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
        );
        return hit !== null && control.contains(hit);
      });

      expect(reached).toBe(true);
    });
  });

/* ------------------------------------------------------------------------- *
 * ADR 0094's criteria, on both surfaces.
 * ------------------------------------------------------------------------- */

test.describe("the strip stands inside its own band", () => {
  // ADR 0094 criterion 4b, on the seeded design. The same sweep as the flagged one below, because a
  // band assertion that held only where the layout was already comfortable would be the previous
  // gap with a new predicate in it.
  test("keeps every chip and the trigger inside the band, on the seeded design", async ({
    page,
  }) => {
    for (const width of FLAGGED_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      for (const count of CHIP_COUNTS) {
        const labels = await withChipCount(page, count);
        expect(labels, `seeded at ${String(width)} px`).toHaveLength(count);
        expect(
          await bandContainmentFailures(page, SUB_PIXEL_SLACK),
          `seeded at ${String(width)} px, ${String(count)} chips`,
        ).toEqual([]);
      }
    }
  });
});

test.describe("on a design carrying ADR 0065's overflow flag", () => {
  // ADR 0094 criterion 4a. The defect this replaces cut 138 and 115 px off two chips at 900 and was
  // clean only from 1150 up, so 1000 and 1100 are the widths that fail a fix which moved the
  // threshold rather than removing it.
  test("clips no chip at 900, 1000, 1100 or 1440, at two to five chips", async ({
    page,
  }) => {
    await openFlaggedDesign(page);

    for (const width of FLAGGED_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      for (const count of CHIP_COUNTS) {
        const labels = await withChipCount(page, count);
        expect(labels, `flagged at ${String(width)} px`).toHaveLength(count);
        expect(
          await clippedChips(page),
          `flagged at ${String(width)} px, ${String(count)} chips`,
        ).toEqual([]);
      }
    }
  });

  // ADR 0094 criterion 4b, and the assertion the defect would have failed: chip x 155.39 against a
  // band starting at 183.39 — inside the viewport, and standing on the step nav.
  test("keeps every chip and the trigger inside the band, and the band spans the screen", async ({
    page,
  }) => {
    await openFlaggedDesign(page);

    for (const width of FLAGGED_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      for (const count of CHIP_COUNTS) {
        await withChipCount(page, count);
        expect(
          await bandContainmentFailures(page, SUB_PIXEL_SLACK),
          `flagged at ${String(width)} px, ${String(count)} chips`,
        ).toEqual([]);
      }

      // ADR 0094 decision 2's own invariant: the band is a **row**, so its width is the viewport's
      // whatever the price bar's sentence and whatever the book's tier names. Compared against the
      // viewport rather than against a literal — a px literal here would be criterion 4i's magic
      // number wearing a test's hat.
      const band = await page.evaluate(() => {
        const strip = document.querySelector('[data-testid="global-settings"]');
        const rect = strip?.parentElement?.getBoundingClientRect();
        if (!rect) throw new Error("the settings strip has no band around it");
        return {
          width: rect.width,
          viewport: document.documentElement.clientWidth,
        };
      });
      expect(band.width, `flagged at ${String(width)} px`).toBeCloseTo(
        band.viewport,
        1,
      );
    }
  });

  // ADR 0094 criterion 4c. 900 px is where the interception was measured — the trigger stood
  // 39.06 × 44.00 px over the price bar and `elementFromPoint` at the total's left edge returned
  // `global-settings-trigger`.
  for (const count of CHIP_COUNTS)
    test(`leaves the price bar's box and its hit test to itself at 900 px, at ${String(count)} chips`, async ({
      page,
    }) => {
      await openFlaggedDesign(page);
      await page.setViewportSize({ width: 900, height: 900 });
      await withChipCount(page, count);

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
        const chips = [
          ...document.querySelectorAll(
            '[data-testid="global-settings-chips"] > *',
          ),
        ];
        for (const [index, chip] of chips.entries()) {
          const found = overlaps(
            `chip ${String(index)}`,
            chip.getBoundingClientRect(),
          );
          if (found) intersections.push(found);
        }
        const triggerOverlap = overlaps(
          "the trigger",
          rectOf("global-settings-trigger"),
        );
        if (triggerOverlap) intersections.push(triggerOverlap);

        // The three probes ADR 0094 names, each half a pixel inside the box so a boundary point is
        // never attributed to whatever paints beside it.
        const total = rectOf("price-bar-total");
        const totalElement = document.querySelector(
          '[data-testid="price-bar-total"]',
        );
        const probe = (x: number): string => {
          const hit = document.elementFromPoint(
            x,
            total.top + total.height / 2,
          );
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
   * ADR 0094 criterion 4e. The residue is not abolished by the new row, only confined to two contents
   * this repository owns — the step nav's copy and the price bar's — and the pre-wave arrangement's
   * own failure was a nav squeezed to zero. So the confinement is measured rather than claimed.
   *
   * **`nav.overflow` is the whole of this case; `nav.clipped` cannot see the failure it is written
   * against.** Measured 2026-09-09 in the failing state: the header's own box was 250.7 px against a
   * 380.703 px line, the title rendered as *"Confi"* and the locale chip was not on screen — and
   * `clipped` was `[]` throughout, because no individual span was *internally* scrolled. The header
   * box cuts them from outside, which a per-span `scrollWidth − clientWidth` probe cannot detect by
   * construction. The span probe is kept for the different defect it does catch — a single label
   * ellipsised inside a box that fits — but it is not a second opinion on this one, and a future
   * reader must not read a green `clipped` as corroboration.
   */
  test("does not clip the step nav at 900 px", async ({ page }) => {
    await openFlaggedDesign(page);
    await page.setViewportSize({ width: 900, height: 900 });
    await withChipCount(page, 5);

    const nav = await readNav(page);

    expect(nav.clipped).toEqual([]);
    expect(nav.overflow).toBeLessThanOrEqual(1);
    expect(nav.left).toBeGreaterThanOrEqual(-SUB_PIXEL_SLACK);
  });

  /**
   * **The height the case above is bought with, at both ends of the window it is spent in.**
   *
   * The nav keeps its line at 900 px because `configure.module.css` caps the price cell at half the
   * top bar, and the cell spends the difference wrapping ADR 0065's sentence to a third line. That
   * lifts grid row 1 above the owner's ruled 76 px — the one measured exception to a height
   * `top-bar-box.test.ts` otherwise proves the header alone sets, and that file adds up
   * *declarations* and so cannot see a wrapped sentence in the neighbouring cell.
   *
   * Asserted rather than left as a comment, because a comment about a 9.28 px trade rots and this is
   * exactly what a later re-narrowing of the warning would move. Both ends are here so the case
   * cannot pass by the row simply never returning to 76: at 900 the sentence is three lines and sets
   * the row, and at 1026 — the first width at which it fits two, measured a pixel at a time — the
   * row is the ruling again.
   */
  test("pays for that line in top-bar height, and only between 900 and 1025 px", async ({
    page,
  }) => {
    await openFlaggedDesign(page);

    await page.setViewportSize({ width: 900, height: 900 });
    const narrow = await readTopBar(page);

    // The exception is real, and it is the wrapped sentence that makes it: three lines of warning
    // plus the bar's own padding and rule is the row, and the header's declared box is not.
    expect(narrow.warningHeight).toBeGreaterThan(TWO_LINE_WARNING_HEIGHT_PX);
    expect(narrow.headerHeight).toBeGreaterThan(RULED_TOP_BAR_HEIGHT_PX);
    // And it is bounded. A fourth line would be 16.1 px past this, so a warning re-narrowed until it
    // wraps again fails here rather than quietly spending more scene.
    expect(narrow.headerHeight).toBeLessThanOrEqual(
      FLAGGED_TOP_BAR_HEIGHT_AT_900_PX + SUB_PIXEL_SLACK,
    );
    // Non-vacuity: the height is what bought the nav's line, so the line has to still be there.
    expect((await readNav(page)).overflow).toBeLessThanOrEqual(1);

    await page.setViewportSize({
      width: TOP_BAR_RETURNS_TO_THE_RULED_HEIGHT_AT_PX,
      height: 900,
    });
    const wide = await readTopBar(page);

    // Given back, at the first width where the sentence fits two lines again.
    expect(wide.warningHeight).toBeLessThanOrEqual(
      TWO_LINE_WARNING_HEIGHT_PX + SUB_PIXEL_SLACK,
    );
    expect(wide.headerHeight).toBeCloseTo(RULED_TOP_BAR_HEIGHT_PX, 1);
  });
});
