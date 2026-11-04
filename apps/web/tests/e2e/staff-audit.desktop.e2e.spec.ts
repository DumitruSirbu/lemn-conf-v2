// The audit log on a desktop, signed in as the administrator by a real session planted on the test database: the table with
// the rows the operator's and the administrator's actions left, a row the application wrote while the spec ran, the
// numbered pages, the filters, and the widths the table must survive. An operator is shown the forbidden screen inside the
// staff frame.
//
// The log is shared by every spec and every person, so each figure is read through the person filter, which holds only
// the people this run planted. The world is removed in `afterAll`, which proves nothing is left, the rows the application
// wrote included.
import { expect, test } from "@playwright/test";

import {
  ADMINISTRATOR_NOTE_ROWS,
  NOTHING_LEFT,
  OPERATOR_LISTED_ROWS,
  OPERATOR_OPENED_ROWS,
  plantAuditScenario,
  plantStaffWorld,
  removeStaffWorld,
  romanian,
  signIn,
  type StaffWorld,
} from "./support/staff-world";
import {
  openAuditChoosingPerson,
  pageScrollsSideways,
  shootForReview,
  STAFF_AUDIT_PATH,
  todayInChisinau,
} from "./support/staff-pages";

const OPERATOR_ROWS = OPERATOR_OPENED_ROWS + OPERATOR_LISTED_ROWS;
const PAGE_SIZE = 25;

let world: StaffWorld;

test.beforeAll(async () => {
  test.setTimeout(120_000);
  world = await plantStaffWorld();
  await plantAuditScenario(world);
});

test.afterAll(async () => {
  const { left } = await removeStaffWorld(world);
  expect(left, "rows left behind by the world").toEqual(NOTHING_LEFT);
});

test.describe("as the administrator", () => {
  test.beforeEach(async ({ context }) => {
    await signIn(context, world.administrator);
  });

  test("the table has a full page of rows, the role chip, and a nav holding both pages", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(STAFF_AUDIT_PATH);

    await expect(page.getByTestId("staff-audit-table")).toBeVisible();
    await expect(page.getByTestId("staff-audit-row")).toHaveCount(PAGE_SIZE);
    await expect(page.getByTestId("staff-role-chip")).toHaveText(
      romanian("staffShell.roleAdministrator"),
    );
    // The catalogue groups sit between the two (U1, U5), so the pages this spec is about are the nav's first and last.
    const links = page.getByTestId("staff-nav").getByRole("link");
    await expect(links.first()).toHaveText(romanian("staffShell.navKitchens"));
    await expect(links.last()).toHaveText(romanian("staffShell.navAudit"));
    await expect(
      page.getByText(romanian("staffAudit.readOnlyNote")),
    ).toBeVisible();
    await shootForReview(page, "desktop-audit-1920");
  });

  test("a row names who did what to which kitchen", async ({ page }) => {
    await openAuditChoosingPerson(page, world.administrator.accountId);
    await page
      .getByLabel(romanian("staffAudit.filterAction"))
      .selectOption("note-added");

    await expect(page.getByTestId("staff-audit-row")).toHaveCount(
      ADMINISTRATOR_NOTE_ROWS,
    );
    const row = page.getByTestId("staff-audit-row").first();
    await expect(row).toContainText(world.administrator.email);
    await expect(row).toContainText(romanian("staffAudit.actionNoteAdded"));
    await expect(row).toContainText(`${world.marker} jurnal`);
    await expect(row).toContainText(world.client.email);
  });

  test("the person filter keeps the operator's thirty rows, two pages of them, and the action and day filters narrow them", async ({
    page,
  }) => {
    await openAuditChoosingPerson(page, world.operator.accountId);
    const person = page.getByLabel(romanian("staffAudit.filterPerson"));

    await expect(page.getByTestId("staff-audit-showing")).toHaveText(
      romanian("staffKitchens.showing", {
        from: 1,
        to: PAGE_SIZE,
        total: OPERATOR_ROWS,
      }),
    );
    await page
      .getByRole("button", {
        name: romanian("staffKitchens.pageNumber", { page: 2 }),
      })
      .click();
    await expect(page.getByTestId("staff-audit-row")).toHaveCount(
      OPERATOR_ROWS - PAGE_SIZE,
    );
    await page
      .getByLabel(romanian("staffAudit.filterAction"))
      .selectOption("kitchens-listed");
    await expect(page.getByTestId("staff-audit-row")).toHaveCount(
      OPERATOR_LISTED_ROWS,
    );
    const today = todayInChisinau();
    await page.getByLabel(romanian("staffAudit.filterFrom")).fill(today);
    await page.getByLabel(romanian("staffAudit.filterTo")).fill(today);
    await expect(page.getByTestId("staff-audit-row")).toHaveCount(
      OPERATOR_LISTED_ROWS,
    );
    await page.getByLabel(romanian("staffAudit.filterFrom")).fill("2026-01-01");
    await page.getByLabel(romanian("staffAudit.filterTo")).fill("2026-01-01");
    await expect(page.getByTestId("staff-audit-no-results")).toBeVisible();
    await shootForReview(page, "desktop-audit-no-results");

    await page
      .getByRole("button", { name: romanian("staffAudit.clearFilters") })
      .click();

    await expect(page.getByTestId("staff-audit-row").first()).toBeVisible();
    await expect(person).toHaveValue("");
  });

  test("a list the operator asks for appears as one more row of the operator, and the page never scrolls sideways from 1920 to 900", async ({
    browser,
    page,
  }) => {
    const operatorContext = await browser.newContext();
    try {
      await signIn(operatorContext, world.operator);
      const listed = await operatorContext.request.get("/api/staff/kitchens");
      expect(listed.status()).toBe(200);
    } finally {
      await operatorContext.close();
    }
    await openAuditChoosingPerson(page, world.operator.accountId);
    await page
      .getByLabel(romanian("staffAudit.filterAction"))
      .selectOption("kitchens-listed");

    await expect(page.getByTestId("staff-audit-row")).toHaveCount(
      OPERATOR_LISTED_ROWS + 1,
    );

    for (const width of [1920, 1440, 1280, 1000, 900]) {
      await page.setViewportSize({ width, height: 800 });
      await expect(page.getByTestId("staff-audit-table")).toBeVisible();
      expect(
        await pageScrollsSideways(page),
        `${String(width)} px: a horizontal scroll bar on the page`,
      ).toBe(false);
      await shootForReview(page, `desktop-audit-${String(width)}`);
    }
  });
});

test("an operator is shown the forbidden screen inside the staff frame, with the one page it has, and HTTP 200", async ({
  context,
  page,
}) => {
  await signIn(context, world.operator);

  const response = await page.goto(STAFF_AUDIT_PATH);

  expect(response?.status()).toBe(200);
  await expect(
    page.getByText(romanian("accountForbidden.title")),
  ).toBeVisible();
  await expect(page.getByTestId("staff-role-chip")).toBeVisible();
  await expect(page.getByTestId("staff-nav").getByRole("link")).toHaveText([
    romanian("staffShell.navKitchens"),
  ]);
  await expect(page.getByTestId("staff-audit-page")).toHaveCount(0);
  await shootForReview(page, "desktop-audit-operator-forbidden");
});
