import {
  countStaffFixturesForTests,
  removeStaffFixturesForTests,
} from "@lemnaria/persistence";
import {
  expect,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

import {
  activeSwitch as accessorySwitch,
  DRYING_RACK,
  menuButtonOf as accessoryMenuButtonOf,
  menuOf as accessoryMenuOf,
  openAccessory,
  openAccessoryList,
  rowsOf as accessoryRowsOf,
  chipsOf as accessoryChipsOf,
  warmAccessoryRoutes,
} from "./accessory-page";
import {
  createAClass,
  createAnAccessory,
  type CreationRun,
} from "./creation-flow";
import {
  activeSwitch as hardwareSwitch,
  type Box,
  boxOf,
  chipsOf as hardwareChipsOf,
  deleteClassButton,
  HETTICH,
  menuButtonOf as hardwareMenuButtonOf,
  menuOf as hardwareMenuOf,
  openClass,
  openHardwareList,
  rowsOf as hardwareRowsOf,
  SERVER_IS_PRODUCTION_BUILD,
  STANDARD,
  warmHardwareRoutes,
} from "./hardware-page";
import {
  activeSwitch as materialSwitch,
  MDF,
  openMaterial,
  warmMaterialRoutes,
} from "./material-page";
import {
  discardDraft,
  priceRateLimitKeysOf,
  test,
} from "./price-dashboard-session";
import { holdPriceDraft, releasePriceDraft } from "./price-draft-lock";
import { wordsOf } from "./publish-page";
import { shootForReview } from "./staff-pages";
import {
  NOTHING_LEFT,
  plantSignedInAdministrator,
  romanian,
  signIn,
  type SignedInAdministrator,
} from "./staff-world";

// How an item's switch row and its row menu are drawn, in a browser: a switch that cannot be pressed is drawn off the way
// a deletion that cannot be taken is, and an open menu never covers the "De publicat" chip of the row it belongs to. Both
// hold under `next dev` and under the production build `CI` serves; what differs is which switches can be pressed.

const FILES_TAKE_TURNS_MS = 600_000;
const PENDING_CHIP = () => romanian("priceDashboard.chips.pending");

export interface Viewport {
  readonly width: number;
  readonly height: number;
  /** Names a screenshot: `item-look-<label>-…`. */
  readonly label: string;
  /** The widths a row menu is opened at; none on a phone, where the menu is not a popover. */
  readonly popoverWidths: readonly number[];
}

interface Look {
  readonly color: string;
  readonly backgroundColor: string;
  readonly borderColor: string;
  readonly cursor: string;
}

export function describeItemLook(viewport: Viewport): void {
  let signedIn: SignedInAdministrator;
  let rateLimitKeys: readonly string[] = [];

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(FILES_TAKE_TURNS_MS);
    await holdPriceDraft();
    signedIn = await plantSignedInAdministrator();
    rateLimitKeys = priceRateLimitKeysOf(signedIn);
    await warmHardwareRoutes(browser, signedIn.administrator);
    await warmMaterialRoutes(browser, signedIn.administrator);
    await warmAccessoryRoutes(browser, signedIn.administrator);
  });

  test.afterAll(async () => {
    releasePriceDraft();
    const scope = { rateLimitKeys };
    await removeStaffFixturesForTests(signedIn.marker, scope);
    const left = await countStaffFixturesForTests(signedIn.marker, scope);
    expect(left, "rows left behind").toEqual(NOTHING_LEFT);
  });

  test.beforeEach(async ({ context, page }) => {
    expect(page.viewportSize(), "the viewport this project asked for").toEqual({
      width: viewport.width,
      height: viewport.height,
    });
    await signIn(context, signedIn.administrator);
    await discardDraft(context);
  });

  test.afterEach(async ({ context }) => {
    await discardDraft(context);
  });

  test(`${viewport.label}: every switch that cannot be pressed is drawn as the deletion that cannot be taken is, and one that can be pressed is not`, async ({
    page,
  }) => {
    const words = wordsOf("ro");
    await openClass(page, STANDARD);
    const drawnOff = await lookOf(deleteClassButton(page, words));
    const screens: readonly [string, () => Promise<Locator>][] = [
      [
        "hardware, the default class",
        async () => {
          await openClass(page, STANDARD);
          return hardwareSwitch(page, words);
        },
      ],
      [
        "hardware, a class",
        async () => {
          await openClass(page, HETTICH);
          return hardwareSwitch(page, words);
        },
      ],
      [
        "a material",
        async () => {
          await openMaterial(page, MDF);
          return materialSwitch(page, words);
        },
      ],
      [
        "an accessory",
        async () => {
          await openAccessory(page, DRYING_RACK);
          return accessorySwitch(page, words);
        },
      ],
    ];
    let offCount = 0;
    for (const [name, open] of screens) {
      const toggle = await open();
      const look = await lookOf(toggle);
      const isOff = (await toggle.getAttribute("aria-disabled")) === "true";
      await shootForReview(
        page,
        `item-look-${viewport.label}-switch-${isOff ? "off" : "live"}-${name.replaceAll(/\W+/g, "-")}`,
      );
      if (isOff) {
        offCount += 1;
        expect(look, `${name}: off, so drawn off`).toEqual(drawnOff);
      } else {
        expect(look.cursor, `${name}: live, so it invites a press`).toBe(
          "pointer",
        );
        expect(
          look.backgroundColor,
          `${name}: live, so not drawn off`,
        ).not.toBe(drawnOff.backgroundColor);
        expect(look.borderColor, `${name}: live, so not drawn off`).not.toBe(
          drawnOff.borderColor,
        );
      }
    }
    expect(
      offCount,
      "the default class's switch is always off",
    ).toBeGreaterThan(0);
    if (SERVER_IS_PRODUCTION_BUILD) {
      expect(offCount, "a production build draws every switch off").toBe(
        screens.length,
      );
    }
  });

  for (const width of viewport.popoverWidths) {
    test(`${viewport.label}: at ${String(width)} the open menu of a created class does not cover its "De publicat" chip`, async ({
      page,
      context,
    }) => {
      await page.setViewportSize({ width, height: viewport.height });
      await createAClass(creationRunOf(page, context));

      await openHardwareList(page);
      await expectMenuClearOfPendingChip({
        page,
        rows: hardwareRowsOf(page),
        chipsOf: hardwareChipsOf,
        menuButtonOf: hardwareMenuButtonOf,
        menuOf: hardwareMenuOf,
        title: `hardware at ${String(width)}`,
        shot: `item-look-${String(width)}-menu-hardware-created`,
      });
    });

    test(`${viewport.label}: at ${String(width)} the open menu of a created accessory does not cover its "De publicat" chip`, async ({
      page,
      context,
    }) => {
      await page.setViewportSize({ width, height: viewport.height });
      await createAnAccessory(creationRunOf(page, context));

      await openAccessoryList(page);
      await expectMenuClearOfPendingChip({
        page,
        rows: accessoryRowsOf(page),
        chipsOf: accessoryChipsOf,
        menuButtonOf: accessoryMenuButtonOf,
        menuOf: accessoryMenuOf,
        title: `accessories at ${String(width)}`,
        shot: `item-look-${String(width)}-menu-accessory-created`,
      });
    });
  }
}

