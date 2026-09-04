import { z } from "zod";

import {
  MAX_COLUMN_EXTENTS,
  MAX_DESIGN_DIMENSION_MM,
  MAX_EMPTY_COLUMNS,
  MAX_IDENTIFIER_LENGTH,
  MAX_PLACEMENTS,
  MAX_ROOM_DEPTH_MM,
  MAX_ROOM_HEIGHT_MM,
  MAX_ROOM_WIDTH_MM,
} from "./design-bounds.js";
import { ConfigurationTimestampSchema } from "./schemas.js";
import {
  declaredCabinetDepthsMm,
  MIN_CABINET_DEPTH_MM,
} from "./worktop-depth.js";

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

/**
 * The frozen extent of a column that **does** still hold a member, as ADR 0053 records it.
 *
 * The exact complement of `EmptyColumnSchema` and deliberately the same six fields, because it is
 * the same fact about the same kind of space: where a column reaches, in whole millimetres, on a
 * key the document's own placements produce.
 *
 * ADR 0044 stored only the member-less columns, on the premise that an occupied column is derivable
 * from its placements. That premise is false for a column a command has since re-shaped: clear a
 * column and refill it with a body that fits, or delete some of a column's members, and the
 * placements imply an extent narrower than the one the customer is looking at. Nothing else records
 * the difference, so a reload silently shrinks the column and the openings above the body vanish.
 *
 * The name is `StoredColumnExtent` rather than `ColumnExtent` because `void-engine.ts` already
 * exports that name for the in-memory frozen half of a `Column`. This is its wire shape, and the two
 * are converted into each other in one place (`toColumnExtent`).
 */
export const StoredColumnExtentSchema = EmptyColumnSchema;
export type StoredColumnExtent = z.infer<typeof StoredColumnExtentSchema>;

export const DesignRoomSchema = z.strictObject({
  shape: DesignRoomShapeSchema,
  widthMm: roomDimensionSchema(MAX_ROOM_WIDTH_MM),
  depthMm: roomDimensionSchema(MAX_ROOM_DEPTH_MM),
  heightMm: roomDimensionSchema(MAX_ROOM_HEIGHT_MM),
});
export type DesignRoom = z.infer<typeof DesignRoomSchema>;

/**
 * The whole-kitchen settings, as one optional container rather than sibling keys on the design.
 *
 * **Designed for three settings and built with two.** Cabinet depth lands in wave 6J and is
 * deliberately absent here; whether its arrival owes a schema version bump is 6J's decision and is
 * not pre-empted by this one.
 *
 * **Its absence is a valid, unchanged state, so no schema version bump is owed.** The argument is
 * `columnExtents`' (ADR 0053) — a document written without this key loads exactly as it does today,
 * priced at the book's own default tiers — and explicitly **not** ADR 0038's "nothing has ever been
 * stored", whose premise ADR 0052 corrected by measurement: five rows exist at `schema_version` 1.
 *
 * **A tier id is an opaque identifier, validated for shape only.** The domain imports no price book
 * (ADR 0062 seam 1), so *whether* a tier exists is not a question this schema can ask; it is
 * answered where the book is, by the commands in `commands/set-whole-kitchen-settings.ts`, which
 * take the available ids from their caller.
 */
export const DesignSettingsSchema = z.strictObject({
  materialTierId: identifierSchema.optional(),
  hardwareTierId: identifierSchema.optional(),
  /** Optional only in the wire parser so schema versions 1–3 can reach `migrateDesign`'s v3 arm.
   * Every version-4 document is required to carry it at that seam. */
  cabinetDepthMm: z
    .number()
    .int()
    .min(MIN_CABINET_DEPTH_MM)
    .refine((value) => declaredCabinetDepthsMm().includes(value), {
      message: "Cabinet depth must be one of the declared manufactured depths",
    })
    .optional(),
});
export type DesignSettings = z.infer<typeof DesignSettingsSchema>;

/** The legacy wire shape. Exported only for the migration seam, which must parse versions 1–3
 * before it can add the field they predate. New writes use `DesignSchema` below. */
export const LegacyDesignSchema = z.strictObject({
  room: DesignRoomSchema,
  presetId: z.string().max(MAX_IDENTIFIER_LENGTH).nullable(),
  placements: z.array(DesignPlacementSchema).max(MAX_PLACEMENTS),
  /** ADR 0044. Optional, and ADR 0038 is why that costs nothing: the project is pre-release and no
   *  design has ever been stored, so a document written without this key is not a legacy document
   *  to migrate — it is a design with no empty space, and it must load exactly as it does today.
   *  The cap is enforced here because this schema is the one gate both seams pass through: the API
   *  write path parses it, and `migrateFromV1` parses it again on load. */
  emptyColumns: z.array(EmptyColumnSchema).max(MAX_EMPTY_COLUMNS).optional(),
  /** ADR 0053, the other half of the frozen map. Optional and additive, and **that is a real
   *  backward-compatibility argument rather than a licence borrowed from ADR 0038**, whose premise
   *  ADR 0052 corrected: a document written without this key loads exactly as it does today, with
   *  every occupied column's extent derived from its placements. Only documents saved after this
   *  field exists carry the extents, and only those get the reload the customer expects. No schema
   *  version bump is owed for a field whose absence is a valid, unchanged state.
   *
   *  Capped separately from `emptyColumns` because a different quantity bounds it — see
   *  `MAX_COLUMN_EXTENTS`. */
  columnExtents: z
    .array(StoredColumnExtentSchema)
    .max(MAX_COLUMN_EXTENTS)
    .optional(),
  /** Wave 6E's whole-kitchen container — see `DesignSettingsSchema` for why it is one key and why
   *  its absence owes no version bump. */
  settings: DesignSettingsSchema.optional(),
  createdAt: ConfigurationTimestampSchema,
  updatedAt: ConfigurationTimestampSchema,
});
export type Design = z.infer<typeof LegacyDesignSchema>;

/** General domain shape, including stored documents from before cabinet depth existed. */
export const DesignSchema = LegacyDesignSchema;

/** The current write contract. A successful save must be reloadable at schema version 4, so
 * cabinet depth is mandatory here even though the legacy parser permits its absence. */
export const CurrentDesignSchema = LegacyDesignSchema.superRefine(
  (design, context) => {
    if (design.settings?.cabinetDepthMm !== undefined) return;
    context.addIssue({
      code: "custom",
      path: ["settings", "cabinetDepthMm"],
      message: "Current designs require a cabinet depth",
    });
  },
);

/** The effective depth of an in-memory design. Absence means the legacy default; persisted
 * version-4 documents are stricter and are checked by `migrateDesign`. */
export function cabinetDepthMmOf(design: Design): number {
  return design.settings?.cabinetDepthMm ?? 600;
}
