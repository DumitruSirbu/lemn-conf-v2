// Adversarial QA for wave 6J-d at the network seam.
//
// `cabinet-depth-write-seam.test.ts` proves the thing the wave exists for — a 700 mm kitchen returns
// 200 — on **one** document: the shipped fixture, current schema, every extent sourced, no space on
// either wall. That is the document decisions 1–3 make easiest.
//
// The population the ladder was written for is the other one: a session before wave 6K-c, whose
// extents record no source and which therefore reaches rungs 3 and 4 rather than rung 2. And every
// stored row arrives at the seam through `migrateDesign`, at whatever version it was written under,
// so the version arms are between the customer's row and the command that moves it.
//
// So: every supported schema version, crossed with a document carrying member-less spaces on **both**
// walls with their sources stripped, through the same `PUT` the route runs `refuseUnexecutableDesign`
// on. If any arm of the ladder produces an overlap on a legacy row, the status is 400 and it is
// visible here rather than in a customer's session.
import {
  buildKitchenLBodyCatalog,
  CURRENT_SCHEMA_VERSION,
  DesignNotFoundError,
  KITCHEN_L_DESIGN,
  migrateDesign,
  setCabinetDepth,
} from "@lemnaria/configurator-domain";
import type {
  Design,
  DesignId,
  EmptyColumn,
} from "@lemnaria/configurator-domain";
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

import { createConfiguratorStore } from "@/store/configurator-store";

import { createFakeProbeFactory } from "../../../support/fake-body-probe";

const FIRST_REVISION = "1";
const EXPECTED_REVISION_HEADER = "x-expected-revision";
const OCCURRED_AT = "2026-09-06T14:00:00.000Z";
const DEEPER_MM = 700;

/** Every version a stored row may still claim. */
const SUPPORTED_SCHEMA_VERSIONS = Array.from(
  { length: CURRENT_SCHEMA_VERSION },
  (_unused, index) => index + 1,
);

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
    writeTokenHash,
    expectedRevision,
  }: AuthorizedSave): Promise<SaveOutcome> {
    const row = this.rows.get(id);
    if (!row || row.writeTokenHash !== writeTokenHash) {
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

async function save(design: Design): Promise<Response> {
  const { id, cookie } = await mintDesign();
  return PUT(
    new NextRequest(`https://example.test/api/designs/${id}`, {
      method: "PUT",
      headers: {
        cookie,
        "content-type": "application/json",
        [EXPECTED_REVISION_HEADER]: FIRST_REVISION,
      },
      body: JSON.stringify(design),
    }),
    { params: Promise.resolve({ id }) },
  );
}

function changeTo(design: Design, cabinetDepthMm: number): Design {
  const result = setCabinetDepth({
    design,
    catalogAt: buildKitchenLBodyCatalog,
    cabinetDepthMm,
    probeAt: createFakeProbeFactory(),
    occurredAt: OCCURRED_AT,
  });
  if (!result.ok) throw new Error(`refused: ${result.reason.code}`);
  return result.design;
}

/** The shipped kitchen with a column cleared on **each** wall, reached through the delete command so
 *  the recorded map is the one the product writes rather than one this file invented. */
function withASpaceOnBothWalls(): Design {
  const store = createConfiguratorStore({
    design: KITCHEN_L_DESIGN,
    catalogAt: buildKitchenLBodyCatalog,
    probeAt: createFakeProbeFactory(),
    now: () => OCCURRED_AT,
  });
  for (const id of ["p8", "p15", "p6", "p23"]) {
    store.getState().select({ kind: "placement", id });
    store.getState().remove();
    expect(store.getState().lastRejection, `remove ${id}`).toBeNull();
  }
  return store.getState().design;
}

/** The same document as a session before wave 6K-c wrote it: no extent records the body its depth
 *  came from, so every wall-B entry reaches rung 3 or rung 4 rather than rung 2's exact answer. */
function withoutRecordedSources(design: Design): Design {
  const strip = (entry: EmptyColumn): EmptyColumn => {
    const stripped = { ...entry };
    delete stripped.depthFromBuildId;
    return stripped;
  };
  return {
    ...design,
    emptyColumns: (design.emptyColumns ?? []).map(strip),
    columnExtents: (design.columnExtents ?? []).map(strip),
  };
}

/** What a stored row is: JSON, then the version arms, then the document. */
function loadedAtVersion(design: Design, schemaVersion: number): Design {
  return migrateDesign(
    schemaVersion,
    JSON.parse(JSON.stringify(design)) as unknown,
  );
}

describe("a 700 mm kitchen from a stored row, at every supported schema version", () => {
  it.each(SUPPORTED_SCHEMA_VERSIONS)(
    "saves a sourced document written under version %i",
    async (schemaVersion) => {
      const loaded = loadedAtVersion(withASpaceOnBothWalls(), schemaVersion);

      const response = await save(changeTo(loaded, DEEPER_MM));

      expect(response.status).toBe(200);
    },
  );

  // **The population the ladder exists for.** With no recorded source, a wall-B space cannot take
  // rung 3 and lands on rung 4's declared default — the arm ADR 0090's amendment overturned decision
  // 4a to reach. Under 4a this is the document that produced nine and ten refusals.
  it.each(SUPPORTED_SCHEMA_VERSIONS)(
    "saves a sourceless document written under version %i",
    async (schemaVersion) => {
      const loaded = loadedAtVersion(
        withoutRecordedSources(withASpaceOnBothWalls()),
        schemaVersion,
      );

      const response = await save(changeTo(loaded, DEEPER_MM));

      expect(response.status).toBe(200);
    },
  );

  // Not vacuous: the documents above really do carry a member-less space on each wall, so the two
  // sweeps are not passing on a kitchen with nothing to move.
  it("carries a member-less space on each wall to begin with", () => {
    const walls = new Set(
      (withASpaceOnBothWalls().emptyColumns ?? []).map((entry) => entry.wall),
    );

    expect(walls).toStrictEqual(new Set(["A", "B"]));
  });

  // And the seam still refuses what it is there to refuse, so a 200 above is the validator passing
  // rather than the validator being absent from this path.
  it("still refuses a document whose recorded space stands on a body", async () => {
    const held = withASpaceOnBothWalls();
    const overlapping: Design = {
      ...held,
      emptyColumns: (held.emptyColumns ?? []).map((entry) =>
        entry.wall === "B" ? { ...entry, alongMm: 1200 } : entry,
      ),
    };

    expect((await save(overlapping)).status).toBe(400);
  });
});
