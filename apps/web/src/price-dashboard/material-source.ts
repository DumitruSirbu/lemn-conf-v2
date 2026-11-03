import "server-only";

import {
  readItemPage,
  readOnlyIfHeld,
  type ItemListRead,
  type ItemPageSource,
  type ItemRead,
} from "./item-page-read";
import { deriveMaterials, type MaterialPageInput } from "./material-model";

// The one place the materials screens' facts come from; the read itself is `item-page-read.ts`, shared with the hardware.

export type MaterialsRead = ItemListRead<MaterialPageInput>;

/** One material's page: the same facts, and the material asked for, which the book must hold. */
export type MaterialRead = ItemRead<MaterialPageInput>;

const MATERIAL_PAGE: ItemPageSource = {
  canDerive: (state) => deriveMaterials(state).kind === "ready",
  loadSampleUsage: async () =>
    (await import("./material-sample")).SAMPLE_MATERIAL_USAGE,
};

export function readMaterials(): Promise<MaterialsRead> {
  return readItemPage(MATERIAL_PAGE);
}

export async function readMaterial(tierId: string): Promise<MaterialRead> {
  return readOnlyIfHeld(await readMaterials(), ({ state }) =>
    state.active.book.material.tiers.some((tier) => tier.tierId === tierId),
  );
}
