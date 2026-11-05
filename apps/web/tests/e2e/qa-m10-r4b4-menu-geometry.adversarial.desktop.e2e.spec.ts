// Adversarial QA of where a row's menu opens in the three item lists, one pixel either side of each list's table
// breakpoint (accessories 1100, materials 1200, hardware 1440), for every row of the list including the last, with a
// created row whose name is long, wraps or does not break at all: the open menu stays inside the window, covers none
// of its own row's controls or chips and none of the next row's three dots or edit link, every one of its entries is
// what a pointer lands on, and the keyboard reaches it and closes it. Nothing here publishes.
import {
  countStaffFixturesForTests,
  removeStaffFixturesForTests,
} from "@lemnaria/persistence";
import { expect, type Locator, type Page } from "@playwright/test";

import {
  type CreateNamed,
  createLongNamedAccessory,
  createLongNamedClass,
} from "./support/qa-m10-r4b4-long-named-creation";
import {
  chipsOf as accessoryChipsOf,
  menuButtonOf as accessoryMenuButtonOf,
  menuOf as accessoryMenuOf,
  openAccessoryList,
  rowsOf as accessoryRowsOf,
  warmAccessoryRoutes,
} from "./support/accessory-page";
import {
  type Box,
  boxOf,
  chipsOf as hardwareChipsOf,
  menuButtonOf as hardwareMenuButtonOf,
  menuOf as hardwareMenuOf,
  openHardwareList,
  rowsOf as hardwareRowsOf,
  warmHardwareRoutes,
} from "./support/hardware-page";
import {
  chipsOf as materialChipsOf,
  menuButtonOf as materialMenuButtonOf,
  menuOf as materialMenuOf,
  openMaterialList,
  rowsOf as materialRowsOf,
  warmMaterialRoutes,
} from "./support/material-page";
import {
  discardDraft,
  expectNoSidewaysScroll,
  priceRateLimitKeysOf,
  test,
} from "./support/price-dashboard-session";
import { holdPriceDraft, releasePriceDraft } from "./support/price-draft-lock";
import {
  NOTHING_LEFT,
  plantSignedInAdministrator,
  signIn,
  type SignedInAdministrator,
} from "./support/staff-world";

interface ListScreen {
  readonly name: string;
  readonly tableFromPx: number;
  readonly open: (page: Page) => Promise<void>;
  readonly rowsOf: (page: Page) => Locator;
  readonly chipsOf: (row: Locator) => Locator;
  readonly menuButtonOf: (row: Locator) => Locator;
  readonly menuOf: (row: Locator) => Locator;
  /** Makes a created row whose name is the one given, or none for a list nobody can create in. */
  readonly createNamed: CreateNamed | undefined;
}

const HEIGHT = 900;
const POPOVER_FROM_PX = 900;
const WIDE_PX = 1920;
const FILES_TAKE_TURNS_MS = 600_000;
const EIGHTY_CHARACTERS_WITH_SPACES =
  "Un nume foarte lung de rand creat care trebuie sa se rupa in mai multe randuri aici".slice(
    0,
    80,
  );
const EIGHTY_CHARACTERS_WITHOUT_A_BREAK = "W".repeat(80);
const SCREEN_PIXEL_SLACK = 0.5;
/** The menu positioned against its three dots, at the top of the row, which is where it opened before it moved. */
const MENU_BESIDE_THE_DOTS = `
  div:has(> ul[id][aria-label]) { position: relative !important; }
  ul[id][aria-label] { top: 0 !important; left: auto !important; right: calc(100% + 8px) !important; }
`;

const SCREENS: readonly ListScreen[] = [
  {
    name: "accessories",
    tableFromPx: 1100,
    open: openAccessoryList,
    rowsOf: accessoryRowsOf,
    chipsOf: accessoryChipsOf,
    menuButtonOf: accessoryMenuButtonOf,
    menuOf: accessoryMenuOf,
    createNamed: createLongNamedAccessory,
  },
  {
    name: "materials",
    tableFromPx: 1200,
    open: openMaterialList,
    rowsOf: materialRowsOf,
    chipsOf: materialChipsOf,
    menuButtonOf: materialMenuButtonOf,
    menuOf: materialMenuOf,
    createNamed: undefined,
  },
  {
    name: "hardware",
    tableFromPx: 1440,
    open: openHardwareList,
    rowsOf: hardwareRowsOf,
    chipsOf: hardwareChipsOf,
    menuButtonOf: hardwareMenuButtonOf,
    menuOf: hardwareMenuOf,
    createNamed: createLongNamedClass,
  },
];

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

