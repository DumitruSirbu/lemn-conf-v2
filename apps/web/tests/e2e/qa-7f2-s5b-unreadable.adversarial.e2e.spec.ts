// **Adversarial QA for M7 wave 7F2, slice S5b, in a real browser: the ways a field is left.**
//
// happy-dom dispatches the blur the test asks for. A browser decides for itself when focus leaves an
// input — on Tab, on a pointerdown elsewhere, when the window loses focus — so each way a customer
// leaves a field is driven here and the sentence looked for. A blur that inserts a sentence *between
// pointerdown and click* moves everything below it, so a tap on a control under the left field is
// checked to still land.
//
// The window losing focus is not driven: headless Chromium keeps a backgrounded page's focus, so the
// blur a phone sends when the app is switched away cannot be produced here.
//
// It also measures the fits spec's U witness (three explained walls typed unreadable), which the fits spec
// asserts with `mustScroll: true`, and every control's 44 px there.
import { expect, test, type Locator, type Page } from "@playwright/test";

const LOCALES = ["ro", "ru"] as const;
const TOUCH_TARGET_PX = 44;
const SCAN_STEP_PX = 1;
const SCAN_MARGIN_PX = 24;

const A_VALID_U =
  "shape=U&wallA=3.6&wallB=2.4&wallC=2.4&height=2.6&direction=left";

function reasonOf(page: Page, field: string): Locator {
  return page.getByTestId(`room-length-reason-${field}`);
}

async function dirtyWallB(page: Page, locale: string): Promise<void> {
  await page.goto(`/${locale}/configurator/room?${A_VALID_U}`);
  const wallB = page.getByTestId("room-length-wallB");
  await wallB.click();
  await wallB.fill("abc");
  await expect(wallB).toBeFocused();
  await expect(reasonOf(page, "wallB")).toHaveCount(0);
}

const LEAVING: readonly (readonly [string, (page: Page) => Promise<void>])[] = [
  ["Tab", (page) => page.keyboard.press("Tab")],
  ["a tap on wall A", (page) => page.getByTestId("room-length-wallA").click()],
  [
    "a tap on the chosen chip",
    (page) => page.getByTestId("room-shape-chip-U").click(),
  ],
  [
    "a tap on the L chip",
    (page) => page.getByTestId("room-shape-chip-L").click(),
  ],
  // "A tap on the corner" is not in this list for a U, and was until M7B U5 S1: a U has one hand, so
  // it draws no corner toggle to tap (Q-U4 (b), ADR 0132 decision 8). The test below holds that.
  [
    "a tap on the inactive Continue",
    (page) => page.getByTestId("room-continue").click({ force: true }),
  ],
  ["a tap on the plan", (page) => page.getByTestId("room-plan-box").click()],
];

