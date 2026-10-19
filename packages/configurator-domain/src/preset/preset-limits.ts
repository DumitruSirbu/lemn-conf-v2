// The figures and closed lists a preset is held to, once, for the editor that captures it, the route that checks it, the
// store that keeps it and the listing that reads it back (ADR 0112 Amendment A decision 6; ADR 0109 Amendment A).
// I/O-free: the browser bundle imports this module.

import type { DesignRoomShape } from "../design.js";

/** The one capture size of a preset's image, in pixels: the card and the preview are the same picture. The editor draws
 *  it exactly and the route reads it off the header; a re-encode to a smaller file lowers the quality, never the size. */
export const PRESET_THUMBNAIL_WIDTH_PX = 1280;
export const PRESET_THUMBNAIL_HEIGHT_PX = 960;

/** The most a stored thumbnail may weigh, in bytes (`presets_thumbnail_size`). */
export const MAX_PRESET_THUMBNAIL_BYTES = 512 * 1024;

/** The image types a preset may be stored and served as (`presets_thumbnail_type`), a closed list. */
export const PRESET_THUMBNAIL_TYPES = [
  "image/webp",
  "image/png",
  "image/jpeg",
] as const;

export type PresetThumbnailType = (typeof PRESET_THUMBNAIL_TYPES)[number];

export function isPresetThumbnailType(
  value: unknown,
): value is PresetThumbnailType {
  return PRESET_THUMBNAIL_TYPES.some((type) => type === value);
}

/** The room shapes a preset is saved in and listed by (`presets_shape`). */
export const PRESET_SHAPES = [
  "L",
  "linear",
  "U",
] as const satisfies readonly DesignRoomShape[];

export type PresetShape = (typeof PRESET_SHAPES)[number];

export function isPresetShape(value: unknown): value is PresetShape {
  return PRESET_SHAPES.some((shape) => shape === value);
}

/**
 * The most a preset's snapshot may measure, in bytes, so that every preset stored can be listed. The listing sends each
 * snapshot to Step 1, and `PRESET_LIST_LIMIT` of them at `MAX_DESIGN_BYTES` would be a 4.2 MB answer, so a snapshot
 * above this is left out of it. Checked at the write, where the owner can be told, and again by the listing. 128 KiB is
 * more than a full U packed with the narrowest bodies (about 80 KB) and five times a seeded kitchen's twenty-six
 * placements.
 */
export const MAX_PRESET_DESIGN_BYTES = 128 * 1024;

/** The most presets a room is offered: more than a phone shows at once. */
export const PRESET_LIST_LIMIT = 8;

/** What each listed preset carries around its snapshot, in bytes: the id, the typed name, the name's facts and the
 *  image address. Far above what they measure. */
const LISTING_SUMMARY_ALLOWANCE_BYTES = 16 * 1024;

/** The most a listing may measure, in bytes: `PRESET_LIST_LIMIT` snapshots at the size the write allows, and the summary
 *  around each. A longer answer is not the listing route talking. */
export const MAX_LISTING_BYTES =
  PRESET_LIST_LIMIT *
  (MAX_PRESET_DESIGN_BYTES + LISTING_SUMMARY_ALLOWANCE_BYTES);
