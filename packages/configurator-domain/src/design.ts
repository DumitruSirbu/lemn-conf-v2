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

/** A room dimension, bounded per axis (review finding F2). Placement containment is checked against
 *  the room the document carries, so an unbounded room made containment vacuous. */
function roomDimensionSchema(maximumMm: number) {
  return z.number().int().positive().max(maximumMm);
}

export const HandleSchema = z.enum(["steel", "black", "push"]);
export type Handle = z.infer<typeof HandleSchema>;

/** ADR 0132 decision 1: wall C is a world wall, its own frame — the same kind of fact wall A and
 *  wall B's letters already are. `"C"` is additive: every stored placement written before this wave
 *  named only `"A"` or `"B"`, and stays exactly as valid. */
export const DesignWallSchema = z.enum(["A", "B", "C"]);
export type DesignWall = z.infer<typeof DesignWallSchema>;

/** `"U"` is M7B's addition (ADR 0132 decision 6). Additive for the same reason `"C"` is: every
 *  stored `"L"` and `"linear"` room parses unchanged. */
export const DesignRoomShapeSchema = z.enum(["L", "linear", "U"]);
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
  /** **A finish is two kinds of thing since wave 6P** — a palette entry or a free colour — and
   *  `materials.ts` declares both. A document written under the shipped five-value enum is carried
   *  forward **pre-parse** by `migrateDesign`'s version 4 arm — the schema cannot express the stored
   *  string, so nothing later than the parse could rescue it — which is why wave 6P's bump to schema
   *  version 5 is a rewrite of stored values (ADR 0055) and not an absent field (ADR 0053). */
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
  /**
   * **The `buildId` whose clearance supplied `depthMm`** — the member that won §3.2's MAX when this
   * extent was frozen (ADR 0073 decision 1), so a depth change can re-ask that body in the catalogue
   * built at the new setting instead of carrying the old setting's number forward.
   *
   * A `buildId` rather than a band or a chain: a band cannot tell an oven tower's 638 from a deep
   * top's 600, and a chain would be a second statement of arithmetic the catalogue already owns.
   *
   * **Optional, additive, and no schema version bump** (ADR 0073 decision 6). A document written
   * before this wave carries none, parses unchanged, loads with the geometry it always had and is
   * not rewritten by a load; the field arrives on the next save. An absent value and a `buildId` the
   * catalogue no longer holds both fall to the deeper-only rule and neither is refused (ADR 0052 — a
   * load that refuses is a dead link). What **is** refused, fail-closed at both seams, is a value
   * that is not a `buildId`-shaped string, which is why this is `identifierSchema` and the same
   * schema `CabinetBodySchema.buildId` is parsed against: a malformed document, not an old one.
   */
  depthFromBuildId: identifierSchema.optional(),
});
export type EmptyColumn = z.infer<typeof EmptyColumnSchema>;

/**
 * The frozen extent of a column that **does** still hold a member, as ADR 0053 records it.
 *
 * The exact complement of `EmptyColumnSchema` and deliberately the same shape, because it is
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

const DesignRoomFieldsSchema = z.strictObject({
  shape: DesignRoomShapeSchema,
  widthMm: roomDimensionSchema(MAX_ROOM_WIDTH_MM),
  depthMm: roomDimensionSchema(MAX_ROOM_DEPTH_MM),
  heightMm: roomDimensionSchema(MAX_ROOM_HEIGHT_MM),
  /** Wall C's run (ADR 0132 decision 6). Present **iff** `shape` is `"U"` — the refinement below —
   *  so an L or a straight document can never carry it and a U can never lack it. The bound is wall
   *  B's own (`MAX_ROOM_DEPTH_MM`, both are `MAX_ROOM_RUN_MM`); storage's own bounds are U1 slice
   *  S2's to re-derive, not this slice's. */
  wallCMm: roomDimensionSchema(MAX_ROOM_DEPTH_MM).optional(),
  /** Which way the corner turns (ADR 0129 D2). Optional, and the product writes it only for a
   *  right-hand room: an absent key is left, so every left-hand document stays byte-identical to
   *  what this schema wrote before this key existed — no schema version bump is owed, the same
   *  argument as `columnExtents` (ADR 0053). A truthful explicit `"left"` still parses. Read only
   *  through `cornerDirectionOf`, the one production reader (ADR 0129 D2). **Refused on a `"U"` when
   *  the value is `"right"`** (ADR 0132 decision 6, Q-U4 (b), ADR 0104 Amendment C): a U has no
   *  right-hand variant, so the product never writes one, and a truthful `"left"` or an absent key
   *  still parses — refusing those is what ADR 0129 rejected. */
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
  /**
   * **The whole-kitchen colour** — ADR 0099 decision 1's middle level, under a cabinet's own
   * `body.finish` and over the material's declared `defaultFinish`.
   *
   * **Its absence is a valid, unchanged state, so no schema version bump is owed** (ADR 0099
   * decision 10). A document written without it has chosen no global colour and loads, renders and
   * prices exactly as it does today — ADR 0053's argument, and the fourth key this container was
   * built for.
   *
   * **The hazard runs backward, not forward.** This is a `strictObject`, so once documents carrying
   * this key exist, a rollback to a build without it turns each of them into an unreadable design at
   * the load seam. That is a no-rollback release note rather than a migration, and it is the first
   * field here whose absence is safe and whose presence is not.
   *
   * **`FinishSchema` and no offer check.** Whether the design's material offers this colour is a
   * question about another key of the same document, which a field schema cannot ask without
   * becoming a second validator; `setMaterialTier` keeps it true on every material change
   * (ADR 0099 decision 6) and the load seam re-resolves it.
   */
  finish: FinishSchema.optional(),
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
 * version-4 documents are stricter and are checked by `migrateDesign`. */
export function cabinetDepthMmOf(design: Design): number {
  return design.settings?.cabinetDepthMm ?? 600;
}
