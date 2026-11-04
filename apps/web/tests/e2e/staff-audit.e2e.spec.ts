// The audit log at 390 x 844, signed in as the administrator by a real session planted on the test database: the cards,
// "Incarca mai multe", the administrator's "Meniu" sheet with both pages, and the refusals an operator and a client get
// from the page and from the route. The desktop half is `staff-audit.desktop.e2e.spec.ts`.
//
// The log is shared by every spec, so each figure is read through the person filter. The world is removed in `afterAll`,
// which proves nothing is left behind.
import { expect, test } from "@playwright/test";

import {
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

test("the administrator's cards load twenty-five rows and 'Incarca mai multe' adds the operator's last five", async ({
  context,
  page,
}) => {
  await signIn(context, world.administrator);
  await openAuditChoosingPerson(page, world.operator.accountId);
  await expect(page.getByTestId("staff-audit-cards")).toBeVisible();
  await expect(page.getByTestId("staff-audit-row")).toHaveCount(PAGE_SIZE);
  await shootForReview(page, "mobile-audit-first-page");

  await page
    .getByRole("button", { name: romanian("staffKitchens.loadMore") })
    .click();

  await expect(page.getByTestId("staff-audit-row")).toHaveCount(OPERATOR_ROWS);
  expect(await pageScrollsSideways(page), "a horizontal page scroll").toBe(
    false,
  );
  await shootForReview(page, "mobile-audit-all-loaded");
});

test("the administrator's 'Meniu' sheet holds both pages", async ({
  context,
  page,
}) => {
  await signIn(context, world.administrator);
  await page.goto(STAFF_AUDIT_PATH);
  await expect(page.getByTestId("staff-audit-page")).toBeVisible();

  await page.getByTestId("staff-menu-button").click();

  const sheet = page.getByTestId("staff-menu-sheet");
  // The catalogue groups sit between the two (U1, U5), so the pages this spec is about are the menu's first and last.
  const links = sheet.getByRole("navigation").getByRole("link");
  await expect(links.first()).toHaveText(romanian("staffShell.navKitchens"));
  await expect(links.last()).toHaveText(romanian("staffShell.navAudit"));
  await expect(sheet).toContainText(romanian("staffShell.roleAdministrator"));
  await shootForReview(page, "mobile-audit-menu");
});

test("an operator is shown the forbidden screen inside the staff frame, and the route answers 403", async ({
  context,
  page,
}) => {
  await signIn(context, world.operator);

  const response = await page.goto(STAFF_AUDIT_PATH);

  expect(response?.status()).toBe(200);
  await expect(
    page.getByText(romanian("accountForbidden.title")),
  ).toBeVisible();
  await expect(page.getByTestId("staff-menu-button")).toBeVisible();
  await expect(page.getByTestId("staff-audit-page")).toHaveCount(0);
  const route = await context.request.get("/api/staff/audit");
  expect(route.status()).toBe(403);
  expect(await route.text()).not.toContain(world.marker);
  await shootForReview(page, "mobile-audit-operator-forbidden");
});

test("a client is shown the account area's forbidden page without a word of the staff area, and the route answers 403", async ({
  context,
  page,
}) => {
  await signIn(context, world.client);

  const response = await page.goto(STAFF_AUDIT_PATH);

  expect(response?.status()).toBe(200);
  await expect(
    page.getByText(romanian("accountForbidden.title")),
  ).toBeVisible();
  expect(await page.locator("body").innerText()).not.toMatch(
    /staff|personalului|jurnal de audit/i,
  );
  const route = await context.request.get("/api/staff/audit");
  expect(route.status()).toBe(403);
});
