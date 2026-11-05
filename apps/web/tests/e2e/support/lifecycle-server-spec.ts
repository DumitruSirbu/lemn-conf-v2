import {
  countStaffFixturesForTests,
  removeStaffFixturesForTests,
} from "@lemnaria/persistence";
import { type ItemRef } from "@lemnaria/configurator-domain";
import {
  expect,
  type BrowserContext,
  type Page,
  type Response,
} from "@playwright/test";

import {
  BLUM,
  CI_ONLY_REASON,
  chipsOf,
  itemDialogOf,
  menuButtonOf,
  menuEntryOf,
  openHardwareList,
  rowOf,
  SERVER_IS_PRODUCTION_BUILD,
} from "./hardware-page";
import {
  chipsOf as materialChipsOf,
  editPageOf,
  MDF,
  openMaterial,
  openMaterialList,
  rowOf as materialRowOf,
  VENEER,
} from "./material-page";
import {
  OK,
  priceRateLimitKeysOf,
  STATE_ROUTE,
  test,
} from "./price-dashboard-session";
import { holdPriceDraft, releasePriceDraft } from "./price-draft-lock";
import { plainText, wordsOf } from "./publish-page";
import { shootForReview } from "./staff-pages";
import {
  NOTHING_LEFT,
  plantSignedInAdministrator,
  romanian,
  signIn,
  type SignedInAdministrator,
} from "./staff-world";

// The lifecycle of an item against the server, in a browser: the page's switch goes to the availability route and what it
// wrote is there after a reload, and a view counts the items it shows in one request to the usage route. Run on a
// production build only, where the screens ask the server; `next dev` hands them an in-memory client instead, which the
// specs of each screen drive. The world is the e2e server's fake price book, in which no saved kitchen uses anything, so
// every count is 0: a count above 0 is held by the DOM tests over planted designs.
//
// Items are switched off through the route first, because a production page offers no switch-off until the saved defaults
// can be read, and put back on afterwards: the availability is one object for the whole server, like the draft.

const AVAILABILITY_ROUTE = "/api/staff/prices/availability";
const USAGE_ROUTE = "/api/staff/prices/usage";
const FILES_TAKE_TURNS_MS = 600_000;
const NO_SAVED_KITCHENS = 0;

const BLUM_ITEM: ItemRef = { kind: "hardware", tierId: BLUM };
const MDF_ITEM: ItemRef = { kind: "material", tierId: MDF };
const VENEER_ITEM: ItemRef = { kind: "material", tierId: VENEER };

interface Viewport {
  readonly width: number;
  readonly height: number;
  /** Names a screenshot: `r4a5-<label>-…`. */
  readonly label: string;
}

