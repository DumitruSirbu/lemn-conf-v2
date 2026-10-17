import "server-only";

import {
  MAX_PRESET_THUMBNAIL_BYTES,
  type PresetThumbnailType,
} from "@lemnaria/persistence";

/**
 * The one capture size (plan M8C section 3.4, ADR 0112 Amendment A decision 6): the preset's card and its preview are
 * the same image, drawn at the overview camera at this size. The editor's capture meets it exactly, and a re-encode to
 * a smaller file lowers the quality and never the size.
 */
export const PRESET_THUMBNAIL_WIDTH_PX = 1280;
export const PRESET_THUMBNAIL_HEIGHT_PX = 960;

export const PRESET_THUMBNAIL_TYPES: readonly PresetThumbnailType[] = [
  "image/webp",
  "image/png",
  "image/jpeg",
];

export type ThumbnailVerdict =
  | { readonly kind: "accepted"; readonly type: PresetThumbnailType }
  | { readonly kind: "refused" };

const REFUSED: ThumbnailVerdict = Object.freeze({ kind: "refused" });

interface PixelSize {
  readonly widthPx: number;
  readonly heightPx: number;
}

/**
 * Whether these bytes are an image of the type the caller declared, at the capture size, within the size cap. The
 * header is read and nothing is decoded: the server never turns the image into pixels (plan section 3.3), so this
 * stands between an upload and a stored row by magic bytes, declared type, size and the dimensions in the header.
 * Every read is bounds-checked and a header that is short, odd or lying is a refusal, never a throw.
 */
export function checkThumbnail(
  declaredType: unknown,
  bytes: Uint8Array,
): ThumbnailVerdict {
  if (!isThumbnailType(declaredType)) return REFUSED;
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_PRESET_THUMBNAIL_BYTES) {
    return REFUSED;
  }
  const size = HEADER_READERS[declaredType](bytes);
  if (size === undefined) return REFUSED;
  const isCaptureSize =
    size.widthPx === PRESET_THUMBNAIL_WIDTH_PX &&
    size.heightPx === PRESET_THUMBNAIL_HEIGHT_PX;
  return isCaptureSize ? { kind: "accepted", type: declaredType } : REFUSED;
}

function isThumbnailType(value: unknown): value is PresetThumbnailType {
  return (
    typeof value === "string" &&
    PRESET_THUMBNAIL_TYPES.some((type) => type === value)
  );
}

const HEADER_READERS: Readonly<
  Record<PresetThumbnailType, (bytes: Uint8Array) => PixelSize | undefined>
> = {
  "image/png": readPngSize,
  "image/jpeg": readJpegSize,
  "image/webp": readWebpSize,
};

// ---- PNG: the signature, then IHDR as the first chunk (length 13), width and height big-endian ----

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_IHDR_LENGTH = 13;
const PNG_IHDR_TYPE_OFFSET = 12;
const PNG_WIDTH_OFFSET = 16;
const PNG_HEIGHT_OFFSET = 20;
const PNG_HEADER_BYTES = 24;

function readPngSize(bytes: Uint8Array): PixelSize | undefined {
  if (bytes.byteLength < PNG_HEADER_BYTES) return undefined;
  if (!startsWith(bytes, 0, PNG_SIGNATURE)) return undefined;
  if (readUint32BigEndian(bytes, PNG_SIGNATURE.length) !== PNG_IHDR_LENGTH) {
    return undefined;
  }
  if (!hasAscii(bytes, PNG_IHDR_TYPE_OFFSET, "IHDR")) return undefined;
  return {
    widthPx: readUint32BigEndian(bytes, PNG_WIDTH_OFFSET),
    heightPx: readUint32BigEndian(bytes, PNG_HEIGHT_OFFSET),
  };
}

// ---- JPEG: the start of image, then a bounded walk over marker segments to the first start-of-frame ----

const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const JPEG_MARKER_PREFIX = 0xff;
const JPEG_START_OF_SCAN = 0xda;
const JPEG_END_OF_IMAGE = 0xd9;
/** More segments than any real header holds before its frame; a walk that has not found the frame by here is a
 *  refusal, so a crafted file cannot make the walk long. */
const JPEG_SEGMENT_STEP_LIMIT = 64;
const JPEG_SEGMENT_HEADER_BYTES = 4;
const JPEG_FRAME_HEIGHT_OFFSET = 5;
const JPEG_FRAME_WIDTH_OFFSET = 7;
/** A frame segment's length field counts itself, the precision, the two sizes and the component count. */
const JPEG_FRAME_MIN_LENGTH = 8;
/** Start-of-frame markers C0 to CF, but for the table definitions and the arithmetic-coding and extension markers
 *  that sit among them. */
