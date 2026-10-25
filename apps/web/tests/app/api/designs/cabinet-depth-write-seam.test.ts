// Wave 6J-d at the network seam — **a customer can save a 700 mm kitchen** (ADR 0090).
//
// This is the failure the whole wave exists for, stated where it actually bit. `setCabinetDepth`
// moved wall B's placements and carried `emptyColumns`/`columnExtents` across verbatim, so four
// standing runs were recorded as free space at the coordinates their cabinets occupy.
// `validateDesignForCatalog` answered five `EMPTY_COLUMN_OVERLAPS_PLACEMENT`, which
// `validate-design.ts` declares a **refusal**, and this route's `refuseUnexecutableDesign` runs that
// exact validator before anything is stored. The `PUT` returned 400.
//
// Built on `column-extents.test.ts`'s harness, which is this directory's established way of driving
// the route without a database: the same fake repository, the same mint-then-save pair, and the same
// control-beside-fault shape — the 600 mm document goes through the same seam, so a refusal here
// could not be coming from something else in the seeded design.
import {
  DesignNotFoundError,
  KITCHEN_L_DESIGN,
  buildKitchenLBodyCatalog,
  canonicalSerializeDesign,
  setCabinetDepth,
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
  SaveOutcome,
  MintDesign,
  StoredDesign,
} from "@lemnaria/persistence";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeProbeFactory } from "../../../support/fake-body-probe";

const FIRST_REVISION = "1";
const EXPECTED_REVISION_HEADER = "x-expected-revision";
const OCCURRED_AT = "2026-09-06T12:00:00.000Z";
const DEEPER_MM = 700;
const DEFAULT_MM = 600;

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

function mintRequest(): NextRequest {
  return new NextRequest("https://example.test/api/designs", {
    method: "POST",
    headers: { "sec-fetch-site": "same-origin" },
  });
}

async function mintDesign(): Promise<{ id: string; cookie: string }> {
  const response = await POST(mintRequest());
  const { id } = (await response.json()) as { id: string };
  const setCookie = response.headers.get("set-cookie") ?? "";
  return { id, cookie: setCookie.split(";")[0] ?? "" };
}

function saveRequest(
  id: string,
  { design, cookie }: { design: Design; cookie: string },
): NextRequest {
  return new NextRequest(`https://example.test/api/designs/${id}`, {
    method: "PUT",
    headers: {
      cookie,
      "content-type": "application/json",
      [EXPECTED_REVISION_HEADER]: FIRST_REVISION,
    },
    body: JSON.stringify(design),
  });
}

function routeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

/** The seeded kitchen at a setting, exactly as the product produces it: through the domain command,
 *  including the frozen map it now writes onto its own result (ADR 0090 decision 1). A hand-built
 *  document would be this test writing the answer it is checking. */
function seededKitchenAt(cabinetDepthMm: number): Design {
  const result = setCabinetDepth({
    design: KITCHEN_L_DESIGN,
    catalogAt: buildKitchenLBodyCatalog,
    cabinetDepthMm,
    probeAt: createFakeProbeFactory(),
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
  return result.design;
}

describe("PUT /api/designs/[id] — a kitchen at either declared depth", () => {
  it.each([DEFAULT_MM, DEEPER_MM])(
    "stores the kitchen at %i mm",
    async (cabinetDepthMm) => {
      const { id, cookie } = await mintDesign();
      const design = seededKitchenAt(cabinetDepthMm);

      const response = await PUT(
        saveRequest(id, { design, cookie }),
        routeParams(id),
      );

      expect(response.status).toBe(200);
      const stored = fakeRepository.storedDesign(id);
      if (!stored) throw new Error("nothing was stored");
      expect(canonicalSerializeDesign(stored)).toBe(
        canonicalSerializeDesign(design),
      );
    },
  );

  // The frozen map is what the 700 mm save used to fail on, so the assertion is on the map rather
  // than only on the status: the stored document carries wall-B spaces at the coordinates the run
  // arrived at, and the deeper kitchen's `emptyColumns` are not the shallow one's.
  it("stores the deeper kitchen's own frozen map, not the shallower one's", async () => {
    const { id, cookie } = await mintDesign();
    const deep = seededKitchenAt(DEEPER_MM);

    await PUT(saveRequest(id, { design: deep, cookie }), routeParams(id));

    const stored = fakeRepository.storedDesign(id);
    const wallB = (stored?.columnExtents ?? [])
      .filter((entry) => entry.wall === "B")
      .map((entry) => entry.alongMm)
      .sort((left, right) => left - right);

    // 840 → 835 (ADR 0135): the base return is centred 5 mm nearer the corner at 700 mm.
    expect(wallB).toStrictEqual([685, 835, 1300, 1900, 2550]);
  });
});
