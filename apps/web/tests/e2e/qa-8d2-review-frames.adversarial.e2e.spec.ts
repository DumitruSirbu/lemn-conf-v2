// The review against its frames at 390 x 844 by touch: a row's second line as a customer reads it, the bar at the
// page's foot in both languages, and the view chips under the picture.
//
// **Must not run concurrently with any other persistence live run**: each test mints rows and deletes them (ADR 0006).
import {
  KITCHEN_L_DESIGN,
  NARROWED_ROOM_OVERFLOWING_DESIGN,
  type Design,
  type Finish,
  type Handle,
} from "@lemnaria/configurator-domain";
import { expect, type Page, type Route } from "@playwright/test";

import { priceAndProject } from "../support/generated-kitchens";
import { emptied } from "../support/review-edits";
import { deleteMintedDesigns } from "./support/minted-designs";
import {
  captureEvidence,
  centreOf,
  chooseAnotherHardwareTier,
  expectReviewDrawn,
  expectSceneMounted,
  openReview,
  readBottomRegion,
  REVIEW_BOTTOM,
  REVIEW_CTA,
  REVIEW_ROW,
  REVIEW_SCENE,
  reviewPath,
  SAVE_WAIT,
  scrollTop,
  touchDrag,
} from "./support/qa-8d-review";
import { openSeededDesign, test, type Locale } from "./support/seeded-design";
import { composeU, seedDesign } from "./support/u-design";

const PHONE = { width: 390, height: 844 };
const HALF_THE_PHONE = PHONE.height / 2;
const LOCALES: readonly Locale[] = ["ro", "ru"];

/* eslint-disable no-restricted-syntax -- the approved words, written out so the page is not compared with the catalogue it reads. */
const WORDS: Readonly<Record<Locale, Readonly<Record<string, string>>>> = {
  ro: {
    "pal.antracit": "Antracit",
    "pal.stejar-halifax": "Stejar Halifax Natur",
    steel: "Bară inox",
    push: "Push-to-open",
    mm: "mm",
  },
  ru: {
    "pal.antracit": "Антрацит",
    "pal.stejar-halifax": "Дуб Галифакс натуральный",
    steel: "Ручка-рейлинг из нержавеющей стали",
    push: "Push-to-open",
    mm: "мм",
  },
};
/* eslint-enable no-restricted-syntax */

const FREE_COLOUR = "#b8c4a1";

interface Dress {
  readonly finish?: Finish;
  readonly handle?: Handle;
}

/** The seeded kitchen in `material`, with the kitchen's own colour set and the named bodies dressed. */
function dressedKitchen(
  material: "material.melamine" | "material.painted-mdf",
  kitchenFinish: Finish,
  dresses: Readonly<Record<string, Dress>>,
): Design {
  return {
    ...KITCHEN_L_DESIGN,
    settings: {
      ...KITCHEN_L_DESIGN.settings,
      materialTierId: material,
      finish: kitchenFinish,
    },
    placements: KITCHEN_L_DESIGN.placements.map((placement) => ({
      ...placement,
      body: { ...placement.body, ...dresses[placement.id] },
    })),
  };
}

/** What each row's second line must say, in the order the review draws its rows, from the document alone. */
function expectedSecondLines(
  design: Design,
  locale: Locale,
): readonly (readonly string[])[] {
  const byId = new Map(
    design.placements.map((placement) => [placement.id, placement.body]),
  );
  return priceAndProject(design).groups.flatMap((group) =>
    group.entries.map((entry) => {
      const body = byId.get(entry.placementId);
      if (body === undefined) throw new Error("a row names no body");
      const words = WORDS[locale];
      return [
        `${String(body.widthMm)} ${words.mm ?? ""}`,
        ...(body.finish === undefined
          ? []
          : [
              body.finish.kind === "palette-entry"
                ? (words[body.finish.entryId] ?? "?")
                : body.finish.value,
            ]),
        ...(body.handle === undefined ? [] : [words[body.handle] ?? "?"]),
      ];
    }),
  );
}

async function secondLinesOnThePage(
  page: Page,
): Promise<readonly (readonly string[])[]> {
  return page
    .getByTestId("review-group")
    .getByTestId(REVIEW_ROW)
    .evaluateAll((rows) =>
      rows.map((row) =>
        [
          ...row.querySelectorAll('[data-testid="review-row-facts"] > span'),
        ].map((fact) => fact.textContent),
      ),
    );
}

