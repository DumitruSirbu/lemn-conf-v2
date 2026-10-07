// The review as a page on a phone, 390 x 844 by touch, in both languages: what it draws, in what order, what stays
// pinned at its foot, and what it must not draw when there is nothing to offer.
//
// **Must not run concurrently with any other persistence live run**: each test mints rows and deletes them (ADR 0006).
import {
  KITCHEN_L_DESIGN,
  NARROWED_ROOM_OVERFLOWING_DESIGN,
  type Design,
} from "@lemnaria/configurator-domain";
import { expect, type Page } from "@playwright/test";

import { priceAndProject } from "../support/generated-kitchens";
import {
  customerSuppliedIds,
  emptied,
  keepingOnly,
} from "../support/review-edits";
import { deleteMintedDesigns } from "./support/minted-designs";
import { readSelection } from "./support/panel";
import {
  captureEvidence,
  expectEditorReady,
  expectReviewDrawn,
  expectSceneMounted,
  openReview,
  readBottomRegion,
  REVIEW_CTA,
  REVIEW_ROW,
  REVIEW_SCENE,
  reviewPath,
  sectionsInDocumentOrder,
  touchTheMiddleOf,
} from "./support/qa-8d-review";
import { test, type Locale } from "./support/seeded-design";
import {
  L_OWN,
  STRAIGHT,
  U_MIDDLE,
  seedKitchen,
  type KitchenSpec,
} from "./support/ssr-html";
import { seedDesign } from "./support/u-design";

const PHONE = { width: 390, height: 844 };
const TOUCH_TARGET_PX = 44;
/** Long enough for a navigation a tap had started to have shown in the address. */
const TAP_SETTLE_MS = 400;
const LOCALES: readonly Locale[] = ["ro", "ru"];
const FIGURE = '[data-section="figure"]';

const RIGHT_HAND_L: KitchenSpec = {
  name: "right-hand L 3700/3400",
  input: {
    shape: "L",
    wallAMm: 3700,
    wallBMm: 3400,
    heightMm: 2600,
    cornerDirection: "right",
  },
  cameraChips: 3,
  updatedAt: "2026-01-06T00:00:00.000Z",
};

/** The order the review is read in, written out here so the page is not compared with the constant it follows. */
const READING_ORDER_OF_A_REVIEW_THAT_MAY_BE_SENT = [
  "title",
  "roomLine",
  "settingsRow",
  "groups",
  "wholeKitchenRows",
  "notIncluded",
  "disclaimer",
  "figure",
  "callToAction",
];
const READING_ORDER_OF_A_REVIEW_PAST_ITS_WALL = [
  "title",
  "roomLine",
  "settingsRow",
  "groups",
  "wholeKitchenRows",
  "notIncluded",
  "disclaimer",
  "overflowWarning",
  "refusal",
  "figure",
  "callToAction",
];

/* eslint-disable no-restricted-syntax -- the sentences the page must show, written out so the page is not compared with the catalogue it reads. */
interface KitchenWording {
  readonly roomLine: Readonly<Record<Locale, RegExp>>;
  readonly walls: readonly string[];
}

const KITCHENS: readonly (readonly [KitchenSpec, KitchenWording])[] = [
  [
    L_OWN,
    {
      roomLine: {
        ro: /^În L · 3700 × 3400 mm · cot la stânga · (\d+) dulapuri$/,
        ru: /^Г-образная · 3700 × 3400 мм · угол слева · (\d+) шкаф(?:а|ов)?$/,
      },
      walls: ["A", "B"],
    },
  ],
  [
    RIGHT_HAND_L,
    {
      roomLine: {
        ro: /^În L · 3700 × 3400 mm · cot la dreapta · (\d+) dulapuri$/,
        ru: /^Г-образная · 3700 × 3400 мм · угол справа · (\d+) шкаф(?:а|ов)?$/,
      },
      walls: ["A", "B"],
    },
  ],
  [
    U_MIDDLE,
    {
      roomLine: {
        ro: /^În U · 4500 × 3000 × 3600 mm · (\d+) dulapuri$/,
        ru: /^П-образная · 4500 × 3000 × 3600 мм · (\d+) шкаф(?:а|ов)?$/,
      },
      walls: ["A", "B", "C"],
    },
  ],
  [
    STRAIGHT,
    {
      roomLine: {
        ro: /^Liniară · 3700 mm · (\d+) dulapuri$/,
        ru: /^Линейная · 3700 мм · (\d+) шкаф(?:а|ов)?$/,
      },
      walls: ["A"],
    },
  ],
];

