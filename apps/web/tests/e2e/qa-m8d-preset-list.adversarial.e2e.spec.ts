// M8D wave W1, adversarial QA of Step 1's preset list and wait in a real browser at 390 x 844 (mobile project), the
// priority surface: L-1 to L-8 and L-10, plus L-3. The preset library and the mint are faked by route interception
// (`support/qa-m8d-presets.ts`): no database row is read or written, and `unexpectedWrites` proves nothing else tried.
// L-9 and the pop-up at desktop width are `w-qa-m8d-preset-screens.adversarial.desktop.e2e.spec.ts`.
//
// X-5 note: the catalogue cannot be substituted in a browser run, so where a criterion asks for the longer of v2's
// sample and the catalogue's string, the spec overwrites the element's text with that string before measuring and
// says so. The text is a layout stress input, never shipped.
import { expect, test, type Page } from "@playwright/test";

import {
  boxOf,
  expectPictureShownWhole,
  fakeLibraryOn,
  IMAGE_SOURCES,
  L_ROOM_PATH,
  NAMES_OF_EVERY_LENGTH,
  offerIdAt,
  offersNamed,
  openTheList,
  UNBROKEN_WORDS,
  type FakeOffer,
  type ImageSource,
} from "./support/qa-m8d-presets";

const PHONE = { width: 390, height: 844 };
const NARROW_PHONE = { width: 320, height: 844 };
const FOUR_BY_THREE = 4 / 3;
const ONE_PIXEL = 1;
const TOUCH_TARGET_PX = 44;
const SKELETON_COUNT = 2;
const FADE_IN_MS = 200;
const SHIMMER_MS = 1600;
const LIST_LIMIT = 8;
const FOOTER_CLEARANCE_PX = 20;
const BACK_BUTTON_WIDTH_PX = 96;
/** v2's sample for `presetChooser.skip` in Russian, longer than the catalogue's (§4's table). */
const LONGER_RUSSIAN_SKIP = "Сгенерировать новую кухню";
const LISTING_DELAY_MS = 1_200;

