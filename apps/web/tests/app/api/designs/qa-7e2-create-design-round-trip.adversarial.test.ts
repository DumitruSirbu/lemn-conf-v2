import {
  CURRENT_SCHEMA_VERSION,
  DesignNotFoundError,
  KITCHEN_L_DESIGN,
  canonicalSerializeDesign,
  migrateDesign,
  type Design,
  type DesignId,
} from "@lemnaria/configurator-domain";
import {
  DesignWriteConflictError,
  DesignWriteForbiddenError,
  type AuthorizedConfigurationRepository,
  type AuthorizedSave,
  type MintOutcome,
  type SaveOutcome,
  type MintDesign,
  type StoredDesign,
} from "@lemnaria/persistence";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { storedVisitorHashFor } from "../../../support/mint-visitor-hash";
import {
  loadOwnedByIdAlone,
  ownerVisitorCookiePair,
} from "../../../support/owned-design-lookup";

const FIRST_REVISION = "1";

class InMemoryAuthorizedRepository
  implements AuthorizedConfigurationRepository
{
  private readonly rows = new Map<
    DesignId,
    { design: Design; writeTokenHash: string; revision: string }
  >();
  private nextId = 1;

  mint({ design, writeTokenHash, visitor }: MintDesign): Promise<MintOutcome> {
    const id = `step-one-${String(this.nextId++)}`;
    this.rows.set(id, { design, writeTokenHash, revision: FIRST_REVISION });
    return Promise.resolve({
      id,
      revision: FIRST_REVISION,
      visitorHash: storedVisitorHashFor(visitor),
    });
  }

  saveAuthorized({
    id,
    design,
    writeTokenHash,
    expectedRevision,
  }: AuthorizedSave): Promise<SaveOutcome> {
    const row = this.rows.get(id);
    if (row === undefined || row.writeTokenHash !== writeTokenHash) {
      return Promise.reject(new DesignWriteForbiddenError(id));
    }
    if (row.revision !== expectedRevision) {
      return Promise.reject(new DesignWriteConflictError(id));
    }
    const revision = String(Number(row.revision) + 1);
    this.rows.set(id, { ...row, design, revision });
    return Promise.resolve({ id, revision, ownsVisitor: false });
  }

  load(id: DesignId): Promise<StoredDesign> {
    const row = this.rows.get(id);
    return row === undefined
      ? Promise.reject(new DesignNotFoundError(id))
      : Promise.resolve({ design: row.design, revision: row.revision });
  }

  // This file is about the save/load round trip's byte fidelity, never visitor identity, so
  // `loadOwned` is `load` by id alone — see `loadOwnedByIdAlone`.
  loadOwned({ id }: { id: DesignId; visitorHash: string }) {
    return loadOwnedByIdAlone((designId) => this.load(designId), id);
  }

  designAt(id: DesignId): Design | undefined {
    return this.rows.get(id)?.design;
  }
}

const repository = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("@/lib/server/repository", () => ({
  getRepository: () => repository.current,
}));

const { POST } = await import("../../../../src/app/api/designs/route");
const { GET, PUT } = await import("../../../../src/app/api/designs/[id]/route");

function mintRequest(): NextRequest {
  return new NextRequest("https://example.test/api/designs", {
    method: "POST",
    headers: { "sec-fetch-site": "same-origin" },
  });
}

let fakeRepository: InMemoryAuthorizedRepository;

beforeEach(() => {
  fakeRepository = new InMemoryAuthorizedRepository();
  repository.current = fakeRepository;
});

describe("Step 1 design — real API save/load round trip", () => {
  it.each([
    ["the chosen recipe id", "recipe-customer-choice"],
    ["generated provenance", null],
  ] as const)(
    "preserves 3600 x 2400 and %s exactly",
    async (_name, presetId) => {
      const chosen: Design = {
        ...structuredClone(KITCHEN_L_DESIGN),
        presetId,
        room: {
          shape: "L",
          widthMm: 3600,
          depthMm: 2400,
          heightMm: 2600,
        },
      };
      const mint = await POST(mintRequest());
      const { id, revision } = (await mint.json()) as {
        id: DesignId;
        revision: string;
      };
      const cookie = (mint.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

      expect(fakeRepository.designAt(id)).toEqual(KITCHEN_L_DESIGN);
      const payload = JSON.stringify(chosen);
      expect(Object.keys(JSON.parse(payload) as object)).not.toContain(
        "locale",
      );
      expect(Object.keys(JSON.parse(payload) as object)).not.toContain(
        "revision",
      );
      expect(Object.keys(JSON.parse(payload) as object)).not.toContain("id");

      const saved = await PUT(
        new NextRequest(`https://lemnaria.test/api/designs/${id}`, {
          method: "PUT",
          headers: {
            cookie,
            "content-type": "application/json",
            "x-expected-revision": revision,
          },
          body: payload,
        }),
        routeParams(id),
      );
      expect(saved.status).toBe(200);

      const loaded = await GET(
        new NextRequest(`https://lemnaria.test/api/designs/${id}`, {
          headers: { cookie: ownerVisitorCookiePair() },
        }),
        routeParams(id),
      );
      const body = (await loaded.json()) as { design: Design };

      expect(loaded.status).toBe(200);
      expect(canonicalSerializeDesign(body.design)).toBe(
        canonicalSerializeDesign(chosen),
      );
      expect(body.design).toEqual(chosen);
      expect(body.design.room).toEqual({
        shape: "L",
        widthMm: 3600,
        depthMm: 2400,
        heightMm: 2600,
      });
      expect(body.design.presetId).toBe(presetId);
    },
  );
});

/**
 * The route-level round trip above cannot reach ADR 0069 decision 5b's room correction: it lives in
 * `NeonConfigurationRepository`'s read, keyed on the row's stored schema version, so a fake
 * repository returns the document untouched whatever the correction would have done. These two run
 * the correction directly, and the second is what makes the first load-bearing — it shows the
 * version key is the only thing standing between the customer's room and the rewrite.
 */
describe("a customer's 3600 x 2400 room and the pre-M7 room correction", () => {
  const customerRoom = {
    shape: "L",
    widthMm: 3600,
    depthMm: 2400,
    heightMm: 2600,
  } as const;
  const PRE_ROOM_CONTROL_SCHEMA_VERSION = 2;

  function customerDesign(): Design {
    return {
      ...structuredClone(KITCHEN_L_DESIGN),
      presetId: "recipe-customer-choice",
      room: customerRoom,
    };
  }

  it("survives a reload at the version this build stores", () => {
    const reloaded = migrateDesign(CURRENT_SCHEMA_VERSION, customerDesign());

    expect(reloaded.room).toEqual(customerRoom);
    expect(reloaded.presetId).toBe("recipe-customer-choice");
  });

  it("is rewritten only for a row written before any room control existed", () => {
    const rescued = migrateDesign(
      PRE_ROOM_CONTROL_SCHEMA_VERSION,
      customerDesign(),
    );

    expect(rescued.room).toEqual({
      ...customerRoom,
      widthMm: KITCHEN_L_DESIGN.room.widthMm,
      depthMm: KITCHEN_L_DESIGN.room.depthMm,
    });
  });
});

function routeParams(id: DesignId): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}
