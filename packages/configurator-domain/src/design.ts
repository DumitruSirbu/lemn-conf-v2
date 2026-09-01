import { z } from "zod";

import {
  MAX_DESIGN_DIMENSION_MM,
  MAX_EMPTY_COLUMNS,
  MAX_IDENTIFIER_LENGTH,
  MAX_PLACEMENTS,
  MAX_ROOM_DEPTH_MM,
  MAX_ROOM_HEIGHT_MM,
  MAX_ROOM_WIDTH_MM,
} from "./design-bounds.js";
import { ConfigurationTimestampSchema } from "./schemas.js";

/** A dimension: a whole millimetre a body or a room can actually measure. Zero and negatives are
 *  not small rooms and thin cabinets, they are documents `deriveCabinetWorldTransform` throws on
 *  (DOM-001). */
const positiveMillimetreSchema = z
  .number()
  .int()
  .positive()
  .max(MAX_DESIGN_DIMENSION_MM);

/** A coordinate: whole millimetres from the corner the two walls meet at, which is the origin of
 *  both runs (§2), so it is measured forward and never negative. */
const coordinateMillimetreSchema = z
  .number()
  .int()
  .min(0)
  .max(MAX_DESIGN_DIMENSION_MM);

const identifierSchema = z.string().min(1).max(MAX_IDENTIFIER_LENGTH);

/** A room dimension, bounded per axis (review finding F2). Placement containment is checked against
 *  the room the document carries, so an unbounded room made containment vacuous. */
function roomDimensionSchema(maximumMm: number) {
  return z.number().int().positive().max(maximumMm);
}

export const FinishSchema = z.enum([
  "white",
  "clay",
  "sage",
  "graphite",
  "oak",
]);
export type Finish = z.infer<typeof FinishSchema>;

export const HandleSchema = z.enum(["steel", "black", "push"]);
export type Handle = z.infer<typeof HandleSchema>;

export const DesignWallSchema = z.enum(["A", "B"]);
export type DesignWall = z.infer<typeof DesignWallSchema>;

export const DesignRoomShapeSchema = z.enum(["L", "linear"]);
export type DesignRoomShape = z.infer<typeof DesignRoomShapeSchema>;

/** Storage/wire shape only — no mesh or derived geometry is ever serialised. */
export const CabinetBodySchema = z.strictObject({
  buildId: identifierSchema,
  widthMm: positiveMillimetreSchema,
  heightMm: positiveMillimetreSchema,
  /** `2 ×` the wall-normal offset measured on this body after it was built (`BodyProbe`), which
   *  is what seats its back face on the wall plane — never a claim about the body's physical
   *  depth. Absent on every design written before M3, which is why it is optional and needs no
   *  schema version bump: `deriveFrame` then falls back to the catalogue's `frameDepthMm`. */
  seatDepthMm: positiveMillimetreSchema.optional(),
  finish: FinishSchema.optional(),
  handle: HandleSchema.optional(),
});
export type CabinetBody = z.infer<typeof CabinetBodySchema>;

export const DesignPlacementSchema = z.strictObject({
  id: identifierSchema,
  wall: DesignWallSchema,
  alongMm: coordinateMillimetreSchema,
  y0Mm: coordinateMillimetreSchema,
  body: CabinetBodySchema,
});
export type DesignPlacement = z.infer<typeof DesignPlacementSchema>;

/**
 * A space with no body in it, as ADR 0044 records it: the frozen extent of a column that has no
 * member of its own.
 *
 * Only the member-less columns are stored. Every occupied column is derivable from the placements,
 * and storing a derivable fact is how two authors for one question start — but an empty column is
 * derivable from nothing, so a shrink or a delete otherwise loses the space it freed the moment the
 * document is reloaded.
 *
 * Whole millimetres and the same bounds as a placement (DOM-001), because these numbers reach
 * exactly the same derivation the placements' do. `alongMm` is the along-wall **centre**, as it is
 * on a placement; `y0Mm` and `topMm` are the floor and top of the frozen extent, which is what §4
 * reads (`deriveFreeSpans` takes `min(regions)` and `top`).
 */
export const EmptyColumnSchema = z.strictObject({
  wall: DesignWallSchema,
  alongMm: coordinateMillimetreSchema,
  widthMm: positiveMillimetreSchema,
  y0Mm: coordinateMillimetreSchema,
  topMm: coordinateMillimetreSchema,
  depthMm: positiveMillimetreSchema,
});
export type EmptyColumn = z.infer<typeof EmptyColumnSchema>;

export const DesignRoomSchema = z.strictObject({
  shape: DesignRoomShapeSchema,
  widthMm: roomDimensionSchema(MAX_ROOM_WIDTH_MM),
  depthMm: roomDimensionSchema(MAX_ROOM_DEPTH_MM),
  heightMm: roomDimensionSchema(MAX_ROOM_HEIGHT_MM),
});
export type DesignRoom = z.infer<typeof DesignRoomSchema>;

export const DesignSchema = z.strictObject({
  room: DesignRoomSchema,
  presetId: z.string().max(MAX_IDENTIFIER_LENGTH).nullable(),
  placements: z.array(DesignPlacementSchema).max(MAX_PLACEMENTS),
  /** ADR 0044. Optional, and ADR 0038 is why that costs nothing: the project is pre-release and no
   *  design has ever been stored, so a document written without this key is not a legacy document
   *  to migrate — it is a design with no empty space, and it must load exactly as it does today.
   *  The cap is enforced here because this schema is the one gate both seams pass through: the API
   *  write path parses it, and `migrateFromV1` parses it again on load. */
  emptyColumns: z.array(EmptyColumnSchema).max(MAX_EMPTY_COLUMNS).optional(),
  createdAt: ConfigurationTimestampSchema,
  updatedAt: ConfigurationTimestampSchema,
});
export type Design = z.infer<typeof DesignSchema>;
