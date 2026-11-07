// The materials screens "Materiale" (the list and one material) on a phone, 390 x 844 with real touch, against frames
// D5A to D5G and D5CM of the dashboard mockup (docs/design/mockups/Lemnaria Dashboard.dc.html).
//
// WHICH SERVER THIS FILE HOLDS ON (`playwright.config.ts` starts `next start` when `CI` is set, `next dev` otherwise),
// and what each gives these pages, is written at the head of `support/material-page.ts`. The list, a surcharge's Save,
// a reload and the refusals run under BOTH; the dialogs need the sample lifecycle that only `next dev` draws, and the
// off controls are what `next start` draws. The tests of the dialogs skip themselves under `CI`, and the test of the
// off controls skips itself without it. On `next dev` a switch never reaches the server, and each page starts from its own copy of it;
// `lifecycle-server.e2e.spec.ts` drives the switch and the counts against the server on a production build.
//
// NOT REACHABLE, so not asserted here: deleting a material into the draft (the draft route reads no `item-deleted`
// until R4a, so the dialog's confirmation is refused with a 400, which the test records); a switch's survival of a
// reload (the in-memory client forgets it).
//
// The draft is ONE draft in the e2e server's memory, so every test starts and ends by emptying it and the file takes
// the lock the dashboard's specs share.
import {
  countStaffFixturesForTests,
  removeStaffFixturesForTests,
} from "@lemnaria/persistence";
import { expect, type Locator } from "@playwright/test";

import {
  collectWrites,
  expectPendingCount,
  refusalOf,
  shootViewport,
} from "./support/cabinet-detail-page";
import {
  boxOf,
  CI_ONLY_REASON,
  collectDashboardRequests,
  DEV_ONLY_REASON,
  draftChanges,
  itemDialogOf,
  PROMISES_PUBLICATION,
  SAYS_SAVED_KITCHENS_USE_IT,
  SERVER_IS_PRODUCTION_BUILD,
} from "./support/hardware-page";
import {
  activePercentOf,
  activeSwitch,
  cancelSurchargeButton,
  chipsOf,
  coloursCellOf,
  deleteMaterialButton,
  editPageOf,
  examplePricesOf,
  exampleOf,
  inactiveBannerOf,
  listedColoursOf,
  materialPath,
  MATERIAL_NAME_KEY,
  MDF,
  MDF_SAVED_KITCHENS,
  menuButtonOf,
  menuEntryOf,
  menuOf,
  openMaterial,
  openMaterialList,
  PAL,
  rowOf,
  rowsOf,
  saveSurchargeButton,
  surchargeCellOf,
  surchargeField,
  VENEER,
  warmMaterialRoutes,
  columnTitlesOf,
} from "./support/material-page";
import {
  discardDraft,
  expectNoSidewaysScroll,
  expectTargetsLargeEnough,
  priceRateLimitKeysOf,
  test,
} from "./support/price-dashboard-session";
import { holdPriceDraft, releasePriceDraft } from "./support/price-draft-lock";
import { plainText, stickingOut, wordsOf } from "./support/publish-page";
import { shootForReview } from "./support/staff-pages";
import {
  NOTHING_LEFT,
  plantSignedInAdministrator,
  romanian,
  signIn,
  type SignedInAdministrator,
} from "./support/staff-world";

const PHONE = { width: 390, height: 844 } as const;
const LOCALES = ["ro", "ru"] as const;
const FILES_TAKE_TURNS_MS = 600_000;
const EDGE_PX = 3;
const DRAFT_PATH = "/api/staff/prices/draft";
const PAL_NAME = romanian(MATERIAL_NAME_KEY[PAL]);
const MDF_NAME = romanian(MATERIAL_NAME_KEY[MDF]);
const VENEER_NAME = romanian(MATERIAL_NAME_KEY[VENEER]);
const CANCEL = () => romanian("priceDashboard.common.cancel");
const CONFIRM_SWITCH_OFF = () =>
  romanian("priceDashboard.lifecycle.deactivateConfirm");
const CONFIRM_SWITCH_ON = () =>
  romanian("priceDashboard.lifecycle.activateConfirm");

