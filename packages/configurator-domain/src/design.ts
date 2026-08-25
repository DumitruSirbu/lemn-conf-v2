import { z } from "zod";

import { ConfigurationTimestampSchema } from "./schemas.js";

const millimetreSchema = z.number().int();

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
  buildId: z.string().min(1),
  widthMm: millimetreSchema,
  heightMm: millimetreSchema,
  /** `2 ×` the wall-normal offset measured on this body after it was built (`BodyProbe`), which
   *  is what seats its back face on the wall plane — never a claim about the body's physical
   *  depth. Absent on every design written before M3, which is why it is optional and needs no
   *  schema version bump: `deriveFrame` then falls back to the catalogue's `frameDepthMm`. */
  seatDepthMm: millimetreSchema.optional(),
  finish: FinishSchema.optional(),
  handle: HandleSchema.optional(),
});
export type CabinetBody = z.infer<typeof CabinetBodySchema>;

export const DesignPlacementSchema = z.strictObject({
  id: z.string().min(1),
  wall: DesignWallSchema,
  alongMm: millimetreSchema,
  y0Mm: millimetreSchema,
  body: CabinetBodySchema,
});
export type DesignPlacement = z.infer<typeof DesignPlacementSchema>;

export const DesignRoomSchema = z.strictObject({
  shape: DesignRoomShapeSchema,
  widthMm: millimetreSchema,
  depthMm: millimetreSchema,
  heightMm: millimetreSchema,
});
export type DesignRoom = z.infer<typeof DesignRoomSchema>;

export const DesignSchema = z.strictObject({
  room: DesignRoomSchema,
  presetId: z.string().nullable(),
  placements: z.array(DesignPlacementSchema),
  createdAt: ConfigurationTimestampSchema,
  updatedAt: ConfigurationTimestampSchema,
});
export type Design = z.infer<typeof DesignSchema>;
