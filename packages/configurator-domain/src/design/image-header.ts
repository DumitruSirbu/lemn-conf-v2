// What the first bytes of a PNG, JPEG or WebP say about the image, read without decoding a pixel. I/O-free and built on
// `Uint8Array` and `DataView` only, so the browser bundle and the server read one header the same way.

export type ImageMimeType = "image/png" | "image/jpeg" | "image/webp";

export interface ImageHeader {
  readonly widthPx: number;
  readonly heightPx: number;
  /** A PNG with an `acTL` chunk, or a WebP whose `VP8X` flags set the animation bit. */
  readonly isAnimated: boolean;
}

/** `unreadable` is any header that is short, odd or lying: never a throw. */
export type ImageHeaderReading =
  | { readonly kind: "read"; readonly header: ImageHeader }
  | { readonly kind: "unreadable" };

const UNREADABLE: ImageHeaderReading = Object.freeze({ kind: "unreadable" });

const MAGIC_NUMBERS: Readonly<Record<ImageMimeType, readonly number[]>> = {
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/webp": [],
};

const RIFF_HEADER_BYTES = 12;

/** Whether the file starts as the claimed type does. A WebP is a RIFF container whose form type is `WEBP`. */
export function hasMagicNumber(
  type: ImageMimeType,
  bytes: Uint8Array,
): boolean {
  if (type === "image/webp") {
    return (
      bytes.byteLength >= RIFF_HEADER_BYTES &&
      asciiAt(bytes, 0, 4) === "RIFF" &&
      asciiAt(bytes, 8, 4) === "WEBP"
    );
  }
  return MAGIC_NUMBERS[type].every((byte, index) => bytes[index] === byte);
}

/**
 * The size and animation flag the header declares, for bytes that already carry the type's magic number. Every read is
 * bounds-checked by `DataView`, whose `RangeError` is the one failure turned into `unreadable`.
 */
export function readImageHeader(
  type: ImageMimeType,
  bytes: Uint8Array,
): ImageHeaderReading {
  try {
    const header = HEADER_READERS[type](bytes);
    return header === undefined ? UNREADABLE : { kind: "read", header };
  } catch (failure) {
    if (failure instanceof RangeError) return UNREADABLE;
    throw failure;
  }
}

const HEADER_READERS: Readonly<
  Record<ImageMimeType, (bytes: Uint8Array) => ImageHeader | undefined>
> = {
  "image/png": readPngHeader,
  "image/jpeg": readJpegHeader,
  "image/webp": readWebpHeader,
};

// ---- PNG: IHDR is the first chunk (length 13); an `acTL` chunk before the first `IDAT` makes it an APNG ----

const PNG_SIGNATURE_BYTES = 8;
const PNG_IHDR_LENGTH = 13;
const PNG_IHDR_LENGTH_OFFSET = 8;
const PNG_IHDR_TYPE_OFFSET = 12;
const PNG_WIDTH_OFFSET = 16;
const PNG_HEIGHT_OFFSET = 20;
const PNG_CHUNK_OVERHEAD_BYTES = 12;
/** More chunks than any real header holds before its pixel data; a walk past this refuses, so a crafted file cannot
 *  make it long. */
const PNG_CHUNK_STEP_LIMIT = 64;

function readPngHeader(bytes: Uint8Array): ImageHeader | undefined {
  const view = viewOf(bytes);
  const isIhdrFirst =
    view.getUint32(PNG_IHDR_LENGTH_OFFSET) === PNG_IHDR_LENGTH &&
    asciiAt(bytes, PNG_IHDR_TYPE_OFFSET, 4) === "IHDR";
  if (!isIhdrFirst) return undefined;
  const isAnimated = pngDeclaresAnimation(bytes, view);
  if (isAnimated === undefined) return undefined;
  return {
    widthPx: view.getUint32(PNG_WIDTH_OFFSET),
    heightPx: view.getUint32(PNG_HEIGHT_OFFSET),
    isAnimated,
  };
}

/** Walks chunk headers up to the first pixel-data chunk, where the APNG specification requires `acTL` to precede.
 *  `undefined` when no pixel data is reached inside the step limit. */
