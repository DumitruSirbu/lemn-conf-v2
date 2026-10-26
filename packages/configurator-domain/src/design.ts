import { z } from "./zod-without-eval.js";

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
import { FinishSchema } from "./materials.js";
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

/** A room dimension, bounded per axis: an unbounded room would make placement containment vacuous. */
function roomDimensionSchema(maximumMm: number) {
  return z.number().int().positive().max(maximumMm);
}

export const HandleSchema = z.enum(["steel", "black", "push"]);
export type Handle = z.infer<typeof HandleSchema>;

/** Wall C is a world wall with its own frame (ADR 0132 decision 1). Additive: stored `"A"` and `"B"`
 *  placements stay valid. */
export const DesignWallSchema = z.enum(["A", "B", "C"]);
export type DesignWall = z.infer<typeof DesignWallSchema>;

/** Additive like `"C"` (ADR 0132 decision 6): stored `"L"` and `"linear"` rooms parse unchanged. */
export const DesignRoomShapeSchema = z.enum(["L", "linear", "U"]);
export type DesignRoomShape = z.infer<typeof DesignRoomShapeSchema>;

/** Storage/wire shape only — no mesh or derived geometry is ever serialised. */
export const CabinetBodySchema = z.strictObject({
  buildId: identifierSchema,
  widthMm: positiveMillimetreSchema,
  heightMm: positiveMillimetreSchema,
  /** `2 ×` the wall-normal offset measured on this body after it was built (`BodyProbe`), which seats
   *  its back face on the wall plane, never a claim about physical depth. Absent on designs written
   *  before M3, where `deriveFrame` falls back to the catalogue's `frameDepthMm`. */
  seatDepthMm: positiveMillimetreSchema.optional(),
  /** A palette entry or a free colour (`materials.ts`). The legacy five-value string is carried forward
   *  pre-parse by `migrateDesign`'s version 4 arm, since this schema cannot express it. */
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
 * A space with no body in it, recorded as the frozen extent of a member-less column (ADR 0044).
 * Occupied columns are derivable from the placements; an empty one is derivable from nothing, so a
 * shrink or delete would lose the space on reload. Whole millimetres with a placement's bounds
 * (DOM-001). `alongMm` is the along-wall **centre**; `y0Mm` and `topMm` are the extent's floor and
 * top, which §4 reads.
 */
export const EmptyColumnSchema = z.strictObject({
  wall: DesignWallSchema,
  alongMm: coordinateMillimetreSchema,
  widthMm: positiveMillimetreSchema,
  y0Mm: coordinateMillimetreSchema,
  topMm: coordinateMillimetreSchema,
  depthMm: positiveMillimetreSchema,
  /**
   * The `buildId` whose clearance supplied `depthMm` (the §3.2 MAX winner, ADR 0073 decision 1), so a
   * depth change can re-ask that body at the new setting. A `buildId`, not a band or chain: a band
   * cannot tell an oven tower's 638 from a deep top's 600.
   *
   * Optional with no schema version bump (ADR 0073 decision 6): an absent value, or one the catalogue
   * no longer holds, falls to the deeper-only rule and is not refused (a load that refuses is a dead
   * link). A value that is not a `buildId`-shaped string is refused at both seams, hence
   * `identifierSchema`.
   */
  depthFromBuildId: identifierSchema.optional(),
});
export type EmptyColumn = z.infer<typeof EmptyColumnSchema>;

/**
 * The frozen extent of a column that still holds a member (ADR 0053): the same shape as
 * `EmptyColumnSchema`, since it is the same fact about the same kind of space. Needed because ADR
 * 0044's premise, that an occupied column is derivable from its placements, is false for a column a
 * command re-shaped: a reload would silently shrink it. Named `StoredColumnExtent` because
 * `void-engine.ts` exports `ColumnExtent` for the in-memory half; `toColumnExtent` converts.
 */
export const StoredColumnExtentSchema = EmptyColumnSchema;
export type StoredColumnExtent = z.infer<typeof StoredColumnExtentSchema>;

const DesignRoomFieldsSchema = z.strictObject({
  shape: DesignRoomShapeSchema,
  widthMm: roomDimensionSchema(MAX_ROOM_WIDTH_MM),
  depthMm: roomDimensionSchema(MAX_ROOM_DEPTH_MM),
  heightMm: roomDimensionSchema(MAX_ROOM_HEIGHT_MM),
  /** Wall C's run (ADR 0132 decision 6). Present **iff** `shape` is `"U"` (the refinement below),
   *  bounded as wall B is (`MAX_ROOM_DEPTH_MM`). */
  wallCMm: roomDimensionSchema(MAX_ROOM_DEPTH_MM).optional(),
  /** Which way the corner turns (ADR 0129 D2). The product writes it only for a right-hand room: an
   *  absent key is left, so left-hand documents stay byte-identical and no schema bump is owed
   *  (`columnExtents`' argument). Read only through `cornerDirectionOf`. Refused on a `"U"` when
   *  `"right"`: a U has no right-hand variant, while a truthful `"left"` or an absent key still parses. */
  cornerDirection: z.enum(["left", "right"]).optional(),
});

export const DesignRoomSchema = DesignRoomFieldsSchema.superRefine(
  (room, context) => {
    const isU = room.shape === "U";
    if (isU && room.wallCMm === undefined) {
      context.addIssue({
        code: "custom",
        path: ["wallCMm"],
        message: "A U room requires wallCMm",
      });
    }
    if (!isU && room.wallCMm !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["wallCMm"],
        message: "wallCMm is valid only for a U room",
      });
    }
    if (isU && room.cornerDirection === "right") {
      context.addIssue({
        code: "custom",
        path: ["cornerDirection"],
        message:
          "A U room carries no corner-direction toggle (ADR 0104 Amendment C)",
      });
    }
  },
);
export type DesignRoom = z.infer<typeof DesignRoomFieldsSchema>;