for (const locale of LOCALES) {
  for (const [way, leave] of LEAVING) {
    test(`explains wall B's unreadable text once it is left by ${way}, in ${locale}`, async ({
      page,
    }) => {
      await dirtyWallB(page, locale);

      await leave(page);

      await expect(reasonOf(page, "wallB")).toHaveCount(1);
      await expect(page.getByTestId("room-length-wallB")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      await expect(page.getByTestId("room-length-wallB")).toHaveValue("abc");
    });
  }

  test(`draws no corner toggle for a U to leave a field by, in ${locale}`, async ({
    page,
  }) => {
    await dirtyWallB(page, locale);

    await expect(page.getByTestId("room-corner")).toHaveCount(0);
    await expect(page.getByTestId("room-corner-right")).toHaveCount(0);
  });

  // Control for the press-order cases further down, where wall A holds unreadable text and its sentence
  // would move wall B's help between the press and the release: with wall A readable nothing is
  // inserted, and a tap opens the help.
  test(`a tap on wall B's help opens it when wall A is readable, in ${locale}`, async ({
    page,
  }) => {
    await page.goto(`/${locale}/configurator/room?${A_VALID_U}`);
    const wallA = page.getByTestId("room-length-wallA");
    await wallA.click();
    await wallA.fill("3600");
    const help = page.getByTestId("room-length-help-wallB");

    await help.click();

    await expect(help).toHaveAttribute("aria-expanded", "true");
  });

  test(`a tap on wall C's field, made while wall B holds unreadable text, focuses wall C, in ${locale}`, async ({
    page,
  }) => {
    await dirtyWallB(page, locale);
    const wallC = page.getByTestId("room-length-wallC");

    await wallC.click();

    await expect(reasonOf(page, "wallB")).toHaveCount(1);
    await expect(wallC).toBeFocused();
  });

  test(`measures the U with three explained walls: scroll, reach and 44 px, in ${locale}`, async ({
    page,
  }) => {
    await page.goto(`/${locale}/configurator/room?shape=U&direction=left`);
    for (const [field, text] of [
      ["wallA", "3,6"],
      ["wallB", "abc"],
      ["wallC", "0"],
    ] as const) {
      const input = page.getByTestId(`room-length-${field}`);
      await input.fill(text);
      await input.blur();
      await expect(reasonOf(page, field)).toHaveCount(1);
    }

    const column = await page.getByTestId("room-fields").evaluate((fields) => {
      let scroller: HTMLElement | null = fields.parentElement;
      while (
        scroller !== null &&
        getComputedStyle(scroller).overflowY === "visible"
      ) {
        scroller = scroller.parentElement;
      }
      if (scroller === null) throw new Error("no column scrolls the fields");
      return {
        scrollHeight: scroller.scrollHeight,
        clientHeight: scroller.clientHeight,
        scrollWidth: scroller.scrollWidth,
        clientWidth: scroller.clientWidth,
      };
    });
    expect(column.scrollWidth).toBeLessThanOrEqual(column.clientWidth);
    // Three explained walls outgrow the column, so the fits spec's reach claims for this witness are
    // claims about scrolling, and this pins that they stay so. (The 919 px measured on 2026-09-22 was
    // taken under the shape refusal, which the U no longer draws, so no figure is quoted.)
    expect(column.scrollHeight).toBeGreaterThan(column.clientHeight);

    const sides = await targetSides(page, [
      "[data-testid^='room-shape-chip-control-']",
      "[data-testid^='room-corner-control-']",
      "[data-testid^='room-length-help-wall']",
      "input[data-testid^='room-length-']",
      "[data-testid='room-back']",
      "[data-testid='room-continue']",
    ]);
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
  });
}

/** Records, in page order, the press events on `window` and the moment wall A's sentence enters the
 *  DOM, so a test can say whether the sentence arrived before or after the click it must not move. */
async function recordPressOrder(page: Page): Promise<void> {
  await page.evaluate(() => {
    const log: string[] = [];
    Object.assign(window, { pressLog: log });
    for (const type of ["pointerup", "mousedown", "mouseup", "click"]) {
      window.addEventListener(type, () => log.push(type), { capture: true });
    }
    new MutationObserver(() => {
      if (
        !log.includes("sentence") &&
        document.querySelector("[data-testid='room-length-reason-wallA']")
      ) {
        log.push("sentence");
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
}

async function pressOrder(page: Page): Promise<readonly string[]> {
  return page.evaluate(
    () => (window as unknown as { pressLog: string[] }).pressLog,
  );
}

async function dirtyWallAAndFindHelpB(
  page: Page,
  locale: string,
): Promise<{ x: number; y: number }> {
  await page.goto(`/${locale}/configurator/room?${A_VALID_U}`);
  const wallA = page.getByTestId("room-length-wallA");
  await wallA.click();
  await wallA.fill("3,6");
  const box = await page.getByTestId("room-length-help-wallB").boundingBox();
  if (box === null) throw new Error("wall B's help is not drawn");
  await recordPressOrder(page);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

for (const locale of LOCALES) {
  // The fix infers that a press's click is dispatched in the same task as its release, so a zero
  // timeout armed on the release runs after the click. Measured here with real input: the sentence
  // enters the DOM after the click, never between the release and the click.
  for (const [how, press] of [
    [
      "a touch tap",
      async (page: Page, { x, y }: { x: number; y: number }) => {
        await page.touchscreen.tap(x, y);
      },
    ],
    [
      "a mouse click",
      async (page: Page, { x, y }: { x: number; y: number }) => {
        await page.mouse.click(x, y);
      },
    ],
    [
      "a 1.2 s long touch",
      async (page: Page, { x, y }: { x: number; y: number }) => {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x, y }],
        });
        await page.waitForTimeout(1200);
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
      },
    ],
  ] as const) {
    test(`inserts wall A's sentence only after the click of ${how} on wall B's help, in ${locale}`, async ({
      page,
    }) => {
      const at = await dirtyWallAAndFindHelpB(page, locale);

      await press(page, at);

      await expect(reasonOf(page, "wallA")).toHaveCount(1);
      await expect(page.getByTestId("room-length-help-wallB")).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      const order = await pressOrder(page);
      expect(order.indexOf("sentence"), order.join(" | ")).toBeGreaterThan(
        order.lastIndexOf("click"),
      );
    });
  }

  test(`explains a field left by a right click, which has no click, once it is released, in ${locale}`, async ({
    page,
  }) => {
    const at = await dirtyWallAAndFindHelpB(page, locale);

    await page.mouse.click(at.x, at.y, { button: "right" });

    await expect(reasonOf(page, "wallA")).toHaveCount(1);
  });

  test(`explains a Tab-away at once after a press held and released elsewhere, in ${locale}`, async ({
    page,
  }) => {
    await page.goto(`/${locale}/configurator/room?${A_VALID_U}`);
    const plan = await page.getByTestId("room-plan-box").boundingBox();
    if (plan === null) throw new Error("the plan is not drawn");
    await page.mouse.move(plan.x + 10, plan.y + 10);
    await page.mouse.down();
    await page.mouse.move(5, 5);
    await page.mouse.up();
    const wallA = page.getByTestId("room-length-wallA");
    await wallA.focus();
    await wallA.fill("abc");

    await page.keyboard.press("Tab");

    await expect(reasonOf(page, "wallA")).toHaveCount(1, { timeout: 500 });
  });
}

type Sides = Readonly<
  Record<string, { readonly width: number; readonly height: number }>
>;

/** `qa-7f2-s4-shape-refusal.adversarial.e2e.spec.ts`'s scan: each control scrolled to and measured by
 *  what `elementFromPoint` answers with it (ADR 0104 decision 5). */
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
