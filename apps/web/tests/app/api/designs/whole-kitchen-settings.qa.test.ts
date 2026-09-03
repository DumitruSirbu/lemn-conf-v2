// Wave 6E adversarial QA — the criterion that names this seam by name: *"the API write seam and
// `migrateDesign` both parse the new field through the same `DesignSchema`"*.
//
// `design-settings.qa.test.ts` in the domain measures the load half. This is the network half, and
// it is worth its own file for the reason `column-extents.test.ts` is: a schema read in isolation
// says what `DesignSchema` accepts, not what a PUT accepts. The two are the same gate only while
// nothing in the route narrows or widens what reaches it.
//
// The harness is `column-extents.test.ts`', reduced to mint, save and read back.
import {
  DesignNotFoundError,
  KITCHEN_L_DESIGN,
  canonicalSerializeDesign,
} from "@lemnaria/configurator-domain";
import type { Design, DesignId } from "@lemnaria/configurator-domain";
import {
  DesignWriteConflictError,
  DesignWriteForbiddenError,
} from "@lemnaria/persistence";
import type {
  AuthorizedConfigurationRepository,
  AuthorizedSave,
  DesignVersion,
  StoredDesign,
} from "@lemnaria/persistence";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const FIRST_REVISION = "1";
const EXPECTED_REVISION_HEADER = "x-expected-revision";
/** `MAX_IDENTIFIER_LENGTH`, restated as the number a hostile payload would carry rather than
 *  imported: this file is about what crosses the wire. */
const ONE_PAST_THE_IDENTIFIER_BOUND = 65;

class FakeAuthorizedRepository implements AuthorizedConfigurationRepository {
  private readonly rows = new Map<
    DesignId,
    { design: Design; writeTokenHash: string | null; revision: string }
  >();
  private nextId = 0;

  mint(design: Design, writeTokenHash: string): Promise<DesignVersion> {
    const id = `design-${String(this.nextId++)}`;
    this.rows.set(id, { design, writeTokenHash, revision: FIRST_REVISION });
    return Promise.resolve({ id, revision: FIRST_REVISION });
  }

  saveAuthorized({
    id,
    design,
    writeTokenHash,
    expectedRevision,
  }: AuthorizedSave): Promise<DesignVersion> {
    const row = this.rows.get(id);
    if (!row || row.writeTokenHash !== writeTokenHash) {
      return Promise.reject(new DesignWriteForbiddenError(id));
    }
    if (row.revision !== expectedRevision) {
      return Promise.reject(new DesignWriteConflictError(id));
    }
    const revision = String(Number(row.revision) + 1);
    this.rows.set(id, { ...row, design, revision });
    return Promise.resolve({ id, revision });
  }

  load(id: DesignId): Promise<StoredDesign> {
    const row = this.rows.get(id);
    return row
      ? Promise.resolve({ design: row.design, revision: row.revision })
      : Promise.reject(new DesignNotFoundError(id));
  }

  storedDesign(id: DesignId): Design | undefined {
    return this.rows.get(id)?.design;
  }
}

const repository = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("@/lib/server/repository", () => ({
  getRepository: () => repository.current,
}));

const { POST } = await import("../../../../src/app/api/designs/route");
const { PUT } = await import("../../../../src/app/api/designs/[id]/route");

let fakeRepository: FakeAuthorizedRepository;

beforeEach(() => {
  fakeRepository = new FakeAuthorizedRepository();
  repository.current = fakeRepository;
});

async function mintDesign(): Promise<{ id: string; cookie: string }> {
  const response = await POST();
  const { id } = (await response.json()) as { id: string };
  const setCookie = response.headers.get("set-cookie") ?? "";
  return { id, cookie: setCookie.split(";")[0] ?? "" };
}

/** Takes the payload as `unknown`, because half of what is attacked here is a document `Design`
 *  cannot describe. */
function saveRequest(
  id: string,
  { payload, cookie }: { payload: unknown; cookie: string },
): NextRequest {
  return new NextRequest(`https://example.test/api/designs/${id}`, {
    method: "PUT",
    headers: {
      cookie,
      "content-type": "application/json",
      [EXPECTED_REVISION_HEADER]: FIRST_REVISION,
    },
    body: JSON.stringify(payload),
  });
}

function routeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function storedSerialization(id: string): string {
  const design = fakeRepository.storedDesign(id);
  if (design === undefined) throw new Error(`No stored design for id "${id}"`);
  return canonicalSerializeDesign(design);
}

function withSettings(settings: unknown): Record<string, unknown> {
  return { ...KITCHEN_L_DESIGN, settings };
}

describe("PUT /api/designs/[id] — wave 6E's settings container at the write seam", () => {
  it("stores a design carrying both tiers, exactly as it was sent", async () => {
    const { id, cookie } = await mintDesign();
    const chosen: Design = {
      ...KITCHEN_L_DESIGN,
      settings: {
        materialTierId: "material.veneer",
        hardwareTierId: "hardware.premium",
      },
    };

    const response = await PUT(
      saveRequest(id, { payload: chosen, cookie }),
      routeParams(id),
    );

    expect(response.status).toBe(200);
    expect(storedSerialization(id)).toBe(canonicalSerializeDesign(chosen));
  });

  it("stores a design carrying one tier without inventing the other", async () => {
    const { id, cookie } = await mintDesign();
    const chosen: Design = {
      ...KITCHEN_L_DESIGN,
      settings: { materialTierId: "material.veneer" },
    };

    const response = await PUT(
      saveRequest(id, { payload: chosen, cookie }),
      routeParams(id),
    );

    expect(response.status).toBe(200);
    const stored = fakeRepository.storedDesign(id);
    expect(stored?.settings).toEqual({ materialTierId: "material.veneer" });
    expect(stored?.settings?.hardwareTierId).toBeUndefined();
  });

  // Absence is the criterion the whole no-version-bump argument rests on: a client that has never
  // heard of this field must go on saving exactly as it did.
  it("stores a design with no settings key and adds none", async () => {
    const { id, cookie } = await mintDesign();
    const unset: Design = { ...KITCHEN_L_DESIGN, presetId: "edited" };

    const response = await PUT(
      saveRequest(id, { payload: unset, cookie }),
      routeParams(id),
    );

    expect(response.status).toBe(200);
    expect("settings" in (fakeRepository.storedDesign(id) ?? {})).toBe(false);
  });

  // Each row is one fault in an otherwise-storable document, and the control above stores the same
  // document with a legal container — so a 400 here can only be the container.
  const REFUSED_CONTAINERS: readonly (readonly [string, unknown])[] = [
    ["an undeclared third setting", { cabinetDepthMm: 600 }],
    [
      "a tier id past the identifier bound",
      { materialTierId: "x".repeat(ONE_PAST_THE_IDENTIFIER_BOUND) },
    ],
    ["an empty tier id", { hardwareTierId: "" }],
    ["a non-string tier id", { materialTierId: 3 }],
    ["a container that is not an object", "material.veneer"],
    ["a container that is an array", []],
  ];

  it.each(REFUSED_CONTAINERS)(
    "refuses %s, and stores nothing",
    async (_fault, settings) => {
      const { id, cookie } = await mintDesign();
      const before = storedSerialization(id);

      const response = await PUT(
        saveRequest(id, { payload: withSettings(settings), cookie }),
        routeParams(id),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toStrictEqual({
        code: "DESIGN_INVALID",
        error: "Design payload failed validation.",
      });
      expect(storedSerialization(id)).toBe(before);
    },
  );
});
