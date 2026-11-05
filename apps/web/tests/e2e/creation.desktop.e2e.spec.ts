// On a desktop, 1440 x 900 with a pointer: a hardware class and a linked accessory are created through the
// forms, found in the draft the server holds, renamed from their own pages and taken away by the arrow of their row on the
// publish page (frames D4C, D6B, D7A).
//
// BOTH SERVERS. The creation routes are the same under `next dev` and the production build CI serves, and both keep the
// draft in the e2e server's fake price book, so this file holds under either. Nothing publishes, because that would move
// the active version for every other spec. The draft is ONE draft in the server's memory, so the file takes the lock the
// dashboard's specs share and every test starts and ends by emptying it.
import {
  countStaffFixturesForTests,
  removeStaffFixturesForTests,
} from "@lemnaria/persistence";
import { expect } from "@playwright/test";

import { warmAccessoryRoutes } from "./support/accessory-page";
import {
  createAndRenameAClass,
  createAndRenameAnAccessory,
  type CreationRun,
} from "./support/creation-flow";
import { warmHardwareRoutes } from "./support/hardware-page";
import {
  discardDraft,
  expectNoSidewaysScroll,
  expectTargetsLargeEnough,
  priceRateLimitKeysOf,
  test,
} from "./support/price-dashboard-session";
import { holdPriceDraft, releasePriceDraft } from "./support/price-draft-lock";
import { shootForReview } from "./support/staff-pages";
import {
  NOTHING_LEFT,
  plantSignedInAdministrator,
  signIn,
  type SignedInAdministrator,
} from "./support/staff-world";

const DESKTOP = { width: 1440, height: 900 } as const;
const FILES_TAKE_TURNS_MS = 600_000;

let signedIn: SignedInAdministrator;
let rateLimitKeys: readonly string[] = [];

test.beforeAll(async ({ browser }) => {
  test.setTimeout(FILES_TAKE_TURNS_MS);
  await holdPriceDraft();
  signedIn = await plantSignedInAdministrator();
  rateLimitKeys = priceRateLimitKeysOf(signedIn);
  await warmHardwareRoutes(browser, signedIn.administrator);
  await warmAccessoryRoutes(browser, signedIn.administrator);
});

test.afterAll(async () => {
  releasePriceDraft();
  const scope = { rateLimitKeys };
  const removed = await removeStaffFixturesForTests(signedIn.marker, scope);
  const left = await countStaffFixturesForTests(signedIn.marker, scope);
  expect(
    removed.rateLimitCounters,
    "the price routes' counters were found under the keys computed here, so they are the server's",
  ).toBeGreaterThan(0);
  expect(left, "rows left behind").toEqual(NOTHING_LEFT);
});

test.beforeEach(async ({ context }) => {
  await signIn(context, signedIn.administrator);
  await discardDraft(context);
});

test.afterEach(async ({ context }) => {
  await discardDraft(context);
});

test.describe("creating a row on a desktop, 1440 x 900", () => {
  test.beforeEach(({ page }) => {
    expect(page.viewportSize(), "the viewport this project asked for").toEqual(
      DESKTOP,
    );
  });

  test("a class is created with its five rates, renamed from its page, and taken away whole by the arrow of its row", async ({
    page,
    context,
  }) => {
    await createAndRenameAClass(runOf(page, context, "1440-r4a4"));

    await expectNoSidewaysScroll(page, "the publish page after the arrow");
  });

  test("an accessory is created with its price inside the creation, renamed from its page, and taken away whole by the arrow of its row", async ({
    page,
    context,
  }) => {
    await createAndRenameAnAccessory(runOf(page, context, "1440-r4a4"));

    await expectTargetsLargeEnough(
      page,
      '[data-testid="publish-page"]',
      "the publish page after the arrow",
    );
  });
});

function runOf(
  page: CreationRun["page"],
  context: CreationRun["context"],
  prefix: string,
): CreationRun {
  return {
    page,
    context,
    press: (control) => control.click(),
    shoot: (name) => shootForReview(page, `${prefix}-${name}`),
  };
}
