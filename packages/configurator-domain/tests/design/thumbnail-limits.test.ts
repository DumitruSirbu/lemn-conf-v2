import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  checkDesignThumbnail,
  DESIGN_THUMBNAIL_HEIGHT_PX,
  DESIGN_THUMBNAIL_TYPES,
  DESIGN_THUMBNAIL_WIDTH_PX,
  isDesignThumbnailType,
  MAX_DESIGN_THUMBNAIL_BYTES,
} from "../../src/design/thumbnail-limits.js";
import type {
  DesignThumbnailType,
  ThumbnailRefusal,
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

const CAPTURE_SIZE: DeclaredSize = { widthPx: 640, heightPx: 480 };

const CAPTURES: readonly (readonly [
  string,
  DesignThumbnailType,
  (size: DeclaredSize) => Uint8Array,
])[] = [
  ["a PNG", "image/png", (size) => pngBytes({ size })],
  ["a JPEG", "image/jpeg", (size) => jpegBytes({ size })],
  ["a lossy WebP", "image/webp", (size) => webpLossyBytes({ size })],
  ["a lossless WebP", "image/webp", (size) => webpLosslessBytes({ size })],
  [
    "an extended, still WebP",
    "image/webp",
    (size) => webpExtendedBytes({ size }, { isAnimated: false }),
  ],
];

function refusalOf(type: unknown, bytes: Uint8Array): ThumbnailRefusal {
  const verdict = checkDesignThumbnail(type, bytes);
  if (verdict.kind === "accepted") {
    throw new Error("the check accepted bytes the test expected it to refuse");
  }
  return verdict.reason;
}

describe("the figures a card thumbnail is held to", () => {
  it("is 640 by 480 pixels, at most 128 KiB, in the three types of the closed list", () => {
    expect(DESIGN_THUMBNAIL_WIDTH_PX).toBe(640);
    expect(DESIGN_THUMBNAIL_HEIGHT_PX).toBe(480);
    expect(MAX_DESIGN_THUMBNAIL_BYTES).toBe(131_072);
    expect([...DESIGN_THUMBNAIL_TYPES]).toEqual([
      "image/webp",
      "image/png",
      "image/jpeg",
    ]);
  });

  it("names no type outside the list, whatever case or parameters it is spelled with", () => {
    expect(isDesignThumbnailType("image/png")).toBe(true);
    for (const outsider of [
      "image/gif",
      "IMAGE/PNG",
      "image/png; charset=binary",
      "",
      undefined,
      42,
    ]) {
      expect(isDesignThumbnailType(outsider)).toBe(false);
    }
  });
});

describe("checkDesignThumbnail accepts a still image at the capture size", () => {
  it.each(CAPTURES)("accepts %s", (_label, type, build) => {
    expect(checkDesignThumbnail(type, build(CAPTURE_SIZE))).toEqual({
      kind: "accepted",
      type,
    });
  });

  it("accepts a file of exactly the cap and refuses one byte more", () => {
    const atCap = pngBytes({
      size: CAPTURE_SIZE,
      paddedTo: MAX_DESIGN_THUMBNAIL_BYTES,
    });
    const overCap = pngBytes({
      size: CAPTURE_SIZE,
      paddedTo: MAX_DESIGN_THUMBNAIL_BYTES + 1,
    });

    expect(atCap.byteLength).toBe(MAX_DESIGN_THUMBNAIL_BYTES);
    expect(checkDesignThumbnail("image/png", atCap).kind).toBe("accepted");
    expect(refusalOf("image/png", overCap)).toBe("too-large");
  });
});

describe("checkDesignThumbnail refuses with a code", () => {
  it("refuses a type outside the closed list before it reads a byte", () => {
    const aPng = pngBytes({ size: CAPTURE_SIZE });

    for (const outsider of ["image/gif", "IMAGE/PNG", "", undefined, null]) {
      expect(refusalOf(outsider, aPng)).toBe("type-unknown");
    }
  });

  it("refuses an empty file", () => {
    expect(refusalOf("image/webp", new Uint8Array())).toBe("empty");
  });

  it.each([
    ["a PNG claimed as a JPEG", "image/jpeg", pngBytes({ size: CAPTURE_SIZE })],
    ["a PNG claimed as a WebP", "image/webp", pngBytes({ size: CAPTURE_SIZE })],
    ["a JPEG claimed as a PNG", "image/png", jpegBytes({ size: CAPTURE_SIZE })],
    [
      "a JPEG claimed as a WebP",
      "image/webp",
      jpegBytes({ size: CAPTURE_SIZE }),
    ],
    [
      "a WebP claimed as a PNG",
      "image/png",
      webpLossyBytes({ size: CAPTURE_SIZE }),
    ],
    [
      "a WebP claimed as a JPEG",
      "image/jpeg",
      webpLossyBytes({ size: CAPTURE_SIZE }),
    ],
  ] as const)(
    "refuses %s as a magic-number mismatch",
    (_label, type, bytes) => {
      expect(refusalOf(type, bytes)).toBe("magic-mismatch");
    },
  );

  it("refuses a RIFF container that is not a WebP", () => {
    const aWave = webpLossyBytes({ size: CAPTURE_SIZE }).slice();
    aWave.set([0x57, 0x41, 0x56, 0x45], 8);

    expect(refusalOf("image/webp", aWave)).toBe("magic-mismatch");
  });

  it.each(CAPTURES)(
    "refuses %s at one pixel off, transposed or at the preset's size",
    (_label, type, build) => {
      const sizes: DeclaredSize[] = [
        { widthPx: 639, heightPx: 480 },
        { widthPx: 640, heightPx: 481 },
        { widthPx: 480, heightPx: 640 },
        { widthPx: 1280, heightPx: 960 },
      ];

      for (const size of sizes) {
        expect(refusalOf(type, build(size))).toBe("wrong-dimensions");
      }
    },
  );
});

describe("checkDesignThumbnail refuses an animated image", () => {
  it("refuses a PNG that carries an acTL chunk before its pixel data", () => {
    const apng = pngBytes({ size: CAPTURE_SIZE }, ANIMATION_CONTROL_CHUNK);

    expect(refusalOf("image/png", apng)).toBe("animated");
  });

  it("finds the acTL chunk after other chunks, not only directly after the header", () => {
    const otherChunk = [0, 0, 0, 1, 0x74, 0x45, 0x58, 0x74, 0x41, 0, 0, 0, 0];
    const apng = pngBytes({ size: CAPTURE_SIZE }, [
      ...otherChunk,
      ...ANIMATION_CONTROL_CHUNK,
    ]);

    expect(refusalOf("image/png", apng)).toBe("animated");
  });

  it("reads acTL only where the specification puts it: a chunk after the pixel data is not an animation", () => {
    const stillWithTrailingChunk = pngBytes(
      { size: CAPTURE_SIZE },
      [],
      ANIMATION_CONTROL_CHUNK,
    );

    expect(checkDesignThumbnail("image/png", stillWithTrailingChunk).kind).toBe(
      "accepted",
    );
  });

  it("refuses a WebP whose VP8X header sets the animation flag, at the right size", () => {
    const animated = webpExtendedBytes(
      { size: CAPTURE_SIZE },
      { isAnimated: true },
    );

    expect(refusalOf("image/webp", animated)).toBe("animated");
  });
});

describe("checkDesignThumbnail refuses a header that is short, odd or lying", () => {
  it("refuses a PNG whose first chunk is not a 13-byte IHDR", () => {
    const notIhdr = pngBytes({ size: CAPTURE_SIZE }).slice();
    notIhdr.set([0x58], 12);

    expect(refusalOf("image/png", notIhdr)).toBe("unreadable-header");
  });

  it("refuses a PNG whose chunk length runs past the file, before it reaches the pixel data", () => {
    const lying = pngBytes(
      { size: CAPTURE_SIZE },
      [0xff, 0xff, 0xff, 0xf0, 0x74, 0x45, 0x58, 0x74],
    );

    expect(refusalOf("image/png", lying)).toBe("unreadable-header");
  });

  it("refuses a PNG that holds more header chunks than any real one before its pixel data", () => {
    const emptyChunk = [0, 0, 0, 0, 0x74, 0x45, 0x58, 0x74, 0, 0, 0, 0];
    const endless = pngBytes(
      { size: CAPTURE_SIZE },
      Array.from({ length: 200 }, () => emptyChunk).flat(),
    );

    expect(refusalOf("image/png", endless)).toBe("unreadable-header");
  });

  it("refuses a WebP whose RIFF size is not the file's", () => {
    const liar = webpLossyBytes({ size: CAPTURE_SIZE }).slice();
    liar.set([0xff, 0xff, 0x00, 0x00], 4);

    expect(refusalOf("image/webp", liar)).toBe("unreadable-header");
  });

  it("refuses a WebP whose first chunk is none of the three image chunks", () => {
    const unknownChunk = webpLossyBytes({ size: CAPTURE_SIZE }).slice();
    unknownChunk.set([0x4a, 0x55, 0x4e, 0x4b], 12);

    expect(refusalOf("image/webp", unknownChunk)).toBe("unreadable-header");
  });

  it("refuses a JPEG whose scan starts before any frame header", () => {
    const noFrame = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9,
    ]);

    expect(refusalOf("image/jpeg", noFrame)).toBe("unreadable-header");
  });

  it.each(CAPTURES)(
    "answers every prefix of %s with a verdict and never throws",
    (_label, type, build) => {
      const whole = build(CAPTURE_SIZE);
      const verdicts = Array.from({ length: whole.byteLength }, (_, length) =>
        checkDesignThumbnail(type, whole.slice(0, length)),
      );

      expect(
        verdicts.filter((verdict) => verdict.kind === "refused").length,
      ).toBeGreaterThan(0);
      expect(
        checkDesignThumbnail(type, whole).kind,
        "the whole file is the accepted arm",
      ).toBe("accepted");
    },
  );

  it.each(DESIGN_THUMBNAIL_TYPES)(
    "answers arbitrary bytes claimed as %s with a verdict and never throws",
    (type) => {
      fc.assert(
        fc.property(fc.uint8Array({ maxLength: 96 }), (bytes) => {
          const verdict = checkDesignThumbnail(type, bytes);
          expect(["accepted", "refused"]).toContain(verdict.kind);
        }),
      );
    },
  );
});

describe("a refusal carries a code and never the bytes", () => {
  it("is a kind and a reason, nothing else", () => {
    const refusal = checkDesignThumbnail(
      "image/png",
      jpegBytes({ size: CAPTURE_SIZE }),
    );

    expect(refusal).toEqual({ kind: "refused", reason: "magic-mismatch" });
  });
});
