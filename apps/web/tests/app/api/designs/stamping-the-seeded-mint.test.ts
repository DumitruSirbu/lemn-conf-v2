import {
  cabinetDepthMmOf,
  freeColourFinish,
  KITCHEN_L_DESIGN,
  paletteFinish,
  type Design,
  type NewKitchenSettings,
} from "@lemnaria/configurator-domain";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SEEDED_MINT_DESIGN } from "../../../support/seeded-mint-design";
import { UNUSED_STORE_READS } from "../../../support/unused-store-reads";

/**
 * `POST /api/designs` writes `KITCHEN_L_DESIGN` stamped with the new-kitchen defaults at the fixture's own depth
 * (M10 R4b3 item 5; rule 4). The customer read is the real module's contract, mocked here so what the route does with
 * its answer, and when it asks, is what is measured; the read itself is `new-kitchen-defaults.test.ts`'s.
 */
const FAKE_SECRET =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

const world = vi.hoisted(() => ({
  calls: [] as string[],
  minted: [] as Design[],
  rateLimitStore: undefined as unknown,
  readNewKitchenDefaults: undefined as unknown as ReturnType<typeof vi.fn>,
}));

vi.mock("@/lib/server/price-dashboard/new-kitchen-defaults", () => {
  world.readNewKitchenDefaults = vi.fn();
  return { readNewKitchenDefaults: world.readNewKitchenDefaults };
});

vi.mock("@/lib/server/repository", () => ({
  getRepository: () => ({
    mint: (request: { design: Design }) => {
      world.calls.push("mint");
      world.minted.push(request.design);
      return Promise.resolve({ id: "design-0", revision: "1" });
    },
  }),
}));

vi.mock("@/lib/server/rate-limit/rate-limit-store-instance", () => ({
  getRateLimitStore: () => world.rateLimitStore,
}));

const { POST } = await import("../../../../src/app/api/designs/route");

/** Every one of the six differs from the fixture's, the depth included. */
const EVERY_SETTING_DIFFERING: NewKitchenSettings = {
  materialTierId: "material.painted-mdf",
  hardwareTierId: "hardware.premium",
  cabinetDepthMm: 700,
  finish: freeColourFinish("#336699"),
  handle: "black",
  topRowHandle: "steel",
};

function mintRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://lemnaria.test/api/designs", {
    method: "POST",
    headers: { "sec-fetch-site": "same-origin", ...headers },
  });
}

function limiterAnswering(count: number) {
  return {
    recordHits: () => {
      world.calls.push("record-hits");
      return Promise.resolve([count]);
    },
    ...UNUSED_STORE_READS,
  };
}

function theMintedDesign(): Design {
  const [design] = world.minted;
  if (design === undefined) throw new Error("nothing was minted");
  return design;
}

beforeEach(() => {
  world.calls.length = 0;
  world.minted.length = 0;
  world.rateLimitStore = limiterAnswering(1);
  world.readNewKitchenDefaults.mockReset();
  world.readNewKitchenDefaults.mockImplementation(() => {
    world.calls.push("read-defaults");
    return Promise.resolve(EVERY_SETTING_DIFFERING);
  });
  vi.stubEnv("DIGEST_SECRET", FAKE_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("the seeded mint is stamped with the new-kitchen defaults", () => {
  it("writes the five settings the defaults name over the fixture, at the fixture's depth", async () => {
    const response = await POST(mintRequest());

    expect(response.status).toBe(201);
    expect(theMintedDesign().settings).toEqual({
      cabinetDepthMm: 600,
      materialTierId: "material.painted-mdf",
      hardwareTierId: "hardware.premium",
      finish: freeColourFinish("#336699"),
      handle: "black",
      topRowHandle: "steel",
    });
  });

  it("keeps the fixture's depth even when the saved depth is 700, and rebuilds no body for it", async () => {
    await POST(mintRequest());

    const minted = theMintedDesign();
    expect(cabinetDepthMmOf(minted)).toBe(cabinetDepthMmOf(KITCHEN_L_DESIGN));
    expect(minted.placements).toEqual(KITCHEN_L_DESIGN.placements);
    expect(minted.room).toEqual(KITCHEN_L_DESIGN.room);
  });

  it("moves no timestamp and keeps the fixture's provenance", async () => {
    await POST(mintRequest());

    const minted = theMintedDesign();
    expect(minted.createdAt).toBe(KITCHEN_L_DESIGN.createdAt);
    expect(minted.updatedAt).toBe(KITCHEN_L_DESIGN.updatedAt);
    expect(minted.presetId).toBe(KITCHEN_L_DESIGN.presetId);
  });

  it("stamps the four settings it is given when the defaults hold no tier (no active book)", async () => {
    world.readNewKitchenDefaults.mockResolvedValue({
      cabinetDepthMm: 600,
      finish: paletteFinish("pal.alb"),
      handle: "steel",
      topRowHandle: "push",
    });

    await POST(mintRequest());

    expect(theMintedDesign().settings).toEqual({
      cabinetDepthMm: 600,
      finish: paletteFinish("pal.alb"),
      handle: "steel",
      topRowHandle: "push",
    });
  });

  it("with the fixed fallbacks stamps what the seeded-mint fixture of the tests writes out", async () => {
    world.readNewKitchenDefaults.mockResolvedValue({
      materialTierId: "material.melamine",
      hardwareTierId: "hardware.standard",
      cabinetDepthMm: 600,
      finish: paletteFinish("pal.alb"),
      handle: "steel",
      topRowHandle: "push",
    });

    await POST(mintRequest());

    expect(theMintedDesign()).toEqual(SEEDED_MINT_DESIGN);
  });

  it("reads the defaults once, after the limiter and before the row is written", async () => {
    await POST(mintRequest());

    expect(world.calls).toEqual(["record-hits", "read-defaults", "mint"]);
  });

  it("ignores a request body: a hostile document in it changes nothing of what is stamped", async () => {
    const hostile = new NextRequest("https://lemnaria.test/api/designs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "sec-fetch-site": "same-origin",
      },
      body: JSON.stringify({
        settings: { handle: "black", materialTierId: "attacker" },
      }),
    });

    await POST(hostile);

    expect(theMintedDesign().settings?.materialTierId).toBe(
      "material.painted-mdf",
    );
  });
});

describe("a mint that is refused reads no defaults", () => {
  it("reads nothing for a request the cross-site guard refuses", async () => {
    const response = await POST(
      mintRequest({ "sec-fetch-site": "cross-site" }),
    );

    expect(response.status).toBe(403);
    expect(world.readNewKitchenDefaults).not.toHaveBeenCalled();
    expect(world.minted).toEqual([]);
  });

  it("reads nothing for a mint the limiter refuses", async () => {
    world.rateLimitStore = limiterAnswering(21);

    const response = await POST(mintRequest());

    expect(response.status).toBe(429);
    expect(world.readNewKitchenDefaults).not.toHaveBeenCalled();
    expect(world.minted).toEqual([]);
  });

  it("reads nothing when the limiter cannot answer", async () => {
    world.rateLimitStore = {
      recordHits: () => Promise.reject(new Error("the limiter is down")),
      ...UNUSED_STORE_READS,
    };
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const response = await POST(mintRequest());

    expect(response.status).toBe(503);
    expect(world.readNewKitchenDefaults).not.toHaveBeenCalled();
    expect(world.minted).toEqual([]);
  });
});
