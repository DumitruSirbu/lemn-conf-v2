/**
 * Minimal image headers for the thumbnail check: just the bytes a header reader looks at, with no pixel data. Each builder
 * takes the declared size, and `paddedTo` grows the file to an exact length without moving the header.
 */

export interface DeclaredSize {
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface BuiltImage {
  readonly size: DeclaredSize;
  readonly paddedTo?: number;
}

const ASCII = (text: string): number[] =>
  Array.from(text, (character) => character.charCodeAt(0));

const uint32BigEndian = (value: number): number[] => [
  (value >>> 24) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 8) & 0xff,
  value & 0xff,
];

const uint16BigEndian = (value: number): number[] => [
  (value >>> 8) & 0xff,
  value & 0xff,
];

const uint32LittleEndian = (value: number): number[] =>
  uint32BigEndian(value).reverse();

const uint16LittleEndian = (value: number): number[] =>
  uint16BigEndian(value).reverse();

const uint24LittleEndian = (value: number): number[] => [
  value & 0xff,
  (value >>> 8) & 0xff,
  (value >>> 16) & 0xff,
];

function pngChunk(type: string, data: readonly number[]): number[] {
  return [
    ...uint32BigEndian(data.length),
    ...ASCII(type),
    ...data,
    ...uint32BigEndian(0),
  ];
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function ihdrChunk({ widthPx, heightPx }: DeclaredSize): number[] {
  return pngChunk("IHDR", [
    ...uint32BigEndian(widthPx),
    ...uint32BigEndian(heightPx),
    8,
    2,
    0,
    0,
    0,
  ]);
}

export const ANIMATION_CONTROL_CHUNK = pngChunk("acTL", [
  ...uint32BigEndian(2),
  ...uint32BigEndian(0),
]);

export function pngBytes(
  { size, paddedTo }: BuiltImage,
  chunksBeforeData: readonly number[] = [],
  chunksAfterData: readonly number[] = [],
): Uint8Array {
  const withoutData = [
    ...PNG_SIGNATURE,
    ...ihdrChunk(size),
    ...chunksBeforeData,
  ];
  const tail = [...pngChunk("IEND", []), ...chunksAfterData];
  const dataLength =
    paddedTo === undefined
      ? 0
      : paddedTo - withoutData.length - tail.length - PNG_CHUNK_OVERHEAD;
  return Uint8Array.from([
    ...withoutData,
    ...pngChunk("IDAT", new Array<number>(dataLength).fill(0)),
    ...tail,
  ]);
}

const PNG_CHUNK_OVERHEAD = 12;

function riff(chunk: readonly number[], paddedTo?: number): Uint8Array {
  const padding =
    paddedTo === undefined ? 0 : paddedTo - chunk.length - RIFF_PREFIX_BYTES;
  const body = [
    ...ASCII("WEBP"),
    ...chunk,
    ...new Array<number>(padding).fill(0),
  ];
  return Uint8Array.from([
    ...ASCII("RIFF"),
    ...uint32LittleEndian(body.length),
    ...body,
  ]);
}

const RIFF_PREFIX_BYTES = 12;

export function webpLossyBytes({ size, paddedTo }: BuiltImage): Uint8Array {
  const payload = [
    0x00,
    0x00,
    0x00,
    0x9d,
    0x01,
    0x2a,
    ...uint16LittleEndian(size.widthPx),
    ...uint16LittleEndian(size.heightPx),
  ];
  return riff(
    [...ASCII("VP8 "), ...uint32LittleEndian(payload.length), ...payload],
    paddedTo,
  );
}

export function webpLosslessBytes({ size, paddedTo }: BuiltImage): Uint8Array {
  const bits = (size.widthPx - 1) | ((size.heightPx - 1) << 14);
  const payload = [0x2f, ...uint32LittleEndian(bits), 0x00];
  return riff(
    [...ASCII("VP8L"), ...uint32LittleEndian(payload.length), ...payload],
    paddedTo,
  );
}

const WEBP_ANIMATION_FLAG = 0x02;
const WEBP_ICC_FLAG = 0x20;

export function webpExtendedBytes(
  { size, paddedTo }: BuiltImage,
  { isAnimated }: { readonly isAnimated: boolean },
): Uint8Array {
  const flags = isAnimated ? WEBP_ANIMATION_FLAG : WEBP_ICC_FLAG;
  const payload = [
    flags,
    0,
    0,
    0,
    ...uint24LittleEndian(size.widthPx - 1),
    ...uint24LittleEndian(size.heightPx - 1),
  ];
  return riff(
    [...ASCII("VP8X"), ...uint32LittleEndian(payload.length), ...payload],
    paddedTo,
  );
}

export function jpegBytes({ size, paddedTo }: BuiltImage): Uint8Array {
  const applicationSegment = [
    0xff,
    0xe0,
    ...uint16BigEndian(16),
    ...ASCII("JFIF"),
    ...new Array<number>(10).fill(0),
  ];
  const frame = [
    0xff,
    0xc0,
    ...uint16BigEndian(17),
    8,
    ...uint16BigEndian(size.heightPx),
    ...uint16BigEndian(size.widthPx),
    3,
    1,
    0x22,
    0,
    2,
    0x11,
    1,
    3,
    0x11,
    1,
  ];
  const withoutPadding = [0xff, 0xd8, ...applicationSegment, ...frame];
  const padding =
    paddedTo === undefined ? 0 : paddedTo - withoutPadding.length - 2;
  return Uint8Array.from([
    ...withoutPadding,
    ...new Array<number>(padding).fill(0),
    0xff,
    0xd9,
  ]);
}
