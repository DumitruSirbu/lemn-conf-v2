import "server-only";

import { createTranslator } from "next-intl";

import { listAccessoryIds } from "@lemnaria/configurator-domain";

import type { ContentTranslator } from "@/i18n/content";
import roMessages from "@/messages/ro.json";

import { deriveAccessories, type AccessoryPageInput } from "./accessory-model";
import { cabinetNamesOf } from "./cabinet-names";
import {
  readItemPage,
  readOnlyIfHeld,
  type ItemListRead,
  type ItemPageSource,
  type ItemRead,
} from "./item-page-read";

// The accessory screens' facts: the read itself is `item-page-read.ts`, shared with the hardware and the materials. The
// cabinet types are named in Romanian, as the cabinet list names them in both languages until the official translation.

export type AccessoryRead = ItemListRead<AccessoryPageInput>;

/** One accessory's page: the same facts, and the accessory asked for, which neither the book nor the draft may hold. */
export type AccessoryItemRead = ItemRead<AccessoryPageInput>;

const ACCESSORY_PAGE: ItemPageSource = {
  canDerive: (state) => deriveAccessories(state).kind === "ready",
  loadSampleUsage: async () =>
    (await import("./accessory-sample")).SAMPLE_ACCESSORY_USAGE,
};

const romanian = createTranslator({
  locale: "ro",
  messages: roMessages,
}) as ContentTranslator;

export async function readAccessories(): Promise<AccessoryRead> {
  const read = await readItemPage(ACCESSORY_PAGE);
  if (read.kind === "unavailable") return read;
  const { page } = read;
  return {
    kind: "ready",
    page: {
      ...page,
      cabinetNames: cabinetNamesOf(page.state.active.book, romanian),
    },
  };
}

export async function readAccessory(
  accessoryId: string,
): Promise<AccessoryItemRead> {
  return readOnlyIfHeld(await readAccessories(), ({ state }) => {
    const isHeld = listAccessoryIds(state.active.book).includes(accessoryId);
    const isCreatedInDraft = state.draft.changes.some(
      ({ address }) =>
        address.kind === "accessory-created" &&
        address.accessoryId === accessoryId,
    );
    return isHeld || isCreatedInDraft;
  });
}
