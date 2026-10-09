import {
  SAMPLE_PRICE_BOOK,
  SAMPLE_PRICE_BOOK_VERSION,
  snapshotSubmission,
} from "@lemnaria/configurator-domain";
import type { SubmissionSnapshot } from "@lemnaria/configurator-domain";

import {
  GENERATED_KITCHENS,
  catalogOf,
} from "../../../configurator-domain/tests/contact/support/submission-kitchens.js";

export interface RealSnapshot {
  readonly name: string;
  readonly snapshot: SubmissionSnapshot;
}

/**
 * What 8H's `snapshotSubmission` makes of real kitchens under the shipped price book: the generator's straight, L and
 * U rooms, the largest U among them, and the seeded L. The kitchens are the domain's own submission fixtures.
 */
export const REAL_SNAPSHOTS: readonly RealSnapshot[] = GENERATED_KITCHENS.map(
  ({ name, design }) => {
    const result = snapshotSubmission({
      design,
      catalog: catalogOf(design),
      book: SAMPLE_PRICE_BOOK,
      pricingVersion: SAMPLE_PRICE_BOOK_VERSION,
    });
    if (!result.ok) throw new Error(`${name} has no snapshot`);
    return { name, snapshot: result.snapshot };
  },
);

/** How many levels of lists and objects a value nests, the value itself counting as the first when it is one. */
export function levelsOf(value: unknown): number {
  if (typeof value !== "object" || value === null) return 0;
  return 1 + Math.max(0, ...Object.values(value).map(levelsOf));
}
