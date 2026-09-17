// **1B's column fits at 390 x 844 with the length hint in it** — M7 wave 7A3, defect D1 — **and no
// wall's help takes a tap meant for a field** — defect D2, owner ruling 2026-09-17.
//
// The hint added above the wall fields pushed a U room's height box 27 px under the footer, and
// nothing failed: the column is `overflow: hidden` by ADR 0082 decision 2, so a clipped field is not
// a scrollbar, a console error or a wider document — it is a box the customer cannot reach. Only a
// browser lays the column out, so only a browser can see it.
//
// **Measured on the clipping column itself**, which is the first ancestor of the fields whose
// `overflow` is `hidden`: that is the box ADR 0082 decision 2 makes the refusal on, and walking to it
// keeps the stylesheet's hashed class name out of this file.
//
// **A help target is measured by what it answers, not by the box it paints.** The area is found by
// asking `elementFromPoint` over a grid around the button — the question ADR 0104 decision 5's gate
// asks — so a pseudo-element that widens the target is counted, and a target that stole the top of a
// field (D2, measured 10–13 px of it beside the label) is seen for what it did.
import { expect, test, type Page } from "@playwright/test";

const SHAPES = ["linear", "L", "U"] as const;

/** Romanian is the longer hint and Russian the shorter, so the pair brackets the line the hint takes. */
const LOCALES = ["ro", "ru"] as const;

/** `globals.css`'s `--touch-target`, written out: read from the page it would agree with any value. */
const TOUCH_TARGET_PX = 44;

/** The grid the hit area is sampled on. A measured side can read short of the true one by one step. */
const SCAN_STEP_PX = 0.5;

/** How far past the button's own box the grid reaches, so a widened target is not cut off by it. */
const SCAN_MARGIN_PX = 24;

for (const locale of LOCALES) {
  for (const shape of SHAPES) {
    test(`a ${shape} room's length fields are not clipped by 1B's column in ${locale}`, async ({
      page,
    }) => {
      await page.goto(`/${locale}/configurator/room?shape=${shape}`);
      await expect(page.getByTestId("room-lengths-hint")).toBeVisible();

      const column = await clippingColumnOverflow(page);

      expect(column.overflowPx, JSON.stringify(column)).toBe(0);
      expect(column.lastFieldBottomPx).toBeLessThanOrEqual(
        column.contentBottomPx,
      );
    });

    test(`a ${shape} room's help targets are ${String(TOUCH_TARGET_PX)} px and overlap no input in ${locale}`, async ({
      page,
    }) => {
      await page.goto(`/${locale}/configurator/room?shape=${shape}`);
      await expect(page.getByTestId("room-lengths-hint")).toBeVisible();

      const layout = await helpTargetsAndInputs(page);
      const detail = JSON.stringify(layout);

      expect(layout.targets.length, detail).toBeGreaterThan(0);
      expect(layout.inputs.length, detail).toBeGreaterThan(0);
      for (const target of layout.targets) {
        expect(width(target.hit), detail).toBeGreaterThanOrEqual(
          TOUCH_TARGET_PX - SCAN_STEP_PX,
        );
        expect(height(target.hit), detail).toBeGreaterThanOrEqual(
          TOUCH_TARGET_PX - SCAN_STEP_PX,
        );
        expect(isInside(target.box, layout.viewport), detail).toBe(true);
        expect(
          layout.inputs.filter((input) => overlaps(target.hit, input.box)),
          detail,
        ).toEqual([]);
      }
    });
  }
}

interface ColumnOverflow {
  readonly overflowPx: number;
  readonly lastFieldBottomPx: number;
  readonly contentBottomPx: number;
}

/** The column's hidden overflow, and the height box's bottom against the column's content edge — the
 *  second because `scrollHeight` is rounded to whole pixels and a box cut by less than one would pass
 *  the first alone. */