function pngDeclaresAnimation(
  bytes: Uint8Array,
  view: DataView,
): boolean | undefined {
  let position = PNG_SIGNATURE_BYTES;
  for (let step = 0; step < PNG_CHUNK_STEP_LIMIT; step += 1) {
    const chunkType = asciiAt(bytes, position + 4, 4);
    if (chunkType === "acTL") return true;
    if (chunkType === "IDAT" || chunkType === "IEND") return false;
    position += PNG_CHUNK_OVERHEAD_BYTES + view.getUint32(position);
  }
  return undefined;
}

// ---- JPEG: a bounded walk over marker segments to the first start-of-frame ----

const JPEG_MARKER_PREFIX = 0xff;
const JPEG_START_OF_SCAN = 0xda;
const JPEG_END_OF_IMAGE = 0xd9;
const JPEG_SEGMENT_STEP_LIMIT = 64;
const JPEG_FRAME_HEIGHT_OFFSET = 5;
const JPEG_FRAME_WIDTH_OFFSET = 7;
/** A frame segment's length field counts itself, the precision, the two sizes and the component count. */
const JPEG_FRAME_MIN_LENGTH = 8;
/** The table-definition and arithmetic-coding markers that sit among the start-of-frame markers C0 to CF. */
const JPEG_NOT_A_FRAME_MARKERS = [0xc4, 0xc8, 0xcc];
const JPEG_FIRST_FRAME_MARKER = 0xc0;
const JPEG_LAST_FRAME_MARKER = 0xcf;
const JPEG_FIRST_RESTART_MARKER = 0xd0;
const JPEG_START_OF_IMAGE_MARKER = 0xd8;
const JPEG_TEMPORARY_MARKER = 0x01;

function readJpegHeader(bytes: Uint8Array): ImageHeader | undefined {
  const view = viewOf(bytes);
  let position = 2;
  for (let step = 0; step < JPEG_SEGMENT_STEP_LIMIT; step += 1) {
    const marker = markerAt(view, position);
    if (marker === undefined) return undefined;
    if (isStartOfFrame(marker)) return jpegFrameHeader(view, position);
    if (marker === JPEG_START_OF_SCAN || marker === JPEG_END_OF_IMAGE) {
      return undefined;
    }
    const next = nextJpegSegment(view, position, marker);
    if (next === undefined) return undefined;
    position = next;
  }
  return undefined;
}

/** The marker byte after an `FF` at `position`, which must be neither a fill byte nor a stuffed zero. */
function markerAt(view: DataView, position: number): number | undefined {
  if (view.getUint8(position) !== JPEG_MARKER_PREFIX) return undefined;
  const marker = view.getUint8(position + 1);
  return marker === 0x00 || marker === JPEG_MARKER_PREFIX ? undefined : marker;
}

function isStartOfFrame(marker: number): boolean {
  return (
    marker >= JPEG_FIRST_FRAME_MARKER &&
    marker <= JPEG_LAST_FRAME_MARKER &&
    !JPEG_NOT_A_FRAME_MARKERS.includes(marker)
  );
}

function jpegFrameHeader(
  view: DataView,
  position: number,
): ImageHeader | undefined {
  const segmentLength = view.getUint16(position + 2);
  const frameEnd = position + 2 + segmentLength;
  if (segmentLength < JPEG_FRAME_MIN_LENGTH || frameEnd > view.byteLength) {
    return undefined;
  }
  return {
    heightPx: view.getUint16(position + JPEG_FRAME_HEIGHT_OFFSET),
    widthPx: view.getUint16(position + JPEG_FRAME_WIDTH_OFFSET),
    isAnimated: false,
  };
}

/** Past the marker and its declared length, which must reach its own two length bytes and stay inside the file. A marker
 *  with no length (a restart, a bare start of image) belongs nowhere before a frame. */
function nextJpegSegment(
  view: DataView,
  position: number,
  marker: number,
): number | undefined {
  const hasNoLength =
    marker === JPEG_TEMPORARY_MARKER ||
    (marker >= JPEG_FIRST_RESTART_MARKER &&
      marker <= JPEG_START_OF_IMAGE_MARKER);
  if (hasNoLength) return undefined;
  const segmentLength = view.getUint16(position + 2);
  const next = position + 2 + segmentLength;
  return segmentLength < 2 || next > view.byteLength ? undefined : next;
}

// ---- WebP: RIFF whose declared size is the file's, then a lossy, lossless or extended first chunk ----

