// M10 Q3a, FINDING Q3a-F1 reachability. The save route checks the shape of a tier id and not that any book holds it, and
// the design write seam reports no unoffered colour for a material no declaration names (ADR 0078), so a kitchen naming a
// material nothing declares AND wearing a palette colour reaches storage. This holds that fact through the real routes;
// `qa-m10-q3a-vanished-tier-notice.adversarial.test.ts` holds what the notice route then answers for it.
import {
  DesignNotFoundError,
  KITCHEN_L_DESIGN,
  paletteFinish,
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
  MintDesign,
  SaveOutcome,
  StoredDesign,
} from "@lemnaria/persistence";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const FIRST_REVISION = "1";

class FakeAuthorizedRepository implements AuthorizedConfigurationRepository {
  private readonly rows = new Map<
    DesignId,
    { design: Design; writeTokenHash: string | null; revision: string }
  >();
  private nextId = 0;

  mint({ design, writeTokenHash }: MintDesign): Promise<DesignVersion> {
    const id = `design-${String(this.nextId++)}`;
    this.rows.set(id, { design, writeTokenHash, revision: FIRST_REVISION });
    return Promise.resolve({ id, revision: FIRST_REVISION });
  }

  saveAuthorized({
    id,
    design,
    credential,
    expectedRevision,
  }: AuthorizedSave): Promise<SaveOutcome> {
    const row = this.rows.get(id);
    if (
      !row ||
      credential.kind !== "write-token" ||
      row.writeTokenHash !== credential.hash
    ) {
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
  const response = await POST(
    new NextRequest("https://example.test/api/designs", {
      method: "POST",
      headers: { "sec-fetch-site": "same-origin" },
    }),
  );
  const { id } = (await response.json()) as { id: string };
  const setCookie = response.headers.get("set-cookie") ?? "";
  return { id, cookie: setCookie.split(";")[0] ?? "" };
}

function save(id: string, cookie: string, design: Design): Promise<Response> {
  return PUT(
    new NextRequest(`https://example.test/api/designs/${id}`, {
      method: "PUT",
      headers: {
        cookie,
        "content-type": "application/json",
        "x-expected-revision": FIRST_REVISION,
      },
      body: JSON.stringify(design),
    }),
    { params: Promise.resolve({ id }) },
  );
}

function wearing(settings: NonNullable<Design["settings"]>): Design {
  return {
    ...KITCHEN_L_DESIGN,
    settings: { ...KITCHEN_L_DESIGN.settings, ...settings },
  };
}

describe("PUT /api/designs/[id] stores a kitchen naming a tier no book holds", () => {
  it.each<[string, NonNullable<Design["settings"]>]>([
    ["a material", { materialTierId: "material.ghost" }],
    ["a hardware class", { hardwareTierId: "hardware.ghost" }],
    [
      "a material that nothing declares, wearing a palette colour",
      {
        materialTierId: "material.ghost",
        finish: paletteFinish("pal.antracit"),
      },
    ],
  ])("accepts %s and keeps it as written", async (_name, settings) => {
    const { id, cookie } = await mintDesign();
    const design = wearing(settings);

    const response = await save(id, cookie, design);

    expect(response.status).toBe(200);
    expect(fakeRepository.storedDesign(id)?.settings).toMatchObject(settings);
  });
});