const WALL_WORD: Readonly<Record<Locale, string>> = {
  ro: "Perete",
  ru: "Стена",
};

const SCREEN_WORDING: Readonly<
  Record<
    Locale,
    {
      readonly title: string;
      readonly callToAction: string;
      readonly editGroup: string;
      readonly changeSettings: string;
      readonly view3d: string;
      readonly flaggedTotal: string;
      readonly pastTheWall: string;
    }
  >
> = {
  ro: {
    title: "Verifică designul",
    callToAction: "Cere oferta",
    editGroup: "Editează",
    changeSettings: "Schimbă",
    view3d: "Vezi în 3D",
    flaggedTotal:
      "Prețul include și dulapurile ce depășesc mărimea peretelui și necesită ajustări",
    pastTheWall:
      "Unele dulapuri depășesc lungimea peretelui. Modifică lățimile sau elimină un dulap înainte să ceri oferta.",
  },
  ru: {
    title: "Проверить дизайн",
    callToAction: "Запросить предложение",
    editGroup: "Изменить",
    changeSettings: "Сменить",
    view3d: "Смотреть в 3D",
    flaggedTotal:
      "Цена также включает шкафы, которые выходят за пределы стены и требуют корректировки",
    pastTheWall:
      "Некоторые шкафы выходят за пределы стены. Измени их ширину или удали один из шкафов, прежде чем запрашивать предложение.",
  },
};

const NO_CABINET_SENTENCE =
  "Adaugă cel puțin un dulap în bucătărie înainte să ceri oferta.";
/* eslint-enable no-restricted-syntax */

interface Placed {
  readonly name: string;
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

/** Where each tagged section stands on the page, in page coordinates, the pinned ones excepted by the caller. */
async function sectionsOnThePage(page: Page): Promise<readonly Placed[]> {
  return page.locator("[data-section]").evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        name: element.getAttribute("data-section") ?? "",
        top: rect.top + window.scrollY,
        bottom: rect.bottom + window.scrollY,
        left: rect.left,
        right: rect.right,
      };
    }),
  );
}

/** Every link and button the screen draws but the language chip, which takes its target through an overlay and is
 *  measured by {@link languageChipHitHeight}; a closed menu's options take no room and are left out. */
async function controlsOnThePage(page: Page): Promise<readonly Placed[]> {
  return page
    .locator('main a, main button:not([data-testid="top-bar-locale"])')
    .evaluateAll((elements) =>
      elements.flatMap((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return [];
        return [
          {
            name: `${element.tagName} ${element.textContent.trim().slice(0, 24)}`,
            top: rect.top,
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
          },
        ];
      }),
    );
}

/** How tall the strip is, through the chip's middle, over which a touch lands on the language chip. */
async function languageChipHitHeight(page: Page): Promise<number> {
  return page.getByTestId("top-bar-locale").evaluate((chip) => {
    const rect = chip.getBoundingClientRect();
    const middleX = rect.left + rect.width / 2;
    const middleY = rect.top + rect.height / 2;
    const isTheChipAt = (y: number): boolean => {
      const hit = document.elementFromPoint(middleX, y);
      return hit !== null && chip.contains(hit);
    };
    let reach = 0;
    while (
      reach < 60 &&
      isTheChipAt(middleY - reach) &&
      isTheChipAt(middleY + reach)
    )
      reach += 1;
    return (reach - 1) * 2;
  });
}

interface PinnedSample {
  readonly scrollY: number;
  readonly regionTop: number;
  readonly regionBottom: number;
}

