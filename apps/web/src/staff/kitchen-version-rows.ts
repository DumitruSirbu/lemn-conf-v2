import {
  UnknownBodyError,
  projectDesignForDisplay,
  type Design,
  type DisplayEntry,
  type DisplayGroup,
  type KitchenViewed3dVersion,
} from "@lemnaria/configurator-domain";

import { buildCatalogAtDepthOf } from "@/price/price-book-root";

// What the staff kitchen page's cabinet list (ADR 0185 decision 3) asks of a copy of the kitchen: the projection that
// groups and orders its bodies, and the one test of whether two copies hold the same body, which is also what tells
// the page that the two copies are two kitchens (`versionsOf`).

export type KitchenVersion = KitchenViewed3dVersion;

export interface KitchenVersions {
  readonly sent: Design;
  readonly current: Design;
}

/**
 * The display projection of a copy. Nothing when the copy cannot be listed: a body the catalogue no longer holds, or a
 * depth it cannot build, is a copy the page cannot read, and it says so instead of listing half of one.
 */
export function projectedGroupsOf(
  design: Design,
): readonly DisplayGroup[] | undefined {
  const catalog = buildCatalogAtDepthOf(design);
  if (catalog === undefined) return undefined;
  try {
    return projectDesignForDisplay(design, catalog);
  } catch (error) {
    if (error instanceof UnknownBodyError) return undefined;
    throw error;
  }
}

/** Every fact of a body the document stores: which body, how big, where it stands and what it wears of its own. */
export function isSameBody(left: DisplayEntry, right: DisplayEntry): boolean {
  return (
    left.buildId === right.buildId &&
    left.widthMm === right.widthMm &&
    left.heightMm === right.heightMm &&
    left.wall === right.wall &&
    left.alongMm === right.alongMm &&
    left.y0Mm === right.y0Mm &&
    left.handle === right.handle &&
    JSON.stringify(left.finish) === JSON.stringify(right.finish)
  );
}
