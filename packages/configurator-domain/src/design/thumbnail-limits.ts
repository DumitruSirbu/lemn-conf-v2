// The figures, closed list and image check a kitchen card's thumbnail is held to, once, for the editor that captures it,
// the route that checks it and the store that keeps it (ADR 0181 d3, d4). I/O-free: the browser bundle imports this
// module.

import { hasMagicNumber, readImageHeader } from "./image-header.js";
import type { ImageMimeType } from "./image-header.js";

/** The one capture size of a card thumbnail, in pixels (4:3). The editor draws it exactly and the check reads it off the
 *  header; a re-encode to a smaller file lowers the quality, never the size. */
export const DESIGN_THUMBNAIL_WIDTH_PX = 640;
export const DESIGN_THUMBNAIL_HEIGHT_PX = 480;

/** The most a stored thumbnail may weigh, in bytes. The table's own check (`design_thumbnails_image_size`) is looser. */
export const MAX_DESIGN_THUMBNAIL_BYTES = 128 * 1024;

/** The image types a thumbnail may be stored and served as (`design_thumbnails_image_type_is_known`), a closed list. */
export const DESIGN_THUMBNAIL_TYPES = [
  "image/webp",
  "image/png",
  "image/jpeg",
] as const satisfies readonly ImageMimeType[];

export type DesignThumbnailType = (typeof DESIGN_THUMBNAIL_TYPES)[number];

export function isDesignThumbnailType(
  value: unknown,
): value is DesignThumbnailType {
  return DESIGN_THUMBNAIL_TYPES.some((type) => type === value);
}

/** Why bytes are not a thumbnail. A code, never the bytes: a refusal is safe to log and to answer with. */
export type ThumbnailRefusal =
  | "type-unknown"
  | "empty"
  | "too-large"
  | "magic-mismatch"
  | "unreadable-header"
  | "animated"
  | "wrong-dimensions";

export type ThumbnailVerdict =
  | { readonly kind: "accepted"; readonly type: DesignThumbnailType }
  | { readonly kind: "refused"; readonly reason: ThumbnailRefusal };

/**
 * Whether these bytes are an image of the declared type, at the capture size, within the size cap, and not animated.
 * The header is read and nothing is decoded: the server never turns the image into pixels (ADR 0112 Amendment A d6).
 */
export function checkDesignThumbnail(
  declaredType: unknown,
  bytes: Uint8Array,
): ThumbnailVerdict {
  if (!isDesignThumbnailType(declaredType)) return refusedFor("type-unknown");
  if (bytes.byteLength < 1) return refusedFor("empty");
  if (bytes.byteLength > MAX_DESIGN_THUMBNAIL_BYTES) {
    return refusedFor("too-large");
  }
  if (!hasMagicNumber(declaredType, bytes)) return refusedFor("magic-mismatch");
  const reading = readImageHeader(declaredType, bytes);
  if (reading.kind === "unreadable") return refusedFor("unreadable-header");
  if (reading.header.isAnimated) return refusedFor("animated");
  const isCaptureSize =
    reading.header.widthPx === DESIGN_THUMBNAIL_WIDTH_PX &&
    reading.header.heightPx === DESIGN_THUMBNAIL_HEIGHT_PX;
  return isCaptureSize
    ? { kind: "accepted", type: declaredType }
    : refusedFor("wrong-dimensions");
}

function refusedFor(reason: ThumbnailRefusal): ThumbnailVerdict {
  return { kind: "refused", reason };
}
