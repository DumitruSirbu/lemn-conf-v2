// Where an item's page states whether customers are given it, and its one named button (ADR 0184): found by the status
// line the section draws, so a banner that carries its own "Activează" is never mistaken for it.
import { requireIn } from "../support/render-with-intl";

const STATUS = '[data-testid="item-status"]';

/** The status line: the label and the "Activ" / "Inactiv" badge. */
export function availabilityStatusIn(container: ParentNode): HTMLElement {
  return requireIn(container, STATUS);
}

/** The badge's words. */
export function availabilityBadgeTextIn(container: ParentNode): string {
  return requireIn(availabilityStatusIn(container), "[data-state]").textContent;
}

/** The button under the status line, or null where the page draws none (an item the draft deletes). */
export function availabilityActionOrNullIn(
  container: ParentNode,
): HTMLButtonElement | null {
  const status = container.querySelector(STATUS);
  let sibling = status?.nextElementSibling ?? null;
  while (sibling !== null && !(sibling instanceof HTMLButtonElement)) {
    sibling = sibling.nextElementSibling;
  }
  return sibling;
}

/** The button under the status line. */
export function availabilityActionIn(container: ParentNode): HTMLButtonElement {
  const action = availabilityActionOrNullIn(container);
  if (action === null) throw new Error("the page draws no availability button");
  return action;
}
