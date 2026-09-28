// **Adversarial QA for M7 wave 7F2, slice S4, in a real browser** — what the fits spec leaves open.
//
// - **1C's colours after `--refusal-*` moved to `.screen`**, computed on a refused field, its reason and
//   the badge, and on the shape refusal at 1A (which the move exists to reach).
// - **The empty refusal region costs nothing**, measured to the pixel: an L's 63 px and a straight
//   room's 227 px of slack at 1B would hide a forgotten `:empty` rule entirely.
// - **1A under a refused card**: its own note is not clipped by the column that cannot scroll.
// - **Targets**: every control of a refused U or straight room keeps 44 px, at 1A, 1B and 1C.
import { expect, test, type Page } from "@playwright/test";

const LOCALES = ["ro", "ru"] as const;
const TOUCH_TARGET_PX = 44;
const SCAN_STEP_PX = 1;
const SCAN_MARGIN_PX = 24;
const SUB_PIXEL_PX = 1;

/** `.body`'s and `.dimensionsBody`'s gaps, written out. */
const SHAPE_STEP_GAP_PX = 18;
const DIMENSIONS_GAP_PX = 16;

/** Frame 1C's colours (`Mobil.dc.html:210-211`, `:224-229`), as the browser computes them. */
const FRAME_RED = "rgb(220, 38, 38)";
const FRAME_SURFACE = "rgb(253, 243, 243)";
const FRAME_INK = "rgb(143, 32, 32)";
const BADGE_INK = "rgb(255, 255, 255)";

const THE_FRAMES_ROOM =
  "shape=L&wallA=3.6&wallB=0.45&height=2.6&direction=left";

test("a refused field, its reason and its badge keep frame 1C's colours after the move to .screen", async ({
  page,
}) => {
  await page.goto(`/ro/configurator/room?${THE_FRAMES_ROOM}`);
  await expect(page.getByTestId("room-length-reason-wallB")).toBeVisible();

  const colours = await page.evaluate(() => {
    const input = document.querySelector("[data-testid='room-length-wallB']");
    const reason = document.querySelector(
      "[data-testid='room-length-reason-wallB']",
    );
    const box = input?.parentElement;
    const label = document.querySelector(`label[for='${input?.id ?? ""}']`);
    if (!input || !reason || !box || !label)
      throw new Error("1C's field is not drawn");
    const badge = getComputedStyle(reason, "::before");
    return {
      reasonBackground: getComputedStyle(reason).backgroundColor,
      reasonInk: getComputedStyle(reason).color,
      boxBackground: getComputedStyle(box).backgroundColor,
      boxBorder: getComputedStyle(box).borderTopColor,
      boxBorderWidth: getComputedStyle(box).borderTopWidth,
      labelInk: getComputedStyle(label).color,
      badgeBackground: badge.backgroundColor,
      badgeInk: badge.color,
    };
  });

  expect(colours).toEqual({
    reasonBackground: FRAME_SURFACE,
    reasonInk: FRAME_INK,
    boxBackground: FRAME_SURFACE,
    boxBorder: FRAME_RED,
    boxBorderWidth: "2px",
    labelInk: FRAME_RED,
    badgeBackground: FRAME_RED,
    badgeInk: BADGE_INK,
  });
});

test("the shape refusal under a card at 1A is drawn in the same colours", async ({
  page,
}) => {
  await page.goto("/ro/configurator/room");
  await page.getByTestId("room-shape-card-U").click();
  const refusal = page.getByTestId("room-shape-refusal");
  await expect(refusal).toBeVisible();

  const colours = await refusal.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    ink: getComputedStyle(element).color,
    badge: getComputedStyle(element, "::before").backgroundColor,
  }));

  expect(colours).toEqual({
    background: FRAME_SURFACE,
    ink: FRAME_INK,
    badge: FRAME_RED,
  });
});