test.beforeEach(async ({ context }) => {
  await signIn(context, signedIn.administrator);
  await discardDraft(context);
});

test.afterEach(async ({ context }) => {
  await discardDraft(context);
});

for (const screen of SCREENS) {
  const widths = [
    POPOVER_FROM_PX,
    screen.tableFromPx - 1,
    screen.tableFromPx,
    screen.tableFromPx + 1,
    WIDE_PX,
  ];
  for (const width of widths) {
    test(`${screen.name} at ${String(width)}: the menu of every seeded row clears what it must and every entry takes a pointer`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: HEIGHT });
      await screen.open(page);

      const failures = await sweepEveryRow(page, screen, width);

      expect(failures).toEqual([]);
    });

    if (screen.createNamed === undefined) continue;
    const createNamed = screen.createNamed;
    for (const [kind, name] of [
      ["with spaces", EIGHTY_CHARACTERS_WITH_SPACES],
      ["with no break", EIGHTY_CHARACTERS_WITHOUT_A_BREAK],
    ] as const) {
      test(`${screen.name} at ${String(width)}: a created row named at 80 characters ${kind} keeps its menu clear of its chips`, async ({
        page,
        context,
      }) => {
        await page.setViewportSize({ width, height: HEIGHT });
        await createNamed(page, context, name);
        await screen.open(page);

        const failures = await sweepEveryRow(page, screen, width);

        expect(failures).toEqual([]);
      });
    }
  }

  if (screen.createNamed !== undefined) {
    const createNamed = screen.createNamed;
    test(`${screen.name}: control, the sweep reports a menu drawn beside the dots as it was before, over the row's own chip`, async ({
      page,
      context,
    }) => {
      await page.setViewportSize({ width: screen.tableFromPx, height: HEIGHT });
      await createNamed(page, context, EIGHTY_CHARACTERS_WITH_SPACES);
      await screen.open(page);
      await page.addStyleTag({ content: MENU_BESIDE_THE_DOTS });

      const failures = await sweepEveryRow(page, screen, screen.tableFromPx);

      expect(failures.join("\n")).toContain("covers its own chip");
    });
  }

  test(`${screen.name}: the keyboard opens the last row's menu, reaches an entry inside the window, and Escape closes it and returns to the dots`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: screen.tableFromPx, height: HEIGHT });
    await screen.open(page);
    const rows = screen.rowsOf(page);
    const last = rows.nth((await rows.count()) - 1);
    const dots = screen.menuButtonOf(last);

    await dots.focus();
    await page.keyboard.press("Enter");
    await expect(screen.menuOf(last)).toBeVisible();
    await page.keyboard.press("Tab");

    const reached = last.locator(":focus");
    await expect(reached, "Tab lands on an entry of the menu").toHaveCount(1);
    expect(
      await screen
        .menuOf(last)
        .evaluate((menu) => menu.contains(document.activeElement)),
    ).toBe(true);
    const entryBox = await boxOf(reached);
    expect(
      entryBox.y,
      "the focused entry is below the window's top",
    ).toBeGreaterThanOrEqual(0);
    expect(
      entryBox.y + entryBox.height,
      "the focused entry is inside the window",
    ).toBeLessThanOrEqual(HEIGHT + SCREEN_PIXEL_SLACK);

    await page.keyboard.press("Escape");

    await expect(screen.menuOf(last)).toHaveCount(0);
    await expect(dots).toBeFocused();
  });

  test(`${screen.name}: Escape on the dots themselves closes an open menu`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: screen.tableFromPx, height: HEIGHT });
    await screen.open(page);
    const first = screen.rowsOf(page).first();
    const dots = screen.menuButtonOf(first);

    await dots.click();
    await expect(screen.menuOf(first)).toBeVisible();
    await dots.focus();
    await page.keyboard.press("Escape");

    await expect(screen.menuOf(first)).toHaveCount(0);
    await expect(dots).toBeFocused();
  });

  test(`${screen.name}: opening the menu of the next row closes the first, and never leaves two open`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: screen.tableFromPx, height: HEIGHT });
    await screen.open(page);
    const rows = screen.rowsOf(page);

    await screen.menuButtonOf(rows.nth(0)).click();
    await expect(screen.menuOf(rows.nth(0))).toBeVisible();
    await screen.menuButtonOf(rows.nth(1)).click();

    await expect(screen.menuOf(rows.nth(1))).toBeVisible();
    await expect(page.locator("ul[id][aria-label]:visible")).toHaveCount(1);
  });
}

