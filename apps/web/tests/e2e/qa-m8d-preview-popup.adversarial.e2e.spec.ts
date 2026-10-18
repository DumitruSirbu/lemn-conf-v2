// M8D wave W2, adversarial QA of the Preview pop-up in a real browser, phone first (mobile project, 390 x 844 and 320 x
// 844): C-3, C-5, C-6, C-7, C-8, C-9, C-10, C-11, C-12, C-13, C-14 and the contrast of the status tones. The library and the
// mint are faked by route interception (`support/qa-m8d-presets.ts`): no database row is read or written. The pop-up at
// desktop width is `w-qa-m8d-preset-screens.adversarial.desktop.e2e.spec.ts`.
//
// Playwright treats `aria-disabled="true"` as not enabled, so the inert-while-saving checks press with the keyboard,
// with `dispatchEvent`, or with the pointer at a coordinate, never with a locator action that would wait for "enabled".
//
// X-5 note: where a criterion asks for the longer of v2's sample and the catalogue's string, the text of the element is
// overwritten before measuring (the catalogue cannot be substituted in a browser run), and the spec says so.
import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { ro } from "../support/romanian-content.e2e";
import {
  boxOf,
  fakeLibraryOn,
  offerIdAt,
  offersNamed,
  openPreviewOf,
  openTheList,
  type FakeLibrary,
  type FakeOffer,
} from "./support/qa-m8d-presets";

const PHONE = { width: 390, height: 844 };
const NARROW_PHONE = { width: 320, height: 844 };
const ONE_PIXEL = 1;
const TOUCH_TARGET_PX = 44;
const NAV_BUTTON_MIN_HEIGHT_PX = 48;
const SELECT_MIN_HEIGHT_PX = 52;
const SLIDE_FADE_MS = 150;
const MIN_TEXT_CONTRAST = 4.5;
const SWIPE_PX = 120;
const SHORT_SWIPE_PX = 40;
const VERTICAL_PX = 200;
/** An 80-character Russian name made of words, so it wraps at spaces and at its longest. */
const LONG_RUSSIAN_NAME =
  "Кухня в форме буквы Г с островом и барной стойкой для большой семьи, 3560 × 2920 мм".slice(
    0,
    80,
  );
/** v2's sample for `presetChooser.selectFailed` in Russian (60 characters), longer than the catalogue's (§4). */
const LONGER_RUSSIAN_FAILURE =
  "Не удалось создать кухню из этого пресета. Попробуй ещё раз.";

const ruMessages = JSON.parse(
  readFileSync(new URL("../../src/messages/ru.json", import.meta.url), "utf8"),
) as { presetChooser: { selectFailed: string; close: string; select: string } };