/** The bottom region's box at every scroll position from the top of the page to its end, a hundred pixels apart. */
async function bottomRegionDownThePage(
  page: Page,
): Promise<readonly PinnedSample[]> {
  const furthest = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
  const samples: PinnedSample[] = [];
  const positions = [
    ...Array.from({ length: Math.floor(furthest / 100) + 1 }, (_unused, step) =>
      Math.min(step * 100, furthest),
    ),
    furthest,
  ];
  for (const scrollY of positions) {
    await page.evaluate((y) => {
      window.scrollTo(0, y);
    }, scrollY);
    const region = await readBottomRegion(page);
    samples.push({
      scrollY,
      regionTop: region.top,
      regionBottom: region.bottom,
    });
  }
  return samples;
}

async function bottomOfLast(page: Page, selector: string): Promise<number> {
  return page
    .locator(selector)
    .last()
    .evaluate((element) => element.getBoundingClientRect().bottom);
}

for (const [spec, wording] of KITCHENS) {
  test(`the review of a ${spec.name} kitchen, in both languages: its sections in reading order, a group for every wall, every control a thumb can hit, nothing wider than the phone, and the foot pinned down the whole page with the last row clear of it`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const minted: string[] = [];
    try {
      const kitchen = await seedKitchen(page, minted, spec);
      for (const locale of LOCALES) {
        const words = SCREEN_WORDING[locale];
        await openReview(page, kitchen, locale);
        await expectSceneMounted(page);

        expect(await sectionsInDocumentOrder(page), locale).toEqual(
          READING_ORDER_OF_A_REVIEW_THAT_MAY_BE_SENT,
        );
        const flowing = (await sectionsOnThePage(page)).filter(
          (section) =>
            section.name !== "figure" && section.name !== "callToAction",
        );
        for (const [index, section] of flowing.entries()) {
          const previous = flowing[index - 1];
          if (previous === undefined) continue;
          expect(
            section.top,
            `${locale}: ${section.name} below ${previous.name}`,
          ).toBeGreaterThanOrEqual(previous.bottom);
        }

        await expect(page.locator('[data-section="title"]')).toHaveText(
          words.title,
        );
        const roomLine =
          (await page.locator('[data-section="roomLine"]').textContent()) ?? "";
        const counted = wording.roomLine[locale].exec(roomLine);
        expect(counted, `${locale}: ${roomLine}`).not.toBeNull();
        const bodyRows = page
          .getByTestId("review-group")
          .getByTestId(REVIEW_ROW);
        expect(Number(counted?.[1])).toBe(await bodyRows.count());

        const headings = await page
          .getByTestId("review-group")
          .getByRole("heading")
          .allTextContents();
        for (const wall of ["A", "B", "C"]) {
          const hasAGroup = headings.some((heading) =>
            heading.startsWith(`${WALL_WORD[locale]} ${wall} `),
          );
          expect(
            hasAGroup,
            `${locale}: wall ${wall} in ${headings.join()}`,
          ).toBe(wording.walls.includes(wall));
        }
        await expect(page.getByTestId("review-group-edit")).toHaveCount(
          headings.length,
        );
        await expect(page.getByTestId("review-group-edit").first()).toHaveText(
          words.editGroup,
        );
        await expect(page.locator('[data-section="settingsRow"] a')).toHaveText(
          words.changeSettings,
        );
        await expect(
          page.getByRole("link", { name: words.view3d, exact: true }),
        ).toBeVisible();
        await expect(page.getByTestId(REVIEW_CTA)).toHaveText(
          words.callToAction,
        );

        const scene = await page.getByTestId(REVIEW_SCENE).boundingBox();
        const chips = page.getByTestId(REVIEW_SCENE).getByRole("button");
        await expect(chips).toHaveCount(spec.cameraChips);
        for (const chip of await chips.all()) {
          const box = await chip.boundingBox();
          expect(box?.height, locale).toBeGreaterThanOrEqual(TOUCH_TARGET_PX);
          expect((box?.x ?? 0) + (box?.width ?? 0), locale).toBeLessThanOrEqual(
            (scene?.x ?? 0) + (scene?.width ?? 0),
          );
        }

        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
          locale,
        ).toBeLessThanOrEqual(PHONE.width);
        for (const control of await controlsOnThePage(page)) {
          const detail = `${locale}: ${control.name}`;
          expect(control.bottom - control.top, detail).toBeGreaterThanOrEqual(
            TOUCH_TARGET_PX,
          );
          expect(control.left, detail).toBeGreaterThanOrEqual(0);
          expect(control.right, detail).toBeLessThanOrEqual(PHONE.width);
        }
        expect(
          await languageChipHitHeight(page),
          locale,
        ).toBeGreaterThanOrEqual(TOUCH_TARGET_PX - 2);
        await captureEvidence(page, `screen-${spec.name}-${locale}-top`);

        const pinned = await bottomRegionDownThePage(page);
        expect(pinned.length, locale).toBeGreaterThan(5);
        for (const sample of pinned) {
          const detail = `${locale}: scrolled ${String(sample.scrollY)}`;
          expect(
            Math.abs(sample.regionBottom - PHONE.height),
            detail,
          ).toBeLessThanOrEqual(1);
          expect(
            Math.abs(sample.regionTop - (pinned[0]?.regionTop ?? 0)),
            detail,
          ).toBeLessThanOrEqual(1);
        }
        const regionTop = pinned.at(-1)?.regionTop ?? 0;
        expect(
          await bottomOfLast(page, `[data-testid="${REVIEW_ROW}"]`),
          locale,
        ).toBeLessThanOrEqual(regionTop);
        expect(
          await bottomOfLast(page, '[data-section="notIncluded"]'),
          locale,
        ).toBeLessThanOrEqual(regionTop);
        expect(
          await bottomOfLast(page, '[data-section="disclaimer"]'),
          locale,
        ).toBeLessThanOrEqual(regionTop);
        await captureEvidence(page, `screen-${spec.name}-${locale}-end`);
      }
    } finally {
      await deleteMintedDesigns(minted);
    }
  });
}