const DRESSED_KITCHENS: readonly (readonly [string, Design])[] = [
  [
    "a melamine kitchen in one decor, with bodies in another, with handles, and with both",
    dressedKitchen(
      "material.melamine",
      { kind: "palette-entry", entryId: "pal.antracit" },
      {
        p4: {
          finish: { kind: "palette-entry", entryId: "pal.stejar-halifax" },
        },
        p8: { finish: { kind: "palette-entry", entryId: "pal.antracit" } },
        p14: { handle: "push" },
        p19: {
          finish: { kind: "palette-entry", entryId: "pal.stejar-halifax" },
          handle: "steel",
        },
      },
    ),
  ],
  [
    "a painted kitchen, with a body in a colour of its own",
    dressedKitchen(
      "material.painted-mdf",
      { kind: "free-colour", value: "#101010" },
      {
        p4: { finish: { kind: "free-colour", value: FREE_COLOUR } },
        p14: { handle: "steel" },
      },
    ),
  ],
];

for (const [name, design] of DRESSED_KITCHENS) {
  test(`${name}: each row's second line reads its body's width and its own finish and handle, in both languages, and no row reads the kitchen's colour unless the body chose it`, async ({
    page,
  }) => {
    const minted: string[] = [];
    try {
      const kitchen = await seedDesign(page, design);
      minted.push(kitchen.id);
      const stored = await page.evaluate(async (id) => {
        const loaded = await fetch(`/api/designs/${id}`);
        return ((await loaded.json()) as { design: unknown }).design;
      }, kitchen.id);

      for (const locale of LOCALES) {
        await openReview(page, kitchen, locale);
        const expected = expectedSecondLines(stored as Design, locale);

        expect(await secondLinesOnThePage(page), locale).toEqual(expected);
        expect(expected.filter((facts) => facts.length > 1).length).toBe(
          Object.keys(
            design.placements.filter(
              (placement) =>
                placement.body.finish !== undefined ||
                placement.body.handle !== undefined,
            ),
          ).length,
        );
        // Each row is two lines, the name above the facts, and nothing in it is wider than its row.
        const rows = await page
          .getByTestId("review-group")
          .getByTestId(REVIEW_ROW)
          .evaluateAll((elements) =>
            elements.map((row) => {
              const nameBox = row
                .querySelector('[data-testid="review-row-name"]')
                ?.getBoundingClientRect();
              const factsBox = row
                .querySelector('[data-testid="review-row-facts"]')
                ?.getBoundingClientRect();
              const amountBox = row
                .querySelector('[data-testid="review-row-amount"]')
                ?.getBoundingClientRect();
              return {
                factsBelowName: (factsBox?.top ?? 0) >= (nameBox?.bottom ?? 1),
                clearOfTheAmount:
                  Math.max(nameBox?.right ?? 0, factsBox?.right ?? 0) <=
                  (amountBox?.left ?? 0),
                insideThePhone: (amountBox?.right ?? 999) <= window.innerWidth,
              };
            }),
          );
        expect(rows.length, locale).toBe(expected.length);
        for (const [index, row] of rows.entries())
          expect(row, `${locale} row ${String(index)}`).toEqual({
            factsBelowName: true,
            clearOfTheAmount: true,
            insideThePhone: true,
          });
        await captureEvidence(
          page,
          `second-line-${name.slice(0, 20)}-${locale}`,
          {
            fullPage: true,
          },
        );
      }
    } finally {
      await deleteMintedDesigns(minted);
    }
  });
}

interface BarFit {
  readonly regionHeight: number;
  readonly caption: { top: number; bottom: number; right: number };
  readonly amount: { top: number; bottom: number; right: number; text: string };
  readonly action: {
    left: number;
    right: number;
    top: number;
    bottom: number;
    clippedBy: number;
    lines: number;
    lineTexts: readonly string[];
    fontSizePx: number;
    overflow: string;
    text: string;
  };
  readonly amountLines: number;
  readonly pageScrollWidth: number;
}