export function describeLifecycleAgainstTheServer(viewport: Viewport): void {
  let signedIn: SignedInAdministrator;
  let rateLimitKeys: readonly string[] = [];

  test.skip(!SERVER_IS_PRODUCTION_BUILD, CI_ONLY_REASON);

  test.beforeAll(async () => {
    test.setTimeout(FILES_TAKE_TURNS_MS);
    await holdPriceDraft();
    signedIn = await plantSignedInAdministrator();
    rateLimitKeys = priceRateLimitKeysOf(signedIn);
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

  test.beforeEach(async ({ context, page }) => {
    expect(page.viewportSize(), "the viewport this project asked for").toEqual({
      width: viewport.width,
      height: viewport.height,
    });
    await signIn(context, signedIn.administrator);
  });

  test.afterEach(async ({ context }) => {
    for (const item of [BLUM_ITEM, MDF_ITEM, VENEER_ITEM]) {
      await switchThrough(context, item, true);
    }
  });

  test(`${viewport.label}: a class switched off on the server is switched back on through the server, and stays on after a reload`, async ({
    page,
    context,
  }) => {
    const words = wordsOf("ro");
    await switchThrough(context, BLUM_ITEM, false);
    await openHardwareList(page);
    const row = rowOf(page, BLUM);
    const inactive = chipsOf(row).filter({
      hasText: romanian("priceDashboard.chips.inactive"),
    });
    await expect(
      inactive,
      "the server's switch-off is on the page",
    ).toHaveCount(1);

    await menuButtonOf(row).click();
    const entry = menuEntryOf(row, words, "switch-on");
    await expect(entry).not.toHaveAttribute("aria-disabled", "true");
    await entry.click();
    const dialog = itemDialogOf(page);
    expect(plainText(await dialog.innerText())).toContain(
      romanian("priceDashboard.lifecycle.activateBody"),
    );
    await shootForReview(page, `r4a5-${viewport.label}-d4f-switch-on-dialog`);

    const answered = page.waitForResponse(isAvailabilityWrite);
    await dialog
      .getByRole("button", {
        name: romanian("priceDashboard.lifecycle.activateConfirm"),
        exact: true,
      })
      .click();

    const response = await answered;
    expect(response.status(), "the server wrote the switch").toBe(OK);
    expect(response.request().postDataJSON()).toMatchObject({
      item: BLUM_ITEM,
      active: true,
    });
    await expect(dialog).toHaveCount(0);
    await expect(inactive, "the chip goes at once").toHaveCount(0);
    await shootForReview(page, `r4a5-${viewport.label}-d4f-blum-on`);

    await page.reload();
    await expect(
      chipsOf(rowOf(page, BLUM)).filter({
        hasText: romanian("priceDashboard.chips.inactive"),
      }),
      "the switch is on the server, so the reload keeps it",
    ).toHaveCount(0);
    expect(await disabledItemsOf(context)).toEqual([]);
  });

  test(`${viewport.label}: the materials switched off are counted in one request, and the page says the server's figure`, async ({
    page,
    context,
  }) => {
    await switchThrough(context, MDF_ITEM, false);
    await switchThrough(context, VENEER_ITEM, false);
    const counts = usageRequestsOf(page);

    await openMaterialList(page);

    for (const tierId of [MDF, VENEER]) {
      await expect(
        materialChipsOf(materialRowOf(page, tierId)).filter({
          hasText: new RegExp(`^${romanian("priceDashboard.chips.inactive")}$`),
        }),
        `${tierId}: no saved kitchen uses it, so the chip says only that it is off`,
      ).toHaveCount(1);
    }
    expect(
      counts.map((items) => items.map(tierIdOf).sort()),
      "one request for the view, naming both materials",
    ).toEqual([[MDF, VENEER].sort()]);
    await shootForReview(page, `r4a5-${viewport.label}-d5e-counted-list`);

    counts.length = 0;
    await openMaterial(page, MDF);
    await expect(editPageOf(page).getByTestId("material-banner")).toBeVisible();
    await expect(
      editPageOf(page)
        .locator("dl > div")
        .filter({
          hasText: romanian("priceDashboard.materials.usedInKitchens"),
        }),
      "the page's fact line says the server's figure",
    ).toHaveText(
      new RegExp(
        `${romanian("priceDashboard.materials.usedInKitchens")}\\s*${String(NO_SAVED_KITCHENS)}$`,
      ),
    );
    expect(
      counts.map((items) => items.map(tierIdOf).sort()),
      "one request for the page, naming the material it is about and the other that is off",
    ).toEqual([[MDF, VENEER].sort()]);
    await shootForReview(page, `r4a5-${viewport.label}-d5f-counted-page`);
  });
}

function isAvailabilityWrite(response: Response): boolean {
  return (
    new URL(response.url()).pathname === AVAILABILITY_ROUTE &&
    response.request().method() === "POST"
  );
}

/** The items of each count the page asks for, in order. */
function usageRequestsOf(page: Page): ItemRef[][] {
  const asked: ItemRef[][] = [];
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === USAGE_ROUTE &&
      request.method() === "POST"
    ) {
      asked.push((request.postDataJSON() as { items: ItemRef[] }).items);
    }
  });
  return asked;
}

function tierIdOf(item: ItemRef): string {
  return item.kind === "material" || item.kind === "hardware"
    ? item.tierId
    : "";
}

async function availabilityOf(
  context: BrowserContext,
): Promise<{ revision: string; disabled: ItemRef[] }> {
  const state = await context.request.get(STATE_ROUTE);
  expect(
    state.status(),
    "the dashboard's state, read for the availability",
  ).toBe(OK);
  const body = (await state.json()) as {
    active: { availability: { revision: string; disabled: ItemRef[] } };
  };
  return body.active.availability;
}

async function disabledItemsOf(context: BrowserContext): Promise<ItemRef[]> {
  return (await availabilityOf(context)).disabled;
}

/** Writes a switch through the route the screens use, unless the item is already as asked. */
async function switchThrough(
  context: BrowserContext,
  item: ItemRef,
  active: boolean,
): Promise<void> {
  const { revision, disabled } = await availabilityOf(context);
  const isOff = disabled.some(
    (held) => JSON.stringify(held) === JSON.stringify(item),
  );
  if (isOff === !active) return;
  const written = await context.request.post(AVAILABILITY_ROUTE, {
    data: { expectedRevision: revision, item, active },
  });
  expect(written.status(), "the switch is written through the route").toBe(OK);
}
