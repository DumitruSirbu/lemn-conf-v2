import { createHash } from "node:crypto";

import { KITCHEN_L_DESIGN, type Design } from "@lemnaria/configurator-domain";
import {
  FakePresetRepository,
  MAX_PRESET_THUMBNAIL_BYTES,
  type LoadOwnedOutcome,
} from "@lemnaria/persistence";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { designNotFoundResponse } from "@/lib/server/design-errors";
import { PRESET_CREATIONS_PER_DAY_FIGURE } from "@/lib/server/rate-limit/limit-policy";

/**
 * M8C wave P3 (plan section 4, exception 2): every refusal of `POST /api/designs/{id}/preset` through the real route,
 * the real limiters (counted in the shared setup's in-memory store) and the persistence package's fake preset
 * repository. Each case leaves one thing away from the one valid request, and the first test is that valid request: it
 * is the control, without which every refusal below could pass for the wrong reason (ADR 0152).
 */

function hashOf(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const DESIGN_ID = "V1StGXR8Z5jdHi6BmyT_a";
const WRITE_TOKEN = "write-token-for-the-design-under-test";
const VISITOR_VALUE = "a".repeat(43);
const VISITOR_COOKIE_NAME = "__Host-lemnaria_visitor";
const STORED_REVISION = "7";

const WIDTH_PX = 1280;
const HEIGHT_PX = 960;

const presets = vi.hoisted(() => ({ current: undefined as unknown }));
const storedDesign = vi.hoisted(() => ({ current: undefined as unknown }));

/** Authorised only when the id and both hashes are the stored design's own, as the repository's SQL decides. */
const authorizedDesigns = {
  loadAuthorized: ({
    id,
    writeTokenHash,
    visitorHash,
  }: {
    id: string;
    writeTokenHash: string;
    visitorHash: string;
  }): Promise<LoadOwnedOutcome> =>
    Promise.resolve(
      id === DESIGN_ID &&
        writeTokenHash === hashOf(WRITE_TOKEN) &&
        visitorHash === hashOf(VISITOR_VALUE)
        ? {
            kind: "found",
            design: storedDesign.current as Design,
            revision: STORED_REVISION,
          }
        : { kind: "none" },
    ),
};

vi.mock("@/lib/server/repository", () => ({
  getAuthorizedDesignRepository: () => authorizedDesigns,
  getPresetRepository: () => presets.current,
}));

const { POST: savePreset } = await import(
  "../../../../src/app/api/designs/[id]/preset/route"
);

let fakePresets: FakePresetRepository;

beforeEach(() => {
  fakePresets = new FakePresetRepository();
  presets.current = fakePresets;
  storedDesign.current = KITCHEN_L_DESIGN;
});

// ---- Images: only their headers are real, which is all the route reads ----

function pngOf(widthPx: number, heightPx: number, totalBytes = 64): Uint8Array {
  const bytes = new Uint8Array(totalBytes);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const header = new DataView(bytes.buffer);
  header.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  header.setUint32(16, widthPx);
  header.setUint32(20, heightPx);
  return bytes;
}

function base64Of(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

const VALID_PNG = pngOf(WIDTH_PX, HEIGHT_PX);

// ---- The request: one valid one, and the fields a case may change ----

interface SaveRequest {
  readonly id?: string;
  readonly headers?: Record<string, string>;
  readonly body?: string;
  readonly fields?: Record<string, unknown>;
}

const VALID_HEADERS: Record<string, string> = {
  "sec-fetch-site": "same-origin",
  cookie: `lemnaria_write_token_${DESIGN_ID}=${WRITE_TOKEN}; ${VISITOR_COOKIE_NAME}=${VISITOR_VALUE}`,
};

function validFields(): Record<string, unknown> {
  return {
    revision: STORED_REVISION,
    name: "Kitchen in L",
    imageType: "image/png",
    image: base64Of(VALID_PNG),
  };
}

function save(request: SaveRequest = {}): Promise<Response> {
  const id = request.id ?? DESIGN_ID;
  return savePreset(
    new NextRequest(`https://example.test/api/designs/${id}/preset`, {
      method: "POST",
      headers: request.headers ?? VALID_HEADERS,
      body:
        request.body ?? JSON.stringify({ ...validFields(), ...request.fields }),
    }),
    { params: Promise.resolve({ id }) },
  );
}

async function codeOf(response: Response): Promise<unknown> {
  return ((await response.json()) as { code?: unknown }).code;
}

describe("POST /api/designs/{id}/preset: the valid request, the control for every refusal below", () => {
  it("stores the stored design with the typed name and the image, and answers 201 with the new id", async () => {
    const response = await save();

    expect(response.status).toBe(201);
    const { id } = (await response.json()) as { id: string };
    const [held] = fakePresets.heldPresets();
    expect(fakePresets.heldPresets()).toHaveLength(1);
    expect(held?.id).toBe(id);
    expect(held?.typedName).toBe("Kitchen in L");
    expect(held?.thumbnailType).toBe("image/png");
    expect(held?.walls).toEqual({ aMm: 3560, bMm: 2920 });
    expect(JSON.parse(held?.document ?? "null")).toEqual(KITCHEN_L_DESIGN);
  });

  it("ignores a document the body carries: what is kept is the stored design", async () => {
    const forged = { ...KITCHEN_L_DESIGN, placements: [] };

    const response = await save({ fields: { design: forged } });

    expect(response.status).toBe(201);
    const [held] = fakePresets.heldPresets();
    expect(JSON.parse(held?.document ?? "null")).toEqual(KITCHEN_L_DESIGN);
  });

  it("stores the name in NFC and trimmed, and no name at all when it is blank", async () => {
    await save({ fields: { name: "  Café  " } });
    await save({ fields: { name: "   " } });
    await save({ fields: { name: undefined } });

    const names = fakePresets.heldPresets().map((held) => held.typedName);
    expect(names).toEqual(["Café", undefined, undefined]);
  });
});

describe("POST /api/designs/{id}/preset: a request that is not its author's answers the design-not-found response and stores nothing", () => {
  const otherVisitor = `${VISITOR_COOKIE_NAME}=${"b".repeat(43)}`;
  const writeCookie = `lemnaria_write_token_${DESIGN_ID}=${WRITE_TOKEN}`;
  const sameOrigin = "same-origin";

  it.each([
    [
      "a cross-site request",
      { ...VALID_HEADERS, "sec-fetch-site": "cross-site" },
    ],
    [
      "a foreign Origin without Sec-Fetch-Site",
      { cookie: VALID_HEADERS.cookie ?? "", origin: "https://evil.test" },
    ],
    [
      "no write token",
      {
        "sec-fetch-site": sameOrigin,
        cookie: `${VISITOR_COOKIE_NAME}=${VISITOR_VALUE}`,
      },
    ],
    [
      "a wrong write token",
      {
        "sec-fetch-site": sameOrigin,
        cookie: `lemnaria_write_token_${DESIGN_ID}=not-the-token; ${VISITOR_COOKIE_NAME}=${VISITOR_VALUE}`,
      },
    ],
    [
      "no visitor cookie",
      { "sec-fetch-site": sameOrigin, cookie: writeCookie },
    ],
    [
      "a malformed visitor cookie",
      {
        "sec-fetch-site": sameOrigin,
        cookie: `${writeCookie}; ${VISITOR_COOKIE_NAME}=short`,
      },
    ],
    [
      "another browser's visitor",
      {
        "sec-fetch-site": sameOrigin,
        cookie: `${writeCookie}; ${otherVisitor}`,
      },
    ],
  ])("%s", async (_name, headers) => {
    const response = await save({ headers });

    const expected = designNotFoundResponse(DESIGN_ID);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe(await expected.text());
    expect([...response.headers]).toEqual([...expected.headers]);
    expect(fakePresets.heldPresets()).toHaveLength(0);
  });

  it("a wrong write token beside an image and a name that fail their rules: the same 404, the body's rules never asked", async () => {
    const headers = {
      "sec-fetch-site": sameOrigin,
      cookie: `lemnaria_write_token_${DESIGN_ID}=not-the-token; ${VISITOR_COOKIE_NAME}=${VISITOR_VALUE}`,
    };

    const response = await save({
      headers,
      fields: { image: "!!!!", name: "a".repeat(81) },
    });

    expect(response.status).toBe(404);
    expect(await response.text()).toBe(
      await designNotFoundResponse(DESIGN_ID).text(),
    );
    expect(fakePresets.heldPresets()).toHaveLength(0);
  });

  it("an id that names no design", async () => {
    const id = "no-such-design-00000x";
    const headers = {
      ...VALID_HEADERS,
      cookie: `lemnaria_write_token_${id}=${WRITE_TOKEN}; ${VISITOR_COOKIE_NAME}=${VISITOR_VALUE}`,
    };

    const response = await save({ id, headers });

    expect(response.status).toBe(404);
    expect(fakePresets.heldPresets()).toHaveLength(0);
  });
});

describe("POST /api/designs/{id}/preset: a request that is not understood stores nothing", () => {
  it.each([
    ["a body that is not JSON", { body: "{not json" }],
    ["a body that is not an object", { body: "[]" }],
    ["no revision", { fields: { revision: undefined } }],
    ["a revision that is not one", { fields: { revision: "latest" } }],
    ["no image", { fields: { image: undefined } }],
    ["a name that is not text", { fields: { name: 5 } }],
  ])("%s: 400 PRESET_REQUEST_INVALID", async (_name, request) => {
    const response = await save(request);

    expect(response.status).toBe(400);
    expect(await codeOf(response)).toBe("PRESET_REQUEST_INVALID");
    expect(fakePresets.heldPresets()).toHaveLength(0);
  });

  it("a body past the largest image's base64 and its allowance: 413", async () => {
    const response = await save({ body: "x".repeat(800_000) });

    expect(response.status).toBe(413);
    expect(fakePresets.heldPresets()).toHaveLength(0);
  });

  it("a revision other than the stored one: 409 PRESET_STALE", async () => {
    const response = await save({ fields: { revision: "6" } });

    expect(response.status).toBe(409);
    expect(await codeOf(response)).toBe("PRESET_STALE");
    expect(fakePresets.heldPresets()).toHaveLength(0);
  });
});

describe("POST /api/designs/{id}/preset: a kitchen the product would not propose is refused with its reason", () => {
  function storeWithout(isRemoved: (buildId: string) => boolean): void {
    storedDesign.current = {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.filter(
        (placement) => !isRemoved(placement.body.buildId),
      ),
    };
  }

  it("a finding of either severity: 422 PRESET_HAS_FINDINGS, naming the first", async () => {
    const [first] = KITCHEN_L_DESIGN.placements;
    storedDesign.current = {
      ...KITCHEN_L_DESIGN,
      placements: KITCHEN_L_DESIGN.placements.map((placement) =>
        placement === first ? { ...placement, alongMm: 99_999 } : placement,
      ),
    };

    const response = await save();

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      code: "PRESET_HAS_FINDINGS",
      finding: "PLACEMENT_PAST_WALL_END",
    });
    expect(fakePresets.heldPresets()).toHaveLength(0);
  });

  it("a kitchen with no hob beside an image that fails its check: the kitchen's reason first", async () => {
    storeWithout((buildId) => buildId.includes("hob"));

    const response = await save({ fields: { image: "!!!!" } });

    expect(await codeOf(response)).toBe("PRESET_MINIMUM_NOT_MET");
  });

  it("no hob: 422 PRESET_MINIMUM_NOT_MET, naming what is missing", async () => {
    storeWithout((buildId) => buildId.includes("hob"));

    const response = await save();

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      code: "PRESET_MINIMUM_NOT_MET",
      missing: ["hob"],
    });
    expect(fakePresets.heldPresets()).toHaveLength(0);
  });

  it("no sink and no hob: 422 PRESET_MINIMUM_NOT_MET naming both", async () => {
    storeWithout(
      (buildId) => buildId.includes("hob") || buildId.includes("sink"),
    );

    const response = await save();

    expect(await response.json()).toMatchObject({
      code: "PRESET_MINIMUM_NOT_MET",
      missing: ["sink", "hob"],
    });
    expect(fakePresets.heldPresets()).toHaveLength(0);
  });
});

