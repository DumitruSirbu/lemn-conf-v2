import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { readImageHeader } from "../../src/design/image-header.js";
import {
  checkDesignThumbnail,
  DESIGN_THUMBNAIL_TYPES,
  MAX_DESIGN_THUMBNAIL_BYTES,
} from "../../src/design/thumbnail-limits.js";
import type {
  DesignThumbnailType,
  ThumbnailVerdict,
} from "../../src/design/thumbnail-limits.js";
import {
  ANIMATION_CONTROL_CHUNK,
  jpegBytes,
  pngBytes,
  webpExtendedBytes,
  webpLosslessBytes,
  webpLossyBytes,
} from "../support/image-bytes.js";
import type { DeclaredSize } from "../support/image-bytes.js";
import { REAL_ENCODER_IMAGES } from "../support/real-encoder-images.js";
import type { RealEncoderImage } from "../support/real-encoder-images.js";

/**
 * Adversarial QA of M11 wave W4a, acceptance W4a-5 and the size cap: the image check against bytes it did not write
 * itself (a real encoder's), over every declared size its readers can hold, at the byte limits, and over views that do
 * not start at the top of their buffer.
 */

const CAPTURE: DeclaredSize = { widthPx: 640, heightPx: 480 };
const IS_CAPTURE = ({ widthPx, heightPx }: DeclaredSize): boolean =>
  widthPx === CAPTURE.widthPx && heightPx === CAPTURE.heightPx;

function verdictReason(verdict: ThumbnailVerdict): string {
  return verdict.kind === "accepted" ? "accepted" : verdict.reason;
}

function expectedReasonFor(image: RealEncoderImage): string {
  if (image.isAnimated) return "animated";
  return IS_CAPTURE(image) ? "accepted" : "wrong-dimensions";
}

// ---- real encoder output: the independent oracle ----

describe("images a real encoder wrote", () => {
  it("covers every type, a still and an animated file, and near-miss sizes", () => {
    const types = new Set(REAL_ENCODER_IMAGES.map((image) => image.type));

    expect([...types].sort()).toEqual([...DESIGN_THUMBNAIL_TYPES].sort());
    expect(REAL_ENCODER_IMAGES.some((image) => image.isAnimated)).toBe(true);
    expect(REAL_ENCODER_IMAGES.some((image) => IS_CAPTURE(image))).toBe(true);
    expect(
      REAL_ENCODER_IMAGES.every(
        (image) => image.bytes.byteLength < MAX_DESIGN_THUMBNAIL_BYTES,
      ),
    ).toBe(true);
  });

  it.each(REAL_ENCODER_IMAGES.map((image) => [image.name, image] as const))(
    "reads %s as the encoder's own metadata does, and judges it by that",
    (_name, image) => {
      const reading = readImageHeader(image.type, image.bytes);

      expect(reading.kind).toBe("read");
      if (reading.kind === "read") {
        expect(reading.header.widthPx).toBe(image.widthPx);
        expect(reading.header.heightPx).toBe(image.heightPx);
        expect(reading.header.isAnimated).toBe(image.isAnimated);
      }
      expect(verdictReason(checkDesignThumbnail(image.type, image.bytes))).toBe(
        expectedReasonFor(image),
      );
    },
  );

  it.each(
    REAL_ENCODER_IMAGES.filter((image) => image.type === "image/webp").map(
      (image) => [image.name, image] as const,
    ),
  )(
    "refuses every proper prefix of the real WebP %s, since its RIFF size names the whole file",
    (_name, image) => {
      for (let length = 0; length < image.bytes.byteLength; length += 1) {
        expect(
          checkDesignThumbnail("image/webp", image.bytes.slice(0, length)).kind,
        ).toBe("refused");
      }
    },
  );

  it("refuses a real PNG cut before its pixel data, and a real JPEG cut inside or before its frame header", () => {
    for (const image of REAL_ENCODER_IMAGES) {
      if (image.type === "image/png") {
        const firstPixelChunk = indexOfAscii(image.bytes, "IDAT") + 4;
        for (let length = 0; length < firstPixelChunk; length += 1) {
          expect(
            checkDesignThumbnail("image/png", image.bytes.slice(0, length))
              .kind,
            `${image.name} cut at ${String(length)}`,
          ).toBe("refused");
        }
      }
      if (image.type === "image/jpeg") {
        const frameEnd = indexOfFrameMarker(image.bytes) + 9;
        for (let length = 0; length < frameEnd; length += 1) {
          expect(
            checkDesignThumbnail("image/jpeg", image.bytes.slice(0, length))
              .kind,
            `${image.name} cut at ${String(length)}`,
          ).toBe("refused");
        }
      }
    }
  });

  it("calls a real still PNG animated once an acTL chunk is spliced in before its pixel data", () => {
    for (const image of REAL_ENCODER_IMAGES.filter(
      (candidate) => candidate.type === "image/png" && IS_CAPTURE(candidate),
    )) {
      const spliced = spliceBefore(image.bytes, "IDAT", [
        ...ANIMATION_CONTROL_CHUNK,
      ]);

      expect(
        verdictReason(checkDesignThumbnail("image/png", spliced)),
        image.name,
      ).toBe("animated");
    }
  });

  it("never throws, whatever single byte of a real header is replaced by whatever value", () => {
    const stills = REAL_ENCODER_IMAGES.filter((image) => IS_CAPTURE(image));
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: stills.length - 1 }),
        fc.nat({ max: 400 }),
        fc.integer({ min: 0, max: 255 }),
        (imageIndex, position, value) => {
          const image = stills[imageIndex];
          if (image === undefined) throw new Error("no such fixture");
          const mutated = image.bytes.slice();
          if (position >= mutated.byteLength) return;
          mutated[position] = value;
          const verdict = checkDesignThumbnail(image.type, mutated);
          expect(["accepted", "refused"]).toContain(verdict.kind);
        },
      ),
      { numRuns: 3000 },
    );
  });
});

