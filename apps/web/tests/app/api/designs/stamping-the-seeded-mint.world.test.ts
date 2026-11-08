import fc from "fast-check";
import {
  canonicalSerializeDesign,
  declaredCabinetDepthsMm,
  freeColourFinish,
  HandleSchema,
  KITCHEN_L_DESIGN,
  MATERIALS,
  paletteEntriesOf,
  paletteFinish,
  type Design,
  type Finish,
  type NewKitchenSettings,
} from "@lemnaria/configurator-domain";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { completedDefaultsOf } from "@/lib/server/price-dashboard/new-kitchen-defaults";

import { freshAccountWorld } from "../../../support/account-world";
import {
  administrator,
  saveDefaults,
} from "../../../support/availability-route-world";
import {
  ANCHORED_BOOK,
  freshPriceDashboardWorld,
} from "../../../support/price-dashboard-world";
import { SEEDED_MINT_DESIGN } from "../../../support/seeded-mint-design";
import { freshStaffWorld } from "../../../support/staff-world";
import { UNUSED_STORE_READS } from "../../../support/unused-store-reads";

/**
 * U6-a at the route (M10 R4b3, criteria (b) and U6-a): a defaults save reaches the next seeded mint and no row that was
 * already written. The customer read is the real one, over the persistence package's fakes.
 */
const FAKE_SECRET =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

const minted = vi.hoisted(() => ({
  designs: [] as Design[],
  /** The rows by id, with the visitor each was minted for, so the owner's read can find them. */
  rows: new Map<string, { design: Design; visitorHash: string | undefined }>(),
}));

vi.mock("@/lib/server/account/session-store-instance", () =>
  import("../../../support/account-world").then((world) =>
    world.sessionStoreModule(),
  ),
);
vi.mock("@/lib/server/staff/staff-audit-store-instance", () =>
  import("../../../support/staff-world").then((world) =>
    world.staffAuditStoreModule(),
  ),
);
vi.mock("@/lib/server/price-stores", () =>
  import("../../../support/price-dashboard-world").then((world) =>
    world.priceStoresModule(),
  ),
);
vi.mock("@/lib/server/repository", () => ({
  getRepository: () => ({
    mint: (request: {
      design: Design;
      visitor: { visitorHash: string | undefined };
    }) => {
      minted.designs.push(request.design);
      const id = `design-${String(minted.designs.length)}`;
      minted.rows.set(id, {
        design: request.design,
        visitorHash: request.visitor.visitorHash,
      });
      return Promise.resolve({ id, revision: "1" });
    },
    loadOwned: ({
      id,
      accessor,
    }: {
      id: string;
      accessor: { visitorHash?: string };
    }) => {
      const row = minted.rows.get(id);
      if (row === undefined || row.visitorHash !== accessor.visitorHash) {
        return Promise.resolve({ kind: "none" });
      }
      return Promise.resolve({
        kind: "found",
        design: row.design,
        revision: "1",
      });
    },
  }),
}));
vi.mock("@/lib/server/rate-limit/rate-limit-store-instance", () => ({
  getRateLimitStore: () => ({
    recordHits: () => Promise.resolve([1]),
    ...UNUSED_STORE_READS,
  }),
}));

const { POST } = await import("../../../../src/app/api/designs/route");
const { GET } = await import("../../../../src/app/api/designs/[id]/route");

const FINISHES: readonly Finish[] = [
  ...MATERIALS.flatMap((material) => paletteEntriesOf(material)).map(
    ({ entryId }) => paletteFinish(entryId),
  ),
  freeColourFinish("#eceeeb"),
  freeColourFinish("#112233"),
];

/** Every partial row over the book's stated tiers: each of the six keys present or absent, so `{}` is one of them. */
const SAVED_ROWS = fc.record(
  {
    materialTierId: fc.constantFrom(
      "material.melamine",
      "material.painted-mdf",
      "material.veneer",
    ),
    hardwareTierId: fc.constantFrom(
      "hardware.standard",
      "hardware.soft-close",
      "hardware.premium",
    ),
    cabinetDepthMm: fc.constantFrom(...declaredCabinetDepthsMm()),
    finish: fc.constantFrom(...FINISHES),
    handle: fc.constantFrom(...HandleSchema.options),
    topRowHandle: fc.constantFrom(...HandleSchema.options),
  },
  { requiredKeys: [] },
);

const SIX_KEYS = [
  "materialTierId",
  "hardwareTierId",
  "cabinetDepthMm",
  "finish",
  "handle",
  "topRowHandle",
] as const;