describe("POST /api/designs/{id}/preset: an image that is not the capture is refused", () => {
  const gif = new Uint8Array(64);
  gif.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0);

  it.each([
    [
      "512 KiB and one byte",
      {
        image: base64Of(
          pngOf(WIDTH_PX, HEIGHT_PX, MAX_PRESET_THUMBNAIL_BYTES + 1),
        ),
      },
    ],
    ["a PNG declared as WebP", { imageType: "image/webp" }],
    ["GIF bytes declared as PNG", { image: base64Of(gif) }],
    ["a type outside the three", { imageType: "image/gif" }],
    ["a header of 0 x 0", { image: base64Of(pngOf(0, 0)) }],
    ["a header of 65535 x 65535", { image: base64Of(pngOf(65_535, 65_535)) }],
    ["another size than the capture's", { image: base64Of(pngOf(640, 480)) }],
    ["no bytes at all", { image: "" }],
    ["text that is not base64", { image: "!!!!" }],
    [
      "base64 that Buffer would read after skipping what it cannot",
      { image: `${base64Of(VALID_PNG)}\n` },
    ],
  ])("%s: 422 PRESET_IMAGE_REFUSED", async (_name, fields) => {
    const response = await save({ fields });

    expect(response.status).toBe(422);
    expect(await codeOf(response)).toBe("PRESET_IMAGE_REFUSED");
    expect(fakePresets.heldPresets()).toHaveLength(0);
  });
});

