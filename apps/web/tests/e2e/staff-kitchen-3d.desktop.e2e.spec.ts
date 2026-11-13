// A kitchen in 3D as staff open it from its page, on a desktop, signed in by a session planted on the test database:
// the link opens a new tab that only reads and mints no share link, the page carries the staff headers, the other
// language keeps the person on the same view and copy, and a missing kitchen draws a notice. Nothing is left behind.
import { KITCHEN_L_DESIGN } from "@lemnaria/configurator-domain";
import { expect, test, type Request } from "@playwright/test";

import {
  countOf,
  NOTHING_LEFT,
  plantStaffWorld,
  plantSentKitchen,
  removeStaffWorld,
  romanian,
  saveKitchenAgain,
  signIn,
  type StaffWorld,
} from "./support/staff-world";
import { openStaffKitchen, shootForReview } from "./support/staff-pages";

const NO_SUCH_KITCHEN_ID = "z".repeat(21);
const SETTLE_MS = 3000;
const BODIES_SENT = 3;
const SENT_COPY = {
  ...KITCHEN_L_DESIGN,
  placements: KITCHEN_L_DESIGN.placements.slice(0, BODIES_SENT),
};
const CSP_REPORT_PATH = "/api/csp-reports";

let world: StaffWorld;
let kitchenId = "";
let changedKitchenId = "";

test.beforeAll(async () => {
  test.setTimeout(120_000);
  world = await plantStaffWorld();
  kitchenId = await plantSentKitchen(world, {
    name: `${world.marker} 3d`,
    status: "new",
  });
  changedKitchenId = await plantSentKitchen(world, {
    name: `${world.marker} modificata`,
    sentCopy: { document: SENT_COPY },
  });
  await saveKitchenAgain(world, changedKitchenId);
});

test.afterAll(async () => {
  const { left } = await removeStaffWorld(world);
  expect(left, "rows left behind by the world").toEqual(NOTHING_LEFT);
});

test.beforeEach(async ({ context }) => {
  await signIn(context, world.operator);
});

function isReadOrReport(request: Request): boolean {
  const { pathname } = new URL(request.url());
  return request.method() === "GET" || pathname === CSP_REPORT_PATH;
}

function reachesAForbiddenRoute(request: Request): boolean {
  const { pathname } = new URL(request.url());
  return (
    pathname.startsWith("/api/designs") ||
    pathname.startsWith("/api/contact-submissions")
  );
}

test("the link follows the version switch, opens that copy in a new tab, which only reads and mints no share link", async ({
  context,
  page,
}) => {
  const requests: Request[] = [];
  context.on("page", (view) => {
    view.on("request", (request) => requests.push(request));
  });
  await openStaffKitchen(page, changedKitchenId);
  const switchChoices = page
    .getByTestId("staff-kitchen-versions")
    .locator("label");
  await switchChoices.nth(0).click();
  await switchChoices.nth(1).click();
  const link = page.getByTestId("staff-kitchen-open-3d");
  await expect(link).toHaveAttribute(
    "href",
    `/ro/staff/kitchens/${changedKitchenId}/3d?version=current`,
  );
  const before = await countOf(world);

  const [view] = await Promise.all([
    context.waitForEvent("page"),
    link.click(),
  ]);
  await view.waitForLoadState("domcontentloaded");
  const canvas = view.locator("canvas").first();
  await expect(canvas).toBeVisible();
  await canvas.click();
  await view
    .getByRole("group", { name: romanian("configure.cameraGroupLabel") })
    .getByRole("button")
    .nth(1)
    .click();
  const settings = view.getByTestId("global-settings-trigger");
  await expect(settings).toBeDisabled();
  await expect(settings).toHaveAttribute(
    "data-disabled-reason",
    romanian("panel.readOnlyReason"),
  );
  await view
    .getByRole("group", { name: romanian("configure.cameraGroupLabel") })
    .getByRole("button")
    .nth(2)
    .click();
  await view.waitForTimeout(SETTLE_MS);

  const url = new URL(view.url());
  expect(url.pathname).toBe(`/ro/staff/kitchens/${changedKitchenId}/3d`);
  expect(url.search).toBe("?version=current");
  const after = await countOf(world);
  expect(after.staffAuditEvents - before.staffAuditEvents).toBe(1);
  expect(after.designShareLinks).toBe(before.designShareLinks);
  const reads = sceneReadsOf(requests, changedKitchenId);
  expect(reads).toHaveLength(1);
  expect(new URL(reads[0]?.url() ?? "").search).toBe("?version=current");
  expectNothingWritten(requests);
  await shootForReview(view, "desktop-kitchen-3d");

  await view.getByTestId("top-bar-locale").click();
  await view.getByTestId("top-bar-locale-option-ru").click();
  await expect(view).toHaveURL(
    new RegExp(`/ru/staff/kitchens/${changedKitchenId}/3d\\?version=current$`),
  );
  await expect(view.locator("canvas").first()).toBeVisible();
  await view.waitForTimeout(SETTLE_MS);
  expectNothingWritten(requests);
  await page.bringToFront();
  await expect(page.getByTestId("staff-kitchen-page")).toBeVisible();
});

function sceneReadsOf(
  requests: readonly Request[],
  designId: string,
): Request[] {
  return requests.filter((request) =>
    new URL(request.url()).pathname.endsWith(
      `/api/staff/kitchens/${designId}/3d`,
    ),
  );
}

function expectNothingWritten(requests: readonly Request[]): void {
  expect(requests.filter(reachesAForbiddenRoute).map((r) => r.url())).toEqual(
    [],
  );
  expect(
    requests.filter((request) => !isReadOrReport(request)).map((r) => r.url()),
  ).toEqual([]);
}

test("the 3D page carries the staff family's headers", async ({ page }) => {
  const response = await page.goto(`/ro/staff/kitchens/${kitchenId}/3d`);

  expect(response?.headers()["cache-control"]).toBe("private, no-store");
  expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
});

test("the other language keeps the person on the same kitchen's 3D view, behind the gate", async ({
  page,
}) => {
  await page.goto(`/ro/staff/kitchens/${kitchenId}/3d`);
  await expect(page.locator("canvas").first()).toBeVisible();

  await page.getByTestId("top-bar-locale").click();
  await page.getByTestId("top-bar-locale-option-ru").click();

  await expect(page).toHaveURL(
    new RegExp(`/ru/staff/kitchens/${kitchenId}/3d(\\?.*)?$`),
  );
  await expect(page.locator("canvas").first()).toBeVisible();
});

test("the other language keeps the copy the link named", async ({ page }) => {
  await page.goto(`/ro/staff/kitchens/${kitchenId}/3d?version=current`);
  await expect(page.locator("canvas").first()).toBeVisible();

  await page.getByTestId("top-bar-locale").click();
  await page.getByTestId("top-bar-locale-option-ru").click();

  await expect(page).toHaveURL(
    new RegExp(`/ru/staff/kitchens/${kitchenId}/3d\\?version=current$`),
  );
});

test("a kitchen that is not there draws the notice inside the staff frame, and no scene", async ({
  page,
}) => {
  await page.goto(`/ro/staff/kitchens/${NO_SUCH_KITCHEN_ID}/3d`);

  await expect(page.getByTestId("staff-kitchen-not-found")).toBeVisible();
  await expect(
    page.getByText(romanian("staffKitchen.notFoundTitle")),
  ).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
});
