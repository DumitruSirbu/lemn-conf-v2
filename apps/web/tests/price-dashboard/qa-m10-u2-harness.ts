// What the adversarial DOM tests of wave U2 share: the cabinet list mounted over a draft client that judges as the
// routes do, a page built from any price book (the fixture of the wave's own tests is the sample book alone), and the
// few gestures a person makes. Nothing here asserts; a test says what it expects.
import { act, createElement } from "react";

import {
  SAMPLE_PRICE_BOOK,
  type DraftChange,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { CabinetListEditor } from "@/price-dashboard/cabinet-list-editor";
import type { CabinetListPageInput } from "@/price-dashboard/cabinet-list-facts";
import type { PriceDraftClient } from "@/price-dashboard/price-draft-client";
import type { DashboardStateWire } from "@/price-dashboard/price-dashboard-wire-contract";

import { flushPromises } from "../support/render-hook";
import {
  allIn,
  click,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";
import { cabinetNamesOf } from "./dashboard-state-fixture";
import {
  inMemoryPriceDraftClient,
  type InMemoryPriceDraftClient,
} from "./in-memory-price-draft-client";
import { roCopy } from "./romanian-copy";
import { contextOf } from "./staff-frame-harness";

export const BASE_RULE = "cabinet.base-cabinet";
export const SECOND_RULE = "cabinet.base-3drawer";
export const PER_SIZE_RULE = "cabinet.base-hob-2drawer";

/** The sample book with one cabinet's anchor replaced, as a stored book of an earlier time could hold it. */
export function bookWithAnchor(ruleId: string, anchorMinor: number): PriceBook {
  return {
    ...SAMPLE_PRICE_BOOK,
    cabinetRules: SAMPLE_PRICE_BOOK.cabinetRules.map((rule) =>
      rule.ruleId === ruleId
        ? ({
            ...rule,
            formula: { ...rule.formula, anchorMinor },
          } as typeof rule)
        : rule,
    ),
  };
}

export function pageOfBook(
  book: PriceBook,
  changes: readonly DraftChange[] = [],
  draftRevision = "1",
): CabinetListPageInput {
  const state: DashboardStateWire = {
    active: {
      versionId: "version-1",
      book,
      availability: { revision: "0", disabled: [] },
      sequenceNumber: 1,
      label: "Sample",
      publishedAt: "2026-10-01T00:00:00.000Z",
    },
    draft: { draftRevision, changes },
  };
  return { state, cabinetNames: cabinetNamesOf(book) };
}

export interface MountedEditor {
  readonly container: HTMLElement;
  readonly server: InMemoryPriceDraftClient;
  readonly unmount: () => void;
}

/** The editor over the in-memory server, or over `client` when a test supplies the transport itself. */
export async function mountEditor(
  page: CabinetListPageInput,
  options: {
    readonly locale?: TestLocale;
    readonly client?: PriceDraftClient;
  } = {},
): Promise<MountedEditor> {
  const locale = options.locale ?? "ro";
  const server = inMemoryPriceDraftClient(page.state);
  const screen: MountedScreen = mountInCatalogue(
    createElement(CabinetListEditor, {
      locale,
      context: contextOf("administrator", ["kitchens", "cabinets", "publish"]),
      page,
      client: options.client ?? server.client,
    }),
    locale,
  );
  await flushPromises(5);
  return { container: screen.container, server, unmount: screen.unmount };
}

export function rowOf(container: HTMLElement, ruleId: string): HTMLElement {
  const found = allIn(container, '[data-testid="cabinet-row"]').find(
    (row) => row.dataset.ruleId === ruleId,
  );
  if (found === undefined) throw new Error(`no row for ${ruleId}`);
  return found;
}

export function priceButtonOf(
  container: HTMLElement,
  ruleId: string,
): HTMLButtonElement {
  const names = cabinetNamesOf(SAMPLE_PRICE_BOOK);
  const name = names[ruleId.replace("cabinet.", "")] ?? ruleId;
  return requireIn<HTMLButtonElement>(
    rowOf(container, ruleId),
    `button[aria-label="${roCopy("priceDashboard.cabinets.editPriceAria", { name })}"]`,
  );
}

export function openPriceField(
  container: HTMLElement,
  ruleId: string,
): HTMLInputElement {
  click(priceButtonOf(container, ruleId));
  return requireIn<HTMLInputElement>(rowOf(container, ruleId), "input");
}

export function keyDownOn(input: HTMLElement, key: "Enter" | "Escape"): void {
  input.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
  );
}

export async function press(
  input: HTMLElement,
  key: "Enter" | "Escape",
): Promise<void> {
  act(() => {
    keyDownOn(input, key);
  });
  await flushPromises(5);
}

export function alertIn(scope: ParentNode): HTMLElement | null {
  return scope.querySelector('[role="alert"]');
}

export function pendingChipOf(container: HTMLElement): string {
  return requireIn(container, '[data-testid="staff-pending-prices"]')
    .textContent;
}

export function isOpenIn(row: HTMLElement): boolean {
  return row.querySelector("input") !== null;
}
