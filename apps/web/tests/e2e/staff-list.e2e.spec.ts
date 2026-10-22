// The staff kitchens list at 390 x 844, signed in by a real session planted on the test database: the cards, the segments,
// the debounced search, "Incarca mai multe", the hidden badge, what the list must not show, and the answer a client gets.
//
// The test database is shared, so every figure is read through a search for this run's marker (the planted client's
// address starts with it); nothing here counts the whole table. The world is removed in `afterAll`, which also proves
// that nothing is left.
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
  isApiListRequest,
  kitchenRows,
  openStaffList,
  pageScrollsSideways,
  searchBox,
  shootForReview,
  typeSearch,
} from "./support/staff-pages";

const SENT_KITCHENS = 25;
const PAGE_SIZE = 20;
const SEARCH_SETTLE_MARGIN_MS = 1500;
const THIS_RUNS_SENT_KITCHENS = SENT_KITCHENS + 1;

let world: StaffWorld;
let visitorDraftId = "";
let clientDeletedId = "";
let hiddenId = "";

test.beforeAll(async () => {
  test.setTimeout(120_000);
  world = await plantStaffWorld();
  await plantSentKitchen(world, {
    name: `${world.marker} cu cerere`,
    status: "contacted",
    notes: ["Prima nota", "A doua nota", "A treia nota"],
  });
  await Promise.all(
    Array.from({ length: SENT_KITCHENS - 1 }, (_, index) =>
      plantSentKitchen(world, {
        name: `${world.marker} bucatarie ${String(index + 2).padStart(2, "0")}`,
        hasRequest: false,
      }),
    ),
  );
  hiddenId = await plantOtherKitchen(
    world,
    "hidden",
    `${world.marker} ascunsa`,
  );
  clientDeletedId = await plantOtherKitchen(
    world,
    "client-deleted",
    `${world.marker} stearsa`,
  );
  // Planted last, so a list that showed it would show it on the first page of "Toate".
  visitorDraftId = await plantOtherKitchen(
    world,
    "visitor-draft",
    `${world.marker} ciorna de vizitator`,
  );
});

test.afterAll(async () => {
  const { left } = await removeStaffWorld(world);
  expect(left, "rows left behind by the world").toEqual(NOTHING_LEFT);
});

/** Searches for the marker and waits until the list holds exactly this run's sent kitchens: the unsearched list shows
 *  twenty rows too, so counting rows alone cannot tell the search has landed. */
async function searchForThisRun(page: Page): Promise<void> {
  await openStaffList(page);
  await searchBox(page).fill(world.marker);
  await expect(page.getByTestId("staff-kitchens-count")).toHaveText(
    romanian("staffKitchens.countSent", { count: THIS_RUNS_SENT_KITCHENS }),
  );
}