async function clippingColumnOverflow(page: Page): Promise<ColumnOverflow> {
  return page.getByTestId("room-fields").evaluate((fields) => {
    let column: HTMLElement | null = fields.parentElement;
    while (column !== null && getComputedStyle(column).overflow !== "hidden") {
      column = column.parentElement;
    }
    if (column === null) throw new Error("no clipping column holds the fields");
    const columnBox = column.getBoundingClientRect();
    const paddingBottom = Number.parseFloat(
      getComputedStyle(column).paddingBottom,
    );
    const boxes = [...fields.querySelectorAll("input")].map((input) =>
      (input.parentElement ?? input).getBoundingClientRect(),
    );
    return {
      overflowPx: column.scrollHeight - column.clientHeight,
      lastFieldBottomPx: Math.max(...boxes.map((box) => box.bottom)),
      contentBottomPx: columnBox.bottom - paddingBottom,
    };
  });
}

interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

interface HelpLayout {
  readonly viewport: Rect;
  readonly inputs: readonly { readonly id: string; readonly box: Rect }[];
  /** `hit` is what `elementFromPoint` answers with the button for; `box` is the button's own box. */
  readonly targets: readonly {
    readonly id: string;
    readonly hit: Rect;
    readonly box: Rect;
  }[];
}

/**
 * Every visible input on the page — the shape chips and the corner choices as well as the fields — and
 * each help button's hit area.
 *
 * **`elementFromPoint` cannot see past the viewport**, so "inside the viewport" is asserted on the
 * button's own box rather than on the scanned area, which could never report leaving it. The button is
 * the whole target today; a later pseudo-element pushed past the edge would be clipped there, and the
 * scanned side would fall short of the target size.
 */
async function helpTargetsAndInputs(page: Page): Promise<HelpLayout> {
  return page.evaluate(
    ({ step, margin }) => {
      const rectOf = (element: Element) => {
        const { left, top, right, bottom } = element.getBoundingClientRect();
        return { left, top, right, bottom };
      };
      const inputs = [...document.querySelectorAll("input")]
        .filter((input) => input.getBoundingClientRect().width > 0)
        .map((input) => ({
          id: input.dataset.testid ?? "",
          box: rectOf(input),
        }));
      const buttons = [
        ...document.querySelectorAll<HTMLElement>(
          "[data-testid^='room-length-help-wall']",
        ),
      ];
      const targets = buttons.map((button) => {
        const box = rectOf(button);
        const hit = {
          left: Infinity,
          top: Infinity,
          right: -Infinity,
          bottom: -Infinity,
        };
        for (let y = box.top - margin; y < box.bottom + margin; y += step) {
          for (let x = box.left - margin; x < box.right + margin; x += step) {
            const answered = document.elementFromPoint(x, y);
            if (answered === null || !button.contains(answered)) continue;
            hit.left = Math.min(hit.left, x);
            hit.top = Math.min(hit.top, y);
            hit.right = Math.max(hit.right, x + step);
            hit.bottom = Math.max(hit.bottom, y + step);
          }
        }
        return { id: button.dataset.testid ?? "", hit, box };
      });
      const viewport = {
        left: 0,
        top: 0,
        right: window.innerWidth,
        bottom: window.innerHeight,
      };
      return { viewport, inputs, targets };
    },
    { step: SCAN_STEP_PX, margin: SCAN_MARGIN_PX },
  );
}

function width(rect: Rect): number {
  return rect.right - rect.left;
}

function height(rect: Rect): number {
  return rect.bottom - rect.top;
}

function overlaps(first: Rect, second: Rect): boolean {
  return (
    first.left < second.right &&
    second.left < first.right &&
    first.top < second.bottom &&
    second.top < first.bottom
  );
}

function isInside(inner: Rect, outer: Rect): boolean {
  return (
    inner.left >= outer.left &&
    inner.top >= outer.top &&
    inner.right <= outer.right &&
    inner.bottom <= outer.bottom
  );
}
