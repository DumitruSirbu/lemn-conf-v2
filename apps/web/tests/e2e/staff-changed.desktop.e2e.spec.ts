// Kitchens the client changed after staff saw them, on a desktop, signed in by a real session planted on the test database:
// the badge and the order of the table's rows, "Doar modificate", the cycle of a kitchen that is changed, opened, and
// changed again, the version switch with both estimates in the three columns, and the estimate a price list cannot give.
//
// The phone half is `staff-changed.e2e.spec.ts`. The test database is shared, so every row is found through a
// search for this run's marker and nothing counts the whole table; the changed count beside the switch is the server's, over
// every kitchen of every run, so only its presence is read. The world is removed in `afterAll`, which proves nothing is
// left behind, the seen marks the application wrote included.
import { expect, test, type Page } from "@playwright/test";

import {
  BODIES_NOW,
  BODIES_SENT,
  KITCHENS_OF_THE_WORLD,
  plantChangedWorld,
  type ChangedWorld,
} from "./support/staff-changed-world";
import {
  countOf,
  NOTHING_LEFT,
  removeStaffWorld,
  romanian,
  saveKitchenAgain,
  signIn,
} from "./support/staff-world";
import {
  expectKitchensLinkWearsCount,
  KITCHENS_LINK_COUNT_WAIT_MS,
  kitchenRows,
  openStaffList,
  pageScrollsSideways,
  searchBox,
  shootForReview,
} from "./support/staff-pages";

/** The sent choice of the version switch is named by its words up to the day, which the page tells. */
const sentChoiceName = new RegExp(
  `^${romanian("staffChanges.versionSent", { date: "" })}`,
  "u",
);

/** The sub-line of a kitchen seen before it changed, up to the first time it names and between the two. */
const [SEEN_LEAD, CHANGED_AGAIN_LEAD] = romanian(
  "staffChanges.seenAndChangedAgain",
  { seen: "", changed: "" },
).split(" · ");

const SEEN_ROUTE_COMPILE_TIMEOUT_MS = 20_000;

let scenario: ChangedWorld;

test.beforeAll(async () => {
  test.setTimeout(120_000);
  scenario = await plantChangedWorld();
});

test.afterAll(async () => {
  const { left } = await removeStaffWorld(scenario.world);
  expect(left, "rows left behind by the world").toEqual(NOTHING_LEFT);
});

test.beforeEach(async ({ context }) => {
  await signIn(context, scenario.world.operator);
  // Each test starts from a changed kitchen, whatever an earlier one marked.
  await saveKitchenAgain(scenario.world, scenario.changed.id);
});

async function searchForThisRun(page: Page): Promise<void> {
  await openStaffList(page);
  await searchBox(page).fill(scenario.world.marker);
  await expect(page.getByTestId("staff-kitchens-count")).toHaveText(
    romanian("staffKitchens.countSent", { count: KITCHENS_OF_THE_WORLD }),
  );
}

function badgeOf(page: Page, name: string) {
  return kitchenRows(page)
    .filter({ hasText: name })
    .getByTestId("staff-kitchen-changed-badge");
}

function changedRow(page: Page) {
  return kitchenRows(page).filter({ hasText: scenario.changed.name });
}

function estimate(page: Page, which: "sent" | "current") {
  return page.getByTestId(`staff-kitchen-estimate-${which}`);
}

function openLinkOf(page: Page, name: string) {
  return page.getByRole("link", {
    name: romanian("staffKitchens.openNamed", { name }),
  });
}

test("the changed kitchen wears the badge and comes first in the table, and the others wear none", async ({
  page,
}) => {
  await searchForThisRun(page);

  await expect(kitchenRows(page)).toHaveCount(KITCHENS_OF_THE_WORLD);
  await expect(kitchenRows(page).first()).toContainText(scenario.changed.name);
  await expect(badgeOf(page, scenario.changed.name)).toHaveText(
    romanian("staffChanges.badge"),
  );
  await expect(page.getByTestId("staff-kitchen-changed-badge")).toHaveCount(1);
  await expect(page.getByTestId("staff-kitchens-changed-count")).toBeVisible();
  await expect(page.getByTestId("staff-kitchens-table")).toBeVisible();
  expect(await pageScrollsSideways(page), "a horizontal page scroll").toBe(
    false,
  );
  await shootForReview(page, "desktop-changed-list");
});

test("the nav's kitchens link wears a count while this world's kitchen is changed, and says so to a screen reader", async ({
  page,
}) => {
  test.setTimeout(KITCHENS_LINK_COUNT_WAIT_MS + 30_000);
  await openStaffList(page);

  await expectKitchensLinkWearsCount(
    page.getByTestId("staff-nav").getByRole("link").first(),
  );
});

test("'Doar modificate' keeps the changed kitchens of the search, asks the server for them, and lets go when turned off", async ({
  page,
}) => {
  await searchForThisRun(page);
  const requests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/staff/kitchens") {
      requests.push(request.url());
    }
  });
  const only = page.getByRole("switch", {
    name: romanian("staffChanges.filter"),
  });

  await only.check();

  await expect(kitchenRows(page)).toHaveCount(1);
  await expect(kitchenRows(page).first()).toContainText(scenario.changed.name);
  expect(new URL(requests.at(-1) ?? "").searchParams.get("onlyChanged")).toBe(
    "true",
  );
  await shootForReview(page, "desktop-changed-only");

  await only.uncheck();

  await expect(kitchenRows(page)).toHaveCount(KITCHENS_OF_THE_WORLD);
  expect(new URL(requests.at(-1) ?? "").searchParams.has("onlyChanged")).toBe(
    false,
  );
});

