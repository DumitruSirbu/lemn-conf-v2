// **Adversarial QA for M7 wave 7F2, slice S3, in a real browser** — what a DOM double cannot show.
//
// - **The room-level reason is reachable** (criterion 14's fit arm): the fits spec measures frame
//   1C's worst case by field reasons, and never loads a room whose reason is the room's own.
// - **1C costs no target its 44 px** (ADR 0104 decision 5's `elementFromPoint` mechanism), measured
//   against the same control at 1B so a shrink is caught even where 1B already sat under 44.
// - **Criterion 4 on real timers:** the reason is on screen while the address bar still lacks the
//   keystroke, so it cannot be the URL's.
// - **The held Continue's tap** (the implementer's named residue), observed end to end.
import { expect, test, type Locator, type Page } from "@playwright/test";

const LOCALES = ["ro", "ru"] as const;

const TOUCH_TARGET_PX = 44;
/** The hit area is sampled on a 1 px grid, so a measured side can read short by one step. */
const SCAN_STEP_PX = 1;
const SCAN_MARGIN_PX = 24;
const SUB_PIXEL_PX = 1;
const URL_SETTLE_MS = 400;

/** 900 x 2160 x 2200 mm: in range on every field, and too small for the kitchen (criterion 3). */
const TOO_SMALL = "shape=L&wallA=0.9&wallB=2.16&height=2.2&direction=left";
const WORST_CASE = {
  L: "shape=L&wallA=0.8&wallB=0.8&height=2&direction=left",
  U: "shape=U&wallA=0.8&wallB=0.8&wallC=0.8&height=2&direction=left",
} as const;
const A_VALID_ROOM = "shape=L&wallA=3.6&wallB=2.4&height=2.6&direction=left";
const AWAITING_ITS_CEILING = "shape=L&wallA=3.6&wallB=2.4&direction=left";

for (const locale of LOCALES) {
  test(`the room-level reason of a room too small for the kitchen can be reached in ${locale}`, async ({
    page,
  }) => {
    await page.goto(`/${locale}/configurator/room?${TOO_SMALL}`);
    const reason = page.getByTestId("room-room-reason");
    await expect(reason).toHaveCount(1);
    await expect(page.getByTestId("room-presets-after-valid")).toBeVisible();

    for (const target of [
      reason,
      page.getByTestId("room-presets-after-valid"),
      page.getByTestId("room-continue"),
    ]) {
      await target.scrollIntoViewIfNeeded();
      const reach = await reachOf(target);
      expect(reach.isTopmostAtItsCentre, JSON.stringify(reach)).toBe(true);
      expect(reach.clippedPx, JSON.stringify(reach)).toBeLessThan(SUB_PIXEL_PX);
    }
    expect(await documentScrollsSideways(page)).toBe(false);
  });

  for (const shape of ["L", "U"] as const) {
    test(`1C's worst case shrinks no touch target below 1B's or below ${String(TOUCH_TARGET_PX)} px, ${shape} in ${locale}`, async ({
      page,
    }) => {
      await page.goto(
        `/${locale}/configurator/room?shape=${shape}&direction=left`,
      );
      await expect(page.getByTestId("room-lengths-hint")).toBeVisible();
      const atOneB = await targetSides(page);

      await page.goto(`/${locale}/configurator/room?${WORST_CASE[shape]}`);
      await expect(page.getByTestId("room-presets-after-valid")).toBeVisible();
      const atOneC = await targetSides(page);

      const detail = JSON.stringify({ atOneB, atOneC });
      expect(Object.keys(atOneC).sort(), detail).toEqual(
        Object.keys(atOneB).sort(),
      );
      for (const [testId, sides] of Object.entries(atOneC)) {
        const before = atOneB[testId];
        if (before === undefined)
          throw new Error(`no 1B measure for ${testId}`);
        expect(sides.width, `${testId} ${detail}`).toBeGreaterThanOrEqual(
          Math.min(TOUCH_TARGET_PX, before.width) - SCAN_STEP_PX,
        );
        expect(sides.height, `${testId} ${detail}`).toBeGreaterThanOrEqual(
          Math.min(TOUCH_TARGET_PX, before.height) - SCAN_STEP_PX,
        );
      }
    });
  }
}

