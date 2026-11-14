import type { Locator, Page } from "@playwright/test";

// Where an item's page (a hardware class, a material, an accessory) states whether customers are given it, and its one
// named button (ADR 0184). The button is found beside the status line rather than by its name, which changes with the
// state and which an inactive material's banner also carries ("Activează").

function statusLineOf(page: Page): Locator {
  return page.getByTestId("item-status");
}

/** The button under the status line: "Dezactivează" while the item is active, "Activează" while it is not. */
export function availabilityAction(page: Page): Locator {
  return statusLineOf(page).locator("xpath=following-sibling::button[1]");
}

/** The badge of the status line: "Activ" or "Inactiv". */
export function availabilityBadge(page: Page): Locator {
  return statusLineOf(page).locator("[data-state]");
}