/** The bodies the narrowed room leaves past wall A, written out; the same six the editor's own mark spec names. */
const BODIES_PAST_THE_WALL = ["p13", "p14", "p19", "p2", "p20", "p4"];

for (const locale of LOCALES) {
  test(`a kitchen with bodies past its wall, in ${locale}: both sentences stand in the pinned foot at every scroll position, the foot takes under half the phone, the named bodies are links above it, their rows are marked, and Cere oferta is off with its reason`, async ({
    page,
  }) => {
    const minted: string[] = [];
    try {
      const kitchen = await seedDesign(page, NARROWED_ROOM_OVERFLOWING_DESIGN);
      minted.push(kitchen.id);
      const words = SCREEN_WORDING[locale];
      await openReview(page, kitchen, locale);
      await expectSceneMounted(page);

      expect(await sectionsInDocumentOrder(page)).toEqual(
        READING_ORDER_OF_A_REVIEW_PAST_ITS_WALL,
      );
      const region = await readBottomRegion(page);
      console.log(
        `BOTTOM_REGION both sentences ${locale} ${JSON.stringify({
          height: region.height,
          shareOfViewport: region.height / region.viewportHeight,
        })}`,
      );
      expect(region.sentences).toEqual([words.flaggedTotal, words.pastTheWall]);
      expect(region.viewportHeight).toBe(PHONE.height);
      expect(region.height).toBeLessThanOrEqual(PHONE.height / 2);

      const callToAction = page.getByTestId(REVIEW_CTA);
      await expect(callToAction).toHaveAttribute("aria-disabled", "true");
      await expect(callToAction).toHaveAccessibleDescription(words.pastTheWall);
      await expect(callToAction).not.toHaveAttribute("href");
      await touchTheMiddleOf(page, callToAction);
      await page.waitForTimeout(TAP_SETTLE_MS);
      await expect(page).toHaveURL(reviewPath(locale, kitchen.id));

      const marked = await page
        .locator(`[data-testid="${REVIEW_ROW}"][data-marked="true"]`)
        .count();
      expect(marked).toBe(BODIES_PAST_THE_WALL.length);
      const named = page.getByTestId("review-named-bodies").getByRole("link");
      const namedIds = await named.evaluateAll((links) =>
        links.map((link) =>
          new URL(
            link.getAttribute("href") ?? "",
            location.href,
          ).searchParams.get("select"),
        ),
      );
      expect([...namedIds].sort()).toEqual([...BODIES_PAST_THE_WALL].sort());
      const namedLabels = await named.allTextContents();
      const markedLabels = await page
        .locator(`[data-testid="${REVIEW_ROW}"][data-marked="true"]`)
        .getByTestId("review-row-label")
        .evaluateAll((labels) =>
          labels.map((label) => (label.lastChild?.textContent ?? "").trim()),
        );
      expect([...namedLabels].sort()).toEqual([...markedLabels].sort());
      await captureEvidence(page, `screen-past-the-wall-${locale}-top`);

      const pinned = await bottomRegionDownThePage(page);
      for (const sample of pinned) {
        const detail = `scrolled ${String(sample.scrollY)}`;
        expect(
          Math.abs(sample.regionBottom - PHONE.height),
          detail,
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(sample.regionTop - (pinned[0]?.regionTop ?? 0)),
          detail,
        ).toBeLessThanOrEqual(1);
      }
      const regionTop = pinned.at(-1)?.regionTop ?? 0;
      const namedList = await page
        .getByTestId("review-named-bodies")
        .boundingBox();
      expect(
        (namedList?.y ?? 0) + (namedList?.height ?? 0),
      ).toBeLessThanOrEqual(regionTop);
      expect(namedList?.y ?? 0).toBeGreaterThanOrEqual(
        await bottomOfLast(page, '[data-section="disclaimer"]'),
      );
      for (const link of await named.all()) {
        expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(
          TOUCH_TARGET_PX,
        );
      }
      await captureEvidence(page, `screen-past-the-wall-${locale}-end`);

      await named.first().tap();
      await page.waitForURL(`/${locale}/d/${kitchen.id}`);
      await expectEditorReady(page);
      expect((await readSelection(page)).selectionId).toBe(namedIds[0]);
    } finally {
      await deleteMintedDesigns(minted);
    }
  });
}

