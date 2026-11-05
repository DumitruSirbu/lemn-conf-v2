import {
  expect,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

import { expectHydrated } from "./cabinet-detail-page";
import { openNewClass, RATE_FIELDS } from "./hardware-page";
import {
  createButton,
  createPageOf,
  linkSelect,
  openNewAccessory,
} from "./accessory-page";
import { STATE_ROUTE } from "./price-dashboard-session";
import { openPublish, revertButtons, wordsOf } from "./publish-page";
import { romanian } from "./staff-world";

// One creation, from the form to the publish page's arrow, in a browser: a class and an accessory are created, their draft
// is read back from the server's own state, each is renamed from its own page and reloaded, and each is taken away by the
// arrow of its row on the publish page. Nothing here publishes. The viewport and the way a control is pressed (a tap or a
// click) are the spec's.

export type Press = (control: Locator) => Promise<void>;

export interface CreationRun {
  readonly page: Page;
  readonly context: BrowserContext;
  readonly press: Press;
  /** Saves a screenshot for the visual review under the name; a run with no directory asked for saves nothing. */
  readonly shoot: (name: string) => Promise<void>;
}

interface ReadChange {
  readonly address: {
    readonly kind?: unknown;
    readonly tierId?: unknown;
    readonly accessoryId?: unknown;
    readonly field?: unknown;
  };
  readonly value: unknown;
}

const MINTED_ID = /^[A-Za-z0-9]{21}$/;
const CLASS_NAME = "Clasa de proba";
const CLASS_DESCRIPTION = "Mecanisme simple";
const RENAMED_CLASS = "Clasa redenumita";
const ACCESSORY_NAME = "Suport de proba";
const RENAMED_ACCESSORY = "Suport redenumit";
const LEI_PER_RATE = ["10", "20", "30", "40", "50"] as const;
const BANI_PER_LEU = 100;
const ACCESSORY_LEI = "80";

export async function draftChangesOf(
  context: BrowserContext,
): Promise<readonly ReadChange[]> {
  const state = await context.request.get(STATE_ROUTE);
  expect(state.status(), "the dashboard's state").toBe(200);
  const body = (await state.json()) as {
    draft: { changes: readonly ReadChange[] };
  };
  return body.draft.changes;
}

function creationOf(
  changes: readonly ReadChange[],
  kind: "hardware-tier-created" | "accessory-created",
): ReadChange {
  const creation = changes.find(({ address }) => address.kind === kind);
  if (creation === undefined) throw new Error(`the draft holds no ${kind}`);
  return creation;
}

/** Fills the new class form and creates it; answers the id the server minted, with the page still on the form. */
export async function createAClass(run: CreationRun): Promise<string> {
  const { page, context, press, shoot } = run;
  const words = wordsOf("ro");
  await openNewClass(page);
  const form = page.getByTestId("hardware-create");
  await form
    .getByLabel(words("priceDashboard.hardware.nameLabel"), { exact: true })
    .fill(CLASS_NAME);
  await form
    .getByLabel(words("priceDashboard.hardware.descriptionLabel"), {
      exact: true,
    })
    .fill(CLASS_DESCRIPTION);
  for (const [index, field] of RATE_FIELDS.entries()) {
    await form
      .getByLabel(words(`priceDashboard.hardware.${rateLeafOf(field)}`), {
        exact: true,
      })
      .fill(LEI_PER_RATE[index] ?? "");
  }
  const create = form.getByRole("button", {
    name: romanian("priceDashboard.hardware.createAction"),
    exact: true,
  });
  await expect(create, "every value is valid, so Create is on").toBeEnabled();
  await shoot("hardware-form-filled");

  await press(create);

  await expect(form).toContainText(
    romanian("priceDashboard.hardware.createdNotice"),
  );
  await shoot("hardware-created");
  const changes = await draftChangesOf(context);
  const creation = creationOf(changes, "hardware-tier-created");
  const tierId = String(creation.address.tierId);
  expect(tierId, "an id the server minted").toMatch(MINTED_ID);
  expect(changes.indexOf(creation), "and stands first").toBe(0);
  expect(creation.value).toEqual({
    name: CLASS_NAME,
    description: CLASS_DESCRIPTION,
  });
  expect(
    changes.slice(1).map(({ address, value }) => [address.field, value]),
    "a rate for each mechanism, in bani",
  ).toEqual(
    RATE_FIELDS.map((field, index) => [
      field,
      Number(LEI_PER_RATE[index]) * BANI_PER_LEU,
    ]),
  );
  expect(
    changes.slice(1).every(({ address }) => address.tierId === tierId),
  ).toBe(true);
  return tierId;
}

export async function createAndRenameAClass(run: CreationRun): Promise<void> {
  const { page, context, press, shoot } = run;
  const words = wordsOf("ro");
  const tierId = await createAClass(run);
  const form = page.getByTestId("hardware-create");

  await press(
    form.getByRole("link", { name: romanian("priceDashboard.common.edit") }),
  );
  await expectHydrated(page, "hardware-edit");
  const edit = page.getByTestId("hardware-edit");
  const nameField = edit.getByLabel(
    words("priceDashboard.hardware.nameLabel"),
    { exact: true },
  );
  await expect(nameField).toHaveValue(CLASS_NAME);
  await shoot("hardware-created-page");
  await nameField.fill(RENAMED_CLASS);
  await press(
    edit.getByRole("button", {
      name: romanian("priceDashboard.hardware.renameAction"),
      exact: true,
    }),
  );
  await expect
    .poll(async () => renamedTo(await draftChangesOf(context)), {
      message: "the rename reached the draft",
    })
    .toBe(RENAMED_CLASS);
  await page.reload();
  await expectHydrated(page, "hardware-edit");
  await expect(
    page
      .getByTestId("hardware-edit")
      .getByLabel(words("priceDashboard.hardware.nameLabel"), { exact: true }),
    "the new name survives a reload",
  ).toHaveValue(RENAMED_CLASS);

  await takeTheRowBackFromThePublishPage(run, "hardware-created", tierId);
}

/** Fills the new accessory form and creates it; answers the id the server minted, with the page still on the form. */
export async function createAnAccessory(run: CreationRun): Promise<string> {
  const { page, context, press, shoot } = run;
  const words = wordsOf("ro");
  await openNewAccessory(page);
  const form = createPageOf(page);
  await form
    .getByLabel(words("priceDashboard.accessories.nameLabel"), { exact: true })
    .fill(ACCESSORY_NAME);
  await linkSelect(page, words).selectOption({ index: 1 });
  await form
    .getByLabel(words("priceDashboard.accessories.pricePerPiece"), {
      exact: true,
    })
    .fill(ACCESSORY_LEI);
  await expect(
    createButton(page, words),
    "every value is valid, so Create is on",
  ).toBeEnabled();
  await shoot("accessory-form-filled");

  await press(createButton(page, words));

  await expect(form).toContainText(
    romanian("priceDashboard.accessories.createdNotice"),
  );
  await shoot("accessory-created");
  const changes = await draftChangesOf(context);
  const creation = creationOf(changes, "accessory-created");
  const accessoryId = String(creation.address.accessoryId);
  expect(accessoryId, "an id the server minted").toMatch(MINTED_ID);
  expect(
    changes,
    "one change: the price lies inside the creation",
  ).toHaveLength(1);
  expect(creation.value).toMatchObject({
    name: ACCESSORY_NAME,
    perUnitMinor: Number(ACCESSORY_LEI) * BANI_PER_LEU,
  });
  return accessoryId;
}

export async function createAndRenameAnAccessory(
  run: CreationRun,
): Promise<void> {
  const { page, context, press, shoot } = run;
  const words = wordsOf("ro");
  const accessoryId = await createAnAccessory(run);
  const form = createPageOf(page);

  await press(
    form.getByRole("link", { name: romanian("priceDashboard.common.edit") }),
  );
  await expectHydrated(page, "accessory-edit");
  const edit = page.getByTestId("accessory-edit");
  const nameField = edit.getByLabel(
    words("priceDashboard.accessories.nameLabel"),
    { exact: true },
  );
  await expect(nameField).toHaveValue(ACCESSORY_NAME);
  await nameField.fill(RENAMED_ACCESSORY);
  await press(
    edit.getByRole("button", {
      name: romanian("priceDashboard.accessories.renameAction"),
      exact: true,
    }),
  );
  await expect
    .poll(async () => renamedTo(await draftChangesOf(context)), {
      message: "the rename reached the draft",
    })
    .toBe(RENAMED_ACCESSORY);
  await page.reload();
  await expectHydrated(page, "accessory-edit");
  await expect(
    page
      .getByTestId("accessory-edit")
      .getByLabel(words("priceDashboard.accessories.nameLabel"), {
        exact: true,
      }),
    "the new name survives a reload",
  ).toHaveValue(RENAMED_ACCESSORY);
  await shoot("accessory-created-page");

  await takeTheRowBackFromThePublishPage(run, "accessory-created", accessoryId);
}

/** The publish page draws the created row with an arrow, no rate or price of it has one, and the arrow takes it away whole. */
async function takeTheRowBackFromThePublishPage(
  run: CreationRun,
  rowKind: "hardware-created" | "accessory-created",
  id: string,
): Promise<void> {
  const { page, context, press, shoot } = run;
  await openPublish(page);
  const row = page.locator(
    `[data-testid="diff-row"][data-row-kind="${rowKind}"]`,
  );
  await expect(row, `${id} is one row of the page`).toHaveCount(1);
  await expect(row.getByTestId("diff-revert")).toHaveCount(1);
  const fieldLines = page.locator('[data-testid="diff-row"][data-unchanged]');
  await expect(fieldLines.first(), "its price lines are drawn").toBeVisible();
  await expect(
    fieldLines.getByTestId("diff-revert"),
    "and none of them has an arrow of its own",
  ).toHaveCount(0);
  await shoot(`${rowKind}-publish-page`);

  await press(row.getByTestId("diff-revert"));

  await expect
    .poll(async () => (await draftChangesOf(context)).length, {
      message: "the arrow took the whole row away",
    })
    .toBe(0);
  await expect(revertButtons(page)).toHaveCount(0);
}

function renamedTo(changes: readonly ReadChange[]): unknown {
  return changes.find(
    ({ address }) =>
      address.kind === "created-row-text" && address.field === "name",
  )?.value;
}

const RATE_LEAF = {
  perHingeMinor: "priceHinge",
  perDrawerMinor: "priceSlide",
  perPushToOpenMinor: "pricePush",
  perLiftMinor: "priceLift",
  perPushRunnerMinor: "pricePushRunner",
} as const;

function rateLeafOf(field: (typeof RATE_FIELDS)[number]): string {
  return RATE_LEAF[field];
}