let signedIn: SignedInAdministrator;
let rateLimitKeys: readonly string[] = [];

test.beforeAll(async ({ browser }) => {
  test.setTimeout(FILES_TAKE_TURNS_MS);
  await holdPriceDraft();
  signedIn = await plantSignedInAdministrator();
  rateLimitKeys = priceRateLimitKeysOf(signedIn);
  await warmMaterialRoutes(browser, signedIn.administrator);
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

test.describe("the materials screens on a phone, 390 x 844", () => {
  test.beforeEach(({ page }) => {
    expect(page.viewportSize(), "the viewport this project asked for").toEqual(
      PHONE,
    );
  });

  test.describe("D5A: the list, under either server", () => {
    test("every material is a card with its surcharge and its colours at the book's amounts; no field in a card, nothing wider than the screen, every control 44 px; RO and RU", async ({
      page,
    }) => {
      for (const locale of LOCALES) {
        const words = wordsOf(locale);
        await openMaterialList(page, locale);

        await expect(rowsOf(page), locale).toHaveCount(3);
        const pal = surchargeCellOf(rowOf(page, PAL));
        await expect(pal, `${locale}: PAL is the reference`).toContainText(
          words("priceDashboard.common.percent", { percent: "0" }),
        );
        await expect(pal).toContainText(
          words("priceDashboard.materials.referenceRow"),
        );
        for (const tierId of [MDF, VENEER]) {
          await expect(
            surchargeCellOf(rowOf(page, tierId)),
            `${locale}: ${tierId} draws the book's surcharge`,
          ).toContainText(
            words("priceDashboard.common.percentPlus", {
              percent: String(activePercentOf(tierId)),
            }),
          );
        }
        for (const tierId of [PAL, MDF, VENEER]) {
          const count = listedColoursOf(tierId);
          await expect(
            coloursCellOf(rowOf(page, tierId)),
            `${locale}: ${tierId} says what colours it offers`,
          ).toContainText(
            count === undefined
              ? words("priceDashboard.materials.colourPicker")
              : words("priceDashboard.materials.colourCount", { count }),
          );
        }
        await expect(
          rowsOf(page).locator("input, textarea, select, [contenteditable]"),
          `${locale}: a card holds no field`,
        ).toHaveCount(0);
        await expect(
          columnTitlesOf(page),
          `${locale}: the table's column titles are not drawn on a phone`,
        ).toBeHidden();
        await expectNoSidewaysScroll(page, `${locale} list`);
        expect(await stickingOut(page), `${locale} list`).toEqual([]);
        await expectTargetsLargeEnough(
          page,
          '[data-testid="material-list"]',
          `${locale} list`,
        );
        await shootForReview(page, `390-d5a-list-${locale}`);
      }
    });

    test("a tap in the card's middle, and one on the empty space beside Edit and the three dots, open the material", async ({
      page,
    }) => {
      await openMaterialList(page);
      const row = rowOf(page, MDF);
      await row.scrollIntoViewIfNeeded();
      const box = await boxOf(row);

      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);

      await expect(page, "a tap in the middle").toHaveURL(
        new RegExp(`${materialPath(MDF).replaceAll(".", "\\.")}$`),
      );

      await openMaterialList(page);
      await row.scrollIntoViewIfNeeded();
      const more = await boxOf(menuButtonOf(row));
      const rowBox = await boxOf(row);
      const beside = {
        x:
          more.x +
          more.width +
          (rowBox.x + rowBox.width - more.x - more.width) / 2,
        y: more.y + more.height / 2,
      };
      const hit = await page.evaluate(({ x, y }) => {
        const element = document.elementFromPoint(x, y);
        return element?.closest("a")?.getAttribute("href") ?? null;
      }, beside);
      await page.touchscreen.tap(beside.x, beside.y);

      expect(
        hit,
        "the card's own link is what a finger beside the controls hits",
      ).toBe(materialPath(MDF));
      await expect(page, "a tap beside the controls").toHaveURL(
        new RegExp(`${materialPath(MDF).replaceAll(".", "\\.")}$`),
      );
    });

    test("the three dots open a menu of two entries that stands above the stretched link; a tap outside closes it, and one on the next card's dots opens that menu at the first tap", async ({
      page,
    }) => {
      await openMaterialList(page);
      const first = rowOf(page, PAL);
      const second = rowOf(page, MDF);
      const more = menuButtonOf(first);
      await first.scrollIntoViewIfNeeded();

      await more.tap();

      await expect(more).toHaveAttribute("aria-expanded", "true");
      await expect(menuOf(first).getByRole("button")).toHaveCount(2);
      await expectTargetsLargeEnough(
        page,
        `[data-tier-id="${PAL}"]`,
        "the menu open",
      );
      const menuBox = await boxOf(menuOf(first));
      const topmost = await page.evaluate(
        ({ x, y }) =>
          document.elementFromPoint(x, y)?.closest("ul[id]") !== null,
        { x: menuBox.x + menuBox.width / 2, y: menuBox.y + EDGE_PX },
      );
      expect(
        topmost,
        "the menu, not the link, is under a finger at its edge",
      ).toBe(true);
      await shootForReview(page, "390-d5a-menu-open");

      await menuButtonOf(second).tap();

      await expect(
        menuOf(second),
        "the card above closed under the finger and the one below opened",
      ).toBeVisible();
      await expect(menuOf(first)).toHaveCount(0);
      await page.getByRole("heading", { level: 1 }).tap();
      await expect(
        menuButtonOf(second),
        "an outside tap closes the menu",
      ).toHaveAttribute("aria-expanded", "false");
    });
  });

  test.describe("D5B: a material's page, under either server", () => {
    test("the surcharge is a field with its unit and the active amount beside it; a refused value says why in the field, switches Save off and sends nothing; RO and RU", async ({
      page,
    }) => {
      for (const locale of LOCALES) {
        const words = wordsOf(locale);
        const refusals = [
          {
            typed: "",
            words: words("priceDashboard.materials.surchargeEmpty"),
          },
          {
            typed: "1,5",
            words: words("priceDashboard.errors.percentNotWhole", {
              example: "15",
            }),
          },
          {
            typed: "-5",
            words: words("priceDashboard.errors.percentNegative"),
          },
          {
            typed: "201",
            words: words("priceDashboard.errors.percentTooBig", { max: "200" }),
          },
        ];
        await openMaterial(page, MDF, locale);
        const requests = collectDashboardRequests(page);
        const field = surchargeField(page, words);
        await expect(field).toBeVisible();
        await expect(editPageOf(page).locator("input[type=text]")).toHaveCount(
          1,
        );
        await expect(field).toHaveValue(String(activePercentOf(MDF)));
        await expect(
          saveSurchargeButton(page, words),
          `${locale}: nothing to save yet`,
        ).toBeDisabled();

        for (const refusal of refusals) {
          await field.fill(refusal.typed);

          await expect(field, `${locale} "${refusal.typed}"`).toHaveAttribute(
            "aria-invalid",
            "true",
          );
          await expect(
            await refusalOf(field),
            `${locale} "${refusal.typed}" is refused in words`,
          ).toHaveText(refusal.words);
          await expect(saveSurchargeButton(page, words)).toBeDisabled();
          await expect(
            editPageOf(page).getByText(
              words("priceDashboard.errors.fixToSave"),
            ),
          ).toBeVisible();
        }
        await expectNoSidewaysScroll(page, `${locale} refused`);
        await shootForReview(page, `390-d5b-refused-${locale}`);
        await cancelSurchargeButton(page, words).tap();
        await expect(field).toHaveValue(String(activePercentOf(MDF)));
        expect(requests, `${locale}: refusals send nothing`).toEqual([]);
      }
    });

    test("Save writes one change; a reload keeps it and the list says what was active; typing the active surcharge back takes it out of the draft again", async ({
      page,
    }) => {
      const words = wordsOf("ro");
      const active = activePercentOf(MDF);
      await openMaterial(page, MDF);
      const writes = collectWrites(page);

      await surchargeField(page, words).fill("35");
      await expectTargetsLargeEnough(
        page,
        '[data-testid="material-edit"]',
        "a surcharge typed",
      );
      await saveSurchargeButton(page, words).tap();

      await expect(
        editPageOf(page).getByText(
          romanian("priceDashboard.common.priceSavedNotice"),
        ),
      ).toBeVisible();
      expect(writes, "one write").toEqual([`PUT ${DRAFT_PATH}`]);
      expect(
        (await draftChanges(page)).map(({ address, value }) => [
          address.kind,
          address.tierId,
          address.field,
          value,
        ]),
        "the server holds the one change, a whole percent",
      ).toEqual([["material", MDF, "percentOfCabinets", 35]]);
      await expectPendingCount(page, 1);
      await shootForReview(page, "390-d5b-saved");

      await openMaterial(page, MDF);
      await expect(surchargeField(page, words)).toHaveValue("35");
      await expect(
        editPageOf(page).getByText(
          romanian("priceDashboard.common.activeValue", {
            amount: romanian("priceDashboard.common.percentPlus", {
              percent: String(active),
            }),
          }),
        ),
      ).toBeVisible();
      await expect(
        chipsOf(editPageOf(page)).filter({
          hasText: romanian("priceDashboard.chips.pending"),
        }),
        "a reload keeps the pending chip",
      ).toHaveCount(1);
      await openMaterialList(page);
      await expect(
        surchargeCellOf(rowOf(page, MDF)),
        "the list says the new surcharge and what was active",
      ).toContainText(
        romanian("priceDashboard.common.activeThenPending", {
          active: romanian("priceDashboard.common.percentPlus", {
            percent: String(active),
          }),
        }),
      );

      await openMaterial(page, MDF);
      const reverts = collectWrites(page);
      await surchargeField(page, words).fill(String(active));
      await saveSurchargeButton(page, words).tap();

      await expect
        .poll(async () => (await draftChanges(page)).length, {
          message: "retyping the active surcharge empties the draft",
        })
        .toBe(0);
      expect(reverts, "one take-back").toEqual([`DELETE ${DRAFT_PATH}`]);
      await expect(
        page.getByTestId("staff-pending-prices"),
        "no pending count is left",
      ).toHaveCount(0);
    });

    test("the example is drawn from the book and follows what is typed before anything is sent: nothing added makes the material cost what PAL does, and more makes it dearer", async ({
      page,
    }) => {
      const words = wordsOf("ro");
      await openMaterial(page, MDF);
      const requests = collectDashboardRequests(page);
      const example = exampleOf(page);
      const next = example.getByTestId("material-example-next");
      await expect(example).toBeVisible();
      await expect(
        example.getByTestId("material-example-deep"),
        "the deep kitchen's line",
      ).toBeVisible();
      await expect(
        example.getByTestId("material-example-active"),
        "the surcharge is the active one, so there is no second line",
      ).toHaveCount(0);

      await surchargeField(page, words).fill("0");
      const none = await examplePricesOf(next);
      await surchargeField(page, words).fill("100");
      const doubled = await examplePricesOf(next);

      expect(
        none.material,
        "nothing added: the material costs what PAL does",
      ).toBe(none.reference);
      expect(doubled.reference, "PAL's price does not move").toBe(
        none.reference,
      );
      expect(doubled.material).toBeGreaterThan(none.material);
      await expect(
        example.getByTestId("material-example-active"),
        "the active version's line is beside it now",
      ).toBeVisible();
      await expectNoSidewaysScroll(page, "the example");
      await shootForReview(page, "390-d5b-example");
      expect(requests, "typing sends nothing").toEqual([]);
    });
  });

  test.describe("PAL is the reference, under either server", () => {
    test("its page has no field, says it is the reference, and its switch and deletion are off with the catalogue's own words; a tap sends nothing and opens nothing", async ({
      page,
    }) => {
      const words = wordsOf("ro");
      await openMaterial(page, PAL);
      const requests = collectDashboardRequests(page);
      const reason = romanian(
        "priceDashboard.lifecycle.fixedDefaultCannotChange",
      );

      await expect(editPageOf(page).locator("input")).toHaveCount(0);
      await expect(
        editPageOf(page).getByText(
          romanian("priceDashboard.materials.referenceRow"),
        ),
      ).toBeVisible();
      await expect(exampleOf(page)).toHaveCount(0);
      const toggle = activeSwitch(page, words);
      await expect(toggle).toHaveAttribute("aria-disabled", "true");
      await expect(toggle).toHaveAttribute("aria-checked", "true");
      await expect(editPageOf(page).getByText(reason)).toHaveCount(2);
      await expect(deleteMaterialButton(page, words)).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await expect(
        chipsOf(editPageOf(page)).filter({
          hasText: romanian("priceDashboard.chips.defaultChoice"),
        }),
      ).toHaveCount(1);
      await toggle.tap({ force: true });
      await deleteMaterialButton(page, words).tap({ force: true });

      await expect(itemDialogOf(page)).toHaveCount(0);
      expect(requests, "an off control sends nothing").toEqual([]);
      await shootForReview(page, "390-d5b-pal-reference");

      await openMaterialList(page);
      const row = rowOf(page, PAL);
      await menuButtonOf(row).tap();
      for (const which of ["switch-off", "delete"] as const) {
        const entry = menuEntryOf(row, words, which);
        await expect(entry).toHaveAttribute("aria-disabled", "true");
        await entry.tap({ force: true });
      }
      await expect(
        row.getByTestId("menu-reason"),
        "both entries say why, in the catalogue's words",
      ).toHaveText([reason, reason]);
      await expect(itemDialogOf(page)).toHaveCount(0);
    });
  });

  test.describe("a production build (CI): the switch-off is judged, the deletion stays off, and the counts come from the server", () => {
    test.skip(!SERVER_IS_PRODUCTION_BUILD, CI_ONLY_REASON);

    test("MDF and veneer: the switch-off entry and the page's switch are on, the deletion is off with the reason, the page counts the material once, and pressing the deletion sends nothing", async ({
      page,
    }) => {
      const words = wordsOf("ro");
      const cannotJudge = romanian("priceDashboard.lifecycle.cannotJudge");
      await openMaterialList(page);
      const requests = collectDashboardRequests(page);

      for (const tierId of [MDF, VENEER]) {
        const row = rowOf(page, tierId);
        await menuButtonOf(row).tap();
        await expect(
          menuEntryOf(row, words, "switch-off"),
          `${tierId} switch-off`,
        ).not.toHaveAttribute("aria-disabled", "true");
        const deletion = menuEntryOf(row, words, "delete");
        await expect(deletion, `${tierId} delete`).toHaveAttribute(
          "aria-disabled",
          "true",
        );
        await deletion.tap({ force: true });
        await expect(row.getByTestId("menu-reason")).toHaveText([cannotJudge]);
      }
      await expect(itemDialogOf(page)).toHaveCount(0);
      expect(
        plainText(await page.getByRole("main").innerText()),
        "no count of saved kitchens is said",
      ).not.toMatch(SAYS_SAVED_KITCHENS_USE_IT);
      await shootForReview(page, "390-d5a-production-menu");

      await openMaterial(page, MDF);
      await expect(activeSwitch(page, words)).not.toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await expect(deleteMaterialButton(page, words)).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await expect(editPageOf(page).getByText(cannotJudge)).toHaveCount(1);
      await expect(
        editPageOf(page)
          .locator("dl > div")
          .filter({
            hasText: romanian("priceDashboard.materials.usedInKitchens"),
          }),
        "the server counted the material, and no saved kitchen uses it in this world",
      ).toHaveText(
        new RegExp(
          `${romanian("priceDashboard.materials.usedInKitchens")}\\s*0$`,
        ),
      );
      const requestsBeforeDeletion = requests.length;
      await deleteMaterialButton(page, words).tap({ force: true });
      await expect(itemDialogOf(page)).toHaveCount(0);
      expect(
        requests.slice(requestsBeforeDeletion),
        "no request was made by pressing the off deletion",
      ).toEqual([]);
      await activeSwitch(page, words).tap();
      await expect(
        itemDialogOf(page),
        "the switch-off asks first",
      ).toBeVisible();
      await itemDialogOf(page)
        .getByRole("button", {
          name: romanian("priceDashboard.common.cancel"),
          exact: true,
        })
        .tap();
      await expect(itemDialogOf(page)).toHaveCount(0);
      expect(
        requests,
        "one count for the page, one for the switch-off dialog, and nothing was written",
      ).toEqual([
        "POST /api/staff/prices/usage",
        "POST /api/staff/prices/usage",
      ]);
      await shootForReview(page, "390-d5b-production-off");
    });
  });

  test.describe("the sample's working lifecycle (next dev)", () => {
    test.skip(SERVER_IS_PRODUCTION_BUILD, DEV_ONLY_REASON);
    const words = wordsOf("ro");

    test("D5C and D5CM: switching MDF off asks first: Cancel has focus, it says who uses it, what remains (never MDF itself) and that it applies at once; the dialog fits the phone; the switch is immediate and the pending count does not move", async ({
      page,
    }) => {
      await openMaterialList(page);
      const requests = collectDashboardRequests(page);
      const row = rowOf(page, MDF);
      await row.scrollIntoViewIfNeeded();

      await menuButtonOf(row).tap();
      await menuEntryOf(row, words, "switch-off").tap();

      const dialog = itemDialogOf(page);
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: CANCEL(), exact: true }),
      ).toBeFocused();
      const text = plainText(await dialog.innerText());
      expect(text).toContain(
        romanian("priceDashboard.lifecycle.deactivateTitle", {
          name: MDF_NAME,
        }),
      );
      expect(text).toContain(
        plainText(
          romanian("priceDashboard.lifecycle.usedBy", {
            count: MDF_SAVED_KITCHENS,
          }),
        ),
      );
      expect(text).toContain(
        romanian("priceDashboard.lifecycle.clientsCannotChoose"),
      );
      expect(text).toContain(
        romanian("priceDashboard.lifecycle.appliesImmediately"),
      );
      expect(text, "the others that stay on offer, and not MDF").toContain(
        romanian("priceDashboard.lifecycle.remaining", {
          options: `${PAL_NAME}, ${VENEER_NAME}`,
        }),
      );
      expect(text, "no publishing is promised for a switch").not.toMatch(
        PROMISES_PUBLICATION,
      );
      await expectDialogFitsScreen(dialog);
      await expectNoSidewaysScroll(page, "the D5CM dialog");
      await expectTargetsLargeEnough(
        page,
        '[role="alertdialog"]',
        "the D5CM dialog",
      );
      await shootViewport(page, "390-d5cm-deactivate-mdf");

      await dialog.getByRole("button", { name: CANCEL(), exact: true }).tap();
      await expect(dialog).toHaveCount(0);
      await expect(
        chipsOf(row).filter({
          hasText: romanian("priceDashboard.chips.inactive"),
        }),
      ).toHaveCount(0);

      await menuEntryOf(row, words, "switch-off").tap();
      await dialog
        .getByRole("button", { name: CONFIRM_SWITCH_OFF(), exact: true })
        .tap();

      await expect(dialog).toHaveCount(0);
      await expect(
        chipsOf(row).filter({
          hasText: plainText(
            romanian("priceDashboard.chips.inactiveInUse", {
              count: MDF_SAVED_KITCHENS,
            }),
          ),
        }),
        "D5E: the chip changes at once and says how many saved kitchens still use it",
      ).toHaveCount(1);
      await expect(
        row.getByText(romanian("priceDashboard.materials.usageDrift")),
      ).toBeVisible();
      await expect(
        page.getByTestId("staff-pending-prices"),
        "a switch is no pending price",
      ).toHaveCount(0);
      expect(
        requests,
        "a switch never goes through the draft's routes",
      ).toEqual([]);
      await shootForReview(page, "390-d5e-mdf-off");

      await menuEntryOf(row, words, "switch-on").tap();
      const activation = itemDialogOf(page);
      expect(plainText(await activation.innerText())).toContain(
        romanian("priceDashboard.lifecycle.activateBody"),
      );
      await expectDialogFitsScreen(activation);
      await activation
        .getByRole("button", { name: CONFIRM_SWITCH_ON(), exact: true })
        .tap();
      await expect(
        chipsOf(row).filter({
          hasText: romanian("priceDashboard.chips.inactive"),
        }),
      ).toHaveCount(0);
    });

    test("D5F: the page of a switched-off material says so, with the number of saved kitchens, and the banner's button asks to switch it on", async ({
      page,
    }) => {
      await openMaterial(page, MDF);
      await expect(inactiveBannerOf(page)).toHaveCount(0);
      await activeSwitch(page, words).tap();
      await itemDialogOf(page)
        .getByRole("button", { name: CONFIRM_SWITCH_OFF(), exact: true })
        .tap();

      const banner = inactiveBannerOf(page);
      await expect(banner).toBeVisible();
      const text = plainText(await banner.innerText());
      expect(text).toContain(
        plainText(
          romanian("priceDashboard.chips.inactiveInUse", {
            count: MDF_SAVED_KITCHENS,
          }),
        ),
      );
      expect(text).toContain(
        romanian("priceDashboard.materials.inactiveBanner"),
      );
      await expect(activeSwitch(page, words)).toHaveAttribute(
        "aria-checked",
        "false",
      );
      await expect(
        editPageOf(page).getByText(
          `${romanian("priceDashboard.materials.usedInKitchens")}${String(MDF_SAVED_KITCHENS)}`,
        ),
      ).toBeVisible();
      await expectNoSidewaysScroll(page, "D5F");
      await shootForReview(page, "390-d5f-mdf-inactive");

      await banner
        .getByRole("button", {
          name: romanian("priceDashboard.common.activate"),
          exact: true,
        })
        .tap();
      await itemDialogOf(page)
        .getByRole("button", { name: CONFIRM_SWITCH_ON(), exact: true })
        .tap();

      await expect(inactiveBannerOf(page)).toHaveCount(0);
      await expect(activeSwitch(page, words)).toHaveAttribute(
        "aria-checked",
        "true",
      );
      await expect(page.getByTestId("staff-pending-prices")).toHaveCount(0);
    });

    test("D5G: with MDF and veneer off, switching PAL off opens the last-active block and changes nothing", async ({
      page,
    }) => {
      await openMaterialList(page);
      for (const tierId of [MDF, VENEER]) {
        const row = rowOf(page, tierId);
        await menuButtonOf(row).tap();
        await menuEntryOf(row, words, "switch-off").tap();
        await itemDialogOf(page)
          .getByRole("button", { name: CONFIRM_SWITCH_OFF(), exact: true })
          .tap();
      }

      const pal = rowOf(page, PAL);
      await menuButtonOf(pal).tap();
      await menuEntryOf(pal, words, "switch-off").tap();

      const lastActive = itemDialogOf(page);
      await expect(
        lastActive,
        "the last-active block opens: with the others off it is judged before the fixed default",
      ).toBeVisible();
      const text = plainText(await lastActive.innerText());
      expect(text).toContain(
        romanian("priceDashboard.lifecycle.lastActiveTitle", {
          name: PAL_NAME,
        }),
      );
      expect(text).toContain(
        romanian("priceDashboard.lifecycle.lastActiveBody"),
      );
      await expect(lastActive.getByRole("button")).toHaveText([
        romanian("priceDashboard.common.close"),
      ]);
      await expect(lastActive.getByRole("button")).toBeFocused();
      await expectDialogFitsScreen(lastActive);
      await shootViewport(page, "390-d5g-last-active");
      await lastActive.getByRole("button").tap();
      await expect(lastActive).toHaveCount(0);
      await expect(
        chipsOf(pal).filter({
          hasText: romanian("priceDashboard.chips.inactive"),
        }),
        "nothing was switched",
      ).toHaveCount(0);
    });

    test("D5D: Delete on MDF blocks with the count and offers to disable it instead, which leads to the switch-off question; on veneer, which no kitchen uses, it asks, and confirming is refused by the draft route until R4a", async ({
      page,
      pageErrors,
    }) => {
      await openMaterialList(page);
      const mdf = rowOf(page, MDF);
      await mdf.scrollIntoViewIfNeeded();
      await menuButtonOf(mdf).tap();

      await menuEntryOf(mdf, words, "delete").tap();

      const blocked = itemDialogOf(page);
      await expect(blocked).toBeVisible();
      const blockedText = plainText(await blocked.innerText());
      expect(blockedText).toContain(
        romanian("priceDashboard.lifecycle.deleteBlockedTitle", {
          name: MDF_NAME,
        }),
      );
      expect(blockedText).toContain(
        plainText(
          romanian("priceDashboard.lifecycle.deleteBlockedBody", {
            name: MDF_NAME,
            count: MDF_SAVED_KITCHENS,
          }),
        ),
      );
      await expect(
        blocked.getByRole("button", { name: CANCEL(), exact: true }),
      ).toBeFocused();
      await expectDialogFitsScreen(blocked);
      await expectTargetsLargeEnough(
        page,
        '[role="alertdialog"]',
        "the delete-blocked dialog",
      );
      await shootViewport(page, "390-d5d-delete-blocked");
      await blocked
        .getByRole("button", {
          name: romanian("priceDashboard.lifecycle.deactivateInstead"),
          exact: true,
        })
        .tap();
      await expect(
        itemDialogOf(page).getByRole("heading", { level: 2 }),
      ).toHaveText(
        romanian("priceDashboard.lifecycle.deactivateTitle", {
          name: MDF_NAME,
        }),
      );
      await itemDialogOf(page)
        .getByRole("button", { name: CONFIRM_SWITCH_OFF(), exact: true })
        .tap();
      await menuEntryOf(mdf, words, "delete").tap();
      await expect(
        itemDialogOf(page).getByRole("button"),
        "an inactive material that is used has only Close",
      ).toHaveText([romanian("priceDashboard.common.close")]);
      await itemDialogOf(page).getByRole("button").tap();

      const veneer = rowOf(page, VENEER);
      await menuButtonOf(veneer).tap();
      await menuEntryOf(veneer, words, "delete").tap();
      const asking = itemDialogOf(page);
      expect(plainText(await asking.innerText())).toContain(
        romanian("priceDashboard.lifecycle.deleteBody"),
      );
      await asking
        .getByRole("button", {
          name: romanian("priceDashboard.common.delete"),
          exact: true,
        })
        .tap();

      // R4a has not built the draft route's deletion yet (`draft-address.ts` reads no `item-deleted`), so the route
      // refuses it with a 400: the dialog stays, says so, and the draft is untouched. When R4a lands this assertion is
      // the one to change, to the deletion in De publicat and the pending count of 1.
      await expect(
        asking.getByText(romanian("priceDashboard.errors.saveFailed")),
        "the refused deletion is said in the dialog, not silently dropped",
      ).toBeVisible();
      expect(await draftChanges(page)).toEqual([]);
      await shootForReview(page, "390-d5d-veneer-delete-refused");
      expectBrowsersNoteOf(pageErrors, 400);
    });
  });
});

/** The dialog lies wholly inside the screen: a phone's dialog is not taller than the screen nor wider. */
async function expectDialogFitsScreen(dialog: Locator): Promise<void> {
  const box = await boxOf(dialog);
  expect(box.x, "left").toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, "right").toBeLessThanOrEqual(PHONE.width);
  expect(box.y, "top").toBeGreaterThanOrEqual(0);
  expect(box.y + box.height, "bottom").toBeLessThanOrEqual(PHONE.height);
}

/**
 * Takes out of the page's errors the browser's one console line for an answer of this status, which the test provoked.
 */
function expectBrowsersNoteOf(pageErrors: string[], status: number): void {
  const note = `console: Failed to load resource: the server responded with a status of ${String(status)}`;
  const rest = pageErrors.filter((entry) => !entry.startsWith(note));
  expect(
    pageErrors.length - rest.length,
    `the browser's note of the ${String(status)}`,
  ).toBe(1);
  pageErrors.splice(0, pageErrors.length, ...rest);
}
