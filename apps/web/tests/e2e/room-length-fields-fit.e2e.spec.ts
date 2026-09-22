// **1B's column fits at 390 x 844 with the length hint in it** — M7 wave 7A3, defect D1 — **and no
// wall's help takes a tap meant for a field** — defect D2, owner ruling 2026-09-17.
//
// The hint added above the wall fields pushed a U room's height box 27 px under the footer, and
// nothing failed: the column is `overflow: hidden` by ADR 0082 decision 2, so a clipped field is not
// a scrollbar, a console error or a wider document — it is a box the customer cannot reach. Only a
// browser lays the column out, so only a browser can see it.
//
// **Measured on the column itself**, which is the first ancestor of the fields that clips or scrolls
// vertically: that is the box ADR 0082 decision 2 makes its refusal on, and walking to it keeps the
// stylesheet's hashed class name out of this file.
//
// **Since wave 7F2 (Q-7F2-2 (a)) that column scrolls vertically**, because sub-state 1C adds a reason
// under each refused field and a note, and no 390 x 844 column holds three reasons. So 1B keeps its
// stricter claim — nothing to scroll at all — and **1C's worst case** (800 x 800 x 2000 mm: both walls
// too short and the ceiling too low) claims what the customer needs: every field and *Continuă* can be
// reached by scrolling, and nothing scrolls sideways.
//
// **Since slice S4 a straight or U room carries the shape refusal from 1B on**, under the chips and
// independent of the fields. A U's column had 2.6 px to spare at 1B (7F2 S0) and the refusal is a
// reason box, so a U at 1B joins 1C in the reach claim, and the strict 1B claim is kept for the two
// shapes it still describes. A straight room's 1B keeps its slack and is measured both ways. 1A's
// column still clips (`overflow: hidden`), so the refusal under the cards is measured where it stands.
//
// **Since slice S5b a field left holding text it refuses carries a sentence under it** (Q-7F2-4). A U
// room is where that stacks highest: three walls, each explained, under the shape refusal. Those
// sentences follow a blur, which no URL can carry, so that witness is typed rather than linked to.
//
// **A help target is measured by what it answers, not by the box it paints.** The area is found by
// asking `elementFromPoint` over a grid around the button — the question ADR 0104 decision 5's gate
// asks — so a pseudo-element that widens the target is counted, and a target that stole the top of a
// field (D2, measured 10–13 px of it beside the label) is seen for what it did.
import { expect, test, type Locator, type Page } from "@playwright/test";

const SHAPES = ["linear", "L", "U"] as const;

/** The shapes whose 1B column has nothing to scroll: a U's refusal outgrows its 2.6 px of slack. */
const SHAPES_FITTING_AT_ONE_B = ["linear", "L"] as const;

/** Romanian is the longer hint and Russian the shorter, so the pair brackets the line the hint takes. */
const LOCALES = ["ro", "ru"] as const;

/** `globals.css`'s `--touch-target`, written out: read from the page it would agree with any value. */
const TOUCH_TARGET_PX = 44;

/** The grid the hit area is sampled on. A measured side can read short of the true one by one step. */
const SCAN_STEP_PX = 0.5;

/** How far past the button's own box the grid reaches, so a widened target is not cut off by it. */
const SCAN_MARGIN_PX = 24;

/** Less than one pixel of an element cut by the column is layout rounding, not an unreachable field. */
const SUB_PIXEL_PX = 1;