/** The bar as laid out: the caption, the amount, and the call to action with how many lines its label takes. */
async function readTheBar(page: Page): Promise<BarFit> {
  return page.getByTestId(REVIEW_BOTTOM).evaluate((region) => {
    const figure = region.querySelector('[data-section="figure"]');
    const [caption, amount] = figure?.children ?? [];
    const action = region.querySelector('[data-testid="review-cta"]');
    if (!caption || !amount || !action) throw new Error("the bar is not whole");
    const box = (element: Element) => element.getBoundingClientRect();
    const linesOf = (element: Element): string[] => {
      const text = element.firstChild;
      if (text === null) return [];
      const lines = new Map<number, string>();
      for (let index = 0; index < (text.textContent ?? "").length; index += 1) {
        const range = document.createRange();
        range.setStart(text, index);
        range.setEnd(text, index + 1);
        const top = Math.round(range.getBoundingClientRect().top);
        lines.set(
          top,
          `${lines.get(top) ?? ""}${(text.textContent ?? "").charAt(index)}`,
        );
      }
      return [...lines.values()].map((line) => line.trim());
    };
    const actionLines = linesOf(action);
    return {
      regionHeight: box(region).height,
      caption: {
        top: box(caption).top,
        bottom: box(caption).bottom,
        right: box(caption).right,
      },
      amount: {
        top: box(amount).top,
        bottom: box(amount).bottom,
        right: box(amount).right,
        text: amount.textContent,
      },
      action: {
        left: box(action).left,
        right: box(action).right,
        top: box(action).top,
        bottom: box(action).bottom,
        clippedBy: Math.max(
          action.scrollHeight - action.clientHeight,
          action.scrollWidth - action.clientWidth,
        ),
        lines: actionLines.length,
        lineTexts: actionLines,
        fontSizePx: Number.parseFloat(getComputedStyle(action).fontSize),
        overflow: `${getComputedStyle(action).textOverflow}/${getComputedStyle(action).overflow}`,
        text: action.textContent,
      },
      amountLines: linesOf(amount).length,
      pageScrollWidth: document.documentElement.scrollWidth,
    };
  });
}

function expectTheBarOnOneRow(bar: BarFit, detail: string): void {
  // The caption stands over the amount, and the call to action beside both, never under them.
  expect(bar.caption.bottom, detail).toBeLessThanOrEqual(bar.amount.top);
  expect(
    Math.max(bar.caption.right, bar.amount.right),
    detail,
  ).toBeLessThanOrEqual(bar.action.left);
  expect(bar.action.top, detail).toBeLessThan(bar.amount.bottom);
  expect(bar.action.bottom, detail).toBeGreaterThan(bar.caption.top);
  expect(bar.action.right, detail).toBeLessThanOrEqual(PHONE.width);
  expect(bar.action.bottom - bar.action.top, detail).toBe(52);
  expect(bar.action.clippedBy, detail).toBeLessThanOrEqual(0);
  expect(bar.action.fontSizePx, detail).toBe(15);
  expect(bar.action.overflow, detail).toBe("clip/visible");
  expect(bar.amountLines, detail).toBe(1);
  expect(bar.pageScrollWidth, detail).toBeLessThanOrEqual(PHONE.width);
}

const CALL_TO_ACTION_LINES: Readonly<Record<Locale, readonly string[]>> = {
  ro: ["Cere oferta"],
  ru: ["Запросить", "предложение"],
};

type SaveAnswer = (route: Route) => Promise<void>;

async function answerSavesWith(
  page: Page,
  designId: string,
  answer: SaveAnswer,
): Promise<void> {
  await page.route(`**/api/designs/${designId}`, async (route) => {
    const method = route.request().method();
    if (method === "PUT" || method === "PATCH") await answer(route);
    else await route.continue();
  });
}

const neverAnswered: SaveAnswer = () => new Promise<void>(() => undefined);
const inConflict: SaveAnswer = (route) =>
  route.fulfill({ status: 409, contentType: "application/json", body: "{}" });