/**
 * The whole-kitchen settings, one optional container rather than sibling keys. Its absence is a valid,
 * unchanged state (priced at the book's default tiers), so no schema bump is owed (ADR 0053's
 * argument). A tier id is an opaque identifier validated for shape only: the domain imports no price
 * book (ADR 0062 seam 1), so existence is checked by the commands in
 * `commands/set-whole-kitchen-settings.ts`.
 */
export const DesignSettingsSchema = z.strictObject({
  materialTierId: identifierSchema.optional(),
  hardwareTierId: identifierSchema.optional(),
  /** Optional only in the wire parser so versions 1–3 can reach `migrateDesign`'s v3 arm; every
   * current-version document must carry it at that seam. */
  cabinetDepthMm: z
    .number()
    .int()
    .min(MIN_CABINET_DEPTH_MM)
    .refine((value) => declaredCabinetDepthsMm().includes(value), {
      message: "Cabinet depth must be one of the declared manufactured depths",
    })
    .optional(),
  /**
   * The whole-kitchen colour, between a cabinet's own `body.finish` and the material's
   * `defaultFinish` (ADR 0099 decision 1). Absence is valid and unchanged, so no schema bump is owed
   * (ADR 0099 decision 10).
   *
   * This is a `strictObject`: a rollback to a build without the key makes every document carrying it
   * unreadable at the load seam, a no-rollback release note rather than a migration. No offer check
   * here: whether the material offers the colour is a question about another key, kept true by
   * `setMaterialTier` and re-resolved at the load seam.
   */
  finish: FinishSchema.optional(),
  /**
   * The whole-kitchen handle, between a cabinet's own `body.handle` and the slot's default
   * (`kitchen-handle/kitchen-handle.ts`; M10 wave H1, on ADR 0099 decision 10's argument). Absence is
   * valid and unchanged: a document without it renders and prices as it always has, so no schema bump
   * is owed. It never reaches the top row, which ships push-to-open by module line.
   *
   * Like `finish`, this key is a no-rollback hazard: `DesignSettingsSchema` is a `strictObject`, so a
   * rollback to a build without it makes every document carrying it unreadable at the load seam.
   */
  handle: HandleSchema.optional(),
});
export type DesignSettings = z.infer<typeof DesignSettingsSchema>;

/** The legacy wire shape. Exported only for the migration seam, which must parse versions 1–3
 * before it can add the field they predate. New writes use `DesignSchema` below. */
export const LegacyDesignSchema = z.strictObject({
  room: DesignRoomSchema,
  presetId: z.string().max(MAX_IDENTIFIER_LENGTH).nullable(),
  placements: z.array(DesignPlacementSchema).max(MAX_PLACEMENTS),
  /** ADR 0044. Optional: a document without this key is a design with no empty space and loads as
   *  before. The cap is enforced here because both seams, the API write path and the load parse, pass
   *  through this schema. */
  emptyColumns: z.array(EmptyColumnSchema).max(MAX_EMPTY_COLUMNS).optional(),
  /** ADR 0053, the other half of the frozen map. Optional and additive: a document without the key
   *  loads with every occupied column's extent derived from its placements, so no schema bump is owed.
   *  Capped separately from `emptyColumns` because a different quantity bounds it
   *  (`MAX_COLUMN_EXTENTS`). */
  columnExtents: z
    .array(StoredColumnExtentSchema)
    .max(MAX_COLUMN_EXTENTS)
    .optional(),
  /** The whole-kitchen container; see `DesignSettingsSchema`. */
  settings: DesignSettingsSchema.optional(),
  createdAt: ConfigurationTimestampSchema,
  updatedAt: ConfigurationTimestampSchema,
});
export type Design = z.infer<typeof LegacyDesignSchema>;

/** General domain shape, including stored documents from before cabinet depth existed. */
export const DesignSchema = LegacyDesignSchema;

/** The current write contract. A successful save must be reloadable at `CURRENT_SCHEMA_VERSION`,
 * so cabinet depth is mandatory here even though the legacy parser permits its absence. */
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
 * current-version documents are stricter and are checked by `migrateDesign`. */
export function cabinetDepthMmOf(design: Design): number {
  return design.settings?.cabinetDepthMm ?? 600;
}