test.describe("Step 1's preset list at 390 x 844 (M8D W1)", () => {
  test.use({ viewport: PHONE });

  test("L-2: each stored image is shown whole in a 4:3 box (contain), never cropped or stretched", async ({
    page,
  }) => {
    const sources: ImageSource[] = ["stored", "wide", "tall"];
    const offers: FakeOffer[] = sources.map((image, position) => ({
      id: offerIdAt(position + 1),
      typedName: `Imagine ${image}`,
      image,
    }));
    const library = await fakeLibraryOn(page, offers);
    await openTheList(page);

    for (const [position, source] of sources.entries()) {
      const card = page.getByTestId("room-preset-card").nth(position);
      const image = card.locator("img");
      await image.scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          image.evaluate((element: HTMLImageElement) => element.naturalWidth),
        )
        .toBe(IMAGE_SOURCES[source].width);

      const box = await boxOf(image);
      expect(
        await image.evaluate((element) => getComputedStyle(element).objectFit),
      ).toBe("contain");
      expect(
        Math.abs(box.height - box.width / FOUR_BY_THREE),
      ).toBeLessThanOrEqual(ONE_PIXEL);
      await expectPictureShownWhole(page, box, source);
    }
    expect(library.unexpectedWrites).toEqual([]);
  });

  test("L-1: a card is the image, the name and one full-width 44 px button, and nothing else", async ({
    page,
  }) => {
    const library = await fakeLibraryOn(
      page,
      offersNamed(["Prima", undefined, "A treia"]),
    );
    await openTheList(page);

    for (const viewport of [PHONE, NARROW_PHONE]) {
      await page.setViewportSize(viewport);
      for (const card of await page.getByTestId("room-preset-card").all()) {
        const cardBox = await boxOf(card);
        const imageBox = await boxOf(card.locator("img"));
        const nameBox = await boxOf(card.locator("h3"));
        const button = card.getByRole("button");
        const buttonBox = await boxOf(button);

        expect(await card.getByRole("button").count()).toBe(1);
        expect(
          await card
            .locator("a, input, select, textarea, [role='button']")
            .count(),
        ).toBe(0);
        expect(
          Math.abs(imageBox.width - (cardBox.width - 2)),
        ).toBeLessThanOrEqual(ONE_PIXEL);
        expect(Math.abs(buttonBox.width - nameBox.width)).toBeLessThanOrEqual(
          ONE_PIXEL,
        );
        expect(buttonBox.height).toBeGreaterThanOrEqual(TOUCH_TARGET_PX);
        expect(imageBox.y).toBeLessThan(nameBox.y);
        expect(nameBox.y).toBeLessThan(buttonBox.y);
        expect(await card.innerText()).not.toMatch(/MDL|corpuri|Folose/);
      }
    }
    expect(library.unexpectedWrites).toEqual([]);
  });

  test("L-1: a tap on the card outside its button opens nothing", async ({
    page,
  }) => {
    const library = await fakeLibraryOn(page, offersNamed(["Prima", "A doua"]));
    await openTheList(page);
    const card = page.getByTestId("room-preset-card").first();
    const image = await boxOf(card.locator("img"));
    const name = await boxOf(card.locator("h3"));

    await page.touchscreen.tap(
      image.x + image.width / 2,
      image.y + image.height / 2,
    );
    await page.touchscreen.tap(image.x + 20, image.y + 20);
    await page.touchscreen.tap(name.x + 4, name.y + name.height / 2);

    await expect(page.getByTestId("preset-carousel-dialog")).toHaveCount(0);
    expect(library.mintRequests).toEqual([]);
  });

  test("L-3: a failed image shows the hatch and the name inside the 4:3 box, and the card keeps its height and its button", async ({
    page,
  }) => {
    const name = "Kitchen in L, 3560 x 2920 mm";
    const library = await fakeLibraryOn(page, [
      { id: offerIdAt(1), typedName: name, image: "missing" },
      { id: offerIdAt(2), typedName: name, image: "stored" },
    ]);
    await openTheList(page);
    const failed = page.getByTestId("room-preset-card").nth(0);
    const loaded = page.getByTestId("room-preset-card").nth(1);
    await expect(failed.getByTestId("preset-image-failed")).toBeVisible();
    await expect(loaded.locator("img")).toBeVisible();

    const hatch = await boxOf(failed.getByTestId("preset-image-failed"));
    const shownName = await boxOf(
      failed.getByTestId("preset-image-failed").locator("span"),
    );
    expect(
      Math.abs(hatch.height - hatch.width / FOUR_BY_THREE),
    ).toBeLessThanOrEqual(ONE_PIXEL);
    expect(shownName.x).toBeGreaterThanOrEqual(hatch.x);
    expect(shownName.x + shownName.width).toBeLessThanOrEqual(
      hatch.x + hatch.width + ONE_PIXEL,
    );
    expect(shownName.y).toBeGreaterThanOrEqual(hatch.y);
    expect(shownName.y + shownName.height).toBeLessThanOrEqual(
      hatch.y + hatch.height + ONE_PIXEL,
    );
    expect(await failed.getByTestId("preset-image-failed").innerText()).toBe(
      name,
    );
    expect(
      Math.abs((await boxOf(failed)).height - (await boxOf(loaded)).height),
    ).toBeLessThanOrEqual(ONE_PIXEL);

    await failed.getByRole("button").click();
    await expect(page.getByTestId("preset-carousel-name")).toHaveText(name);
    expect(
      await page.getByTestId("preset-carousel-position").textContent(),
    ).toBe("1 / 2");
    expect(library.unexpectedWrites).toEqual([]);
  });

  for (const viewport of [PHONE, NARROW_PHONE]) {
    test(`L-4: a name of 1 to 80 characters, or one unbroken 80-character word, never clips or overflows at ${String(viewport.width)} px`, async ({
      page,
    }) => {
      await fakeLibraryOn(page, [
        { id: offerIdAt(1), typedName: "Un nume", image: "stored" },
        { id: offerIdAt(2), typedName: "Un nume", image: "missing" },
      ]);
      await openTheList(page);
      await page.setViewportSize(viewport);

      const names = [...NAMES_OF_EVERY_LENGTH, ...UNBROKEN_WORDS];
      const violations = await page.evaluate(measureEveryName, names);

      expect(violations).toEqual([]);
    });
  }

  test("L-5: with eight offers only the list scrolls, the header and the footer stay put, and the last card clears the footer", async ({
    page,
  }) => {
    await fakeLibraryOn(
      page,
      offersNamed(
        Array.from(
          { length: LIST_LIMIT },
          (_, position) => `Preset ${String(position + 1)}`,
        ),
      ),
    );
    await openTheList(page);
    const list = page.getByTestId("room-presets");
    const header = page.locator("header").first();
    const footer = page.getByTestId("room-presets-back").locator("..");
    const before = { header: await boxOf(header), footer: await boxOf(footer) };

    await list.evaluate((element) => {
      element.scrollTop = element.scrollHeight / 2;
    });
    const midway = { header: await boxOf(header), footer: await boxOf(footer) };
    await list.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const atEnd = { header: await boxOf(header), footer: await boxOf(footer) };
    const lastCard = await boxOf(page.getByTestId("room-preset-card").last());

    expect(await list.evaluate((element) => element.scrollTop)).toBeGreaterThan(
      0,
    );
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(midway).toEqual(before);
    expect(atEnd).toEqual(before);
    // The criterion says "at least 20 px". Measured at 390 x 844: 19.73 px, because `scrollTop` is clamped to an integer
    // and the last card's height is fractional. The tolerance below is therefore one device pixel, and the 20 px that the
    // stylesheet owes is pinned exactly by the computed padding, so a 19 px padding still fails.
    expect(
      await list.evaluate((element) => getComputedStyle(element).paddingBottom),
    ).toBe(`${String(FOOTER_CLEARANCE_PX)}px`);
    expect(lastCard.y + lastCard.height).toBeLessThanOrEqual(
      atEnd.footer.y - (FOOTER_CLEARANCE_PX - ONE_PIXEL),
    );
  });

  for (const locale of ["ro", "ru"] as const) {
    test(`L-6: at 320 px in ${locale} nothing overflows sideways, the footer button's label is not clipped and Back keeps 96 px`, async ({
      page,
    }) => {
      await fakeLibraryOn(page, offersNamed(["Prima", "A doua"]));
      await openTheList(page, locale);
      await page.setViewportSize(NARROW_PHONE);
      const skip = page.getByTestId("room-presets-skip");

      const catalogueLabel = await skip.innerText();
      expect(await isLabelWhole(skip)).toBe(true);
      expect(await hasSidewaysOverflow(page)).toBe(false);
      expect(
        (await boxOf(page.getByTestId("room-presets-back"))).width,
      ).toBeGreaterThanOrEqual(BACK_BUTTON_WIDTH_PX - ONE_PIXEL);

      if (locale === "ru") {
        // X-5: the longer of v2's sample and the catalogue's string, written over the label for the measurement only.
        await skip.evaluate((element, label) => {
          element.textContent = label;
        }, LONGER_RUSSIAN_SKIP);
        expect(LONGER_RUSSIAN_SKIP.length).toBeGreaterThan(
          catalogueLabel.length,
        );
        expect(await isLabelWhole(skip)).toBe(true);
        expect(await hasSidewaysOverflow(page)).toBe(false);
        expect(
          (await boxOf(page.getByTestId("room-presets-back"))).width,
        ).toBeGreaterThanOrEqual(BACK_BUTTON_WIDTH_PX - ONE_PIXEL);
      }
    });
  }

  test("L-7 and L-8: after the grace the wait fades in over 200 ms with two card-shaped skeletons and only Back in the footer", async ({
    page,
  }) => {
    await recordTheWaitsFadeWhenItIsInserted(page);
    const library = await fakeLibraryOn(page, offersNamed(["Prima"]));
    library.listingDelayMs = LISTING_DELAY_MS;
    await page.goto(`/ro${L_ROOM_PATH}`);
    await page.getByTestId("room-continue").click();
    const notice = page.getByTestId("room-presets-wait-notice");

    await expect(notice).toBeVisible();

    const wait = await page
      .getByTestId("room-presets-wait")
      .evaluate(measureTheWait);
    const recorded = await page.evaluate(
      () => (window as unknown as RecordedWindow).recordedFade,
    );
    expect(recorded).toEqual({
      durationsMs: [FADE_IN_MS],
      startsAtOpacity: ["0"],
    });
    expect(wait.skeletons).toHaveLength(SKELETON_COUNT);
    for (const skeleton of wait.skeletons) {
      expect(
        Math.abs(skeleton.imageHeight - skeleton.imageWidth / FOUR_BY_THREE),
      ).toBeLessThanOrEqual(ONE_PIXEL);
      expect(skeleton.imageWidth).toBeGreaterThan(0);
      expect(skeleton.nameBars).toBe(1);
      expect(skeleton.buttonBarHeight).toBeGreaterThanOrEqual(TOUCH_TARGET_PX);
    }
    expect(wait.footerButtons).toEqual(["room-presets-back"]);
    expect(library.mintRequests).toEqual([]);
    await expect(page.getByTestId("room-presets")).toBeVisible();
  });

  test("L-7: under reduced motion the wait appears with no transition at all", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await recordTheWaitsFadeWhenItIsInserted(page);
    const library = await fakeLibraryOn(page, offersNamed(["Prima"]));
    library.listingDelayMs = LISTING_DELAY_MS;
    await page.goto(`/ro${L_ROOM_PATH}`);
    await page.getByTestId("room-continue").click();

    await expect(page.getByTestId("room-presets-wait-notice")).toBeVisible();

    const wait = await page
      .getByTestId("room-presets-wait")
      .evaluate(measureTheWait);
    const recorded = await page.evaluate(
      () => (window as unknown as RecordedWindow).recordedFade,
    );
    expect(recorded).toEqual({ durationsMs: [], startsAtOpacity: [] });
    expect(wait.skeletonAnimations).toBe(0);
    await expect(page.getByTestId("room-presets")).toBeVisible();
  });

  test("L-10: the shimmer runs while the image is loading and stops when it has loaded", async ({
    page,
  }) => {
    const library = await fakeLibraryOn(page, [
      { id: offerIdAt(1), typedName: "Loading", image: "held" },
    ]);
    await openTheList(page);
    const shimmer = page.getByTestId("preset-image-loading");

    await expect(shimmer).toHaveCount(1);
    expect(await shimmer.evaluate(runningAnimationDurations)).toEqual([
      SHIMMER_MS,
    ]);
    library.releaseHeldImages();
    await expect(shimmer).toHaveCount(0);
    await expect(
      page.getByTestId("room-preset-card").locator("img"),
    ).toBeVisible();
    expect(library.unexpectedWrites).toEqual([]);
  });

  test("L-10: the shimmer stops when the image fails", async ({ page }) => {
    await fakeLibraryOn(page, [
      { id: offerIdAt(1), typedName: "Missing", image: "missing" },
    ]);
    await openTheList(page);

    await expect(page.getByTestId("preset-image-failed")).toBeVisible();

    await expect(page.getByTestId("preset-image-loading")).toHaveCount(0);
  });

  test("L-10: the shimmer is static under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const library = await fakeLibraryOn(page, [
      { id: offerIdAt(1), typedName: "Loading", image: "held" },
    ]);
    await openTheList(page);
    const shimmer = page.getByTestId("preset-image-loading");

    await expect(shimmer).toHaveCount(1);

    expect(await shimmer.evaluate(runningAnimationDurations)).toEqual([]);
    library.releaseHeldImages();
  });
});