test.describe("the Preview pop-up on the phone (M8D W2)", () => {
  for (const locale of ["ro", "ru"] as const) {
    test(`C-3, C-9, C-12 and C-14: the sheet, its action rows, the status area, the round × and the scrim at 390 and 320 px in ${locale}`, async ({
      page,
    }) => {
      const library = await fakeLibraryOn(
        page,
        offersNamed(["Prima", "A doua", "A treia"]),
      );
      await openTheList(page, locale);
      await openPreviewOf(page, 2);

      for (const viewport of [PHONE, NARROW_PHONE]) {
        await page.setViewportSize(viewport);
        await expectPhoneSheet(page, viewport.width);
        await expectActionRows(page);
        await expectStatusAreaReserved(page);
        await expectRoundClose(page, locale);
        await expectScrimAndHandle(page);
      }
      expect(library.unexpectedWrites).toEqual([]);
    });
  }

  test("C-5: at 320 px in Russian with an 80-character name and the error showing, the whole action row is on screen without scrolling the sheet or the page", async ({
    page,
  }) => {
    const library = await fakeLibraryOn(page, [
      { id: offerIdAt(1), typedName: LONG_RUSSIAN_NAME, image: "stored" },
      { id: offerIdAt(2), typedName: LONG_RUSSIAN_NAME, image: "stored" },
    ]);
    library.mintAnswer = "refused";
    await page.setViewportSize(NARROW_PHONE);
    await openTheList(page, "ru");
    await openPreviewOf(page, 1);
    await page.getByTestId("preset-carousel-select").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("preset-carousel-status")).toHaveText(
      ruMessages.presetChooser.selectFailed,
    );

    await expectActionRowOnScreen(page);

    // X-5: v2's own failure sentence is the longer one, written over the catalogue's for this measurement only.
    await page
      .getByTestId("preset-carousel-status")
      .evaluate((element, sentence) => {
        element.textContent = sentence;
      }, LONGER_RUSSIAN_FAILURE);
    expect(LONGER_RUSSIAN_FAILURE.length).toBeGreaterThan(
      ruMessages.presetChooser.selectFailed.length,
    );
    await expectActionRowOnScreen(page);
    expect(library.unexpectedWrites).toEqual([]);
  });

  test("C-6 and X-7: while the copy is being written everything is inert, nothing moves, nothing closes, and focus never leaves the dialog", async ({
    page,
  }) => {
    const library = await fakeLibraryOn(
      page,
      offersNamed(["Prima", "A doua", "A treia"]),
    );
    library.mintAnswer = "held";
    await openTheList(page);
    await openPreviewOf(page, 2);
    const select = page.getByTestId("preset-carousel-select");
    const before = await layoutOfTheSheet(page);

    await select.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("preset-carousel-status")).toHaveText(
      ro.presetChooser.selecting,
    );

    await expect(select).toHaveAttribute("aria-busy", "true");
    await expect(select).toHaveAttribute("aria-disabled", "true");
    await expect(select).toHaveText(ro.presetChooser.select);
    await expect(page.getByTestId("preset-carousel-previous")).toBeDisabled();
    await expect(page.getByTestId("preset-carousel-next")).toBeDisabled();
    await expect(page.getByTestId("preset-carousel-close")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    // The sheet hangs from the bottom edge, so the action row alone cannot show a notice that grows: the whole sheet
    // and the status area must keep their boxes between idle and selecting (C-6: the buttons below do not jump).
    const during = await layoutOfTheSheet(page);
    expect(during.sheet.height).toBeCloseTo(before.sheet.height, 0);
    expect(during.sheet.y).toBeCloseTo(before.sheet.y, 0);
    expect(during.statusArea.height).toBeCloseTo(before.statusArea.height, 0);
    expect(Math.abs(during.row.y - before.row.y)).toBeLessThanOrEqual(
      ONE_PIXEL,
    );
    expect(await activeTestId(page)).toBe("preset-carousel-select");

    await expectInertWhileSaving(page, library);
    await expectTabRingStaysInside(page, [
      "preset-carousel-close",
      "preset-carousel-select",
    ]);
    expect(library.mintRequests).toHaveLength(1);
    expect(library.unexpectedWrites).toEqual([]);
  });

  test("C-7 and X-7: a refused copy says so in the error tone, leaves Select enabled with focus on it, and a slide change clears the sentence", async ({
    page,
  }) => {
    const library = await fakeLibraryOn(
      page,
      offersNamed(["Prima", "A doua", "A treia"]),
    );
    library.mintAnswer = "refused";
    await openTheList(page);
    await openPreviewOf(page, 2);
    const select = page.getByTestId("preset-carousel-select");
    await select.focus();

    await page.keyboard.press("Enter");

    await expect(page.getByTestId("preset-carousel-status")).toHaveText(
      ro.presetChooser.selectFailed,
    );
    expect(await toneOf(page)).toBe("error");
    await expect(select).toHaveAttribute("aria-disabled", "false");
    expect(await activeTestId(page)).toBe("preset-carousel-select");
    expect(await contrastOfTheStatus(page)).toBeGreaterThanOrEqual(
      MIN_TEXT_CONTRAST,
    );

    await page.getByTestId("preset-carousel-next").click();

    await expect(page.getByTestId("preset-carousel-status")).toHaveText("");
    expect(await toneOf(page)).toBeNull();
    expect(library.unexpectedWrites).toEqual([]);
  });

  test("C-8: the day's limit says so in the warn tone, disables Select on every slide, keeps browsing alive and keeps the sentence", async ({
    page,
  }) => {
    const library = await fakeLibraryOn(
      page,
      offersNamed(["Prima", "A doua", "A treia"]),
    );
    library.mintAnswer = "limited";
    await openTheList(page);
    await openPreviewOf(page, 1);
    const select = page.getByTestId("preset-carousel-select");
    await select.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("preset-carousel-status")).toHaveText(
      ro.presetChooser.selectLimitReached,
    );

    expect(await toneOf(page)).toBe("warn");
    expect(await contrastOfTheStatus(page)).toBeGreaterThanOrEqual(
      MIN_TEXT_CONTRAST,
    );
    const moves: (() => Promise<void>)[] = [
      () => page.getByTestId("preset-carousel-next").click(),
      () => page.keyboard.press("ArrowRight"),
      () => page.keyboard.press("ArrowLeft"),
      () => swipe(page, { dx: SWIPE_PX, dy: 0 }),
    ];
    const positions = ["2 / 3", "3 / 3", "2 / 3", "1 / 3"];
    for (const [index, move] of moves.entries()) {
      await move();
      await expect(page.getByTestId("preset-carousel-position")).toHaveText(
        positions[index] ?? "",
      );
      await expect(select).toHaveAttribute("aria-disabled", "true");
      await expect(page.getByTestId("preset-carousel-status")).toHaveText(
        ro.presetChooser.selectLimitReached,
      );
      await select.dispatchEvent("click");
    }
    expect(library.mintRequests).toHaveLength(1);
    expect(await activeTestId(page)).not.toBe("body");
    expect(library.unexpectedWrites).toEqual([]);
  });

  test("C-10: on a touch screen a horizontal swipe moves one slide in its direction, a short, diagonal or vertical drag moves none, and the ends hold", async ({
    page,
  }) => {
    await fakeLibraryOn(page, offersNamed(["Unu", "Doi", "Trei", "Patru"]));
    await openTheList(page);
    await openPreviewOf(page, 2);
    const position = page.getByTestId("preset-carousel-position");
    await expect(position).toHaveText("2 / 4");
    expect(
      await page
        .getByTestId("preset-carousel-slide")
        .evaluate((slide) => getComputedStyle(slide).touchAction),
    ).toBe("pan-y");

    await swipe(page, { dx: -SWIPE_PX, dy: 0 });
    await expect(position).toHaveText("3 / 4");
    await swipe(page, { dx: SWIPE_PX, dy: 0 });
    await expect(position).toHaveText("2 / 4");
    const travelsThatMoveNothing = [
      { dx: -SHORT_SWIPE_PX, dy: 0 },
      { dx: SHORT_SWIPE_PX, dy: 0 },
      { dx: -SWIPE_PX / 2, dy: SWIPE_PX / 2 },
      { dx: -SHORT_SWIPE_PX, dy: VERTICAL_PX },
    ];
    for (const travel of travelsThatMoveNothing) {
      await swipe(page, travel);
      await settleFrames(page);
      await expect(position).toHaveText("2 / 4");
    }

    await swipe(page, { dx: -SWIPE_PX, dy: 0 });
    await swipe(page, { dx: -SWIPE_PX, dy: 0 });
    await expect(position).toHaveText("4 / 4");
    await swipe(page, { dx: -SWIPE_PX, dy: 0 });
    await settleFrames(page);
    await expect(position).toHaveText("4 / 4");
    await expect(page.getByTestId("preset-carousel-name")).toHaveText("Patru");
    for (let step = 0; step < 4; step += 1)
      await swipe(page, { dx: SWIPE_PX, dy: 0 });
    await settleFrames(page);
    await expect(position).toHaveText("1 / 4");
    await expect(page.getByTestId("preset-carousel-name")).toHaveText("Unu");
  });

  test("C-11: Tab never leaves the dialog from the moment it opens, and Escape gives focus back to the card that opened it, not the slide it ended on", async ({
    page,
  }) => {
    await fakeLibraryOn(page, offersNamed(["Unu", "Doi", "Trei", "Patru"]));
    await openTheList(page);
    await openPreviewOf(page, 2);

    await page.keyboard.press("Shift+Tab");
    expect(await activeTestId(page)).toBe("preset-carousel-select");
    await expectTabRingStaysInside(page, [
      "preset-carousel-close",
      "preset-carousel-previous",
      "preset-carousel-next",
      "preset-carousel-select",
    ]);
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("preset-carousel-name")).toHaveText("Patru");
    await page.keyboard.press("Escape");

    await expect(page.getByTestId("preset-carousel-dialog")).toHaveCount(0);
    await expect(page.getByTestId("room-preset-preview").nth(1)).toBeFocused();
  });

  test("C-11: a focused Next that becomes disabled hands focus to Select", async ({
    page,
  }) => {
    await fakeLibraryOn(page, offersNamed(["Unu", "Doi"]));
    await openTheList(page);
    await openPreviewOf(page, 1);
    const next = page.getByTestId("preset-carousel-next");
    await next.focus();

    await page.keyboard.press("Enter");

    await expect(page.getByTestId("preset-carousel-name")).toHaveText("Doi");
    await expect(next).toBeDisabled();
    expect(await activeTestId(page)).toBe("preset-carousel-select");
  });

  test("C-11: a slide change fades the new slide in over 150 ms", async ({
    page,
  }) => {
    await recordSlideFades(page);
    await fakeLibraryOn(page, offersNamed(["Unu", "Doi", "Trei"]));
    await openTheList(page);
    await openPreviewOf(page, 1);

    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("preset-carousel-name")).toHaveText("Doi");

    expect(await recordedFades(page)).toEqual([[SLIDE_FADE_MS]]);
  });

  test("C-11: under reduced motion a slide change has no fade", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await recordSlideFades(page);
    await fakeLibraryOn(page, offersNamed(["Unu", "Doi", "Trei"]));
    await openTheList(page);
    await openPreviewOf(page, 1);

    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("preset-carousel-name")).toHaveText("Doi");

    expect(await recordedFades(page)).toEqual([[]]);
  });

  test("C-13: at most three images are mounted whichever slide is shown, and a failed image shows the hatch with the visible name", async ({
    page,
  }) => {
    const names = Array.from(
      { length: 8 },
      (_, position) => `Preset ${String(position + 1)}`,
    );
    const offers: FakeOffer[] = offersNamed(names).map((offer, position) =>
      position === 3 ? { ...offer, image: "missing" } : offer,
    );
    const library = await fakeLibraryOn(page, offers);
    await openTheList(page);
    await openPreviewOf(page, 1);
    const slide = page.getByTestId("preset-carousel-slide");

    for (let position = 0; position < offers.length; position += 1) {
      await expect(page.getByTestId("preset-carousel-name")).toHaveText(
        names[position] ?? "",
      );
      expect(
        await slide.locator("img, [data-testid='preset-image-failed']").count(),
      ).toBeLessThanOrEqual(3);
      if (position === 3) {
        const hatch = page
          .getByTestId("preset-carousel-slide")
          .getByTestId("preset-image-failed")
          .filter({ visible: true });
        await expect(hatch).toHaveCount(1);
        await expect(hatch).toContainText(names[3] ?? "");
        const hatchBox = await boxOf(hatch);
        const slideBox = await boxOf(slide);
        expect(hatchBox.width).toBeLessThanOrEqual(slideBox.width);
        expect(
          Math.abs(hatchBox.height - hatchBox.width / (4 / 3)),
        ).toBeLessThanOrEqual(ONE_PIXEL);
        expect(
          await slide
            .locator("img")
            .evaluateAll(
              (images) =>
                images.filter((image) => image.closest("[hidden]") === null)
                  .length,
            ),
        ).toBe(0);
      } else {
        await expect(slide.locator("img:visible")).toHaveCount(1);
      }
      await page.keyboard.press("ArrowRight");
    }
    expect(library.unexpectedWrites).toEqual([]);
  });

  test("C-14: a tap on the scrim closes the idle pop-up and gives focus back to the card, and a press on it never takes focus off the dialog", async ({
    page,
  }) => {
    await fakeLibraryOn(page, offersNamed(["Unu", "Doi", "Trei"]));
    await openTheList(page);
    await openPreviewOf(page, 3);

    await page.mouse.move(PHONE.width / 2, 30);
    await page.mouse.down();
    expect(await isFocusInsideTheDialog(page)).toBe(true);
    await page.mouse.up();

    await expect(page.getByTestId("preset-carousel-dialog")).toHaveCount(0);
    await expect(page.getByTestId("room-preset-preview").nth(2)).toBeFocused();

    await page.getByTestId("room-preset-preview").nth(0).click();
    await expect(page.getByTestId("preset-carousel-dialog")).toBeVisible();
    await page.touchscreen.tap(PHONE.width / 2, 30);
    await expect(page.getByTestId("preset-carousel-dialog")).toHaveCount(0);
  });
});