for (const locale of LOCALES) {
  test(`the foot in ${locale} with no sentence, one, two and three: under half the phone each time, and the bar on one row with the caption over the amount and the call to action beside it`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const minted: string[] = [];
    try {
      const fitting = await seedDesign(page, KITCHEN_L_DESIGN);
      const pastItsWall = await seedDesign(
        page,
        NARROWED_ROOM_OVERFLOWING_DESIGN,
      );
      minted.push(fitting.id, pastItsWall.id);
      const heights: Record<string, number> = {};
      const measure = async (state: string, sentences: number) => {
        const region = await readBottomRegion(page);
        const bar = await readTheBar(page);
        heights[state] = region.height;
        expect(region.sentences, state).toHaveLength(sentences);
        expect(region.height, state).toBeLessThan(HALF_THE_PHONE);
        expectTheBarOnOneRow(bar, `${locale}, ${state}`);
        expect(bar.action.lineTexts, `${locale}, ${state}`).toEqual(
          CALL_TO_ACTION_LINES[locale],
        );
        await captureEvidence(page, `foot-${locale}-${state}`);
        return bar;
      };

      await openReview(page, fitting, locale);
      const plain = await measure("no sentence", 0);

      await openSeededDesign(page, fitting, { locale });
      await answerSavesWith(page, fitting.id, neverAnswered);
      await chooseAnotherHardwareTier(page);
      await page.getByTestId(REVIEW_CTA).tap();
      await page.waitForURL(reviewPath(locale, fitting.id));
      await expectReviewDrawn(page);
      await expect(page.getByTestId(SAVE_WAIT)).toBeVisible();
      await measure("one sentence", 1);

      await openReview(page, pastItsWall, locale);
      await measure("two sentences", 2);

      await openSeededDesign(page, pastItsWall, { locale });
      await answerSavesWith(page, pastItsWall.id, inConflict);
      await chooseAnotherHardwareTier(page);
      await page.getByTestId(REVIEW_CTA).tap();
      await page.waitForURL(reviewPath(locale, pastItsWall.id));
      await expectReviewDrawn(page);
      await expect(page.getByTestId("review-open-editor")).toBeVisible();
      await measure("three sentences", 3);

      console.log(
        `FOOT ${locale} ${JSON.stringify({ heights, action: { lines: plain.action.lines, text: plain.action.text, width: plain.action.right - plain.action.left } })}`,
      );
    } finally {
      await deleteMintedDesigns(minted);
    }
  });
}

const LONGER_AMOUNTS = ["986 000 MDL", "1 234 000 MDL", "12 345 000 MDL"];

test("the bar keeps to one row with a six-, a seven- and an eight-digit amount written into it, in both languages; the call to action is what gives way", async ({
  page,
  seededDesign,
}) => {
  for (const locale of LOCALES) {
    await openReview(page, seededDesign, locale);
    const asPriced = await readTheBar(page);
    const fits: Record<string, unknown> = {
      [asPriced.amount.text]: asPriced.action,
    };
    expectTheBarOnOneRow(asPriced, `${locale}, as priced`);

    for (const amount of LONGER_AMOUNTS) {
      // No kitchen the generator makes costs this much, so the amount is written into the drawn bar: a probe of
      // the layout, not of the price.
      await page
        .locator('[data-section="figure"] > :last-child')
        .evaluate((element, text) => {
          element.textContent = text;
        }, amount);
      const bar = await readTheBar(page);
      fits[amount] = bar.action;
      expectTheBarOnOneRow(bar, `${locale}, ${amount}`);
      expect(bar.action.lineTexts, `${locale}, ${amount}`).toEqual(
        CALL_TO_ACTION_LINES[locale],
      );
      expect(bar.regionHeight, `${locale}, ${amount}`).toBe(
        asPriced.regionHeight,
      );
    }
    console.log(`BAR ${locale} ${JSON.stringify(fits)}`);
    await captureEvidence(page, `bar-longest-amount-${locale}`);
  }
});

const BIG_U_ROOMS = [
  { widthMm: 6000, depthMm: 6000, wallCMm: 6000, heightMm: 2600 },
  { widthMm: 6000, depthMm: 4500, wallCMm: 4500, heightMm: 2600 },
  { widthMm: 6000, depthMm: 3000, wallCMm: 3000, heightMm: 2600 },
  { widthMm: 4500, depthMm: 3000, wallCMm: 3600, heightMm: 2600 },
];
const MATERIAL_TIERS = [
  "material.melamine",
  "material.painted-mdf",
  "material.veneer",
];
const HARDWARE_TIERS = [
  "hardware.standard",
  "hardware.soft-close",
  "hardware.premium",
];

/** The kitchen with the highest total among the largest U rooms the generator composes, in every pair of tiers the
 *  price book offers. */
function priciestGeneratedKitchen(): { design: Design; totalMinor: number } {
  let priciest: { design: Design; totalMinor: number } | undefined;
  for (const room of BIG_U_ROOMS) {
    let composed: Design;
    try {
      composed = composeU(room);
    } catch {
      continue;
    }
    for (const materialTierId of MATERIAL_TIERS) {
      for (const hardwareTierId of HARDWARE_TIERS) {
        const design: Design = {
          ...composed,
          settings: { ...composed.settings, materialTierId, hardwareTierId },
        };
        const { pricing } = priceAndProject(design);
        if (!pricing.ok) continue;
        const { totalMinor } = pricing.priced;
        if (priciest === undefined || totalMinor > priciest.totalMinor)
          priciest = { design, totalMinor };
      }
    }
  }
  if (priciest === undefined) throw new Error("no kitchen was priced");
  return priciest;
}

