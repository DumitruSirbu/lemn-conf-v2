// The staff kitchens list on a desktop, signed in by a real session planted on the test database: the table, the numbered
// pages, and the layout at the widths the table must survive (1920, 1440, 1280, 1000 and 900) in one test, so the
// desktop line pays for one test and not five.
//
// Every figure is read through a search for this run's marker, as in `staff-list.e2e.spec.ts`; the world is removed in
// `afterAll`, which proves nothing is left.
import { expect, test, type Page } from "@playwright/test";

import {
  NOTHING_LEFT,
  plantOtherKitchen,
  plantSentKitchen,
  plantStaffWorld,
  removeStaffWorld,
  romanian,
  signIn,
  type StaffWorld,
} from "./support/staff-world";
import {
  kitchenRows,
  openStaffList,
  pageScrollsSideways,
  searchBox,
  shootForReview,
} from "./support/staff-pages";

const SENT_KITCHENS = 25;
const PAGE_SIZE = 20;

/** Wide to narrow: the last two sit either side of the 900 px width where the stylesheet turns the table on. */
const WIDTHS: readonly { readonly width: number; readonly height: number }[] = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1000, height: 800 },
  { width: 900, height: 800 },
];

let world: StaffWorld;

test.beforeAll(async () => {
  test.setTimeout(120_000);
  world = await plantStaffWorld();
  await plantSentKitchen(world, {
    name: `${world.marker} cu cerere si un nume lung care trebuie sa incapa pe cel mult doua randuri in coloana`,
    status: "offer-sent",
  });
  await Promise.all(
    Array.from({ length: SENT_KITCHENS - 1 }, (_, index) =>
      plantSentKitchen(world, {
        name: `${world.marker} bucatarie ${String(index + 2).padStart(2, "0")}`,
        hasRequest: false,
      }),
    ),
  );
  await plantOtherKitchen(world, "hidden", `${world.marker} ascunsa`);
});

test.afterAll(async () => {
  const { left } = await removeStaffWorld(world);
  expect(left, "rows left behind by the world").toEqual(NOTHING_LEFT);
});

test.beforeEach(async ({ context }) => {
  await signIn(context, world.operator);
});

test("the table lists twenty rows, the numbered pages lead to the last six, and the shell names the role and the one page an operator has", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openStaffList(page);
  await searchBox(page).fill(world.marker);
  await expect(page.getByTestId("staff-kitchens-count")).toHaveText(
    romanian("staffKitchens.countSent", { count: SENT_KITCHENS + 1 }),
  );
  await expect(page.getByTestId("staff-kitchens-table")).toBeVisible();
  await expect(kitchenRows(page)).toHaveCount(PAGE_SIZE);
  await expect(
    page.getByText(romanian("staffKitchens.badgeHidden"), { exact: true }),
  ).toHaveCount(1);
  await expect(page.getByTestId("staff-role-chip")).toHaveText(
    romanian("staffShell.roleOperator"),
  );
  await expect(page.getByTestId("staff-nav").getByRole("link")).toHaveText([
    romanian("staffShell.navKitchens"),
  ]);

  await page
    .getByRole("button", {
      name: romanian("staffKitchens.pageNumber", { page: 2 }),
    })
    .click();

  await expect(kitchenRows(page)).toHaveCount(SENT_KITCHENS + 1 - PAGE_SIZE);
  await expect(page.getByTestId("staff-kitchens-count")).toBeFocused();
  await expect(
    page.getByText(
      romanian("staffKitchens.showing", { from: 21, to: 26, total: 26 }),
    ),
  ).toBeVisible();
  await expect(
    page.getByText(romanian("staffKitchens.badgeHidden"), { exact: true }),
    "the newest sent kitchen is the hidden one, on the first page",
  ).toHaveCount(0);
  await shootForReview(page, "desktop-list-page-2-1920");
});

test("at every width from 1920 to 900 the page never scrolls sideways and the table's region ends inside the window (the region itself may scroll)", async ({
  page,
}) => {
  await openStaffList(page);
  await searchBox(page).fill(world.marker);
  await expect(page.getByTestId("staff-kitchens-count")).toHaveText(
    romanian("staffKitchens.countSent", { count: SENT_KITCHENS + 1 }),
  );
  await expect(page.getByTestId("staff-kitchens-table")).toBeVisible();

  for (const size of WIDTHS) {
    await page.setViewportSize(size);
    await expect(page.getByTestId("staff-kitchens-table")).toBeVisible();

    const measured = await measureTable(page);

    expect(
      await pageScrollsSideways(page),
      `${String(size.width)} px: a horizontal scroll bar on the page`,
    ).toBe(false);
    expect(
      measured.regionRight,
      `${String(size.width)} px: the table's region reaches past the window`,
    ).toBeLessThanOrEqual(size.width);
    test.info().annotations.push({
      type: "table-region",
      description: `${String(size.width)} px: the region ${measured.regionScrolls ? "scrolls" : "holds the whole table"}`,
    });
    await shootForReview(page, `desktop-list-${String(size.width)}`);
  }

  await page.setViewportSize({ width: 899, height: 800 });
  await expect(page.getByTestId("staff-kitchens-cards")).toBeVisible();
  expect(await pageScrollsSideways(page), "899 px, the cards").toBe(false);
  await shootForReview(page, "desktop-list-899-cards");
});

interface TableMeasure {
  readonly regionRight: number;
  /** The table is wider than the region that holds it, so the region scrolls: its job, and worth a word in the report. */
  readonly regionScrolls: boolean;
}

function measureTable(page: Page): Promise<TableMeasure> {
  return page.evaluate(() => {
    const region = document.querySelector(
      '[data-testid="staff-kitchens-table"]',
    )?.parentElement;
    if (region === null || region === undefined) {
      throw new Error("the table's region is not on the page");
    }
    return {
      regionRight: region.getBoundingClientRect().right,
      regionScrolls: region.scrollWidth > region.clientWidth,
    };
  });
}