/** `.dimensionsBody`'s `gap`, written out: the empty status region must give it back. */
const COLUMN_GAP_PX = 16;

/** Each shape's 1B and 1C rooms. Every shape's whole 1B column fits, so a status region that cost
 *  anything would push the last field out and the test below claims it does not. QA measured the U's
 *  1B column at 709 px of content in a 709 px column with 82 px to spare (slice S4's shape refusal had
 *  outgrown its 2.6 px of slack; the approved policy builds the U now and that refusal cannot draw). */
const ONE_B_AND_ONE_C = {
  // 7J S5: the straight kitchen is buildable now (ADR 0108 Amendment G), so it reaches 1C for real
  // — a wall A too short for it (0.8 m) is this shape's own worst case, restated from `oneC: null`,
  // which held while every straight room was refused on its shape alone.
  linear: {
    oneB: "shape=linear",
    oneC: "shape=linear&wallA=0.8&height=2.6",
  },
  L: {
    oneB: "shape=L&direction=left",
    oneC: TOO_SMALL,
  },
  U: {
    oneB: "shape=U&direction=left",
    // Census E10: 3.6 / 2.4 / 2.4 is a room the approved policy accepts, so it is 1D and has no
    // status region to measure. A U with a real field reason stands here instead: wall C too short.
    oneC: "shape=U&wallA=3.6&wallB=2.4&wallC=0.8&height=2.6&direction=left",
  },
} as const;

for (const locale of LOCALES) {
  for (const [shape, rooms] of Object.entries(ONE_B_AND_ONE_C)) {
    test(`the empty status region costs the ${shape} column nothing at 1B, and one gap at 1C, in ${locale}`, async ({
      page,
    }) => {
      await page.goto(`/${locale}/configurator/room?${rooms.oneB}`);
      await expect(page.getByTestId("room-lengths-hint")).toBeVisible();
      const atOneB = await statusBelowFields(page);
      expect(atOneB.statusHeightPx, JSON.stringify(atOneB)).toBe(0);
      expect(
        Math.abs(atOneB.statusTopPx - atOneB.fieldsBottomPx),
        JSON.stringify(atOneB),
      ).toBeLessThan(SUB_PIXEL_PX);
      expect(
        atOneB.columnContentBottomPx - atOneB.fieldsBottomPx,
        JSON.stringify(atOneB),
      ).toBeGreaterThanOrEqual(-SUB_PIXEL_PX);

      // 7J S5: every shape now has a reachable 1C (`ONE_B_AND_ONE_C`'s own `oneC`, no longer
      // `null` for linear), so there is no early-return arm left to guard.
      await page.goto(`/${locale}/configurator/room?${rooms.oneC}`);
      await expect(page.getByTestId("room-presets-after-valid")).toBeVisible();
      const atOneC = await statusBelowFields(page);
      expect(
        Math.abs(atOneC.statusTopPx - atOneC.fieldsBottomPx - COLUMN_GAP_PX),
        JSON.stringify(atOneC),
      ).toBeLessThan(SUB_PIXEL_PX);
    });
  }
}

interface StatusPlacement {
  readonly statusTopPx: number;
  readonly statusHeightPx: number;
  readonly fieldsBottomPx: number;
  /** The column's content edge, in document terms (scroll offset undone). */
  readonly columnContentBottomPx: number;
}

async function statusBelowFields(page: Page): Promise<StatusPlacement> {
  return page.getByTestId("room-one-c-status").evaluate((status) => {
    const fields = document.querySelector("[data-testid='room-fields']");
    const column = status.parentElement;
    if (fields === null || column === null) {
      throw new Error("no fields or no column around the status region");
    }
    const box = status.getBoundingClientRect();
    const columnBox = column.getBoundingClientRect();
    const paddingBottom = Number.parseFloat(
      getComputedStyle(column).paddingBottom,
    );
    return {
      statusTopPx: box.top,
      statusHeightPx: box.height,
      fieldsBottomPx: fields.getBoundingClientRect().bottom,
      columnContentBottomPx:
        columnBox.top + column.clientHeight - paddingBottom,
    };
  });
}