for (const locale of LOCALES) {
  test(`the empty refusal region costs 1A's column nothing, before a card and under L, in ${locale}`, async ({
    page,
  }) => {
    await page.goto(`/${locale}/configurator/room`);
    await expect(page.getByTestId("room-shapes")).toBeVisible();
    const beforeACard = await regionAfter(page, "room-shapes");

    await page.getByTestId("room-shape-card-L").click();
    const underL = await regionAfter(page, "room-shapes");

    for (const placement of [beforeACard, underL]) {
      const detail = JSON.stringify(placement);
      expect(placement.regionHeightPx, detail).toBe(0);
      expect(
        Math.abs(placement.regionTopPx - placement.previousBottomPx),
        detail,
      ).toBeLessThan(SUB_PIXEL_PX);
      expect(
        Math.abs(
          placement.nextTopPx - placement.previousBottomPx - SHAPE_STEP_GAP_PX,
        ),
        detail,
      ).toBeLessThan(SUB_PIXEL_PX);
    }
  });

  // 7J S5: `shape=linear` alone no longer carries a shape refusal (ADR 0108 Amendment G) — `U` is
  // this measurement's fixture instead, restated from a straight room's own refusal.
  test(`the empty refusal region costs an L's 1B column nothing, and a U's refusal one gap, in ${locale}`, async ({
    page,
  }) => {
    await page.goto(`/${locale}/configurator/room?shape=L&direction=left`);
    await expect(page.getByTestId("room-lengths-hint")).toBeVisible();
    const underL = await regionAfter(page, "room-shape-chips");
    const detailL = JSON.stringify(underL);
    expect(underL.regionHeightPx, detailL).toBe(0);
    expect(
      Math.abs(underL.nextTopPx - underL.previousBottomPx - DIMENSIONS_GAP_PX),
      detailL,
    ).toBeLessThan(SUB_PIXEL_PX);

    await page.goto(`/${locale}/configurator/room?shape=U`);
    await expect(page.getByTestId("room-shape-refusal")).toBeVisible();
    const underU = await regionAfter(page, "room-shape-chips");
    const detailU = JSON.stringify(underU);
    expect(
      Math.abs(
        underU.regionTopPx - underU.previousBottomPx - DIMENSIONS_GAP_PX,
      ),
      detailU,
    ).toBeLessThan(SUB_PIXEL_PX);
    expect(
      Math.abs(
        underU.nextTopPx -
          (underU.regionTopPx + underU.regionHeightPx) -
          DIMENSIONS_GAP_PX,
      ),
      detailU,
    ).toBeLessThan(SUB_PIXEL_PX);
  });

  // 7J S5: only U is refused on its shape alone at 1A now (ADR 0108 Amendment G).
  for (const shape of ["U"] as const) {
    test(`1A under a refused ${shape} card clips neither its note nor any target, and every target is ${String(TOUCH_TARGET_PX)} px, in ${locale}`, async ({
      page,
    }) => {
      await page.goto(`/${locale}/configurator/room`);
      await page.getByTestId(`room-shape-card-${shape}`).click();
      await expect(page.getByTestId("room-shape-refusal")).toBeVisible();

      const note = page.locator(
        "[data-testid='room-shape-refusal-status'] ~ p",
      );
      await expect(note).toHaveCount(1);
      const clip = await note.evaluate((element) => {
        const column = element.parentElement;
        if (column === null) throw new Error("the note has no column");
        const box = element.getBoundingClientRect();
        const columnBox = column.getBoundingClientRect();
        const paddingBottom = Number.parseFloat(
          getComputedStyle(column).paddingBottom,
        );
        return {
          overflowY: getComputedStyle(column).overflowY,
          noteBottomPx: box.bottom,
          contentBottomPx: columnBox.bottom - paddingBottom,
        };
      });
      expect(clip.noteBottomPx, JSON.stringify(clip)).toBeLessThanOrEqual(
        clip.contentBottomPx + SUB_PIXEL_PX,
      );

      const sides = await targetSides(page, [
        "[data-testid^='room-shape-card-']",
        "[data-testid='room-continue']",
      ]);
      expectEveryTargetFull(sides);
      expect(await documentScrollsSideways(page)).toBe(false);
    });
  }

  // 7J S5: an empty or filled straight room is no longer refused on its shape (ADR 0108 Amendment
  // G) — `room-length-fields-fit.e2e.spec.ts` covers its own targets at 1B/1D/1C now.
  for (const [name, query] of [
    ["an empty U", "shape=U&direction=left"],
    [
      "a filled U",
      "shape=U&wallA=3.6&wallB=2.4&wallC=2.4&height=2.6&direction=left",
    ],
  ] as const) {
    test(`every control of ${name} under its refusal is ${String(TOUCH_TARGET_PX)} px and nothing scrolls sideways, in ${locale}`, async ({
      page,
    }) => {
      await page.goto(`/${locale}/configurator/room?${query}`);
      await expect(page.getByTestId("room-shape-refusal")).toBeVisible();

      const sides = await targetSides(page, [
        "[data-testid^='room-shape-chip-control-']",
        "[data-testid^='room-corner-control-']",
        "[data-testid^='room-length-help-wall']",
        "[data-testid='room-back']",
        "[data-testid='room-continue']",
      ]);
      expectEveryTargetFull(sides);
      expect(await documentScrollsSideways(page)).toBe(false);
      const column = await page
        .getByTestId("room-fields")
        .evaluate((fields) => {
          let scroller: HTMLElement | null = fields.parentElement;
          while (
            scroller !== null &&
            getComputedStyle(scroller).overflowY === "visible"
          ) {
            scroller = scroller.parentElement;
          }
          if (scroller === null)
            throw new Error("no column scrolls the fields");
          return {
            scrollWidth: scroller.scrollWidth,
            clientWidth: scroller.clientWidth,
          };
        });
      expect(column.scrollWidth, JSON.stringify(column)).toBeLessThanOrEqual(
        column.clientWidth,
      );
    });
  }
}