test.describe("the list as an operator", () => {
  test.beforeEach(async ({ context }) => {
    await signIn(context, world.operator);
  });

  test("a typed search asks the server once, after the typing settles, and finds this run's sent kitchens", async ({
    page,
  }) => {
    await openStaffList(page);
    await expect(kitchenRows(page).first()).toBeVisible();
    const searchesAsked: string[] = [];
    page.on("request", (request) => {
      if (isApiListRequest(request.url())) searchesAsked.push(request.url());
    });

    await typeSearch(page, world.marker);

    await expect(page.getByTestId("staff-kitchens-count")).toHaveText(
      romanian("staffKitchens.countSent", { count: SENT_KITCHENS + 1 }),
    );
    await page.waitForTimeout(SEARCH_SETTLE_MARGIN_MS);
    expect(searchesAsked, "one request for the eight keys typed").toHaveLength(
      1,
    );
    expect(new URL(searchesAsked[0] ?? "").searchParams.get("q")).toBe(
      world.marker,
    );
  });

  test("the cards hold the first twenty, the hidden one wears its badge, and 'Incarca mai multe' adds the rest", async ({
    page,
  }) => {
    await searchForThisRun(page);
    await expect(page.getByTestId("staff-kitchens-cards")).toBeVisible();
    await expect(kitchenRows(page)).toHaveCount(PAGE_SIZE);
    await shootForReview(page, "mobile-list-first-page");

    await page
      .getByRole("button", { name: romanian("staffKitchens.loadMore") })
      .click();

    await expect(kitchenRows(page)).toHaveCount(SENT_KITCHENS + 1);
    await expect(
      page.getByText(romanian("staffKitchens.badgeHidden"), { exact: true }),
    ).toHaveCount(1);
    await expect(page.getByText(`${world.marker} ascunsa`)).toBeVisible();
    await expect(page.getByText(`${world.marker} stearsa`)).toHaveCount(0);
    expect(await pageScrollsSideways(page), "a horizontal page scroll").toBe(
      false,
    );
    await shootForReview(page, "mobile-list-all-loaded");
  });

  test("'Ciorne' shows none of this run's kitchens, its status filter is off, and 'Toate' counts the sent ones", async ({
    page,
  }) => {
    await searchForThisRun(page);

    await page
      .locator("label")
      .filter({ hasText: romanian("staffKitchens.segmentDrafts") })
      .click();

    await expect(page.getByTestId("staff-kitchens-no-results")).toBeVisible();
    await expect(
      page.getByLabel(romanian("staffKitchens.statusLabel")),
    ).toBeDisabled();
    await page
      .locator("label")
      .filter({ hasText: romanian("staffKitchens.segmentAll") })
      .click();
    await expect(page.getByTestId("staff-kitchens-count")).toHaveText(
      romanian("staffKitchens.countAll", { count: SENT_KITCHENS + 1 }),
    );
    await shootForReview(page, "mobile-list-no-results-then-all");
  });

  test("the request status filter keeps the one kitchen with a saved status", async ({
    page,
  }) => {
    await searchForThisRun(page);

    await page
      .getByLabel(romanian("staffKitchens.statusLabel"))
      .selectOption("contacted");

    await expect(kitchenRows(page)).toHaveCount(1);
    await expect(kitchenRows(page).first()).toContainText(
      `${world.marker} cu cerere`,
    );
    await expect(kitchenRows(page).first()).toContainText(
      romanian("staffKitchens.statusContacted"),
    );
  });

  test("the first page of 'Toate' lists the hidden kitchen and never the client-deleted one or the visitor's draft", async ({
    context,
  }) => {
    const answer = await context.request.get(
      "/api/staff/kitchens?segment=all&page=1",
    );

    expect(answer.status()).toBe(200);
    const ids = (
      (await answer.json()) as { kitchens: readonly { id: string }[] }
    ).kitchens.map(({ id }) => id);
    expect(ids, "the hidden kitchen is listed").toContain(hiddenId);
    expect(ids).not.toContain(clientDeletedId);
    expect(ids).not.toContain(visitorDraftId);
  });
});

test.describe("the list as a client", () => {
  test("is the account area's forbidden page, HTTP 200, and never names the staff area", async ({
    context,
    page,
  }) => {
    await signIn(context, world.client);

    const response = await page.goto("/ro/staff/kitchens");

    expect(response?.status()).toBe(200);
    await expect(
      page.getByText(romanian("accountForbidden.title")),
    ).toBeVisible();
    const visibleText = await page.locator("body").innerText();
    expect(visibleText).not.toMatch(
      /staff|personalului|operator|administrator/i,
    );
    expect(await page.title()).not.toMatch(/staff|personalului/i);
    await shootForReview(page, "mobile-list-client-forbidden");
  });

  test("gets nothing from the staff list route", async ({ context }) => {
    await signIn(context, world.client);

    const answer = await context.request.get("/api/staff/kitchens");

    expect(answer.status()).toBe(403);
    expect(await answer.text()).not.toContain(world.marker);
  });
});
