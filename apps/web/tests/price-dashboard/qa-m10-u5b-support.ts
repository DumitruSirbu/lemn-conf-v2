// What the adversarial tests of the publish page's follow-ups share: the sample book's two cabinet anchors raised into a
// draft, the rows and fields they draw, and the steps that ask a publish. Nothing here asserts.
import type { DraftChange } from "@lemnaria/configurator-domain";

import type { DashboardStateWire } from "@/price-dashboard/price-dashboard-wire-contract";
import { SAMPLE_PUBLISH_PAGE } from "@/price-dashboard/publish-sample";

import {
  allIn,
  byWords,
  click,
  requireIn,
  typeInto,
} from "../support/render-with-intl";
import { inputWithDraft, settle } from "./publish-desk-harness";
import { roCopy } from "./romanian-copy";
import { change } from "./publish-structural-rows.support";

const BOOK = SAMPLE_PUBLISH_PAGE.state.active.book;
export const LEI = 100;
export const BASE_ANCHOR = {
  kind: "cabinet",
  ruleId: "cabinet.base-cabinet",
  field: "anchorMinor",
} as const;
export const WALL_ANCHOR = {
  kind: "cabinet",
  ruleId: "cabinet.wall-cabinet",
  field: "anchorMinor",
} as const;

export function anchorOf(ruleId: string): number {
  const formula = BOOK.cabinetRules.find(
    (rule) => rule.ruleId === ruleId,
  )?.formula;
  if (formula === undefined || !("anchorMinor" in formula)) {
    throw new Error(`${ruleId} has no anchor`);
  }
  return formula.anchorMinor;
}

export const TWO_AMOUNT_ROWS: readonly DraftChange[] = [
  change(BASE_ANCHOR, anchorOf(BASE_ANCHOR.ruleId) + 60 * LEI),
  change(WALL_ANCHOR, anchorOf(WALL_ANCHOR.ruleId) + 30 * LEI),
];

export function stateAt(
  revision: string,
  changes: readonly DraftChange[] = TWO_AMOUNT_ROWS,
): DashboardStateWire {
  return inputWithDraft(changes, revision).state;
}

export function nameOfRule(ruleId: string): string {
  const buildId = BOOK.cabinetRules.find(
    (rule) => rule.ruleId === ruleId,
  )?.buildId;
  const name =
    buildId === undefined
      ? undefined
      : SAMPLE_PUBLISH_PAGE.cabinetNames[buildId];
  if (name === undefined) throw new Error(`${ruleId} has no name`);
  return name;
}

export function rowOfRule(container: HTMLElement, ruleId: string): HTMLElement {
  const name = nameOfRule(ruleId);
  const found = allIn(container, '[data-testid="diff-row"]').find(
    (row) => row.querySelector('[class*="name"]')?.textContent === name,
  );
  if (found === undefined) throw new Error(`no row for ${ruleId}`);
  return found;
}

export function openFieldOf(
  container: HTMLElement,
  ruleId: string,
): HTMLInputElement {
  click(
    requireIn<HTMLButtonElement>(
      rowOfRule(container, ruleId),
      'button[class*="priceButton"]',
    ),
  );
  return requireIn<HTMLInputElement>(rowOfRule(container, ruleId), "input");
}

/** Types a name, presses "Publică" and confirms: the publish request is then out, or has been answered. */
export async function askToPublish(container: HTMLElement): Promise<void> {
  typeInto(
    requireIn<HTMLInputElement>(container, 'input[type="text"]'),
    "Ajustari",
  );
  click(requireIn(container, '[class*="primary"]'));
  click(
    byWords(
      document.body,
      "button",
      roCopy("priceDashboard.publish.confirmAction"),
    ),
  );
  await settle();
}