for (const locale of LOCALES) {
  for (const shape of SHAPES_FITTING_AT_ONE_B) {
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

  for (const shape of SHAPES) {
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

const REFUSAL = "room-shape-refusal";
const NOTE = "room-presets-after-valid";

interface ReachWitness {
  readonly name: string;
  /** In the URL's metres. */
  readonly query: string;
  /** What must be on screen, so the reach claim below is about the state it names. */
  readonly shown: readonly string[];
  /** Whether the column is known to outgrow the viewport, so the reach is a claim about scrolling. */
  readonly mustScroll: boolean;
}

/** 1C's vertical worst case: 800 x 800 mm walls under a 2000 mm ceiling — three reasons in an L (7F2
 *  criterion 14). The U is given the same values and a third wall, and the straight room its one
 *  wall: the approved policy refuses both shapes, so each shows the refusal and the note. And the
 *  two refused shapes at 1B, where the refusal is all of 1C that shows. */
const REACH_WITNESSES: readonly ReachWitness[] = [
  {
    name: "an L room at 1C's worst case",
    query: "shape=L&wallA=0.8&wallB=0.8&height=2&direction=left",
    shown: ["room-length-reason-height", NOTE],
    // Three reasons and the note outgrow the column (7F2 S0: ~164 px).
    mustScroll: true,
  },
  {
    name: "a U room at 1C's worst case",
    query: "shape=U&wallA=0.8&wallB=0.8&wallC=0.8&height=2&direction=left",
    shown: [REFUSAL, NOTE],
    mustScroll: false,
  },
  {
    name: "a straight room at 1C",
    query: "shape=linear&wallA=0.8&height=2",
    shown: [REFUSAL, NOTE],
    mustScroll: false,
  },
  {
    name: "a U room at 1B",
    query: "shape=U&direction=left",
    shown: [REFUSAL],
    mustScroll: false,
  },
  {
    name: "a straight room at 1B",
    query: "shape=linear",
    shown: [REFUSAL],
    mustScroll: false,
  },
];

for (const locale of LOCALES) {
  for (const witness of REACH_WITNESSES) {
    test(`every field, the shape refusal and the Continue button of ${witness.name} can be reached in ${locale}`, async ({
      page,
    }) => {
      await page.goto(`/${locale}/configurator/room?${witness.query}`);
      for (const testId of witness.shown) {
        await expect(page.getByTestId(testId)).toBeVisible();
      }

      await expectEveryTargetReachable(page, witness.mustScroll);
    });
  }
}

/** Text each wall's parser refuses (C-S1b-2): the metre habit, letters, and a zero. */
const UNREADABLE_WALL_TEXTS = [
  ["wallA", "3,6"],
  ["wallB", "abc"],
  ["wallC", "0"],
] as const;

for (const locale of LOCALES) {
  test(`every field, the three unreadable sentences, the shape refusal and the Continue button of a U room can be reached in ${locale}`, async ({
    page,
  }) => {
    await page.goto(`/${locale}/configurator/room?shape=U&direction=left`);
    await expect(page.getByTestId(REFUSAL)).toBeVisible();

    for (const [field, text] of UNREADABLE_WALL_TEXTS) {
      const input = page.getByTestId(`room-length-${field}`);
      await input.fill(text);
      await input.blur();
    }
    for (const [field] of UNREADABLE_WALL_TEXTS) {
      await expect(page.getByTestId(`room-length-reason-${field}`)).toHaveCount(
        1,
      );
      await expect(page.getByTestId(`room-length-${field}`)).toHaveAttribute(
        "aria-invalid",
        "true",
      );
    }

    // Measured by QA: 919 px of content in a 709 px column, in ro and ru.
    await expectEveryTargetReachable(page, true);
  });
}

/**
 * Nothing in the column scrolls sideways, the column is one a finger can scroll, and every chip,
 * refusal, field, reason, note and *Continuă* can be scrolled to and tapped at its centre.
 */
async function expectEveryTargetReachable(
  page: Page,
  mustScroll: boolean,
): Promise<void> {
  const column = await columnScroll(page);
  expect(column.scrollWidthPx, JSON.stringify(column)).toBeLessThanOrEqual(
    column.clientWidthPx,
  );
  expect(column.overflowX, JSON.stringify(column)).toBe("hidden");
  // **A customer's finger scrolls only a scroller.** `scrollIntoViewIfNeeded` below scrolls an
  // `overflow: hidden` box as readily as an `auto` one, so without this line the reach claims
  // would pass over the clipping column Q-7F2-2 replaced.
  expect(USER_SCROLLABLE, JSON.stringify(column)).toContain(column.overflowY);
  if (mustScroll) {
    // What follows is then a claim about scrolling to each target rather than about a column
    // that happens to fit.
    expect(column.scrollHeightPx, JSON.stringify(column)).toBeGreaterThan(
      column.clientHeightPx,
    );
  }
  expect(await documentScrollsSideways(page)).toBe(false);

  const reachable = [
    ...(await page
      .locator(
        [
          "input[data-testid^='room-shape-chip-control-']",
          `[data-testid='${REFUSAL}']`,
          "input[data-testid^='room-length-']",
          "[data-testid^='room-length-reason-']",
          `[data-testid='${NOTE}']`,
        ].join(", "),
      )
      .all()),
    page.getByTestId("room-continue"),
  ];
  for (const target of reachable) {
    await target.scrollIntoViewIfNeeded();
    const reach = await reachOf(target);
    expect(reach.isTopmostAtItsCentre, JSON.stringify(reach)).toBe(true);
    expect(reach.clippedPx, JSON.stringify(reach)).toBeLessThan(SUB_PIXEL_PX);
  }
}

for (const locale of LOCALES) {
  for (const shape of ["linear", "U"] as const) {
    test(`1A's column holds the refusal under the ${shape} card, the cards, the note and the Continue button without clipping in ${locale}`, async ({
      page,
    }) => {
      await page.goto(`/${locale}/configurator/room`);
      await page.getByTestId(`room-shape-card-${shape}`).click();
      await expect(page.getByTestId(REFUSAL)).toBeVisible();
      expect(await documentScrollsSideways(page)).toBe(false);

      // Measured where each stands: 1A's column clips, and a programmatic scroll of it would hide a
      // cut the customer's finger could never undo.
      for (const target of [
        ...(await page.locator("[data-testid^='room-shape-card-']").all()),
        page.getByTestId(REFUSAL),
        page.getByTestId("room-dimensions-later"),
        page.getByTestId("room-continue"),
      ]) {
        const reach = await reachOf(target);
        expect(reach.isTopmostAtItsCentre, JSON.stringify(reach)).toBe(true);
        expect(reach.clippedPx, JSON.stringify(reach)).toBeLessThan(
          SUB_PIXEL_PX,
        );
      }
    });
  }
}

async function documentScrollsSideways(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
}

/** The `overflow-y` values a touch or a wheel can scroll. */
const USER_SCROLLABLE = ["auto", "scroll"];

interface ColumnScroll {
  readonly overflowX: string;
  readonly overflowY: string;
  readonly scrollWidthPx: number;
  readonly clientWidthPx: number;
  readonly scrollHeightPx: number;
  readonly clientHeightPx: number;
}

/** The fields' column: whether it can scroll sideways, and whether it has anything to scroll. */
async function columnScroll(page: Page): Promise<ColumnScroll> {
  return page.getByTestId("room-fields").evaluate((fields) => {
    let column: HTMLElement | null = fields.parentElement;
    while (
      column !== null &&
      getComputedStyle(column).overflowY === "visible"
    ) {
      column = column.parentElement;
    }
    if (column === null)
      throw new Error("no column clips or scrolls the fields");
    return {
      overflowX: getComputedStyle(column).overflowX,
      overflowY: getComputedStyle(column).overflowY,
      scrollWidthPx: column.scrollWidth,
      clientWidthPx: column.clientWidth,
      scrollHeightPx: column.scrollHeight,
      clientHeightPx: column.clientHeight,
    };
  });
}

interface Reach {
  readonly isTopmostAtItsCentre: boolean;
  /** How much of the element's height its scrolling column — or, outside one, the viewport — still
   *  cuts off once scrolled to. */
  readonly clippedPx: number;
}

/**
 * Whether a tap at the element's centre lands on the element — the question ADR 0104 decision 5's
 * gate asks, so a field scrolled under the fixed footer fails — and how much of it the column cuts.
 *
 * The cut is measured rather than asked of `toBeInViewport({ ratio: 1 })`: the column's content sits
 * on fractional pixels (the hint's line is 15.39 px), and `scrollIntoViewIfNeeded` leaves an element
 * already visible to within a fraction of a pixel where it is — measured 0.4 px short of a ratio of 1
 * on the ceiling field and on the note, which is rounding and not a field the customer cannot reach.
 */
async function reachOf(target: Locator): Promise<Reach> {
  return target.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const answered = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2,
    );
    let column: HTMLElement | null = element.parentElement;
    while (
      column !== null &&
      getComputedStyle(column).overflowY === "visible"
    ) {
      column = column.parentElement;
    }
    // *Continuă* sits in the fixed footer, outside the column, so the viewport is what can cut it.
    const visible =
      column === null
        ? { top: 0, bottom: window.innerHeight }
        : column.getBoundingClientRect();
    return {
      isTopmostAtItsCentre: answered !== null && element.contains(answered),
      clippedPx:
        Math.max(0, visible.top - box.top) +
        Math.max(0, box.bottom - visible.bottom),
    };
  });
}

interface ColumnOverflow {
  readonly overflowPx: number;
  readonly lastFieldBottomPx: number;
  readonly contentBottomPx: number;
}

/** The column's vertical overflow, and the height box's bottom against the column's content edge — the
 *  second because `scrollHeight` is rounded to whole pixels and a box cut by less than one would pass
 *  the first alone. */
async function clippingColumnOverflow(page: Page): Promise<ColumnOverflow> {
  return page.getByTestId("room-fields").evaluate((fields) => {
    let column: HTMLElement | null = fields.parentElement;
    while (
      column !== null &&
      getComputedStyle(column).overflowY === "visible"
    ) {
      column = column.parentElement;
    }
    if (column === null)
      throw new Error("no column clips or scrolls the fields");
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
