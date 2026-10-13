import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { deflateSync, inflateSync } from "node:zlib";

import type { Page } from "@playwright/test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { countChangedPixels, countPixelsIn, type PixelRect } from "./pixels";

/**
 * 8Q.11: the helper decodes a screenshot inside the page without a URL fetch, because `connect-src 'self'` refuses
 * `fetch("data:…")`. The browser's decoder is replaced here by a few lines that read a PNG this file wrote, so the
 * pipeline around it (base64 text, bytes, `Blob`, counting) runs for real and a wrong answer is a wrong number.
 */

type Rgb = readonly [number, number, number];

const E2E_DIRECTORY = join(import.meta.dirname, "..");
const PIXELS_SOURCE = join(import.meta.dirname, "pixels.ts");
const THIS_FILE = join(import.meta.dirname, "pixels.test.ts");
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const BYTES_PER_PIXEL = 4;
// Taken before any test stubs `fetch`, to build the old decode's bytes for comparison.
const REAL_FETCH = globalThis.fetch;

const RED: Rgb = [220, 20, 20];
const BLUE: Rgb = [20, 20, 220];
const GREY: Rgb = [128, 128, 128];

interface Decoded {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeAndData = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, checksum]);
}

/** An 8-bit RGBA PNG, every scanline filter type 0. */
function encodePng(width: number, pixels: readonly Rgb[]): string {
  const height = pixels.length / width;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const stride = 1 + width * BYTES_PER_PIXEL;
  const raw = Buffer.alloc(stride * height);
  pixels.forEach(([red, green, blue], index) => {
    const row = Math.floor(index / width);
    const offset = row * stride + 1 + (index % width) * BYTES_PER_PIXEL;
    raw.set([red, green, blue, 255], offset);
  });
  const png = Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return png.toString("base64");
}

function decodePng(bytes: Buffer): Decoded {
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("The decoder was given something that is not a PNG");
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const dataLength = bytes.readUInt32BE(33);
  const raw = inflateSync(bytes.subarray(41, 41 + dataLength));
  const stride = 1 + width * BYTES_PER_PIXEL;
  const rgba = new Uint8ClampedArray(width * height * BYTES_PER_PIXEL);
  for (let row = 0; row < height; row += 1) {
    const scanline = raw.subarray(row * stride + 1, (row + 1) * stride);
    rgba.set(scanline, row * width * BYTES_PER_PIXEL);
  }
  return { width, height, rgba };
}

/** Stands in for the browser's globals; `receivedBlobs` is what `createImageBitmap` was handed. */
function installBrowserDecoder(): { readonly receivedBlobs: Blob[] } {
  const receivedBlobs: Blob[] = [];
  const decodedByBitmap = new WeakMap<object, Decoded>();

  vi.stubGlobal("createImageBitmap", async (blob: Blob) => {
    receivedBlobs.push(blob);
    if (blob.type !== "image/png") {
      throw new Error(
        `The browser cannot decode a Blob of type "${blob.type}"`,
      );
    }
    const decoded = decodePng(Buffer.from(await blob.arrayBuffer()));
    const bitmap = { width: decoded.width, height: decoded.height };
    decodedByBitmap.set(bitmap, decoded);
    return bitmap;
  });
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      getContext() {
        let drawn: Decoded | undefined;
        return {
          drawImage: (bitmap: object) => {
            drawn = decodedByBitmap.get(bitmap);
          },
          getImageData: () => ({ data: drawn?.rgba }),
        };
      }
    },
  );
  vi.stubGlobal("fetch", () => {
    throw new Error(
      "The helper must not fetch; connect-src refuses a data: URL",
    );
  });
  return { receivedBlobs };
}

/** `page.evaluate` runs the function in a browser; here it runs it in this process, against the stubs. */
const pageRunningInThisProcess = {
  evaluate: <Argument, Result>(
    run: (argument: Argument) => Promise<Result>,
    argument: Argument,
  ) => run(argument),
} as unknown as Page;

