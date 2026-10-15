// Edits that turn a kitchen into one that a reason to refuse a submission applies to.
import type {
  Design,
  DesignPlacement,
  PricedDesign,
} from "@lemnaria/configurator-domain";

/** The wall a placement stands on, in millimetres. A wall the shape lacks has none, so a body on it overflows. */
export function ownWallLengthMm(
  design: Design,
  wall: DesignPlacement["wall"],
): number {
  const { room } = design;
  if (wall === "A") return room.widthMm;
  if (wall === "B") return room.shape === "linear" ? 0 : room.depthMm;
  return room.shape === "U" ? (room.wallCMm ?? 0) : 0;
}

/** The same kitchen with these bodies slid one millimetre past the end of their own wall. */
export function pastTheWall(design: Design, ids: ReadonlySet<string>): Design {
  return {
    ...design,
    placements: design.placements.map((placement) =>
      ids.has(placement.id)
        ? { ...placement, alongMm: ownWallLengthMm(design, placement.wall) + 1 }
        : placement,
    ),
  };
}

/** A selection the book does not offer: the pricing query itself refuses, nothing is injected. */
export function withAnUnofferedTier(design: Design): Design {
  return {
    ...design,
    settings: { ...design.settings, materialTierId: "material.not-offered" },
  };
}

/** Every body removed, with the recorded spaces that stood among them. */
export function emptied(design: Design): Design {
  return { ...design, placements: [], emptyColumns: [], columnExtents: [] };
}

/** The placement ids a priced design says the customer supplies, read off the lines' published supplier. */
export function customerSuppliedIds(priced: PricedDesign): ReadonlySet<string> {
  return new Set(
    priced.lines.flatMap((line) =>
      line.kind === "cabinet" && line.suppliedBy === "customer"
        ? [line.placementId]
        : [],
    ),
  );
}

/** Only these bodies kept, and the recorded spaces dropped with the rest. */
export function keepingOnly(design: Design, ids: ReadonlySet<string>): Design {
  return {
    ...emptied(design),
    placements: design.placements.filter((placement) => ids.has(placement.id)),
  };
}