function kitchenOfOnlyWhatTheCustomerSupplies(): Design {
  const priced = priceAndProject(KITCHEN_L_DESIGN);
  if (!priced.pricing.ok) throw new Error("the fixture kitchen has no price");
  const supplied = customerSuppliedIds(priced.pricing.priced);
  if (supplied.size === 0)
    throw new Error("the fixture kitchen holds nothing the customer supplies");
  return keepingOnly(KITCHEN_L_DESIGN, supplied);
}

const KITCHENS_WITH_NOTHING_TO_OFFER: readonly (readonly [
  string,
  () => Design,
])[] = [
  ["an empty kitchen", () => emptied(KITCHEN_L_DESIGN)],
  [
    "a kitchen holding only what the customer supplies",
    kitchenOfOnlyWhatTheCustomerSupplies,
  ],
];

for (const [name, build] of KITCHENS_WITH_NOTHING_TO_OFFER) {
  test(`${name} has no review to show: the heading, why, the way back and Cere oferta off, with no figure, no amount, no row, no not-included block and no scene`, async ({
    page,
  }) => {
    const minted: string[] = [];
    try {
      const kitchen = await seedDesign(page, build());
      minted.push(kitchen.id);
      const words = SCREEN_WORDING.ro;
      await openReview(page, kitchen);

      const screen = page.locator("main");
      await expect(screen.getByRole("heading", { level: 1 })).toHaveText(
        words.title,
      );
      const region = await readBottomRegion(page);
      expect(region.sentences).toEqual([NO_CABINET_SENTENCE]);
      const callToAction = page.getByTestId(REVIEW_CTA);
      await expect(callToAction).toHaveAttribute("aria-disabled", "true");
      await expect(callToAction).toHaveAccessibleDescription(
        NO_CABINET_SENTENCE,
      );

      await expect(page.locator(FIGURE)).toHaveCount(0);
      await expect(page.getByTestId(REVIEW_ROW)).toHaveCount(0);
      await expect(page.getByTestId("review-group")).toHaveCount(0);
      await expect(page.locator('[data-section="notIncluded"]')).toHaveCount(0);
      await expect(page.locator('[data-section="disclaimer"]')).toHaveCount(0);
      await expect(page.getByTestId(REVIEW_SCENE)).toHaveCount(0);
      await expect(page.locator("canvas")).toHaveCount(0);
      await expect(page.getByTestId("review-named-bodies")).toHaveCount(0);
      await expect(page.getByTestId("review-whole-kitchen")).toHaveCount(0);
      const drawn = await screen.innerText();
      expect(drawn).not.toMatch(/MDL/);
      expect(drawn).not.toMatch(/\d/);
      await captureEvidence(page, `screen-unavailable-${name}`);

      await page.getByTestId("review-unavailable-back").tap();
      await page.waitForURL(`/ro/d/${kitchen.id}`);
      await expect(page.getByTestId("top-bar-title")).toBeVisible();
    } finally {
      await deleteMintedDesigns(minted);
    }
  });
}

