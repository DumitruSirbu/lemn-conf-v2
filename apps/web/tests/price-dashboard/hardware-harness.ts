// What the DOM tests of the hardware screens share: a page built from the sample book, the screens mounted over a draft
// client and a lifecycle client that judge as the routes do, and the few gestures a person makes. Nothing here asserts.
import { act, createElement } from "react";

import {
  SAMPLE_PRICE_BOOK,
  type CatalogueAvailability,
  type DraftChange,
  type ItemRef,
  type ItemUsageCounts,
  type NewKitchenSettings,
} from "@lemnaria/configurator-domain";

import { HardwareEditScreen } from "@/price-dashboard/hardware-edit";
import { HardwareListScreen } from "@/price-dashboard/hardware-list";
import type { HardwarePageInput } from "@/price-dashboard/hardware-model";
import type { ItemLifecycleClient } from "@/price-dashboard/item-lifecycle-client";
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

export const STANDARD = "hardware.standard";
export const HETTICH = "hardware.soft-close";
export const BLUM = "hardware.premium";

export const hardwareItem = (tierId: string): ItemRef => ({
  kind: "hardware",
  tierId,
});

/** How many saved kitchens use each class, by the counts the stand-in is seeded with. */
export const USAGE: ItemUsageCounts = [
  { item: hardwareItem(STANDARD), designCount: 9 },
  { item: hardwareItem(HETTICH), designCount: 14 },
  { item: hardwareItem(BLUM), designCount: 0 },
];

export interface PageOptions {
  readonly changes?: readonly DraftChange[];
  readonly disabled?: readonly ItemRef[];
  /** The saved defaults; `{}` is none saved, and `undefined` is unreadable. */
  readonly defaults?: NewKitchenSettings | undefined;
  readonly usage?: ItemUsageCounts;
}

export function hardwarePageOf(options: PageOptions = {}): HardwarePageInput {
  const base = stateOf(options.changes ?? []);
  const availability: CatalogueAvailability = {
    revision: "1",
    disabled: options.disabled ?? [],
  };
  return {
    state: { ...base, active: { ...base.active, availability } },
    defaults: "defaults" in options ? options.defaults : {},
    sampleUsage: options.usage ?? USAGE,
  };
}

export interface MountedHardware {
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

function worldOf(page: HardwarePageInput) {
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

export async function mountHardwareList(
  page: HardwarePageInput,
  options: MountOptions = {},
): Promise<MountedHardware> {
  const locale = options.locale ?? "ro";
  const world = worldOf(page);
  const screen: MountedScreen = mountInCatalogue(
    createElement(HardwareListScreen, {
      locale,
      context: contextOf("administrator", ["kitchens", "hardware", "publish"]),
      page,
      client: options.draftClient ?? world.draftServer.client,
      lifecycleClient: options.lifecycleClient ?? world.lifecycle.client,
    }),
    locale,
  );
  await flushPromises(5);
  return { container: screen.container, ...world, unmount: screen.unmount };
}

export async function mountHardwareEdit(
  tierId: string,
  page: HardwarePageInput,
  options: MountOptions = {},
): Promise<MountedHardware> {
  const locale = options.locale ?? "ro";
  const world = worldOf(page);
  const screen: MountedScreen = mountInCatalogue(
    createElement(HardwareEditScreen, {
      locale,
      context: contextOf("administrator", ["kitchens", "hardware", "publish"]),
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
  const found = allIn(container, '[data-testid="hardware-row"]').find(
    (row) => row.dataset.tierId === tierId,
  );
  if (found === undefined) throw new Error(`no row for ${tierId}`);
  return found;
}

/** The "⋯" of a class's row, found by the sentence that names it. */
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

export function dialogButtons(dialog: HTMLElement): HTMLButtonElement[] {
  return allIn<HTMLButtonElement>(dialog, "button");
}

export function dialogButton(
  dialog: HTMLElement,
  words: string,
): HTMLButtonElement {
  const found = dialogButtons(dialog).find(
    (button) => button.textContent.trim() === words,
  );
  if (found === undefined) throw new Error(`no dialog button says "${words}"`);
  return found;
}

export function pendingChipText(container: HTMLElement): string | undefined {
  return container.querySelector('[data-testid="staff-pending-prices"]')
    ?.textContent;
}

export const SAMPLE_HARDWARE = SAMPLE_PRICE_BOOK.hardware.tiers;