// Helpers

async function isLabelWhole(
  button: ReturnType<Page["getByTestId"]>,
): Promise<boolean> {
  return button.evaluate(
    (element) =>
      element.scrollHeight <= element.clientHeight &&
      element.scrollWidth <= element.clientWidth,
  );
}

async function hasSidewaysOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const list = document.querySelector('[data-testid="room-presets"]');
    return (
      document.documentElement.scrollWidth >
        document.documentElement.clientWidth ||
      (list !== null && list.scrollWidth > list.clientWidth)
    );
  });
}

/** Runs in the page: the animations of the element and everything under it, and what the wait drew. */
function measureTheWait(wait: Element): {
  skeletons: {
    imageWidth: number;
    imageHeight: number;
    nameBars: number;
    buttonBarHeight: number;
  }[];
  skeletonAnimations: number;
  footerButtons: (string | null)[];
} {
  const skeletonList = wait.querySelector("ul");
  const skeletons = [...(skeletonList?.children ?? [])].map((card) => {
    const [image, body] = [...card.children] as HTMLElement[];
    const [nameBar, buttonBar] = [...(body?.children ?? [])] as HTMLElement[];
    return {
      imageWidth: image?.getBoundingClientRect().width ?? 0,
      imageHeight: image?.getBoundingClientRect().height ?? 0,
      nameBars: nameBar === undefined ? 0 : 1,
      buttonBarHeight: buttonBar?.getBoundingClientRect().height ?? 0,
    };
  });
  const footer = document.querySelector(
    '[data-testid="room-presets-back"]',
  )?.parentElement;
  return {
    skeletons,
    skeletonAnimations: [...(skeletonList?.children ?? [])].flatMap((card) =>
      card.getAnimations(),
    ).length,
    footerButtons: [...(footer?.querySelectorAll("button") ?? [])].map(
      (button) => button.getAttribute("data-testid"),
    ),
  };
}