// ---- the size, swept ----

describe("the capture size, over every size each reader can hold", () => {
  const near = (target: number, max: number) =>
    fc.oneof(
      fc.constant(target),
      fc.integer({ min: Math.max(0, target - 3), max: target + 3 }),
      fc.integer({ min: 0, max }),
    );

  const BUILDERS: readonly (readonly [
    string,
    DesignThumbnailType,
    number,
    number,
    (size: DeclaredSize) => Uint8Array,
  ])[] = [
    ["PNG", "image/png", 0, 0xffffffff, (size) => pngBytes({ size })],
    ["JPEG", "image/jpeg", 0, 0xffff, (size) => jpegBytes({ size })],
    ["lossy WebP", "image/webp", 0, 0x3fff, (size) => webpLossyBytes({ size })],
    [
      "lossless WebP",
      "image/webp",
      1,
      0x4000,
      (size) => webpLosslessBytes({ size }),
    ],
    [
      "extended WebP",
      "image/webp",
      1,
      0x1000000,
      (size) => webpExtendedBytes({ size }, { isAnimated: false }),
    ],
  ];

  it.each(BUILDERS)(
    "accepts a %s exactly when it declares 640 by 480",
    (_label, type, min, max, build) => {
      const side = (target: number) =>
        near(target, max).map((value) => Math.max(min, Math.min(max, value)));
      fc.assert(
        fc.property(side(640), side(480), (widthPx, heightPx) => {
          const verdict = checkDesignThumbnail(
            type,
            build({ widthPx, heightPx }),
          );

          expect(verdictReason(verdict)).toBe(
            IS_CAPTURE({ widthPx, heightPx }) ? "accepted" : "wrong-dimensions",
          );
        }),
        { numRuns: 400 },
      );
    },
  );
});

describe("a VP8X header's flag byte, over all 256 values", () => {
  it("is animated exactly when the animation bit is set, and a still one is accepted whatever its other flags", () => {
    const stillExtended = webpExtendedBytes(
      { size: CAPTURE },
      { isAnimated: false },
    );
    const flagOffset = 20;

    for (let flags = 0; flags < 256; flags += 1) {
      const bytes = stillExtended.slice();
      bytes[flagOffset] = flags;

      expect(
        verdictReason(checkDesignThumbnail("image/webp", bytes)),
        `flags ${String(flags)}`,
      ).toBe((flags & 0x02) === 0 ? "accepted" : "animated");
    }
  });
});

// ---- byte limits ----