const JPEG_NOT_A_FRAME_MARKERS = [0xc4, 0xc8, 0xcc];

function readJpegSize(bytes: Uint8Array): PixelSize | undefined {
  if (!startsWith(bytes, 0, JPEG_SIGNATURE)) return undefined;
  let position = 2;
  for (let step = 0; step < JPEG_SEGMENT_STEP_LIMIT; step += 1) {
    const marker = markerAt(bytes, position);
    if (marker === undefined) return undefined;
    if (isStartOfFrame(marker)) return jpegFrameSizeAt(bytes, position);
    if (marker === JPEG_START_OF_SCAN || marker === JPEG_END_OF_IMAGE) {
      return undefined;
    }
    const next = nextSegmentPosition(bytes, position, marker);
    if (next === undefined) return undefined;
    position = next;
  }
  return undefined;
}

/** The marker byte at `position`, which must start a segment (`FF` and a marker that is neither a fill nor zero). */
function markerAt(bytes: Uint8Array, position: number): number | undefined {
  if (position + 1 >= bytes.byteLength) return undefined;
  if (bytes[position] !== JPEG_MARKER_PREFIX) return undefined;
  const marker = bytes[position + 1];
  return marker === undefined || marker === 0x00 || marker === 0xff
    ? undefined
    : marker;
}

function isStartOfFrame(marker: number): boolean {
  return (
    marker >= 0xc0 &&
    marker <= 0xcf &&
    !JPEG_NOT_A_FRAME_MARKERS.includes(marker)
  );
}

function jpegFrameSizeAt(
  bytes: Uint8Array,
  position: number,
): PixelSize | undefined {
  const segmentLength = readUint16BigEndian(bytes, position + 2);
  const frameEnd = position + 2 + segmentLength;
  if (segmentLength < JPEG_FRAME_MIN_LENGTH || frameEnd > bytes.byteLength) {
    return undefined;
  }
  return {
    heightPx: readUint16BigEndian(bytes, position + JPEG_FRAME_HEIGHT_OFFSET),
    widthPx: readUint16BigEndian(bytes, position + JPEG_FRAME_WIDTH_OFFSET),
  };
}

/** Where the segment after this one begins: past its marker and its declared length, which must reach at least its own
 *  two length bytes and stay inside the file. A marker with no length (a restart or a bare start of image) is a
 *  refusal, since none belongs before a frame. */
function nextSegmentPosition(
  bytes: Uint8Array,
  position: number,
  marker: number,
): number | undefined {
  const hasNoLength = marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8);
  if (hasNoLength) return undefined;
  if (position + JPEG_SEGMENT_HEADER_BYTES > bytes.byteLength) return undefined;
  const segmentLength = readUint16BigEndian(bytes, position + 2);
  const next = position + 2 + segmentLength;
  return segmentLength < 2 || next > bytes.byteLength ? undefined : next;
}

// ---- WebP: RIFF, the file's size agreeing with the length, then a lossy, lossless or extended header ----

const RIFF_HEADER_BYTES = 12;
const RIFF_SIZE_FIELD_OFFSET = 4;
const RIFF_SIZE_FIELD_EXCLUDED_BYTES = 8;
const WEBP_FIRST_CHUNK_OFFSET = 12;
const WEBP_CHUNK_PAYLOAD_OFFSET = 20;
const WEBP_VP8_SIGNATURE = [0x9d, 0x01, 0x2a];
const WEBP_VP8_MIN_BYTES = 30;
const WEBP_VP8L_SIGNATURE_BYTE = 0x2f;
const WEBP_VP8L_MIN_BYTES = 25;
const WEBP_VP8X_MIN_BYTES = 30;
const WEBP_VP8X_ANIMATION_FLAG = 0x02;
const WEBP_14_BIT_MASK = 0x3fff;
const WEBP_14_BITS = 14;

function readWebpSize(bytes: Uint8Array): PixelSize | undefined {
  if (bytes.byteLength < RIFF_HEADER_BYTES) return undefined;
  if (!hasAscii(bytes, 0, "RIFF") || !hasAscii(bytes, 8, "WEBP")) {
    return undefined;
  }
  const declaredEnd =
    readUint32LittleEndian(bytes, RIFF_SIZE_FIELD_OFFSET) +
    RIFF_SIZE_FIELD_EXCLUDED_BYTES;
  if (declaredEnd !== bytes.byteLength) return undefined;
  if (hasAscii(bytes, WEBP_FIRST_CHUNK_OFFSET, "VP8 ")) {
    return readWebpLossySize(bytes);
  }
  if (hasAscii(bytes, WEBP_FIRST_CHUNK_OFFSET, "VP8L")) {
    return readWebpLosslessSize(bytes);
  }
  if (hasAscii(bytes, WEBP_FIRST_CHUNK_OFFSET, "VP8X")) {
    return readWebpExtendedSize(bytes);
  }
  return undefined;
}