test("with the priciest kitchen the generator makes, the bar is still one row in both languages: the amount on one line, the Russian label on its two, the Romanian on one, in a 52 px call to action", async ({
  page,
}) => {
  const minted: string[] = [];
  try {
    const { design, totalMinor } = priciestGeneratedKitchen();
    const kitchen = await seedDesign(page, design);
    minted.push(kitchen.id);
    for (const locale of LOCALES) {
      await openReview(page, kitchen, locale);
      const bar = await readTheBar(page);

      expectTheBarOnOneRow(bar, locale);
      expect(bar.action.lineTexts, locale).toEqual(
        CALL_TO_ACTION_LINES[locale],
      );
      console.log(
        `PRICIEST ${locale} ${JSON.stringify({ totalMinor, amount: bar.amount.text, actionWidth: bar.action.right - bar.action.left })}`,
      );
      await captureEvidence(page, `bar-priciest-${locale}`);
    }
  } finally {
    await deleteMintedDesigns(minted);
  }
});

test("a review that cannot be shown has a bar that is the call to action alone, across the page", async ({
  page,
}) => {
  const minted: string[] = [];
  try {
    const kitchen = await seedDesign(page, emptied(KITCHEN_L_DESIGN));
    minted.push(kitchen.id);
    await openReview(page, kitchen);

    const region = page.getByTestId(REVIEW_BOTTOM);
    await expect(region.locator('[data-section="figure"]')).toHaveCount(0);
    const action = await page.getByTestId(REVIEW_CTA).boundingBox();
    expect(action?.height).toBeGreaterThanOrEqual(52);
    expect(action?.width).toBeGreaterThan(PHONE.width - 40);
  } finally {
    await deleteMintedDesigns(minted);
  }
});

test("the view chips stand in a row under a picture 158 px tall, each at least 44 px, none over it; the 3D link stays in the picture's corner; and a swipe that starts on the chip row scrolls the page", async ({
  page,
  seededDesign,
}) => {
  await openReview(page, seededDesign, "ru");
  const canvas = await expectSceneMounted(page);
  // The canvas is given its size a moment after it is attached; until then it is the browser's default.
  await expect.poll(async () => (await canvas.boundingBox())?.height).toBe(158);
  const picture = await canvas.boundingBox();
  const scene = page.getByTestId(REVIEW_SCENE);
  const chips = scene.getByRole("button");

  expect(picture?.height).toBe(158);
  const pictureBottom = (picture?.y ?? 0) + (picture?.height ?? 0);
  const boxes = await Promise.all(
    (await chips.all()).map((chip) => chip.boundingBox()),
  );
  expect(boxes.length).toBe(3);
  for (const box of boxes) {
    expect(box?.y ?? 0).toBeGreaterThanOrEqual(pictureBottom);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(PHONE.width);
  }
  expect(new Set(boxes.map((box) => box?.y)).size).toBe(1);
  const link = await scene.getByRole("link").boundingBox();
  expect((link?.y ?? 0) + (link?.height ?? 0)).toBeLessThanOrEqual(
    pictureBottom,
  );
  expect(link?.y ?? 0).toBeGreaterThanOrEqual(picture?.y ?? 0);
  expect(link?.height ?? 0).toBeGreaterThanOrEqual(44);
  // Nothing but that link stands over the picture: every point of a grid across it is the canvas or the link.
  const covering = await page.evaluate(
    ({ x, y, width, height }) => {
      const others = new Set<string>();
      for (let column = 1; column < 12; column += 1) {
        for (let row = 1; row < 8; row += 1) {
          const hit = document.elementFromPoint(
            x + (width * column) / 12,
            y + (height * row) / 8,
          );
          if (hit === null || hit.tagName === "CANVAS" || hit.closest("a"))
            continue;
          others.add(`${hit.tagName}.${hit.className}`);
        }
      }
      return [...others];
    },
    picture ?? { x: 0, y: 0, width: 0, height: 0 },
  );
  expect(covering).toEqual([]);

  // A touch that travels on a chip is a swipe, not a press: the page scrolls and the view stays.
  const pressedBefore = await scene
    .locator('[aria-pressed="true"]')
    .textContent();
  const onAChip = await centreOf(chips.nth(2));
  expect(await scrollTop(page)).toBe(0);
  await touchDrag(page, onAChip, { x: onAChip.x, y: onAChip.y - 160 });
  await expect.poll(() => scrollTop(page)).toBeGreaterThanOrEqual(100);
  expect(await scene.locator('[aria-pressed="true"]').textContent()).toBe(
    pressedBefore,
  );
});