test("opening the changed kitchen marks it seen once and the badge is gone; saved again, it is back", async ({
  page,
}) => {
  const marks: { url: string; body: string | null }[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/seen")) {
      marks.push({ url: request.url(), body: request.postData() });
    }
  });
  await searchForThisRun(page);
  await expect(badgeOf(page, scenario.changed.name)).toBeVisible();
  await expect(
    changedRow(page),
    "never seen: no word of when",
  ).not.toContainText(SEEN_LEAD ?? "");
  const statesBefore = (await countOf(scenario.world)).designRequestStates;

  await openLinkOf(page, scenario.changed.name).click();

  // The dev server compiles the seen route on its first request, which can take longer than the default wait.
  await expect(page.getByTestId("staff-kitchen-seen-notice")).toHaveText(
    romanian("staffChanges.markedSeen"),
    { timeout: SEEN_ROUTE_COMPILE_TIMEOUT_MS },
  );
  expect(marks).toHaveLength(1);
  expect(marks[0]?.url).toContain(scenario.changed.id);
  const sent = JSON.parse(marks[0]?.body ?? "{}") as {
    displayedRevision?: string;
  };
  expect(sent.displayedRevision).toMatch(/^[1-9][0-9]*$/u);
  expect((await countOf(scenario.world)).designStaffSeen, "one mark").toBe(1);
  expect(
    (await countOf(scenario.world)).designRequestStates,
    "opening a kitchen leaves its request status alone",
  ).toBe(statesBefore);
  await shootForReview(page, "desktop-changed-opened");

  await searchForThisRun(page);
  await expect(page.getByTestId("staff-kitchen-changed-badge")).toHaveCount(0);

  await saveKitchenAgain(scenario.world, scenario.changed.id);
  await searchForThisRun(page);

  await expect(badgeOf(page, scenario.changed.name)).toBeVisible();
  await expect(kitchenRows(page).first()).toContainText(scenario.changed.name);
  await expect(changedRow(page)).toContainText(SEEN_LEAD ?? "");
  await expect(changedRow(page)).toContainText(
    CHANGED_AGAIN_LEAD?.trim() ?? "",
  );
  await shootForReview(page, "desktop-changed-seen-again");
});

test("the version switch opens on the current copy, shows the other on press, marks the bodies that differ, and states both estimates", async ({
  page,
}) => {
  await page.goto(`/ro/staff/kitchens/${scenario.changed.id}`);
  await expect(page.getByTestId("staff-kitchen-versions")).toBeVisible();

  const current = page.getByRole("radio", {
    name: new RegExp(
      `^${romanian("staffChanges.versionCurrent", { when: "" })}`,
      "u",
    ),
  });
  await expect(current).toBeChecked();
  await expect(page.locator("#staff-kitchen-summary-title")).toHaveText(
    romanian("staffKitchen.summaryTitleCurrent"),
  );
  const cabinets = page.getByTestId("staff-kitchen-cabinet");
  await expect(cabinets).toHaveCount(BODIES_NOW);
  await expect(
    page.locator('[data-testid="staff-kitchen-cabinet"][data-change="added"]'),
  ).toHaveCount(BODIES_NOW - BODIES_SENT);
  await expect(page.getByTestId("staff-kitchen-cabinets")).toContainText(
    romanian("staffChanges.highlightNote"),
  );
  await expect(estimate(page, "sent")).toContainText(
    romanian("staffChanges.estimateSent"),
  );
  await expect(estimate(page, "sent")).toContainText(/De la 59\s000 MDL/u);
  await expect(estimate(page, "current")).toContainText(/De la \d[\d\s]* MDL/u);
  const view = await page.getByTestId("staff-kitchen-view").boundingBox();
  const estimates = await page
    .getByTestId("staff-kitchen-estimates")
    .boundingBox();
  expect(view && estimates, "both are drawn").toBeTruthy();
  expect(
    estimates?.x,
    "the estimates stand in a column of their own",
  ).toBeGreaterThan((view?.x ?? 0) + (view?.width ?? 0) - 1);
  await shootForReview(page, "desktop-changed-current");

  await page.getByRole("radio", { name: sentChoiceName }).check();

  await expect(page.locator("#staff-kitchen-summary-title")).toHaveText(
    romanian("staffKitchen.summaryTitleSent"),
  );
  await expect(cabinets).toHaveCount(BODIES_NOW);
  await expect(page.getByTestId("staff-kitchen-view")).toBeVisible();
  await expect(page.getByTestId("staff-kitchen-seen-notice")).toHaveText(
    romanian("staffChanges.markedSeen"),
  );
  expect(await pageScrollsSideways(page), "a horizontal page scroll").toBe(
    false,
  );
  await shootForReview(page, "desktop-changed-sent");
});

test("a kitchen the price list cannot price says why, draws no figure for it, and the page keeps showing the copy as sent", async ({
  page,
}) => {
  await page.goto(`/ro/staff/kitchens/${scenario.unpriceable.id}`);
  await expect(page.getByTestId("staff-kitchen-estimates")).toBeVisible();

  await expect(estimate(page, "current")).toContainText(
    romanian("staffChanges.estimateRefusedUnreadable"),
  );
  await expect(estimate(page, "current")).not.toContainText(/MDL|\d/u);
  await expect(estimate(page, "sent")).toContainText(/De la 59\s000 MDL/u);
  // The server reads the document as it stands as nothing, since it holds a body no catalogue knows: with one copy to read
  // there is nothing to switch between, and the copy as sent is the one drawn.
  await expect(page.getByTestId("staff-kitchen-versions")).toHaveCount(0);
  await expect(page.locator("#staff-kitchen-summary-title")).toHaveText(
    romanian("staffKitchen.summaryTitleSent"),
  );
  await expect(page.getByTestId("staff-kitchen-seen-notice")).toHaveText("");
  await shootForReview(page, "desktop-changed-refused");
});