// Helpers

async function layoutOfTheSheet(page: Page) {
  return {
    sheet: await boxOf(page.getByTestId("preset-carousel-dialog")),
    statusArea: await boxOf(
      page.getByTestId("preset-carousel-status").locator("xpath=../.."),
    ),
    row: await boxOf(page.getByTestId("preset-carousel-select").locator("..")),
  };
}

/** Two frames: anything a gesture's handler set in motion has rendered by the time this resolves. */
async function settleFrames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            done();
          }),
        ),
      ),
  );
}

async function activeTestId(page: Page): Promise<string> {
  return page.evaluate(() => {
    const active = document.activeElement;
    return active === document.body
      ? "body"
      : (active?.getAttribute("data-testid") ?? active?.tagName ?? "none");
  });
}

async function isFocusInsideTheDialog(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const dialog = document.querySelector(
      '[data-testid="preset-carousel-dialog"]',
    );
    return dialog?.contains(document.activeElement) === true;
  });
}

async function toneOf(page: Page): Promise<string | null> {
  return page
    .getByTestId("preset-carousel-status")
    .evaluate(
      (sentence) =>
        sentence.closest("[data-tone]")?.getAttribute("data-tone") ?? null,
    );
}

/** Tab and Shift+Tab, many more presses than there are controls: focus is always on one of `ring`, never on `body`. */
async function expectTabRingStaysInside(
  page: Page,
  ring: readonly string[],
): Promise<void> {
  const visited = new Set<string>();
  for (const key of ["Tab", "Shift+Tab"]) {
    for (let press = 0; press < ring.length * 3; press += 1) {
      await page.keyboard.press(key);
      const active = await activeTestId(page);
      expect(
        ring,
        `${key} press ${String(press + 1)} landed on ${active}`,
      ).toContain(active);
      visited.add(active);
    }
  }
  expect([...visited].sort()).toEqual([...ring].sort());
}

