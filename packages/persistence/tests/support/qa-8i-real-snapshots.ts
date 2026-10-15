import { readFileSync } from "node:fs";

import {
  KITCHEN_L_DESIGN,
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  snapshotSubmission,
} from "@lemnaria/configurator-domain";
import type { Design, SubmissionSnapshot } from "@lemnaria/configurator-domain";

export interface RealSnapshot {
  readonly name: string;
  readonly snapshot: SubmissionSnapshot;
}

interface NamedDesign {
  readonly name: string;
  readonly design: Design;
}

/**
 * A COPY, and not the source. `qa-8i-generated-kitchen-designs.copy.json` holds the seven kitchens the domain's own
 * submission tests generate (`packages/configurator-domain/tests/contact/support/submission-kitchens.ts`,
 * `GENERATED_KITCHENS` without the seeded L), each written with `JSON.stringify` on 2026-10-09: two straight rooms,
 * two L and three U. A test here may not import another package's tests, and generating a kitchen needs a body probe
 * that only those tests hold, so the designs are copied and nothing else is: every snapshot below is still made by
 * the domain's public `snapshotSubmission`. When the design schema changes, the copy is regenerated from that list.
 */
const COPIED_DESIGNS_FILE = new URL(
  "./qa-8i-generated-kitchen-designs.copy.json",
  import.meta.url,
);

function copiedGeneratedDesigns(): NamedDesign[] {
  return JSON.parse(readFileSync(COPIED_DESIGNS_FILE, "utf8")) as NamedDesign[];
}

function realSnapshotOf({ name, design }: NamedDesign): RealSnapshot {
  const result = snapshotSubmission({
    design,
    catalog: buildKitchenLBodyCatalog(cabinetDepthMmOf(design)),
    book: SAMPLE_PRICE_BOOK,
    pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
  });
  if (!result.ok) throw new Error(`${name} has no snapshot`);
  return { name, snapshot: result.snapshot };
}

/** What `snapshotSubmission` makes, under the shipped price book, of the copied kitchens and of the seeded L. */
export const REAL_SNAPSHOTS: readonly RealSnapshot[] = [
  ...copiedGeneratedDesigns(),
  { name: "the seeded L", design: KITCHEN_L_DESIGN },
].map(realSnapshotOf);

/** How many levels of lists and objects a value nests, the value itself counting as the first when it is one. */
export function levelsOf(value: unknown): number {
  if (typeof value !== "object" || value === null) return 0;
  return 1 + Math.max(0, ...Object.values(value).map(levelsOf));
}
