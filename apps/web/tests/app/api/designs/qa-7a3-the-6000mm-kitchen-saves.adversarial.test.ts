// Adversarial QA for M7 wave 7A3 slice S2 — the customer the wave exists for, through the real route.
//
// ADR 0124's finding was a customer who clears Step 1 and whose design the mint then refuses. The
// domain's criterion 3 closes that at the room; this closes it at `PUT /api/designs/[id]`, where the
// generated kitchen meets the request cap SEC-002 counts off the stream, the whole-document schema
// and the executable validator in one handler. Every room here comes out of `validateRoomInput`
// under the approved policy, never out of a literal, so a room the policy stops accepting fails as a
// premise rather than passing as a save.
//
// The cap is then walked to its edge with the same document: padded with JSON whitespace to exactly
// `MAX_DESIGN_BYTES` it saves, and one byte past it is refused as too large before anything parses
// it. The number is the one the domain build exports; its value is pinned in the domain's `qa-5h`.
import {
  APPROVED_ROOM_POLICY,
  canonicalSerializeDesign,
  DesignNotFoundError,
  generateKitchen,
  MAX_DESIGN_BYTES,
  validateRoomInput,
  type Design,
  type DesignId,
  type DesignRoom,
} from "@lemnaria/configurator-domain";
import {
  DesignWriteConflictError,
  DesignWriteForbiddenError,
  type AuthorizedConfigurationRepository,
  type AuthorizedSave,
  type DesignVersion,
  type SaveOutcome,
  type MintDesign,
  type StoredDesign,
} from "@lemnaria/persistence";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeProbeFactory } from "../../../support/fake-body-probe";

const FIRST_REVISION = "1";
const OCCURRED_AT = "2026-09-17T12:00:00.000Z";

class InMemoryAuthorizedRepository
  implements AuthorizedConfigurationRepository
{
  private readonly rows = new Map<
    DesignId,
    { design: Design; writeTokenHash: string; revision: string }
  >();
  private nextId = 1;

  mint({ design, writeTokenHash }: MintDesign): Promise<DesignVersion> {
    const id = `seven-a-three-${String(this.nextId++)}`;
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
}

const repository = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("@/lib/server/repository", () => ({
  getRepository: () => repository.current,
}));

const { POST } = await import("../../../../src/app/api/designs/route");
const { GET, PUT } = await import("../../../../src/app/api/designs/[id]/route");

beforeEach(() => {
  repository.current = new InMemoryAuthorizedRepository();
});

/** The approved corner at both ceilings, wall A's minimum against wall B's new maximum, and the first
 *  millimetre of the admitted wall B band. Typed as the customer types them. */
const TYPED_ROOMS = [
  { wallAMm: 6000, wallBMm: 6000, heightMm: 3900 },
  { wallAMm: 6000, wallBMm: 6000, heightMm: 2200 },
  { wallAMm: 900, wallBMm: 6000, heightMm: 2600 },
  { wallAMm: 6000, wallBMm: 5101, heightMm: 2600 },
] as const;

describe("a kitchen generated for a room the 6000 mm policy accepts, saved through the route (M7 7A3)", () => {
  it.each(TYPED_ROOMS)(
    "saves and reloads byte-identically at $wallAMm x $wallBMm x $heightMm",
    async (typed) => {
      const design = generatedDesignFor(acceptedRoom(typed));
      const { id, cookie } = await mintDesign();

      const saved = await PUT(
        saveRequest(id, cookie, canonicalSerializeDesign(design)),
        routeParams(id),
      );
      const loaded = await GET(
        new NextRequest(`https://lemnaria.test/api/designs/${id}`),
        routeParams(id),
      );
      const body = (await loaded.json()) as { design: Design };

      expect(saved.status).toBe(200);
      expect(canonicalSerializeDesign(body.design)).toBe(
        canonicalSerializeDesign(design),
      );
    },
  );
});

describe("the SEC-002 cap at its edge, with the largest approved kitchen as the document", () => {
  it("saves the document padded to exactly MAX_DESIGN_BYTES", async () => {
    const { id, cookie } = await mintDesign();

    const response = await PUT(
      saveRequest(
        id,
        cookie,
        paddedTo(largestApprovedKitchen(), MAX_DESIGN_BYTES),
      ),
      routeParams(id),
    );

    expect(response.status).toBe(200);
  });

  it("refuses the same document one byte past MAX_DESIGN_BYTES as too large", async () => {
    const { id, cookie } = await mintDesign();

    const response = await PUT(
      saveRequest(
        id,
        cookie,
        paddedTo(largestApprovedKitchen(), MAX_DESIGN_BYTES + 1),
      ),
      routeParams(id),
    );

    expect(response.status).toBe(413);
  });
});

function largestApprovedKitchen(): Design {
  return generatedDesignFor(acceptedRoom(TYPED_ROOMS[0]));
}

function acceptedRoom(typed: (typeof TYPED_ROOMS)[number]): DesignRoom {
  const result = validateRoomInput(
    { shape: "L", cornerDirection: "left", ...typed },
    APPROVED_ROOM_POLICY,
  );
  if (!result.ok) {
    throw new Error(
      `the approved policy refused ${JSON.stringify(typed)}: ${JSON.stringify(result.issues)}`,
    );
  }
  return result.room;
}

function generatedDesignFor(room: DesignRoom): Design {
  const result = generateKitchen({
    room,
    occurredAt: OCCURRED_AT,
    probeAt: createFakeProbeFactory(),
  });
  if (!result.ok) {
    throw new Error(
      `no kitchen generated for ${JSON.stringify(room)}: ${result.reason.code}`,
    );
  }
  return result.design;
}

/** The design's JSON followed by spaces, which `JSON.parse` ignores, to exactly `totalBytes`. */
function paddedTo(design: Design, totalBytes: number): string {
  const serialised = canonicalSerializeDesign(design);
  const padding = totalBytes - Buffer.byteLength(serialised, "utf8");
  if (padding < 0) {
    throw new Error(`the document is already ${String(-padding)} bytes past`);
  }
  return serialised + " ".repeat(padding);
}

function mintRequest(): NextRequest {
  return new NextRequest("https://lemnaria.test/api/designs", {
    method: "POST",
    headers: { "sec-fetch-site": "same-origin" },
  });
}

async function mintDesign(): Promise<{ id: DesignId; cookie: string }> {
  const response = await POST(mintRequest());
  const { id } = (await response.json()) as { id: DesignId };
  const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  return { id, cookie };
}

function saveRequest(id: DesignId, cookie: string, body: string): NextRequest {
  return new NextRequest(`https://lemnaria.test/api/designs/${id}`, {
    method: "PUT",
    headers: {
      cookie,
      "content-type": "application/json",
      "x-expected-revision": FIRST_REVISION,
    },
    body,
  });
}

function routeParams(id: DesignId): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}