/** Everything a customer can try while the copy is out: none of it may change the screen or reach the server. */
async function expectInertWhileSaving(
  page: Page,
  library: FakeLibrary,
): Promise<void> {
  const dialog = page.getByTestId("preset-carousel-dialog");
  const name = await page.getByTestId("preset-carousel-name").textContent();
  const position = await page
    .getByTestId("preset-carousel-position")
    .textContent();

  await page.keyboard.press("Escape");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  await page.touchscreen.tap(PHONE.width / 2, 30);
  await page.mouse.click(PHONE.width / 2, 30);
  expect(
    await isFocusInsideTheDialog(page),
    "a press on the scrim leaves focus in the dialog",
  ).toBe(true);
  await page.getByTestId("preset-carousel-close").dispatchEvent("click");
  await page.getByTestId("preset-carousel-select").dispatchEvent("click");
  await page.getByTestId("preset-carousel-select").dispatchEvent("click");
  await swipe(page, { dx: -SWIPE_PX, dy: 0 });
  await swipe(page, { dx: SWIPE_PX, dy: 0 });
  await settleFrames(page);

  await expect(dialog).toBeVisible();
  expect(await page.getByTestId("preset-carousel-name").textContent()).toBe(
    name,
  );
  expect(await page.getByTestId("preset-carousel-position").textContent()).toBe(
    position,
  );
  expect(library.mintRequests).toHaveLength(1);
}