/** The key frame's start code, then two 14-bit little-endian sizes (the top two bits are a scale and not size). */
function readWebpLossySize(bytes: Uint8Array): PixelSize | undefined {
  if (bytes.byteLength < WEBP_VP8_MIN_BYTES) return undefined;
  const isKeyFrame = ((bytes[WEBP_CHUNK_PAYLOAD_OFFSET] ?? 1) & 0x01) === 0;
  if (!isKeyFrame) return undefined;
  if (!startsWith(bytes, WEBP_CHUNK_PAYLOAD_OFFSET + 3, WEBP_VP8_SIGNATURE)) {
    return undefined;
  }
  return {
    widthPx:
      readUint16LittleEndian(bytes, WEBP_CHUNK_PAYLOAD_OFFSET + 6) &
      WEBP_14_BIT_MASK,
    heightPx:
      readUint16LittleEndian(bytes, WEBP_CHUNK_PAYLOAD_OFFSET + 8) &
      WEBP_14_BIT_MASK,
  };
}

/** The lossless signature byte, then the width less one and the height less one in 14 bits each, from the bit stream's
 *  least significant end. */
function readWebpLosslessSize(bytes: Uint8Array): PixelSize | undefined {
  if (bytes.byteLength < WEBP_VP8L_MIN_BYTES) return undefined;
  if (bytes[WEBP_CHUNK_PAYLOAD_OFFSET] !== WEBP_VP8L_SIGNATURE_BYTE) {
    return undefined;
  }
  const bits = readUint32LittleEndian(bytes, WEBP_CHUNK_PAYLOAD_OFFSET + 1);
  return {
    widthPx: (bits & WEBP_14_BIT_MASK) + 1,
    heightPx: ((bits >>> WEBP_14_BITS) & WEBP_14_BIT_MASK) + 1,
  };
}

/** The extended header: the canvas, each side less one in 24 bits. An animation is not a thumbnail. */
function readWebpExtendedSize(bytes: Uint8Array): PixelSize | undefined {
  if (bytes.byteLength < WEBP_VP8X_MIN_BYTES) return undefined;
  const flags = bytes[WEBP_CHUNK_PAYLOAD_OFFSET] ?? WEBP_VP8X_ANIMATION_FLAG;
  if ((flags & WEBP_VP8X_ANIMATION_FLAG) !== 0) return undefined;
  return {
    widthPx: readUint24LittleEndian(bytes, WEBP_CHUNK_PAYLOAD_OFFSET + 4) + 1,
    heightPx: readUint24LittleEndian(bytes, WEBP_CHUNK_PAYLOAD_OFFSET + 7) + 1,
  };
}

// ---- Bounds-checked reads: the callers have checked the length, and an out-of-range byte reads as a mismatch ----

const BYTE_BITS = 8;
const OUT_OF_RANGE = -1;

function byteAt(bytes: Uint8Array, position: number): number {
  return bytes[position] ?? OUT_OF_RANGE;
}

function readUint16BigEndian(bytes: Uint8Array, position: number): number {
  return (byteAt(bytes, position) << BYTE_BITS) | byteAt(bytes, position + 1);
}

function readUint32BigEndian(bytes: Uint8Array, position: number): number {
  return (
    readUint16BigEndian(bytes, position) * 0x10000 +
    readUint16BigEndian(bytes, position + 2)
  );
}

function readUint16LittleEndian(bytes: Uint8Array, position: number): number {
  return byteAt(bytes, position) | (byteAt(bytes, position + 1) << BYTE_BITS);
}

function readUint24LittleEndian(bytes: Uint8Array, position: number): number {
  return (
    readUint16LittleEndian(bytes, position) +
    byteAt(bytes, position + 2) * 0x10000
  );
}

function readUint32LittleEndian(bytes: Uint8Array, position: number): number {
  return (
    readUint16LittleEndian(bytes, position) +
    readUint16LittleEndian(bytes, position + 2) * 0x10000
  );
}

function startsWith(
  bytes: Uint8Array,
  position: number,
  expected: readonly number[],
): boolean {
  return expected.every((byte, index) => bytes[position + index] === byte);
}

function hasAscii(bytes: Uint8Array, position: number, text: string): boolean {
  return startsWith(
    bytes,
    position,
    Array.from(text, (character) => character.charCodeAt(0)),
  );
}