describe("the byte cap, for every type", () => {
  const AT_CAP: readonly (readonly [
    string,
    DesignThumbnailType,
    (paddedTo: number) => Uint8Array,
  ])[] = [
    [
      "JPEG",
      "image/jpeg",
      (paddedTo) => jpegBytes({ size: CAPTURE, paddedTo }),
    ],
    [
      "lossy WebP",
      "image/webp",
      (paddedTo) => webpLossyBytes({ size: CAPTURE, paddedTo }),
    ],
    [
      "lossless WebP",
      "image/webp",
      (paddedTo) => webpLosslessBytes({ size: CAPTURE, paddedTo }),
    ],
    [
      "extended WebP",
      "image/webp",
      (paddedTo) =>
        webpExtendedBytes({ size: CAPTURE, paddedTo }, { isAnimated: false }),
    ],
  ];

  it.each(AT_CAP)(
    "accepts a %s of exactly 128 KiB and refuses one byte more as too-large",
    (_label, type, build) => {
      const atCap = build(MAX_DESIGN_THUMBNAIL_BYTES);
      const overCap = build(MAX_DESIGN_THUMBNAIL_BYTES + 1);

      expect(atCap.byteLength).toBe(MAX_DESIGN_THUMBNAIL_BYTES);
      expect(overCap.byteLength).toBe(MAX_DESIGN_THUMBNAIL_BYTES + 1);
      expect(verdictReason(checkDesignThumbnail(type, atCap))).toBe("accepted");
      expect(verdictReason(checkDesignThumbnail(type, overCap))).toBe(
        "too-large",
      );
    },
  );

  it.each(DESIGN_THUMBNAIL_TYPES)(
    "refuses zero bytes claimed as %s as empty, and one byte as a mismatch",
    (type) => {
      expect(verdictReason(checkDesignThumbnail(type, new Uint8Array()))).toBe(
        "empty",
      );
      expect(verdictReason(checkDesignThumbnail(type, Uint8Array.of(0)))).toBe(
        "magic-mismatch",
      );
    },
  );

  it("refuses a huge file as too-large before reading it", () => {
    const huge = new Uint8Array(8 * 1024 * 1024);

    expect(verdictReason(checkDesignThumbnail("image/png", huge))).toBe(
      "too-large",
    );
  });

  it("counts the bytes of the view, not those of the buffer behind it", () => {
    const png = pngBytes({ size: CAPTURE });
    const backing = new Uint8Array(MAX_DESIGN_THUMBNAIL_BYTES * 2);
    backing.set(png, 5);

    expect(
      verdictReason(
        checkDesignThumbnail(
          "image/png",
          backing.subarray(5, 5 + png.byteLength),
        ),
      ),
    ).toBe("accepted");
  });
});

// ---- views and buffers ----

describe("a file that is a view into a larger buffer", () => {
  function inside(
    bytes: Uint8Array,
    junkBefore: number,
    junkAfter: number,
  ): Uint8Array {
    const backing = new Uint8Array(
      junkBefore + bytes.byteLength + junkAfter,
    ).fill(0xaa);
    backing.set(bytes, junkBefore);
    return backing.subarray(junkBefore, junkBefore + bytes.byteLength);
  }

  it.each(REAL_ENCODER_IMAGES.map((image) => [image.name, image] as const))(
    "is judged as %s is, wherever the view starts",
    (_name, image) => {
      for (const offset of [1, 3, 7, 64]) {
        const view = inside(image.bytes, offset, 13);

        expect(view.byteOffset).toBe(offset);
        expect(verdictReason(checkDesignThumbnail(image.type, view))).toBe(
          expectedReasonFor(image),
        );
      }
    },
  );

  it("is a Node Buffer view from the shared pool as well, as a request body arrives", () => {
    for (const image of REAL_ENCODER_IMAGES.filter(
      (candidate) => IS_CAPTURE(candidate) && !candidate.isAnimated,
    )) {
      const pooled = Buffer.from(image.bytes);

      expect(
        verdictReason(checkDesignThumbnail(image.type, pooled)),
        image.name,
      ).toBe("accepted");
    }
  });

  it("is refused when the view stops short, though the buffer behind it holds the rest of a WebP", () => {
    const webp = REAL_ENCODER_IMAGES.find(
      (image) =>
        image.type === "image/webp" && IS_CAPTURE(image) && !image.isAnimated,
    );
    if (webp === undefined) throw new Error("no webp fixture");
    const backing = new Uint8Array(webp.bytes.byteLength + 8).fill(0);
    backing.set(webp.bytes, 0);

    expect(
      verdictReason(
        checkDesignThumbnail(
          "image/webp",
          backing.subarray(0, webp.bytes.byteLength - 1),
        ),
      ),
    ).toBe("unreadable-header");
    expect(
      verdictReason(
        checkDesignThumbnail(
          "image/webp",
          backing.subarray(0, webp.bytes.byteLength + 1),
        ),
      ),
    ).toBe("unreadable-header");
  });
});