function mintRequest(): NextRequest {
  return new NextRequest("https://lemnaria.test/api/designs", {
    method: "POST",
    headers: { "sec-fetch-site": "same-origin" },
  });
}

async function mintOne(): Promise<Design> {
  const before = minted.designs.length;
  const response = await POST(mintRequest());
  expect(response.status).toBe(201);
  const design = minted.designs[before];
  if (design === undefined) throw new Error("nothing was minted");
  return design;
}

beforeEach(async () => {
  minted.designs.length = 0;
  minted.rows.clear();
  freshAccountWorld();
  freshStaffWorld();
  await freshPriceDashboardWorld();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.stubEnv("DIGEST_SECRET", FAKE_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("with nothing saved, the seeded mint is the fixture and the fixed fallbacks as explicit keys", () => {
  it("equals the fixture stamped with the fallbacks, and differs from the fixture by those keys alone", async () => {
    const design = await mintOne();

    expect(design).toEqual(SEEDED_MINT_DESIGN);
    expect({ ...design, settings: KITCHEN_L_DESIGN.settings }).toEqual(
      KITCHEN_L_DESIGN,
    );
  });
});

describe("criterion (b): the seeded mint carries all six settings over saved rows from {} to whole", () => {
  it("carries every key, takes each saved one that is on offer, and stays at the fixture's depth", async () => {
    const staff = await administrator();

    await fc.assert(
      fc.asyncProperty(SAVED_ROWS, async (saved: NewKitchenSettings) => {
        await saveDefaults(staff, saved);

        const { settings } = await mintOne();

        for (const key of SIX_KEYS) expect(settings?.[key]).toBeDefined();
        expect(settings).toEqual({
          ...completedDefaultsOf(saved, ANCHORED_BOOK),
          cabinetDepthMm: KITCHEN_L_DESIGN.settings?.cabinetDepthMm,
        });
      }),
      { numRuns: 25 },
    );
  });
});

describe("U6-a at the route: a save reaches the next new kitchen and no kitchen already written", () => {
  it("leaves a kitchen minted before the save byte-identical after it, and stamps the next with the saved six", async () => {
    const staff = await administrator();
    const earlier = await mintOne();
    const earlierBytes = canonicalSerializeDesign(earlier);

    await saveDefaults(staff, {
      materialTierId: "material.painted-mdf",
      hardwareTierId: "hardware.premium",
      cabinetDepthMm: 700,
      finish: freeColourFinish("#336699"),
      handle: "black",
      topRowHandle: "steel",
    });
    const later = await mintOne();

    expect(canonicalSerializeDesign(earlier)).toBe(earlierBytes);
    expect(later.settings).toEqual({
      cabinetDepthMm: 600,
      materialTierId: "material.painted-mdf",
      hardwareTierId: "hardware.premium",
      finish: freeColourFinish("#336699"),
      handle: "black",
      topRowHandle: "steel",
    });
  });
});

describe("RK-7: a kitchen written before a save reads back byte-identical after it", () => {
  /** The cookies a mint set, as the browser sends them back. */
  function cookiesOf(response: Response): string {
    return response.headers
      .getSetCookie()
      .map((line) => line.split(";")[0] ?? "")
      .join("; ");
  }

  async function readBytes(id: string, cookie: string): Promise<string> {
    const response = await GET(
      new NextRequest(`https://lemnaria.test/api/designs/${id}`, {
        headers: { cookie },
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(response.status).toBe(200);
    return await response.text();
  }

  it("serves a legacy unstamped kitchen as it was, whatever the defaults now are", async () => {
    const staff = await administrator();
    const response = await POST(mintRequest());
    const { id } = (await response.json()) as { id: string };
    const row = minted.rows.get(id);
    if (row === undefined) throw new Error("the mint wrote no row");
    minted.rows.set(id, { ...row, design: KITCHEN_L_DESIGN });
    const cookie = cookiesOf(response);
    const before = await readBytes(id, cookie);

    await saveDefaults(staff, {
      materialTierId: "material.painted-mdf",
      hardwareTierId: "hardware.premium",
      cabinetDepthMm: 700,
      finish: freeColourFinish("#336699"),
      handle: "black",
      topRowHandle: "steel",
    });
    const after = await readBytes(id, cookie);

    expect(JSON.parse(before)).toMatchObject({ design: KITCHEN_L_DESIGN });
    expect(after).toBe(before);
  });
});