async function expectPhoneSheet(
  page: Page,
  viewportWidth: number,
): Promise<void> {
  const dialog = await boxOf(page.getByTestId("preset-carousel-dialog"));
  const viewportHeight = page.viewportSize()?.height ?? 0;

  expect(Math.abs(dialog.width - viewportWidth)).toBeLessThanOrEqual(ONE_PIXEL);
  expect(
    Math.abs(dialog.y + dialog.height - viewportHeight),
  ).toBeLessThanOrEqual(ONE_PIXEL);
  expect(await hasSidewaysOverflow(page)).toBe(false);
}

/** C-3, below 900 px: Previous and Next share a row, Select is alone beneath them at full width. */
async function expectActionRows(page: Page): Promise<void> {
  const previous = await boxOf(page.getByTestId("preset-carousel-previous"));
  const next = await boxOf(page.getByTestId("preset-carousel-next"));
  const select = await boxOf(page.getByTestId("preset-carousel-select"));
  const actions = await boxOf(
    page.getByTestId("preset-carousel-select").locator(".."),
  );

  expect(Math.abs(previous.y - next.y)).toBeLessThanOrEqual(ONE_PIXEL);
  expect(previous.height).toBeGreaterThanOrEqual(NAV_BUTTON_MIN_HEIGHT_PX);
  expect(next.height).toBeGreaterThanOrEqual(NAV_BUTTON_MIN_HEIGHT_PX);
  expect(Math.abs(previous.width - next.width)).toBeLessThanOrEqual(ONE_PIXEL);
  expect(select.y).toBeGreaterThanOrEqual(previous.y + previous.height);
  expect(Math.abs(select.width - actions.width)).toBeLessThanOrEqual(ONE_PIXEL);
  expect(select.height).toBeGreaterThanOrEqual(SELECT_MIN_HEIGHT_PX);
}