// ---- chunks and segments that hide a tag inside another one's payload ----

describe("a chunk or segment's payload is skipped by its length, never scanned", () => {
  const ascii = (text: string): number[] =>
    Array.from(text, (character) => character.charCodeAt(0));
  const uint32 = (value: number): number[] => [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ];
  const pngChunk = (type: string, data: readonly number[]): number[] => [
    ...uint32(data.length),
    ...ascii(type),
    ...data,
    ...uint32(0),
  ];

  it("finds an acTL chunk that follows a text chunk whose payload spells IDAT", () => {
    const decoy = pngChunk("tEXt", [...ascii("k"), 0, ...ascii("IDAT")]);
    const apng = pngBytes({ size: CAPTURE }, [
      ...decoy,
      ...ANIMATION_CONTROL_CHUNK,
    ]);

    expect(verdictReason(checkDesignThumbnail("image/png", apng))).toBe(
      "animated",
    );
  });

  it("does not take a text chunk that holds a whole acTL chunk for an animation", () => {
    const decoy = pngChunk("tEXt", [
      ...ascii("k"),
      0,
      ...ANIMATION_CONTROL_CHUNK,
    ]);
    const still = pngBytes({ size: CAPTURE }, decoy);

    expect(verdictReason(checkDesignThumbnail("image/png", still))).toBe(
      "accepted",
    );
  });

  it("accepts a still PNG with a realistic run of ancillary chunks before its pixel data", () => {
    const chunks = Array.from({ length: 30 }, (_, index) =>
      pngChunk("tEXt", [...ascii("k"), 0, index]),
    ).flat();

    expect(
      verdictReason(
        checkDesignThumbnail("image/png", pngBytes({ size: CAPTURE }, chunks)),
      ),
    ).toBe("accepted");
  });

  function jpegWithSegments(
    segments: readonly (readonly number[])[],
  ): Uint8Array {
    return Uint8Array.from([0xff, 0xd8, ...segments.flat(), 0xff, 0xd9]);
  }
  const segment = (marker: number, payload: readonly number[]): number[] => [
    0xff,
    marker,
    (payload.length + 2) >>> 8,
    (payload.length + 2) & 255,
    ...payload,
  ];
  const frame = (
    marker: number,
    { widthPx, heightPx }: DeclaredSize,
  ): number[] =>
    segment(marker, [
      8,
      heightPx >>> 8,
      heightPx & 255,
      widthPx >>> 8,
      widthPx & 255,
      1,
      1,
      0x11,
      0,
    ]);

  it("reads the real frame, not the one inside an EXIF thumbnail, whichever of the two is 640 by 480", () => {
    const thumbnailAt = (size: DeclaredSize) =>
      segment(0xe1, [...ascii("Exif"), 0, 0, ...frame(0xc0, size)]);
    const mainAtCapture = jpegWithSegments([
      thumbnailAt({ widthPx: 1280, heightPx: 960 }),
      frame(0xc0, CAPTURE),
    ]);
    const mainElsewhere = jpegWithSegments([
      thumbnailAt(CAPTURE),
      frame(0xc0, { widthPx: 1280, heightPx: 960 }),
    ]);

    expect(
      verdictReason(checkDesignThumbnail("image/jpeg", mainAtCapture)),
    ).toBe("accepted");
    expect(
      verdictReason(checkDesignThumbnail("image/jpeg", mainElsewhere)),
    ).toBe("wrong-dimensions");
  });

  it("reads every start-of-frame marker as a frame, and the three markers among them that are not", () => {
    const frameMarkers = [
      0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
      0xcf,
    ];
    for (const marker of frameMarkers) {
      expect(
        verdictReason(
          checkDesignThumbnail(
            "image/jpeg",
            jpegWithSegments([frame(marker, CAPTURE)]),
          ),
        ),
        `SOF 0x${marker.toString(16)}`,
      ).toBe("accepted");
    }
    for (const notAFrame of [0xc4, 0xc8, 0xcc]) {
      const table = segment(notAFrame, [0, 1, 2, 3]);

      expect(
        verdictReason(
          checkDesignThumbnail(
            "image/jpeg",
            jpegWithSegments([table, frame(0xc0, CAPTURE)]),
          ),
        ),
        `0x${notAFrame.toString(16)} then a frame`,
      ).toBe("accepted");
    }
  });

  it("refuses a JPEG whose frame segment is shorter than its own fields, or runs past the file", () => {
    const shortFrame = jpegWithSegments([segment(0xc0, [8, 1, 0xe0])]);
    const pastTheEnd = Uint8Array.from(
      [0xff, 0xd8, ...frame(0xc0, CAPTURE)].slice(0, -3),
    );

    expect(verdictReason(checkDesignThumbnail("image/jpeg", shortFrame))).toBe(
      "unreadable-header",
    );
    expect(verdictReason(checkDesignThumbnail("image/jpeg", pastTheEnd))).toBe(
      "unreadable-header",
    );
  });

  it("refuses a JPEG with a zero-length segment in front of its frame, which would loop a walker in place", () => {
    const stuck = Uint8Array.from([
      0xff,
      0xd8,
      0xff,
      0xe0,
      0x00,
      0x00,
      ...frame(0xc0, CAPTURE),
    ]);

    expect(verdictReason(checkDesignThumbnail("image/jpeg", stuck))).toBe(
      "unreadable-header",
    );
  });

  it("refuses a lossy WebP that is an inter frame, and a lossless one whose signature byte is wrong", () => {
    const interFrame = webpLossyBytes({ size: CAPTURE }).slice();
    interFrame[20] = 0x01;
    const wrongSignature = webpLosslessBytes({ size: CAPTURE }).slice();
    wrongSignature[20] = 0x2e;

    expect(verdictReason(checkDesignThumbnail("image/webp", interFrame))).toBe(
      "unreadable-header",
    );
    expect(
      verdictReason(checkDesignThumbnail("image/webp", wrongSignature)),
    ).toBe("unreadable-header");
  });

  it("refuses a PNG whose first chunk claims more than 13 bytes of header, and one whose signature is a byte short", () => {
    const longIhdr = pngBytes({ size: CAPTURE }).slice();
    longIhdr[11] = 14;
    const brokenSignature = pngBytes({ size: CAPTURE }).slice();
    brokenSignature[7] = 0x0b;

    expect(verdictReason(checkDesignThumbnail("image/png", longIhdr))).toBe(
      "unreadable-header",
    );
    expect(
      verdictReason(checkDesignThumbnail("image/png", brokenSignature)),
    ).toBe("magic-mismatch");
  });
});

function indexOfAscii(bytes: Uint8Array, text: string): number {
  const needle = Array.from(text, (character) => character.charCodeAt(0));
  for (let start = 0; start + needle.length <= bytes.length; start += 1) {
    if (needle.every((byte, offset) => bytes[start + offset] === byte))
      return start;
  }
  throw new Error(`no ${text} in the file`);
}

function indexOfFrameMarker(bytes: Uint8Array): number {
  let position = 2;
  while (position < bytes.length) {
    const marker = bytes[position + 1] ?? 0;
    const isFrame =
      marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) return position;
    position +=
      2 + (((bytes[position + 2] ?? 0) << 8) | (bytes[position + 3] ?? 0));
  }
  throw new Error("no frame marker in the file");
}

function spliceBefore(
  bytes: Uint8Array,
  tag: string,
  inserted: readonly number[],
): Uint8Array {
  const at = indexOfAscii(bytes, tag) - 4;
  return Uint8Array.from([
    ...bytes.slice(0, at),
    ...inserted,
    ...bytes.slice(at),
  ]);
}
