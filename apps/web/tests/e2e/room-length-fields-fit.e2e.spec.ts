// **1B's column fits at 390 x 844 with the length hint in it** — M7 wave 7A3, defect D1.
//
// The hint added above the wall fields pushed a U room's height box 27 px under the footer, and
// nothing failed: the column is `overflow: hidden` by ADR 0082 decision 2, so a clipped field is not
// a scrollbar, a console error or a wider document — it is a box the customer cannot reach. Only a
// browser lays the column out, so only a browser can see it.
//
// **Measured on the clipping column itself**, which is the first ancestor of the fields whose
// `overflow` is `hidden`: that is the box ADR 0082 decision 2 makes the refusal on, and walking to it
// keeps the stylesheet's hashed class name out of this file.
import { expect, test, type Page } from "@playwright/test";

const SHAPES = ["linear", "L", "U"] as const;

/** Romanian is the longer hint and Russian the shorter, so the pair brackets the line the hint takes. */
const LOCALES = ["ro", "ru"] as const;

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