describe("POST /api/designs/{id}/preset: a name that fails the rule is refused", () => {
  it.each([
    ["81 characters", "a".repeat(81)],
    ["a right-to-left override", "Nume‮gol"],
    ["a NUL", "Nume\u0000"],
    ["a newline inside", "Nume\nnou"],
    ["a name far past any bound", "a".repeat(5000)],
  ])("%s: 422 PRESET_NAME_REFUSED", async (_label, name) => {
    const response = await save({ fields: { name } });

    expect(response.status).toBe(422);
    expect(await codeOf(response)).toBe("PRESET_NAME_REFUSED");
    expect(fakePresets.heldPresets()).toHaveLength(0);
  });

  it("80 characters is kept", async () => {
    const response = await save({ fields: { name: "a".repeat(80) } });

    expect(response.status).toBe(201);
  });
});

describe("POST /api/designs/{id}/preset: the limits fail closed", () => {
  it(`the ${String(PRESET_CREATIONS_PER_DAY_FIGURE + 1)}st save of a day, over every caller: 429 PRESET_LIMIT_REACHED, and no row beyond the figure`, async () => {
    for (let saved = 0; saved < PRESET_CREATIONS_PER_DAY_FIGURE; saved += 1) {
      expect((await save()).status).toBe(201);
    }

    const response = await save();

    expect(response.status).toBe(429);
    expect(await codeOf(response)).toBe("PRESET_LIMIT_REACHED");
    expect(response.headers.get("retry-after")).toMatch(/^[1-9]\d*$/);
    expect(fakePresets.heldPresets()).toHaveLength(
      PRESET_CREATIONS_PER_DAY_FIGURE,
    );
  });

  it("a refused save spends none of the day's figure", async () => {
    for (
      let refused = 0;
      refused < PRESET_CREATIONS_PER_DAY_FIGURE;
      refused += 1
    ) {
      await save({ fields: { revision: "6" } });
    }

    expect((await save()).status).toBe(201);
  });

  it("a limit that cannot be judged: 503, and no row", async () => {
    vi.stubEnv("DIGEST_SECRET", "");

    try {
      const response = await save();

      expect(response.status).toBe(503);
      expect(fakePresets.heldPresets()).toHaveLength(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
