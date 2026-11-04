// What the DOM tests of one cabinet's page share: the page mounted over a draft client that judges as the dashboard's
// routes do, a page built from any price book, and the few gestures a person makes. Nothing here asserts.
import { act, createElement } from "react";

import type {
  CabinetPriceRule,
  PriceBook,
} from "@lemnaria/configurator-domain";

import { CabinetDetailEditor } from "@/price-dashboard/cabinet-detail";
import type { CabinetListPageInput } from "@/price-dashboard/cabinet-list-facts";
import type { PriceDraftClient } from "@/price-dashboard/price-draft-client";

import { flushPromises } from "../support/render-hook";
import {
  allIn,
  click,
  mountInCatalogue,
  requireIn,
  typeInto,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";
import { pageOf } from "./dashboard-state-fixture";
import {
  inMemoryPriceDraftClient,
  type InMemoryPriceDraftClient,
} from "./in-memory-price-draft-client";
import { roCopy } from "./romanian-copy";
import { contextOf } from "./staff-frame-harness";

export const BASE_RULE = "cabinet.base-cabinet";
export const WALL_RULE = "cabinet.wall-cabinet";
export const PANTRY_RULE = "cabinet.tall-pantry";
export const THREE_DRAWER_RULE = "cabinet.base-3drawer";
export const PER_SIZE_RULE = "cabinet.base-bottle-cargo";
export const HOB_RULE = "cabinet.base-hob-2drawer";
export const CORNER_RULE = "cabinet.base-corner-return-320";
export const HOOD_RULE = "cabinet.hood";
export const FRIDGE_RULE = "cabinet.fridge-free";
export const SINK_RULE = "cabinet.base-sink";

export interface MountedDetail {
  readonly container: HTMLElement;
  readonly server: InMemoryPriceDraftClient;
  readonly unmount: () => void;
}

export async function mountDetail(
  ruleId: string,
  options: {
    readonly page?: CabinetListPageInput;
    readonly locale?: TestLocale;
    readonly client?: PriceDraftClient;
  } = {},
): Promise<MountedDetail> {
  const page = options.page ?? pageOf();
  const locale = options.locale ?? "ro";
  const server = inMemoryPriceDraftClient(page.state);
  const screen: MountedScreen = mountInCatalogue(
    createElement(CabinetDetailEditor, {
      locale,
      context: contextOf("administrator", ["kitchens", "cabinets", "publish"]),
      page,
      ruleId,
      client: options.client ?? server.client,
    }),
    locale,
  );
  await flushPromises(5);
  return { container: screen.container, server, unmount: screen.unmount };
}

/** The input of the field labelled `label`. */
export function fieldNamed(
  container: HTMLElement,
  label: string,
): HTMLInputElement {
  const labelled = allIn<HTMLLabelElement>(container, "label").find(
    (candidate) => candidate.textContent.trim() === label,
  );
  if (labelled === undefined)
    throw new Error(`no field is labelled "${label}"`);
  return requireIn<HTMLInputElement>(
    container,
    `#${CSS.escape(labelled.htmlFor)}`,
  );
}

export function fieldLabels(container: HTMLElement): string[] {
  return allIn<HTMLLabelElement>(container, ".sr-none, label")
    .filter((label) => label.htmlFor !== "")
    .map((label) => label.textContent.trim());
}

export function typeInField(
  container: HTMLElement,
  label: string,
  text: string,
): void {
  typeInto(fieldNamed(container, label), text);
}

export function buttonNamed(
  container: HTMLElement,
  words: string,
): HTMLButtonElement {
  const found = allIn<HTMLButtonElement>(container, "button").find(
    (button) => button.textContent.trim() === words,
  );
  if (found === undefined) throw new Error(`no button says "${words}"`);
  return found;
}

export async function press(button: HTMLElement): Promise<void> {
  click(button);
  await flushPromises(10);
}

export const saveWords = () => roCopy("priceDashboard.common.save");
export const cancelWords = () => roCopy("priceDashboard.common.cancel");

export function previewCells(container: HTMLElement): string[][] {
  return allIn(container, '[data-testid="cabinet-preview"] tbody tr').map(
    (row) => allIn(row, "th, td").map((cell) => cell.textContent.trim()),
  );
}

export function alertsIn(scope: ParentNode): string[] {
  return allIn(scope as HTMLElement, '[role="alert"]').map((alert) =>
    alert.textContent.trim(),
  );
}

export async function settle(): Promise<void> {
  await act(async () => {
    await flushPromises(10);
  });
}

/** The rule of a book, or a failure that names it: a test never reads past a rule that is not there. */
export function ruleOf(book: PriceBook, ruleId: string): CabinetPriceRule {
  const found = book.cabinetRules.find((rule) => rule.ruleId === ruleId);
  if (found === undefined) throw new Error(`the book holds no ${ruleId}`);
  return found;
}

/** The item at an index, or a failure that names the index. */
export function atIndex<Item>(items: readonly Item[], index: number): Item {
  const found = items[index];
  if (found === undefined) throw new Error(`nothing at index ${String(index)}`);
  return found;
}

/** The switch whose text holds `words`. */
export function switchHolding(
  container: HTMLElement,
  words: string,
): HTMLButtonElement {
  const found = allIn<HTMLButtonElement>(container, '[role="switch"]').find(
    (candidate) => candidate.textContent.includes(words),
  );
  if (found === undefined) throw new Error(`no switch says "${words}"`);
  return found;
}