/** C-9: the status area keeps 44 px even with nothing to say. */
async function expectStatusAreaReserved(page: Page): Promise<void> {
  await expect(page.getByTestId("preset-carousel-status")).toHaveText("");
  const area = await boxOf(
    page.getByTestId("preset-carousel-status").locator("xpath=../.."),
  );

  expect(area.height).toBeGreaterThanOrEqual(TOUCH_TARGET_PX);
}

/** C-12: the × is a 44 x 44 circle named for what it closes. */
async function expectRoundClose(
  page: Page,
  locale: "ro" | "ru",
): Promise<void> {
  const close = page.getByTestId("preset-carousel-close");
  const box = await boxOf(close);

  expect(Math.round(box.width)).toBe(TOUCH_TARGET_PX);
  expect(Math.round(box.height)).toBe(TOUCH_TARGET_PX);
  expect(
    await close.evaluate((element) => getComputedStyle(element).borderRadius),
  ).toBe("50%");
  await expect(close).toHaveAttribute(
    "aria-label",
    locale === "ro" ? ro.presetChooser.close : ruMessages.presetChooser.close,
  );
}

/** C-14 and C-12: the scrim's colour, and a handle that is decoration and does nothing when dragged. */
async function expectScrimAndHandle(page: Page): Promise<void> {
  const scrim = page.getByTestId("preset-carousel-scrim");
  expect(
    await scrim.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    ),
  ).toBe("rgba(28, 24, 20, 0.52)");

  const handle = page
    .getByTestId("preset-carousel-dialog")
    .locator("> span")
    .first();
  await expect(handle).toHaveAttribute("aria-hidden", "true");
  const before = await boxOf(page.getByTestId("preset-carousel-dialog"));
  const box = await boxOf(handle);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 300, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId("preset-carousel-dialog")).toBeVisible();
  expect(await boxOf(page.getByTestId("preset-carousel-dialog"))).toEqual(
    before,
  );
}