const RIFF_SIZE_OFFSET = 4;
const RIFF_SIZE_EXCLUDED_BYTES = 8;
const WEBP_FIRST_CHUNK_OFFSET = 12;
const WEBP_PAYLOAD_OFFSET = 20;
const WEBP_KEY_FRAME_TAG_BIT = 0x01;
const WEBP_VP8_START_CODE = [0x9d, 0x01, 0x2a];
const WEBP_VP8_START_CODE_OFFSET = WEBP_PAYLOAD_OFFSET + 3;
const WEBP_VP8_WIDTH_OFFSET = WEBP_PAYLOAD_OFFSET + 6;
const WEBP_VP8_HEIGHT_OFFSET = WEBP_PAYLOAD_OFFSET + 8;
const WEBP_VP8L_SIGNATURE_BYTE = 0x2f;
const WEBP_VP8L_BITS_OFFSET = WEBP_PAYLOAD_OFFSET + 1;
const WEBP_VP8X_ANIMATION_FLAG = 0x02;
const WEBP_VP8X_WIDTH_OFFSET = WEBP_PAYLOAD_OFFSET + 4;
const WEBP_VP8X_HEIGHT_OFFSET = WEBP_PAYLOAD_OFFSET + 7;
const WEBP_14_BIT_MASK = 0x3fff;
const WEBP_14_BITS = 14;
const UINT16_RANGE = 0x10000;

function readWebpHeader(bytes: Uint8Array): ImageHeader | undefined {
  const view = viewOf(bytes);
  const declaredEnd =
    view.getUint32(RIFF_SIZE_OFFSET, true) + RIFF_SIZE_EXCLUDED_BYTES;
  if (declaredEnd !== bytes.byteLength) return undefined;
  switch (asciiAt(bytes, WEBP_FIRST_CHUNK_OFFSET, 4)) {
    case "VP8 ":
      return readWebpLossyHeader(bytes, view);
    case "VP8L":
      return readWebpLosslessHeader(view);
    case "VP8X":
      return readWebpExtendedHeader(view);
    default:
      return undefined;
  }
}

/** The key frame's start code, then two 14-bit sizes (the top two bits of each are a scale, not size). */
function readWebpLossyHeader(
  bytes: Uint8Array,
  view: DataView,
): ImageHeader | undefined {
  const isKeyFrame =
    (view.getUint8(WEBP_PAYLOAD_OFFSET) & WEBP_KEY_FRAME_TAG_BIT) === 0;
  const hasStartCode = WEBP_VP8_START_CODE.every(
    (byte, index) => bytes[WEBP_VP8_START_CODE_OFFSET + index] === byte,
  );
  if (!isKeyFrame || !hasStartCode) return undefined;
  return {
    widthPx: view.getUint16(WEBP_VP8_WIDTH_OFFSET, true) & WEBP_14_BIT_MASK,
    heightPx: view.getUint16(WEBP_VP8_HEIGHT_OFFSET, true) & WEBP_14_BIT_MASK,
    isAnimated: false,
  };
}

/** The lossless signature byte, then width less one and height less one in 14 bits each from the stream's low end. */
function readWebpLosslessHeader(view: DataView): ImageHeader | undefined {
  if (view.getUint8(WEBP_PAYLOAD_OFFSET) !== WEBP_VP8L_SIGNATURE_BYTE) {
    return undefined;
  }
  const bits = view.getUint32(WEBP_VP8L_BITS_OFFSET, true);
  return {
    widthPx: (bits & WEBP_14_BIT_MASK) + 1,
    heightPx: ((bits >>> WEBP_14_BITS) & WEBP_14_BIT_MASK) + 1,
    isAnimated: false,
  };
}

/** The extended header: the animation flag, and the canvas as each side less one in 24 bits. */
function readWebpExtendedHeader(view: DataView): ImageHeader {
  const flags = view.getUint8(WEBP_PAYLOAD_OFFSET);
  return {
    widthPx: readUint24LittleEndian(view, WEBP_VP8X_WIDTH_OFFSET) + 1,
    heightPx: readUint24LittleEndian(view, WEBP_VP8X_HEIGHT_OFFSET) + 1,
    isAnimated: (flags & WEBP_VP8X_ANIMATION_FLAG) !== 0,
  };
}

function readUint24LittleEndian(view: DataView, position: number): number {
  return (
    view.getUint16(position, true) + view.getUint8(position + 2) * UINT16_RANGE
  );
}

// ---- Reads ----

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** `length` characters from `position`, fewer when the file ends first, so a short file never equals a tag. */
function asciiAt(bytes: Uint8Array, position: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(position, position + length));
}