async function sweepEveryRow(
  page: Page,
  screen: ListScreen,
  width: number,
): Promise<string[]> {
  const failures: string[] = [];
  const rows = screen.rowsOf(page);
  const rowCount = await rows.count();
  for (let place = 0; place < rowCount; place += 1) {
    const row = rows.nth(place);
    const next = place + 1 < rowCount ? rows.nth(place + 1) : undefined;
    const where = `${screen.name} ${String(width)} row ${String(place + 1)}/${String(rowCount)}`;
    await screen.menuButtonOf(row).click();
    await expect(screen.menuOf(row)).toBeVisible();
    failures.push(...(await menuFailures({ page, screen, row, next, where })));
    await page.keyboard.press("Escape");
    await expect(screen.menuOf(row)).toHaveCount(0);
  }
  return failures;
}

interface OpenMenu {
  readonly page: Page;
  readonly screen: ListScreen;
  readonly row: Locator;
  readonly next: Locator | undefined;
  readonly where: string;
}

async function menuFailures({
  page,
  screen,
  row,
  next,
  where,
}: OpenMenu): Promise<string[]> {
  const failures: string[] = [];
  const menu = screen.menuOf(row);
  const menuBox = await boxOf(menu);
  const windowWidth = page.viewportSize()?.width ?? 0;

  if (
    menuBox.x < 0 ||
    menuBox.x + menuBox.width > windowWidth + SCREEN_PIXEL_SLACK
  ) {
    failures.push(
      `${where}: the menu ${show(menuBox)} leaves the window of ${String(windowWidth)}`,
    );
  }
  const covered = await coveredBoxes({ screen, row, next, menuBox });
  failures.push(...covered.map((line) => `${where}: ${line}`));
  failures.push(...(await unreachableEntries(menu, where)));
  failures.push(...(await sidewaysScrollFailures(page, where)));
  return failures;
}

interface CoverCheck {
  readonly screen: ListScreen;
  readonly row: Locator;
  readonly next: Locator | undefined;
  readonly menuBox: Box;
}

async function coveredBoxes({
  screen,
  row,
  next,
  menuBox,
}: CoverCheck): Promise<string[]> {
  const mustStayClear: [string, Locator][] = [
    ["its own chip", screen.chipsOf(row)],
    ["its own edit link", row.locator("a[aria-labelledby]")],
    ["its own three dots", screen.menuButtonOf(row)],
  ];
  if (next !== undefined) {
    mustStayClear.push(
      ["the next row's three dots", screen.menuButtonOf(next)],
      ["the next row's edit link", next.locator("a[aria-labelledby]")],
    );
  }
  const lines: string[] = [];
  for (const [what, locator] of mustStayClear) {
    for (const element of await locator.all()) {
      const box = await element.boundingBox();
      if (box !== null && shareGround(menuBox, box)) {
        lines.push(`the menu ${show(menuBox)} covers ${what} ${show(box)}`);
      }
    }
  }
  return lines;
}

async function unreachableEntries(
  menu: Locator,
  where: string,
): Promise<string[]> {
  const lines: string[] = [];
  const entries = menu.getByRole("button");
  const entryCount = await entries.count();
  if (entryCount === 0) lines.push(`${where}: the menu offers no entry`);
  for (let place = 0; place < entryCount; place += 1) {
    const entry = entries.nth(place);
    await entry.scrollIntoViewIfNeeded();
    const isHit = await entry.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const top = document.elementFromPoint(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2,
      );
      return top !== null && element.contains(top);
    });
    if (!isHit)
      lines.push(
        `${where}: entry ${String(place + 1)} of the menu is not what a pointer lands on`,
      );
  }
  return lines;
}

async function sidewaysScrollFailures(
  page: Page,
  where: string,
): Promise<string[]> {
  try {
    await expectNoSidewaysScroll(page, `${where}, menu open`);
    return [];
  } catch (error) {
    return [
      error instanceof Error ? (error.message.split("\n")[0] ?? where) : where,
    ];
  }
}

function shareGround(first: Box, second: Box): boolean {
  const across =
    Math.min(first.x + first.width, second.x + second.width) -
    Math.max(first.x, second.x);
  const down =
    Math.min(first.y + first.height, second.y + second.height) -
    Math.max(first.y, second.y);
  return across > 0 && down > 0;
}

function show(box: Box): string {
  return `[x ${box.x.toFixed(1)}, y ${box.y.toFixed(1)}, ${box.width.toFixed(1)} x ${box.height.toFixed(1)}]`;
}
