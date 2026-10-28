import type {
  AvailableBreakdown,
  BreakdownDepthLine,
} from "@/price/price-breakdown-model";

/**
 * The depth line of a breakdown, read where the sheet draws it: the one row of the listing that carries `scope`.
 * Undefined when the listing holds none.
 */
export function listedDepthLineOf(
  view: AvailableBreakdown,
): BreakdownDepthLine | undefined {
  const scoped = view.wholeKitchenListing.filter(
    (row) => row.scope !== undefined,
  );
  if (scoped.length > 1) throw new Error("the listing holds one depth line");
  const [row] = scoped;
  return row?.scope === undefined ? undefined : { ...row, scope: row.scope };
}
