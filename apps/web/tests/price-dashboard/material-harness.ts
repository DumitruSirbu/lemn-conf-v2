// What the DOM tests of the materials screens share: a page built from the sample book, the screens mounted over a draft
// client and a lifecycle client that judge as the routes do, and the few gestures a person makes. Nothing here asserts.
import { act, createElement } from "react";

import {
  previewCabinet,
  SAMPLE_PRICE_BOOK,
  type CatalogueAvailability,
  type DraftChange,
  type ItemRef,
  type ItemUsageCounts,
  type NewKitchenSettings,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { shippedDeepeningRows } from "@/price/deepening-rows";
import {
  EXAMPLE_BUILD_ID,
  EXAMPLE_WIDTH_MM,
} from "@/price-dashboard/material-example";
import { priceDashboardCatalogue } from "@/price-dashboard/price-dashboard-catalogue";

import type { ItemLifecycleClient } from "@/price-dashboard/item-lifecycle-client";
import { MaterialEditScreen } from "@/price-dashboard/material-edit";
import { MaterialListScreen } from "@/price-dashboard/material-list";
import type { MaterialPageInput } from "@/price-dashboard/material-model";
import type { PriceDraftClient } from "@/price-dashboard/price-draft-client";

import { flushPromises } from "../support/render-hook";
import {
  allIn,
  click,
  mountInCatalogue,
  requireIn,
  type MountedScreen,
  type TestLocale,
} from "../support/render-with-intl";
import { stateOf } from "./dashboard-state-fixture";
import {
  inMemoryPriceDraftClient,
  type InMemoryPriceDraftClient,
} from "./in-memory-price-draft-client";
import {
  recordingLifecycleClient,
  type RecordingLifecycleClient,
} from "./recording-item-lifecycle-client";
import { roCopy } from "./romanian-copy";
import { contextOf } from "./staff-frame-harness";

export const PAL = "material.melamine";
export const MDF = "material.painted-mdf";
export const VENEER = "material.veneer";

export const PAL_NAME = roCopy("priceBook.material.melamine.name");
export const MDF_NAME = roCopy("priceBook.material.painted-mdf.name");
export const VENEER_NAME = roCopy("priceBook.material.veneer.name");

export const materialItem = (tierId: string): ItemRef => ({
  kind: "material",
  tierId,
});

/** How many saved kitchens use each material, by the counts the stand-in is seeded with. */
export const USAGE: ItemUsageCounts = [
  { item: materialItem(PAL), designCount: 31 },
  { item: materialItem(MDF), designCount: 23 },
  { item: materialItem(VENEER), designCount: 0 },
];

export interface PageOptions {
  readonly changes?: readonly DraftChange[];
  readonly disabled?: readonly ItemRef[];
  /** The saved defaults; `{}` is none saved, and `undefined` is unreadable. */
  readonly defaults?: NewKitchenSettings | undefined;
  /** What the usage reader counts; `undefined` counts nothing, as a production build does. */
  readonly usage?: ItemUsageCounts | undefined;
}

export function materialPageOf(options: PageOptions = {}): MaterialPageInput {
  const base = stateOf(options.changes ?? []);
  const availability: CatalogueAvailability = {
    revision: "1",
    disabled: options.disabled ?? [],
  };
  return {
    state: { ...base, active: { ...base.active, availability } },
    defaults: "defaults" in options ? options.defaults : {},
    sampleUsage: "usage" in options ? options.usage : USAGE,
  };
}

export interface MountedMaterials {
  readonly container: HTMLElement;
  readonly draftServer: InMemoryPriceDraftClient;
  readonly lifecycle: RecordingLifecycleClient;
  readonly unmount: () => void;
}

interface MountOptions {
  readonly locale?: TestLocale;
  readonly lifecycleClient?: ItemLifecycleClient;
  readonly draftClient?: PriceDraftClient;
}

const NAVIGATION = ["kitchens", "materials", "publish"] as const;

function worldOf(page: MaterialPageInput) {
  return {
    draftServer: inMemoryPriceDraftClient(page.state),
    lifecycle: recordingLifecycleClient({
      book: page.state.active.book,
      availability: page.state.active.availability,
      defaults: page.defaults,
      usage: page.sampleUsage ?? [],
    }),
  };
}

export async function mountMaterialList(
  page: MaterialPageInput,
  options: MountOptions = {},
): Promise<MountedMaterials> {
  const locale = options.locale ?? "ro";
  const world = worldOf(page);
  const screen: MountedScreen = mountInCatalogue(
    createElement(MaterialListScreen, {
      locale,
      context: contextOf("administrator", NAVIGATION),
      page,
      client: options.draftClient ?? world.draftServer.client,
      lifecycleClient: options.lifecycleClient ?? world.lifecycle.client,
    }),
    locale,
  );
  await flushPromises(5);
  return { container: screen.container, ...world, unmount: screen.unmount };
}

export async function mountMaterialEdit(
  tierId: string,
  page: MaterialPageInput,
  options: MountOptions = {},
): Promise<MountedMaterials> {
  const locale = options.locale ?? "ro";
  const world = worldOf(page);
  const screen: MountedScreen = mountInCatalogue(
    createElement(MaterialEditScreen, {
      locale,
      context: contextOf("administrator", NAVIGATION),
      page,
      tierId,
      client: options.draftClient ?? world.draftServer.client,
      lifecycleClient: options.lifecycleClient ?? world.lifecycle.client,
    }),
    locale,
  );
  await flushPromises(5);
  return { container: screen.container, ...world, unmount: screen.unmount };
}

export function rowOf(container: HTMLElement, tierId: string): HTMLElement {
  const found = allIn(container, '[data-testid="material-row"]').find(
    (row) => row.dataset.tierId === tierId,
  );
  if (found === undefined) throw new Error(`no row for ${tierId}`);
  return found;
}

export function chipsOf(container: HTMLElement, tierId: string): string[] {
  return allIn(rowOf(container, tierId), '[data-testid="material-chip"]').map(
    (chip) => chip.textContent,
  );
}

/** The "⋯" of a material's row, found by the sentence that names it. */
export function moreButtonOf(
  container: HTMLElement,
  tierId: string,
  name: string,
): HTMLButtonElement {
  return requireIn<HTMLButtonElement>(
    rowOf(container, tierId),
    `button[aria-label="${roCopy("priceDashboard.common.moreActionsFor", { name })}"]`,
  );
}

export async function openMenuOf(
  container: HTMLElement,
  tierId: string,
  name: string,
): Promise<void> {
  click(moreButtonOf(container, tierId, name));
  await flushPromises(2);
}

export function menuEntry(
  container: HTMLElement,
  tierId: string,
  words: string,
): HTMLButtonElement {
  const found = allIn<HTMLButtonElement>(
    rowOf(container, tierId),
    "ul button",
  ).find((button) => button.textContent.trim() === words);
  if (found === undefined) throw new Error(`no menu entry says "${words}"`);
  return found;
}

/** The sentence a control is described by: why it is off. */
export function reasonOf(control: HTMLElement): string | undefined {
  return (
    document.getElementById(control.getAttribute("aria-describedby") ?? "")
      ?.textContent ?? undefined
  );
}

export function pendingChipText(container: HTMLElement): string | undefined {
  return container.querySelector('[data-testid="staff-pending-prices"]')
    ?.textContent;
}

export const SAMPLE_MATERIALS = SAMPLE_PRICE_BOOK.material.tiers;

export async function press(element: HTMLElement): Promise<void> {
  click(element);
  await act(async () => {
    await flushPromises(10);
  });
}

export function openDialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    '[role="alertdialog"], [role="dialog"]',
  );
}

export function dialogButton(
  dialog: HTMLElement,
  words: string,
): HTMLButtonElement {
  const found = allIn<HTMLButtonElement>(dialog, "button").find(
    (button) => button.textContent.trim() === words,
  );
  if (found === undefined) throw new Error(`no dialog button says "${words}"`);
  return found;
}

/** What `previewCabinet` says the example cabinet costs: the one place the arithmetic lives, asked here without going
 *  through the module that chooses the request. */
export function previewedPrice(
  book: PriceBook,
  material: string,
  depth: number,
): number {
  const rule = book.cabinetRules.find(
    ({ buildId }) => buildId === EXAMPLE_BUILD_ID,
  );
  if (rule === undefined) throw new Error("no example rule");
  const preview = previewCabinet({
    rule,
    catalog: priceDashboardCatalogue(),
    book,
    material,
    depth,
    deepeningRows: shippedDeepeningRows(),
  });
  if (!preview.ok) throw new Error(preview.code);
  const row = preview.rows.find(({ widthMm }) => widthMm === EXAMPLE_WIDTH_MM);
  if (row === undefined) throw new Error("no example width");
  return row.priceMinor;
}