/** C-5: the Select row is inside the viewport and neither the sheet nor the page scrolls. */
async function expectActionRowOnScreen(page: Page): Promise<void> {
  const viewport = page.viewportSize() ?? PHONE;
  const select = await boxOf(page.getByTestId("preset-carousel-select"));
  const previous = await boxOf(page.getByTestId("preset-carousel-previous"));

  expect(select.y + select.height).toBeLessThanOrEqual(viewport.height);
  expect(previous.y).toBeGreaterThanOrEqual(0);
  expect(
    await page
      .getByTestId("preset-carousel-dialog")
      .evaluate((dialog) => dialog.scrollHeight <= dialog.clientHeight),
  ).toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await hasSidewaysOverflow(page)).toBe(false);
}

async function hasSidewaysOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const dialog = document.querySelector(
      '[data-testid="preset-carousel-dialog"]',
    );
    return (
      document.documentElement.scrollWidth >
        document.documentElement.clientWidth ||
      (dialog !== null && dialog.scrollWidth > dialog.clientWidth)
    );
  });
}

/** The contrast ratio of the status sentence's ink against its box (WCAG relative luminance). */
async function contrastOfTheStatus(page: Page): Promise<number> {
  const colours = await page
    .getByTestId("preset-carousel-status")
    .evaluate((sentence) => ({
      ink: getComputedStyle(sentence).color,
      surface: getComputedStyle(sentence.closest("[data-tone]") ?? sentence)
        .backgroundColor,
    }));
  return contrastBetween(colours.ink, colours.surface);
}

function contrastBetween(first: string, second: string): number {
  const [lighter, darker] = [luminanceOf(first), luminanceOf(second)].sort(
    (a, b) => b - a,
  );
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

function luminanceOf(rgb: string): number {
  const channels = rgb
    .match(/\d+(\.\d+)?/g)
    ?.slice(0, 3)
    .map(Number) ?? [0, 0, 0];
  const [red = 0, green = 0, blue = 0] = channels.map((channel) => {
    const unit = channel / 255;
    return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/**
 * A real touch drag over the slide, dispatched through the browser's input pipeline (CDP `Input.dispatchTouchEvent`),
 * so `touch-action` and `pointercancel` behave as on a phone. A drag the browser takes as a vertical pan arrives as
 * `pointercancel` and moves nothing.
 */
async function swipe(
  page: Page,
  travel: { readonly dx: number; readonly dy: number },
): Promise<void> {
  const slide = await boxOf(page.getByTestId("preset-carousel-slide"));
  // Centred on the slide, so that the whole travel stays over it.
  const from = {
    x: slide.x + slide.width / 2 - travel.dx / 2,
    y: slide.y + slide.height / 2 - travel.dy / 2,
  };
  const session = await page.context().newCDPSession(page);
  const STEPS = 8;
  try {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [from],
    });
    for (let step = 1; step <= STEPS; step += 1) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            x: from.x + (travel.dx * step) / STEPS,
            y: from.y + (travel.dy * step) / STEPS,
          },
        ],
      });
    }
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  } finally {
    await session.detach();
  }
}

interface FadeWindow {
  slideFades: number[][];
}

/** A slide change lifts `hidden` from the new slide's frame, which restarts its fade; recorded in the same task. */
async function recordSlideFades(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as FadeWindow).slideFades = [];
    new MutationObserver((records) => {
      for (const record of records) {
        const frame = record.target as Element;
        const isShown =
          !frame.hasAttribute("hidden") && record.oldValue !== null;
        if (record.attributeName !== "hidden" || !isShown) continue;
        if (frame.closest('[data-testid="preset-carousel-slide"]') === null)
          continue;
        (window as unknown as FadeWindow).slideFades.push(
          frame
            .getAnimations()
            .map((animation) => Number(animation.effect?.getTiming().duration)),
        );
      }
    }).observe(document, {
      attributes: true,
      attributeFilter: ["hidden"],
      attributeOldValue: true,
      subtree: true,
    });
  });
}

async function recordedFades(page: Page): Promise<number[][]> {
  return page.evaluate(() => (window as unknown as FadeWindow).slideFades);
}