interface RecordedWindow {
  recordedFade:
    | { durationsMs: number[]; startsAtOpacity: string[] }
    | undefined;
}

/**
 * The fade lasts 200 ms and a spec cannot be sure to look inside it, so the page records the wait content's animations
 * in the same task that inserts it (a mutation observer's callback runs before the next frame).
 */
async function recordTheWaitsFadeWhenItIsInserted(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      const notice = document.querySelector(
        '[data-testid="room-presets-wait-notice"]',
      );
      const content = notice?.closest(
        '[data-testid="room-presets-wait"]',
      )?.firstElementChild;
      if (content === null || content === undefined) return;
      const fades = content.getAnimations();
      (window as unknown as RecordedWindow).recordedFade = {
        durationsMs: fades.map((fade) =>
          Number(fade.effect?.getTiming().duration),
        ),
        startsAtOpacity: fades.map((fade) =>
          String(
            (fade.effect as KeyframeEffect | null)?.getKeyframes()[0]?.opacity,
          ),
        ),
      };
      observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
  });
}

function runningAnimationDurations(element: Element): number[] {
  return element
    .getAnimations()
    .filter((animation) => animation.playState === "running")
    .map((animation) => Number(animation.effect?.getTiming().duration));
}

/**
 * Runs in the page. Writes each name over the first card's name and over the failed card's drawn name, in turn, and
 * answers every way a layout can fail the name: a page or list that scrolls sideways, a card that leaves the screen, a
 * name that is clipped (its own scroll size beyond its box) or truncated, and a drawn name outside its 4:3 hatch.
 */