function patchOf(width: number, pixels: readonly Rgb[]) {
  const clip: PixelRect = { x: 0, y: 0, width, height: pixels.length / width };
  return { encoded: encodePng(width, pixels), clip };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pixels.ts decodes a screenshot without a URL fetch (8Q.11)", () => {
  // Three columns by two rows: red, blue, blue / grey, red, red hold 3 red, 2 blue and 1 grey.
  const SIX_PIXELS: readonly Rgb[] = [RED, BLUE, BLUE, GREY, RED, RED];

  it("counts a colour within its tolerance", async () => {
    installBrowserDecoder();

    const nearRed = await countPixelsIn(
      pageRunningInThisProcess,
      patchOf(3, SIX_PIXELS),
      { kind: "near", color: RED, tolerance: 5 },
    );

    expect(nearRed).toBe(3);
  });

  it("counts blue-tinted and red-tinted pixels by their excess", async () => {
    installBrowserDecoder();
    const patch = patchOf(3, SIX_PIXELS);

    const blueTinted = await countPixelsIn(pageRunningInThisProcess, patch, {
      kind: "blueTint",
      minExcess: 100,
    });
    const redTinted = await countPixelsIn(pageRunningInThisProcess, patch, {
      kind: "redTint",
      minExcess: 100,
    });

    expect({ blueTinted, redTinted }).toEqual({ blueTinted: 2, redTinted: 3 });
  });

  it("counts exactly the pixels that moved between two captures", async () => {
    installBrowserDecoder();
    const before = patchOf(3, SIX_PIXELS);
    const after = patchOf(3, [RED, BLUE, RED, GREY, BLUE, RED]);

    const changed = await countChangedPixels(
      pageRunningInThisProcess,
      before,
      after,
      10,
    );

    expect(changed).toBe(2);
  });

  it("answers zero for two identical captures", async () => {
    installBrowserDecoder();
    const capture = patchOf(3, SIX_PIXELS);

    const changed = await countChangedPixels(
      pageRunningInThisProcess,
      capture,
      capture,
      10,
    );

    expect(changed).toBe(0);
  });

  it("hands the decoder the bytes, typed image/png, that the old fetch of a data: URL produced", async () => {
    const { receivedBlobs } = installBrowserDecoder();
    const patch = patchOf(3, SIX_PIXELS);

    await countPixelsIn(pageRunningInThisProcess, patch, {
      kind: "blueTint",
      minExcess: 1,
    });

    const viaFetch = await (
      await REAL_FETCH(`data:image/png;base64,${patch.encoded}`)
    ).blob();
    expect(receivedBlobs).toHaveLength(1);
    const received = await Promise.all(
      receivedBlobs.map(async (blob) => ({
        type: blob.type,
        bytes: Buffer.from(await blob.arrayBuffer()),
      })),
    );
    expect(received).toEqual([
      { type: viaFetch.type, bytes: Buffer.from(await viaFetch.arrayBuffer()) },
    ]);
  });
});

describe("no end-to-end support file fetches a data: URL (8Q.11)", () => {
  const FETCH_CALL = /\bfetch\s*\(/;
  const FETCH_OF_DATA_URL = /\bfetch\s*\(\s*[`"']data:/;

  it("keeps any call to fetch out of pixels.ts", () => {
    expect(readFileSync(PIXELS_SOURCE, "utf8")).not.toMatch(FETCH_CALL);
  });

  it("keeps a fetch of a data: URL out of every file under tests/e2e", () => {
    const offenders = typeScriptFilesUnder(E2E_DIRECTORY)
      .filter((file) => file !== THIS_FILE)
      .filter((file) => FETCH_OF_DATA_URL.test(readFileSync(file, "utf8")))
      .map((file) => relative(E2E_DIRECTORY, file));

    expect(offenders).toEqual([]);
  });
});

function typeScriptFilesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return typeScriptFilesUnder(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}