function creationRunOf(page: Page, context: BrowserContext): CreationRun {
  return {
    page,
    context,
    press: (control) => control.click(),
    shoot: () => Promise.resolve(),
  };
}

interface MenuAgainstChip {
  readonly page: Page;
  readonly rows: Locator;
  readonly chipsOf: (row: Locator) => Locator;
  readonly menuButtonOf: (row: Locator) => Locator;
  readonly menuOf: (row: Locator) => Locator;
  readonly title: string;
  readonly shot: string;
}

async function expectMenuClearOfPendingChip(
  check: MenuAgainstChip,
): Promise<void> {
  const row = check.rows.filter({ hasText: PENDING_CHIP() });
  await expect(row, `${check.title}: one created row`).toHaveCount(1);
  const chips = check.chipsOf(row);
  await expect(
    chips.filter({ hasText: PENDING_CHIP() }),
    `${check.title}: the row says it is to be published`,
  ).toHaveCount(1);
  await check.menuButtonOf(row).click();
  await expect(check.menuOf(row)).toBeVisible();
  await shootForReview(check.page, check.shot);
  const menuBox = await boxOf(check.menuOf(row));
  for (const chip of await chips.all()) {
    const chipBox = await boxOf(chip);
    expect(
      shareGround(menuBox, chipBox),
      `${check.title}: the menu ${JSON.stringify(menuBox)} covers the chip ${JSON.stringify(chipBox)}`,
    ).toBe(false);
  }
}

function shareGround(first: Box, second: Box): boolean {
  const acrossOverlap =
    Math.min(first.x + first.width, second.x + second.width) -
    Math.max(first.x, second.x);
  const downOverlap =
    Math.min(first.y + first.height, second.y + second.height) -
    Math.max(first.y, second.y);
  return acrossOverlap > 0 && downOverlap > 0;
}

function lookOf(control: Locator): Promise<Look> {
  return control.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      color: style.color,
      backgroundColor: style.backgroundColor,
      borderColor: style.borderTopColor,
      cursor: style.cursor,
    };
  });
}