test("each group of rows stands apart from the group above it by at least the space between two of its own rows", async ({
  page,
  seededDesign,
}) => {
  await openReview(page, seededDesign);

  const spacing = await page
    .getByTestId("review-group")
    .evaluateAll((groups) => {
      const boxes = groups.map((group) => group.getBoundingClientRect());
      const rows = [...(groups[0]?.querySelectorAll("li") ?? [])].map((row) =>
        row.getBoundingClientRect(),
      );
      return {
        betweenRows: (rows[1]?.top ?? 0) - (rows[0]?.bottom ?? 0),
        betweenGroups: boxes
          .slice(1)
          .map((box, index) => box.top - (boxes[index]?.bottom ?? 0)),
      };
    });
  console.log(`GROUP_SPACING ${JSON.stringify(spacing)}`);

  expect(spacing.betweenRows).toBeGreaterThan(0);
  expect(spacing.betweenGroups.length).toBeGreaterThanOrEqual(4);
  for (const gap of spacing.betweenGroups) {
    expect(gap).toBeGreaterThanOrEqual(spacing.betweenRows);
  }
});

/** What is in `from` and not in `others`, counting repeats. */
function leftOver(
  from: readonly string[],
  others: readonly string[],
): readonly string[] {
  const remaining = [...others];
  return from.filter((label) => {
    const index = remaining.indexOf(label);
    if (index === -1) return true;
    remaining.splice(index, 1);
    return false;
  });
}

test("the review's figure is the editor's price bar's, and after a body is narrowed in the editor the review's row and figure are the new ones", async ({
  page,
  seededDesign,
}) => {
  const millimetres = (text: string): string => /\d+/.exec(text)?.[0] ?? "";
  await openReview(page, seededDesign);
  const labelsBefore = await page
    .getByTestId("review-row-label")
    .allTextContents();
  const figureBefore = (await page.locator(FIGURE).textContent()) ?? "";

  await page.goto(`/ro/d/${seededDesign.id}?select=p4`);
  await expectEditorReady(page);
  const priceBefore =
    (await page.getByTestId("price-bar-total").textContent()) ?? "";
  expect(figureBefore).toContain(priceBefore);
  const widthBefore = millimetres(
    (await page.getByTestId("width-value").textContent()) ?? "",
  );
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() !== "GET" &&
      new URL(response.url()).pathname === `/api/designs/${seededDesign.id}`,
  );
  await page.getByTestId("width-step-narrower").tap();
  await saved;
  const widthAfter = millimetres(
    (await page.getByTestId("width-value").textContent()) ?? "",
  );
  expect(widthAfter).not.toBe(widthBefore);
  const priceAfter =
    (await page.getByTestId("price-bar-total").textContent()) ?? "";
  await page.getByTestId("panel-close").tap();

  await page.getByTestId(REVIEW_CTA).tap();
  await page.waitForURL(reviewPath("ro", seededDesign.id));
  await expectReviewDrawn(page);

  const labelsAfter = await page
    .getByTestId("review-row-label")
    .allTextContents();
  const gone = leftOver(labelsBefore, labelsAfter);
  const arrived = leftOver(labelsAfter, labelsBefore);
  // The step narrows the body's whole column, so every body standing in it changes with it.
  expect(gone.length).toBeGreaterThanOrEqual(1);
  for (const label of gone) expect(label).toContain(widthBefore);
  expect([...arrived].sort()).toEqual(
    gone.map((label) => label.replace(widthBefore, widthAfter)).sort(),
  );
  await expect(page.locator(FIGURE)).toContainText(priceAfter);
  console.log(
    `PRICE narrowed ${JSON.stringify({ priceBefore, priceAfter, widthBefore, widthAfter, gone, arrived })}`,
  );
});
