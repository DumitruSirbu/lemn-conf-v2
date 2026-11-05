import { expect, type BrowserContext, type Page } from "@playwright/test";

import {
  createButton,
  createPageOf,
  linkSelect,
  openNewAccessory,
} from "./accessory-page";
import { openNewClass, RATE_FIELDS } from "./hardware-page";
import { wordsOf } from "./publish-page";
import { romanian } from "./staff-world";

// A created row with a name the test chooses, made through the same forms a person fills, so a list can be looked at with
// a row whose name is as long as the form allows. The page is left on the form, as the creation flow's own are.

export type CreateNamed = (
  page: Page,
  context: BrowserContext,
  name: string,
) => Promise<void>;

const RATE_LEAF = {
  perHingeMinor: "priceHinge",
  perDrawerMinor: "priceSlide",
  perPushToOpenMinor: "pricePush",
  perLiftMinor: "priceLift",
  perPushRunnerMinor: "pricePushRunner",
} as const;
const ACCESSORY_LEI = "80";
const LEI_PER_RATE = ["10", "20", "30", "40", "50"] as const;

export const createLongNamedAccessory: CreateNamed = async (page, _, name) => {
  const words = wordsOf("ro");
  await openNewAccessory(page);
  const form = createPageOf(page);
  await form
    .getByLabel(words("priceDashboard.accessories.nameLabel"), { exact: true })
    .fill(name);
  await linkSelect(page, words).selectOption({ index: 1 });
  await form
    .getByLabel(words("priceDashboard.accessories.pricePerPiece"), {
      exact: true,
    })
    .fill(ACCESSORY_LEI);
  await expect(createButton(page, words)).toBeEnabled();
  await createButton(page, words).click();
  await expect(form).toContainText(
    romanian("priceDashboard.accessories.createdNotice"),
  );
};

export const createLongNamedClass: CreateNamed = async (page, _, name) => {
  const words = wordsOf("ro");
  await openNewClass(page);
  const form = page.getByTestId("hardware-create");
  await form
    .getByLabel(words("priceDashboard.hardware.nameLabel"), { exact: true })
    .fill(name);
  await form
    .getByLabel(words("priceDashboard.hardware.descriptionLabel"), {
      exact: true,
    })
    .fill(name);
  for (const [index, field] of RATE_FIELDS.entries()) {
    await form
      .getByLabel(words(`priceDashboard.hardware.${RATE_LEAF[field]}`), {
        exact: true,
      })
      .fill(LEI_PER_RATE[index] ?? "");
  }
  const create = form.getByRole("button", {
    name: romanian("priceDashboard.hardware.createAction"),
    exact: true,
  });
  await expect(create).toBeEnabled();
  await create.click();
  await expect(form).toContainText(
    romanian("priceDashboard.hardware.createdNotice"),
  );
};
