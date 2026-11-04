// What the DOM tests of the accessory screens share: a page built from the sample book (which carries no linked accessory,
// so a test states the ones it needs), the screens mounted over a draft client and a lifecycle client that judge as the
// routes do, and the few gestures a person makes. Nothing here asserts.
import { createElement } from "react";

import {
  linkTargetBuildIdsOf,
  SAMPLE_PRICE_BOOK,
  type CatalogueAvailability,
  type DraftChange,
  type ItemRef,
  type ItemUsageCounts,
  type LinkedAccessoryRule,
  type NewKitchenSettings,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { AccessoryCreateScreen } from "@/price-dashboard/accessory-create";
import { AccessoryEditScreen } from "@/price-dashboard/accessory-edit";
import { AccessoryListScreen } from "@/price-dashboard/accessory-list";
import type { AccessoryPageInput } from "@/price-dashboard/accessory-model";
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
import { cabinetNamesOf, stateOf } from "./dashboard-state-fixture";
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

export const SINK_COVER = "sinkProtectiveCover";
export const DRYING_RACK = "dishDryingRack";
/** The id of the linked accessory the active book of a test holds. */
export const PUBLISHED = "organiser";
/** The id the in-memory draft client mints for the first accessory created. */
export const CREATED = "created-1";

/** The built-ins' names as the catalogue writes them: the leaf each rule of the book names. */
const nameOfBuiltIn = (key: string | undefined): string => {
  if (key === undefined) throw new Error("a built-in accessory names no leaf");
  return roCopy(key as "brand");
};
export const COVER_NAME = nameOfBuiltIn(
  SAMPLE_PRICE_BOOK.accessories.sinkProtectiveCover.nameKey,
);
export const RACK_NAME = nameOfBuiltIn(
  SAMPLE_PRICE_BOOK.accessories.dishDryingRack.nameKey,
);

export const accessoryItem = (accessoryId: string): ItemRef => ({
  kind: "accessory",
  accessoryId,
});

/** How many saved kitchens use each built-in accessory, by the counts the stand-in is seeded with. */
export const USAGE: ItemUsageCounts = [
  { item: accessoryItem(SINK_COVER), designCount: 12 },
  { item: accessoryItem(DRYING_RACK), designCount: 31 },
  { item: accessoryItem(PUBLISHED), designCount: 4 },
];

/** The first cabinet type the manufacturer supplies, read from the book: no id is written here. */
export const LINKED_BUILD_ID = linkTargetBuildIdsOf(SAMPLE_PRICE_BOOK)[0] ?? "";

export const PUBLISHED_RULE: LinkedAccessoryRule = {
  accessoryId: PUBLISHED,
  ruleId: `accessory.${PUBLISHED}`,
  linkedBuildId: LINKED_BUILD_ID,
  perUnitMinor: 12_000,
  name: "Organizator",
  description: "Organizator pentru sertar",
};

export interface PageOptions {
  readonly changes?: readonly DraftChange[];
  readonly disabled?: readonly ItemRef[];
  /** The linked accessories the active book holds. */
  readonly linked?: readonly LinkedAccessoryRule[];
  /** The saved defaults; `{}` is none saved, and `undefined` is unreadable. */
  readonly defaults?: NewKitchenSettings | undefined;
  readonly usage?: ItemUsageCounts;
}

export function bookWithLinked(
  linked: readonly LinkedAccessoryRule[],
): PriceBook {
  return { ...SAMPLE_PRICE_BOOK, linkedAccessories: linked };
}

export function accessoryPageOf(options: PageOptions = {}): AccessoryPageInput {
  const book = bookWithLinked(options.linked ?? []);
  const base = stateOf(options.changes ?? []);
  const availability: CatalogueAvailability = {
    revision: "1",
    disabled: options.disabled ?? [],
  };
  return {
    state: { ...base, active: { ...base.active, book, availability } },
    cabinetNames: cabinetNamesOf(book),
    defaults: "defaults" in options ? options.defaults : {},
    sampleUsage: options.usage ?? USAGE,
  };
}

/** A linked accessory only the draft holds, as the creation form's write leaves it. */
export const CREATED_ACCESSORY: readonly DraftChange[] = [
  {
    address: { kind: "accessory-created", accessoryId: CREATED },
    value: {
      linkedBuildId: LINKED_BUILD_ID,
      perUnitMinor: 8_000,
      name: "Suport pentru farfurii",
      description: "Din inox",
    },
  },
];

export interface MountedAccessories {
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

function worldOf(page: AccessoryPageInput) {
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

const CONTEXT = () =>
  contextOf("administrator", ["kitchens", "accessories", "publish"]);

export async function mountAccessoryList(
  page: AccessoryPageInput,
  options: MountOptions = {},
): Promise<MountedAccessories> {
  const locale = options.locale ?? "ro";
  const world = worldOf(page);
  const screen: MountedScreen = mountInCatalogue(
    createElement(AccessoryListScreen, {
      locale,
      context: CONTEXT(),
      page,
      client: options.draftClient ?? world.draftServer.client,
      lifecycleClient: options.lifecycleClient ?? world.lifecycle.client,
    }),
    locale,
  );
  await flushPromises(5);
  return { container: screen.container, ...world, unmount: screen.unmount };
}

export async function mountAccessoryCreate(
  page: AccessoryPageInput,
  options: Omit<MountOptions, "lifecycleClient"> = {},
): Promise<MountedAccessories> {
  const locale = options.locale ?? "ro";
  const world = worldOf(page);
  const screen: MountedScreen = mountInCatalogue(
    createElement(AccessoryCreateScreen, {
      locale,
      context: CONTEXT(),
      page,
      client: options.draftClient ?? world.draftServer.client,
    }),
    locale,
  );
  await flushPromises(5);
  return { container: screen.container, ...world, unmount: screen.unmount };
}

export async function mountAccessoryEdit(
  accessoryId: string,
  page: AccessoryPageInput,
  options: MountOptions = {},
): Promise<MountedAccessories> {
  const locale = options.locale ?? "ro";
  const world = worldOf(page);
  const screen: MountedScreen = mountInCatalogue(
    createElement(AccessoryEditScreen, {
      locale,
      context: CONTEXT(),
      page,
      accessoryId,
      client: options.draftClient ?? world.draftServer.client,
      lifecycleClient: options.lifecycleClient ?? world.lifecycle.client,
    }),
    locale,
  );
  await flushPromises(5);
  return { container: screen.container, ...world, unmount: screen.unmount };
}

export function rowOf(
  container: HTMLElement,
  accessoryId: string,
): HTMLElement {
  const found = allIn(container, '[data-testid="accessory-row"]').find(
    (row) => row.dataset.accessoryId === accessoryId,
  );
  if (found === undefined) throw new Error(`no row for ${accessoryId}`);
  return found;
}

export async function openMenuOf(
  container: HTMLElement,
  accessoryId: string,
  name: string,
): Promise<void> {
  click(
    requireIn<HTMLButtonElement>(
      rowOf(container, accessoryId),
      `button[aria-label="${roCopy("priceDashboard.common.moreActionsFor", { name })}"]`,
    ),
  );
  await flushPromises(2);
}

export function menuEntry(
  container: HTMLElement,
  accessoryId: string,
  words: string,
): HTMLButtonElement {
  const found = allIn<HTMLButtonElement>(
    rowOf(container, accessoryId),
    "ul button",
  ).find((button) => button.textContent.trim() === words);
  if (found === undefined) throw new Error(`no menu entry says "${words}"`);
  return found;
}

export function chipsOf(container: HTMLElement, accessoryId: string): string[] {
  return allIn(
    rowOf(container, accessoryId),
    '[data-testid="accessory-chip"]',
  ).map((chip) => chip.textContent);
}