interface RegionPlacement {
  readonly previousBottomPx: number;
  readonly regionTopPx: number;
  readonly regionHeightPx: number;
  readonly nextTopPx: number;
}

/** The refusal region's box against the element drawn before it and the one drawn after it. */
async function regionAfter(
  page: Page,
  previousTestId: string,
): Promise<RegionPlacement> {
  return page
    .getByTestId("room-shape-refusal-status")
    .evaluate((region, previousId) => {
      const previous = document.querySelector(`[data-testid='${previousId}']`);
      const next = region.nextElementSibling;
      if (previous === null || next === null)
        throw new Error("the region has no neighbours");
      const box = region.getBoundingClientRect();
      return {
        previousBottomPx: previous.getBoundingClientRect().bottom,
        regionTopPx: box.top,
        regionHeightPx: box.height,
        nextTopPx: next.getBoundingClientRect().top,
      };
    }, previousTestId);
}

async function documentScrollsSideways(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
}

type Sides = Readonly<
  Record<string, { readonly width: number; readonly height: number }>
>;

function expectEveryTargetFull(sides: Sides): void {
  expect(Object.keys(sides).length).toBeGreaterThan(0);
  for (const [testId, side] of Object.entries(sides)) {
    const detail = `${testId} ${JSON.stringify(side)}`;
    expect(side.width, detail).toBeGreaterThanOrEqual(
      TOUCH_TARGET_PX - SCAN_STEP_PX,
    );
    expect(side.height, detail).toBeGreaterThanOrEqual(
      TOUCH_TARGET_PX - SCAN_STEP_PX,
    );
  }
}

/** Each control scrolled to and measured by what `elementFromPoint` answers with it (ADR 0104
 *  decision 5); a visually hidden radio is answered for by its label. */
async function targetSides(
  page: Page,
  selectors: readonly string[],
): Promise<Sides> {
  const sides: Record<string, { width: number; height: number }> = {};
  for (const target of await page.locator(selectors.join(", ")).all()) {
    await target.scrollIntoViewIfNeeded();
    const measured = await target.evaluate(
      (control, { step, margin }) => {
        const owner = control.closest("label") ?? control;
        const box = owner.getBoundingClientRect();
        let left = Infinity;
        let top = Infinity;
        let right = -Infinity;
        let bottom = -Infinity;
        for (let y = box.top - margin; y < box.bottom + margin; y += step) {
          for (let x = box.left - margin; x < box.right + margin; x += step) {
            const answered = document.elementFromPoint(x, y);
            if (answered === null || !owner.contains(answered)) continue;
            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x + step);
            bottom = Math.max(bottom, y + step);
          }
        }
        return {
          id: control.getAttribute("data-testid") ?? "",
          width: Math.max(0, right - left),
          height: Math.max(0, bottom - top),
        };
      },
      { step: SCAN_STEP_PX, margin: SCAN_MARGIN_PX },
    );
    sides[measured.id] = { width: measured.width, height: measured.height };
  }
  return sides;
}
