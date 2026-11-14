import type { DesignThumbnailType } from "@lemnaria/configurator-domain";

/**
 * Header-only 640x480 images that `checkDesignThumbnail` accepts, for a store that now refuses bytes that are no picture.
 * The container is real (PNG, JPEG, WebP lossy) and the pixel data is absent. A `trailer` rides at the end of the file,
 * where no header reader looks, so a test can tell one picture from another or carry every byte value through the store.
 */
const CAPTURE_WIDTH_PX = 640;
const CAPTURE_HEIGHT_PX = 480;

export interface DeclaredSize {
  readonly widthPx: number;
  readonly heightPx: number;
}

const CAPTURE_SIZE: DeclaredSize = {
  widthPx: CAPTURE_WIDTH_PX,
  heightPx: CAPTURE_HEIGHT_PX,
};

export function thumbnailBytes(
  type: DesignThumbnailType,
  trailer: ArrayLike<number> = [],
  size: DeclaredSize = CAPTURE_SIZE,
): Uint8Array {
  const file = Uint8Array.from([
    ...headerOf(type, size),
    ...Array.from(trailer),
  ]);
  return type === "image/webp" ? withRiffSizeOfTheFile(file) : file;
}

/** A PNG of the capture size that declares itself animated, which a thumbnail may not be. */
export function animatedPngBytes(): Uint8Array {
  const twoFramesLoopingForever = [...bigEndian32(2), ...bigEndian32(0)];
  return Uint8Array.from([
    ...PNG_SIGNATURE,
    ...pngIhdr(CAPTURE_SIZE),
    ...pngChunk("acTL", twoFramesLoopingForever),
    ...pngChunk("IEND", []),
  ]);
}

/** A valid picture of exactly this many bytes, for the cap. */
export function thumbnailBytesOfLength(
  type: DesignThumbnailType,
  length: number,
): Uint8Array {
  const headerBytes = thumbnailBytes(type).byteLength;
  return thumbnailBytes(type, new Array<number>(length - headerBytes).fill(0));
}

/** A valid WebP picture that is told apart from another by its last byte, which no header reader looks at. */
export function taggedWebp(tag: number): Uint8Array {
  return thumbnailBytes("image/webp", [tag]);
}

/** The byte `thumbnailBytes` was given last: what tells one picture from another once every file starts alike. */
export function tagOf(image: Uint8Array): number {
  return image[image.byteLength - 1] ?? -1;
}

function headerOf(type: DesignThumbnailType, size: DeclaredSize): number[] {
  switch (type) {
    case "image/png":
      return [...PNG_SIGNATURE, ...pngIhdr(size), ...pngChunk("IEND", [])];
    case "image/jpeg":
      return jpegHeader(size);
    case "image/webp":
      return webpHeader(size);
  }
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngIhdr({ widthPx, heightPx }: DeclaredSize): number[] {
  const bitDepthColourTypeAndThreeZeroes = [8, 2, 0, 0, 0];
  return pngChunk("IHDR", [
    ...bigEndian32(widthPx),
    ...bigEndian32(heightPx),
    ...bitDepthColourTypeAndThreeZeroes,
  ]);
}

function pngChunk(chunkType: string, data: number[]): number[] {
  return [
    ...bigEndian32(data.length),
    ...ascii(chunkType),
    ...data,
    ...bigEndian32(0),
  ];
}

function jpegHeader({ widthPx, heightPx }: DeclaredSize): number[] {
  const frame = [
    ...[0xff, 0xc0],
    ...bigEndian16(17),
    8,
    ...bigEndian16(heightPx),
    ...bigEndian16(widthPx),
    ...[3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1],
  ];
  return [0xff, 0xd8, ...frame, 0xff, 0xd9];
}

function webpHeader({ widthPx, heightPx }: DeclaredSize): number[] {
  const keyFrameWithStartCode = [0x00, 0x00, 0x00, 0x9d, 0x01, 0x2a];
  const payload = [
    ...keyFrameWithStartCode,
    ...littleEndian16(widthPx),
    ...littleEndian16(heightPx),
  ];
  const riffSizeFilledInLater = [0, 0, 0, 0];
  return [
    ...ascii("RIFF"),
    ...riffSizeFilledInLater,
    ...ascii("WEBP"),
    ...ascii("VP8 "),
    ...littleEndian32(payload.length),
    ...payload,
  ];
}

function withRiffSizeOfTheFile(file: Uint8Array): Uint8Array {
  const sizeAfterRiffHeader = file.byteLength - 8;
  file.set(littleEndian32(sizeAfterRiffHeader), 4);
  return file;
}

function ascii(text: string): number[] {
  return Array.from(text, (character) => character.charCodeAt(0));
}

function bigEndian32(value: number): number[] {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ];
}

function bigEndian16(value: number): number[] {
  return [(value >>> 8) & 0xff, value & 0xff];
}

function littleEndian32(value: number): number[] {
  return bigEndian32(value).reverse();
}

function littleEndian16(value: number): number[] {
  return bigEndian16(value).reverse();
}