test("the reason appears while the address bar still lacks the keystroke (criterion 4, real timers)", async ({
  page,
}) => {
  await page.goto(`/ro/configurator/room?${AWAITING_ITS_CEILING}`);
  await expect(page.getByTestId("room-length-height")).toBeVisible();
  await page.evaluate(() => {
    const record = {
      reasonAt: -1,
      searchWhenReasonAppeared: "",
      firstWriteAt: -1,
    };
    Reflect.set(window, "__qaRecord", record);
    const replaceState = history.replaceState.bind(history);
    history.replaceState = (...args: Parameters<History["replaceState"]>) => {
      if (record.firstWriteAt < 0) record.firstWriteAt = performance.now();
      replaceState(...args);
    };
    new MutationObserver(() => {
      if (record.reasonAt >= 0) return;
      if (
        document.querySelector("[data-testid='room-length-reason-height']") ===
        null
      )
        return;
      record.reasonAt = performance.now();
      record.searchWhenReasonAppeared = location.search;
    }).observe(document.body, { childList: true, subtree: true });
  });

  await page.getByTestId("room-length-height").fill("2");
  await expect(page.getByTestId("room-length-reason-height")).toBeVisible();
  // Typed *"2"* is 2 mm, which the URL carries in metres (C-S1b-1).
  await expect(page).toHaveURL(/height=0\.002(&|$)/);

  const record = await page.evaluate(
    () =>
      Reflect.get(window, "__qaRecord") as {
        reasonAt: number;
        searchWhenReasonAppeared: string;
        firstWriteAt: number;
      },
  );
  const detail = JSON.stringify(record);
  expect(
    new URLSearchParams(record.searchWhenReasonAppeared).has("height"),
    detail,
  ).toBe(false);
  expect(record.reasonAt, detail).toBeGreaterThan(0);
  expect(
    record.firstWriteAt < 0 || record.reasonAt <= record.firstWriteAt,
    detail,
  ).toBe(true);
});

test("a tap on Continue held active mid-burst over a refused room composes nothing and lands on 1C", async ({
  page,
}) => {
  await page.goto(`/ro/configurator/room?${A_VALID_ROOM}`);
  const cta = page.getByTestId("room-continue");
  await expect(cta).toBeEnabled();
  const historyBefore = await page.evaluate(() => history.length);

  const wallA = page.getByTestId("room-length-wallA");
  await wallA.fill("8");
  const tappedWhileEnabled = await cta.isEnabled();
  await cta.tap();

  await page.waitForTimeout(URL_SETTLE_MS * 3);
  const outcome = await page.evaluate(() => ({
    historyLength: history.length,
    search: location.search,
    isComposing:
      document.querySelector("[data-testid='room-compose']") !== null,
    substate: document
      .querySelector("main")
      ?.getAttribute("data-room-substate"),
  }));
  test.info().annotations.push({
    type: "observed",
    description: JSON.stringify({
      tappedWhileEnabled,
      historyBefore,
      ...outcome,
    }),
  });

  expect(tappedWhileEnabled).toBe(true);
  expect(outcome.isComposing).toBe(false);
  expect(outcome.substate).toBe("1C");
  await expect(page.getByTestId("room-length-reason-wallA")).toBeVisible();
  await expect(cta).toBeDisabled();
});

interface Reach {
  readonly isTopmostAtItsCentre: boolean;
  readonly clippedPx: number;
}

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

/** Every tappable control of step 1B/1C, each scrolled to and measured by what `elementFromPoint`
 *  answers with it — the chips, the corner choices, the help buttons, and the footer's two. */
async function targetSides(page: Page): Promise<Sides> {
  const targets = page.locator(
    [
      "[data-testid^='room-shape-chip-control-']",
      "[data-testid^='room-corner-control-']",
      "[data-testid^='room-length-help-wall']",
      "[data-testid='room-back']",
      "[data-testid='room-continue']",
    ].join(", "),
  );
  const sides: Record<string, { width: number; height: number }> = {};
  for (const target of await targets.all()) {
    await target.scrollIntoViewIfNeeded();
    const measured = await target.evaluate(
      (control, { step, margin }) => {
        // A visually hidden radio is answered for by its label, so the label is the target.
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
