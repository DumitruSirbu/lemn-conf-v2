import "server-only";

import { deriveHardware, type HardwarePageInput } from "./hardware-model";
import {
  readItemPage,
  readOnlyIfHeld,
  type ItemListRead,
  type ItemPageSource,
  type ItemRead,
} from "./item-page-read";

// The hardware screens' facts: the read itself is `item-page-read.ts`, shared with the materials.

export type HardwareRead = ItemListRead<HardwarePageInput>;

/** One class's page: the same facts, and the class asked for, which neither the book nor the draft may hold. */
export type HardwareClassRead = ItemRead<HardwarePageInput>;

const HARDWARE_PAGE: ItemPageSource = {
  canDerive: (state) => deriveHardware(state).kind === "ready",
  loadSampleUsage: async () =>
    (await import("./hardware-sample")).SAMPLE_HARDWARE_USAGE,
};

export function readHardware(): Promise<HardwareRead> {
  return readItemPage(HARDWARE_PAGE);
}

export async function readHardwareClass(
  tierId: string,
): Promise<HardwareClassRead> {
  return readOnlyIfHeld(await readHardware(), ({ state }) => {
    const isHeld = state.active.book.hardware.tiers.some(
      (tier) => tier.tierId === tierId,
    );
    const isCreatedInDraft = state.draft.changes.some(
      ({ address }) =>
        address.kind === "hardware-tier-created" && address.tierId === tierId,
    );
    return isHeld || isCreatedInDraft;
  });
}