function measureEveryName(names: readonly string[]): string[] {
  const violations: string[] = [];
  const viewportWidth = document.documentElement.clientWidth;
  const list = document.querySelector<HTMLElement>(
    '[data-testid="room-presets"]',
  );
  const [loadedCard, failedCard] = [
    ...document.querySelectorAll<HTMLElement>(
      '[data-testid="room-preset-card"]',
    ),
  ];
  const heading = loadedCard?.querySelector<HTMLElement>("h3");
  const hatchName = failedCard?.querySelector<HTMLElement>(
    '[data-testid="preset-image-failed"] span',
  );
  const failedHeading = failedCard?.querySelector<HTMLElement>("h3");
  const hatch = hatchName?.parentElement;
  if (
    list === null ||
    loadedCard === undefined ||
    heading === null ||
    heading === undefined ||
    hatchName === null ||
    hatchName === undefined ||
    hatch === null ||
    hatch === undefined ||
    failedHeading === null ||
    failedHeading === undefined
  ) {
    return ["the two cards are not drawn as expected"];
  }

  for (const name of names) {
    heading.textContent = name;
    failedHeading.textContent = name;
    hatchName.textContent = name;
    const label = `${String(name.length)} characters "${name.slice(0, 12)}"`;
    const headingStyle = getComputedStyle(heading);
    const cardRect = loadedCard.getBoundingClientRect();
    const hatchRect = hatch.getBoundingClientRect();
    const drawnRect = hatchName.getBoundingClientRect();

    if (document.documentElement.scrollWidth > viewportWidth)
      violations.push(`${label}: the page scrolls sideways`);
    if (list.scrollWidth > list.clientWidth)
      violations.push(`${label}: the list scrolls sideways`);
    if (cardRect.right > viewportWidth + 1 || cardRect.left < -1)
      violations.push(`${label}: the card leaves the screen`);
    if (
      heading.scrollWidth > heading.clientWidth ||
      heading.scrollHeight > heading.clientHeight
    )
      violations.push(`${label}: the name is clipped`);
    if (
      headingStyle.textOverflow !== "clip" ||
      headingStyle.overflow !== "visible"
    )
      violations.push(`${label}: the name is set to truncate`);
    if (
      drawnRect.left < hatchRect.left - 1 ||
      drawnRect.right > hatchRect.right + 1 ||
      drawnRect.top < hatchRect.top - 1 ||
      drawnRect.bottom > hatchRect.bottom + 1
    ) {
      violations.push(
        `${label}: the name drawn on the hatch leaves its 4:3 box`,
      );
    }
    if (hatchName.scrollWidth > hatchName.clientWidth)
      violations.push(`${label}: the name on the hatch is clipped`);
  }
  return violations;
}
