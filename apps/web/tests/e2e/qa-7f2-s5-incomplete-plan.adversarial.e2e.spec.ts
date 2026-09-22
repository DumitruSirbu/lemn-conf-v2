// **Adversarial QA for M7 wave 7F2, slice S5, in a real browser: the empty plan keeps its place.**
//
// The DOM test compares inline styles. What the customer sees is layout: the card's box, and
// everything under it, must stand still while the last wall is typed and the drawing arrives, and
// again when a wall is cleared and the drawing goes. This spec measures `getBoundingClientRect` on
// the card, its box and the first length field after every keystroke, ro and ru, 390 x 844.
import { expect, test, type Page } from "@playwright/test";

const LOCALES = ["ro", "ru"] as const;

interface Rect {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

interface Layout {
  readonly card: Rect;
  readonly box: Rect;
  readonly firstField: Rect;
  readonly bars: number;
  readonly documentWidth: number;
}

async function layoutOf(page: Page): Promise<Layout> {
  return page.evaluate(() => {
    const rectOf = (selector: string) => {
      const element = document.querySelector(selector);
      if (element === null) throw new Error(`no ${selector}`);
      const { top, left, width, height } = element.getBoundingClientRect();
      return { top, left, width, height };
    };
    return {
      card: rectOf("[data-testid='room-plan']"),
      box: rectOf("[data-testid='room-plan-box']"),
      firstField: rectOf("[data-testid='room-length-wallA']"),
      bars: document.querySelectorAll("[data-testid='room-plan'] rect").length,
      documentWidth: document.documentElement.scrollWidth,
    };
  });
}

function withoutBars(layout: Layout): Omit<Layout, "bars"> {
  return {
    card: layout.card,
    box: layout.box,
    firstField: layout.firstField,
    documentWidth: layout.documentWidth,
  };
}

async function openAt(
  page: Page,
  locale: string,
  search: string,
): Promise<void> {
  await page.goto(`/${locale}/configurator/room?${search}`);
  await expect(page.getByTestId("room-plan-box")).toBeVisible();
}

for (const locale of LOCALES) {
  test(`an L's plan does not move anything while wall B is typed and cleared, in ${locale}`, async ({
    page,
  }) => {
    await openAt(page, locale, "shape=L&wallA=3.6&height=2.6&direction=left");
    const empty = await layoutOf(page);
    expect(empty.bars).toBe(0);
    expect(empty.documentWidth).toBeLessThanOrEqual(390);

    const wallB = page.getByTestId("room-length-wallB");
    for (const digit of "2400") {
      await wallB.press(digit);
      expect(withoutBars(await layoutOf(page))).toEqual(withoutBars(empty));
    }
    await expect(page.locator("[data-testid='room-plan'] rect")).toHaveCount(2);

    for (let remaining = 4; remaining > 0; remaining -= 1) {
      await wallB.press("Backspace");
      expect(withoutBars(await layoutOf(page))).toEqual(withoutBars(empty));
    }
    await expect(page.locator("[data-testid='room-plan'] rect")).toHaveCount(0);
  });

  test(`a U chip over a filled L empties the plan in place, and wall C fills it in place, in ${locale}`, async ({
    page,
  }) => {
    await openAt(
      page,
      locale,
      "shape=L&wallA=3.6&wallB=2.4&height=2.6&direction=right",
    );
    const drawn = await layoutOf(page);
    expect(drawn.bars).toBe(2);

    await page.getByTestId("room-shape-chip-U").click();
    await expect(page.locator("[data-testid='room-plan'] rect")).toHaveCount(0);
    const emptied = await layoutOf(page);
    // The U chip also brings S4's shape refusal in above the card, which moves the card down by the
    // refusal's height; that move is S4's and expected. The empty box itself keeps the drawn size.
    expect([emptied.box.width, emptied.box.height]).toEqual([
      drawn.box.width,
      drawn.box.height,
    ]);
    expect([emptied.card.width, emptied.card.height]).toEqual([
      drawn.card.width,
      drawn.card.height,
    ]);

    await page.getByTestId("room-length-wallC").pressSequentially("1200");
    await expect(page.locator("[data-testid='room-plan'] rect")).toHaveCount(3);
    expect(withoutBars(await layoutOf(page))).toEqual(withoutBars(emptied));
  });
}
